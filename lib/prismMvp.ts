import { z } from "zod";

export type RiskLevel = "low" | "medium" | "high";
export type Step1Target = "internal_staff" | "approver_admin" | "end_user" | "external_customer_partner" | "system_operator";
export type Step1ResultState =
  | "draft_saved"
  | "status_changed"
  | "review_requested"
  | "published_or_executed"
  | "reference_saved"
  | "action_triggered"
  | "task_created"
  | "ephemeral_response"
  | "failed"
  | "cancelled";
export type Step1NoAiAlternative = "manual" | "template" | "rule_based" | "search_based" | "other";
export type Step1Exposure = "internal" | "limited_external" | "public";
export type Step1Reversibility = "easy" | "limited" | "irreversible";
export type Step1Impact = "low" | "medium" | "high";
export type Step1Hitl = "pre_review" | "post_monitoring" | "none";
export type Step1AiMinRole = "draft_only" | "auto_publish";
export type Step1AiTaskType = "classification" | "draft_generation" | "candidate_suggestion" | "approval_assist" | "revision_suggestion" | "policy_check";
export type Step1FinalExecutor = "human" | "conditional" | "automatic";

export type Step1Data = {
  why: string;
  target: Step1Target[];
  target_detail: string;
  as_is: string;
  result_state: Step1ResultState | "";
  ai_task_types: Step1AiTaskType[];
  final_executor: Step1FinalExecutor | "";
  ai_min_role: Step1AiMinRole | "";
  kpi: string;
  no_ai_alternative: Step1NoAiAlternative[];
  no_ai_alternative_detail: string;
  exposure: Step1Exposure | "";
  reversibility: Step1Reversibility | "";
  impact: Step1Impact | "";
  hitl: Step1Hitl | "";
};

export type Step2Data = {
  status_model: string;
  user_flow: string;
  ai_intervention: string;
  system_process: string;
  human_control: string;
  failure_strategy: string;
  delivery_mode: string;
  data_storage: string;
  log_fields: string;
  cost_strategy: string;
  reviewed: Record<
    | "status_model"
    | "user_flow"
    | "ai_intervention"
    | "system_process"
    | "human_control"
    | "failure_strategy"
    | "delivery_mode"
    | "data_storage"
    | "log_fields"
    | "cost_strategy",
    boolean
  >;
};

export type Step4Row = {
  rowId: Step4RowId;
  title: string;
  spec: string;
  note: string;
  relatedTabs: Step4TabKey[];
};

export type Step4TabKey = "state" | "sequence" | "error_retry" | "auth" | "dataflow" | "observability" | "pipeline" | "rollback" | "cost" | "ia";

export type Step4RowId =
  | "api_definition"
  | "input_schema"
  | "output_schema"
  | "state_model"
  | "state_transition_rules"
  | "model_conditions"
  | "fallback_conditions"
  | "guardrail_policy"
  | "storage_structure"
  | "log_structure"
  | "monitoring_items"
  | "rollback_policy"
  | "security_pii_policy"
  | "execution_structure";

export const TECH_SPEC_ROW_DEFS: Array<Pick<Step4Row, "rowId" | "title" | "relatedTabs">> = [
  { rowId: "api_definition", title: "API 정의", relatedTabs: ["sequence", "auth", "pipeline"] },
  { rowId: "input_schema", title: "입력 스키마", relatedTabs: ["dataflow", "sequence"] },
  { rowId: "output_schema", title: "출력 스키마", relatedTabs: ["dataflow", "sequence"] },
  { rowId: "state_model", title: "상태 모델", relatedTabs: ["state", "pipeline", "rollback"] },
  { rowId: "state_transition_rules", title: "상태 전이 규칙", relatedTabs: ["state", "error_retry", "pipeline"] },
  { rowId: "model_conditions", title: "모델 조건", relatedTabs: ["cost", "pipeline", "dataflow"] },
  { rowId: "fallback_conditions", title: "Fallback 조건", relatedTabs: ["error_retry", "pipeline"] },
  { rowId: "guardrail_policy", title: "Guardrail 정책", relatedTabs: ["error_retry", "dataflow", "auth"] },
  { rowId: "storage_structure", title: "저장 구조", relatedTabs: ["dataflow", "observability", "rollback"] },
  { rowId: "log_structure", title: "로그 구조", relatedTabs: ["observability", "dataflow"] },
  { rowId: "monitoring_items", title: "모니터링 항목", relatedTabs: ["observability", "rollback", "cost"] },
  { rowId: "rollback_policy", title: "롤백 정책", relatedTabs: ["rollback", "observability"] },
  { rowId: "security_pii_policy", title: "보안/PII 정책", relatedTabs: ["auth", "dataflow"] },
  { rowId: "execution_structure", title: "실행 구조", relatedTabs: ["pipeline", "sequence", "state"] },
];

type Step3FieldKey =
  | "automation_level_adjustment"
  | "auto_processing_scope"
  | "tolerance_adjustment"
  | "human_review_insertion"
  | "failure_ux_policy"
  | "final_decision_policy"
  | "cost_quality_strategy"
  | "cache_strategy"
  | "data_assetization_strategy"
  | "monitoring_standard"
  | "rollback_standard"
  | "model_versioning";

export type Step3Policy = {
  automation_level_adjustment: string;
  auto_processing_scope: string;
  tolerance_adjustment: string;
  human_review_insertion: string;
  failure_ux_policy: string;
  final_decision_policy: string;
  cost_quality_strategy: string;
  cache_strategy: string;
  data_assetization_strategy: string;
  monitoring_standard: string;
  rollback_standard: string;
  model_versioning: string;
  reviewed: Record<Step3FieldKey, boolean>;
};

export type ProjectProgress = {
  step1Frozen: boolean;
  step2Completed: boolean;
  step3Completed: boolean;
};

export type HistoryStage = "step1" | "step2" | "step3" | "step4" | "system";

export const HISTORY_EVENT_TYPES = {
  SAVE_STEP1: "SAVE_STEP1",
  GENERATE_STEP2_DRAFT: "GENERATE_STEP2_DRAFT",
  FREEZE_STEP1: "FREEZE_STEP1",
  SET_EXPOSURE: "SET_EXPOSURE",
  SET_REVERSIBILITY: "SET_REVERSIBILITY",
  SET_IMPACT: "SET_IMPACT",
  SET_HITL: "SET_HITL",
  SAVE_STEP2: "SAVE_STEP2",
  COMPLETE_STEP2: "COMPLETE_STEP2",
  GENERATE_STEP3_POLICY: "GENERATE_STEP3_POLICY",
  SAVE_STEP3: "SAVE_STEP3",
  COMPLETE_STEP3: "COMPLETE_STEP3",
  SAVE_STEP4: "SAVE_STEP4",
  MANUAL_MEMO: "MANUAL_MEMO",
  SCHEMA_INVALID_RECOVERED: "SCHEMA_INVALID_RECOVERED",
} as const;

