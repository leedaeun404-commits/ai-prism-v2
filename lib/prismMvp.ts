export type RiskLevel = "low" | "medium" | "high";
export type AiMinRole = "draft_only" | "auto_publish";

export type Step1Data = {
  why_ai: string;
  target_user: string;
  as_is_problem: string;
  result_artifact: string;
  ai_min_role: AiMinRole;
  risk_level: RiskLevel;
  kpi_hypothesis: string;
  no_ai_alternative: string;
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
  item: string;
  spec: string;
  note: string;
};

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

export type HistoryEvent = {
  id: string;
  ts: number;
  projectId: string;
  stage: HistoryStage;
  action: string;
  summary: string;
};

const NS = "prism2:mvp";

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

function readJSON<T>(storageKey: string, fallback: T): T {
  if (!canUseStorage()) return fallback;
  try {
    const raw = localStorage.getItem(storageKey);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJSON(storageKey: string, value: unknown) {
  if (!canUseStorage()) return;
  localStorage.setItem(storageKey, JSON.stringify(value));
  emitProgressUpdate();
}

export function getDefaultStep1(): Step1Data {
  return {
    why_ai: "",
    target_user: "",
    as_is_problem: "",
    result_artifact: "",
    ai_min_role: "draft_only",
    risk_level: "medium",
    kpi_hypothesis: "",
    no_ai_alternative: "",
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
  return readJSON<ProjectProgress>(key(projectId, "progress"), {
    step1Frozen: false,
    step2Completed: false,
    step3Completed: false,
  });
}

export function setProgress(projectId: string, patch: Partial<ProjectProgress>) {
  const current = getProgress(projectId);
  writeJSON(key(projectId, "progress"), { ...current, ...patch });
}

export function getStep1Data(projectId: string): Step1Data {
  const raw = readJSON<Partial<Step1Data>>(key(projectId, "step1"), {});
  return { ...getDefaultStep1(), ...raw };
}

export function setStep1Data(projectId: string, data: Step1Data) {
  writeJSON(key(projectId, "step1"), data);
}

export function getStep2Draft(projectId: string): string {
  const raw = readJSON<unknown>(key(projectId, "step2"), "");
  if (typeof raw === "string") return raw;
  const merged = getStep2Data(projectId);
  return step2ToText(merged);
}

export function setStep2Draft(projectId: string, draft: string) {
  writeJSON(key(projectId, "step2"), draft);
}

export function getStep2Data(projectId: string): Step2Data {
  const raw = readJSON<unknown>(key(projectId, "step2"), {});
  if (typeof raw === "string") {
    return {
      ...getDefaultStep2(),
      system_process: raw,
    };
  }
  return { ...getDefaultStep2(), ...(raw as Partial<Step2Data>) };
}

export function setStep2Data(projectId: string, data: Step2Data) {
  writeJSON(key(projectId, "step2"), data);
}

export function getStep3Policy(projectId: string): Step3Policy {
  const raw = readJSON<Partial<Step3Policy>>(key(projectId, "step3"), {});
  return {
    ...getDefaultPolicy(),
    ...raw,
    reviewed: { ...getDefaultPolicy().reviewed, ...(raw.reviewed ?? {}) },
  };
}

export function setStep3Policy(projectId: string, data: Step3Policy) {
  writeJSON(key(projectId, "step3"), data);
}

export function getStep4Rows(projectId: string): Step4Row[] {
  return readJSON<Step4Row[]>(key(projectId, "step4"), []);
}

export function setStep4Rows(projectId: string, rows: Step4Row[]) {
  writeJSON(key(projectId, "step4"), rows);
}

export function getHistory(projectId: string): HistoryEvent[] {
  return readJSON<HistoryEvent[]>(key(projectId, "history"), []);
}

export function addHistoryEvent(projectId: string, event: Omit<HistoryEvent, "id" | "ts" | "projectId">) {
  const list = getHistory(projectId);
  const next: HistoryEvent = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    ts: Date.now(),
    projectId,
    ...event,
  };
  writeJSON(key(projectId, "history"), [next, ...list].slice(0, 100));
}

export function getMissingStep1RequiredFields(step1: Step1Data): string[] {
  const required: Array<{ key: keyof Step1Data; label: string }> = [
    { key: "why_ai", label: "왜 AI를 붙이는가" },
    { key: "target_user", label: "누구를 위한 기능인가" },
    { key: "as_is_problem", label: "어떤 문제인가 (AS-IS)" },
    { key: "result_artifact", label: "끝나면 무엇이 남는가" },
    { key: "ai_min_role", label: "AI 최소 역할" },
    { key: "risk_level", label: "리스크 허용 수준" },
  ];

  return required
    .filter((f) => {
      const value = step1[f.key];
      return typeof value === "string" ? !value.trim() : !value;
    })
    .map((f) => f.label);
}

export function canFreezeStep1(step1: Step1Data) {
  return getMissingStep1RequiredFields(step1).length === 0;
}

export function getGoStopResult(step1: Step1Data): "GO" | "STOP" {
  if (step1.risk_level === "high" && step1.ai_min_role === "auto_publish") {
    return "STOP";
  }
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
  return {
    ...getDefaultStep2(),
    status_model: "input -> generating -> draft -> user_edit -> publish (failed/rejected 별도 권장)",
    user_flow: "프로젝트 생성 -> 입력 작성 -> AI 초안 생성 -> 수정 -> 게시 요청",
    ai_intervention: "입력 완료 시 draft 단계에서 자동 초안 생성",
    system_process: "입력값 검증 -> AI 호출 -> 결과 저장 -> 상태 draft 변경 (실패 시 failed)",
    human_control: `사용자 수정 가능, publish 승인 필요 (AI 최소 역할: ${step1.ai_min_role})`,
    failure_strategy: "AI 실패 시 1회 재시도 -> 실패 시 알림 및 수동 모드 전환 (idempotent 처리)",
    delivery_mode: "화면에 초안 + 상태 배지(draft) 노출, 저장 완료 후 노출",
    data_storage: "post_drafts 저장 + confidence + version 필드",
    log_fields: "input/output/model_version/call_time/latency/error_code",
    cost_strategy: "기본 모델 우선, 고난도 입력만 상위 모델 (서버 정책으로 결정)",
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
    automation_level_adjustment: "draft는 자동 생성, publish는 승인 필요",
    auto_processing_scope: "confidence 0.8 이상만 auto_approved",
    tolerance_adjustment: "confidence 0.7 미만 경고 표시 후 수정 유도",
    human_review_insertion: "특정 카테고리(광고/민감 주제)는 리뷰 단계 추가",
    failure_ux_policy: "1회 자동 재시도 후 실패 시 수동 모드 전환 버튼 제공",
    final_decision_policy: "AI 결과는 참고용, 최종 결정은 사용자",
    cost_quality_strategy: "기본 모델 사용, 800자 초과 시 고급 모델 조건부 호출",
    cache_strategy: "동일 입력은 기존 결과 재사용 (입력 hash 기준)",
    data_assetization_strategy: "사용자 수정 로그만 저장, 자동 학습은 미적용",
    monitoring_standard: "오류율/응답시간/사용자 수정률 추적 (오류율 3% 이하 유지 목표)",
    rollback_standard: "오류율 5% 초과 시 이전 모델로 롤백 (모델 단위)",
    model_versioning: `모델 버전 및 호출 로그 필수 저장 (대상 사용자: ${step1.target_user || "미정"}, 상태 모델: ${step2.status_model || "미정"})`,
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
  return [
    "# STEP4 기술 스펙 (더미)",
    "",
    "## API",
    "- POST /generate",
    "- POST /approve",
    "- PATCH /edit",
    "",
    "## 입력 맥락",
    `- why_ai: ${step1.why_ai || "미정"}`,
    `- target_user: ${step1.target_user || "미정"}`,
    `- as_is_problem: ${step1.as_is_problem || "미정"}`,
    `- result_artifact: ${step1.result_artifact || "미정"}`,
    `- ai_min_role: ${step1.ai_min_role}`,
    `- risk_level: ${step1.risk_level}`,
    `- kpi_hypothesis: ${step1.kpi_hypothesis || "미정"}`,
    `- no_ai_alternative: ${step1.no_ai_alternative || "미정"}`,
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
  const stateModel = step2.status_model || "input -> generating -> draft -> user_edit -> review_requested -> published";
  const autoScope = step3.auto_processing_scope || "confidence 0.8 이상만 auto_approved";
  const fallback = step3.failure_ux_policy || "1회 자동 재시도 -> 실패 시 failed";
  const modelCond = step3.cost_quality_strategy || "기본 모델 사용, 조건부 상위 모델 호출";
  const guardrail = step3.tolerance_adjustment || "confidence < 0.7 경고 + 정책 필터";
  const monitor = step3.monitoring_standard || "오류율/응답시간/사용자 수정률 추적";
  const rollback = step3.rollback_standard || "오류율 5% 초과 시 이전 모델로 롤백";
  const pii = step3.data_assetization_strategy || "PII 마스킹 저장, 원문 로그 미저장";

  return [
    {
      item: "API 정의",
      spec: "POST /posts\nPOST /posts/{id}/generate\nPATCH /posts/{id}\nPOST /posts/{id}/publish-request\nPOST /posts/{id}/approve",
      note: "generate/approve 권한 체크 필수, rate limit 필수, 에러코드(400/401/429/500) 정의",
    },
    {
      item: "입력 스키마",
      spec: "topic, platform, tone, key_messages[], constraints",
      note: "필수/선택 구분, platform/tone enum 고정, 최대 길이 제한 필요",
    },
    {
      item: "출력 스키마",
      spec: "draft_text, hashtags[], cta, confidence, rationale",
      note: "confidence 내부 기준, rationale 노출 여부 정책 필요",
    },
    {
      item: "상태 모델",
      spec: stateModel,
      note: "DB enum 고정 필요, failed/rejected 상태 추가 권장",
    },
    {
      item: "상태 전이 규칙",
      spec: `${autoScope}\npublish는 승인 필요`,
      note: "상태 변경은 서버 전용, review 반려 흐름 정의 필요",
    },
    {
      item: "모델 조건",
      spec: modelCond,
      note: "토큰 기준 환산 필요, 요금제/민감 카테고리 분기 가능",
    },
    {
      item: "Fallback 조건",
      spec: fallback,
      note: "429/5xx 분리 처리, 지수 백오프 권장",
    },
    {
      item: "Guardrail 정책",
      spec: guardrail,
      note: "금칙어 + 정책 필터 병행 권장, 카테고리별 분리 가능",
    },
    {
      item: "저장 구조",
      spec: "posts(id, user_id, status, created_at)\npost_drafts(post_id, version, draft_json, confidence, model, model_version)",
      note: "version 필수, 입력 스냅샷 저장 권장",
    },
    {
      item: "로그 구조",
      spec: "logs(input, output, model_version, latency, error_code)",
      note: "PII 마스킹 필수, 샘플링 저장 여부 결정",
    },
    {
      item: "모니터링 항목",
      spec: monitor,
      note: "임계값 정의 필요 (예: 오류율 3%)",
    },
    {
      item: "롤백 정책",
      spec: rollback,
      note: "모델/프롬프트 버전 분리 관리 필요",
    },
    {
      item: "보안/PII 정책",
      spec: pii,
      note: "PII 범위 명확화 필요",
    },
    {
      item: "실행 구조",
      spec: "초안 생성 동기 처리\n게시 승인 비동기 처리",
      note: "동기 타임아웃 UX 필요, 비동기 큐 재처리 전략 필요",
    },
  ];
}
