"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { CSSProperties } from "react";
import { useParams, useRouter } from "next/navigation";
import Step1PreviewPanel from "../_components/Step1PreviewPanel";
import {
  canAccessTechSpec,
  getProgress,
  getStep1Data,
  getStep2Data,
  getStep3Policy,
  getStep3SavedSnapshot,
  type Step1Data,
  type Step2Data,
} from "@/lib/prismMvp";

type RightPanelTab = "preview" | "impact";
type Step5ViewTab = "experiment" | "release" | "operational" | "scaleup";

type ModelOption = {
  id: string;
  name: string;
  provider: string;
  version: string;
  role: string;
  releaseDate: string;
  specialty: string;
  domain: string;
  summary: string;
};

type SampleInput = {
  id: string;
  input: string;
  description: string;
};

type PocRunRow = {
  key: string;
  modelId: string;
  sampleId: string;
  predictedOutput: string;
  observedOutput: string;
  editRate: number;
  confidenceScore: number;
  errorRate: number;
  averageLatency: number;
  costPerRequest: number;
  policyPassRate: number;
  policyViolationRate: number;
  recall: number;
  precision: number;
  f1Score: number;
};

const DEFAULT_PROGRESS = {
  step1Frozen: false,
  step2Completed: false,
  step3Completed: false,
} as const;

const VIEW_TABS: Array<{ key: Step5ViewTab; label: string }> = [
  { key: "experiment", label: "실험뷰" },
  { key: "release", label: "출시뷰" },
  { key: "operational", label: "운영뷰" },
  { key: "scaleup", label: "확장뷰" },
];

const MODEL_PROVIDER_OPTIONS = ["all", "OpenAI", "Anthropic", "Meta", "HuggingFace", "Internal"] as const;
const MODEL_ROLE_OPTIONS = ["all", "Generation", "Review", "Policy Guard", "Summarization"] as const;

const MOCK_MODEL_OPTIONS: ModelOption[] = [
  {
    id: "gpt-x-base",
    name: "GPT-X Base",
    provider: "OpenAI",
    version: "v1",
    role: "Generation",
    releaseDate: "2026-01-10",
    specialty: "초안 생성",
    domain: "콘텐츠 자동화",
    summary: "기본 생성 품질과 속도 균형형 모델",
  },
  {
    id: "gpt-x-plus",
    name: "GPT-X Plus",
    provider: "OpenAI",
    version: "v2",
    role: "Review",
    releaseDate: "2026-02-02",
    specialty: "조건부 승인/리라이팅",
    domain: "정책 반영 자동화",
    summary: "생성+검토 파이프라인에 최적화된 모델",
  },
  {
    id: "claude-pro",
    name: "Claude Pro",
    provider: "Anthropic",
    version: "v3",
    role: "Policy Guard",
    releaseDate: "2025-12-18",
    specialty: "정책 준수 검증",
    domain: "리스크/안전",
    summary: "정책 위반 탐지와 보수적 응답에 강점",
  },
  {
    id: "llama-2",
    name: "LLaMA-2",
    provider: "Meta",
    version: "v1",
    role: "Summarization",
    releaseDate: "2025-10-05",
    specialty: "저비용 처리",
    domain: "대량 트래픽",
    summary: "비용 효율 우선 시나리오에 적합",
  },
];

const MODEL_SAMPLE_LIBRARY: Record<string, SampleInput[]> = {
  "gpt-x-base": [
    { id: "S-1", input: "질문 A", description: "기본 검증 샘플" },
    { id: "S-2", input: "질문 B", description: "일반 품질 검증 샘플" },
  ],
  "gpt-x-plus": [
    { id: "S-1", input: "정책 포함 문안 생성", description: "정책 검증 샘플" },
    { id: "S-2", input: "초안 개선/수정 요청", description: "리라이팅 검증 샘플" },
  ],
  "claude-pro": [
    { id: "S-1", input: "민감 표현 포함 응답 점검", description: "위반 탐지 샘플" },
    { id: "S-2", input: "외부 노출 가능 여부 판단", description: "정책 통과 샘플" },
  ],
  "llama-2": [
    { id: "S-1", input: "짧은 공지 생성", description: "저비용 처리 샘플" },
    { id: "S-2", input: "반복성 텍스트 생성", description: "대량 호출 샘플" },
  ],
};

function buildDefaultRunRow(modelId: string, sampleId: string): PocRunRow {
  return {
    key: `${modelId}::${sampleId}`,
    modelId,
    sampleId,
    predictedOutput: "",
    observedOutput: "",
    editRate: 0,
    confidenceScore: 0,
    errorRate: 0,
    averageLatency: 0,
    costPerRequest: 0,
    policyPassRate: 0,
    policyViolationRate: 0,
    recall: 0,
    precision: 0,
    f1Score: 0,
  };
}

function evaluateDecision(metrics: {
  editRate: number;
  confidenceScore: number;
  errorRate: number;
  averageLatency: number;
  costPerRequest: number;
  policyPassRate: number;
  policyViolationRate: number;
  recall: number;
  precision: number;
  f1Score: number;
}) {
  const failures: string[] = [];
  if (metrics.errorRate > 5) failures.push("오류율 > 5%");
  if (metrics.averageLatency > 1500) failures.push("평균 응답 시간 > 1500ms");
  if (metrics.costPerRequest > 0.05) failures.push("요청당 비용 > 0.05$");
  if (metrics.policyViolationRate > 5) failures.push("정책 위반율 > 5%");
  if (metrics.confidenceScore < 0.75) failures.push("평균 컨피던스 < 0.75");
  if (metrics.f1Score < 0.6) failures.push("F1 < 0.60");

  if (failures.length === 0) return { status: "GO", failures };
  if (failures.length <= 2) return { status: "CONDITIONAL", failures };
  return { status: "STOP", failures };
}

