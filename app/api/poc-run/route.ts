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
  aiTaskType?: string;
  metricPack?: string[];
  samples: PocRunSample[];
  models: PocRunModel[];
};

type PocRunResultRow = {
  sampleId: string;
  modelId: string;
  predictedOutput: string;
  latencyMs: number;
  cost: number;
  tokenUsage: number;
  error: boolean;
  policyPass: boolean;
  violation: boolean;
};

const OPENAI_MODEL_MAP: Record<string, string> = {
  "gpt-x-base": "gpt-4o",
  "gpt-x-plus": "gpt-4o-mini",
};

const ANTHROPIC_MODEL_MAP: Record<string, string> = {
  "claude-pro": "claude-3-5-sonnet-20241022",
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

function estimateCost(model: string, promptTokens: number, completionTokens: number) {
  const m = model.toLowerCase();
  const total = promptTokens + completionTokens;
  if (m.includes("gpt-4o-mini")) return total * 0.0000006;
  if (m.includes("gpt-4o")) return total * 0.000003;
  if (m.includes("claude")) return total * 0.0000025;
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
    throw new Error(`OpenAI error: ${response.status} ${text}`);
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
    tokenUsage,
    error: false,
    policyPass: !violation,
    violation,
  };
}

async function runAnthropic(model: PocRunModel, sample: PocRunSample): Promise<PocRunResultRow> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY is missing");
  const resolvedModel = ANTHROPIC_MODEL_MAP[model.modelId] || model.name || "claude-3-5-sonnet-20241022";
  const startedAt = Date.now();
  const prompt = `아래 input을 기반으로 결과를 생성하세요.\ninput:\n${sample.input}`;
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: resolvedModel,
      max_tokens: 1024,
      temperature: 0.2,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Anthropic error: ${response.status} ${text}`);
  }
  const json = (await response.json()) as {
    content?: Array<{ type?: string; text?: string }>;
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  const predictedOutput =
    json.content?.filter((block) => block.type === "text").map((block) => block.text ?? "").join("\n").trim() || "";
  const latencyMs = Date.now() - startedAt;
  const promptTokens = json.usage?.input_tokens ?? Math.max(1, Math.round(sample.input.length / 4));
  const completionTokens = json.usage?.output_tokens ?? Math.max(1, Math.round(predictedOutput.length / 4));
  const tokenUsage = promptTokens + completionTokens;
  const policyByExpected = parseExpectedPolicyFlag(sample.expectedOutput);
  const violation = policyByExpected ?? inferPolicyViolation(predictedOutput);
  return {
    sampleId: sample.sampleId,
    modelId: model.modelId,
    predictedOutput,
    latencyMs,
    cost: estimateCost(resolvedModel, promptTokens, completionTokens),
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
      return NextResponse.json({ ok: false, error: "No valid samples" }, { status: 400 });
    }
    if (models.length === 0) {
      return NextResponse.json({ ok: false, error: "No models selected" }, { status: 400 });
    }

    const mock = isMockMode();
    if (!mock) {
      const providers = new Set(models.map((m) => String(m.provider ?? "").toLowerCase()));
      if ([...providers].some((p) => p.includes("openai")) && !process.env.OPENAI_API_KEY) {
        return NextResponse.json(
          { ok: false, error: "OPENAI_API_KEY is missing. Set key or enable MOCK_RUN=true." },
          { status: 400 }
        );
      }
      if ([...providers].some((p) => p.includes("anthropic")) && !process.env.ANTHROPIC_API_KEY) {
        return NextResponse.json(
          { ok: false, error: "ANTHROPIC_API_KEY is missing. Set key or enable MOCK_RUN=true." },
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
          if (provider.includes("anthropic")) {
            rows.push(await runAnthropic(model, sample));
            continue;
          }
          throw new Error(`Unsupported provider: ${model.provider ?? "-"}`);
        } catch (e) {
          const msg = e instanceof Error ? e.message : "run failed";
          if (mock) {
            const base = runMock(model, sample);
            rows.push({
              ...base,
              predictedOutput: base.predictedOutput || msg,
              error: true,
            });
          } else {
            rows.push({
              sampleId: sample.sampleId,
              modelId: model.modelId,
              predictedOutput: "",
              latencyMs: 0,
              cost: 0,
              tokenUsage: 0,
              error: true,
              policyPass: false,
              violation: false,
            });
          }
        }
      }
    }
    return NextResponse.json({ ok: true, mode: mock ? "mock" : "live", rows });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