export type HistoryEventAction = (typeof HISTORY_EVENT_TYPES)[keyof typeof HISTORY_EVENT_TYPES];

export type HistoryEvent = {
  id: string;
  ts: number;
  projectId: string;
  stage: HistoryStage;
  action: HistoryEventAction;
  summary: string;
};

const NS = "prism2:mvp";
const STEP4_TAB_KEYS = ["state", "sequence", "error_retry", "auth", "dataflow", "observability", "pipeline", "rollback", "cost", "ia"] as const;
const STEP4_ROW_IDS = [
  "api_definition",
  "input_schema",
  "output_schema",
  "state_model",
  "state_transition_rules",
  "model_conditions",
  "fallback_conditions",
  "guardrail_policy",
  "storage_structure",
  "log_structure",
  "monitoring_items",
  "rollback_policy",
  "security_pii_policy",
  "execution_structure",
] as const;
const STEP2_REVIEW_KEYS = [
  "status_model",
  "user_flow",
  "ai_intervention",
  "system_process",
  "human_control",
  "failure_strategy",
  "delivery_mode",
  "data_storage",
  "log_fields",
  "cost_strategy",
] as const;

const STEP3_REVIEW_KEYS = [
  "automation_level_adjustment",
  "auto_processing_scope",
  "tolerance_adjustment",
  "human_review_insertion",
  "failure_ux_policy",
  "final_decision_policy",
  "cost_quality_strategy",
  "cache_strategy",
  "data_assetization_strategy",
  "monitoring_standard",
  "rollback_standard",
  "model_versioning",
] as const;

const step1Schema = z.object({
  why: z.string(),
  target: z.array(z.enum(["internal_staff", "approver_admin", "end_user", "external_customer_partner", "system_operator"])),
  target_detail: z.string(),
  as_is: z.string(),
  result_state: z.enum([
    "draft_saved",
    "status_changed",
    "review_requested",
    "published_or_executed",
    "reference_saved",
    "action_triggered",
    "task_created",
    "ephemeral_response",
    "failed",
    "cancelled",
    "",
  ]),
  ai_task_types: z.array(z.enum(["classification", "draft_generation", "candidate_suggestion", "approval_assist", "revision_suggestion", "policy_check"])),
  final_executor: z.enum(["human", "conditional", "automatic", ""]),
  ai_min_role: z.enum(["draft_only", "auto_publish", ""]),
  kpi: z.string(),
  no_ai_alternative: z.array(z.enum(["manual", "template", "rule_based", "search_based", "other"])),
  no_ai_alternative_detail: z.string(),
  exposure: z.enum(["internal", "limited_external", "public", ""]),
  reversibility: z.enum(["easy", "limited", "irreversible", ""]),
  impact: z.enum(["low", "medium", "high", ""]),
  hitl: z.enum(["pre_review", "post_monitoring", "none", ""]),
});

const step2Schema = z.object({
  status_model: z.string(),
  user_flow: z.string(),
  ai_intervention: z.string(),
  system_process: z.string(),
  human_control: z.string(),
  failure_strategy: z.string(),
  delivery_mode: z.string(),
  data_storage: z.string(),
  log_fields: z.string(),
  cost_strategy: z.string(),
  reviewed: z.object({
    status_model: z.boolean(),
    user_flow: z.boolean(),
    ai_intervention: z.boolean(),
    system_process: z.boolean(),
    human_control: z.boolean(),
    failure_strategy: z.boolean(),
    delivery_mode: z.boolean(),
    data_storage: z.boolean(),
    log_fields: z.boolean(),
    cost_strategy: z.boolean(),
  }),
});

const step3Schema = z.object({
  automation_level_adjustment: z.string(),
  auto_processing_scope: z.string(),
  tolerance_adjustment: z.string(),
  human_review_insertion: z.string(),
  failure_ux_policy: z.string(),
  final_decision_policy: z.string(),
  cost_quality_strategy: z.string(),
  cache_strategy: z.string(),
  data_assetization_strategy: z.string(),
  monitoring_standard: z.string(),
  rollback_standard: z.string(),
  model_versioning: z.string(),
  reviewed: z.object({
    automation_level_adjustment: z.boolean(),
    auto_processing_scope: z.boolean(),
    tolerance_adjustment: z.boolean(),
    human_review_insertion: z.boolean(),
    failure_ux_policy: z.boolean(),
    final_decision_policy: z.boolean(),
    cost_quality_strategy: z.boolean(),
    cache_strategy: z.boolean(),
    data_assetization_strategy: z.boolean(),
    monitoring_standard: z.boolean(),
    rollback_standard: z.boolean(),
    model_versioning: z.boolean(),
  }),
});

const step4TabSchema = z.enum(STEP4_TAB_KEYS);
const step4RowIdSchema = z.enum(STEP4_ROW_IDS);
const step4RowSchema = z.object({
  rowId: step4RowIdSchema,
  title: z.string(),
  spec: z.string(),
  note: z.string(),
  relatedTabs: z.array(step4TabSchema),
});
const step4RowsSchema = z.array(step4RowSchema);

const historyActionSchema = z.enum([
  HISTORY_EVENT_TYPES.SAVE_STEP1,
  HISTORY_EVENT_TYPES.GENERATE_STEP2_DRAFT,
  HISTORY_EVENT_TYPES.FREEZE_STEP1,
  HISTORY_EVENT_TYPES.SET_EXPOSURE,
  HISTORY_EVENT_TYPES.SET_REVERSIBILITY,
  HISTORY_EVENT_TYPES.SET_IMPACT,
  HISTORY_EVENT_TYPES.SET_HITL,
  HISTORY_EVENT_TYPES.SAVE_STEP2,
  HISTORY_EVENT_TYPES.COMPLETE_STEP2,
  HISTORY_EVENT_TYPES.GENERATE_STEP3_POLICY,
  HISTORY_EVENT_TYPES.SAVE_STEP3,
  HISTORY_EVENT_TYPES.COMPLETE_STEP3,
  HISTORY_EVENT_TYPES.SAVE_STEP4,
  HISTORY_EVENT_TYPES.MANUAL_MEMO,
  HISTORY_EVENT_TYPES.SCHEMA_INVALID_RECOVERED,
]);

