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
  extra: Record<string, string>;
};
type CsvImportDraft = {
  headers: string[];
  rows: string[][];
};
type SampleColIndex = number;
type SampleCell = { row: number; col: SampleColIndex };
type RunColIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
type RunCell = { row: number; col: RunColIndex };

type DatasetState = {
  id: string;
  version: number;
  updatedAt: string;
};

type RunRecord = {
  runId: string;
  taskId: string;
  unitId: string;
  datasetId: string;
  datasetVersion: number;
  modelId: string;
  createdAt: string;
  sampleCount: number;
};

type RawExecutionRow = {
  runId: string;
  sampleId: string;
  modelId: string;
  input: string;
  expectedOutput: string;
  predictedOutput: string;
  latency: number;
  cost: number;
  tokenUsage: number;
  error: number;
  policyFlag: number;
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
  policyViolationRate: number;
  recall: number;
  precision: number;
  f1Score: number;
};

type MetricKey =
  | "editRate"
  | "requirementPassRate"
  | "precision"
  | "recall"
  | "f1Score"
  | "reviewRequiredRate"
  | "policyPassRate"
  | "policyViolationRate"
  | "errorRate"
  | "averageLatency"
  | "costPerRequest"
  | "tokenUsage"
  | "manualInterventionRate";

type MetricDimension = Step5ViewTab;
type ModelStrategySlot = "baseline" | "lowCost" | "specialized";

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

const METRIC_DEFINITIONS: Record<MetricKey, { label: string; dimension: MetricDimension }> = {
  editRate: { label: "수정 비율 (Edit Rate)", dimension: "experiment" },
  requirementPassRate: { label: "요건 충족률 (Requirement Pass Rate)", dimension: "experiment" },
  precision: { label: "정밀도 (Precision)", dimension: "experiment" },
  recall: { label: "재현율 (Recall)", dimension: "experiment" },
  f1Score: { label: "F1 점수 (F1 Score)", dimension: "experiment" },
  reviewRequiredRate: { label: "검토 필요 비율 (Review Required Rate)", dimension: "operational" },
  policyPassRate: { label: "정책 통과율 (Policy Pass Rate)", dimension: "operational" },
  policyViolationRate: { label: "정책 위반율 (Policy Violation Rate)", dimension: "operational" },
  errorRate: { label: "오류율 (Error Rate)", dimension: "operational" },
  averageLatency: { label: "평균 응답 시간 (Average Latency)", dimension: "release" },
  costPerRequest: { label: "요청당 비용 (Cost per Request)", dimension: "release" },
  tokenUsage: { label: "토큰 사용량 (Token Usage)", dimension: "release" },
  manualInterventionRate: { label: "수동 개입률 (Manual Intervention Rate)", dimension: "operational" },
};

const MODEL_STRATEGY_SLOT_LABELS: Record<ModelStrategySlot, string> = {
  baseline: "Baseline (기준 모델)",
  lowCost: "Low Cost (저비용 모델)",
  specialized: "Specialized (특화 모델)",
};

function metricKeyFromLabel(label: string): MetricKey | null {
  const normalized = label.toLowerCase();
  if (normalized.includes("edit rate")) return "editRate";
  if (normalized.includes("requirement pass")) return "requirementPassRate";
  if (normalized.includes("precision")) return "precision";
  if (normalized.includes("recall")) return "recall";
  if (normalized.includes("f1")) return "f1Score";
  if (normalized.includes("review required")) return "reviewRequiredRate";
  if (normalized.includes("policy pass")) return "policyPassRate";
  if (normalized.includes("policy violation")) return "policyViolationRate";
  if (normalized.includes("manual intervention")) return "manualInterventionRate";
  if (normalized.includes("error rate")) return "errorRate";
  if (normalized.includes("latency")) return "averageLatency";
  if (normalized.includes("cost per request")) return "costPerRequest";
  if (normalized.includes("token usage")) return "tokenUsage";
  return null;
}

function extractTaskTypeKey(aiTaskType: string): string {
  const matched = aiTaskType.match(/\(([^)]+)\)\s*$/);
  return matched?.[1] ?? aiTaskType;
}

function buildTaskSpecificPrompt(taskKey: string): string {
  if (taskKey === "draft_generation") {
    return `A) draft_generation (생성/수정비율 중심)

지표: Edit Rate, Policy Pass Rate, Average Latency, Cost per Request

input(JSON)
다음 필드를 포함한다.
{
  "topic": "...",
  "platform": "...",
  "audience": "...",
  "tone": "...",
  "context": "...",
  "length_hint": "short | medium | long"
}

expectedOutput(JSON)
다음 필드를 반드시 포함한다.
{
  "draft_text": "...",
  "policy_pass": true|false,
  "policy_reason": "...",
  "policy_category": "none|spam|hate|privacy|copyright|other",
  "edit_expected": "low | medium | high"
}

설명:
- policy_pass: 정책 통과 여부
- policy_reason: 정책 실패 사유 (없으면 "none")
- policy_category: 정책 위반 분류 집계용 카테고리
- edit_expected: 사람이 수정해야 할 가능성
  - low: 거의 수정 없음
  - medium: 일부 수정 필요
  - high: 많이 수정 필요

중요 규칙:
- policy_pass=true 케이스는 최소 70%
- policy_pass=false 케이스는 정책 위반 예시를 포함
- 초안은 실제 서비스에서 사용할 수 있는 게시글 형태로 작성
- 경계 케이스에는 톤 불일치/표현 어색/정보 부족을 포함`;
  }
  if (taskKey === "revision_suggestion") {
    return `B) revision_suggestion (정밀도/재현율/F1 라벨 계산형)

지표: Edit Rate + Precision/Recall/F1
[Task Specific Rules: revision_suggestion]
- input(JSON)은 반드시 다음을 포함하라:
  {
    "draft_text": "...",
    "improvement_goal": "..."
  }
- expectedOutput(JSON)은 반드시 다음을 포함하라:
  {
    "suggestions_gold": [
      {"type":"typo|tone|policy|clarity|format","span":"문장 일부 또는 키워드","fix":"수정안"}
    ],
    "revised_text_gold": "..."
  }
- 케이스 구성:
  - suggestions_gold 개수 분포를 섞어라: 0개(정상), 1~2개(경미), 3~5개(중간), 6개+(난이도) 포함
  - ambiguity 케이스(고쳐도 되고 안 고쳐도 되는)를 30% 포함하라`;
  }
  if (taskKey === "policy_check") {
    return `C) policy_check (위반율/오류율)

지표: Policy Pass Rate, Policy Violation Rate, Error Rate
[Task Specific Rules: policy_check]
- input(JSON)은 반드시 다음을 포함하라:
  {"content":"..."}
- expectedOutput(JSON)은 반드시 다음을 포함하라:
  {
    "policy_pass": true|false,
    "violation_type": "none|spam|hate|sexual|violence|privacy|copyright|other",
    "violation_reason": "..."
  }
- 케이스 구성:
  - policy_pass=true : false = 60 : 40
  - false 케이스는 violation_type을 최소 4종 이상 섞어라
  - 경계 케이스(모호/풍자/중립적 언급)를 30% 포함하라`;
  }
  return `D) pre_review_gate (수동개입률/게이트 판단)

지표: Manual Intervention Rate, Edit Rate, Latency
[Task Specific Rules: pre_review_gate]
- input(JSON)은 반드시 다음을 포함하라:
  {
    "draft_text":"...",
    "context":"..."
  }
- expectedOutput(JSON)은 반드시 다음을 포함하라:
  {
    "gate_result": "approve|review_required",
    "review_reason": "...",
    "fix_hint": "..."
  }
- 케이스 구성:
  - approve : review_required = 50 : 50 (수동개입률 측정)
- review_required 중 50%는 ‘수정하면 통과 가능’, 50%는 ‘수정해도 어려움(고위험)’로 섞어라.`;
}

function getTaskSchemaDefaults(taskKey: string): { input: string[]; output: string[] } {
  if (taskKey === "draft_generation") {
    return {
      input: ["topic", "platform", "audience", "tone", "context", "length_hint"],
      output: ["draft_text", "policy_pass", "policy_reason", "policy_category", "edit_expected"],
    };
  }
  if (taskKey === "revision_suggestion") {
    return {
      input: ["draft_text", "improvement_goal"],
      output: ["suggestions_gold", "revised_text_gold"],
    };
  }
  if (taskKey === "policy_check") {
    return {
      input: ["content"],
      output: ["policy_pass", "violation_type", "violation_reason"],
    };
  }
  return {
    input: ["draft_text", "context"],
    output: ["gate_result", "review_reason", "fix_hint"],
  };
}

function buildDatasetPrompt(params: {
  serviceName: string;
  featureName: string;
  taskId: string;
  aiTaskType: string;
  purpose: string;
  userFlow: string;
  hitlPolicy: string;
  automationLevel: string;
  exposure: string;
  reversibility: string;
  impact: string;
  inputRequiredFields: string[];
  outputRequiredFields: string[];
  policyConstraints: string[];
  metricPack: string[];
  sampleCount: number;
}) {
  const taskKey = extractTaskTypeKey(params.aiTaskType);
  const metricPackText = params.metricPack.length > 0 ? params.metricPack.join(", ") : "-";
  const defaults = getTaskSchemaDefaults(taskKey);
  const inputRequiredFields = params.inputRequiredFields.length > 0 ? params.inputRequiredFields : defaults.input;
  const outputRequiredFields = params.outputRequiredFields.length > 0 ? params.outputRequiredFields : defaults.output;
  const inputRequired = inputRequiredFields.join(", ");
  const outputRequired = outputRequiredFields.join(", ");
  const constraints = params.policyConstraints.length > 0 ? params.policyConstraints.join(" | ") : "-";
  return `너는 AI 기능 검증용 테스트 데이터셋을 만드는 역할이다.
아래 ‘설계 정보(SSOT)’를 그대로 반영해, 지표 계산이 가능하도록 테스트 케이스를 생성하라.

[SSOT]
- serviceName: ${params.serviceName}
- featureName: ${params.featureName}
- taskId: ${params.taskId}
- aiTaskType: ${params.aiTaskType}
- purpose: ${params.purpose}
- userFlow: ${params.userFlow}
- hitlPolicy: ${params.hitlPolicy}
- automationLevel: ${params.automationLevel}
- exposure: ${params.exposure}
- reversibility: ${params.reversibility}
- impact: ${params.impact}
- inputSchema (required): ${inputRequired}
- outputSchema (required): ${outputRequired}
- constraints/policies: ${constraints}
- metricPack: ${metricPackText}

[목표]
metricPack에 포함된 지표를 계산/비교할 수 있도록,
케이스 구성을 ‘비율로’ 균형 있게 만들고, 필요한 정답 라벨을 expectedOutput에 포함하라.

[생성 규칙]
1) 케이스 수: ${params.sampleCount}개
2) 케이스 분포(반드시 지켜라):
   - 정상/무난 케이스: 40%
   - 경계/애매 케이스: 30%
   - 실패/위반/리스크 케이스: 30%
3) 각 케이스는 다음 컬럼을 가진 CSV 1행이어야 한다:
   sample_id, input, expectedOutput, description, tags, note
4) sample_id는 S-001부터 순번
5) input/expectedOutput은 “JSON 문자열”로 넣어라 (CSV에서 따옴표 이스케이프 준수)
6) tags는 1~3개 키워드(쉼표로 연결), note는 비워도 됨
7) 출력은 반드시 표 형태와 CSV를 함께 반환하라. (설명 금지)

[CSV 헤더]
sample_id,input,expectedOutput,description,tags,note

[Task Specific Rules]
${buildTaskSpecificPrompt(taskKey)}

[출력 형식]
1) 먼저 마크다운 표 형태로 출력:
| sample_id | input | expectedOutput | description | tags | note |
2) 다음으로 동일 데이터의 CSV를 코드블록으로 출력:
\`\`\`csv
sample_id,input,expectedOutput,description,tags,note
...
\`\`\`
3) 표와 CSV의 행 개수/순서는 반드시 동일해야 한다.
`;
}

