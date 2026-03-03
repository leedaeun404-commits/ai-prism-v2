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
  expectedOutput: string;
  description: string;
  tags: string;
  note: string;
};
type CsvImportDraft = {
  headers: string[];
  rows: string[][];
};
type SampleColIndex = 0 | 1 | 2 | 3 | 4 | 5;
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

const VIEW_TABS: Array<{ key: Step5ViewTab; label: string; helperTitle: string; helperText: string }> = [
  {
    key: "experiment",
    label: "품질",
    helperTitle: "실험뷰",
    helperText: "기능이 의도대로 동작하는지 확인해요.\n정확도 및 수정 비율을 통해 실사용 가능성을 결정해요.",
  },
  {
    key: "release",
    label: "비용",
    helperTitle: "출시뷰",
    helperText: "요청당 비용과 평균 응답 시간을 확인해요.\n확장 시 감당 가능한 비용 구조인지 참고할 수 있어요.",
  },
  {
    key: "operational",
    label: "운영 리스크",
    helperTitle: "운영뷰",
    helperText: "정책 위반, 오류, 수동 개입 지표를 확인해요.\n운영 중 사고 가능성을 컨트롤 할 수 있는지 참고해요.",
  },
  {
    key: "scaleup",
    label: "비즈니스 가치",
    helperTitle: "확장뷰",
    helperText: "자동화율, 처리 시간 단축, ROI 등의 확장 기준을 정의해요.\n어떤 조건에서 고도화 할지 결정 기준을 참고해요.",
  },
];

type Step5TestUnitRow = {
  unitId: string;
  serviceName: string;
  featureName: string;
  aiTaskType: string;
  testType: string;
  metricPack: string[];
  status: string;
};
type Step5UnitProgress = "idle" | "sampleReady" | "saved";

const STEP5_TEST_UNIT_ROWS: Step5TestUnitRow[] = [
  {
    unitId: "UNIT-001",
    serviceName: "콘텐츠 자동화",
    featureName: "초안 생성",
    aiTaskType: "초안 생성 (draft_generation)",
    testType: "Offline",
    metricPack: [
      "수정 비율 (Edit Rate)",
      "정책 통과율 (Policy Pass Rate)",
      "평균 응답 시간 (Average Latency)",
      "요청당 비용 (Cost per Request)",
    ],
    status: "결과 입력 대기",
  },
  {
    unitId: "UNIT-002",
    serviceName: "콘텐츠 자동화",
    featureName: "개선 제안",
    aiTaskType: "개선 제안 (revision_suggestion)",
    testType: "Offline",
    metricPack: ["수정 비율 (Edit Rate)", "정밀도 (Precision)", "재현율 (Recall)", "F1 점수 (F1 Score)"],
    status: "결과 입력 대기",
  },
  {
    unitId: "UNIT-003",
    serviceName: "콘텐츠 자동화",
    featureName: "정책 점검",
    aiTaskType: "정책 점검 (policy_check)",
    testType: "Offline",
    metricPack: ["정책 통과율 (Policy Pass Rate)", "정책 위반율 (Policy Violation Rate)", "오류율 (Error Rate)"],
    status: "결과 입력 대기",
  },
  {
    unitId: "UNIT-004",
    serviceName: "콘텐츠 자동화",
    featureName: "정책 점검",
    aiTaskType: "사전 검토 게이트 (pre_review_gate)",
    testType: "Offline",
    metricPack: ["수동 개입률 (Manual Intervention Rate)", "수정 비율 (Edit Rate)", "평균 응답 시간 (Average Latency)"],
    status: "결과 입력 대기",
  },
];