export default function ProjectPocReviewPage() {
  const params = useParams();
  const router = useRouter();
  const id = String(params?.id ?? "");
  const progressSnapshotRef = useRef(DEFAULT_PROGRESS);
  const progressSnapshotKeyRef = useRef("0|0|0");

  const getProgressSnapshot = useCallback(() => {
    if (!id) return DEFAULT_PROGRESS;
    const next = getProgress(id);
    const nextKey = `${next.step1Frozen ? 1 : 0}|${next.step2Completed ? 1 : 0}|${next.step3Completed ? 1 : 0}`;
    if (progressSnapshotKeyRef.current === nextKey) return progressSnapshotRef.current;
    progressSnapshotKeyRef.current = nextKey;
    progressSnapshotRef.current = next;
    return next;
  }, [id]);

  const progress = useSyncExternalStore(
    (onStoreChange) => {
      if (!id) return () => undefined;
      const handler = () => onStoreChange();
      window.addEventListener("storage", handler);
      window.addEventListener("prism-progress-updated", handler as EventListener);
      return () => {
        window.removeEventListener("storage", handler);
        window.removeEventListener("prism-progress-updated", handler as EventListener);
      };
    },
    getProgressSnapshot,
    () => DEFAULT_PROGRESS
  );

  const locked = !canAccessTechSpec(progress);
  const step3Snapshot = useMemo(() => (id && !locked ? getStep3SavedSnapshot(id) : null), [id, locked]);
  const step1Data = useMemo<Step1Data | null>(
    () => (step3Snapshot?.step1 ? step3Snapshot.step1 : id && !locked ? getStep1Data(id) : null),
    [id, locked, step3Snapshot]
  );
  const step2Data = useMemo<Step2Data | null>(
    () => (step3Snapshot?.step2 ? step3Snapshot.step2 : id && !locked ? getStep2Data(id) : null),
    [id, locked, step3Snapshot]
  );
  const step3PolicyMetrics = useMemo(() => {
    if (!id || locked) return null;
    const step3 = getStep3Policy(id);
    return {
      executionLevel: step3.automation_level_adjustment,
      approvalLevel: step3.auto_processing_scope,
      dataPolicy: step3.data_assetization_strategy,
    };
  }, [id, locked]);

  const [rightPanelTab, setRightPanelTab] = useState<RightPanelTab>("preview");
  const [rightPanelWidth, setRightPanelWidth] = useState(560);
  const [isResizing, setIsResizing] = useState(false);
  const twoPaneRef = useRef<HTMLDivElement | null>(null);

  const [viewTab, setViewTab] = useState<Step5ViewTab>("experiment");
  const [modelQuery, setModelQuery] = useState("");
  const [providerFilter, setProviderFilter] = useState("all");
  const [roleFilter, setRoleFilter] = useState("all");
  const [specialtyFilter, setSpecialtyFilter] = useState("all");
  const [modelCatalog, setModelCatalog] = useState<ModelOption[]>([]);
  const [isModelLoading, setIsModelLoading] = useState(true);
  const [modelLoadError, setModelLoadError] = useState<string | null>(null);
  const [modelLastSyncedAt, setModelLastSyncedAt] = useState<number | null>(null);
  const [selectedModelIds, setSelectedModelIds] = useState<string[]>([]);
  const [activeModelId, setActiveModelId] = useState<string>("");
  const [releaseMinIdx, setReleaseMinIdx] = useState(0);
  const [releaseMaxIdx, setReleaseMaxIdx] = useState(0);
  const [samples, setSamples] = useState<SampleInput[]>([
    { id: "S-1", input: "질문 A", description: "기본 검증 샘플" },
    { id: "S-2", input: "질문 B", description: "정책 검증 샘플" },
  ]);
  const [runRows, setRunRows] = useState<PocRunRow[]>([]);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!id || !locked) return;
    router.replace(`/project/${id}/tech-spec`);
  }, [id, locked, router]);

  useEffect(() => {
    if (!isResizing) return;
    function onMove(e: MouseEvent) {
      const rect = twoPaneRef.current?.getBoundingClientRect();
      if (!rect) return;
      const next = rect.right - e.clientX;
      const clamped = Math.max(360, Math.min(860, next));
      setRightPanelWidth(clamped);
    }
    function onUp() {
      setIsResizing(false);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [isResizing]);

  const loadModelCatalog = useCallback(async () => {
    setIsModelLoading(true);
    setModelLoadError(null);
    try {
      // TODO: API 연결 시 이 부분을 실제 fetch로 교체
      await new Promise((resolve) => setTimeout(resolve, 120));
      setModelCatalog(MOCK_MODEL_OPTIONS);
      setModelLastSyncedAt(Date.now());
      setSelectedModelIds((prev) => (prev.length > 0 ? prev : []));
    } catch {
      setModelLoadError("모델 목록을 불러오지 못했습니다.");
    } finally {
      setIsModelLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadModelCatalog();
  }, [loadModelCatalog]);

  useEffect(() => {
    setRunRows((prev) => {
      const sampleIds = samples.map((s) => s.id.trim()).filter(Boolean);
      const prevMap = new Map(prev.map((row) => [row.key, row]));
      const next: PocRunRow[] = [];
      selectedModelIds.forEach((modelId) => {
        sampleIds.forEach((sampleId) => {
          const key = `${modelId}::${sampleId}`;
          next.push(prevMap.get(key) ?? buildDefaultRunRow(modelId, sampleId));
        });
      });
      return next;
    });
  }, [selectedModelIds, samples]);

  useEffect(() => {
    if (selectedModelIds.length === 0) return;
    const merged = selectedModelIds.flatMap((modelId) => MODEL_SAMPLE_LIBRARY[modelId] ?? []);
    const dedup = new Map<string, SampleInput>();
    merged.forEach((sample, idx) => {
      const key = `${sample.id}::${sample.input}`;
      if (!dedup.has(key)) {
        dedup.set(key, { ...sample, id: sample.id || `S-${idx + 1}` });
      }
    });
    const nextSamples = Array.from(dedup.values());
    if (nextSamples.length > 0) setSamples(nextSamples);
  }, [selectedModelIds]);

  const releaseDateOptions = useMemo(() => {
    return Array.from(new Set(modelCatalog.map((model) => model.releaseDate))).sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
  }, [modelCatalog]);

  useEffect(() => {
    if (releaseDateOptions.length === 0) {
      setReleaseMinIdx(0);
      setReleaseMaxIdx(0);
      return;
    }
    setReleaseMinIdx(0);
    setReleaseMaxIdx(releaseDateOptions.length - 1);
  }, [releaseDateOptions]);

  const specialtyOptions = useMemo(() => ["all", ...Array.from(new Set(modelCatalog.map((m) => m.specialty)))], [modelCatalog]);

  const filteredModels = useMemo(() => {
    const q = modelQuery.trim().toLowerCase();
    const minDate = releaseDateOptions[releaseMinIdx];
    const maxDate = releaseDateOptions[releaseMaxIdx];
    return modelCatalog.filter((model) => {
      if (providerFilter !== "all" && model.provider !== providerFilter) return false;
      if (roleFilter !== "all" && model.role !== roleFilter) return false;
      if (specialtyFilter !== "all" && model.specialty !== specialtyFilter) return false;
      if (minDate && maxDate) {
        const current = new Date(model.releaseDate).getTime();
        const min = new Date(minDate).getTime();
        const max = new Date(maxDate).getTime();
        if (current < min || current > max) return false;
      }
      if (!q) return true;
      const haystack = `${model.name} ${model.provider} ${model.role} ${model.version} ${model.releaseDate} ${model.specialty} ${model.domain}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [modelCatalog, modelQuery, providerFilter, releaseDateOptions, releaseMaxIdx, releaseMinIdx, roleFilter, specialtyFilter]);

  const selectedModels = useMemo(
    () => modelCatalog.filter((model) => selectedModelIds.includes(model.id)),
    [modelCatalog, selectedModelIds]
  );
  const activeModel = useMemo(() => {
    const fallbackId = activeModelId || selectedModelIds[0] || "";
    return modelCatalog.find((model) => model.id === fallbackId) ?? null;
  }, [activeModelId, modelCatalog, selectedModelIds]);

  const sampleMap = useMemo(() => new Map(samples.map((sample) => [sample.id, sample])), [samples]);
  const modelMap = useMemo(() => new Map(modelCatalog.map((model) => [model.id, model])), [modelCatalog]);

  const core10ByModel = useMemo(() => {
    return selectedModelIds.map((modelId) => {
      const rows = runRows.filter((row) => row.modelId === modelId);
      const count = rows.length || 1;
      const avg = {
        editRate: rows.reduce((acc, row) => acc + row.editRate, 0) / count,
        confidenceScore: rows.reduce((acc, row) => acc + row.confidenceScore, 0) / count,
        errorRate: rows.reduce((acc, row) => acc + row.errorRate, 0) / count,
        averageLatency: rows.reduce((acc, row) => acc + row.averageLatency, 0) / count,
        costPerRequest: rows.reduce((acc, row) => acc + row.costPerRequest, 0) / count,
        policyPassRate: rows.reduce((acc, row) => acc + row.policyPassRate, 0) / count,
        policyViolationRate: rows.reduce((acc, row) => acc + row.policyViolationRate, 0) / count,
        recall: rows.reduce((acc, row) => acc + row.recall, 0) / count,
        precision: rows.reduce((acc, row) => acc + row.precision, 0) / count,
        f1Score: rows.reduce((acc, row) => acc + row.f1Score, 0) / count,
      };
      return {
        modelId,
        modelName: modelMap.get(modelId)?.name ?? modelId,
        ...avg,
        decision: evaluateDecision(avg),
      };
    });
  }, [modelMap, runRows, selectedModelIds]);

  const decisionReference = useMemo(() => {
    if (viewTab === "experiment") {
      return {
        title: "실험뷰 (Experiment)",
        headers: ["샘플 ID", "모델", "입력(Input)", "예상 출력(Predicted Output)", "수정률(Edit Rate)", "컨피던스", "오류율", "평균 응답 시간"],
        rows: runRows.map((row) => {
          const model = modelMap.get(row.modelId)?.name ?? row.modelId;
          const sample = sampleMap.get(row.sampleId);
          return [
            row.sampleId,
            model,
            sample?.input || "-",
            row.predictedOutput || "-",
            `${row.editRate.toFixed(1)}%`,
            row.confidenceScore.toFixed(2),
            `${row.errorRate.toFixed(1)}%`,
            `${row.averageLatency.toFixed(0)}ms`,
          ];
        }),
      };
    }
    if (viewTab === "release") {
      return {
        title: "출시뷰 (Release)",
        headers: ["샘플 ID", "모델", "정책 통과율", "정책 위반율", "요청당 비용", "평균 응답 시간"],
        rows: runRows.map((row) => {
          const model = modelMap.get(row.modelId)?.name ?? row.modelId;
          return [
            row.sampleId,
            model,
            `${row.policyPassRate.toFixed(1)}%`,
            `${row.policyViolationRate.toFixed(1)}%`,
            `$${row.costPerRequest.toFixed(3)}`,
            `${row.averageLatency.toFixed(0)}ms`,
          ];
        }),
      };
    }
    if (viewTab === "operational") {
      return {
        title: "운영뷰 (Operational)",
        headers: ["모델", "Recall", "Precision", "F1", "평균 수정 비율", "수동 개입률", "타임아웃 비율", "재시도율"],
        rows: core10ByModel.map((row) => [
          row.modelName,
          row.recall.toFixed(2),
          row.precision.toFixed(2),
          row.f1Score.toFixed(2),
          `${row.editRate.toFixed(1)}%`,
          `${Math.max(0.5, row.editRate * 0.2).toFixed(1)}%`,
          `${Math.max(0.1, row.errorRate * 0.2).toFixed(2)}%`,
          `${Math.max(0.1, row.errorRate * 0.15).toFixed(2)}%`,
        ]),
      };
    }
    return {
      title: "확장뷰 (Scale-up)",
      headers: ["DAU", "모델", "월 호출 예측수", "월 비용", "GPU 사용률", "지연율", "실패율"],
      rows: core10ByModel.flatMap((row) => {
        const dauPlans = [10000, 50000];
        return dauPlans.map((dau) => {
          const monthlyCalls = Math.round(dau * 3.2);
          const monthlyCost = monthlyCalls * row.costPerRequest;
          return [
            dau.toLocaleString(),
            row.modelName,
            monthlyCalls.toLocaleString(),
            `${Math.round(monthlyCost).toLocaleString()}원`,
            `${Math.min(95, Math.max(20, row.averageLatency / 20)).toFixed(0)}%`,
            `${Math.max(0.1, row.errorRate * 0.12).toFixed(2)}%`,
            `${Math.max(0.1, row.errorRate * 0.2).toFixed(2)}%`,
          ];
        });
      }),
    };
  }, [core10ByModel, modelMap, runRows, sampleMap, viewTab]);

  const summaryMetrics = useMemo(() => {
    const safeDiv = (value: number, denominator: number) => (denominator > 0 ? value / denominator : 0);
    const count = runRows.length;
    const avgEditRate = safeDiv(runRows.reduce((acc, row) => acc + row.editRate, 0), count);
    const avgConfidence = safeDiv(runRows.reduce((acc, row) => acc + row.confidenceScore, 0), count);
    const avgErrorRate = safeDiv(runRows.reduce((acc, row) => acc + row.errorRate, 0), count);
    const avgLatency = safeDiv(runRows.reduce((acc, row) => acc + row.averageLatency, 0), count);
    const avgCost = safeDiv(runRows.reduce((acc, row) => acc + row.costPerRequest, 0), count);
    const avgPolicyPass = safeDiv(runRows.reduce((acc, row) => acc + row.policyPassRate, 0), count);
    const avgPolicyViolation = safeDiv(runRows.reduce((acc, row) => acc + row.policyViolationRate, 0), count);
    const avgRecall = safeDiv(runRows.reduce((acc, row) => acc + row.recall, 0), count);
    const avgPrecision = safeDiv(runRows.reduce((acc, row) => acc + row.precision, 0), count);
    const avgF1 = safeDiv(runRows.reduce((acc, row) => acc + row.f1Score, 0), count);

    const tokenUsage = Math.max(
      0,
      Math.round(
        runRows.reduce((acc, row) => acc + (row.predictedOutput || row.observedOutput || "").length * 3, 0)
      )
    );
    const avgTokenPerRequest = runRows.length > 0 ? Math.round(tokenUsage / runRows.length) : 0;
    const totalCost = runRows.reduce((acc, row) => acc + row.costPerRequest, 0);
    const monthlyEstimatedCostKrw = Math.round((avgCost || 0) * 12000 * 1350);

    const base = Math.max(100, runRows.length * 100);
    const tp = Math.round(base * Math.max(0, Math.min(1, avgRecall)));
    const fp = avgPrecision > 0 ? Math.max(0, Math.round(tp * (1 / avgPrecision - 1))) : 0;
    const fn = avgRecall > 0 ? Math.max(0, Math.round(tp * (1 / avgRecall - 1))) : 0;

    const rollbackCount = Math.max(0, Math.round((avgErrorRate / 100) * runRows.length * 0.5));
    const editedCount = Math.max(0, Math.round((runRows.length * avgEditRate) / 100));
    const riskLow = Math.max(0, avgPolicyViolation - 1);
    const riskHigh = Math.max(0, avgPolicyViolation + 1);

    const completionRate = Math.max(0, Math.min(100, 100 - avgErrorRate * 2 - avgEditRate * 0.3));
    const dropoffRate = Math.max(0, Math.min(100, avgErrorRate + Math.max(0, 1 - avgConfidence) * 10));
    const conversionRate = Math.max(0, Math.min(100, completionRate * 0.16));
    const nps = Math.max(-100, Math.min(100, Math.round((avgConfidence - 0.5) * 80 + (completionRate - dropoffRate) * 0.2)));
    const productivityGain = Math.max(0, Math.min(100, Math.round((completionRate * 0.2 + avgRecall * 100 * 0.1) * 10) / 10));

    return {
      sampleCount: runRows.length,
      tokenUsage,
      avgTokenPerRequest,
      avgEditRate,
      tp,
      fp,
      fn,
      avgPrecision,
      avgRecall,
      avgF1,
      avgCost,
      totalCost,
      monthlyEstimatedCostKrw,
      avgPolicyPass,
      avgPolicyViolation,
      avgErrorRate,
      rollbackCount,
      editedCount,
      riskLow,
      riskHigh,
      avgLatency,
      avgConfidence,
      completionRate,
      dropoffRate,
      conversionRate,
      nps,
      productivityGain,
    };
  }, [runRows]);

  function updateSample(index: number, key: keyof SampleInput, value: string) {
    setSamples((prev) => prev.map((sample, i) => (i === index ? { ...sample, [key]: value } : sample)));
  }

  function addSample() {
    setSamples((prev) => [...prev, { id: `S-${prev.length + 1}`, input: "", description: "" }]);
  }

  function addModel(modelId: string) {
    setSelectedModelIds((prev) => {
      if (prev.includes(modelId)) return prev;
      const next = [...prev, modelId];
      if (!activeModelId) setActiveModelId(modelId);
      return next;
    });
  }

  function removeModel(modelId: string) {
    setSelectedModelIds((prev) => {
      const next = prev.filter((idValue) => idValue !== modelId);
      if (activeModelId === modelId) setActiveModelId(next[0] ?? "");
      return next;
    });
  }

  function updateRunRow(key: string, field: keyof PocRunRow, value: string) {
    setRunRows((prev) =>
      prev.map((row) => {
        if (row.key !== key) return row;
        if (field === "predictedOutput" || field === "observedOutput") {
          return { ...row, [field]: value };
        }
        const numeric = Number(value);
        return { ...row, [field]: Number.isFinite(numeric) ? numeric : 0 };
      })
    );
  }

  function handlePredict() {
    setRunRows((prev) =>
      prev.map((row) => {
        const model = modelMap.get(row.modelId);
        const sample = sampleMap.get(row.sampleId);
        return {
          ...row,
          predictedOutput: row.predictedOutput || `[예상] ${model?.name ?? row.modelId}: ${sample?.input || "입력 없음"}`,
          confidenceScore: row.confidenceScore || 0.82,
          averageLatency: row.averageLatency || 1100,
          costPerRequest: row.costPerRequest || 0.03,
          policyPassRate: row.policyPassRate || 96,
          policyViolationRate: row.policyViolationRate || 4,
          errorRate: row.errorRate || 3,
          editRate: row.editRate || 12,
          recall: row.recall || 0.72,
          precision: row.precision || 0.76,
          f1Score: row.f1Score || 0.74,
        };
      })
    );
    setMessage("예상 결과를 생성했습니다.");
  }

  function handleRunPoc() {
    setRunRows((prev) =>
      prev.map((row) => ({
        ...row,
        observedOutput: row.observedOutput || `${row.predictedOutput || "예상 출력"} (실측)` ,
      }))
    );
    setMessage("POC 실측 입력 모드로 전환되었습니다.");
  }

  function handleSavePoc() {
    setMessage(`결과 저장 완료: 모델 ${selectedModelIds.length}개 / 샘플 ${samples.length}개`);
  }

  return (
    <div ref={twoPaneRef} className="two-pane" style={twoPaneStyle}>
      <section style={mainPanelStyle}>
        <div style={heroStyle}>
          <h1 style={titleStyle}>STEP 5 PoC 리뷰</h1>
          <p style={{ ...subtleStyle, marginTop: 6 }}>샘플셋 입력 → 예측 → 실측 입력 → Core10 비교 → Go/Stop 결정</p>
        </div>

        <div style={{ ...cardStyle, marginTop: 12 }}>
          <div style={cardHeadStyle}>
            <div>
              <h3 style={cardTitleStyle}>모델 검색/선택</h3>
              <div style={cardSubStyle}>
                {modelLoadError
                  ? "동기화 실패"
                  : isModelLoading
                    ? "동기화 중..."
                    : `동기화 완료${modelLastSyncedAt ? ` · ${new Date(modelLastSyncedAt).toLocaleTimeString()}` : ""}`}
              </div>
            </div>
            <button type="button" onClick={() => void loadModelCatalog()} style={miniButtonStyle} disabled={isModelLoading}>
              새로고침
            </button>
          </div>
          <div style={topSearchWrapStyle}>
            <input
              value={modelQuery}
              onChange={(e) => setModelQuery(e.target.value)}
              placeholder="모델명/버전 검색"
              style={topSearchInputStyle}
            />
          </div>
          <div style={topFilterGridStyle}>
            <div style={topFilterItemStyle}>
              <label style={topFilterLabelStyle}>Provider</label>
              <select value={providerFilter} onChange={(e) => setProviderFilter(e.target.value)} style={selectStyle}>
                {MODEL_PROVIDER_OPTIONS.map((provider) => (
                  <option key={provider} value={provider}>
                    {provider === "all" ? "전체" : provider}
                  </option>
                ))}
              </select>
            </div>
            <div style={topFilterItemStyle}>
              <label style={topFilterLabelStyle}>Role</label>
              <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} style={selectStyle}>
                {MODEL_ROLE_OPTIONS.map((role) => (
                  <option key={role} value={role}>
                    {role === "all" ? "전체" : role}
                  </option>
                ))}
              </select>
            </div>
            <div style={topFilterItemStyle}>
              <label style={topFilterLabelStyle}>Specialty</label>
              <select value={specialtyFilter} onChange={(e) => setSpecialtyFilter(e.target.value)} style={selectStyle}>
                {specialtyOptions.map((specialty) => (
                  <option key={specialty} value={specialty}>
                    {specialty === "all" ? "전체" : specialty}
                  </option>
                ))}
              </select>
            </div>
            <div style={topFilterItemStyle}>
              <label style={topFilterLabelStyle}>출시일 범위</label>
              {releaseDateOptions.length > 0 ? (
                <div style={rangeWrapStyle}>
                  <div style={rangeLabelStyle}>
                    {releaseDateOptions[releaseMinIdx]} ~ {releaseDateOptions[releaseMaxIdx]}
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={releaseDateOptions.length - 1}
                    value={releaseMinIdx}
                    onChange={(e) => {
                      const next = Number(e.target.value);
                      setReleaseMinIdx(Math.min(next, releaseMaxIdx));
                    }}
                  />
                  <input
                    type="range"
                    min={0}
                    max={releaseDateOptions.length - 1}
                    value={releaseMaxIdx}
                    onChange={(e) => {
                      const next = Number(e.target.value);
                      setReleaseMaxIdx(Math.max(next, releaseMinIdx));
                    }}
                  />
                </div>
              ) : (
                <div style={cardSubStyle}>-</div>
              )}
            </div>
          </div>
          <div style={{ ...cardSubStyle, marginTop: 8 }}>검색 결과에서 모델을 추가하세요.</div>
          <div style={modelListStyle}>
            {isModelLoading && <div style={emptyStateStyle}>모델 목록을 불러오는 중입니다...</div>}
            {!isModelLoading && modelLoadError && <div style={errorStateStyle}>{modelLoadError}</div>}
            {!isModelLoading && !modelLoadError && modelQuery.trim() === "" && <div style={emptyStateStyle}>검색어를 입력하면 모델을 선택할 수 있습니다.</div>}
            {!isModelLoading && !modelLoadError && modelQuery.trim() !== "" && filteredModels.length === 0 && (
              <div style={emptyStateStyle}>조건에 맞는 모델이 없습니다.</div>
            )}
            {!isModelLoading &&
              !modelLoadError &&
              modelQuery.trim() !== "" &&
              filteredModels.map((model) => {
                const selected = selectedModelIds.includes(model.id);
                return (
                  <div key={model.id} style={modelItemStyle}>
                    <span style={{ flex: 1 }}>
                      <strong>{model.name}</strong>
                      <span style={modelMetaStyle}> {model.provider} · {model.role} · {model.version}</span>
                    </span>
                    <button type="button" onClick={() => addModel(model.id)} style={modelDetailButtonStyle} disabled={selected}>
                      {selected ? "선택됨" : "추가"}
                    </button>
                  </div>
                );
              })}
          </div>
        </div>

        <div style={kpiCardsStyle}>
          <div style={kpiCardStyle}>
            <div style={kpiLabelStyle}>선택 모델</div>
            <div style={kpiValueStyle}>{selectedModelIds.length}</div>
          </div>
          <div style={kpiCardStyle}>
            <div style={kpiLabelStyle}>샘플 수</div>
            <div style={kpiValueStyle}>{samples.length}</div>
          </div>
          <div style={kpiCardStyle}>
            <div style={kpiLabelStyle}>비교 조합</div>
            <div style={kpiValueStyle}>{runRows.length}</div>
          </div>
        </div>

        <div style={cardStyle}>
          <h3 style={cardTitleStyle}>선택된 모델 정보</h3>
          <div style={selectedCardWrapStyle}>
            {selectedModels.map((model) => (
              <div key={model.id} style={{ ...selectedInfoCardStyle, ...(activeModelId === model.id ? selectedInfoCardActiveStyle : {}) }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <button type="button" onClick={() => setActiveModelId(model.id)} style={selectedCardMainButtonStyle}>
                    <div style={{ fontWeight: 800 }}>{model.name}</div>
                    <div style={modelMetaStyle}>
                      {model.provider} · {model.version}
                    </div>
                  </button>
                  <button type="button" onClick={() => removeModel(model.id)} style={selectedCardRemoveStyle} title="삭제">
                    ×
                  </button>
                </div>
                <div style={modelDetailGridStyle}>
                  <div style={modelDetailRowStyle}>
                    <span style={modelDetailKeyStyle}>출시일</span>
                    <span style={modelDetailValStyle}>{model.releaseDate}</span>
                  </div>
                  <div style={modelDetailRowStyle}>
                    <span style={modelDetailKeyStyle}>역할</span>
                    <span style={modelDetailValStyle}>{model.role}</span>
                  </div>
                  <div style={modelDetailRowStyle}>
                    <span style={modelDetailKeyStyle}>특화</span>
                    <span style={modelDetailValStyle}>{model.specialty}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
          {selectedModels.length === 0 && <div style={{ ...emptyStateStyle, marginTop: 8 }}>선택된 모델이 없습니다.</div>}
          {activeModel && (
            <div style={modelDetailPanelStyle}>
              <div style={modelDetailTitleStyle}>{activeModel.name}</div>
              <div style={modelDetailGridStyle}>
                <div style={modelDetailRowStyle}>
                  <span style={modelDetailKeyStyle}>회사</span>
                  <span style={modelDetailValStyle}>{activeModel.provider}</span>
                </div>
                <div style={modelDetailRowStyle}>
                  <span style={modelDetailKeyStyle}>버전</span>
                  <span style={modelDetailValStyle}>{activeModel.version}</span>
                </div>
                <div style={modelDetailRowStyle}>
                  <span style={modelDetailKeyStyle}>출시일</span>
                  <span style={modelDetailValStyle}>{activeModel.releaseDate}</span>
                </div>
                <div style={modelDetailRowStyle}>
                  <span style={modelDetailKeyStyle}>역할</span>
                  <span style={modelDetailValStyle}>{activeModel.role}</span>
                </div>
                <div style={modelDetailRowStyle}>
                  <span style={modelDetailKeyStyle}>특화 분야</span>
                  <span style={modelDetailValStyle}>{activeModel.specialty}</span>
                </div>
                <div style={modelDetailRowStyle}>
                  <span style={modelDetailKeyStyle}>적용 도메인</span>
                  <span style={modelDetailValStyle}>{activeModel.domain}</span>
                </div>
              </div>
              <p style={{ ...subtleStyle, marginTop: 6 }}>{activeModel.summary}</p>
            </div>
          )}
        </div>

        <div className="step5-left-grid" style={leftGridStyle}>
          <div style={{ ...cardStyle, minWidth: 0 }}>
            <h3 style={cardTitleStyle}>샘플셋 입력</h3>
            <div style={tableWrapStyle}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>샘플 ID</th>
                    <th style={thStyle}>입력 (Input)</th>
                    <th style={thStyle}>설명</th>
                  </tr>
                </thead>
                <tbody>
                  {samples.map((sample, index) => (
                    <tr key={`sample-${index}`}>
                      <td style={tdStyle}>
                        <input value={sample.id} onChange={(e) => updateSample(index, "id", e.target.value)} style={cellInputStyle} />
                      </td>
                      <td style={tdStyle}>
                        <input value={sample.input} onChange={(e) => updateSample(index, "input", e.target.value)} style={cellInputStyle} />
                      </td>
                      <td style={tdStyle}>
                        <input value={sample.description} onChange={(e) => updateSample(index, "description", e.target.value)} style={cellInputStyle} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button type="button" onClick={addSample} style={ghostButtonStyle}>
              + 샘플 추가
            </button>
          </div>
        </div>

        <div style={actionBarStyle}>
          <button type="button" onClick={handlePredict} style={primaryButtonStyle}>
            예상 출력 생성
          </button>
          <button type="button" onClick={handleRunPoc} style={buttonStyle}>
            POC 실행
          </button>
          <button type="button" onClick={handleSavePoc} style={buttonStyle}>
            결과 저장
          </button>
        </div>

        <div style={cardStyle}>
          <h3 style={cardTitleStyle}>지표 요약</h3>
          <div style={summaryCardsGridStyle}>
            <div style={summaryCardStyle}>
              <div style={summaryCardHeadStyle}>
                <span style={{ ...summaryIconStyle, background: "#fef3c7", color: "#92400e" }}>Q</span>
                <div style={summaryCardTitleStyle}>품질 (Quality)</div>
              </div>
              <p style={summaryTextStyle}>이번 POC 샘플 <span style={summaryValueStyle}>{summaryMetrics.sampleCount}</span>건을 모델에 입력했어요.</p>
              <p style={summaryTextStyle}>모델이 생성한 출력의 전체 토큰 수는 <span style={summaryValueStyle}>{summaryMetrics.tokenUsage.toLocaleString()}</span>개로,</p>
              <p style={summaryTextStyle}>요청당 평균 토큰 수는 <span style={summaryValueStyle}>{summaryMetrics.avgTokenPerRequest.toLocaleString()}</span>개에요.</p>
              <div style={summaryGroupGapStyle} />
              <p style={summaryTextStyle}>입력 대비 모델이 생성한 출력에서 실제 사용자가 수정한 수는 <span style={summaryValueStyle}>{summaryMetrics.editedCount}</span>건이고,</p>
              <p style={summaryTextStyle}>전체 출력 대비 수정 비율 (Edit Rate)은 <span style={summaryValueStyle}>{summaryMetrics.avgEditRate.toFixed(1)}%</span>에요.</p>
              <div style={summaryGroupGapStyle} />
              <p style={summaryTextStyle}>모델이 맞춘 정답 수 (True Positive)는 <span style={summaryValueStyle}>{summaryMetrics.tp}</span>건,</p>
              <p style={summaryTextStyle}>잘못 승인된 경우 (False Positive)는 <span style={summaryValueStyle}>{summaryMetrics.fp}</span>건,</p>
              <p style={summaryTextStyle}>놓친 정답 (False Negative)은 <span style={summaryValueStyle}>{summaryMetrics.fn}</span>건이에요.</p>
              <div style={summaryGroupGapStyle} />
              <p style={summaryTextStyle}>이를 종합하면 정밀도 (Precision)은 <span style={summaryValueStyle}>{summaryMetrics.avgPrecision.toFixed(2)}</span>,</p>
              <p style={summaryTextStyle}>재현율 (Recall)은 <span style={summaryValueStyle}>{summaryMetrics.avgRecall.toFixed(2)}</span>,</p>
              <p style={{ ...summaryTextStyle, marginBottom: 0 }}>F1 점수 (F1 Score)는 <span style={summaryValueStyle}>{summaryMetrics.avgF1.toFixed(2)}</span>에요.</p>
            </div>

            <div style={summaryCardStyle}>
              <div style={summaryCardHeadStyle}>
                <span style={{ ...summaryIconStyle, background: "#dbeafe", color: "#1d4ed8" }}>$</span>
                <div style={summaryCardTitleStyle}>비용 (Cost)</div>
              </div>
              <p style={summaryTextStyle}>요청당 평균 비용 (Cost per Request)은 <span style={summaryValueStyle}>${summaryMetrics.avgCost.toFixed(3)}</span>에요.</p>
              <p style={summaryTextStyle}>이번 샘플 실행에서 발생한 전체 비용은 <span style={summaryValueStyle}>${summaryMetrics.totalCost.toFixed(2)}</span>에요.</p>
              <p style={summaryTextStyle}>생성된 토큰 총 수 (Token Usage)는 <span style={summaryValueStyle}>{summaryMetrics.tokenUsage.toLocaleString()}</span>개에요.</p>
              <div style={summaryGroupGapStyle} />
              <p style={{ ...summaryTextStyle, marginBottom: 0 }}>이에 따른 월간 예상 비용 (Monthly Estimated Cost)은 <span style={summaryValueStyle}>{summaryMetrics.monthlyEstimatedCostKrw.toLocaleString()}원</span> 이에요.</p>
            </div>

            <div style={summaryCardStyle}>
              <div style={summaryCardHeadStyle}>
                <span style={{ ...summaryIconStyle, background: "#fee2e2", color: "#b91c1c" }}>!</span>
                <div style={summaryCardTitleStyle}>리스크 (Risk)</div>
              </div>
              <p style={summaryTextStyle}>정책 통과율 (Policy Pass Rate)은 <span style={summaryValueStyle}>{summaryMetrics.avgPolicyPass.toFixed(1)}%</span>이며,</p>
              <p style={summaryTextStyle}>정책 위반율 (Policy Violation Rate)은 <span style={summaryValueStyle}>{summaryMetrics.avgPolicyViolation.toFixed(1)}%</span>에요.</p>
              <div style={summaryGroupGapStyle} />
              <p style={summaryTextStyle}>시스템 오류율 (System Error Rate) <span style={summaryValueStyle}>{summaryMetrics.avgErrorRate.toFixed(1)}%</span> 발생했고,</p>
              <p style={{ ...summaryTextStyle, marginBottom: 0 }}>롤백 발생 횟수 (Rollback Count)는 <span style={summaryValueStyle}>{summaryMetrics.rollbackCount}</span>회에요.</p>
            </div>

            <div style={summaryCardStyle}>
              <div style={summaryCardHeadStyle}>
                <span style={{ ...summaryIconStyle, background: "#dcfce7", color: "#166534" }}>B</span>
                <div style={summaryCardTitleStyle}>비즈니스 가치 (Business Impact)</div>
              </div>
              <p style={summaryTextStyle}>완료율 (Completion Rate)은 <span style={summaryValueStyle}>{summaryMetrics.completionRate.toFixed(1)}%</span>이며,</p>
              <p style={summaryTextStyle}>이탈률 (Drop-off Rate)은 <span style={summaryValueStyle}>{summaryMetrics.dropoffRate.toFixed(1)}%</span> 에요.</p>
              <div style={summaryGroupGapStyle} />
              <p style={summaryTextStyle}>전환율 (Conversion Rate)은 <span style={summaryValueStyle}>{summaryMetrics.conversionRate.toFixed(1)}%</span>이고,</p>
              <p style={summaryTextStyle}>고객 만족도 (NPS)는 <span style={summaryValueStyle}>{summaryMetrics.nps}</span>점이에요.</p>
              <div style={summaryGroupGapStyle} />
              <p style={{ ...summaryTextStyle, marginBottom: 0 }}>이를 기반 업무 생산성은 약 <span style={summaryValueStyle}>{summaryMetrics.productivityGain.toFixed(1)}%</span> 향상될 수 있어요.</p>
            </div>
          </div>
        </div>

        <div style={cardStyle}>
          <h3 style={cardTitleStyle}>모델 × 샘플 결과</h3>
          <div style={tableWrapStyle}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>모델</th>
                  <th style={thStyle}>샘플</th>
                  <th style={thStyle}>입력</th>
                  <th style={thStyle}>출력 (Output)</th>
                  <th style={thStyle}>수정 비율 (Edit Rate)</th>
                  <th style={thStyle}>평균 컨피던스 (Confidence Score)</th>
                  <th style={thStyle}>오류율 (Error Rate)</th>
                  <th style={thStyle}>평균 응답 시간 (Average Latency)</th>
                  <th style={thStyle}>요청당 비용 (Cost per Request)</th>
                  <th style={thStyle}>정책 통과율 (Policy Pass Rate)</th>
                  <th style={thStyle}>정책 위반율 (Policy Violation Rate)</th>
                  <th style={thStyle}>전체 재현율 (Recall)</th>
                  <th style={thStyle}>전체 정밀도 (Precision)</th>
                  <th style={thStyle}>전체 F1 점수 (F1 Score)</th>
                </tr>
              </thead>
              <tbody>
                {runRows.map((row) => {
                  const model = modelMap.get(row.modelId);
                  const sample = sampleMap.get(row.sampleId);
                  return (
                    <tr key={row.key}>
                      <td style={tdStyle}>{model?.name ?? row.modelId}</td>
                      <td style={tdStyle}>{row.sampleId}</td>
                      <td style={tdStyle}>{sample?.input || "-"}</td>
                      <td style={tdStyle}>
                        <input value={row.observedOutput} onChange={(e) => updateRunRow(row.key, "observedOutput", e.target.value)} style={cellInputStyle} />
                      </td>
                      <td style={tdStyle}>
                        <input value={row.editRate} onChange={(e) => updateRunRow(row.key, "editRate", e.target.value)} style={cellInputStyle} />
                      </td>
                      <td style={tdStyle}>
                        <input value={row.confidenceScore} onChange={(e) => updateRunRow(row.key, "confidenceScore", e.target.value)} style={cellInputStyle} />
                      </td>
                      <td style={tdStyle}>
                        <input value={row.errorRate} onChange={(e) => updateRunRow(row.key, "errorRate", e.target.value)} style={cellInputStyle} />
                      </td>
                      <td style={tdStyle}>
                        <input value={row.averageLatency} onChange={(e) => updateRunRow(row.key, "averageLatency", e.target.value)} style={cellInputStyle} />
                      </td>
                      <td style={tdStyle}>
                        <input value={row.costPerRequest} onChange={(e) => updateRunRow(row.key, "costPerRequest", e.target.value)} style={cellInputStyle} />
                      </td>
                      <td style={tdStyle}>
                        <input value={row.policyPassRate} onChange={(e) => updateRunRow(row.key, "policyPassRate", e.target.value)} style={cellInputStyle} />
                      </td>
                      <td style={tdStyle}>
                        <input
                          value={row.policyViolationRate}
                          onChange={(e) => updateRunRow(row.key, "policyViolationRate", e.target.value)}
                          style={cellInputStyle}
                        />
                      </td>
                      <td style={tdStyle}>
                        <input value={row.recall} onChange={(e) => updateRunRow(row.key, "recall", e.target.value)} style={cellInputStyle} />
                      </td>
                      <td style={tdStyle}>
                        <input value={row.precision} onChange={(e) => updateRunRow(row.key, "precision", e.target.value)} style={cellInputStyle} />
                      </td>
                      <td style={tdStyle}>
                        <input value={row.f1Score} onChange={(e) => updateRunRow(row.key, "f1Score", e.target.value)} style={cellInputStyle} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div style={cardStyle}>
          <h3 style={cardTitleStyle}>의사결정 참고 테이블</h3>
          <div style={viewTabsStyle}>
            {VIEW_TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setViewTab(tab.key)}
                style={{ ...viewTabButtonStyle, ...(viewTab === tab.key ? viewTabButtonActiveStyle : {}) }}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div style={{ ...subtleStyle, marginTop: 8, marginBottom: 2 }}>{decisionReference.title}</div>
          <div style={tableWrapStyle}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  {decisionReference.headers.map((header) => (
                    <th key={header} style={thStyle}>
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {decisionReference.rows.map((columns, idx) => (
                  <tr key={`decision-row-${idx}`}>
                    {columns.map((value, colIdx) => (
                      <td key={`decision-cell-${idx}-${colIdx}`} style={tdStyle}>
                        {value}
                      </td>
                    ))}
                  </tr>
                ))}
                {decisionReference.rows.length === 0 && (
                  <tr>
                    <td style={tdStyle} colSpan={decisionReference.headers.length}>
                      모델을 선택하면 Core10 비교가 표시됩니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div style={cardStyle}>
          <h3 style={cardTitleStyle}>Go / Stop 결정</h3>
          <div style={{ display: "grid", gap: 8 }}>
            {core10ByModel.map((row) => (
              <div key={`decision-${row.modelId}`} style={decisionItemStyle}>
                <div style={{ fontWeight: 800 }}>{row.modelName}</div>
                <div
                  style={{
                    fontWeight: 800,
                    color: row.decision.status === "GO" ? "#166534" : row.decision.status === "CONDITIONAL" ? "#92400e" : "#991b1b",
                  }}
                >
                  {row.decision.status}
                </div>
                <div style={{ color: "#6b7280", fontSize: 12 }}>
                  {row.decision.failures.length === 0 ? "기준 충족" : row.decision.failures.join(" / ")}
                </div>
              </div>
            ))}
          </div>
        </div>

        {message && <p style={{ ...subtleStyle, marginTop: 10 }}>{message}</p>}
      </section>

      <div className="pane-resizer" onMouseDown={() => setIsResizing(true)} title="드래그해서 오른쪽 패널 크기 조절" style={resizerStyle} />

      <aside className="right-pane" style={{ ...sidePanelStyle, width: rightPanelWidth }}>
        <h2 style={{ margin: 0, fontSize: 16 }}>우측 패널</h2>
        <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
          <button
            type="button"
            onClick={() => setRightPanelTab("preview")}
            style={{
              ...topPanelTabStyle,
              background: rightPanelTab === "preview" ? "#111827" : "#f3f4f6",
              color: rightPanelTab === "preview" ? "#fff" : "#374151",
              borderColor: rightPanelTab === "preview" ? "#111827" : "#d1d5db",
            }}
          >
            Preview
          </button>
          <button
            type="button"
            onClick={() => setRightPanelTab("impact")}
            style={{
              ...topPanelTabStyle,
              background: rightPanelTab === "impact" ? "#111827" : "#f3f4f6",
              color: rightPanelTab === "impact" ? "#fff" : "#374151",
              borderColor: rightPanelTab === "impact" ? "#111827" : "#d1d5db",
            }}
          >
            영향도맵
          </button>
        </div>

        {rightPanelTab === "preview" && (
          <>
            <p style={{ ...subtleStyle, marginTop: 8 }}>
              {step3Snapshot ? "STEP3 저장 시점 기준 프리뷰입니다." : "STEP3 저장 스냅샷이 없어 현재 저장본 기준으로 표시합니다."}
            </p>
            {locked && <div style={lockStyle}>🔒 STEP1~3 완료 후 접근할 수 있습니다.</div>}
            {!locked && step1Data && step2Data && (
              <Step1PreviewPanel
                data={step1Data}
                step2Data={step2Data}
                step3PolicyMetrics={step3PolicyMetrics}
                step3PolicyTitle="Step 3 운영 정책"
                step3PolicyPlacement="after_risk"
                step2SectionOrder={["strategy", "execution", "flow", "policy_metrics", "risk"]}
                mode="step2"
                flowSectionTitle="STEP 1 & 2 처리 플로우"
                executionSectionTitle="Step 1 & 3 실행 방식"
                showExecutionSection
                executionDetailLevel="full"
                showFlowSourceTags
                flowSourceTagTone="neutral"
              />
            )}
          </>
        )}

        {rightPanelTab === "impact" && (
          <div style={{ marginTop: 10, border: "1px solid #e5e7eb", borderRadius: 8, padding: 12, background: "#f8fafc" }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>영향도맵</div>
            <p style={{ ...subtleStyle, marginTop: 6 }}>PoC 리뷰 영향도맵은 다음 단계에서 확장됩니다.</p>
          </div>
        )}
      </aside>

      <style jsx>{`
        .two-pane {
          display: flex;
          align-items: flex-start;
        }
        .pane-resizer {
          width: 10px;
          cursor: col-resize;
          align-self: stretch;
          margin: 0 2px;
          border-radius: 6px;
        }
        .pane-resizer:hover {
          background: #e5e7eb;
        }
        @media (max-width: 1180px) {
          .two-pane {
            display: grid !important;
            grid-template-columns: 1fr !important;
          }
          .pane-resizer {
            display: none;
          }
          .right-pane {
            width: auto !important;
          }
        }
        @media (max-width: 1440px) {
          .step5-left-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}

const panelStyle: CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 12,
  background: "#fff",
  padding: 18,
};

const twoPaneStyle: CSSProperties = {
  display: "flex",
  gap: 16,
  alignItems: "flex-start",
};

const mainPanelStyle: CSSProperties = {
  ...panelStyle,
  flex: 1,
  minWidth: 0,
};

const sidePanelStyle: CSSProperties = {
  ...panelStyle,
  flexShrink: 0,
};

const resizerStyle: CSSProperties = {
  background: "transparent",
};

const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: 24,
  fontWeight: 800,
  color: "#111827",
};

const subtleStyle: CSSProperties = {
  marginTop: 8,
  marginBottom: 0,
  color: "#6b7280",
  fontSize: 13,
};

const lockStyle: CSSProperties = {
  marginTop: 10,
  border: "1px solid #fecaca",
  borderRadius: 8,
  padding: "10px 12px",
  background: "#fff1f2",
  fontWeight: 700,
  color: "#9f1239",
};

const topPanelTabStyle: CSSProperties = {
  border: "1px solid #d1d5db",
  borderRadius: 10,
  padding: "6px 12px",
  fontSize: 13,
  fontWeight: 700,
  background: "#f3f4f6",
  color: "#374151",
  cursor: "pointer",
};

const viewTabsStyle: CSSProperties = {
  marginTop: 14,
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  paddingBottom: 2,
};

const viewTabButtonStyle: CSSProperties = {
  border: "1px solid #dbe2ea",
  borderRadius: 999,
  padding: "6px 12px",
  background: "#f8fafc",
  color: "#475569",
  fontWeight: 700,
  fontSize: 12,
  cursor: "pointer",
};

const viewTabButtonActiveStyle: CSSProperties = {
  borderColor: "#93c5fd",
  background: "#eff6ff",
  color: "#1e40af",
  boxShadow: "inset 0 0 0 1px #bfdbfe",
};

const leftGridStyle: CSSProperties = {
  marginTop: 12,
  display: "grid",
  gridTemplateColumns: "1fr",
  gap: 12,
  alignItems: "start",
};

const cardStyle: CSSProperties = {
  marginTop: 10,
  border: "1px solid #e5e7eb",
  borderRadius: 10,
  background: "#ffffff",
  padding: 12,
  boxShadow: "0 1px 2px rgba(15, 23, 42, 0.06)",
};

const cardTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: 15,
  fontWeight: 800,
  color: "#111827",
};

const cardHeadStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 10,
};

const cardSubStyle: CSSProperties = {
  marginTop: 4,
  fontSize: 11,
  color: "#64748b",
  fontWeight: 600,
};

const miniButtonStyle: CSSProperties = {
  border: "1px solid #d1d5db",
  borderRadius: 8,
  padding: "6px 9px",
  background: "#fff",
  fontSize: 11,
  fontWeight: 700,
  color: "#374151",
  cursor: "pointer",
};

const topSearchWrapStyle: CSSProperties = {
  marginTop: 10,
};

const topSearchInputStyle: CSSProperties = {
  width: "100%",
  border: "1px solid #dbe2ea",
  borderRadius: 999,
  padding: "10px 14px",
  fontSize: 14,
  background: "#f8fafc",
};

const topFilterGridStyle: CSSProperties = {
  marginTop: 10,
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: 8,
};

const topFilterItemStyle: CSSProperties = {
  display: "grid",
  gap: 4,
};

const topFilterLabelStyle: CSSProperties = {
  fontSize: 11,
  color: "#64748b",
  fontWeight: 700,
};

const rangeWrapStyle: CSSProperties = {
  border: "1px solid #e2e8f0",
  borderRadius: 8,
  background: "#fff",
  padding: "6px 8px",
  display: "grid",
  gap: 4,
};

const rangeLabelStyle: CSSProperties = {
  fontSize: 11,
  color: "#334155",
  fontWeight: 700,
};

const selectStyle: CSSProperties = {
  width: "100%",
  border: "1px solid #e2e8f0",
  borderRadius: 8,
  padding: "8px 10px",
  fontSize: 13,
  background: "#fff",
};

const modelListStyle: CSSProperties = {
  marginTop: 10,
  display: "grid",
  gap: 6,
  maxHeight: 170,
  overflow: "auto",
  paddingRight: 4,
};

const modelItemStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  fontSize: 13,
  color: "#1f2937",
  border: "1px solid #e5e7eb",
  borderRadius: 8,
  padding: "7px 8px",
  background: "#f9fafb",
};

const modelMetaStyle: CSSProperties = {
  color: "#64748b",
  fontWeight: 600,
  fontSize: 12,
};

const emptyStateStyle: CSSProperties = {
  border: "1px dashed #cbd5e1",
  borderRadius: 8,
  padding: "10px 12px",
  color: "#64748b",
  fontSize: 12,
  background: "#f8fafc",
};

const errorStateStyle: CSSProperties = {
  border: "1px solid #fecaca",
  borderRadius: 8,
  padding: "10px 12px",
  color: "#b91c1c",
  fontSize: 12,
  background: "#fef2f2",
  fontWeight: 700,
};

const selectedCardWrapStyle: CSSProperties = {
  marginTop: 10,
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
};

const selectedInfoCardStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  border: "1px solid #dbe2ea",
  borderRadius: 10,
  background: "#ffffff",
  minWidth: 240,
  maxWidth: 360,
  padding: "8px 10px",
  gap: 6,
};

const selectedInfoCardActiveStyle: CSSProperties = {
  borderColor: "#93c5fd",
  boxShadow: "inset 0 0 0 1px #bfdbfe",
  background: "#f8fbff",
};

const selectedCardMainButtonStyle: CSSProperties = {
  border: "none",
  background: "transparent",
  textAlign: "left",
  cursor: "pointer",
  padding: 0,
  flex: 1,
};

const selectedCardRemoveStyle: CSSProperties = {
  border: "none",
  borderLeft: "1px solid #e5e7eb",
  width: 34,
  background: "#fff",
  color: "#64748b",
  fontSize: 18,
  lineHeight: 1,
  cursor: "pointer",
};

const modelDetailButtonStyle: CSSProperties = {
  border: "1px solid #d1d5db",
  borderRadius: 6,
  background: "#fff",
  color: "#334155",
  fontSize: 11,
  fontWeight: 700,
  padding: "4px 7px",
  cursor: "pointer",
};

const modelDetailPanelStyle: CSSProperties = {
  marginTop: 10,
  border: "1px solid #e2e8f0",
  borderRadius: 8,
  padding: "10px 10px",
  background: "#f8fafc",
};

const modelDetailTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: 14,
  fontWeight: 800,
  color: "#111827",
};