type Step5TestUnitRow = {
  unitId: string;
  taskId: string;
  datasetId: string;
  serviceName: string;
  featureName: string;
  aiTaskType: string;
  testType: string;
  metricPack: string[];
  status: string;
};
type Step5UnitProgress = "idle" | "sampleReady" | "saved";
type DatasetSourceType = "manual" | "csv" | "ai";
type DatasetColumnDef = { key: string; label: string };

const STEP5_TEST_UNIT_ROWS: Step5TestUnitRow[] = [
  {
    unitId: "UNIT-001",
    taskId: "T-001",
    datasetId: "D-001",
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
    taskId: "T-002",
    datasetId: "D-002",
    serviceName: "콘텐츠 자동화",
    featureName: "개선 제안",
    aiTaskType: "개선 제안 (revision_suggestion)",
    testType: "Offline",
    metricPack: ["수정 비율 (Edit Rate)", "정밀도 (Precision)", "재현율 (Recall)", "F1 점수 (F1 Score)"],
    status: "결과 입력 대기",
  },
  {
    unitId: "UNIT-003",
    taskId: "T-003",
    datasetId: "D-003",
    serviceName: "콘텐츠 자동화",
    featureName: "정책 점검",
    aiTaskType: "정책 점검 (policy_check)",
    testType: "Offline",
    metricPack: ["정책 통과율 (Policy Pass Rate)", "정책 위반율 (Policy Violation Rate)", "오류율 (Error Rate)"],
    status: "결과 입력 대기",
  },
  {
    unitId: "UNIT-004",
    taskId: "T-004",
    datasetId: "D-004",
    serviceName: "콘텐츠 자동화",
    featureName: "정책 점검",
    aiTaskType: "사전 검토 게이트 (pre_review_gate)",
    testType: "Offline",
    metricPack: ["수동 개입률 (Manual Intervention Rate)", "수정 비율 (Edit Rate)", "평균 응답 시간 (Average Latency)"],
    status: "결과 입력 대기",
  },
];

const DEFAULT_DATASET_COLUMNS: DatasetColumnDef[] = [
  { key: "id", label: "샘플 ID" },
  { key: "input", label: "입력 (Input)" },
  { key: "expectedOutput", label: "예상 출력 (Expected Output)" },
  { key: "description", label: "시나리오 (Scenario)" },
  { key: "tags", label: "태그 (Tags)" },
  { key: "note", label: "비고 (Notes)" },
];

const DEFAULT_DATASET_COLUMNS_BY_UNIT: Record<string, DatasetColumnDef[]> = {
  "UNIT-001": [
    { key: "id", label: "샘플 ID" },
    { key: "input", label: "입력 (Input)" },
    { key: "expectedOutput", label: "예상 출력 (Expected Output)" },
    { key: "description", label: "시나리오 (Scenario)" },
    { key: "tags", label: "태그 (Tags)" },
    { key: "note", label: "비고 (Notes)" },
  ],
  "UNIT-002": [
    { key: "id", label: "샘플 ID" },
    { key: "input", label: "기존 문안 (Input)" },
    { key: "expectedOutput", label: "개선 목표 (Expected Output)" },
    { key: "description", label: "개선 기준 (Scenario)" },
    { key: "tags", label: "톤/형식 태그 (Tags)" },
    { key: "note", label: "비고 (Notes)" },
  ],
  "UNIT-003": [
    { key: "id", label: "샘플 ID" },
    { key: "input", label: "검토 문장 (Input)" },
    { key: "expectedOutput", label: "예상 판정 (Expected Output)" },
    { key: "description", label: "정책 기준 (Scenario)" },
    { key: "tags", label: "리스크 태그 (Tags)" },
    { key: "note", label: "비고 (Notes)" },
  ],
  "UNIT-004": [
    { key: "id", label: "샘플 ID" },
    { key: "input", label: "게이트 판단 입력 (Input)" },
    { key: "expectedOutput", label: "검토 필요 여부 (Expected Output)" },
    { key: "description", label: "판단 근거 (Scenario)" },
    { key: "tags", label: "승인 조건 태그 (Tags)" },
    { key: "note", label: "비고 (Notes)" },
  ],
};

const BASE_SAMPLE_KEYS = new Set(["id", "input", "expectedOutput", "description", "tags", "note"]);

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

function createSamplesFromTemplate(unitId: string): SampleInput[] {
  const template = TEST_UNIT_SAMPLE_TEMPLATES[unitId] ?? [];
  return template.map((sample, idx) => ({
    id: `S-${String(idx + 1).padStart(3, "0")}`,
    input: sample.input,
    expectedOutput: sample.expectedOutput || "",
    description: sample.description || "",
    tags: sample.tags || "",
    note: sample.note || "",
    extra: {},
  }));
}

function normalizeSampleIds(samples: SampleInput[]): SampleInput[] {
  return samples.map((sample, idx) => ({ ...sample, id: `S-${String(idx + 1).padStart(3, "0")}`, extra: sample.extra ?? {} }));
}

function isSampleRowFilled(sample: SampleInput): boolean {
  const extraFilled = Object.values(sample.extra ?? {}).some((v) => String(v ?? "").trim().length > 0);
  return Boolean(
    sample.input.trim() ||
      sample.expectedOutput.trim() ||
      sample.description.trim() ||
      sample.tags.trim() ||
      sample.note.trim() ||
      extraFilled
  );
}

function getSampleCellValue(sample: SampleInput, colKey: string): string {
  if (colKey === "id") return sample.id;
  if (colKey === "input") return sample.input;
  if (colKey === "expectedOutput") return sample.expectedOutput;
  if (colKey === "description") return sample.description;
  if (colKey === "tags") return sample.tags;
  if (colKey === "note") return sample.note;
  return sample.extra?.[colKey] ?? "";
}

function setSampleCellValue(sample: SampleInput, colKey: string, value: string): SampleInput {
  if (colKey === "id") return sample;
  if (colKey === "input") return { ...sample, input: value };
  if (colKey === "expectedOutput") return { ...sample, expectedOutput: value };
  if (colKey === "description") return { ...sample, description: value };
  if (colKey === "tags") return { ...sample, tags: value };
  if (colKey === "note") return { ...sample, note: value };
  return { ...sample, extra: { ...(sample.extra ?? {}), [colKey]: value } };
}

function createEmptySample(nextIndex: number): SampleInput {
  return {
    id: `S-${String(nextIndex).padStart(3, "0")}`,
    input: "",
    expectedOutput: "",
    description: "",
    tags: "",
    note: "",
    extra: {},
  };
}

function buildExpandedColumns(columns: DatasetColumnDef[], requiredLength: number): DatasetColumnDef[] {
  if (columns.length >= requiredLength) return columns;
  const next = [...columns];
  let seq = 1;
  while (next.length < requiredLength) {
    const key = `custom_${seq}`;
    if (!next.some((col) => col.key === key)) {
      next.push({ key, label: `컬럼 ${next.length + 1}` });
    }
    seq += 1;
  }
  return next;
}

function buildDefaultRunRow(unitId: string, modelId: string, sampleId: string): PocRunRow {
  return {
    key: `${unitId}::${modelId}::${sampleId}`,
    modelId,
    sampleId,
    predictedOutput: "",
    observedOutput: "",
    editRate: 0,
    confidenceScore: 0,
    errorRate: 0,
    averageLatency: 0,
    costPerRequest: 0,
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

function parseMarkdownTable(text: string): string[][] {
  const lines = text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.includes("|"));
  if (lines.length === 0) return [];

  const rows = lines
    .map((line) => {
      const cleaned = line.replace(/^\|/, "").replace(/\|$/, "");
      return cleaned.split("|").map((cell) => cell.trim());
    })
    .filter((row) => row.length > 0);

  if (rows.length < 2) return rows;

  // markdown separator row: | --- | --- |
  const isSeparator = (row: string[]) => row.every((cell) => /^:?-{3,}:?$/.test(cell));
  return rows.filter((row, idx) => !(idx === 1 && isSeparator(row)));
}

function parseHtmlTableGrid(html: string): string[][] {
  if (!html || !html.includes("<table")) return [];
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const table = doc.querySelector("table");
  if (!table) return [];
  const rows: string[][] = [];
  table.querySelectorAll("tr").forEach((tr) => {
    const cells = Array.from(tr.querySelectorAll("th,td")).map((cell) =>
      (cell.textContent ?? "").replace(/\s+/g, " ").trim()
    );
    if (cells.some((cell) => cell.length > 0)) rows.push(cells);
  });
  return rows;
}

function parseClipboardGridFromData(data: DataTransfer): string[][] {
  const html = data.getData("text/html");
  const htmlGrid = parseHtmlTableGrid(html);
  if (htmlGrid.length > 0) return htmlGrid;

  const text = data.getData("text/plain");
  if (!text) return [];

  if (text.includes("\t")) return parseClipboardGrid(text);

  const markdownGrid = parseMarkdownTable(text);
  if (markdownGrid.length > 0) return markdownGrid;

  if (text.includes(",") && text.includes("\n")) {
    const csvGrid = parseCsv(text);
    if (csvGrid.length > 0) return csvGrid;
  }

  return text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => [line.trim()]);
}

function isMappingHeaderPaste(grid: string[][]) {
  if (grid.length < 2 || grid[0].length < 2) return false;
  const firstRow = grid[0].map((cell) => cell.trim().toLowerCase());
  if (firstRow.some((cell) => cell.includes("{") || cell.includes("}"))) return false;
  const keyword = /(input|입력|설명|description|sample_id|sample id|샘플 id|output|expected|예상|scenario|시나리오|tags|태그|notes|비고)/i;
  const matchedCount = firstRow.filter((cell) => keyword.test(cell)).length;
  return matchedCount >= 2;
}

function isSampleIdValue(value: string) {
  const v = value.trim();
  return /^s[-_ ]?\d+$/i.test(v);
}