const historyEventSchema = z.object({
  id: z.string(),
  ts: z.number(),
  projectId: z.string(),
  stage: z.enum(["step1", "step2", "step3", "step4", "system"]),
  action: historyActionSchema,
  summary: z.string(),
});
const historySchema = z.array(historyEventSchema);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function asRiskLevel(value: unknown): RiskLevel | undefined {
  return value === "low" || value === "medium" || value === "high" ? value : undefined;
}

function asStep1Target(value: unknown): Step1Target | undefined {
  if (value === "internal_staff" || value === "approver_admin" || value === "end_user" || value === "external_customer_partner" || value === "system_operator") {
    return value;
  }

  // Legacy target migration
  if (value === "internal_operator") return "internal_staff";
  if (value === "content_writer") return "internal_staff";
  if (value === "admin") return "approver_admin";
  if (value === "general_user") return "end_user";
  if (value === "customer") return "external_customer_partner";

  return undefined;
}

function asStep1NoAiAlternative(value: unknown): Step1NoAiAlternative | undefined {
  return value === "manual" || value === "template" || value === "rule_based" || value === "search_based" || value === "other"
    ? value
    : undefined;
}

function asStep1AiTaskType(value: unknown): Step1AiTaskType | undefined {
  if (
    value === "classification" ||
    value === "draft_generation" ||
    value === "candidate_suggestion" ||
    value === "approval_assist" ||
    value === "revision_suggestion" ||
    value === "policy_check"
  ) {
    return value;
  }

  // Legacy AI task type migration
  if (value === "input_structuring") return "classification";
  if (value === "summarization") return "revision_suggestion";
  if (value === "recommendation") return "candidate_suggestion";
  if (value === "detection") return "policy_check";
  if (value === "auto_execution") return "revision_suggestion";
  if (value === "assistive_judgment") return "approval_assist";
  if (value === "no_intervention") return "policy_check";

  return undefined;
}

function asStep1FinalExecutor(value: unknown): Step1FinalExecutor | undefined {
  return value === "human" || value === "conditional" || value === "automatic" ? value : undefined;
}

function asStep1ResultState(value: unknown): Step1ResultState | undefined {
  if (
    value === "draft_saved" ||
    value === "status_changed" ||
    value === "review_requested" ||
    value === "published_or_executed" ||
    value === "reference_saved" ||
    value === "action_triggered" ||
    value === "task_created" ||
    value === "ephemeral_response" ||
    value === "failed" ||
    value === "cancelled"
  ) {
    return value;
  }

  // Legacy result_state migration
  if (value === "draft") return "draft_saved";
  if (value === "status_change") return "status_changed";
  if (value === "external_publish") return "published_or_executed";
  if (value === "internal_reference") return "reference_saved";

  return undefined;
}

function asStep1Exposure(value: unknown): Step1Exposure | undefined {
  return value === "internal" || value === "limited_external" || value === "public" ? value : undefined;
}

function asStep1Reversibility(value: unknown): Step1Reversibility | undefined {
  return value === "easy" || value === "limited" || value === "irreversible" ? value : undefined;
}

function asStep1Impact(value: unknown): Step1Impact | undefined {
  return value === "low" || value === "medium" || value === "high" ? value : undefined;
}

function asStep1Hitl(value: unknown): Step1Hitl | undefined {
  return value === "pre_review" || value === "post_monitoring" || value === "none" ? value : undefined;
}

function asStep1AiMinRole(value: unknown): Step1AiMinRole | undefined {
  return value === "draft_only" || value === "auto_publish" ? value : undefined;
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const normalized = value.filter((item): item is string => typeof item === "string");
  return normalized;
}

function asHistoryStage(value: unknown): HistoryStage | undefined {
  return value === "step1" || value === "step2" || value === "step3" || value === "step4" || value === "system"
    ? value
    : undefined;
}

function asHistoryAction(value: unknown): HistoryEventAction | undefined {
  if (value === "save") return HISTORY_EVENT_TYPES.SAVE_STEP1;
  if (value === "freeze") return HISTORY_EVENT_TYPES.FREEZE_STEP1;
  if (value === "manual_memo") return HISTORY_EVENT_TYPES.MANUAL_MEMO;
  if (typeof value !== "string") return undefined;
  const parsed = historyActionSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

function asStep4TabKey(value: unknown): Step4TabKey | undefined {
  return value === "state" ||
    value === "sequence" ||
    value === "error_retry" ||
    value === "auth" ||
    value === "dataflow" ||
    value === "observability" ||
    value === "pipeline" ||
    value === "rollback" ||
    value === "cost" ||
    value === "ia"
    ? value
    : undefined;
}

function asStep4RowId(value: unknown): Step4RowId | undefined {
  return value === "api_definition" ||
    value === "input_schema" ||
    value === "output_schema" ||
    value === "state_model" ||
    value === "state_transition_rules" ||
    value === "model_conditions" ||
    value === "fallback_conditions" ||
    value === "guardrail_policy" ||
    value === "storage_structure" ||
    value === "log_structure" ||
    value === "monitoring_items" ||
    value === "rollback_policy" ||
    value === "security_pii_policy" ||
    value === "execution_structure"
    ? value
    : undefined;
}

function getTechSpecRowDefById(rowId: Step4RowId) {
  return TECH_SPEC_ROW_DEFS.find((def) => def.rowId === rowId);
}

function getTechSpecRowDefByTitle(title: string) {
  return TECH_SPEC_ROW_DEFS.find((def) => def.title === title);
}

function key(projectId: string, suffix: string) {
  return `${NS}:${projectId}:${suffix}`;
}

function canUseStorage() {
  return typeof window !== "undefined";
}

function emitProgressUpdate() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("prism-progress-updated"));
  }
}

function readJSON(storageKey: string): unknown {
  if (!canUseStorage()) return undefined;
  try {
    const raw = localStorage.getItem(storageKey);
    return raw ? JSON.parse(raw) : undefined;
  } catch {
    return undefined;
  }
}

function writeJSON(storageKey: string, value: unknown) {
  if (!canUseStorage()) return;
  localStorage.setItem(storageKey, JSON.stringify(value));
  emitProgressUpdate();
}