const modelDetailGridStyle: CSSProperties = {
  marginTop: 8,
  display: "grid",
  gap: 4,
};

const modelDetailRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "72px 1fr",
  gap: 8,
  alignItems: "center",
};

const modelDetailKeyStyle: CSSProperties = {
  fontSize: 11,
  color: "#64748b",
  fontWeight: 700,
};

const modelDetailValStyle: CSSProperties = {
  fontSize: 12,
  color: "#0f172a",
  fontWeight: 700,
};

const tableWrapStyle: CSSProperties = {
  marginTop: 10,
  overflowX: "auto",
  background: "#fff",
  border: "1px solid #e2e8f0",
  borderRadius: 8,
};

const tableStyle: CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  minWidth: 680,
};

const thStyle: CSSProperties = {
  borderBottom: "1px solid #e5e7eb",
  borderRight: "1px solid #e5e7eb",
  textAlign: "left",
  fontSize: 12,
  color: "#334155",
  background: "#f8fafc",
  padding: "8px 10px",
  whiteSpace: "nowrap",
};

const tdStyle: CSSProperties = {
  borderBottom: "1px solid #e5e7eb",
  borderRight: "1px solid #e5e7eb",
  fontSize: 12,
  color: "#111827",
  padding: "8px 10px",
  verticalAlign: "top",
  background: "#fff",
};