const TEST_UNIT_SAMPLE_TEMPLATES: Record<string, Array<Pick<SampleInput, "input" | "expectedOutput" | "description" | "tags" | "note">>> = {
  "UNIT-001": [
    { input: "제품 소개 초안 작성", expectedOutput: "", description: "초안 생성 품질 샘플", tags: "생성", note: "" },
    { input: "홍보 문구 3가지 생성", expectedOutput: "", description: "다중 출력 샘플", tags: "생성", note: "" },
  ],
  "UNIT-002": [
    { input: "기존 문장을 더 간결하게 개선", expectedOutput: "", description: "개선 제안 샘플", tags: "개선", note: "" },
    { input: "톤앤매너를 공식적으로 수정", expectedOutput: "", description: "리비전 샘플", tags: "개선", note: "" },
  ],
  "UNIT-003": [
    { input: "정책 위반 가능 문장 점검", expectedOutput: "", description: "정책 점검 샘플", tags: "정책", note: "" },
    { input: "외부 노출 허용 여부 판단", expectedOutput: "", description: "정책 통과 샘플", tags: "정책", note: "" },
  ],
  "UNIT-004": [
    { input: "사전 검토 필요 여부 분기", expectedOutput: "", description: "검토 게이트 샘플", tags: "검토", note: "" },
    { input: "승인 조건 충족 여부 판단", expectedOutput: "", description: "승인 조건 샘플", tags: "검토", note: "" },
  ],
};

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
    { id: "S-1", input: "질문 A", expectedOutput: "", description: "기본 검증 샘플", tags: "기본", note: "" },
    { id: "S-2", input: "질문 B", expectedOutput: "", description: "일반 품질 검증 샘플", tags: "품질", note: "" },
  ],
  "gpt-x-plus": [
    { id: "S-1", input: "정책 포함 문안 생성", expectedOutput: "", description: "정책 검증 샘플", tags: "정책", note: "" },
    { id: "S-2", input: "초안 개선/수정 요청", expectedOutput: "", description: "리라이팅 검증 샘플", tags: "개선", note: "" },
  ],
  "claude-pro": [
    { id: "S-1", input: "민감 표현 포함 응답 점검", expectedOutput: "", description: "위반 탐지 샘플", tags: "리스크", note: "" },
    { id: "S-2", input: "외부 노출 가능 여부 판단", expectedOutput: "", description: "정책 통과 샘플", tags: "정책", note: "" },
  ],
  "llama-2": [
    { id: "S-1", input: "짧은 공지 생성", expectedOutput: "", description: "저비용 처리 샘플", tags: "저비용", note: "" },
    { id: "S-2", input: "반복성 텍스트 생성", expectedOutput: "", description: "대량 호출 샘플", tags: "대량", note: "" },
  ],
};