function buildHistoryEvent(projectId: string, event: Omit<HistoryEvent, "id" | "ts" | "projectId">): HistoryEvent {
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    ts: Date.now(),
    projectId,
    ...event,
  };
}

const HISTORY_DEFAULT_SUMMARY: Record<HistoryEventAction, string> = {
  SAVE_STEP1: "STEP1 저장",
  GENERATE_STEP2_DRAFT: "STEP2 초안 생성",
  FREEZE_STEP1: "STEP1 확정 완료",
  SET_EXPOSURE: "노출 범위 변경",
  SET_REVERSIBILITY: "되돌림 가능성 변경",
  SET_IMPACT: "실패 비용 위치 변경",
  SET_HITL: "인간 개입 시점 변경",
  SAVE_STEP2: "STEP2 저장",
  COMPLETE_STEP2: "STEP2 완료",
  GENERATE_STEP3_POLICY: "STEP3 정책 초안 생성",
  SAVE_STEP3: "STEP3 저장",
  COMPLETE_STEP3: "STEP3 완료",
  SAVE_STEP4: "STEP4 저장",
  MANUAL_MEMO: "수동 메모",
  SCHEMA_INVALID_RECOVERED: "스키마 오류 복구",
};

function formatHistorySummary(action: HistoryEventAction, detail?: string) {
  const clean = (detail ?? "").trim();
  const body = clean || HISTORY_DEFAULT_SUMMARY[action];
  return `[${action}] ${body}`;
}

function appendHistoryEvent(projectId: string, event: Omit<HistoryEvent, "id" | "ts" | "projectId">) {
  const historyKey = key(projectId, "history");
  const existing = parseHistory(readJSON(historyKey));
  const next = buildHistoryEvent(projectId, event);
  writeJSON(historyKey, [next, ...existing].slice(0, 100));
}

function recordSchemaInvalidRecovered(projectId: string, suffix: "step1" | "step2" | "step3" | "step4") {
  addHistoryEvent(projectId, {
    stage: "system",
    action: HISTORY_EVENT_TYPES.SCHEMA_INVALID_RECOVERED,
    detail: `${suffix} schema invalid -> recovered with defaults`,
  });
}

function parseStep1(value: unknown): Partial<Step1Data> {
  if (!isRecord(value)) return {};
  const targetFromArray = (asStringArray(value.target) ?? []).map((v) => asStep1Target(v)).filter((v): v is Step1Target => Boolean(v));
  const legacyTarget = asString(value.target_user);
  const target = targetFromArray.length > 0 ? targetFromArray : [];
  if (target.length === 0 && legacyTarget?.trim()) {
    target.push("internal_staff");
  }

  const noAiFromArray = (asStringArray(value.no_ai_alternative) ?? [])
    .map((v) => asStep1NoAiAlternative(v))
    .filter((v): v is Step1NoAiAlternative => Boolean(v));
  const legacyNoAi = asString(value.no_ai_alternative);
  const noAiAlternatives = noAiFromArray.length > 0 ? noAiFromArray : [];
  if (noAiAlternatives.length === 0 && legacyNoAi?.trim()) {
    noAiAlternatives.push("manual");
  }

  const legacyRisk = asRiskLevel(value.risk_level);
  const legacyAiMinRole = asString(value.ai_min_role);
  const legacyResultArtifact = asString(value.result_artifact);
  const taskTypes = (asStringArray(value.ai_task_types) ?? [])
    .map((v) => asStep1AiTaskType(v))
    .filter((v): v is Step1AiTaskType => Boolean(v));
  const finalExecutor = asStep1FinalExecutor(value.final_executor) ?? (legacyAiMinRole === "auto_publish" ? "automatic" : undefined);
  const aiMinRole = asStep1AiMinRole(value.ai_min_role) ?? (finalExecutor === "automatic" ? "auto_publish" : legacyAiMinRole === "auto_publish" ? "auto_publish" : "draft_only");
  return {
    why: asString(value.why) ?? asString(value.why_ai),
    target,
    target_detail: asString(value.target_detail) ?? "",
    as_is: asString(value.as_is) ?? asString(value.as_is_problem),
    result_state: asStep1ResultState(value.result_state) ?? (legacyResultArtifact?.trim() ? "draft_saved" : undefined),
    ai_task_types: taskTypes,
    final_executor: finalExecutor ?? "",
    ai_min_role: aiMinRole,
    kpi: asString(value.kpi) ?? asString(value.kpi_hypothesis),
    no_ai_alternative: noAiAlternatives,
    no_ai_alternative_detail: asString(value.no_ai_alternative_detail) ?? "",
    exposure: asStep1Exposure(value.exposure) ?? (legacyRisk === "high" ? "public" : "limited_external"),
    reversibility: asStep1Reversibility(value.reversibility) ?? (legacyRisk === "high" ? "limited" : "easy"),
    impact: asStep1Impact(value.impact) ?? legacyRisk,
    hitl: asStep1Hitl(value.hitl) ?? (legacyAiMinRole === "auto_publish" ? "none" : "pre_review"),
  };
}

function parseProgress(value: unknown): Partial<ProjectProgress> {
  if (!isRecord(value)) return {};
  return {
    step1Frozen: asBoolean(value.step1Frozen),
    step2Completed: asBoolean(value.step2Completed),
    step3Completed: asBoolean(value.step3Completed),
  };
}

function parseStep2(value: unknown): Partial<Step2Data> {
  if (!isRecord(value)) return {};
  const reviewedSource = isRecord(value.reviewed) ? value.reviewed : {};
  const reviewed = Object.fromEntries(
    STEP2_REVIEW_KEYS.map((k) => [k, asBoolean(reviewedSource[k]) ?? false])
  ) as Step2Data["reviewed"];

  return {
    status_model: asString(value.status_model),
    user_flow: asString(value.user_flow),
    ai_intervention: asString(value.ai_intervention),
    system_process: asString(value.system_process),
    human_control: asString(value.human_control),
    failure_strategy: asString(value.failure_strategy),
    delivery_mode: asString(value.delivery_mode),
    data_storage: asString(value.data_storage),
    log_fields: asString(value.log_fields),
    cost_strategy: asString(value.cost_strategy),
    reviewed,
  };
}

