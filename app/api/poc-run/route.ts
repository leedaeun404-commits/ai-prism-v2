import { NextResponse } from "next/server";

type PocRunSample = {
  sampleId: string;
  input: string;
  expectedOutput?: string;
  description?: string;
  tags?: string;
  note?: string;
};

type PocRunModel = {
  modelId: string;
  name?: string;
  provider?: string;
  version?: string;
};

type PocRunRequest = {
  taskId?: string;
  unitId?: string;
  datasetId?: string;
  aiTaskType?: string;
  metricPack?: string[];
  samples: PocRunSample[];
  models: PocRunModel[];
};

type PocRunResultRow = {
  sampleId: string;
  modelId: string;
  datasetId?: string;
  predictedOutput: string;
  latencyMs: number;
  cost: number;
  isEstimatedCost: boolean;
  tokenUsage: number;
  error: boolean;
  errorReason?: "HF_GATED" | "PROVIDER_ERROR" | "UNSUPPORTED_PROVIDER" | "UNKNOWN";
  errorReasonDetail?: string;
  providerStatus?: number;
  policyPass: boolean;
  violation: boolean;
};

type ProviderErrorCode = "HF_GATED" | "PROVIDER_ERROR" | "UNSUPPORTED_PROVIDER" | "UNKNOWN";

class ProviderRunError extends Error {
  code: ProviderErrorCode;
  provider?: string;
  status?: number;
  upstreamBody?: string;

  constructor(
    message: string,
    code: ProviderErrorCode,
    meta?: { provider?: string; status?: number; upstreamBody?: string }
  ) {
    super(message);
    this.name = "ProviderRunError";
    this.code = code;
    this.provider = meta?.provider;
    this.status = meta?.status;
    this.upstreamBody = meta?.upstreamBody;
  }
}

const OPENAI_MODEL_MAP: Record<string, string> = {
  "gpt-x-base": "gpt-4o",
  "gpt-x-plus": "gpt-4o-mini",
  "gpt-4o": "gpt-4o",
  "gpt-4o-mini": "gpt-4o-mini",
};

const HUGGINGFACE_MODEL_MAP: Record<string, string> = {
  "mistral-7b-instruct": "mistralai/Mistral-7B-Instruct-v0.3",
  "llama-3-8b-instruct": "meta-llama/Meta-Llama-3-8B-Instruct",
  "gemma-2-9b-it": "google/gemma-2-9b-it",
};