function createSamplesFromTemplate(unitId: string): SampleInput[] {
  const template = TEST_UNIT_SAMPLE_TEMPLATES[unitId] ?? [];
  return template.map((sample, idx) => ({
    id: `tmp-${idx + 1}`,
    input: sample.input,
    expectedOutput: sample.expectedOutput || "",
    description: sample.description || "",
    tags: sample.tags || "",
    note: sample.note || "",
  }));
}

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
  const [activeTestUnitId, setActiveTestUnitId] = useState<string>(() => STEP5_TEST_UNIT_ROWS[0]?.unitId ?? "");
  const [unitProgressById, setUnitProgressById] = useState<Record<string, Step5UnitProgress>>(() => {
    const first = STEP5_TEST_UNIT_ROWS[0]?.unitId ?? "";
    return STEP5_TEST_UNIT_ROWS.reduce<Record<string, Step5UnitProgress>>((acc, row) => {
      acc[row.unitId] = row.unitId === first ? "sampleReady" : "idle";
      return acc;
    }, {});
  });
  const [modelCatalog] = useState<ModelOption[]>(MOCK_MODEL_OPTIONS);
  const [selectedModelIds] = useState<string[]>(() => MOCK_MODEL_OPTIONS.slice(0, 3).map((model) => model.id));
  const [samples, setSamples] = useState<SampleInput[]>(() => createSamplesFromTemplate(STEP5_TEST_UNIT_ROWS[0]?.unitId ?? ""));
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
  const [csvExpectedHeader, setCsvExpectedHeader] = useState("");
  const [csvDescriptionHeader, setCsvDescriptionHeader] = useState("");
  const [csvTagsHeader, setCsvTagsHeader] = useState("");
  const [csvNoteHeader, setCsvNoteHeader] = useState("");
  const [isRunInputExpanded, setIsRunInputExpanded] = useState(false);
  const testRunResultRef = useRef<HTMLDivElement | null>(null);
  const handleCreateSampleSet = useCallback((unitId: string) => {
    const nextSamples = createSamplesFromTemplate(unitId);
    if (nextSamples.length === 0) {
      setMessage("이 테스트 조건에 연결된 샘플 템플릿이 없어요.");
      return;
    }
    setActiveTestUnitId(unitId);
    setSamples(nextSamples);
    setUnitProgressById((prev) => ({ ...prev, [unitId]: "sampleReady" }));
    setMessage(`샘플셋 생성 완료: ${unitId} 기준 샘플 ${nextSamples.length}개 (모델 3개 비교)`);
  }, []);

  const focusRunInputSection = useCallback((unitId: string) => {
    setActiveTestUnitId(unitId);
    setIsRunInputExpanded(true);
    requestAnimationFrame(() => {
      testRunResultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    setMessage(`${unitId} 결과 입력 섹션으로 이동했어요.`);
  }, []);

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
      const key = `${sample.input}::${sample.description}::${sample.tags}`;
      if (!dedup.has(key)) {
        dedup.set(key, {
          id: `tmp-${dedup.size + 1}`,
          input: sample.input,
          expectedOutput: sample.expectedOutput || "",
          description: sample.description,
          tags: sample.tags || "",
          note: sample.note || "",
        });
      }
    });
    const nextSamples = Array.from(dedup.values());
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (nextSamples.length > 0) setSamples(nextSamples);
  }, [selectedModelIds]);

  const sampleMap = useMemo(() => new Map(samples.map((sample) => [sample.id, sample])), [samples]);
  const sampleDisplayMap = useMemo(() => new Map(samples.map((sample, idx) => [sample.id, sample.savedId || `임시-${idx + 1}`])), [samples]);
  const modelMap = useMemo(() => new Map(modelCatalog.map((model) => [model.id, model])), [modelCatalog]);
  const activeSampleSetId = useMemo(
    () => (activeTestUnitId ? `SSET-${activeTestUnitId.replace("UNIT-", "").padStart(3, "0")}` : "SSET-000"),
    [activeTestUnitId]
  );
  const sampleSetModelNames = useMemo(
    () => selectedModelIds.map((modelId) => modelMap.get(modelId)?.name ?? modelId),
    [modelMap, selectedModelIds]
  );

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

  const testRunBaseRows = useMemo(() => {
    const promptVersionByModel: Record<string, string> = {
      "gpt-x-base": "v1",
      "gpt-x-plus": "v2",
      "claude-pro": "v1",
      "llama-2": "v1",
    };
    return core10ByModel.map((row, idx) => {
      const modelRuns = runRows.filter((run) => run.modelId === row.modelId);
      const sampleCount = modelRuns.length;
      const tokenUsage = Math.round(
        modelRuns.reduce((acc, run) => acc + (run.predictedOutput || run.observedOutput || "").length * 3, 0)
      );
      const manualInterventionRate = Math.max(0.5, row.editRate * 0.2);
      const automationRate = Math.max(0, 100 - row.editRate);
      const processingTimeReduction = Math.max(0, Math.min(60, 30 - row.averageLatency / 100));
      const conversionRate = Math.max(0, Math.min(100, (100 - row.errorRate * 2 - row.editRate * 0.3) * 0.16));
      const roi = Math.max(0, conversionRate * 2 - row.costPerRequest * 100);
      return {
        testRunId: `T-${String(idx + 1).padStart(3, "0")}`,
        modelName: row.modelName,
        sampleCount,
        promptVersion: promptVersionByModel[row.modelId] ?? "v1",
        editRate: row.editRate,
        precision: row.precision,
        recall: row.recall,
        f1Score: row.f1Score,
        requirementPassRate: row.policyPassRate,
        policyViolationRate: row.policyViolationRate,
        errorRate: row.errorRate,
        costPerRequest: row.costPerRequest,
        tokenUsage,
        averageLatency: row.averageLatency,
        manualInterventionRate,
        automationRate,
        processingTimeReduction,
        conversionRate,
        roi,
      };
    });
  }, [core10ByModel, runRows]);
  const testRunTable = useMemo(() => {
    if (viewTab === "experiment") {
      return {
        headers: [
          "Test Run ID",
          "모델 (Model)",
          "샘플 수 (Sample Size)",
          "수정 비율 (Edit Rate)",
          "정밀도 (Precision)",
          "재현율 (Recall)",
          "F1 점수 (F1 Score)",
          "요건 충족률 (Requirement Pass Rate)",
          "정책 위반율 (Policy Violation Rate)",
          "오류율 (Error Rate)",
        ],
        rows: testRunBaseRows.map((row) => [
          row.testRunId,
          row.modelName,
          String(row.sampleCount),
          `${row.editRate.toFixed(1)}%`,
          row.precision.toFixed(2),
          row.recall.toFixed(2),
          row.f1Score.toFixed(2),
          `${row.requirementPassRate.toFixed(1)}%`,
          `${row.policyViolationRate.toFixed(1)}%`,
          `${row.errorRate.toFixed(1)}%`,
        ]),
      };
    }
    if (viewTab === "release") {
      return {
        headers: [
          "Test Run ID",
          "모델 (Model)",
          "샘플 수 (Sample Size)",
          "요청당 비용 (Cost per Request)",
          "토큰 사용량 (Token Usage)",
          "평균 응답 시간 (Average Latency)",
        ],
        rows: testRunBaseRows.map((row) => [
          row.testRunId,
          row.modelName,
          String(row.sampleCount),
          `$${row.costPerRequest.toFixed(3)}`,
          row.tokenUsage.toLocaleString(),
          `${row.averageLatency.toFixed(0)}ms`,
        ]),
      };
    }
    if (viewTab === "operational") {
      return {
        headers: [
          "Test Run ID",
          "모델 (Model)",
          "샘플 수 (Sample Size)",
          "정책 위반율 (Policy Violation Rate)",
          "시스템 오류율 (System Error Rate)",
          "수동 개입률 (Manual Intervention Rate)",
        ],
        rows: testRunBaseRows.map((row) => [
          row.testRunId,
          row.modelName,
          String(row.sampleCount),
          `${row.policyViolationRate.toFixed(1)}%`,
          `${row.errorRate.toFixed(1)}%`,
          `${row.manualInterventionRate.toFixed(1)}%`,
        ]),
      };
    }
    return {
      headers: [
        "Test Run ID",
        "모델 (Model)",
        "샘플 수 (Sample Size)",
        "자동화율 (Automation Rate)",
        "평균 처리 시간 단축률 (Processing Time Reduction)",
        "전환율 (Conversion Rate)",
        "ROI (Return on Investment)",
      ],
      rows: testRunBaseRows.map((row) => [
        row.testRunId,
        row.modelName,
        String(row.sampleCount),
        `${row.automationRate.toFixed(1)}%`,
        `${row.processingTimeReduction.toFixed(1)}%`,
        `${row.conversionRate.toFixed(1)}%`,
        row.roi.toFixed(1),
      ]),
    };
  }, [testRunBaseRows, viewTab]);

  const activeViewMeta = useMemo(() => VIEW_TABS.find((tab) => tab.key === viewTab) ?? VIEW_TABS[0], [viewTab]);

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
          if (col === 0) next.id = "";
          if (col === 1) next.input = "";
          if (col === 2) next.expectedOutput = "";
          if (col === 3) next.description = "";
          if (col === 4) next.tags = "";
          if (col === 5) next.note = "";
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
      const expectedHeader = guessHeader(headers, [/expected/, /예상/, /target/, /정답/, /reference/]);
      const descriptionHeader = guessHeader(headers, [/desc/, /설명/, /note/, /context/, /label/]);
      const tagsHeader = guessHeader(headers, [/tag/, /태그/, /category/, /분류/]);
      const noteHeader = guessHeader(headers, [/memo/, /비고/, /remark/, /comment/]);
      setCsvImportDraft({ headers, rows });
      setCsvInputHeader(inputHeader);
      setCsvExpectedHeader(expectedHeader);
      setCsvDescriptionHeader(descriptionHeader);
      setCsvTagsHeader(tagsHeader);
      setCsvNoteHeader(noteHeader);
      setMessage(`표 붙여넣기 인식: ${rows.length}개 행을 불러왔어요. 컬럼 매핑 후 적용하세요.`);
      return;
    }
    e.preventDefault();
    const colKeys: Array<keyof SampleInput> = ["id", "input", "expectedOutput", "description", "tags", "note"];
    setSamples((prev) => {
      const next = [...prev];
      const requiredRows = startRow + grid.length;
      while (next.length < requiredRows) {
        next.push({ id: `S-${next.length + 1}`, input: "", expectedOutput: "", description: "", tags: "", note: "" });
      }
      for (let r = 0; r < grid.length; r += 1) {
        const rowIndex = startRow + r;
        const row = { ...next[rowIndex] };
        for (let c = 0; c < grid[r].length; c += 1) {
          const colIndex = startCol + c;
          if (colIndex > 5) break;
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
      const expectedHeader = guessHeader(headers, [/expected/, /예상/, /target/, /정답/, /reference/]);
      const descriptionHeader = guessHeader(headers, [/desc/, /설명/, /note/, /context/, /label/]);
      const tagsHeader = guessHeader(headers, [/tag/, /태그/, /category/, /분류/]);
      const noteHeader = guessHeader(headers, [/memo/, /비고/, /remark/, /comment/]);
      setCsvImportDraft({ headers, rows });
      setCsvInputHeader(inputHeader);
      setCsvExpectedHeader(expectedHeader);
      setCsvDescriptionHeader(descriptionHeader);
      setCsvTagsHeader(tagsHeader);
      setCsvNoteHeader(noteHeader);
      setMessage(`CSV 업로드 완료: ${rows.length}개 행을 불러왔어요. 컬럼 매핑 후 적용하세요.`);
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  function applyCsvMapping() {
    if (!csvImportDraft) return;
    const inputIndex = csvImportDraft.headers.indexOf(csvInputHeader);
    const expectedIndex = csvImportDraft.headers.indexOf(csvExpectedHeader);
    const descriptionIndex = csvImportDraft.headers.indexOf(csvDescriptionHeader);
    const tagsIndex = csvImportDraft.headers.indexOf(csvTagsHeader);
    const noteIndex = csvImportDraft.headers.indexOf(csvNoteHeader);
    if (inputIndex < 0) {
      setMessage("입력(Input) 컬럼 매핑을 확인해 주세요.");
      return;
    }
    const mapped = csvImportDraft.rows
      .map((row, idx) => ({
        id: `tmp-${idx + 1}`,
        input: row[inputIndex] ?? "",
        expectedOutput: expectedIndex >= 0 ? row[expectedIndex] ?? "" : "",
        description: descriptionIndex >= 0 ? row[descriptionIndex] ?? "" : "",
        tags: tagsIndex >= 0 ? row[tagsIndex] ?? "" : "",
        note: noteIndex >= 0 ? row[noteIndex] ?? "" : "",
      }))
      .filter((row) => row.input.trim() || row.expectedOutput.trim() || row.description.trim() || row.tags.trim() || row.note.trim());
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
    setCsvExpectedHeader("");
    setCsvDescriptionHeader("");
    setCsvTagsHeader("");
    setCsvNoteHeader("");
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
    if (activeTestUnitId) {
      setUnitProgressById((prev) => ({ ...prev, [activeTestUnitId]: "saved" }));
    }
    setMessage(`결과 저장 완료: 모델 ${selectedModelIds.length}개 / 샘플 ${samples.length}개`);
  }

  return (
    <div ref={twoPaneRef} className="two-pane" style={twoPaneStyle}>
      <section style={mainPanelStyle}>
        <div style={cardStyle}>
          <h3 style={cardTitleStyle}>기능 검증 시나리오</h3>
          <p style={{ ...subtleStyle, marginTop: 0 }}>현재는 오프라인 테스트만 가능해요.</p>
          <div style={tableWrapStyle}>
            <table style={{ ...tableStyle, minWidth: 1280 }}>
              <thead>
                <tr>
                  <th style={thStyle}>서비스 (Service)</th>
                  <th style={thStyle}>기능 (Feature)</th>
                  <th style={thStyle}>AI 작업 유형 (AI Task)</th>
                  <th style={thStyle}>테스트 타입 (Test Type)</th>
                  <th style={thStyle}>적용 지표 팩 (Metric Pack)</th>
                  <th style={thStyle}>실행 상태 (Status)</th>
                </tr>
              </thead>
              <tbody>
                {STEP5_TEST_UNIT_ROWS.map((row) => (
                  <tr key={`offline-overview-${row.unitId}`}>
                    <td style={tdStyle}>{row.serviceName}</td>
                    <td style={tdStyle}>{row.featureName}</td>
                    <td style={tdStyle}>{row.aiTaskType}</td>
                    <td style={tdStyle}>{row.testType}</td>
                    <td style={tdStyle}>
                      {row.metricPack.map((metric) => (
                        <div key={`${row.unitId}-${metric}`}>{metric}</div>
                      ))}
                    </td>
                    <td style={{ ...tdStyle, minWidth: 220 }}>
                      <div style={{ display: "flex", justifyContent: "flex-end" }}>
                        {unitProgressById[row.unitId] === "saved" ? (
                          <button type="button" style={{ ...ghostButtonStyle, opacity: 0.6, cursor: "default" }} disabled>
                            저장 완료
                          </button>
                        ) : unitProgressById[row.unitId] === "sampleReady" && activeTestUnitId === row.unitId ? (
                          <button type="button" style={buttonStyle} onClick={() => focusRunInputSection(row.unitId)}>
                            결과 입력하기
                          </button>
                        ) : (
                          <button type="button" style={buttonStyle} onClick={() => handleCreateSampleSet(row.unitId)}>
                            샘플셋 만들기
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {STEP5_TEST_UNIT_ROWS.length === 0 && (
                  <tr>
                    <td style={tdStyle} colSpan={6}>
                      테스트 유닛이 없습니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
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
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
              <span style={{ ...subtleStyle, margin: 0 }}>
                샘플셋 ID: <strong style={{ color: "#0f172a" }}>{activeSampleSetId}</strong>
              </span>
              <span style={{ ...subtleStyle, margin: 0 }}>실행 모델:</span>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {sampleSetModelNames.map((modelName) => (
                  <span key={`sample-set-model-${modelName}`} style={smallChipStyle}>
                    {modelName}
                  </span>
                ))}
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
                    예상 출력 (Expected Output)
                    <select value={csvExpectedHeader} onChange={(e) => setCsvExpectedHeader(e.target.value)} style={mappingSelectStyle}>
                      {csvImportDraft.headers.map((header) => (
                        <option key={`expected-${header}`} value={header}>
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
                  <label style={mappingLabelStyle}>
                    태그 (Tags)
                    <select value={csvTagsHeader} onChange={(e) => setCsvTagsHeader(e.target.value)} style={mappingSelectStyle}>
                      {csvImportDraft.headers.map((header) => (
                        <option key={`tags-${header}`} value={header}>
                          {header}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label style={mappingLabelStyle}>
                    비고 (Notes)
                    <select value={csvNoteHeader} onChange={(e) => setCsvNoteHeader(e.target.value)} style={mappingSelectStyle}>
                      {csvImportDraft.headers.map((header) => (
                        <option key={`note-${header}`} value={header}>
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
                    <th style={thStyle}>샘플 ID</th>
                    <th style={thStyle}>입력 (Input)</th>
                    <th style={thStyle}>예상 출력 (Expected Output)</th>
                    <th style={thStyle}>설명</th>
                    <th style={thStyle}>태그 (Tags)</th>
                    <th style={thStyle}>비고 (Notes)</th>
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
                          value={sample.id}
                          onChange={(e) => updateSample(index, "id", e.target.value)}
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
                          value={sample.input}
                          onChange={(e) => updateSample(index, "input", e.target.value)}
                          onPaste={(e) => handleSampleSheetPaste(index, 1, e)}
                          onFocus={() => {
                            setActiveSampleCell({ row: index, col: 1 });
                            setSampleSelectionRange({ start: { row: index, col: 1 }, end: { row: index, col: 1 } });
                          }}
                          onMouseDown={() => startSampleCellSelection(index, 1)}
                          style={sheetCellInputStyle}
                        />
                      </td>
                      <td
                        style={{ ...tdStyle, ...(isSampleCellInSelection(index, 2) ? sheetCellSelectedStyle : {}), ...(isActiveSampleCell(index, 2) ? sheetCellActiveStyle : {}) }}
                        onMouseDown={() => startSampleCellSelection(index, 2)}
                        onMouseEnter={() => extendSampleCellSelection(index, 2)}
                      >
                        <input
                          value={sample.expectedOutput}
                          onChange={(e) => updateSample(index, "expectedOutput", e.target.value)}
                          onPaste={(e) => handleSampleSheetPaste(index, 2, e)}
                          onFocus={() => {
                            setActiveSampleCell({ row: index, col: 2 });
                            setSampleSelectionRange({ start: { row: index, col: 2 }, end: { row: index, col: 2 } });
                          }}
                          onMouseDown={() => startSampleCellSelection(index, 2)}
                          style={sheetCellInputStyle}
                        />
                      </td>
                      <td
                        style={{ ...tdStyle, ...(isSampleCellInSelection(index, 3) ? sheetCellSelectedStyle : {}), ...(isActiveSampleCell(index, 3) ? sheetCellActiveStyle : {}) }}
                        onMouseDown={() => startSampleCellSelection(index, 3)}
                        onMouseEnter={() => extendSampleCellSelection(index, 3)}
                      >
                        <input
                          value={sample.description}
                          onChange={(e) => updateSample(index, "description", e.target.value)}
                          onPaste={(e) => handleSampleSheetPaste(index, 3, e)}
                          onFocus={() => {
                            setActiveSampleCell({ row: index, col: 3 });
                            setSampleSelectionRange({ start: { row: index, col: 3 }, end: { row: index, col: 3 } });
                          }}
                          onMouseDown={() => startSampleCellSelection(index, 3)}
                          style={sheetCellInputStyle}
                        />
                      </td>
                      <td
                        style={{ ...tdStyle, ...(isSampleCellInSelection(index, 4) ? sheetCellSelectedStyle : {}), ...(isActiveSampleCell(index, 4) ? sheetCellActiveStyle : {}) }}
                        onMouseDown={() => startSampleCellSelection(index, 4)}
                        onMouseEnter={() => extendSampleCellSelection(index, 4)}
                      >
                        <input
                          value={sample.tags}
                          onChange={(e) => updateSample(index, "tags", e.target.value)}
                          onPaste={(e) => handleSampleSheetPaste(index, 4, e)}
                          onFocus={() => {
                            setActiveSampleCell({ row: index, col: 4 });
                            setSampleSelectionRange({ start: { row: index, col: 4 }, end: { row: index, col: 4 } });
                          }}
                          onMouseDown={() => startSampleCellSelection(index, 4)}
                          style={sheetCellInputStyle}
                        />
                      </td>
                      <td
                        style={{ ...tdStyle, ...(isSampleCellInSelection(index, 5) ? sheetCellSelectedStyle : {}), ...(isActiveSampleCell(index, 5) ? sheetCellActiveStyle : {}) }}
                        onMouseDown={() => startSampleCellSelection(index, 5)}
                        onMouseEnter={() => extendSampleCellSelection(index, 5)}
                      >
                        <input
                          value={sample.note}
                          onChange={(e) => updateSample(index, "note", e.target.value)}
                          onPaste={(e) => handleSampleSheetPaste(index, 5, e)}
                          onFocus={() => {
                            setActiveSampleCell({ row: index, col: 5 });
                            setSampleSelectionRange({ start: { row: index, col: 5 }, end: { row: index, col: 5 } });
                          }}
                          onMouseDown={() => startSampleCellSelection(index, 5)}
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

        <div ref={testRunResultRef} style={cardStyle}>
          <h3 style={cardTitleStyle}>Test Run 결과</h3>
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
          <div style={{ ...subtleStyle, marginTop: 8, marginBottom: 8, whiteSpace: "pre-line" }}>
            {activeViewMeta.helperText}
          </div>
          <div style={tableWrapStyle}>
            <table style={{ ...tableStyle, minWidth: 920 }}>
              <thead>
                <tr>
                  {testRunTable.headers.map((header) => (
                    <th key={header} style={thStyle}>
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {testRunTable.rows.map((row, rowIndex) => (
                  <tr key={`test-run-summary-${rowIndex}`}>
                    {row.map((value, colIndex) => (
                      <td key={`test-run-summary-${rowIndex}-${colIndex}`} style={tdStyle}>
                        {value}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <details style={{ marginTop: 10 }} open={isRunInputExpanded} onToggle={(e) => setIsRunInputExpanded((e.currentTarget as HTMLDetailsElement).open)}>
            <summary style={{ cursor: "pointer", color: "#64748b", fontSize: 12, fontWeight: 700 }}>상세 입력 테이블 보기</summary>
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
          </details>
        </div>

        <div style={cardStyle}>
          <h3 style={cardTitleStyle}>테스트 결과 해석</h3>
          <div style={summaryCardsGridStyle}>
            <div style={{ ...summaryCardStyle, ...(viewTab === "experiment" ? summaryCardActiveStyle : {}) }}>
              <div style={summaryCardHeadStyle}>
                <span style={{ ...summaryIconStyle, background: "#fef3c7", color: "#92400e" }}>Q</span>
                <div style={summaryCardTitleStyle}>품질 (Quality)</div>
              </div>
              <p style={summaryTextStyle}>👉 기능이 의도대로 동작하는가?</p>
              <div style={summaryGroupGapStyle} />
              <p style={summaryTextStyle}>분류형 기준: 정밀도 (Precision) <span style={summaryValueStyle}>{summaryMetrics.avgPrecision.toFixed(2)}</span>, 재현율 (Recall) <span style={summaryValueStyle}>{summaryMetrics.avgRecall.toFixed(2)}</span></p>
              <p style={summaryTextStyle}>생성형 기준: 수정 비율 (Edit Rate) <span style={summaryValueStyle}>{summaryMetrics.avgEditRate.toFixed(1)}%</span></p>
              <p style={summaryTextStyle}>정책 위반율 (Policy Violation Rate) <span style={summaryValueStyle}>{summaryMetrics.avgPolicyViolation.toFixed(1)}%</span></p>
              <div style={summaryGroupGapStyle} />
              <p style={{ ...summaryTextStyle, marginBottom: 0 }}>✔ 기능 신뢰도 기준 충족 여부 판단</p>
            </div>

            <div style={{ ...summaryCardStyle, ...(viewTab === "release" ? summaryCardActiveStyle : {}) }}>
              <div style={summaryCardHeadStyle}>
                <span style={{ ...summaryIconStyle, background: "#dbeafe", color: "#1d4ed8" }}>$</span>
                <div style={summaryCardTitleStyle}>비용 (Cost)</div>
              </div>
              <p style={summaryTextStyle}>👉 확장 가능성 판단</p>
              <div style={summaryGroupGapStyle} />
              <p style={summaryTextStyle}>요청당 평균 비용 (Cost per Request)은 <span style={summaryValueStyle}>${summaryMetrics.avgCost.toFixed(3)}</span>에요.</p>
              <p style={summaryTextStyle}>평균 응답 시간 (Average Latency)은 <span style={summaryValueStyle}>{summaryMetrics.avgLatency.toFixed(0)}ms</span>에요.</p>
              <div style={summaryGroupGapStyle} />
              <p style={{ ...summaryTextStyle, marginBottom: 0 }}>✔ 월간 확장 시 비용 예측 가능</p>
            </div>

            <div style={{ ...summaryCardStyle, ...(viewTab === "operational" ? summaryCardActiveStyle : {}) }}>
              <div style={summaryCardHeadStyle}>
                <span style={{ ...summaryIconStyle, background: "#fee2e2", color: "#b91c1c" }}>!</span>
                <div style={summaryCardTitleStyle}>운영 리스크 (Risk)</div>
              </div>
              <p style={summaryTextStyle}>👉 사고 가능성 판단</p>
              <div style={summaryGroupGapStyle} />
              <p style={summaryTextStyle}>정책 위반율 (Policy Violation Rate)은 <span style={summaryValueStyle}>{summaryMetrics.avgPolicyViolation.toFixed(1)}%</span>에요.</p>
              <p style={summaryTextStyle}>오류율 (System Error Rate) <span style={summaryValueStyle}>{summaryMetrics.avgErrorRate.toFixed(1)}%</span></p>
              <p style={summaryTextStyle}>수동 개입률 (Manual Intervention Rate) <span style={summaryValueStyle}>{Math.max(0.5, summaryMetrics.avgEditRate * 0.2).toFixed(1)}%</span></p>
              <div style={summaryGroupGapStyle} />
              <p style={{ ...summaryTextStyle, marginBottom: 0 }}>✔ 운영 투입 없이 자동화 가능 여부</p>
            </div>

            <div style={{ ...summaryCardStyle, ...(viewTab === "scaleup" ? summaryCardActiveStyle : {}) }}>
              <div style={summaryCardHeadStyle}>
                <span style={{ ...summaryIconStyle, background: "#dcfce7", color: "#166534" }}>B</span>
                <div style={summaryCardTitleStyle}>비즈니스 가치 (Business Gate)</div>
              </div>
              <p style={summaryTextStyle}>👉 성공 기준 정의</p>
              <div style={summaryGroupGapStyle} />
              <p style={summaryTextStyle}>자동화율 (Automation Rate) ≥ <span style={summaryValueStyle}>X%</span></p>
              <p style={summaryTextStyle}>평균 처리 시간 단축률 (Processing Time Reduction) ≥ <span style={summaryValueStyle}>Y%</span></p>
              <p style={summaryTextStyle}>전환율 (Conversion Rate) +<span style={summaryValueStyle}>Z%p</span></p>
              <p style={summaryTextStyle}>ROI (Return on Investment) ≥ <span style={summaryValueStyle}>기준값</span></p>
              <div style={summaryGroupGapStyle} />
              <p style={{ ...summaryTextStyle, marginBottom: 0 }}>✔ 확장 판단 기준 정의 완료</p>
            </div>
          </div>
          <div style={warningNoteWrapStyle}>
            <p style={warningNoteStyle}>• POC 지표는 조건에 따라 실제 운영과 다를 수 있어요.</p>
            <p style={warningNoteStyle}>• 모델 비교와 참고용으로만 사용해주세요.</p>
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

const smallChipStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  border: "1px solid #dbe2ea",
  borderRadius: 999,
  background: "#f8fafc",
  color: "#334155",
  fontSize: 12,
  fontWeight: 700,
  lineHeight: 1,
  padding: "5px 9px",
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

const summaryCardActiveStyle: CSSProperties = {
  border: "1px solid #93c5fd",
  background: "#f8fbff",
  boxShadow: "0 0 0 1px rgba(147, 197, 253, 0.35), 0 4px 10px rgba(59, 130, 246, 0.08)",
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