const cellInputStyle: CSSProperties = {
  width: "100%",
  border: "1px solid #e5e7eb",
  borderRadius: 6,
  padding: "6px 8px",
  fontSize: 12,
  background: "#fff",
};

const actionBarStyle: CSSProperties = {
  marginTop: 10,
  border: "1px solid #e2e8f0",
  borderRadius: 10,
  background: "#f8fafc",
  padding: 10,
  display: "flex",
  gap: 8,
  alignItems: "center",
  flexWrap: "wrap",
};

const buttonStyle: CSSProperties = {
  border: "1px solid #d1d5db",
  borderRadius: 8,
  padding: "8px 12px",
  background: "#fff",
  fontWeight: 700,
  cursor: "pointer",
};

const primaryButtonStyle: CSSProperties = {
  ...buttonStyle,
  borderColor: "#1d4ed8",
  background: "#1d4ed8",
  color: "#fff",
};

const ghostButtonStyle: CSSProperties = {
  ...buttonStyle,
  marginTop: 8,
  fontSize: 12,
  padding: "6px 10px",
};

const decisionItemStyle: CSSProperties = {
  border: "1px solid #e2e8f0",
  borderRadius: 8,
  padding: "8px 10px",
  background: "#f8fafc",
  display: "grid",
  gap: 4,
};