function parseStep3(value: unknown): Partial<Step3Policy> {
  if (!isRecord(value)) return {};
  const reviewedSource = isRecord(value.reviewed) ? value.reviewed : {};
  const reviewed = Object.fromEntries(
    STEP3_REVIEW_KEYS.map((k) => [k, asBoolean(reviewedSource[k]) ?? false])
  ) as Step3Policy["reviewed"];

  return {
    automation_level_adjustment: asString(value.automation_level_adjustment),
    auto_processing_scope: asString(value.auto_processing_scope),
    tolerance_adjustment: asString(value.tolerance_adjustment),
    human_review_insertion: asString(value.human_review_insertion),
    failure_ux_policy: asString(value.failure_ux_policy),
    final_decision_policy: asString(value.final_decision_policy),
    cost_quality_strategy: asString(value.cost_quality_strategy),
    cache_strategy: asString(value.cache_strategy),
    data_assetization_strategy: asString(value.data_assetization_strategy),
    monitoring_standard: asString(value.monitoring_standard),
    rollback_standard: asString(value.rollback_standard),
    model_versioning: asString(value.model_versioning),
    reviewed,
  };
}

function parseStep4Rows(value: unknown): Step4Row[] {
  if (!Array.isArray(value)) return [];
  const rows: Step4Row[] = [];
  for (const row of value) {
    if (!isRecord(row)) continue;
    const rowIdRaw = asStep4RowId(row.rowId);
    const titleRaw = asString(row.title) ?? asString(row.item);
    const spec = asString(row.spec);
    const note = asString(row.note);
    if (spec === undefined || note === undefined) continue;

    const byId = rowIdRaw ? getTechSpecRowDefById(rowIdRaw) : undefined;
    const byTitle = titleRaw ? getTechSpecRowDefByTitle(titleRaw) : undefined;
    const def = byId ?? byTitle;
    if (!def) continue;

    const relatedTabsRaw = Array.isArray(row.relatedTabs) ? row.relatedTabs : [];
    const relatedTabs = relatedTabsRaw
      .map((tab) => asStep4TabKey(tab))
      .filter((tab): tab is Step4TabKey => Boolean(tab));

    rows.push({
      rowId: def.rowId,
      title: def.title,
      spec,
      note,
      relatedTabs: relatedTabs.length > 0 ? relatedTabs : def.relatedTabs,
    });
  }
  return rows;
}

function parseHistory(value: unknown): HistoryEvent[] {
  if (!Array.isArray(value)) return [];
  const events: HistoryEvent[] = [];
  for (const event of value) {
    if (!isRecord(event)) continue;
    const id = asString(event.id);
    const projectId = asString(event.projectId);
    const action = asHistoryAction(event.action);
    const summary = asString(event.summary);
    const stage = asHistoryStage(event.stage);
    const ts = typeof event.ts === "number" ? event.ts : undefined;
    if (!id || !projectId || !action || !stage || ts === undefined) continue;
    events.push({ id, projectId, action, summary: summary ?? formatHistorySummary(action), stage, ts });
  }
  return events;
}

export function getDefaultStep1(): Step1Data {
  return {
    why: "",
    target: [],
    target_detail: "",
    as_is: "",
    result_state: "",
    ai_task_types: [],
    final_executor: "",
    ai_min_role: "",
    kpi: "",
    no_ai_alternative: [],
    no_ai_alternative_detail: "",
    exposure: "",
    reversibility: "",
    impact: "",
    hitl: "",
  };
}

export function getDefaultStep2(): Step2Data {
  return {
    status_model: "",
    user_flow: "",
    ai_intervention: "",
    system_process: "",
    human_control: "",
    failure_strategy: "",
    delivery_mode: "",
    data_storage: "",
    log_fields: "",
    cost_strategy: "",
    reviewed: {
      status_model: false,
      user_flow: false,
      ai_intervention: false,
      system_process: false,
      human_control: false,
      failure_strategy: false,
      delivery_mode: false,
      data_storage: false,
      log_fields: false,
      cost_strategy: false,
    },
  };
}

export function getDefaultPolicy(): Step3Policy {
  return {
    automation_level_adjustment: "",
    auto_processing_scope: "",
    tolerance_adjustment: "",
    human_review_insertion: "",
    failure_ux_policy: "",
    final_decision_policy: "",
    cost_quality_strategy: "",
    cache_strategy: "",
    data_assetization_strategy: "",
    monitoring_standard: "",
    rollback_standard: "",
    model_versioning: "",
    reviewed: {
      automation_level_adjustment: false,
      auto_processing_scope: false,
      tolerance_adjustment: false,
      human_review_insertion: false,
      failure_ux_policy: false,
      final_decision_policy: false,
      cost_quality_strategy: false,
      cache_strategy: false,
      data_assetization_strategy: false,
      monitoring_standard: false,
      rollback_standard: false,
      model_versioning: false,
    },
  };
}

export function getProgress(projectId: string): ProjectProgress {
  const raw = readJSON(key(projectId, "progress"));
  const parsed = parseProgress(raw);
  return {
    step1Frozen: parsed.step1Frozen ?? false,
    step2Completed: parsed.step2Completed ?? false,
    step3Completed: parsed.step3Completed ?? false,
  };
}

export function setProgress(projectId: string, patch: Partial<ProjectProgress>) {
  const current = getProgress(projectId);
  writeJSON(key(projectId, "progress"), { ...current, ...patch });
}

export function getStep1Data(projectId: string): Step1Data {
  const raw = readJSON(key(projectId, "step1"));
  const parsed = step1Schema.safeParse(raw);
  if (parsed.success) return parsed.data;
  if (raw === undefined) return getDefaultStep1();

  const recovered = { ...getDefaultStep1(), ...parseStep1(raw) };
  const safeRecovered = step1Schema.safeParse(recovered);
  const next = safeRecovered.success ? safeRecovered.data : getDefaultStep1();
  writeJSON(key(projectId, "step1"), next);
  recordSchemaInvalidRecovered(projectId, "step1");
  return next;
}

export function setStep1Data(projectId: string, data: Step1Data) {
  writeJSON(key(projectId, "step1"), data);
}

export function getStep2Draft(projectId: string): string {
  const raw = readJSON(key(projectId, "step2"));
  if (typeof raw === "string") return raw;
  const merged = getStep2Data(projectId);
  return step2ToText(merged);
}

export function setStep2Draft(projectId: string, draft: string) {
  writeJSON(key(projectId, "step2"), draft);
}