function isMockMode() {
  return String(process.env.MOCK_RUN ?? "").toLowerCase() === "true";
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function inferPolicyViolation(text: string) {
  const v = text.toLowerCase();
  const banned = ["혐오", "차별", "폭력", "불법", "음란", "도박", "카지노", "hate", "violence"];
  return banned.some((w) => v.includes(w));
}

function parseExpectedPolicyFlag(expectedOutput?: string) {
  if (!expectedOutput) return null;
  try {
    const obj = JSON.parse(expectedOutput);
    if (typeof obj?.policy_pass === "boolean") return !obj.policy_pass;
  } catch {
    return null;
  }
  return null;
}

function maskSensitiveText(text: string) {
  return text
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer ***")
    .replace(/\bsk-[A-Za-z0-9._-]+\b/g, "sk-***")
    .replace(/\bhf_[A-Za-z0-9._-]+\b/g, "hf_***")
    .replace(/(\"?(api[_-]?key|token|access[_-]?token)\"?\s*:\s*\")([^\"]+)(\")/gi, '$1***$4');
}

function summarizeUpstreamBody(text: string) {
  const normalized = text.replace(/\s+/g, " ").trim();
  return maskSensitiveText(normalized).slice(0, 200);
}

function buildErrorReasonDetail(params: {
  provider?: string;
  status?: number;
  upstreamBody?: string;
  message: string;
}) {
  const provider = params.provider || "unknown";
  const status = typeof params.status === "number" ? String(params.status) : "-";
  const bodySummary = params.upstreamBody ? summarizeUpstreamBody(params.upstreamBody) : "-";
  const message = maskSensitiveText(params.message || "run failed");
  return `provider=${provider}; status=${status}; upstream=${bodySummary}; message=${message}`;
}

function estimateCost(model: string, promptTokens: number, completionTokens: number) {
  const m = model.toLowerCase();
  const total = promptTokens + completionTokens;
  if (m.includes("gpt-4o-mini")) return total * 0.0000006;
  if (m.includes("gpt-4o")) return total * 0.000003;
  if (m.includes("mistral")) return total * 0.0000009;
  if (m.includes("llama")) return total * 0.0000012;
  return total * 0.000001;
}

async function runOpenAI(model: PocRunModel, sample: PocRunSample): Promise<PocRunResultRow> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is missing");
  const resolvedModel = OPENAI_MODEL_MAP[model.modelId] || model.name || "gpt-4o-mini";
  const startedAt = Date.now();
  const prompt = `아래 input을 기반으로 결과를 생성하세요.\ninput:\n${sample.input}`;
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: resolvedModel,
      temperature: 0.2,
      messages: [
        { role: "system", content: "You are a concise assistant." },
        { role: "user", content: prompt },
      ],
    }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new ProviderRunError(`OpenAI error: ${response.status}`, "PROVIDER_ERROR", {
      provider: "openai",
      status: response.status,
      upstreamBody: text,
    });
  }
  const json = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  };
  const predictedOutput = json.choices?.[0]?.message?.content?.trim() || "";
  const latencyMs = Date.now() - startedAt;
  const promptTokens = json.usage?.prompt_tokens ?? Math.max(1, Math.round(sample.input.length / 4));
  const completionTokens = json.usage?.completion_tokens ?? Math.max(1, Math.round(predictedOutput.length / 4));
  const tokenUsage = json.usage?.total_tokens ?? promptTokens + completionTokens;
  const policyByExpected = parseExpectedPolicyFlag(sample.expectedOutput);
  const violation = policyByExpected ?? inferPolicyViolation(predictedOutput);
  return {
    sampleId: sample.sampleId,
    modelId: model.modelId,
    predictedOutput,
    latencyMs,
    cost: estimateCost(resolvedModel, promptTokens, completionTokens),
    isEstimatedCost: true,
    tokenUsage,
    error: false,
    policyPass: !violation,
    violation,
  };
}