function shouldDropSampleIdFirstColumn(grid: string[][]) {
  if (grid.length === 0) return false;
  const nonEmptyRows = grid.filter((row) => row.some((cell) => cell.trim().length > 0));
  if (nonEmptyRows.length === 0) return false;
  const hits = nonEmptyRows.filter((row) => isSampleIdValue(row[0] ?? "")).length;
  return hits / nonEmptyRows.length >= 0.7;
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

function safeDiv(value: number, denominator: number) {
  return denominator > 0 ? value / denominator : 0;
}

function formatActionTime(d = new Date()) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
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
    return STEP5_TEST_UNIT_ROWS.reduce<Record<string, Step5UnitProgress>>((acc, row) => {
      acc[row.unitId] = "idle";
      return acc;
    }, {});
  });
  const [datasetSourceByUnit, setDatasetSourceByUnit] = useState<Record<string, DatasetSourceType | null>>(() =>
    STEP5_TEST_UNIT_ROWS.reduce<Record<string, DatasetSourceType | null>>((acc, row) => {
      acc[row.unitId] = null;
      return acc;
    }, {})
  );
  const [datasetDirtyByUnit, setDatasetDirtyByUnit] = useState<Record<string, boolean>>(() =>
    STEP5_TEST_UNIT_ROWS.reduce<Record<string, boolean>>((acc, row) => {
      acc[row.unitId] = false;
      return acc;
    }, {})
  );
  const [datasetLogByUnit, setDatasetLogByUnit] = useState<Record<string, string[]>>(() =>
    STEP5_TEST_UNIT_ROWS.reduce<Record<string, string[]>>((acc, row) => {
      acc[row.unitId] = [];
      return acc;
    }, {})
  );
  const [datasetColumnsByUnit, setDatasetColumnsByUnit] = useState<Record<string, DatasetColumnDef[]>>(() =>
    STEP5_TEST_UNIT_ROWS.reduce<Record<string, DatasetColumnDef[]>>((acc, row) => {
      const byUnit = DEFAULT_DATASET_COLUMNS_BY_UNIT[row.unitId] ?? DEFAULT_DATASET_COLUMNS;
      acc[row.unitId] = byUnit.map((col) => ({ ...col }));
      return acc;
    }, {})
  );
  const [datasetsByUnit, setDatasetsByUnit] = useState<Record<string, DatasetState>>(() =>
    STEP5_TEST_UNIT_ROWS.reduce<Record<string, DatasetState>>((acc, row) => {
      acc[row.unitId] = {
        id: row.datasetId,
        version: 1,
        updatedAt: formatActionTime(),
      };
      return acc;
    }, {})
  );
  const [modelCatalog] = useState<ModelOption[]>(MOCK_MODEL_OPTIONS);
  const [selectedModelIds] = useState<string[]>(() => MOCK_MODEL_OPTIONS.slice(0, 3).map((model) => model.id));
  const [samplesByUnit, setSamplesByUnit] = useState<Record<string, SampleInput[]>>(() =>
    STEP5_TEST_UNIT_ROWS.reduce<Record<string, SampleInput[]>>((acc, row) => {
      acc[row.unitId] = [createEmptySample(1)];
      return acc;
    }, {})
  );
  const [runRowsByUnit, setRunRowsByUnit] = useState<Record<string, PocRunRow[]>>(() =>
    STEP5_TEST_UNIT_ROWS.reduce<Record<string, PocRunRow[]>>((acc, row) => {
      acc[row.unitId] = [];
      return acc;
    }, {})
  );
  const [runRecordsByUnit, setRunRecordsByUnit] = useState<Record<string, RunRecord[]>>(() =>
    STEP5_TEST_UNIT_ROWS.reduce<Record<string, RunRecord[]>>((acc, row) => {
      acc[row.unitId] = [];
      return acc;
    }, {})
  );
  const [rawExecutionRowsByUnit, setRawExecutionRowsByUnit] = useState<Record<string, RawExecutionRow[]>>(() =>
    STEP5_TEST_UNIT_ROWS.reduce<Record<string, RawExecutionRow[]>>((acc, row) => {
      acc[row.unitId] = [];
      return acc;
    }, {})
  );
  const [nextRunSeq, setNextRunSeq] = useState(1);
  const [message, setMessage] = useState("");
  const [isRunningTest, setIsRunningTest] = useState(false);
  const [activeSampleCell, setActiveSampleCell] = useState<SampleCell | null>(null);
  const [activeSampleHeaderCol, setActiveSampleHeaderCol] = useState<number | null>(null);
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
  const appendDatasetLog = useCallback((unitId: string, text: string) => {
    setDatasetLogByUnit((prev) => {
      const next = [...(prev[unitId] ?? []), `${formatActionTime()} · ${text}`];
      return { ...prev, [unitId]: next.slice(-3) };
    });
  }, []);
  const bumpDatasetVersion = useCallback((unitId: string) => {
    setDatasetsByUnit((prev) => {
      const current = prev[unitId];
      if (!current) return prev;
      return {
        ...prev,
        [unitId]: {
          ...current,
          version: current.version + 1,
          updatedAt: formatActionTime(),
        },
      };
    });
  }, []);

  const handleCreateSampleSet = useCallback((unitId: string) => {
    const nextSamples = normalizeSampleIds(createSamplesFromTemplate(unitId));
    if (nextSamples.length === 0) {
      setMessage("이 테스트 조건에 연결된 샘플 템플릿이 없어요.");
      return;
    }
    setDatasetSourceByUnit((prev) => ({ ...prev, [unitId]: "ai" }));
    setActiveTestUnitId(unitId);
    setSamplesByUnit((prev) => ({ ...prev, [unitId]: nextSamples }));
    setDatasetDirtyByUnit((prev) => ({ ...prev, [unitId]: true }));
    setUnitProgressById((prev) => ({ ...prev, [unitId]: "sampleReady" }));
    appendDatasetLog(unitId, `데이터 자동 생성 · 샘플 ${nextSamples.length}개`);
    setMessage(`데이터 자동 생성 완료: ${unitId} · 샘플 ${nextSamples.length}개`);
    setIsRunInputExpanded(true);
    requestAnimationFrame(() => {
      testRunResultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [appendDatasetLog]);

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
    const unitId =
      STEP5_TEST_UNIT_ROWS.some((row) => row.unitId === activeTestUnitId)
        ? activeTestUnitId
        : (STEP5_TEST_UNIT_ROWS[0]?.unitId ?? "");
    if (!unitId) return;
      const currentSamples = samplesByUnit[unitId] ?? [];
    setRunRowsByUnit((prev) => {
      const prevRows = prev[unitId] ?? [];
      const sampleIds = currentSamples.filter(isSampleRowFilled).map((s) => s.id.trim()).filter(Boolean);
      const prevMap = new Map(prevRows.map((row) => [row.key, row]));
      const nextRows: PocRunRow[] = [];
      selectedModelIds.forEach((modelId) => {
        sampleIds.forEach((sampleId) => {
          const key = `${unitId}::${modelId}::${sampleId}`;
          const existing = prevMap.get(key);
          if (existing) {
            nextRows.push(existing);
            return;
          }
          nextRows.push(buildDefaultRunRow(unitId, modelId, sampleId));
        });
      });
      if (nextRows.length === 0 && prevRows.length === 0) return prev;
      return { ...prev, [unitId]: nextRows };
    });
  }, [activeTestUnitId, samplesByUnit, selectedModelIds]);

  const modelMap = useMemo(() => new Map(modelCatalog.map((model) => [model.id, model])), [modelCatalog]);
  const normalizedActiveTestUnitId = useMemo(
    () =>
      STEP5_TEST_UNIT_ROWS.some((row) => row.unitId === activeTestUnitId)
        ? activeTestUnitId
        : (STEP5_TEST_UNIT_ROWS[0]?.unitId ?? ""),
    [activeTestUnitId]
  );
  const samples = useMemo(() => samplesByUnit[normalizedActiveTestUnitId] ?? [], [normalizedActiveTestUnitId, samplesByUnit]);
  const runRows = useMemo(() => runRowsByUnit[normalizedActiveTestUnitId] ?? [], [normalizedActiveTestUnitId, runRowsByUnit]);
  const sampleMap = useMemo(() => new Map(samples.map((sample) => [sample.id, sample])), [samples]);
  const sampleDisplayMap = useMemo(() => new Map(samples.map((sample, idx) => [sample.id, sample.savedId || `임시-${idx + 1}`])), [samples]);
  const activeDataset = useMemo(
    () =>
      (normalizedActiveTestUnitId ? datasetsByUnit[normalizedActiveTestUnitId] : null) ?? {
        id: "D-000",
        version: 1,
        updatedAt: "-",
      },
    [datasetsByUnit, normalizedActiveTestUnitId]
  );
  const sampleSetModelSlots = useMemo(
    () =>
      selectedModelIds.map((modelId, idx) => {
        const slot: ModelStrategySlot = idx === 0 ? "baseline" : idx === 1 ? "lowCost" : "specialized";
        const model = modelMap.get(modelId);
        return {
          slot,
          slotLabel: MODEL_STRATEGY_SLOT_LABELS[slot],
          modelName: model?.name ?? modelId,
          provider: model?.provider ?? "-",
          version: model?.version ?? "-",
        };
      }),
    [modelMap, selectedModelIds]
  );
  const scenarioMetricLines = useCallback(
    (metrics: string[]) =>
      metrics
        .map((metric) => metricKeyFromLabel(metric))
        .filter((metric): metric is MetricKey => Boolean(metric))
        .map((metric) => METRIC_DEFINITIONS[metric].label),
    []
  );

  const core10ByModel = useMemo(() => {
    return selectedModelIds.map((modelId) => {
      const rows = runRows.filter((row) => row.modelId === modelId);
      const count = rows.length || 1;
      const avgPolicyViolationRate = rows.reduce((acc, row) => acc + row.policyViolationRate, 0) / count;
      const avg = {
        editRate: rows.reduce((acc, row) => acc + row.editRate, 0) / count,
        confidenceScore: rows.reduce((acc, row) => acc + row.confidenceScore, 0) / count,
        errorRate: rows.reduce((acc, row) => acc + row.errorRate, 0) / count,
        averageLatency: rows.reduce((acc, row) => acc + row.averageLatency, 0) / count,
        costPerRequest: rows.reduce((acc, row) => acc + row.costPerRequest, 0) / count,
        policyViolationRate: avgPolicyViolationRate,
        policyPassRate: Math.max(0, 100 - avgPolicyViolationRate),
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
    const records = runRecordsByUnit[normalizedActiveTestUnitId] ?? [];
    const rawRows = rawExecutionRowsByUnit[normalizedActiveTestUnitId] ?? [];
    if (records.length === 0) {
      return core10ByModel.map((row, idx) => ({
        testRunId: `R-${String(idx + 1).padStart(3, "0")}`,
        modelName: row.modelName,
        sampleCount: 0,
        datasetVersion: activeDataset.version,
        editRate: row.editRate,
        precision: row.precision,
        recall: row.recall,
        f1Score: row.f1Score,
        requirementPassRate: row.policyPassRate,
        policyViolationRate: row.policyViolationRate,
        errorRate: row.errorRate,
        costPerRequest: row.costPerRequest,
        tokenUsage: 0,
        averageLatency: row.averageLatency,
        manualInterventionRate: Math.max(0.5, row.editRate * 0.2),
        automationRate: Math.max(0, 100 - row.editRate),
        processingTimeReduction: Math.max(0, Math.min(60, 30 - row.averageLatency / 100)),
        conversionRate: Math.max(0, Math.min(100, (100 - row.errorRate * 2 - row.editRate * 0.3) * 0.16)),
        roi: 0,
      }));
    }

    const latestRunByModel = new Map<string, RunRecord>();
    records.forEach((record) => {
      const prev = latestRunByModel.get(record.modelId);
      if (!prev || prev.runId < record.runId) latestRunByModel.set(record.modelId, record);
    });

    return selectedModelIds.map((modelId, idx) => {
      const model = modelMap.get(modelId);
      const record = latestRunByModel.get(modelId);
      const scopedRows = record ? rawRows.filter((row) => row.runId === record.runId) : [];
      const count = scopedRows.length || 1;
      const avg = {
        editRate: scopedRows.reduce((acc, row) => acc + Number(row.predictedOutput !== row.expectedOutput), 0) / count * 100,
        precision: safeDiv(scopedRows.reduce((acc, row) => acc + (row.policyFlag === 0 ? 1 : 0), 0), count),
        recall: safeDiv(scopedRows.reduce((acc, row) => acc + (row.policyFlag === 0 ? 1 : 0), 0), count),
        f1Score: safeDiv(scopedRows.reduce((acc, row) => acc + (row.policyFlag === 0 ? 1 : 0), 0), count),
        requirementPassRate: 100 - safeDiv(scopedRows.reduce((acc, row) => acc + row.policyFlag, 0), count) * 100,
        policyViolationRate: safeDiv(scopedRows.reduce((acc, row) => acc + row.policyFlag, 0), count) * 100,
        errorRate: safeDiv(scopedRows.reduce((acc, row) => acc + row.error, 0), count) * 100,
        averageLatency: safeDiv(scopedRows.reduce((acc, row) => acc + row.latency, 0), count),
        costPerRequest: safeDiv(scopedRows.reduce((acc, row) => acc + row.cost, 0), count),
        tokenUsage: scopedRows.reduce((acc, row) => acc + row.tokenUsage, 0),
      };
      const automationRate = Math.max(0, 100 - avg.editRate);
      const processingTimeReduction = Math.max(0, Math.min(60, 30 - avg.averageLatency / 100));
      const conversionRate = Math.max(0, Math.min(100, (100 - avg.errorRate * 2 - avg.editRate * 0.3) * 0.16));
      const roi = Math.max(0, conversionRate * 2 - avg.costPerRequest * 100);
      return {
        testRunId: record?.runId ?? `R-${String(idx + 1).padStart(3, "0")}`,
        modelName: model?.name ?? modelId,
        sampleCount: record?.sampleCount ?? 0,
        datasetVersion: record?.datasetVersion ?? activeDataset.version,
        ...avg,
        manualInterventionRate: Math.max(0.5, avg.editRate * 0.2),
        automationRate,
        processingTimeReduction,
        conversionRate,
        roi,
      };
    });
  }, [
    activeDataset.version,
    core10ByModel,
    modelMap,
    normalizedActiveTestUnitId,
    rawExecutionRowsByUnit,
    runRecordsByUnit,
    selectedModelIds,
  ]);
  const activeTestUnit = useMemo(
    () => STEP5_TEST_UNIT_ROWS.find((row) => row.unitId === normalizedActiveTestUnitId) ?? STEP5_TEST_UNIT_ROWS[0],
    [normalizedActiveTestUnitId]
  );
  const activeDatasetColumns = useMemo(
    () => datasetColumnsByUnit[normalizedActiveTestUnitId] ?? DEFAULT_DATASET_COLUMNS,
    [datasetColumnsByUnit, normalizedActiveTestUnitId]
  );
  const activeMetricKeys = useMemo<MetricKey[]>(() => {
    const keys: MetricKey[] = [];
    (activeTestUnit?.metricPack ?? []).forEach((label) => {
      const key = metricKeyFromLabel(label);
      if (key && !keys.includes(key)) keys.push(key);
    });
    return keys;
  }, [activeTestUnit]);
  const viewTabHasMetrics = useMemo(() => {
    return VIEW_TABS.reduce<Record<Step5ViewTab, boolean>>((acc, tab) => {
      acc[tab.key] = activeMetricKeys.some((key) => METRIC_DEFINITIONS[key].dimension === tab.key);
      return acc;
    }, { experiment: false, release: false, operational: false, scaleup: false });
  }, [activeMetricKeys]);
  const effectiveViewTab = useMemo(
    () => (viewTabHasMetrics[viewTab] ? viewTab : (VIEW_TABS.find((tab) => viewTabHasMetrics[tab.key])?.key ?? viewTab)),
    [viewTab, viewTabHasMetrics]
  );
  const activeViewMeta = useMemo(
    () => VIEW_TABS.find((tab) => tab.key === effectiveViewTab) ?? VIEW_TABS[0],
    [effectiveViewTab]
  );
  const activeViewLabelEn = useMemo(() => {
    if (effectiveViewTab === "experiment") return "Experiment";
    if (effectiveViewTab === "release") return "Release";
    if (effectiveViewTab === "operational") return "Operational";
    return "Scale-up";
  }, [effectiveViewTab]);
  const activeViewMetricKeys = useMemo(
    () => activeMetricKeys.filter((key) => METRIC_DEFINITIONS[key].dimension === effectiveViewTab),
    [activeMetricKeys, effectiveViewTab]
  );
  const activeMetricDimensionLabels = useMemo(() => {
    const order: Step5ViewTab[] = ["experiment", "release", "operational", "scaleup"];
    const labelMap: Record<Step5ViewTab, string> = {
      experiment: "품질",
      release: "비용",
      operational: "운영 리스크",
      scaleup: "비즈니스 가치",
    };
    const dims = new Set(activeMetricKeys.map((key) => METRIC_DEFINITIONS[key].dimension));
    return order.filter((k) => dims.has(k)).map((k) => labelMap[k]);
  }, [activeMetricKeys]);
  const filledSampleCount = useMemo(() => samples.filter(isSampleRowFilled).length, [samples]);
  const runContextTask = useMemo(
    () => extractTaskTypeKey(activeTestUnit?.aiTaskType ?? ""),
    [activeTestUnit]
  );
  const externalPrompt = useMemo(() => {
    const purpose = step1Data?.why?.trim() || `${activeTestUnit?.featureName ?? "기능"} 테스트`;
    const userFlow = step2Data?.user_flow?.trim() || "-";
    const behaviorText = [step2Data?.ai_intervention, step2Data?.human_control, step2Data?.system_process].filter(Boolean);
    const policyConstraints = [step3PolicyMetrics?.approvalLevel, step3PolicyMetrics?.dataPolicy, ...behaviorText].filter(
      Boolean
    ) as string[];
    const inputRequiredFields = activeDatasetColumns
      .filter((c) => c.key !== "id" && c.label.toLowerCase().includes("input"))
      .map((c) => c.key);
    const outputRequiredFields = activeDatasetColumns
      .filter((c) => c.label.toLowerCase().includes("expected") || c.label.toLowerCase().includes("output"))
      .map((c) => c.key);
    return buildDatasetPrompt({
      serviceName: activeTestUnit?.serviceName ?? "-",
      featureName: activeTestUnit?.featureName ?? "-",
      taskId: activeTestUnit?.taskId ?? "-",
      aiTaskType: extractTaskTypeKey(activeTestUnit?.aiTaskType ?? "-"),
      purpose,
      userFlow,
      hitlPolicy: step1Data?.hitl || "-",
      automationLevel: step3PolicyMetrics?.executionLevel || "-",
      exposure: step1Data?.exposure || "-",
      reversibility: step1Data?.reversibility || "-",
      impact: step1Data?.impact || "-",
      inputRequiredFields,
      outputRequiredFields,
      policyConstraints,
      metricPack: scenarioMetricLines(activeTestUnit?.metricPack ?? []),
      sampleCount: Math.max(20, filledSampleCount || 20),
    });
  }, [
    activeDatasetColumns,
    activeTestUnit,
    filledSampleCount,
    scenarioMetricLines,
    step1Data?.exposure,
    step1Data?.hitl,
    step1Data?.impact,
    step1Data?.reversibility,
    step1Data?.why,
    step2Data?.user_flow,
    step2Data?.ai_intervention,
    step2Data?.human_control,
    step2Data?.system_process,
    step3PolicyMetrics,
  ]);
  const runInputDisabled =
    !normalizedActiveTestUnitId || samples.length === 0 || unitProgressById[normalizedActiveTestUnitId] === "idle";
  const hasMetric = useCallback((key: MetricKey) => activeMetricKeys.includes(key), [activeMetricKeys]);
  const testRunTable = useMemo(() => {
    const baseHeaders = ["런 ID (Run ID)", "모델 (Model)", "샘플 수 (Sample Size)"];
    const metricHeaders = activeViewMetricKeys.map((key) => METRIC_DEFINITIONS[key].label);
    const headers = metricHeaders.length > 0 ? [...baseHeaders, ...metricHeaders] : [...baseHeaders, "안내"];
    const formatMetricValue = (row: (typeof testRunBaseRows)[number], key: MetricKey) => {
      if (key === "tokenUsage") return row.tokenUsage.toLocaleString();
      if (key === "averageLatency") return `${row.averageLatency.toFixed(0)}ms`;
      if (key === "costPerRequest") return `$${row.costPerRequest.toFixed(3)}`;
      if (key === "precision" || key === "recall" || key === "f1Score") return row[key].toFixed(2);
      if (key === "policyPassRate") return `${(100 - row.policyViolationRate).toFixed(1)}%`;
      return `${row[key].toFixed(1)}%`;
    };
    const rows = testRunBaseRows.map((row) => {
      const baseRow = [row.testRunId, row.modelName, String(row.sampleCount)];
      if (activeViewMetricKeys.length === 0) return [...baseRow, "이 태스크에는 이 관점에서 측정 지표가 없습니다."];
      return [...baseRow, ...activeViewMetricKeys.map((key) => formatMetricValue(row, key))];
    });
    return { headers, rows };
  }, [activeViewMetricKeys, testRunBaseRows]);

  const summaryMetrics = useMemo(() => {
    const safeDiv = (value: number, denominator: number) => (denominator > 0 ? value / denominator : 0);
    const count = runRows.length;
    const avgEditRate = safeDiv(runRows.reduce((acc, row) => acc + row.editRate, 0), count);
    const avgConfidence = safeDiv(runRows.reduce((acc, row) => acc + row.confidenceScore, 0), count);
    const avgErrorRate = safeDiv(runRows.reduce((acc, row) => acc + row.errorRate, 0), count);
    const avgLatency = safeDiv(runRows.reduce((acc, row) => acc + row.averageLatency, 0), count);
    const avgCost = safeDiv(runRows.reduce((acc, row) => acc + row.costPerRequest, 0), count);
    const avgPolicyViolation = safeDiv(runRows.reduce((acc, row) => acc + row.policyViolationRate, 0), count);
    const avgPolicyPass = Math.max(0, 100 - avgPolicyViolation);
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

  function updateSample(index: number, columnKey: string, value: string) {
    if (!normalizedActiveTestUnitId) return;
    if (columnKey === "id") return;
    setDatasetSourceByUnit((prev) => ({ ...prev, [normalizedActiveTestUnitId]: "manual" }));
    setDatasetDirtyByUnit((prev) => ({ ...prev, [normalizedActiveTestUnitId]: true }));
    setSamplesByUnit((prev) => {
      const current = prev[normalizedActiveTestUnitId] ?? [];
      return {
        ...prev,
        [normalizedActiveTestUnitId]: normalizeSampleIds(
          current.map((sample, i) => (i === index ? setSampleCellValue(sample, columnKey, value) : sample))
        ),
      };
    });
  }

  function isActiveSampleCell(row: number, col: SampleColIndex) {
    return activeSampleCell?.row === row && activeSampleCell?.col === col;
  }

  function startSampleCellSelection(row: number, col: SampleColIndex) {
    const cell = { row, col };
    setActiveSampleHeaderCol(null);
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
    if (!normalizedActiveTestUnitId) return;
    const columns = datasetColumnsByUnit[normalizedActiveTestUnitId] ?? DEFAULT_DATASET_COLUMNS;
    setSamplesByUnit((prev) => {
      const current = prev[normalizedActiveTestUnitId] ?? [];
      return {
        ...prev,
        [normalizedActiveTestUnitId]: current.map((sample, rowIndex) => {
        if (rowIndex < rowMin || rowIndex > rowMax) return sample;
        let next = { ...sample };
        for (let col = colMin; col <= colMax; col += 1) {
          const colKey = columns[col]?.key;
          if (!colKey || colKey === "id") continue;
          next = setSampleCellValue(next, colKey, "");
        }
        return next;
        }),
      };
    });
  }

  function handleSampleSheetKeyDownCapture(e: React.KeyboardEvent<HTMLDivElement>) {
    if (!sampleSelectionRange) return;
    if (e.key !== "Backspace" && e.key !== "Delete") return;
    e.preventDefault();
    clearSelectedSampleCells();
  }

  function applySampleGridToUnit(
    unitId: string,
    startRow: number,
    startCol: SampleColIndex,
    grid: string[][],
    columns: DatasetColumnDef[]
  ) {
    setDatasetSourceByUnit((prev) => ({ ...prev, [unitId]: "manual" }));
    setDatasetDirtyByUnit((prev) => ({ ...prev, [unitId]: true }));
    setUnitProgressById((prev) => ({ ...prev, [unitId]: "sampleReady" }));
    setSamplesByUnit((prev) => {
      const current = prev[unitId] ?? [];
      const next = [...current];
      const requiredRows = startRow + grid.length;
      while (next.length < requiredRows) {
        next.push(createEmptySample(next.length + 1));
      }
      for (let r = 0; r < grid.length; r += 1) {
        const rowIndex = startRow + r;
        let row = { ...next[rowIndex] };
        for (let c = 0; c < grid[r].length; c += 1) {
          const colIndex = startCol + c;
          if (colIndex >= columns.length) break;
          const colKey = columns[colIndex]?.key;
          if (!colKey || colKey === "id") continue;
          row = setSampleCellValue(row, colKey, grid[r][c]);
        }
        next[rowIndex] = row;
      }
      return { ...prev, [unitId]: normalizeSampleIds(next) };
    });
  }

  function handleSampleSheetPaste(startRow: number, startCol: SampleColIndex, e: React.ClipboardEvent<HTMLInputElement>) {
    const grid = parseClipboardGridFromData(e.clipboardData);
    if (grid.length === 0) return;
    if (!normalizedActiveTestUnitId) return;
    const currentColumns = datasetColumnsByUnit[normalizedActiveTestUnitId] ?? DEFAULT_DATASET_COLUMNS;

    if (startRow === 0 && startCol === 0 && isMappingHeaderPaste(grid)) {
      e.preventDefault();
      const [headers, ...rows] = grid;
      const expanded = buildExpandedColumns(currentColumns, Math.max(currentColumns.length, headers.length));
      const labeled = expanded.map((column, idx) => ({ ...column, label: headers[idx]?.trim() || column.label }));
      setDatasetColumnsByUnit((prev) => ({ ...prev, [normalizedActiveTestUnitId]: labeled }));
      applySampleGridToUnit(normalizedActiveTestUnitId, 0, 0, rows, labeled);
      setMessage(`헤더 포함 붙여넣기 완료: 데이터 ${rows.length}행`);
      return;
    }
    e.preventDefault();
    const start = startCol === 0 ? 1 : startCol;
    const normalizedGrid =
      startCol === 0 && shouldDropSampleIdFirstColumn(grid)
        ? grid.map((row) => row.slice(1))
        : grid;
    const gridWidth = Math.max(...normalizedGrid.map((row) => row.length));
    const requiredCols = start + gridWidth;
    const expanded = buildExpandedColumns(currentColumns, requiredCols);
    if (expanded.length !== currentColumns.length) {
      setDatasetColumnsByUnit((prev) => ({ ...prev, [normalizedActiveTestUnitId]: expanded }));
    }
    applySampleGridToUnit(normalizedActiveTestUnitId, startRow, start, normalizedGrid, expanded);
  }

  function addDatasetColumn() {
    if (!normalizedActiveTestUnitId) return;
    const current = datasetColumnsByUnit[normalizedActiveTestUnitId] ?? DEFAULT_DATASET_COLUMNS;
    const next = buildExpandedColumns(current, current.length + 1);
    setDatasetColumnsByUnit((prev) => ({ ...prev, [normalizedActiveTestUnitId]: next }));
    setDatasetDirtyByUnit((prev) => ({ ...prev, [normalizedActiveTestUnitId]: true }));
  }

  function removeDatasetColumn(colIndex: number) {
    if (!normalizedActiveTestUnitId) return;
    const current = datasetColumnsByUnit[normalizedActiveTestUnitId] ?? DEFAULT_DATASET_COLUMNS;
    const target = current[colIndex];
    if (!target || target.key === "id") return;
    const nextColumns = current.filter((_, i) => i !== colIndex);
    setDatasetColumnsByUnit((prev) => ({ ...prev, [normalizedActiveTestUnitId]: nextColumns }));
    setDatasetDirtyByUnit((prev) => ({ ...prev, [normalizedActiveTestUnitId]: true }));
    if (!BASE_SAMPLE_KEYS.has(target.key)) {
      setSamplesByUnit((prev) => {
        const rows = prev[normalizedActiveTestUnitId] ?? [];
        return {
          ...prev,
          [normalizedActiveTestUnitId]: rows.map((sample) => {
            const extra = { ...(sample.extra ?? {}) };
            delete extra[target.key];
            return { ...sample, extra };
          }),
        };
      });
    }
  }

  function addDatasetRow() {
    if (!normalizedActiveTestUnitId) return;
    setSamplesByUnit((prev) => {
      const current = prev[normalizedActiveTestUnitId] ?? [];
      const next = [...current, createEmptySample(current.length + 1)];
      return { ...prev, [normalizedActiveTestUnitId]: normalizeSampleIds(next) };
    });
    setDatasetDirtyByUnit((prev) => ({ ...prev, [normalizedActiveTestUnitId]: true }));
  }

  function removeDatasetRow(rowIndex: number) {
    if (!normalizedActiveTestUnitId) return;
    setSamplesByUnit((prev) => {
      const current = prev[normalizedActiveTestUnitId] ?? [];
      const next = current.filter((_, idx) => idx !== rowIndex);
      return { ...prev, [normalizedActiveTestUnitId]: normalizeSampleIds(next) };
    });
    setDatasetDirtyByUnit((prev) => ({ ...prev, [normalizedActiveTestUnitId]: true }));
  }

  function openCsvUpload() {
    csvInputRef.current?.click();
  }

  function handleAutoGenerateDataset() {
    if (!normalizedActiveTestUnitId) return;
    handleCreateSampleSet(normalizedActiveTestUnitId);
  }

  function guessHeader(headers: string[], patterns: RegExp[]) {
    const normalized = headers.map((header) => header.trim().toLowerCase());
    const idx = normalized.findIndex((value) => patterns.some((re) => re.test(value)));
    return idx >= 0 ? headers[idx] : headers[0] || "";
  }

  function handleCsvUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (normalizedActiveTestUnitId) {
      setDatasetSourceByUnit((prev) => ({ ...prev, [normalizedActiveTestUnitId]: "csv" }));
      appendDatasetLog(normalizedActiveTestUnitId, `CSV 첨부 · ${file.name}`);
    }
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
      .map((row) => ({
        id: "",
        input: row[inputIndex] ?? "",
        expectedOutput: expectedIndex >= 0 ? row[expectedIndex] ?? "" : "",
        description: descriptionIndex >= 0 ? row[descriptionIndex] ?? "" : "",
        tags: tagsIndex >= 0 ? row[tagsIndex] ?? "" : "",
        note: noteIndex >= 0 ? row[noteIndex] ?? "" : "",
        extra: {},
      }))
      .filter((row) => row.input.trim() || row.expectedOutput.trim() || row.description.trim() || row.tags.trim() || row.note.trim());
    if (mapped.length === 0) {
      setMessage("매핑된 데이터가 비어 있어요. 컬럼 선택을 바꿔보세요.");
      return;
    }
    if (normalizedActiveTestUnitId) {
      setSamplesByUnit((prev) => ({ ...prev, [normalizedActiveTestUnitId]: normalizeSampleIds(mapped) }));
      setDatasetSourceByUnit((prev) => ({ ...prev, [normalizedActiveTestUnitId]: "csv" }));
      setDatasetDirtyByUnit((prev) => ({ ...prev, [normalizedActiveTestUnitId]: true }));
      setUnitProgressById((prev) => ({ ...prev, [normalizedActiveTestUnitId]: "sampleReady" }));
      appendDatasetLog(normalizedActiveTestUnitId, `CSV 반영 완료 · 샘플 ${mapped.length}개`);
    }
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
    if (!normalizedActiveTestUnitId) return;
    setRunRowsByUnit((prev) => {
      const current = prev[normalizedActiveTestUnitId] ?? [];
      return {
        ...prev,
        [normalizedActiveTestUnitId]: current.map((row) => {
          if (row.key !== key) return row;
          if (field === "predictedOutput" || field === "observedOutput") {
            return { ...row, [field]: value };
          }
          const numeric = Number(value);
          return { ...row, [field]: Number.isFinite(numeric) ? numeric : 0 };
        }),
      };
    });
  }

  const runColKeys: Array<keyof PocRunRow> = [
    "observedOutput",
    "editRate",
    "confidenceScore",
    "errorRate",
    "averageLatency",
    "costPerRequest",
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
    if (!normalizedActiveTestUnitId) return;
    setRunRowsByUnit((prev) => {
      const current = prev[normalizedActiveTestUnitId] ?? [];
      return {
        ...prev,
        [normalizedActiveTestUnitId]: current.map((row, rowIndex) => {
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
        }),
      };
    });
  }

  function handleRunSheetKeyDownCapture(e: React.KeyboardEvent<HTMLDivElement>) {
    if (!runSelectionRange) return;
    if (e.key !== "Backspace" && e.key !== "Delete") return;
    e.preventDefault();
    clearSelectedRunCells();
  }

  function handleRunSheetPaste(startRow: number, startCol: RunColIndex, e: React.ClipboardEvent<HTMLInputElement>) {
    const grid = parseClipboardGridFromData(e.clipboardData);
    if (grid.length === 0) return;
    e.preventDefault();
    if (!normalizedActiveTestUnitId) return;
    setRunRowsByUnit((prev) => {
      const current = prev[normalizedActiveTestUnitId] ?? [];
      const next = [...current];
      for (let r = 0; r < grid.length; r += 1) {
        const rowIndex = startRow + r;
        if (rowIndex >= next.length) break;
        const row = { ...next[rowIndex] };
        for (let c = 0; c < grid[r].length; c += 1) {
          const colIndex = startCol + c;
          if (colIndex > 9) break;
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
      return { ...prev, [normalizedActiveTestUnitId]: next };
    });
  }

  function handleSavePoc() {
    if (!normalizedActiveTestUnitId) return;
    const unitId = normalizedActiveTestUnitId;
    const unitMeta = STEP5_TEST_UNIT_ROWS.find((row) => row.unitId === unitId);
    const currentDataset = datasetsByUnit[unitId];
    const dirty = datasetDirtyByUnit[unitId] ?? false;
    const nextDatasetVersion = currentDataset ? (dirty ? currentDataset.version + 1 : currentDataset.version) : 1;
    const validSamples = samples.filter(isSampleRowFilled);
    const now = formatActionTime();

    setSamplesByUnit((prev) => {
      const current = prev[unitId] ?? [];
      return {
        ...prev,
        [unitId]: current.map((sample, idx) => ({ ...sample, savedId: `S-${String(idx + 1).padStart(3, "0")}` })),
      };
    });
    setUnitProgressById((prev) => ({ ...prev, [unitId]: "saved" }));

    if (dirty) {
      bumpDatasetVersion(unitId);
      setDatasetDirtyByUnit((prev) => ({ ...prev, [unitId]: false }));
    }

    const runIdEntries = selectedModelIds.map((modelId, idx) => ({
      modelId,
      runId: `R-${String(nextRunSeq + idx).padStart(3, "0")}`,
    }));
    if (runIdEntries.length > 0 && validSamples.length > 0) {
      setRunRecordsByUnit((prev) => {
        const current = prev[unitId] ?? [];
        const nextRecords: RunRecord[] = runIdEntries.map(({ modelId, runId }) => ({
          runId,
          taskId: unitMeta?.taskId ?? unitId,
          unitId,
          datasetId: currentDataset?.id ?? unitMeta?.datasetId ?? "D-000",
          datasetVersion: nextDatasetVersion,
          modelId,
          createdAt: now,
          sampleCount: validSamples.length,
        }));
        return { ...prev, [unitId]: [...current, ...nextRecords] };
      });
      const runIdByModel = new Map(runIdEntries.map((entry) => [entry.modelId, entry.runId]));
      const runRowByModelSample = new Map(
        runRows.map((row) => [`${row.modelId}::${row.sampleId}`, row] as const)
      );
      setRawExecutionRowsByUnit((prev) => {
        const current = prev[unitId] ?? [];
        const nextRaw: RawExecutionRow[] = [];
        selectedModelIds.forEach((modelId) => {
          const runId = runIdByModel.get(modelId);
          if (!runId) return;
          validSamples.forEach((sample) => {
            const runRow = runRowByModelSample.get(`${modelId}::${sample.id}`);
            nextRaw.push({
              runId,
              sampleId: sample.id,
              modelId,
              input: sample.input,
              expectedOutput: sample.expectedOutput,
              predictedOutput: runRow?.observedOutput ?? "",
              latency: runRow?.averageLatency ?? 0,
              cost: runRow?.costPerRequest ?? 0,
              tokenUsage: Math.max(0, Math.round((runRow?.observedOutput || "").length * 3)),
              error: (runRow?.errorRate ?? 0) > 0 ? 1 : 0,
              policyFlag: (runRow?.policyViolationRate ?? 0) > 0 ? 1 : 0,
            });
          });
        });
        return { ...prev, [unitId]: [...current, ...nextRaw] };
      });
      setNextRunSeq((prev) => prev + runIdEntries.length);
    }

    const source = datasetSourceByUnit[unitId];
    const sourceLabel = source === "csv" ? "CSV" : source === "ai" ? "자동 생성" : "직접 입력";
    appendDatasetLog(unitId, `${sourceLabel} · 결과 저장 완료 (v${nextDatasetVersion})`);
    setMessage(
      `결과 저장 완료: 태스크 ${unitMeta?.taskId ?? "-"} / 데이터셋 ${(currentDataset?.id ?? unitMeta?.datasetId) || "-"} v${nextDatasetVersion} / 런 ${runIdEntries.map((r) => r.runId).join(", ")}`
    );
  }

  async function handleRunTest() {
    if (!normalizedActiveTestUnitId || isRunningTest) return;
    const unitId = normalizedActiveTestUnitId;
    const unitMeta = STEP5_TEST_UNIT_ROWS.find((row) => row.unitId === unitId);
    if (!unitMeta) return;
    const validSamples = samples.filter(isSampleRowFilled);
    if (validSamples.length === 0) {
      setMessage("실행할 샘플이 없습니다. 데이터셋을 먼저 입력해 주세요.");
      return;
    }
    if (selectedModelIds.length === 0) {
      setMessage("실행할 모델이 없습니다.");
      return;
    }

    setIsRunningTest(true);
    setMessage("TEST Run 실행 중...");
    try {
      const response = await fetch("/api/poc-run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskId: unitMeta.taskId,
          unitId,
          aiTaskType: extractTaskTypeKey(unitMeta.aiTaskType),
          metricPack: unitMeta.metricPack,
          models: selectedModelIds.map((modelId) => {
            const model = modelMap.get(modelId);
            return {
              modelId,
              name: model?.name ?? modelId,
              provider: model?.provider ?? "",
              version: model?.version ?? "",
            };
          }),
          samples: validSamples.map((sample) => ({
            sampleId: sample.id,
            input: sample.input,
            expectedOutput: sample.expectedOutput,
            description: sample.description,
            tags: sample.tags,
            note: sample.note,
          })),
        }),
      });
      const payload = (await response.json()) as {
        ok: boolean;
        mode?: "mock" | "live";
        error?: string;
        rows?: Array<{
          sampleId: string;
          modelId: string;
          predictedOutput: string;
          latencyMs: number;
          cost: number;
          tokenUsage: number;
          error: boolean;
          policyPass: boolean;
          violation: boolean;
        }>;
      };
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "TEST Run 실패");
      }
      const resultRows = payload.rows ?? [];
      const resultMap = new Map(resultRows.map((row) => [`${row.modelId}::${row.sampleId}`, row] as const));

      setRunRowsByUnit((prev) => {
        const current = prev[unitId] ?? [];
        const next = current.map((row) => {
          const result = resultMap.get(`${row.modelId}::${row.sampleId}`);
          if (!result) return row;
          return {
            ...row,
            observedOutput: result.predictedOutput,
            averageLatency: result.latencyMs,
            costPerRequest: result.cost,
            policyViolationRate: result.violation ? 100 : 0,
            errorRate: result.error ? 100 : 0,
          };
        });
        return { ...prev, [unitId]: next };
      });

      const now = formatActionTime();
      const runIdEntries = selectedModelIds.map((modelId, idx) => ({
        modelId,
        runId: `R-${String(nextRunSeq + idx).padStart(3, "0")}`,
      }));
      setRunRecordsByUnit((prev) => {
        const current = prev[unitId] ?? [];
        const nextRecords: RunRecord[] = runIdEntries.map(({ modelId, runId }) => ({
          runId,
          taskId: unitMeta.taskId,
          unitId,
          datasetId: datasetsByUnit[unitId]?.id ?? unitMeta.datasetId,
          datasetVersion: datasetsByUnit[unitId]?.version ?? 1,
          modelId,
          createdAt: now,
          sampleCount: validSamples.length,
        }));
        return { ...prev, [unitId]: [...current, ...nextRecords] };
      });
      const runIdByModel = new Map(runIdEntries.map((entry) => [entry.modelId, entry.runId]));
      setRawExecutionRowsByUnit((prev) => {
        const current = prev[unitId] ?? [];
        const nextRaw: RawExecutionRow[] = [];
        resultRows.forEach((row) => {
          const sample = validSamples.find((s) => s.id === row.sampleId);
          const runId = runIdByModel.get(row.modelId);
          if (!sample || !runId) return;
          nextRaw.push({
            runId,
            sampleId: row.sampleId,
            modelId: row.modelId,
            input: sample.input,
            expectedOutput: sample.expectedOutput,
            predictedOutput: row.predictedOutput,
            latency: row.latencyMs,
            cost: row.cost,
            tokenUsage: row.tokenUsage,
            error: row.error ? 1 : 0,
            policyFlag: row.violation ? 1 : 0,
          });
        });
        return { ...prev, [unitId]: [...current, ...nextRaw] };
      });
      setNextRunSeq((prev) => prev + runIdEntries.length);
      setUnitProgressById((prev) => ({ ...prev, [unitId]: "saved" }));
      appendDatasetLog(unitId, `TEST Run 완료 · ${payload.mode === "mock" ? "Mock" : "Live"} · 샘플 ${validSamples.length}개`);
      setMessage(`TEST Run 완료 (${payload.mode === "mock" ? "Mock" : "Live"})`);
    } catch (error) {
      const text = error instanceof Error ? error.message : "TEST Run 실패";
      setMessage(text);
    } finally {
      setIsRunningTest(false);
    }
  }

  async function handleCopyPrompt() {
    const text = externalPrompt;
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setMessage("선택된 기능 시나리오 기준 프롬프트 복사 완료");
    } catch {
      setMessage("프롬프트 복사 실패: 브라우저 권한을 확인해 주세요.");
    }
  }

  return (
    <div ref={twoPaneRef} className="two-pane" style={twoPaneStyle}>
      <section style={mainPanelStyle}>
        <div style={cardStyle}>
          <h3 style={cardTitleStyle}>기능 시나리오</h3>
          <p style={{ ...subtleStyle, marginTop: 0, color: "#dc2626" }}>현재는 오프라인 테스트만 가능해요.</p>
          <div style={tableWrapStyle}>
            <table style={{ ...tableStyle, minWidth: 1280 }}>
              <thead>
                <tr>
                  <th style={thStyle}>태스크 ID (Task ID)</th>
                  <th style={thStyle}>데이터셋 ID (Dataset ID)</th>
                  <th style={thStyle}>버전 (Version)</th>
                  <th style={thStyle}>서비스 (Service)</th>
                  <th style={thStyle}>기능 (Feature)</th>
                  <th style={thStyle}>AI 작업 유형 (AI Task)</th>
                  <th style={thStyle}>테스트 타입 (Test Type)</th>
                  <th style={thStyle}>평가 지표 (Evaluation Metrics)</th>
                  <th style={thStyle}>모델 (Models)</th>
                  <th style={thStyle}>실행 상태 (Status)</th>
                </tr>
              </thead>
              <tbody>
                {STEP5_TEST_UNIT_ROWS.map((row) => {
                  const isSelected = normalizedActiveTestUnitId === row.unitId;
                  const selectedCellStyle: CSSProperties = isSelected
                    ? { ...tdStyle, background: "#f8fbff", borderBottom: "1px solid #dbeafe" }
                    : tdStyle;
                  const firstSelectedCellStyle: CSSProperties = isSelected
                    ? {
                        ...selectedCellStyle,
                        boxShadow: "inset 3px 0 0 #93c5fd",
                      }
                    : selectedCellStyle;

                  return (
                    <tr
                      key={`offline-overview-${row.unitId}`}
                      onClick={() => setActiveTestUnitId(row.unitId)}
                      style={{ cursor: "pointer" }}
                    >
                    <td style={firstSelectedCellStyle}>{row.taskId}</td>
                    <td style={selectedCellStyle}>{datasetsByUnit[row.unitId]?.id ?? row.datasetId}</td>
                    <td style={selectedCellStyle}>v{datasetsByUnit[row.unitId]?.version ?? 1}</td>
                    <td style={selectedCellStyle}>{row.serviceName}</td>
                    <td style={selectedCellStyle}>{row.featureName}</td>
                    <td style={selectedCellStyle}>{row.aiTaskType}</td>
                    <td style={selectedCellStyle}>{row.testType}</td>
                    <td style={selectedCellStyle}>
                      {scenarioMetricLines(row.metricPack).map((line) => (
                        <div key={`${row.unitId}-metric-line-${line}`}>{line}</div>
                      ))}
                    </td>
                    <td style={selectedCellStyle}>
                      <div style={scenarioModelCardsWrapStyle}>
                        {sampleSetModelSlots.map((slot) => (
                          <div key={`${row.unitId}-${slot.slot}`} style={scenarioModelCardStyle}>
                            <div style={scenarioModelLineStyle}>
                              {(slot.slot === "baseline"
                                ? "기준 모델 (Baseline)"
                                : slot.slot === "lowCost"
                                  ? "저비용 모델 (Low Cost)"
                                  : "특화 모델 (Specialized)")}{" "}
                              · {slot.modelName} · {slot.provider} · {slot.version}
                            </div>
                          </div>
                        ))}
                      </div>
                    </td>
                    <td style={{ ...selectedCellStyle, minWidth: 260 }}>
                      <div style={{ fontSize: 12, color: "#64748b", lineHeight: 1.45 }}>
                        {(datasetLogByUnit[row.unitId] ?? []).length > 0 ? (
                          (datasetLogByUnit[row.unitId] ?? []).map((log, idx) => (
                            <div key={`${row.unitId}-log-${idx}`}>• {log}</div>
                          ))
                        ) : (
                          <div>• 실행 기록 없음</div>
                        )}
                      </div>
                    </td>
                    </tr>
                  );
                })}
                {STEP5_TEST_UNIT_ROWS.length === 0 && (
                  <tr>
                    <td style={tdStyle} colSpan={10}>
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
              <h3 style={{ ...cardTitleStyle, margin: 0 }}>데이터 셋</h3>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input ref={csvInputRef} type="file" accept=".csv,text/csv" style={{ display: "none" }} onChange={handleCsvUpload} />
                <button type="button" onClick={openCsvUpload} style={ghostButtonStyle}>
                  CSV 업로드
                </button>
                <button type="button" onClick={handleAutoGenerateDataset} style={ghostButtonStyle}>
                  데이터 자동 생성
                </button>
                <button type="button" onClick={handleCopyPrompt} style={ghostButtonStyle} title="프롬프트 복사">
                  프롬프트 복사
                </button>
                <button type="button" onClick={handleSavePoc} style={buttonStyle}>
                  결과 저장
                </button>
              </div>
            </div>
            <p style={{ ...subtleStyle, marginTop: 0, marginBottom: 8, whiteSpace: "pre-line" }}>
              설계된 내용으로 테스트 데이터 입력 형식이 자동 생성돼요.
              {"\n"}컬럼 포함 내용을 수정하거나 CSV 업로드로 교체할 수 있어요.
            </p>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
              <span style={{ ...subtleStyle, margin: 0 }}>
                데이터셋 ID (Dataset ID): <strong style={{ color: "#0f172a" }}>{activeDataset.id}</strong> · 버전 (Version):{" "}
                <strong style={{ color: "#0f172a" }}>v{activeDataset.version}</strong>
              </span>
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
                    {activeDatasetColumns.map((column, colIndex) => (
                      <th
                        key={`dataset-col-${column.key}`}
                        style={{
                          ...thStyle,
                          ...(activeSampleHeaderCol === colIndex ? sheetCellActiveStyle : {}),
                        }}
                        onMouseDown={() => {
                          setActiveSampleHeaderCol(colIndex);
                          setActiveSampleCell(null);
                          setSampleSelectionRange(null);
                        }}
                      >
                        <div style={datasetHeaderCellStyle}>
                          <input
                            value={column.label}
                            onChange={(e) => {
                              if (!normalizedActiveTestUnitId) return;
                              setDatasetColumnsByUnit((prev) => {
                                const current = prev[normalizedActiveTestUnitId] ?? DEFAULT_DATASET_COLUMNS;
                                const next = current.map((col, idx) =>
                                  idx === colIndex ? { ...col, label: e.target.value } : col
                                );
                                return { ...prev, [normalizedActiveTestUnitId]: next };
                              });
                            }}
                            style={datasetHeaderInputStyle}
                            onFocus={() => {
                              setActiveSampleHeaderCol(colIndex);
                              setActiveSampleCell(null);
                              setSampleSelectionRange(null);
                            }}
                          />
                          {column.key !== "id" && (
                            <button type="button" onClick={() => removeDatasetColumn(colIndex)} style={datasetHeaderActionStyle} title="열 삭제">
                              ×
                            </button>
                          )}
                        </div>
                      </th>
                    ))}
                    <th style={{ ...thStyle, width: 44, textAlign: "center" }}>
                      <button type="button" onClick={addDatasetColumn} style={datasetPlusButtonStyle} title="열 추가">
                        +
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {samples.map((sample, index) => (
                    <tr key={`sample-${index}`}>
                      {activeDatasetColumns.map((column, colIndex) => {
                        return (
                          <td
                            key={`sample-cell-${index}-${column.key}`}
                            style={{
                              ...tdStyle,
                              ...(isSampleCellInSelection(index, colIndex) ? sheetCellSelectedStyle : {}),
                              ...(isActiveSampleCell(index, colIndex) ? sheetCellActiveStyle : {}),
                            }}
                            onMouseDown={() => startSampleCellSelection(index, colIndex)}
                            onMouseEnter={() => extendSampleCellSelection(index, colIndex)}
                          >
                            <input
                              value={getSampleCellValue(sample, column.key)}
                              onChange={(e) => updateSample(index, column.key, e.target.value)}
                              onPaste={(e) => handleSampleSheetPaste(index, colIndex, e)}
                              onFocus={() => {
                                setActiveSampleHeaderCol(null);
                                setActiveSampleCell({ row: index, col: colIndex });
                                setSampleSelectionRange({ start: { row: index, col: colIndex }, end: { row: index, col: colIndex } });
                              }}
                              onMouseDown={() => startSampleCellSelection(index, colIndex)}
                              readOnly={column.key === "id"}
                              style={
                                column.key === "id"
                                  ? { ...sheetCellInputStyle, background: "#f8fafc", color: "#64748b", cursor: "default" }
                                  : sheetCellInputStyle
                              }
                            />
                          </td>
                        );
                      })}
                      <td style={{ ...tdStyle, width: 44, textAlign: "center" }}>
                        <button type="button" onClick={() => removeDatasetRow(index)} style={datasetRowDeleteButtonStyle} title="행 삭제">
                          🗑
                        </button>
                      </td>
                    </tr>
                  ))}
                  <tr>
                    <td style={{ ...tdStyle, width: 44, textAlign: "center" }}>
                      <button type="button" onClick={addDatasetRow} style={datasetPlusButtonStyle} title="행 추가">
                        +
                      </button>
                    </td>
                    {activeDatasetColumns.slice(1).map((column) => (
                      <td key={`sample-add-row-${column.key}`} style={tdStyle} />
                    ))}
                    <td style={{ ...tdStyle, width: 44 }} />
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div ref={testRunResultRef} style={cardStyle}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
            <h3 style={{ ...cardTitleStyle, margin: 0 }}>테스트 결과</h3>
            <button type="button" onClick={handleRunTest} style={buttonStyle} disabled={isRunningTest}>
              {isRunningTest ? "TEST Run 실행 중..." : "TEST Run"}
            </button>
          </div>
          <div style={viewTabsStyle}>
            {VIEW_TABS.map((tab) => {
              const enabled = viewTabHasMetrics[tab.key];
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => {
                    if (!enabled) return;
                    setViewTab(tab.key);
                  }}
                  disabled={!enabled}
                  style={{
                    ...viewTabButtonStyle,
                    ...(effectiveViewTab === tab.key ? viewTabButtonActiveStyle : {}),
                    ...(!enabled ? { opacity: 0.45, cursor: "not-allowed" } : {}),
                  }}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
          <div style={{ ...subtleStyle, marginTop: 0, marginBottom: 8, whiteSpace: "pre-line" }}>
            {activeViewMeta.helperText}
          </div>
          <div style={runContextCardStyle}>
            <div style={runContextTitleStyle}>
              {activeViewLabelEn}
              <span style={{ color: "#475569", fontWeight: 700, marginLeft: 8 }}>{activeTestUnit?.featureName} 모델 비교</span>
            </div>
            <div style={runContextGridStyle}>
              <div><strong style={runContextKeyStyle}>태스크 (Task)</strong><div>{runContextTask}</div></div>
              <div>
                <strong style={runContextKeyStyle}>데이터셋 (Dataset)</strong>
                <div>
                  {activeDataset.id} ({activeTestUnit?.featureName} 샘플 {filledSampleCount}개)
                </div>
              </div>
              <div>
                <strong style={runContextKeyStyle}>모델 (Models)</strong>
                <div>Baseline / Low Cost / Specialized</div>
              </div>
              <div>
                <strong style={runContextKeyStyle}>지표 팩 (Metric Pack)</strong>
                <div>{activeMetricDimensionLabels.join(" / ") || "-"}</div>
              </div>
              <div>
                <strong style={runContextKeyStyle}>샘플 수 (Sample Size)</strong>
                <div>{filledSampleCount}</div>
              </div>
            </div>
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
                          disabled={runInputDisabled}
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
                          disabled={runInputDisabled}
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
                          disabled={runInputDisabled}
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
                          disabled={runInputDisabled}
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
                          disabled={runInputDisabled}
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
                          disabled={runInputDisabled}
                          style={sheetCellInputStyle}
                        />
                      </td>
                      <td
                        style={{ ...tdStyle, ...(isRunCellInSelection(rowIndex, 6) ? sheetCellSelectedStyle : {}), ...(isActiveRunCell(rowIndex, 6) ? sheetCellActiveStyle : {}) }}
                        onMouseDown={() => startRunCellSelection(rowIndex, 6)}
                        onMouseEnter={() => extendRunCellSelection(rowIndex, 6)}
                      >
                        <input
                          value={row.policyViolationRate}
                          onChange={(e) => updateRunRow(row.key, "policyViolationRate", e.target.value)}
                          onPaste={(e) => handleRunSheetPaste(rowIndex, 6, e)}
                          onFocus={() => {
                            setActiveRunCell({ row: rowIndex, col: 6 });
                            setRunSelectionRange({ start: { row: rowIndex, col: 6 }, end: { row: rowIndex, col: 6 } });
                          }}
                          onMouseDown={() => startRunCellSelection(rowIndex, 6)}
                          disabled={runInputDisabled}
                          style={sheetCellInputStyle}
                        />
                      </td>
                      <td
                        style={{ ...tdStyle, ...(isRunCellInSelection(rowIndex, 7) ? sheetCellSelectedStyle : {}), ...(isActiveRunCell(rowIndex, 7) ? sheetCellActiveStyle : {}) }}
                        onMouseDown={() => startRunCellSelection(rowIndex, 7)}
                        onMouseEnter={() => extendRunCellSelection(rowIndex, 7)}
                      >
                        <input
                          value={row.recall}
                          onChange={(e) => updateRunRow(row.key, "recall", e.target.value)}
                          onPaste={(e) => handleRunSheetPaste(rowIndex, 7, e)}
                          onFocus={() => {
                            setActiveRunCell({ row: rowIndex, col: 7 });
                            setRunSelectionRange({ start: { row: rowIndex, col: 7 }, end: { row: rowIndex, col: 7 } });
                          }}
                          onMouseDown={() => startRunCellSelection(rowIndex, 7)}
                          disabled={runInputDisabled}
                          style={sheetCellInputStyle}
                        />
                      </td>
                      <td
                        style={{ ...tdStyle, ...(isRunCellInSelection(rowIndex, 8) ? sheetCellSelectedStyle : {}), ...(isActiveRunCell(rowIndex, 8) ? sheetCellActiveStyle : {}) }}
                        onMouseDown={() => startRunCellSelection(rowIndex, 8)}
                        onMouseEnter={() => extendRunCellSelection(rowIndex, 8)}
                      >
                        <input
                          value={row.precision}
                          onChange={(e) => updateRunRow(row.key, "precision", e.target.value)}
                          onPaste={(e) => handleRunSheetPaste(rowIndex, 8, e)}
                          onFocus={() => {
                            setActiveRunCell({ row: rowIndex, col: 8 });
                            setRunSelectionRange({ start: { row: rowIndex, col: 8 }, end: { row: rowIndex, col: 8 } });
                          }}
                          onMouseDown={() => startRunCellSelection(rowIndex, 8)}
                          disabled={runInputDisabled}
                          style={sheetCellInputStyle}
                        />
                      </td>
                      <td
                        style={{ ...tdStyle, ...(isRunCellInSelection(rowIndex, 9) ? sheetCellSelectedStyle : {}), ...(isActiveRunCell(rowIndex, 9) ? sheetCellActiveStyle : {}) }}
                        onMouseDown={() => startRunCellSelection(rowIndex, 9)}
                        onMouseEnter={() => extendRunCellSelection(rowIndex, 9)}
                      >
                        <input
                          value={row.f1Score}
                          onChange={(e) => updateRunRow(row.key, "f1Score", e.target.value)}
                          onPaste={(e) => handleRunSheetPaste(rowIndex, 9, e)}
                          onFocus={() => {
                            setActiveRunCell({ row: rowIndex, col: 9 });
                            setRunSelectionRange({ start: { row: rowIndex, col: 9 }, end: { row: rowIndex, col: 9 } });
                          }}
                          onMouseDown={() => startRunCellSelection(rowIndex, 9)}
                          disabled={runInputDisabled}
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
          <h3 style={cardTitleStyle}>TEST 해석</h3>
          <div style={summaryCardsGridStyle}>
            <div style={{ ...summaryCardStyle, ...(viewTab === "experiment" ? summaryCardActiveStyle : {}) }}>
              <div style={summaryCardHeadStyle}>
                <span style={{ ...summaryIconStyle, background: "#fef3c7", color: "#92400e" }}>Q</span>
                <div style={summaryCardTitleStyle}>품질 (Quality)</div>
              </div>
              {hasMetric("editRate") && (
                <p style={summaryTextStyle}>
                  생성형 기준: 수정 비율 (Edit Rate) <span style={summaryValueStyle}>{summaryMetrics.avgEditRate.toFixed(1)}%</span>
                </p>
              )}
              {hasMetric("precision") && (
                <p style={summaryTextStyle}>
                  분류형 기준: 정밀도 (Precision) <span style={summaryValueStyle}>{summaryMetrics.avgPrecision.toFixed(2)}</span>
                </p>
              )}
              {hasMetric("recall") && (
                <p style={summaryTextStyle}>
                  분류형 기준: 재현율 (Recall) <span style={summaryValueStyle}>{summaryMetrics.avgRecall.toFixed(2)}</span>
                </p>
              )}
              {hasMetric("f1Score") && (
                <p style={summaryTextStyle}>
                  분류형 기준: F1 점수 (F1 Score) <span style={summaryValueStyle}>{summaryMetrics.avgF1.toFixed(2)}</span>
                </p>
              )}
              {!hasMetric("editRate") && !hasMetric("precision") && !hasMetric("recall") && !hasMetric("f1Score") && (
                <p style={summaryTextStyle}>이 Task에는 품질 지표가 지정되지 않았어요.</p>
              )}
            </div>

            <div style={{ ...summaryCardStyle, ...(viewTab === "release" ? summaryCardActiveStyle : {}) }}>
              <div style={summaryCardHeadStyle}>
                <span style={{ ...summaryIconStyle, background: "#dbeafe", color: "#1d4ed8" }}>$</span>
                <div style={summaryCardTitleStyle}>비용 (Cost)</div>
              </div>
              {hasMetric("costPerRequest") && (
                <p style={summaryTextStyle}>
                  요청당 평균 비용 (Cost per Request)은 <span style={summaryValueStyle}>${summaryMetrics.avgCost.toFixed(3)}</span>에요.
                </p>
              )}
              {hasMetric("averageLatency") && (
                <p style={summaryTextStyle}>
                  평균 응답 시간 (Average Latency)은 <span style={summaryValueStyle}>{summaryMetrics.avgLatency.toFixed(0)}ms</span>에요.
                </p>
              )}
              {hasMetric("tokenUsage") && (
                <p style={summaryTextStyle}>
                  토큰 사용량 (Token Usage)은 <span style={summaryValueStyle}>{summaryMetrics.tokenUsage.toLocaleString()}</span>개에요.
                </p>
              )}
              {!hasMetric("costPerRequest") && !hasMetric("averageLatency") && !hasMetric("tokenUsage") && (
                <p style={summaryTextStyle}>이 Task에는 비용 지표가 지정되지 않았어요.</p>
              )}
            </div>

            <div style={{ ...summaryCardStyle, ...(viewTab === "operational" ? summaryCardActiveStyle : {}) }}>
              <div style={summaryCardHeadStyle}>
                <span style={{ ...summaryIconStyle, background: "#fee2e2", color: "#b91c1c" }}>!</span>
                <div style={summaryCardTitleStyle}>운영 리스크 (Risk)</div>
              </div>
              {hasMetric("policyViolationRate") && (
                <p style={summaryTextStyle}>
                  정책 위반율 (Policy Violation Rate)은 <span style={summaryValueStyle}>{summaryMetrics.avgPolicyViolation.toFixed(1)}%</span>에요.
                </p>
              )}
              {hasMetric("errorRate") && (
                <p style={summaryTextStyle}>
                  오류율 (System Error Rate) <span style={summaryValueStyle}>{summaryMetrics.avgErrorRate.toFixed(1)}%</span>
                </p>
              )}
              {hasMetric("manualInterventionRate") && (
                <p style={summaryTextStyle}>
                  수동 개입률 (Manual Intervention Rate) <span style={summaryValueStyle}>{Math.max(0.5, summaryMetrics.avgEditRate * 0.2).toFixed(1)}%</span>
                </p>
              )}
              {!hasMetric("policyViolationRate") && !hasMetric("errorRate") && !hasMetric("manualInterventionRate") && (
                <p style={summaryTextStyle}>이 Task에는 운영 리스크 지표가 지정되지 않았어요.</p>
              )}
            </div>

            <div style={{ ...summaryCardStyle, ...(viewTab === "scaleup" ? summaryCardActiveStyle : {}) }}>
              <div style={summaryCardHeadStyle}>
                <span style={{ ...summaryIconStyle, background: "#dcfce7", color: "#166534" }}>B</span>
                <div style={summaryCardTitleStyle}>비즈니스 가치 (Business Gate)</div>
              </div>
              <p style={summaryTextStyle}>자동화율 (Automation Rate) ≥ <span style={summaryValueStyle}>X%</span></p>
              <p style={summaryTextStyle}>평균 처리 시간 단축률 (Processing Time Reduction) ≥ <span style={summaryValueStyle}>Y%</span></p>
              <p style={summaryTextStyle}>전환율 (Conversion Rate) +<span style={summaryValueStyle}>Z%p</span></p>
              <p style={summaryTextStyle}>ROI (Return on Investment) ≥ <span style={summaryValueStyle}>기준값</span></p>
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

const runContextCardStyle: CSSProperties = {
  marginBottom: 10,
  border: "1px solid #e2e8f0",
  background: "#f8fafc",
  borderRadius: 10,
  padding: "10px 12px",
};

const runContextTitleStyle: CSSProperties = {
  fontSize: 14,
  fontWeight: 800,
  color: "#0f172a",
  marginBottom: 8,
};

const runContextGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(5, minmax(130px, 1fr))",
  gap: 10,
  fontSize: 13,
  color: "#0f172a",
};

const runContextKeyStyle: CSSProperties = {
  display: "block",
  fontSize: 11,
  color: "#64748b",
  marginBottom: 2,
  fontWeight: 700,
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
  border: "1px solid #d1d5db",
  borderRadius: 999,
  padding: "5px 11px",
  background: "#f9fafb",
  color: "#4b5563",
  fontWeight: 600,
  fontSize: 11,
  cursor: "pointer",
};

const viewTabButtonActiveStyle: CSSProperties = {
  borderColor: "#9ca3af",
  background: "#f3f4f6",
  color: "#1f2937",
  boxShadow: "inset 0 0 0 1px #d1d5db",
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

const datasetHeaderCellStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
};

const datasetHeaderInputStyle: CSSProperties = {
  width: "100%",
  minWidth: 80,
  border: "none",
  background: "transparent",
  outline: "none",
  fontSize: 12,
  fontWeight: 700,
  color: "#334155",
};

const datasetHeaderActionStyle: CSSProperties = {
  border: "none",
  background: "transparent",
  color: "#94a3b8",
  fontSize: 14,
  lineHeight: 1,
  cursor: "pointer",
  padding: 0,
};

const datasetPlusButtonStyle: CSSProperties = {
  border: "none",
  background: "transparent",
  color: "#94a3b8",
  fontSize: 18,
  lineHeight: 1,
  cursor: "pointer",
  padding: 0,
};

const datasetRowDeleteButtonStyle: CSSProperties = {
  border: "none",
  background: "transparent",
  color: "#a8b1c0",
  cursor: "pointer",
  fontSize: 12,
  lineHeight: 1,
  padding: 0,
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

const scenarioModelCardsWrapStyle: CSSProperties = {
  display: "flex",
  gap: 6,
  flexWrap: "wrap",
};

const scenarioModelCardStyle: CSSProperties = {
  border: "1px solid #dbe2ea",
  borderRadius: 8,
  background: "#fbfdff",
  padding: "6px 8px",
  minWidth: 260,
};

const scenarioModelLineStyle: CSSProperties = {
  fontSize: 11,
  color: "#334155",
  fontWeight: 600,
  lineHeight: 1.3,
  whiteSpace: "nowrap",
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

const summaryValueStyle: CSSProperties = {
  color: "#1d4ed8",
  fontWeight: 800,
};