export function getStep2Data(projectId: string): Step2Data {
  const raw = readJSON(key(projectId, "step2"));
  if (typeof raw === "string") {
    const recovered = {
      ...getDefaultStep2(),
      system_process: raw,
    };
    writeJSON(key(projectId, "step2"), recovered);
    recordSchemaInvalidRecovered(projectId, "step2");
    return recovered;
  }
  const parsed = step2Schema.safeParse(raw);
  if (parsed.success) return parsed.data;
  if (raw === undefined) return getDefaultStep2();

  const recovered = { ...getDefaultStep2(), ...parseStep2(raw) };
  const safeRecovered = step2Schema.safeParse(recovered);
  const next = safeRecovered.success ? safeRecovered.data : getDefaultStep2();
  writeJSON(key(projectId, "step2"), next);
  recordSchemaInvalidRecovered(projectId, "step2");
  return next;
}

export function setStep2Data(projectId: string, data: Step2Data) {
  writeJSON(key(projectId, "step2"), data);
}

export function getStep3Policy(projectId: string): Step3Policy {
  const source = readJSON(key(projectId, "step3"));
  const parsed = step3Schema.safeParse(source);
  if (parsed.success) return parsed.data;
  if (source === undefined) return getDefaultPolicy();

  const raw = parseStep3(source);
  const defaults = getDefaultPolicy();
  const recovered = {
    ...defaults,
    ...raw,
    reviewed: { ...defaults.reviewed, ...(raw.reviewed ?? {}) },
  };
  const safeRecovered = step3Schema.safeParse(recovered);
  const next = safeRecovered.success ? safeRecovered.data : defaults;
  writeJSON(key(projectId, "step3"), next);
  recordSchemaInvalidRecovered(projectId, "step3");
  return next;
}

export function setStep3Policy(projectId: string, data: Step3Policy) {
  writeJSON(key(projectId, "step3"), data);
}

export function getStep4Rows(projectId: string): Step4Row[] {
  const raw = readJSON(key(projectId, "step4"));
  const parsed = step4RowsSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  if (raw === undefined) return [];

  const recovered = parseStep4Rows(raw);
  const safeRecovered = step4RowsSchema.safeParse(recovered);
  const next = safeRecovered.success ? safeRecovered.data : [];
  writeJSON(key(projectId, "step4"), next);
  recordSchemaInvalidRecovered(projectId, "step4");
  return next;
}

export function setStep4Rows(projectId: string, rows: Step4Row[]) {
  writeJSON(key(projectId, "step4"), rows);
}

export function getHistory(projectId: string): HistoryEvent[] {
  return parseHistory(readJSON(key(projectId, "history")));
}

export function addHistoryEvent(
  projectId: string,
  event: { stage: HistoryStage; action: HistoryEventAction; detail?: string; summary?: string }
) {
  appendHistoryEvent(projectId, {
    stage: event.stage,
    action: event.action,
    summary: event.summary ? formatHistorySummary(event.action, event.summary) : formatHistorySummary(event.action, event.detail),
  });
}

export function getMissingStep1RequiredFields(step1: Step1Data): string[] {
  const missing: string[] = [];
  if (!step1.why.trim()) missing.push("왜 AI를 붙이는가");
  if (step1.target.length === 0) missing.push("누구를 위한 기능인가");
  if (!step1.as_is.trim()) missing.push("어떤 문제인가 (AS-IS)");
  if (!step1.result_state) missing.push("끝나면 무엇이 남는가");
  if (step1.ai_task_types.length === 0) missing.push("AI 작업 유형");
  if (!step1.kpi.trim()) missing.push("KPI/지표 가설");
  if (step1.no_ai_alternative.length === 0 && step1.no_ai_alternative_detail.trim().length === 0) {
    missing.push("AI 없이 대안");
  }
  if (!step1.exposure) missing.push("노출 범위");
  if (!step1.reversibility) missing.push("되돌림 가능성");
  if (!step1.impact) missing.push("실패 비용 위치");
  if (!step1.hitl) missing.push("인간 개입 시점");
  return missing;
}

export function canFreezeStep1(step1: Step1Data) {
  return getMissingStep1RequiredFields(step1).length === 0;
}

export function computeRisk(input: Pick<Step1Data, "exposure" | "reversibility" | "impact" | "hitl">): RiskLevel {
  if (input.impact === "high") return "high";
  if (input.exposure === "public" && input.hitl === "none") return "high";
  if (input.reversibility === "irreversible") return "high";
  if (input.impact === "medium") return "medium";
  return "low";
}

export function getGoStopResult(step1: Step1Data): "GO" | "STOP" {
  const risk = computeRisk(step1);
  const canAutoPublish = step1.exposure !== "public" && step1.impact !== "high";
  if (risk === "high" && !canAutoPublish) return "STOP";
  return "GO";
}

export function canAccessExecution(progress: ProjectProgress) {
  return progress.step1Frozen;
}

export function canAccessPolicy(progress: ProjectProgress) {
  return progress.step1Frozen && progress.step2Completed;
}

export function canAccessTechSpec(progress: ProjectProgress) {
  return progress.step1Frozen && progress.step2Completed && progress.step3Completed;
}

export function generateStep2Draft(step1: Step1Data): string {
  return step2ToText(generateStep2Data(step1));
}

export function generateStep2Data(step1: Step1Data): Step2Data {
  const requiresPreReview = step1.hitl === "pre_review" || step1.impact === "high";
  const canAutoPublish = step1.exposure !== "public" && step1.impact !== "high";
  const statusModel = requiresPreReview
    ? "input -> generating -> draft -> review_requested -> approved -> published (failed/rejected 별도 권장)"
    : "input -> generating -> draft -> user_edit -> publish_requested -> published (failed/rejected 별도 권장)";
  const exposurePolicy =
    step1.exposure === "public"
      ? "외부 공개 단계는 승인(휴먼 검토) 필수"
      : step1.exposure === "limited_external"
        ? "제한적 외부 노출은 정책 기준 충족 시 승인"
        : "내부 참고용은 내부 정책 기준으로 처리";
  const monitoringLevel =
    step1.impact === "high"
      ? "오류율/승인 반려율/정책 위반율을 강화 모니터링"
      : step1.impact === "medium"
        ? "오류율/응답시간/사용자 수정률 기본 모니터링"
        : "오류율/응답시간 경량 모니터링";
  return {
    ...getDefaultStep2(),
    status_model: statusModel,
    user_flow: "프로젝트 생성 -> 입력 작성 -> AI 초안 생성 -> 수정 -> 게시 요청",
    ai_intervention: "입력 완료 시 draft 단계에서 자동 초안 생성",
    system_process: `입력값 검증 -> AI 호출 -> 결과 저장 -> 상태 draft 변경 (실패 시 failed), 정책: ${exposurePolicy}`,
    human_control: `${requiresPreReview ? "사전 리뷰(pre_review) 후 게시 가능" : "게시 후 모니터링(post_monitoring) 기반 운영"} (AI 최소 역할: ${step1.ai_min_role || "draft_only"})`,
    failure_strategy: "AI 실패 시 1회 재시도 -> 실패 시 알림 및 수동 모드 전환 (idempotent 처리)",
    delivery_mode: "화면에 초안 + 상태 배지(draft) 노출, 저장 완료 후 노출",
    data_storage: "post_drafts 저장 + confidence + version 필드",
    log_fields: "input/output/model_version/call_time/latency/error_code",
    cost_strategy: `${canAutoPublish ? "자동 게시 조건부 허용" : "자동 게시 비활성"} / ${monitoringLevel}`,
  };
}