async function runHuggingFace(model: PocRunModel, sample: PocRunSample): Promise<PocRunResultRow> {
  const key = process.env.HF_API_KEY;
  if (!key) throw new Error("HF_API_KEY is missing");
  const resolvedModel = HUGGINGFACE_MODEL_MAP[model.modelId] || model.name || "mistralai/Mistral-7B-Instruct-v0.3";
  const startedAt = Date.now();
  const prompt = `아래 input을 기반으로 결과를 생성하세요.\ninput:\n${sample.input}`;
  const response = await fetch(`https://api-inference.huggingface.co/models/${encodeURIComponent(resolvedModel)}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      inputs: prompt,
      parameters: {
        max_new_tokens: 256,
        temperature: 0.2,
        return_full_text: false,
      },
      options: {
        wait_for_model: true,
      },
    }),
  });
  if (!response.ok) {
    const text = await response.text();
    if (response.status === 401 || response.status === 403) {
      throw new ProviderRunError(
        `HuggingFace gated model access denied (${response.status}). Accept license and retry.`,
        "HF_GATED",
        { provider: "huggingface", status: response.status, upstreamBody: text }
      );
    }
    throw new ProviderRunError(`HuggingFace error: ${response.status}`, "PROVIDER_ERROR", {
      provider: "huggingface",
      status: response.status,
      upstreamBody: text,
    });
  }
  const json = (await response.json()) as
    | Array<{ generated_text?: string }>
    | { generated_text?: string; error?: string };
  const predictedOutput = Array.isArray(json)
    ? (json[0]?.generated_text ?? "").trim()
    : (json.generated_text ?? "").trim();
  const latencyMs = Date.now() - startedAt;
  const promptTokens = Math.max(1, Math.round(sample.input.length / 4));
  const completionTokens = Math.max(1, Math.round(predictedOutput.length / 4));
  const tokenUsage = promptTokens + completionTokens;
  const policyByExpected = parseExpectedPolicyFlag(sample.expectedOutput);
  const violation = policyByExpected ?? inferPolicyViolation(predictedOutput);
  return {
    sampleId: sample.sampleId,
    modelId: model.modelId,
    predictedOutput,
    latencyMs,
    cost: estimateCost(resolvedModel, promptTokens, completionTokens),
    isEstimatedCost: true,
    tokenUsage,
    error: false,
    policyPass: !violation,
    violation,
  };
}

function runMock(model: PocRunModel, sample: PocRunSample): PocRunResultRow {
  const input = sample.input || "";
  const expected = sample.expectedOutput || "";
  const predictedOutput = expected || `MOCK 결과: ${input.slice(0, 140)}`;
  const tokenUsage = clamp(Math.round((input.length + predictedOutput.length) / 3), 20, 5000);
  const latencyMs = clamp(500 + (tokenUsage % 900), 500, 2200);
  const cost = Number((tokenUsage * 0.0000012).toFixed(4));
  const policyByExpected = parseExpectedPolicyFlag(sample.expectedOutput);
  const violation = policyByExpected ?? inferPolicyViolation(predictedOutput);
  return {
    sampleId: sample.sampleId,
    modelId: model.modelId,
    predictedOutput,
    latencyMs,
    cost,
    isEstimatedCost: true,
    tokenUsage,
    error: false,
    policyPass: !violation,
    violation,
  };
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as PocRunRequest;
    const samples = (body.samples ?? []).filter((s) => s.sampleId && s.input);
    const models = body.models ?? [];
    if (samples.length === 0) {
      return NextResponse.json({ ok: false, rows: [], error: "No valid samples" }, { status: 400 });
    }
    if (models.length === 0) {
      return NextResponse.json({ ok: false, rows: [], error: "No models selected" }, { status: 400 });
    }

    const mock = isMockMode();
    if (!mock) {
      const providers = new Set(models.map((m) => String(m.provider ?? "").toLowerCase()));
      if ([...providers].some((p) => p.includes("openai")) && !process.env.OPENAI_API_KEY) {
        return NextResponse.json(
          { ok: false, rows: [], error: "OPENAI_API_KEY is missing. Set key or enable MOCK_RUN=true." },
          { status: 400 }
        );
      }
      if ([...providers].some((p) => p.includes("huggingface")) && !process.env.HF_API_KEY) {
        return NextResponse.json(
          { ok: false, rows: [], error: "HF_API_KEY is missing. Set key or enable MOCK_RUN=true." },
          { status: 400 }
        );
      }
    }
    const rows: PocRunResultRow[] = [];
    for (const model of models) {
      const provider = String(model.provider ?? "").toLowerCase();
      for (const sample of samples) {
        try {
          if (mock) {
            rows.push(runMock(model, sample));
            continue;
          }
          if (provider.includes("openai")) {
            rows.push(await runOpenAI(model, sample));
            continue;
          }
          if (provider.includes("huggingface")) {
            rows.push(await runHuggingFace(model, sample));
            continue;
          }
          throw new ProviderRunError(`Unsupported provider: ${model.provider ?? "-"}`, "UNSUPPORTED_PROVIDER", {
            provider,
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : "run failed";
          const errorReason: ProviderErrorCode = e instanceof ProviderRunError ? e.code : "UNKNOWN";
          const providerStatus = e instanceof ProviderRunError ? e.status : undefined;
          const errorReasonDetail = buildErrorReasonDetail({
            provider: e instanceof ProviderRunError ? e.provider || provider : provider,
            status: providerStatus,
            upstreamBody: e instanceof ProviderRunError ? e.upstreamBody : undefined,
            message: msg,
          });
          if (mock) {
            const base = runMock(model, sample);
            rows.push({
              ...base,
              datasetId: body.datasetId,
              predictedOutput: base.predictedOutput || msg,
              error: true,
              errorReason,
              errorReasonDetail,
              providerStatus,
            });
          } else {
            rows.push({
              sampleId: sample.sampleId,
              modelId: model.modelId,
              datasetId: body.datasetId,
              predictedOutput: "",
              latencyMs: 0,
              cost: 0,
              isEstimatedCost: true,
              tokenUsage: 0,
              error: true,
              errorReason,
              errorReasonDetail,
              providerStatus,
              policyPass: false,
              violation: false,
            });
          }
        }
      }
    }
    return NextResponse.json({
      ok: true,
      mode: mock ? "mock" : "live",
      rows: rows.map((row) => ({ ...row, datasetId: row.datasetId ?? body.datasetId })),
      error: "",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ ok: false, rows: [], error: msg }, { status: 500 });
  }
}