const summaryCardsGridStyle: CSSProperties = {
  marginTop: 10,
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
  gap: 10,
};

const summaryCardStyle: CSSProperties = {
  border: "1px solid #e2e8f0",
  borderRadius: 12,
  background: "#fff",
  padding: "12px 12px",
  boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)",
};

const summaryCardHeadStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  marginBottom: 8,
};

const summaryIconStyle: CSSProperties = {
  width: 20,
  height: 20,
  borderRadius: 999,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  fontWeight: 800,
  fontSize: 11,
};

const summaryCardTitleStyle: CSSProperties = {
  fontSize: 14,
  fontWeight: 800,
  color: "#111827",
};

const summaryTextStyle: CSSProperties = {
  margin: "0 0 8px 0",
  fontSize: 12,
  lineHeight: 1.45,
  color: "#334155",
};

const summaryGroupGapStyle: CSSProperties = {
  height: 6,
};

const summaryValueStyle: CSSProperties = {
  color: "#1d4ed8",
  fontWeight: 800,
};

const heroStyle: CSSProperties = {
  marginBottom: 4,
};

const kpiCardsStyle: CSSProperties = {
  marginTop: 10,
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: 8,
};

const kpiCardStyle: CSSProperties = {
  border: "1px solid #e2e8f0",
  borderRadius: 10,
  background: "#ffffff",
  padding: "8px 10px",
};

const kpiLabelStyle: CSSProperties = {
  fontSize: 11,
  color: "#64748b",
  fontWeight: 700,
};

const kpiValueStyle: CSSProperties = {
  marginTop: 4,
  fontSize: 18,
  fontWeight: 800,
  color: "#0f172a",
};
