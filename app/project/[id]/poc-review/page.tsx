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
  savedId?: string;
  input: string;
  description: string;
};
type CsvImportDraft = {
  headers: string[];
  rows: string[][];
};
type SampleColIndex = 0 | 1;
type SampleCell = { row: number; col: SampleColIndex };
type RunColIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
type RunCell = { row: number; col: RunColIndex };

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

function parseClipboardGrid(text: string): string[][] {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => line.split("\t"));
}

function isMappingHeaderPaste(grid: string[][]) {
  if (grid.length < 2 || grid[0].length < 2) return false;
  const keyword = /(input|입력|설명|description|sample|샘플|id|model|모델|output|출력|edit|confidence|error|latency|cost|policy|recall|precision|f1|토큰|비용|응답|정책)/i;
  return grid[0].some((cell) => keyword.test(cell));
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let current = "";
  let row: string[] = [];
  let inQuote = false;
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  for (let i = 0; i < normalized.length; i += 1) {
    const ch = normalized[i];
    const next = normalized[i + 1];
    if (ch === "\"") {
      if (inQuote && next === "\"") {
        current += "\"";
        i += 1;
      } else {
        inQuote = !inQuote;
      }
      continue;
    }
    if (ch === "," && !inQuote) {
      row.push(current.trim());
      current = "";
      continue;
    }
    if (ch === "\n" && !inQuote) {
      row.push(current.trim());
      rows.push(row);
      row = [];
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.length > 0 || row.length > 0) {
    row.push(current.trim());
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell !== ""));
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
  const [modelCatalog] = useState<ModelOption[]>(MOCK_MODEL_OPTIONS);
  const [selectedModelIds] = useState<string[]>(() => MOCK_MODEL_OPTIONS.map((model) => model.id));
  const [samples, setSamples] = useState<SampleInput[]>([
    { id: "tmp-1", input: "질문 A", description: "기본 검증 샘플" },
    { id: "tmp-2", input: "질문 B", description: "정책 검증 샘플" },
  ]);
  const [runRows, setRunRows] = useState<PocRunRow[]>([]);
  const [message, setMessage] = useState("");
  const [activeSampleCell, setActiveSampleCell] = useState<SampleCell | null>(null);
  const [sampleSelectionRange, setSampleSelectionRange] = useState<{ start: SampleCell; end: SampleCell } | null>(null);
  const [isSelectingSampleCells, setIsSelectingSampleCells] = useState(false);
  const [activeRunCell, setActiveRunCell] = useState<RunCell | null>(null);
  const [runSelectionRange, setRunSelectionRange] = useState<{ start: RunCell; end: RunCell } | null>(null);
  const [isSelectingRunCells, setIsSelectingRunCells] = useState(false);
  const csvInputRef = useRef<HTMLInputElement | null>(null);
  const [csvImportDraft, setCsvImportDraft] = useState<CsvImportDraft | null>(null);
  const [csvInputHeader, setCsvInputHeader] = useState("");
  const [csvDescriptionHeader, setCsvDescriptionHeader] = useState("");

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

  useEffect(() => {
    if (!isSelectingSampleCells) return;
    function onUp() {
      setIsSelectingSampleCells(false);
    }
    window.addEventListener("mouseup", onUp);
    return () => window.removeEventListener("mouseup", onUp);
  }, [isSelectingSampleCells]);

  useEffect(() => {
    if (!isSelectingRunCells) return;
    function onUp() {
      setIsSelectingRunCells(false);
    }
    window.addEventListener("mouseup", onUp);
    return () => window.removeEventListener("mouseup", onUp);
  }, [isSelectingRunCells]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
    merged.forEach((sample) => {
      const key = `${sample.input}::${sample.description}`;
      if (!dedup.has(key)) {
        dedup.set(key, { id: `tmp-${dedup.size + 1}`, input: sample.input, description: sample.description });
      }
    });
    const nextSamples = Array.from(dedup.values());
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (nextSamples.length > 0) setSamples(nextSamples);
  }, [selectedModelIds]);

  const sampleMap = useMemo(() => new Map(samples.map((sample) => [sample.id, sample])), [samples]);
  const sampleDisplayMap = useMemo(() => new Map(samples.map((sample, idx) => [sample.id, sample.savedId || `임시-${idx + 1}`])), [samples]);
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
            sampleDisplayMap.get(row.sampleId) ?? row.sampleId,
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
            sampleDisplayMap.get(row.sampleId) ?? row.sampleId,
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
  }, [core10ByModel, modelMap, runRows, sampleDisplayMap, sampleMap, viewTab]);

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
    };
  }, [runRows]);

  function updateSample(index: number, key: keyof SampleInput, value: string) {
    setSamples((prev) => prev.map((sample, i) => (i === index ? { ...sample, [key]: value } : sample)));
  }

  function isActiveSampleCell(row: number, col: SampleColIndex) {
    return activeSampleCell?.row === row && activeSampleCell?.col === col;
  }

  function startSampleCellSelection(row: number, col: SampleColIndex) {
    const cell = { row, col };
    setActiveSampleCell(cell);
    setSampleSelectionRange({ start: cell, end: cell });
    setIsSelectingSampleCells(true);
  }

  function extendSampleCellSelection(row: number, col: SampleColIndex) {
    if (!isSelectingSampleCells || !sampleSelectionRange) return;
    setSampleSelectionRange((prev) => (prev ? { start: prev.start, end: { row, col } } : prev));
  }

  function isSampleCellInSelection(row: number, col: SampleColIndex) {
    if (!sampleSelectionRange) return false;
    const rowMin = Math.min(sampleSelectionRange.start.row, sampleSelectionRange.end.row);
    const rowMax = Math.max(sampleSelectionRange.start.row, sampleSelectionRange.end.row);
    const colMin = Math.min(sampleSelectionRange.start.col, sampleSelectionRange.end.col);
    const colMax = Math.max(sampleSelectionRange.start.col, sampleSelectionRange.end.col);
    return row >= rowMin && row <= rowMax && col >= colMin && col <= colMax;
  }

  function clearSelectedSampleCells() {
    if (!sampleSelectionRange) return;
    const rowMin = Math.min(sampleSelectionRange.start.row, sampleSelectionRange.end.row);
    const rowMax = Math.max(sampleSelectionRange.start.row, sampleSelectionRange.end.row);
    const colMin = Math.min(sampleSelectionRange.start.col, sampleSelectionRange.end.col);
    const colMax = Math.max(sampleSelectionRange.start.col, sampleSelectionRange.end.col);
    setSamples((prev) =>
      prev.map((sample, rowIndex) => {
        if (rowIndex < rowMin || rowIndex > rowMax) return sample;
        const next = { ...sample };
        for (let col = colMin; col <= colMax; col += 1) {
          if (col === 0) next.input = "";
          if (col === 1) next.description = "";
        }
        return next;
      })
    );
  }

  function handleSampleSheetKeyDownCapture(e: React.KeyboardEvent<HTMLDivElement>) {
    if (!sampleSelectionRange) return;
    if (e.key !== "Backspace" && e.key !== "Delete") return;
    e.preventDefault();
    clearSelectedSampleCells();
  }

  function handleSampleSheetPaste(startRow: number, startCol: SampleColIndex, e: React.ClipboardEvent<HTMLInputElement>) {
    const text = e.clipboardData.getData("text/plain");
    const grid = parseClipboardGrid(text);
    if (grid.length === 0) return;
    if (startRow === 0 && startCol === 0 && isMappingHeaderPaste(grid)) {
      e.preventDefault();
      const [headers, ...rows] = grid;
      const inputHeader = guessHeader(headers, [/input/, /질문/, /요청/, /prompt/, /text/]);
      const descriptionHeader = guessHeader(headers, [/desc/, /설명/, /note/, /context/, /label/]);
      setCsvImportDraft({ headers, rows });
      setCsvInputHeader(inputHeader);
      setCsvDescriptionHeader(descriptionHeader);
      setMessage(`표 붙여넣기 인식: ${rows.length}개 행을 불러왔어요. 컬럼 매핑 후 적용하세요.`);
      return;
    }
    e.preventDefault();
    const colKeys: Array<keyof SampleInput> = ["input", "description"];
    setSamples((prev) => {
      const next = [...prev];
      const requiredRows = startRow + grid.length;
      while (next.length < requiredRows) {
        next.push({ id: `S-${next.length + 1}`, input: "", description: "" });
      }
      for (let r = 0; r < grid.length; r += 1) {
        const rowIndex = startRow + r;
        const row = { ...next[rowIndex] };
        for (let c = 0; c < grid[r].length; c += 1) {
          const colIndex = startCol + c;
          if (colIndex > 1) break;
          row[colKeys[colIndex]] = grid[r][c];
        }
        next[rowIndex] = row;
      }
      return next;
    });
  }

  function openCsvUpload() {
    csvInputRef.current?.click();
  }

  function guessHeader(headers: string[], patterns: RegExp[]) {
    const normalized = headers.map((header) => header.trim().toLowerCase());
    const idx = normalized.findIndex((value) => patterns.some((re) => re.test(value)));
    return idx >= 0 ? headers[idx] : headers[0] || "";
  }

  function handleCsvUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const raw = String(reader.result ?? "");
      const parsed = parseCsv(raw);
      if (parsed.length < 2) {
        setMessage("CSV 데이터가 부족합니다. 헤더 + 1개 이상 데이터가 필요해요.");
        return;
      }
      const [headers, ...rows] = parsed;
      const inputHeader = guessHeader(headers, [/input/, /질문/, /요청/, /prompt/, /text/]);
      const descriptionHeader = guessHeader(headers, [/desc/, /설명/, /note/, /context/, /label/]);
      setCsvImportDraft({ headers, rows });
      setCsvInputHeader(inputHeader);
      setCsvDescriptionHeader(descriptionHeader);
      setMessage(`CSV 업로드 완료: ${rows.length}개 행을 불러왔어요. 컬럼 매핑 후 적용하세요.`);
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  function applyCsvMapping() {
    if (!csvImportDraft) return;
    const inputIndex = csvImportDraft.headers.indexOf(csvInputHeader);
    const descriptionIndex = csvImportDraft.headers.indexOf(csvDescriptionHeader);
    if (inputIndex < 0 || descriptionIndex < 0) {
      setMessage("입력/설명 컬럼 매핑을 확인해 주세요.");
      return;
    }
    const mapped = csvImportDraft.rows
      .map((row, idx) => ({
        id: `tmp-${idx + 1}`,
        input: row[inputIndex] ?? "",
        description: row[descriptionIndex] ?? "",
      }))
      .filter((row) => row.input.trim() || row.description.trim());
    if (mapped.length === 0) {
      setMessage("매핑된 데이터가 비어 있어요. 컬럼 선택을 바꿔보세요.");
      return;
    }
    setSamples(mapped);
    setActiveSampleCell(null);
    setSampleSelectionRange(null);
    setCsvImportDraft(null);
    setMessage(`CSV 매핑 적용 완료: 샘플 ${mapped.length}개로 업데이트했어요.`);
  }

  function cancelCsvMapping() {
    setCsvImportDraft(null);
    setCsvInputHeader("");
    setCsvDescriptionHeader("");
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

  const runColKeys: Array<keyof PocRunRow> = [
    "observedOutput",
    "editRate",
    "confidenceScore",
    "errorRate",
    "averageLatency",
    "costPerRequest",
    "policyPassRate",
    "policyViolationRate",
    "recall",
    "precision",
    "f1Score",
  ];

  function isRunNumericField(field: keyof PocRunRow) {
    return field !== "observedOutput";
  }

  function isActiveRunCell(row: number, col: RunColIndex) {
    return activeRunCell?.row === row && activeRunCell?.col === col;
  }

  function startRunCellSelection(row: number, col: RunColIndex) {
    const cell = { row, col };
    setActiveRunCell(cell);
    setRunSelectionRange({ start: cell, end: cell });
    setIsSelectingRunCells(true);
  }

  function extendRunCellSelection(row: number, col: RunColIndex) {
    if (!isSelectingRunCells || !runSelectionRange) return;
    setRunSelectionRange((prev) => (prev ? { start: prev.start, end: { row, col } } : prev));
  }

  function isRunCellInSelection(row: number, col: RunColIndex) {
    if (!runSelectionRange) return false;
    const rowMin = Math.min(runSelectionRange.start.row, runSelectionRange.end.row);
    const rowMax = Math.max(runSelectionRange.start.row, runSelectionRange.end.row);
    const colMin = Math.min(runSelectionRange.start.col, runSelectionRange.end.col);
    const colMax = Math.max(runSelectionRange.start.col, runSelectionRange.end.col);
    return row >= rowMin && row <= rowMax && col >= colMin && col <= colMax;
  }

  function clearSelectedRunCells() {
    if (!runSelectionRange) return;
    const rowMin = Math.min(runSelectionRange.start.row, runSelectionRange.end.row);
    const rowMax = Math.max(runSelectionRange.start.row, runSelectionRange.end.row);
    const colMin = Math.min(runSelectionRange.start.col, runSelectionRange.end.col);
    const colMax = Math.max(runSelectionRange.start.col, runSelectionRange.end.col);
    setRunRows((prev) =>
      prev.map((row, rowIndex) => {
        if (rowIndex < rowMin || rowIndex > rowMax) return row;
        const next = { ...row };
        for (let col = colMin; col <= colMax; col += 1) {
          const field = runColKeys[col as RunColIndex];
          if (isRunNumericField(field)) {
            next[field] = 0 as never;
          } else {
            next[field] = "" as never;
          }
        }
        return next;
      })
    );
  }

  function handleRunSheetKeyDownCapture(e: React.KeyboardEvent<HTMLDivElement>) {
    if (!runSelectionRange) return;
    if (e.key !== "Backspace" && e.key !== "Delete") return;
    e.preventDefault();
    clearSelectedRunCells();
  }

  function handleRunSheetPaste(startRow: number, startCol: RunColIndex, e: React.ClipboardEvent<HTMLInputElement>) {
    const text = e.clipboardData.getData("text/plain");
    const grid = parseClipboardGrid(text);
    if (grid.length === 0) return;
    e.preventDefault();
    setRunRows((prev) => {
      const next = [...prev];
      for (let r = 0; r < grid.length; r += 1) {
        const rowIndex = startRow + r;
        if (rowIndex >= next.length) break;
        const row = { ...next[rowIndex] };
        for (let c = 0; c < grid[r].length; c += 1) {
          const colIndex = startCol + c;
          if (colIndex > 10) break;
          const field = runColKeys[colIndex as RunColIndex];
          const raw = grid[r][c];
          if (isRunNumericField(field)) {
            const numeric = Number(raw);
            row[field] = (Number.isFinite(numeric) ? numeric : 0) as never;
          } else {
            row[field] = raw as never;
          }
        }
        next[rowIndex] = row;
      }
      return next;
    });
  }

  function handleSavePoc() {
    setSamples((prev) => prev.map((sample, idx) => ({ ...sample, savedId: `S-${idx + 1}` })));
    setMessage(`결과 저장 완료: 모델 ${selectedModelIds.length}개 / 샘플 ${samples.length}개`);
  }

  return (
    <div ref={twoPaneRef} className="two-pane" style={twoPaneStyle}>
      <section style={mainPanelStyle}>
        <div style={heroStyle}>
          <h1 style={titleStyle}>STEP 5 PoC 리뷰</h1>
          <p style={{ ...subtleStyle, marginTop: 6 }}>샘플셋 입력 → 예측 → 실측 입력 → Core10 비교 → Go/Stop 결정</p>
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

        <div className="step5-left-grid" style={leftGridStyle}>
          <div style={{ ...cardStyle, minWidth: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <h3 style={{ ...cardTitleStyle, margin: 0 }}>샘플셋 입력</h3>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input ref={csvInputRef} type="file" accept=".csv,text/csv" style={{ display: "none" }} onChange={handleCsvUpload} />
                <button type="button" onClick={openCsvUpload} style={ghostButtonStyle}>
                  CSV 업로드
                </button>
                <button type="button" onClick={handleSavePoc} style={buttonStyle}>
                  결과 저장
                </button>
              </div>
            </div>
            {csvImportDraft && (
              <div style={mappingBoxStyle}>
                <div style={mappingTitleStyle}>CSV 컬럼 매핑</div>
                <div style={mappingRowStyle}>
                  <label style={mappingLabelStyle}>
                    입력 (Input)
                    <select value={csvInputHeader} onChange={(e) => setCsvInputHeader(e.target.value)} style={mappingSelectStyle}>
                      {csvImportDraft.headers.map((header) => (
                        <option key={`input-${header}`} value={header}>
                          {header}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label style={mappingLabelStyle}>
                    설명
                    <select value={csvDescriptionHeader} onChange={(e) => setCsvDescriptionHeader(e.target.value)} style={mappingSelectStyle}>
                      {csvImportDraft.headers.map((header) => (
                        <option key={`desc-${header}`} value={header}>
                          {header}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div style={mappingActionsStyle}>
                    <button type="button" onClick={applyCsvMapping} style={buttonStyle}>
                      매핑 적용
                    </button>
                    <button type="button" onClick={cancelCsvMapping} style={ghostButtonStyle}>
                      취소
                    </button>
                  </div>
                </div>
              </div>
            )}
            <div style={tableWrapStyle} onKeyDownCapture={handleSampleSheetKeyDownCapture}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>입력 (Input)</th>
                    <th style={thStyle}>설명</th>
                  </tr>
                </thead>
                <tbody>
                  {samples.map((sample, index) => (
                    <tr key={`sample-${index}`}>
                      <td
                        style={{ ...tdStyle, ...(isSampleCellInSelection(index, 0) ? sheetCellSelectedStyle : {}), ...(isActiveSampleCell(index, 0) ? sheetCellActiveStyle : {}) }}
                        onMouseDown={() => startSampleCellSelection(index, 0)}
                        onMouseEnter={() => extendSampleCellSelection(index, 0)}
                      >
                        <input
                          value={sample.input}
                          onChange={(e) => updateSample(index, "input", e.target.value)}
                          onPaste={(e) => handleSampleSheetPaste(index, 0, e)}
                          onFocus={() => {
                            setActiveSampleCell({ row: index, col: 0 });
                            setSampleSelectionRange({ start: { row: index, col: 0 }, end: { row: index, col: 0 } });
                          }}
                          onMouseDown={() => startSampleCellSelection(index, 0)}
                          style={sheetCellInputStyle}
                        />
                      </td>
                      <td
                        style={{ ...tdStyle, ...(isSampleCellInSelection(index, 1) ? sheetCellSelectedStyle : {}), ...(isActiveSampleCell(index, 1) ? sheetCellActiveStyle : {}) }}
                        onMouseDown={() => startSampleCellSelection(index, 1)}
                        onMouseEnter={() => extendSampleCellSelection(index, 1)}
                      >
                        <input
                          value={sample.description}
                          onChange={(e) => updateSample(index, "description", e.target.value)}
                          onPaste={(e) => handleSampleSheetPaste(index, 1, e)}
                          onFocus={() => {
                            setActiveSampleCell({ row: index, col: 1 });
                            setSampleSelectionRange({ start: { row: index, col: 1 }, end: { row: index, col: 1 } });
                          }}
                          onMouseDown={() => startSampleCellSelection(index, 1)}
                          style={sheetCellInputStyle}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div style={cardStyle}>
          <h3 style={cardTitleStyle}>모델 × 샘플 결과</h3>
          <div style={tableWrapStyle} onKeyDownCapture={handleRunSheetKeyDownCapture}>
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
                {runRows.map((row, rowIndex) => {
                  const model = modelMap.get(row.modelId);
                  const sample = sampleMap.get(row.sampleId);
                  return (
                    <tr key={row.key}>
                      <td style={tdStyle}>{model?.name ?? row.modelId}</td>
                      <td style={tdStyle}>{sampleDisplayMap.get(row.sampleId) ?? row.sampleId}</td>
                      <td style={tdStyle}>{sample?.input || "-"}</td>
                      <td
                        style={{ ...tdStyle, ...(isRunCellInSelection(rowIndex, 0) ? sheetCellSelectedStyle : {}), ...(isActiveRunCell(rowIndex, 0) ? sheetCellActiveStyle : {}) }}
                        onMouseDown={() => startRunCellSelection(rowIndex, 0)}
                        onMouseEnter={() => extendRunCellSelection(rowIndex, 0)}
                      >
                        <input
                          value={row.observedOutput}
                          onChange={(e) => updateRunRow(row.key, "observedOutput", e.target.value)}
                          onPaste={(e) => handleRunSheetPaste(rowIndex, 0, e)}
                          onFocus={() => {
                            setActiveRunCell({ row: rowIndex, col: 0 });
                            setRunSelectionRange({ start: { row: rowIndex, col: 0 }, end: { row: rowIndex, col: 0 } });
                          }}
                          onMouseDown={() => startRunCellSelection(rowIndex, 0)}
                          style={sheetCellInputStyle}
                        />
                      </td>
                      <td
                        style={{ ...tdStyle, ...(isRunCellInSelection(rowIndex, 1) ? sheetCellSelectedStyle : {}), ...(isActiveRunCell(rowIndex, 1) ? sheetCellActiveStyle : {}) }}
                        onMouseDown={() => startRunCellSelection(rowIndex, 1)}
                        onMouseEnter={() => extendRunCellSelection(rowIndex, 1)}
                      >
                        <input
                          value={row.editRate}
                          onChange={(e) => updateRunRow(row.key, "editRate", e.target.value)}
                          onPaste={(e) => handleRunSheetPaste(rowIndex, 1, e)}
                          onFocus={() => {
                            setActiveRunCell({ row: rowIndex, col: 1 });
                            setRunSelectionRange({ start: { row: rowIndex, col: 1 }, end: { row: rowIndex, col: 1 } });
                          }}
                          onMouseDown={() => startRunCellSelection(rowIndex, 1)}
                          style={sheetCellInputStyle}
                        />
                      </td>
                      <td
                        style={{ ...tdStyle, ...(isRunCellInSelection(rowIndex, 2) ? sheetCellSelectedStyle : {}), ...(isActiveRunCell(rowIndex, 2) ? sheetCellActiveStyle : {}) }}
                        onMouseDown={() => startRunCellSelection(rowIndex, 2)}
                        onMouseEnter={() => extendRunCellSelection(rowIndex, 2)}
                      >
                        <input
                          value={row.confidenceScore}
                          onChange={(e) => updateRunRow(row.key, "confidenceScore", e.target.value)}
                          onPaste={(e) => handleRunSheetPaste(rowIndex, 2, e)}
                          onFocus={() => {
                            setActiveRunCell({ row: rowIndex, col: 2 });
                            setRunSelectionRange({ start: { row: rowIndex, col: 2 }, end: { row: rowIndex, col: 2 } });
                          }}
                          onMouseDown={() => startRunCellSelection(rowIndex, 2)}
                          style={sheetCellInputStyle}
                        />
                      </td>
                      <td
                        style={{ ...tdStyle, ...(isRunCellInSelection(rowIndex, 3) ? sheetCellSelectedStyle : {}), ...(isActiveRunCell(rowIndex, 3) ? sheetCellActiveStyle : {}) }}
                        onMouseDown={() => startRunCellSelection(rowIndex, 3)}
                        onMouseEnter={() => extendRunCellSelection(rowIndex, 3)}
                      >
                        <input
                          value={row.errorRate}
                          onChange={(e) => updateRunRow(row.key, "errorRate", e.target.value)}
                          onPaste={(e) => handleRunSheetPaste(rowIndex, 3, e)}
                          onFocus={() => {
                            setActiveRunCell({ row: rowIndex, col: 3 });
                            setRunSelectionRange({ start: { row: rowIndex, col: 3 }, end: { row: rowIndex, col: 3 } });
                          }}
                          onMouseDown={() => startRunCellSelection(rowIndex, 3)}
                          style={sheetCellInputStyle}
                        />
                      </td>
                      <td
                        style={{ ...tdStyle, ...(isRunCellInSelection(rowIndex, 4) ? sheetCellSelectedStyle : {}), ...(isActiveRunCell(rowIndex, 4) ? sheetCellActiveStyle : {}) }}
                        onMouseDown={() => startRunCellSelection(rowIndex, 4)}
                        onMouseEnter={() => extendRunCellSelection(rowIndex, 4)}
                      >
                        <input
                          value={row.averageLatency}
                          onChange={(e) => updateRunRow(row.key, "averageLatency", e.target.value)}
                          onPaste={(e) => handleRunSheetPaste(rowIndex, 4, e)}
                          onFocus={() => {
                            setActiveRunCell({ row: rowIndex, col: 4 });
                            setRunSelectionRange({ start: { row: rowIndex, col: 4 }, end: { row: rowIndex, col: 4 } });
                          }}
                          onMouseDown={() => startRunCellSelection(rowIndex, 4)}
                          style={sheetCellInputStyle}
                        />
                      </td>
                      <td
                        style={{ ...tdStyle, ...(isRunCellInSelection(rowIndex, 5) ? sheetCellSelectedStyle : {}), ...(isActiveRunCell(rowIndex, 5) ? sheetCellActiveStyle : {}) }}
                        onMouseDown={() => startRunCellSelection(rowIndex, 5)}
                        onMouseEnter={() => extendRunCellSelection(rowIndex, 5)}
                      >
                        <input
                          value={row.costPerRequest}
                          onChange={(e) => updateRunRow(row.key, "costPerRequest", e.target.value)}
                          onPaste={(e) => handleRunSheetPaste(rowIndex, 5, e)}
                          onFocus={() => {
                            setActiveRunCell({ row: rowIndex, col: 5 });
                            setRunSelectionRange({ start: { row: rowIndex, col: 5 }, end: { row: rowIndex, col: 5 } });
                          }}
                          onMouseDown={() => startRunCellSelection(rowIndex, 5)}
                          style={sheetCellInputStyle}
                        />
                      </td>
                      <td
                        style={{ ...tdStyle, ...(isRunCellInSelection(rowIndex, 6) ? sheetCellSelectedStyle : {}), ...(isActiveRunCell(rowIndex, 6) ? sheetCellActiveStyle : {}) }}
                        onMouseDown={() => startRunCellSelection(rowIndex, 6)}
                        onMouseEnter={() => extendRunCellSelection(rowIndex, 6)}
                      >
                        <input
                          value={row.policyPassRate}
                          onChange={(e) => updateRunRow(row.key, "policyPassRate", e.target.value)}
                          onPaste={(e) => handleRunSheetPaste(rowIndex, 6, e)}
                          onFocus={() => {
                            setActiveRunCell({ row: rowIndex, col: 6 });
                            setRunSelectionRange({ start: { row: rowIndex, col: 6 }, end: { row: rowIndex, col: 6 } });
                          }}
                          onMouseDown={() => startRunCellSelection(rowIndex, 6)}
                          style={sheetCellInputStyle}
                        />
                      </td>
                      <td
                        style={{ ...tdStyle, ...(isRunCellInSelection(rowIndex, 7) ? sheetCellSelectedStyle : {}), ...(isActiveRunCell(rowIndex, 7) ? sheetCellActiveStyle : {}) }}
                        onMouseDown={() => startRunCellSelection(rowIndex, 7)}
                        onMouseEnter={() => extendRunCellSelection(rowIndex, 7)}
                      >
                        <input
                          value={row.policyViolationRate}
                          onChange={(e) => updateRunRow(row.key, "policyViolationRate", e.target.value)}
                          onPaste={(e) => handleRunSheetPaste(rowIndex, 7, e)}
                          onFocus={() => {
                            setActiveRunCell({ row: rowIndex, col: 7 });
                            setRunSelectionRange({ start: { row: rowIndex, col: 7 }, end: { row: rowIndex, col: 7 } });
                          }}
                          onMouseDown={() => startRunCellSelection(rowIndex, 7)}
                          style={sheetCellInputStyle}
                        />
                      </td>
                      <td
                        style={{ ...tdStyle, ...(isRunCellInSelection(rowIndex, 8) ? sheetCellSelectedStyle : {}), ...(isActiveRunCell(rowIndex, 8) ? sheetCellActiveStyle : {}) }}
                        onMouseDown={() => startRunCellSelection(rowIndex, 8)}
                        onMouseEnter={() => extendRunCellSelection(rowIndex, 8)}
                      >
                        <input
                          value={row.recall}
                          onChange={(e) => updateRunRow(row.key, "recall", e.target.value)}
                          onPaste={(e) => handleRunSheetPaste(rowIndex, 8, e)}
                          onFocus={() => {
                            setActiveRunCell({ row: rowIndex, col: 8 });
                            setRunSelectionRange({ start: { row: rowIndex, col: 8 }, end: { row: rowIndex, col: 8 } });
                          }}
                          onMouseDown={() => startRunCellSelection(rowIndex, 8)}
                          style={sheetCellInputStyle}
                        />
                      </td>
                      <td
                        style={{ ...tdStyle, ...(isRunCellInSelection(rowIndex, 9) ? sheetCellSelectedStyle : {}), ...(isActiveRunCell(rowIndex, 9) ? sheetCellActiveStyle : {}) }}
                        onMouseDown={() => startRunCellSelection(rowIndex, 9)}
                        onMouseEnter={() => extendRunCellSelection(rowIndex, 9)}
                      >
                        <input
                          value={row.precision}
                          onChange={(e) => updateRunRow(row.key, "precision", e.target.value)}
                          onPaste={(e) => handleRunSheetPaste(rowIndex, 9, e)}
                          onFocus={() => {
                            setActiveRunCell({ row: rowIndex, col: 9 });
                            setRunSelectionRange({ start: { row: rowIndex, col: 9 }, end: { row: rowIndex, col: 9 } });
                          }}
                          onMouseDown={() => startRunCellSelection(rowIndex, 9)}
                          style={sheetCellInputStyle}
                        />
                      </td>
                      <td
                        style={{ ...tdStyle, ...(isRunCellInSelection(rowIndex, 10) ? sheetCellSelectedStyle : {}), ...(isActiveRunCell(rowIndex, 10) ? sheetCellActiveStyle : {}) }}
                        onMouseDown={() => startRunCellSelection(rowIndex, 10)}
                        onMouseEnter={() => extendRunCellSelection(rowIndex, 10)}
                      >
                        <input
                          value={row.f1Score}
                          onChange={(e) => updateRunRow(row.key, "f1Score", e.target.value)}
                          onPaste={(e) => handleRunSheetPaste(rowIndex, 10, e)}
                          onFocus={() => {
                            setActiveRunCell({ row: rowIndex, col: 10 });
                            setRunSelectionRange({ start: { row: rowIndex, col: 10 }, end: { row: rowIndex, col: 10 } });
                          }}
                          onMouseDown={() => startRunCellSelection(rowIndex, 10)}
                          style={sheetCellInputStyle}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
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
              <p style={summaryTextStyle}>완료율은 (Completion Rate) <span style={summaryValueStyle}>{summaryMetrics.completionRate.toFixed(1)}%</span>이고,</p>
              <p style={summaryTextStyle}>이탈률은 (Drop-off Rate) <span style={summaryValueStyle}>{summaryMetrics.dropoffRate.toFixed(1)}%</span>, 이며,</p>
              <p style={{ ...summaryTextStyle, marginBottom: 0 }}>전환율 (Conversion Rate)은 <span style={summaryValueStyle}>{summaryMetrics.conversionRate.toFixed(1)}%</span> 이에요.</p>
            </div>
          </div>
          <div style={warningNoteWrapStyle}>
            <p style={warningNoteStyle}>• POC 지표는 조건에 따라 실제 운영과 다를 수 있어요.</p>
            <p style={warningNoteStyle}>• 모델 비교와 참고용으로만 사용해주세요.</p>
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

const sheetCellInputStyle: CSSProperties = {
  width: "100%",
  border: "none",
  borderRadius: 0,
  padding: "8px 10px",
  fontSize: 12,
  background: "transparent",
  outline: "none",
};

const sheetCellActiveStyle: CSSProperties = {
  background: "#eff6ff",
  boxShadow: "inset 0 0 0 1px #93c5fd",
};

const sheetCellSelectedStyle: CSSProperties = {
  background: "#f8fbff",
};

const warningNoteWrapStyle: CSSProperties = {
  marginTop: 8,
  display: "grid",
  gap: 2,
};

const warningNoteStyle: CSSProperties = {
  margin: 0,
  color: "#dc2626",
  fontSize: 12,
  lineHeight: 1.35,
  fontWeight: 400,
};

const mappingBoxStyle: CSSProperties = {
  marginTop: 4,
  marginBottom: 10,
  padding: "10px 12px",
  border: "1px solid #dbe2ea",
  borderRadius: 8,
  background: "#f8fafc",
};

const mappingTitleStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 800,
  color: "#334155",
  marginBottom: 8,
};

const mappingRowStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "flex-end",
  flexWrap: "wrap",
};

const mappingLabelStyle: CSSProperties = {
  display: "grid",
  gap: 4,
  fontSize: 12,
  fontWeight: 700,
  color: "#475569",
  minWidth: 180,
};

const mappingSelectStyle: CSSProperties = {
  border: "1px solid #d1d5db",
  borderRadius: 8,
  padding: "8px 10px",
  fontSize: 12,
  color: "#111827",
  background: "#fff",
  minWidth: 200,
};

const mappingActionsStyle: CSSProperties = {
  marginLeft: "auto",
  display: "flex",
  gap: 8,
  alignItems: "center",
};

const buttonStyle: CSSProperties = {
  border: "1px solid #d1d5db",
  borderRadius: 8,
  padding: "8px 12px",
  background: "#fff",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  lineHeight: 1.2,
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
};

const ghostButtonStyle: CSSProperties = {
  ...buttonStyle,
  padding: "8px 12px",
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