export function step2ToText(step2: Step2Data): string {
  return [
    "[STEP2 설계 초안]",
    `- 기본 상태 모델: ${step2.status_model || "미정"}`,
    `- 사용자 행동 흐름: ${step2.user_flow || "미정"}`,
    `- AI 개입 위치: ${step2.ai_intervention || "미정"}`,
    `- 시스템 처리 구조: ${step2.system_process || "미정"}`,
    `- Human control: ${step2.human_control || "미정"}`,
    `- 실패 대응: ${step2.failure_strategy || "미정"}`,
    `- 결과 전달 방식: ${step2.delivery_mode || "미정"}`,
    `- 데이터 저장 구조: ${step2.data_storage || "미정"}`,
    `- 기본 로그 항목: ${step2.log_fields || "미정"}`,
    `- 비용 전략: ${step2.cost_strategy || "미정"}`,
    "",
    "[상태 모델]",
    step2.status_model || "미정",
    "",
    "[AI 개입 위치]",
    step2.ai_intervention || "미정",
    "",
    "[자동 생성 레이어 - 기본 상태 모델]",
    "input -> generating -> draft -> review -> published",
    "",
    "[자동 생성 레이어 - 기본 실패 전략]",
    "- model_error 발생 시 1회 재시도",
    "- 재시도 실패 시 failed 상태 + 수동 모드 전환",
    "",
    "[자동 생성 레이어 - 기본 로그 구조]",
    "- trace_id, model_version, latency_ms, error_code, edit_rate",
    "",
    "[자동 생성 레이어 - 기본 모델 전략]",
    "- 기본 모델 우선, 고난도 입력만 상위 모델",
    "",
    "[자동 생성 레이어 - 기본 fallback]",
    "- AI 실패 시 템플릿 기반 수동 작성 버튼 노출",
    "",
    "[자동 생성 레이어 - 기본 재시도 정책]",
    "- 지수 백오프 1회 재시도",
    "",
    "[자동 생성 레이어 - 기본 모니터링 지표]",
    "- 오류율, p95 응답시간, 사용자 수정률, 호출당 비용",
    "",
    "[자동 생성 레이어 - 기본 캐시 전략]",
    "- 입력 hash 기준 단기 캐시, 정책 변경 시 무효화",
  ].join("\n");
}

export function getStep2MissingFields(step2: Step2Data): string[] {
  const required: Array<{ key: keyof Step2Data; label: string }> = [
    { key: "status_model", label: "기본 상태 모델" },
    { key: "user_flow", label: "사용자 행동 흐름" },
    { key: "ai_intervention", label: "AI 개입 위치" },
    { key: "system_process", label: "시스템 처리 구조" },
    { key: "human_control", label: "Human control 기본값" },
    { key: "failure_strategy", label: "실패 대응 기본 구조" },
    { key: "delivery_mode", label: "결과 전달 방식" },
    { key: "data_storage", label: "데이터 저장 구조" },
    { key: "log_fields", label: "기본 로그 항목" },
    { key: "cost_strategy", label: "비용 전략 기본값" },
  ];
  return required
    .filter((f) => {
      const value = step2[f.key];
      return typeof value === "string" ? !value.trim() : false;
    })
    .map((f) => f.label);
}

export function canCompleteStep2(step2: Step2Data): boolean {
  const missing = getStep2MissingFields(step2);
  const allReviewed = Object.values(step2.reviewed).every(Boolean);
  return missing.length === 0 && allReviewed;
}

export function generateStep3Policy(step1: Step1Data, step2: Step2Data): Step3Policy {
  return {
    ...getDefaultPolicy(),
    automation_level_adjustment: "draft는 자동 생성, publish 승인(외부 반영)은 휴먼 필수",
    auto_processing_scope: "confidence 0.8 이상만 auto_approved (초안 내부 저장 승인, 배포 아님)",
    tolerance_adjustment: "confidence 0.7 미만 경고 표시 후 수정 유도",
    human_review_insertion: "특정 카테고리(광고/민감 주제)는 리뷰 단계 추가",
    failure_ux_policy: "1회 자동 재시도 후 실패 시 수동 모드 전환 버튼 제공",
    final_decision_policy: "AI 결과는 참고용, 최종 결정은 사용자",
    cost_quality_strategy: "기본 모델 사용, 800자 초과 시 고급 모델 조건부 호출",
    cache_strategy: "동일 입력은 기존 결과 재사용 (입력 hash 기준)",
    data_assetization_strategy: "사용자 수정 로그만 저장, 자동 학습은 미적용",
    monitoring_standard: "오류율/응답시간/사용자 수정률 추적 (오류율 3% 이하 유지 목표)",
    rollback_standard: "오류율 5% 초과 시 이전 모델로 롤백 (모델 단위)",
    model_versioning: `모델 버전 및 호출 로그 필수 저장 (대상 사용자: ${step1.target.join(", ") || "미정"}, 상태 모델: ${step2.status_model || "미정"})`,
  };
}

export function getStep3MissingFields(step3: Step3Policy): string[] {
  const required: Array<{ key: Step3FieldKey; label: string }> = [
    { key: "automation_level_adjustment", label: "자동화 수준 조정" },
    { key: "auto_processing_scope", label: "자동 처리 범위 조정" },
    { key: "tolerance_adjustment", label: "허용 오차 조정" },
    { key: "human_review_insertion", label: "Human review 삽입 여부" },
    { key: "failure_ux_policy", label: "실패 시 UX 정책" },
    { key: "final_decision_policy", label: "AI 판단 최종 여부" },
    { key: "cost_quality_strategy", label: "비용-품질 균형 전략" },
    { key: "cache_strategy", label: "캐시 전략" },
    { key: "data_assetization_strategy", label: "데이터 자산화 전략" },
    { key: "monitoring_standard", label: "모니터링 기준" },
    { key: "rollback_standard", label: "롤백 기준" },
    { key: "model_versioning", label: "모델 버전 관리" },
  ];
  return required
    .filter((f) => !String(step3[f.key] ?? "").trim())
    .map((f) => f.label);
}

export function canCompleteStep3(step3: Step3Policy): boolean {
  const missing = getStep3MissingFields(step3);
  const allReviewed = Object.values(step3.reviewed).every(Boolean);
  return missing.length === 0 && allReviewed;
}

export function generateTechSpec(step1: Step1Data, step2Draft: string, step3: Step3Policy): string {
  const risk = computeRisk(step1);
  return [
    "# STEP4 기술 스펙 (더미)",
    "",
    "## API",
    "- POST /generate",
    "- POST /approve",
    "- PATCH /edit",
    "",
    "## 입력 맥락",
    `- why: ${step1.why || "미정"}`,
    `- target: ${step1.target.join(", ") || "미정"}`,
    `- as_is: ${step1.as_is || "미정"}`,
    `- result_state: ${step1.result_state || "미정"}`,
    `- kpi: ${step1.kpi || "미정"}`,
    `- no_ai_alternative: ${step1.no_ai_alternative_detail || step1.no_ai_alternative.join(", ") || "미정"}`,
    `- exposure: ${step1.exposure || "미정"}`,
    `- reversibility: ${step1.reversibility || "미정"}`,
    `- impact: ${step1.impact || "미정"}`,
    `- hitl: ${step1.hitl || "미정"}`,
    `- risk_level(computed): ${risk}`,
    "",
    "## 정책",
    `- automation_level_adjustment: ${step3.automation_level_adjustment}`,
    `- auto_processing_scope: ${step3.auto_processing_scope}`,
    `- tolerance_adjustment: ${step3.tolerance_adjustment}`,
    `- human_review_insertion: ${step3.human_review_insertion}`,
    `- failure_ux_policy: ${step3.failure_ux_policy}`,
    `- final_decision_policy: ${step3.final_decision_policy}`,
    `- cost_quality_strategy: ${step3.cost_quality_strategy}`,
    `- cache_strategy: ${step3.cache_strategy}`,
    `- data_assetization_strategy: ${step3.data_assetization_strategy}`,
    `- monitoring_standard: ${step3.monitoring_standard}`,
    `- rollback_standard: ${step3.rollback_standard}`,
    `- model_versioning: ${step3.model_versioning}`,
    "",
    "## 설계 초안 원문",
    step2Draft || "(비어 있음)",
  ].join("\n");
}

export function generateTechSpecRows(step1: Step1Data, step2: Step2Data, step3: Step3Policy): Step4Row[] {
  void step1;
  const stateModel = step2.status_model || "input -> generating -> draft -> user_edit -> review_requested -> published";
  const autoScope = step3.auto_processing_scope || "confidence 0.8 이상만 auto_approved";
  const fallback = step3.failure_ux_policy || "1회 자동 재시도 -> 실패 시 failed";
  const modelCond = step3.cost_quality_strategy || "기본 모델 사용, 조건부 상위 모델 호출";
  const guardrail = step3.tolerance_adjustment || "confidence < 0.7 경고 + 정책 필터";
  const monitor = step3.monitoring_standard || "오류율/응답시간/사용자 수정률 추적";
  const rollback = step3.rollback_standard || "오류율 5% 초과 시 이전 모델로 롤백";
  const pii = step3.data_assetization_strategy || "PII 마스킹 저장, 원문 로그 미저장";
  const contentById: Record<Step4RowId, Pick<Step4Row, "spec" | "note">> = {
    api_definition: {
      spec: "POST /posts\nPOST /posts/{id}/generate\nPATCH /posts/{id}\nPOST /posts/{id}/publish-request\nPOST /posts/{id}/approve",
      note: "generate/approve 권한 체크 필수, rate limit 필수, 에러코드(400/401/429/500) 정의",
    },
    input_schema: {
      spec: "topic, platform, tone, key_messages[], constraints",
      note: "필수/선택 구분, platform/tone enum 고정, 최대 길이 제한 필요",
    },
    output_schema: {
      spec: "draft_text, hashtags[], cta, confidence, rationale",
      note: "confidence 내부 기준, rationale 노출 여부 정책 필요",
    },
    state_model: {
      spec: stateModel,
      note: "DB enum 고정 필요, failed/rejected 상태 추가 권장",
    },
    state_transition_rules: {
      spec: `${autoScope}\npublish 승인 = 외부 반영 승인 (휴먼 필수)`,
      note: "auto_approved는 초안 내부 저장 승인(배포 아님), 상태 변경은 서버 전용",
    },
    model_conditions: {
      spec: modelCond,
      note: "토큰 기준 환산 필요, 요금제/민감 카테고리 분기 가능",
    },
    fallback_conditions: {
      spec: fallback,
      note: "429/5xx 분리 처리, 지수 백오프 권장",
    },
    guardrail_policy: {
      spec: guardrail,
      note: "금칙어 + 정책 필터 병행 권장, 카테고리별 분리 가능",
    },
    storage_structure: {
      spec: "posts(id, user_id, status, created_at)\npost_drafts(post_id, version, draft_json, confidence, model, model_version)",
      note: "version 필수, 입력 스냅샷 저장 권장",
    },
    log_structure: {
      spec: "logs(input, output, model_version, latency, error_code)",
      note: "PII 마스킹 필수, 샘플링 저장 여부 결정",
    },
    monitoring_items: {
      spec: monitor,
      note: "임계값 정의 필요 (예: 오류율 3%)",
    },
    rollback_policy: {
      spec: rollback,
      note: "모델/프롬프트 버전 분리 관리 필요",
    },
    security_pii_policy: {
      spec: pii,
      note: "PII 범위 명확화 필요",
    },
    execution_structure: {
      spec: "초안 생성 동기 처리\n게시 승인 비동기 처리",
      note: "동기 타임아웃 UX 필요, 비동기 큐 재처리 전략 필요",
    },
  };

  return TECH_SPEC_ROW_DEFS.map((def) => ({
    rowId: def.rowId,
    title: def.title,
    relatedTabs: def.relatedTabs,
    spec: contentById[def.rowId].spec,
    note: contentById[def.rowId].note,
  }));
}
