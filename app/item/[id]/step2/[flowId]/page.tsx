"use client";

/**
 * [STEP2 상세(통합) 화면]
 * 경로: /item/[id]/step2/[flowId]
 *
 * 목표 UX:
 * - 상단(제목/저장/다음 단계/여기서 멈추기) + 우측 메모 패널은 Step1과 동일한 느낌
 * - Step1 내용은 "읽기 전용 + 접힘" 형태로 위에 보임
 * - Step2 작성 폼이 아래에 이어서 등장(= Step1에서 다음 누른 느낌)
 * - Step2 목록 화면(/item/[id]/step2)은 "보조"로 남겨도 됨
 */

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import Step1Body from "@/app/components/Step1Body";


/** -----------------------
 * Step1 저장 키(기존과 동일)
 * ---------------------- */
const LS_ITEMS_KEY = "ai-planner-items-v1";
const LS_DETAIL_PREFIX = "ai-planner-detail-v1:";

/** -----------------------
 * Step2 저장 키(새로)
 * - flowId별로 Step2 내용을 저장
 * ---------------------- */
const LS_STEP2_DETAIL_PREFIX = "ai-planner-step2-detail-v1:"; // + `${itemId}:${flowId}`

type MemoItem = {
  id: string;
  ts: number;
  kind: "manual" | "auto";
  title: string;
  before?: string;
  after?: string;
  text?: string;
};

type ItemDetailLike = {
  id: string;
  title: string;
  stage: string;
  updatedAt: number;
  status?: "진행중" | "완료";
  memos?: MemoItem[];
  identity?: { oneLine?: string };
  userContext?: {
    userType?: string;
    usageContext?: string;
    expectedOutcome?: string;
  };
};

type TriggerType = "button" | "save" | "condition" | "event" | "batch" | "";
type TaskType = "review" | "extract" | "validate" | "mixed" | "";
type ResultMode = "immediate" | "after_save" | "save_only" | "";
type MixedTask = "review" | "extract" | "validate";

type Step2Step = {
  id: string;
  userAction: string;
  systemAction: string;
  aiTrigger: "user_action" | "save_submit" | "event" | "batch" | "none";
  resultHandling:
    | "immediate_response"
    | "read_after_save"
    | "status_only"
    | "separate_notification"
    | "followup_required"
    | "";
};

type MidFollowupAnswers = {
  cache: "yes" | "no" | "tbd" | "";
  retry: "none" | "1" | "2" | "tbd" | "";
  invalidation: "invalidate" | "keep" | "tbd" | "";
  resultApply: "immediate" | "after_save" | "save_only" | "tbd" | "";
};

type MidReviewState = {
  version: number;
  createdAt: number;
  inputsSnapshotHash: string;
  findings: string[];
  followupAnswers: MidFollowupAnswers;
};

type Step2Detail = {
  itemId: string;
  flowId: string;
  updatedAt: number;
  status: "진행중" | "완료";
  persona: {
    user: string;
    situation: string;
    goal: string;
  };
  steps: Step2Step[];
  aiRules: {
    trigger: TriggerType;
    taskType: TaskType;
    mixedTaskTypes: MixedTask[];
    resultMode: ResultMode;
    includeStep1Summary: boolean;
  };
  midReview?: MidReviewState | null;
};

const AI_TRIGGER_OPTIONS = [
  { value: "user_action", label: "사용자 액션 시" },
  { value: "save_submit", label: "저장/제출 시" },
  { value: "event", label: "이벤트 발생 시" },
  { value: "batch", label: "배치/주기 실행" },
  { value: "none", label: "호출 안 함" },
];

const RESULT_HANDLING_OPTIONS = [
  { value: "immediate_response", label: "동기 처리" },
  { value: "read_after_save", label: "비동기 처리" },
  { value: "status_only", label: "상태값만 갱신" },
  { value: "separate_notification", label: "별도 채널 알림" },
  { value: "followup_required", label: "사용자 후속 액션 필요" },
];

function getResultHandlingLabel(value: Step2Step["resultHandling"]) {
  return (
    RESULT_HANDLING_OPTIONS.find((x) => x.value === value)?.label ??
    "미정"
  );
}

function getResultHandlingGuide(value: Step2Step["resultHandling"]) {
  const map: Record<
    Exclude<Step2Step["resultHandling"], "">,
    { mode: string; pros: string; cons: string }
  > = {
    immediate_response: {
      mode: "요청 처리 결과를 같은 흐름에서 바로 반환해요.",
      pros: "완료 여부를 즉시 확인할 수 있어요.",
      cons: "처리 시간이 길면 대기 부담이 커질 수 있어요.",
    },
    read_after_save: {
      mode: "요청은 먼저 저장하고 결과는 나중에 조회해요.",
      pros: "긴 작업을 안정적으로 분리 처리할 수 있어요.",
      cons: "결과 확인까지 한 단계가 더 필요해요.",
    },
    status_only: {
      mode: "상세 결과 대신 상태 값만 업데이트해요.",
      pros: "구조가 단순해 운영 포인트가 명확해요.",
      cons: "상세 결과 근거가 필요하면 정보가 부족할 수 있어요.",
    },
    separate_notification: {
      mode: "결과를 알림/메신저 등 별도 채널로 전달해요.",
      pros: "메인 화면과 결과 전달 채널을 분리할 수 있어요.",
      cons: "채널 확인이 늦으면 후속 대응도 늦어질 수 있어요.",
    },
    followup_required: {
      mode: "결과 확인 후 사용자가 다음 액션을 수행해야 완료돼요.",
      pros: "업무 흐름상 필수 절차를 강제할 수 있어요.",
      cons: "추가 입력/승인 단계로 이탈 가능성이 높아질 수 있어요.",
    },
  };
  return value ? map[value] : null;
}

function makeStepId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    // @ts-ignore
    return crypto.randomUUID();
  }
  return `step-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function makeEmptyStep(): Step2Step {
  return {
    id: makeStepId(),
    userAction: "",
    systemAction: "",
    aiTrigger: "none",
    resultHandling: "",
  };
}

function normalizeTrigger(value: unknown): TriggerType {
  const v = String(value ?? "").trim();
  const legacy: Record<string, TriggerType> = {
    "저장 시": "save",
    "리뷰 클릭 시": "button",
    "둘 다": "button",
    "사용자 액션 시": "button",
    "저장/제출 시": "save",
    "조건 충족 시": "condition",
    "이벤트 발생 시": "event",
    "배치/주기 실행": "batch",
  };
  if (v in legacy) return legacy[v];
  if (["button", "save", "condition", "event", "batch"].includes(v)) return v as TriggerType;
  return "";
}

function normalizeTaskType(value: unknown): TaskType {
  const v = String(value ?? "").trim();
  if (["review", "extract", "validate", "mixed"].includes(v)) return v as TaskType;
  const legacy: Record<string, TaskType> = {
    "리뷰": "review",
    "추출": "extract",
    "검증": "validate",
    "혼합": "mixed",
  };
  return legacy[v] ?? "";
}

function normalizeResultMode(value: unknown): ResultMode {
  const v = String(value ?? "").trim();
  if (["immediate", "after_save", "save_only"].includes(v)) return v as ResultMode;
  const legacy: Record<string, ResultMode> = {
    "화면에 바로 표시": "immediate",
    "저장 후 표시": "after_save",
    "표시 없이 저장만": "save_only",
  };
  return legacy[v] ?? "";
}

function hashText(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36);
}

type ReviewResultHandling =
  | "SYNC"
  | "ASYNC"
  | "STATUS_ONLY"
  | "NOTIFY"
  | "FOLLOWUP_REQUIRED";

type FlowReviewPayload = {
  step1Summary: string;
  userContext: {
    userType: string;
    usageContext: string;
    expectedOutcome: string;
  };
  flowSteps: Array<{
    stepNo: number;
    userAction: string;
    systemProcess: string;
    resultHandling?: ReviewResultHandling;
  }>;
};

type FlowReviewGate = "GO" | "CAUTION" | "NEEDS_FIX";
type FlowReviewSeverity = "warn" | "needs_fix";
type FlowReviewArea = "구현" | "UX" | "운영" | "정책" | "비용";
type FlowReviewField = "userAction" | "systemProcess" | "resultHandling";

type FlowReviewMessageKey =
  | "BANNER_GO"
  | "BANNER_CAUTION"
  | "BANNER_NEEDS_FIX"
  | "FACT_USER_CONTEXT_THIN"
  | "FACT_STEP_USER_ACTION_EMPTY"
  | "FACT_STEP_SYSTEM_PROCESS_EMPTY"
  | "FACT_STEP_RESULT_HANDLING_EMPTY"
  | "FACT_STEP_COMPLETION_CRITERIA_WEAK"
  | "FACT_REVIEW_STEP_SAVE_MISSING"
  | "FACT_STATUS_TRANSITION_MISSING"
  | "FACT_FAILURE_RULE_MISSING"
  | "FACT_COST_GUARD_MISSING"
  | "FACT_STATUS_ONLY_WITHOUT_VIEW"
  | "DIVERGENCE_USER_CONTEXT"
  | "DIVERGENCE_STEP_USER_ACTION"
  | "DIVERGENCE_STEP_SYSTEM_PROCESS"
  | "DIVERGENCE_STEP_RESULT_HANDLING"
  | "DIVERGENCE_COMPLETION_CRITERIA"
  | "DIVERGENCE_REVIEW_SAVE"
  | "DIVERGENCE_STATUS_TRANSITION"
  | "DIVERGENCE_FAILURE_RULE"
  | "DIVERGENCE_COST_GUARD"
  | "DIVERGENCE_STATUS_ONLY_WITHOUT_VIEW"
  | "FIX_USER_CONTEXT"
  | "FIX_STEP_USER_ACTION"
  | "FIX_STEP_SYSTEM_PROCESS"
  | "FIX_STEP_RESULT_HANDLING"
  | "FIX_STEP_COMPLETION_CRITERIA"
  | "FIX_REVIEW_STEP_SAVE"
  | "FIX_STATUS_TRANSITION"
  | "FIX_FAILURE_RULE"
  | "FIX_COST_GUARD"
  | "FIX_STATUS_ONLY_WITHOUT_VIEW"
  | "ACTION_USER_CONTEXT"
  | "ACTION_STEP_USER_ACTION"
  | "ACTION_STEP_SYSTEM_PROCESS"
  | "ACTION_STEP_RESULT_HANDLING"
  | "ACTION_COMPLETION_CRITERIA"
  | "ACTION_REVIEW_STEP_SAVE"
  | "ACTION_STATUS_TRANSITION"
  | "ACTION_FAILURE_RULE"
  | "ACTION_COST_GUARD"
  | "ACTION_STATUS_ONLY_WITHOUT_VIEW"
  | "DIFF_REASON_USER_ACTION"
  | "DIFF_REASON_SYSTEM_PROCESS"
  | "DIFF_REASON_RESULT_HANDLING";

type FlowReviewMessage = {
  key: FlowReviewMessageKey;
  params?: Record<string, string | number | undefined>;
};

type FlowReviewIssue = {
  id: string;
  area: FlowReviewArea;
  severity: FlowReviewSeverity;
  stepNo?: number;
  field?: FlowReviewField;
  missingFact: FlowReviewMessage;
  designDivergence: FlowReviewMessage;
  fixSuggestion: FlowReviewMessage;
  nextAction: FlowReviewMessage;
};

type FlowReviewToBeDiff = {
  stepNo: number;
  field: FlowReviewField;
  asIs: string;
  toBe: string;
  issueIds: string[];
  tags: FlowReviewArea[];
  because: FlowReviewMessage;
};

type FlowReviewAction = {
  id: string;
  message: FlowReviewMessage;
  issueIds: string[];
};

type FlowReviewStep = {
  stepNo: number;
  userAction: string;
  systemProcess: string;
  resultHandling?: ReviewResultHandling;
};

type FlowReviewReason = {
  id: string;
  message: FlowReviewMessage;
  issueIds: string[];
};

type FlowReviewResult = {
  gate: FlowReviewGate;
  reasons: FlowReviewReason[];
  toBeDiff: FlowReviewToBeDiff[];
  nextActions: FlowReviewAction[];
  asIsFlow: FlowReviewStep[];
  toBeFlow: FlowReviewStep[];
};

type RecommendedFlowStep = {
  userAction: string;
  systemProcess: string;
  resultHandling: ReviewResultHandling;
  aiSuggested: boolean;
  userActionSuggested?: boolean;
  systemProcessSuggested?: boolean;
  handlingSuggested?: boolean;
  originalUserAction?: string;
  originalSystemProcess?: string;
  originalHandling?: ReviewResultHandling;
};

function mapResultHandlingToReviewEnum(
  value: Step2Step["resultHandling"]
): ReviewResultHandling | undefined {
  const map: Record<Exclude<Step2Step["resultHandling"], "">, ReviewResultHandling> = {
    immediate_response: "SYNC",
    read_after_save: "ASYNC",
    status_only: "STATUS_ONLY",
    separate_notification: "NOTIFY",
    followup_required: "FOLLOWUP_REQUIRED",
  };
  return value ? map[value] : undefined;
}

function getReviewEnumLabel(value?: ReviewResultHandling): string {
  const map: Record<ReviewResultHandling, string> = {
    SYNC: "동기 처리",
    ASYNC: "비동기 처리",
    STATUS_ONLY: "상태값만 갱신",
    NOTIFY: "별도 채널 알림",
    FOLLOWUP_REQUIRED: "사용자 후속 액션 필요",
  };
  return value ? map[value] : "미정";
}

const FLOW_REVIEW_TEMPLATE_MAP: Record<
  FlowReviewMessageKey,
  (params: Record<string, string | number | undefined>) => string
> = {
  BANNER_GO: () => "지금 상태로 기능·화면 설계에 들어가도 됩니다.",
  BANNER_CAUTION: () => "기능·화면 설계는 가능하지만, 아래 항목을 먼저 정리하면 설계가 덜 갈립니다.",
  BANNER_NEEDS_FIX: () => "기능·화면 설계 전에 아래 항목을 먼저 정해야 책임과 완료 기준이 갈리지 않습니다.",
  FACT_USER_CONTEXT_THIN: () => "[A] 사용자 기준 입력이 부족해요.",
  FACT_STEP_USER_ACTION_EMPTY: ({ stepNo }) => `${stepNo}단계 사용자 행동이 비어 있어요.`,
  FACT_STEP_SYSTEM_PROCESS_EMPTY: ({ stepNo }) => `${stepNo}단계 시스템 처리가 비어 있어요.`,
  FACT_STEP_RESULT_HANDLING_EMPTY: ({ stepNo }) => `${stepNo}단계 결과 처리 방식이 미정이에요.`,
  FACT_STEP_COMPLETION_CRITERIA_WEAK: ({ stepNo }) => `${stepNo}단계 보완/수정의 완료 기준이 없어요.`,
  FACT_REVIEW_STEP_SAVE_MISSING: ({ stepNo }) => `${stepNo}단계 리뷰 실행 뒤 결과 저장 기준이 없어요.`,
  FACT_STATUS_TRANSITION_MISSING: () => "전체 플로우에 상태 전이(status) 기준이 없어요.",
  FACT_FAILURE_RULE_MISSING: () => "실패/재시도 기준이 없어요.",
  FACT_COST_GUARD_MISSING: () => "반복 실행 대비 비용 제어 기준이 없어요.",
  FACT_STATUS_ONLY_WITHOUT_VIEW: ({ stepNo }) => `${stepNo}단계에서 상태만 갱신하고 확인 단계가 없어요.`,
  DIVERGENCE_USER_CONTEXT: () => "기능/화면 설계에서 대상 사용자와 완료 상태 기준이 팀마다 달라질 수 있어요.",
  DIVERGENCE_STEP_USER_ACTION: () => "화면 이벤트와 입력 포인트를 설계할 때 시작 조건이 사람마다 달라질 수 있어요.",
  DIVERGENCE_STEP_SYSTEM_PROCESS: () => "API/저장/상태변경 책임이 개발 단계에서 임의로 정해질 수 있어요.",
  DIVERGENCE_STEP_RESULT_HANDLING: () => "사용자 완료 인지 방식이 화면 설계에서 갈릴 수 있어요.",
  DIVERGENCE_COMPLETION_CRITERIA: () => "수정 완료 판단 기준이 달라져 재작업이 생길 수 있어요.",
  DIVERGENCE_REVIEW_SAVE: () => "리뷰 결과 재사용 기준이 없어 호출/저장 구조가 팀마다 달라질 수 있어요.",
  DIVERGENCE_STATUS_TRANSITION: () => "초안/완료 기준이 없어 상태 관리 화면 설계가 흔들릴 수 있어요.",
  DIVERGENCE_FAILURE_RULE: () => "장애 대응 흐름이 달라져 운영 처리 시간이 늘 수 있어요.",
  DIVERGENCE_COST_GUARD: () => "중복 호출이 발생하면 응답 지연과 비용이 같이 늘 수 있어요.",
  DIVERGENCE_STATUS_ONLY_WITHOUT_VIEW: () => "사용자가 완료 여부를 확인하지 못해 후속 작업이 지연될 수 있어요.",
  FIX_USER_CONTEXT: () => "[A]에서 사용자 유형/사용 맥락/기대 결과 중 2개 이상 확정해요.",
  FIX_STEP_USER_ACTION: ({ stepNo }) => `${stepNo}단계 사용자 행동을 클릭/입력 기준으로 1줄 확정해요.`,
  FIX_STEP_SYSTEM_PROCESS: ({ stepNo }) => `${stepNo}단계에 저장/호출/상태변경 중 무엇을 하는지 1줄 확정해요.`,
  FIX_STEP_RESULT_HANDLING: ({ stepNo }) => `${stepNo}단계 결과 처리 방식을 1개로 고정해요.`,
  FIX_STEP_COMPLETION_CRITERIA: ({ stepNo }) => `${stepNo}단계 완료 조건을 저장/상태/재검토 기준으로 1줄 명시해요.`,
  FIX_REVIEW_STEP_SAVE: ({ stepNo }) => `${stepNo}단계 리뷰 결과 저장 위치와 시점을 정의해요.`,
  FIX_STATUS_TRANSITION: () => "최종 저장 전/후 상태값(draft/ready 등)을 한 줄로 정의해요.",
  FIX_FAILURE_RULE: () => "실패 시 재시도 횟수와 사용자 안내 문구를 한 줄로 정해요.",
  FIX_COST_GUARD: () => "중복 실행 방지 규칙(캐시/재사용/트리거)을 한 줄로 정해요.",
  FIX_STATUS_ONLY_WITHOUT_VIEW: ({ stepNo }) => `${stepNo}단계 이후 상태 확인 화면/영역을 1개 지정해요.`,
  ACTION_USER_CONTEXT: () => "사용자 기준 2개 이상 채우면 설계 해석 차이를 줄일 수 있습니다.",
  ACTION_STEP_USER_ACTION: ({ stepNo }) => `${stepNo}단계 사용자 행동을 확정하면 화면 이벤트 해석 차이를 줄일 수 있습니다.`,
  ACTION_STEP_SYSTEM_PROCESS: ({ stepNo }) => `${stepNo}단계 시스템 처리를 1줄로 확정하면 API/저장 설계 차이를 줄일 수 있습니다.`,
  ACTION_STEP_RESULT_HANDLING: ({ stepNo }) => `${stepNo}단계 완료 신호를 1개 고정하면 화면 완료 기준 차이를 줄일 수 있습니다.`,
  ACTION_COMPLETION_CRITERIA: ({ stepNo }) => `${stepNo}단계 완료 기준을 정의하면 재작업 가능성을 줄일 수 있습니다.`,
  ACTION_REVIEW_STEP_SAVE: ({ stepNo }) => `${stepNo}단계 리뷰 결과 저장 규칙을 정하면 호출/저장 해석 차이를 줄일 수 있습니다.`,
  ACTION_STATUS_TRANSITION: () => "상태 전이 기준을 정의하면 상태 모델 해석 차이를 줄일 수 있습니다.",
  ACTION_FAILURE_RULE: () => "실패/재시도 기준을 정의하면 운영 대응 차이를 줄일 수 있습니다.",
  ACTION_COST_GUARD: () => "중복 실행 방지 기준을 정의하면 비용/지연 리스크를 줄일 수 있습니다.",
  ACTION_STATUS_ONLY_WITHOUT_VIEW: ({ stepNo }) => `${stepNo}단계 상태 확인 위치를 정하면 완료 인지 해석 차이를 줄일 수 있습니다.`,
  DIFF_REASON_USER_ACTION: ({ issueIds }) =>
    `(${issueIds || "I?"}) 단계 시작 조건을 고정해 화면 이벤트 설계가 갈리지 않게 합니다.`,
  DIFF_REASON_SYSTEM_PROCESS: ({ issueIds }) =>
    `(${issueIds || "I?"}) 저장/API/상태변경 책임을 고정해 구현 해석 차이를 줄입니다.`,
  DIFF_REASON_RESULT_HANDLING: ({ issueIds }) =>
    `(${issueIds || "I?"}) 완료 인지 방식을 고정해 화면/운영 완료 기준을 맞춥니다.`,
};

function makeReviewMessage(
  key: FlowReviewMessageKey,
  params?: Record<string, string | number | undefined>
): FlowReviewMessage {
  return { key, params };
}

function renderFlowReviewMessage(message: FlowReviewMessage): string {
  const template = FLOW_REVIEW_TEMPLATE_MAP[message.key];
  if (!template) return message.key;
  return template(message.params ?? {});
}

function suggestResultHandlingFromStep(step: {
  userAction: string;
  systemProcess: string;
}): ReviewResultHandling {
  const text = `${step.userAction} ${step.systemProcess}`;
  if (/(알림|통지|채널|슬랙|메일)/.test(text)) return "NOTIFY";
  if (/(후속|승인|재시도|확인 필요|보완)/.test(text)) return "FOLLOWUP_REQUIRED";
  if (/(상태|플래그|마킹|status)/i.test(text)) return "STATUS_ONLY";
  if (/(리뷰|검토|점검|분석|생성)/.test(text)) return "ASYNC";
  return "SYNC";
}

function recommendResultHandling(
  step: { userAction: string; systemProcess: string },
  current?: ReviewResultHandling
): { recommended: ReviewResultHandling; shouldSuggest: boolean } {
  const text = `${step.userAction} ${step.systemProcess}`;
  const base = suggestResultHandlingFromStep(step);
  if (!current) return { recommended: base, shouldSuggest: true };

  // 부적합한 수동 선택을 보정
  if (current === "NOTIFY" && !/(알림|통지|채널|슬랙|메일)/.test(text)) {
    return { recommended: base, shouldSuggest: true };
  }
  if (current === "FOLLOWUP_REQUIRED" && !/(후속|승인|재시도|확인 필요|보완)/.test(text)) {
    return { recommended: base, shouldSuggest: true };
  }
  if (current === "STATUS_ONLY" && /(리뷰|검토|점검|결과|피드백|분석|생성)/.test(text)) {
    return { recommended: "ASYNC", shouldSuggest: true };
  }
  if (current === "SYNC" && /(리뷰|검토|점검|분석|생성|payload|캐시|배치|비동기)/i.test(text)) {
    return { recommended: "ASYNC", shouldSuggest: true };
  }
  if (current === "ASYNC" && /(저장 버튼|클릭 즉시|즉시 반영|바로 반영)/.test(text)) {
    return { recommended: "SYNC", shouldSuggest: true };
  }

  return { recommended: current, shouldSuggest: false };
}

function buildRecommendedFlowSteps(payload: FlowReviewPayload): RecommendedFlowStep[] {
  const mapped: RecommendedFlowStep[] = payload.flowSteps.map((s) => {
    const userAction = s.userAction || "사용자 행동 정의 필요";
    const systemProcess = s.systemProcess || "시스템 처리 정의 필요";
    const recommendation = recommendResultHandling(
      { userAction, systemProcess },
      s.resultHandling
    );
    return {
      userAction,
      systemProcess,
      resultHandling: recommendation.recommended,
      aiSuggested:
        recommendation.shouldSuggest ||
        !s.systemProcess ||
        !s.userAction ||
        !s.resultHandling,
      userActionSuggested: !s.userAction,
      systemProcessSuggested: !s.systemProcess,
      handlingSuggested: recommendation.shouldSuggest || !s.resultHandling,
      originalUserAction: s.userAction || "",
      originalSystemProcess: s.systemProcess || "",
      originalHandling: s.resultHandling,
    };
  });

  // Step1/Step2 입력이 분리돼 있으면 한 번에 입력/검증하는 흐름으로 병합 제안
  const step1InputIdx = mapped.findIndex(
    (s) => /step1/i.test(s.userAction) && /입력/.test(s.userAction)
  );
  const step2InputIdx = mapped.findIndex(
    (s) => /step2/i.test(s.userAction) && /입력/.test(s.userAction)
  );
  if (step1InputIdx >= 0 && step2InputIdx >= 0 && step1InputIdx !== step2InputIdx) {
    const first = Math.min(step1InputIdx, step2InputIdx);
    const second = Math.max(step1InputIdx, step2InputIdx);
    const firstStep = mapped[first];
    const secondStep = mapped[second];
    mapped[first] = {
      userAction: "Step1/Step2 항목을 입력한다",
      systemProcess: "입력 검증 + 초안 저장 + updatedAt 갱신",
      resultHandling: "STATUS_ONLY",
      aiSuggested: true,
      userActionSuggested: true,
      systemProcessSuggested: true,
      handlingSuggested: true,
      originalUserAction: [firstStep.originalUserAction || firstStep.userAction, secondStep.originalUserAction || secondStep.userAction]
        .filter(Boolean)
        .join(" / "),
      originalSystemProcess: [firstStep.originalSystemProcess || firstStep.systemProcess, secondStep.originalSystemProcess || secondStep.systemProcess]
        .filter(Boolean)
        .join(" / "),
      originalHandling: firstStep.originalHandling ?? secondStep.originalHandling,
    };
    mapped.splice(second, 1);
  }

  // 리뷰 실행 단계가 있으면 바로 다음에 보완 반영 단계를 자동 제안
  const reviewIdx = mapped.findIndex((s) => /(리뷰|검토|점검)/.test(s.userAction));
  if (reviewIdx >= 0) {
    const hasFollowup = mapped.some((s) => /(보완|수정 반영|재검토)/.test(s.userAction));
    if (!hasFollowup) {
      mapped.splice(reviewIdx + 1, 0, {
        userAction: "리뷰 결과를 반영하고 보완한다",
        systemProcess: "보완 항목 적용 + 변경 이력 기록 + 필요 시 재검토",
        resultHandling: "FOLLOWUP_REQUIRED",
        aiSuggested: true,
        userActionSuggested: true,
        systemProcessSuggested: true,
        handlingSuggested: true,
      });
    }
  }

  // 최종 저장 단계가 있거나 마지막 단계인 경우, 운영 가능한 저장/상태 전이 문구로 보강
  const finalIdx = mapped.findIndex((s) => /(최종 저장|완료|확정)/.test(s.userAction));
  const targetFinalIdx = finalIdx >= 0 ? finalIdx : mapped.length - 1;
  if (targetFinalIdx >= 0) {
    const final = mapped[targetFinalIdx];
    if (/정의 필요|미입력/.test(final.systemProcess) || final.systemProcess.length < 8) {
      mapped[targetFinalIdx] = {
        ...final,
        systemProcess: "최종 저장 + 상태 전이(status=ready) + 결과/로그 영속화",
        resultHandling: final.resultHandling || "SYNC",
        aiSuggested: true,
        systemProcessSuggested: true,
        handlingSuggested: true,
      };
    }
  }

  // 최적화: 고정 단계 수로 자르지 않고, 중복/저가치 단계만 정리
  // - 필요하면 단계가 늘어날 수 있고(예: 보완 단계 삽입)
  // - 중복 단계가 있으면 줄어들 수 있음
  const deduped: RecommendedFlowStep[] = [];
  for (const step of mapped) {
    const prev = deduped[deduped.length - 1];
    if (!prev) {
      deduped.push(step);
      continue;
    }
    const sameAction = prev.userAction.trim() === step.userAction.trim();
    const sameSystem = prev.systemProcess.trim() === step.systemProcess.trim();
    const sameHandling = prev.resultHandling === step.resultHandling;
    if (sameAction && sameSystem && sameHandling) {
      deduped[deduped.length - 1] = {
        ...prev,
        aiSuggested: true,
        userActionSuggested: true,
        systemProcessSuggested: true,
        handlingSuggested: true,
      };
      continue;
    }
    deduped.push(step);
  }

  // "저장 버튼 클릭"이 독립 단계인데 실질 처리 없이 중복일 경우만 축약
  const optimized = deduped.filter((step, idx, arr) => {
    if (!/(저장 버튼을 누른다)/.test(step.userAction)) return true;
    const next = arr[idx + 1];
    if (!next) return true;
    const lowValue = /임시 저장|저장/.test(step.systemProcess) && /최종 저장|상태 전이|영속화/.test(next.systemProcess);
    return !lowValue;
  });

  return optimized;
}

function buildStep1Summary(detail: any): string {
  const oneLine = String(detail?.identity?.oneLine ?? "").trim();
  const asIs = String(detail?.identity?.asIs ?? "").trim();
  const toBe = String(detail?.identity?.toBe ?? "").trim();
  const whatWhy = String(detail?.identity?.whatWhy ?? "").trim();

  if (oneLine) return oneLine;

  return [asIs ? `AS-IS: ${asIs}` : "", toBe ? `TO-BE: ${toBe}` : "", whatWhy ? `WHY: ${whatWhy}` : ""]
    .filter(Boolean)
    .join("\n");
}

function buildFlowReviewPayload(step1: any, step2: Step2Detail): FlowReviewPayload {
  return {
    step1Summary: buildStep1Summary(step1),
    userContext: {
      userType: String(step1?.userContext?.userType ?? "").trim(),
      usageContext: String(step1?.userContext?.usageContext ?? "").trim(),
      expectedOutcome: String(step1?.userContext?.expectedOutcome ?? "").trim(),
    },
    flowSteps: step2.steps.map((s, idx) => ({
      stepNo: idx + 1,
      userAction: String(s.userAction ?? "").trim(),
      systemProcess: String(s.systemAction ?? "").trim(),
      resultHandling: mapResultHandlingToReviewEnum(s.resultHandling),
    })),
  };
}

function mockFlowReview(payload: FlowReviewPayload): FlowReviewResult {
  const issues: FlowReviewIssue[] = [];
  let issueSeq = 1;

  function addIssue(input: Omit<FlowReviewIssue, "id">) {
    issues.push({ id: `I${issueSeq++}`, ...input });
  }

  const contextFilledCount = [
    payload.userContext.userType,
    payload.userContext.usageContext,
    payload.userContext.expectedOutcome,
  ].filter((v) => v.trim().length > 0).length;

  if (contextFilledCount < 2) {
    addIssue({
      area: "정책",
      severity: "needs_fix",
      missingFact: makeReviewMessage("FACT_USER_CONTEXT_THIN"),
      designDivergence: makeReviewMessage("DIVERGENCE_USER_CONTEXT"),
      fixSuggestion: makeReviewMessage("FIX_USER_CONTEXT"),
      nextAction: makeReviewMessage("ACTION_USER_CONTEXT"),
    });
  }

  payload.flowSteps.forEach((step) => {
    const text = `${step.userAction} ${step.systemProcess}`;
    const stepNo = step.stepNo;

    if (!step.userAction) {
      addIssue({
        area: "구현",
        severity: "needs_fix",
        stepNo,
        field: "userAction",
        missingFact: makeReviewMessage("FACT_STEP_USER_ACTION_EMPTY", { stepNo }),
        designDivergence: makeReviewMessage("DIVERGENCE_STEP_USER_ACTION", { stepNo }),
        fixSuggestion: makeReviewMessage("FIX_STEP_USER_ACTION", { stepNo }),
        nextAction: makeReviewMessage("ACTION_STEP_USER_ACTION", { stepNo }),
      });
    }
    if (!step.systemProcess) {
      addIssue({
        area: "구현",
        severity: "needs_fix",
        stepNo,
        field: "systemProcess",
        missingFact: makeReviewMessage("FACT_STEP_SYSTEM_PROCESS_EMPTY", { stepNo }),
        designDivergence: makeReviewMessage("DIVERGENCE_STEP_SYSTEM_PROCESS", { stepNo }),
        fixSuggestion: makeReviewMessage("FIX_STEP_SYSTEM_PROCESS", { stepNo }),
        nextAction: makeReviewMessage("ACTION_STEP_SYSTEM_PROCESS", { stepNo }),
      });
    }
    if (!step.resultHandling) {
      addIssue({
        area: "UX",
        severity: "needs_fix",
        stepNo,
        field: "resultHandling",
        missingFact: makeReviewMessage("FACT_STEP_RESULT_HANDLING_EMPTY", { stepNo }),
        designDivergence: makeReviewMessage("DIVERGENCE_STEP_RESULT_HANDLING", { stepNo }),
        fixSuggestion: makeReviewMessage("FIX_STEP_RESULT_HANDLING", { stepNo }),
        nextAction: makeReviewMessage("ACTION_STEP_RESULT_HANDLING", { stepNo }),
      });
    }
    if (/(수정|보완|반영)/.test(text) && !/(완료|저장|상태|확정|재검토|적용)/.test(text)) {
      addIssue({
        area: "운영",
        severity: "warn",
        stepNo,
        missingFact: makeReviewMessage("FACT_STEP_COMPLETION_CRITERIA_WEAK", { stepNo }),
        designDivergence: makeReviewMessage("DIVERGENCE_COMPLETION_CRITERIA", { stepNo }),
        fixSuggestion: makeReviewMessage("FIX_STEP_COMPLETION_CRITERIA", { stepNo }),
        nextAction: makeReviewMessage("ACTION_COMPLETION_CRITERIA", { stepNo }),
      });
    }
    if (/(리뷰|검토|점검)/.test(text) && !/(결과 저장|reviewresult|저장|캐시|history|로그)/i.test(step.systemProcess)) {
      addIssue({
        area: "구현",
        severity: "needs_fix",
        stepNo,
        field: "systemProcess",
        missingFact: makeReviewMessage("FACT_REVIEW_STEP_SAVE_MISSING", { stepNo }),
        designDivergence: makeReviewMessage("DIVERGENCE_REVIEW_SAVE", { stepNo }),
        fixSuggestion: makeReviewMessage("FIX_REVIEW_STEP_SAVE", { stepNo }),
        nextAction: makeReviewMessage("ACTION_REVIEW_STEP_SAVE", { stepNo }),
      });
    }
  });

  const allText = payload.flowSteps.map((s) => `${s.userAction} ${s.systemProcess}`).join(" ");
  const hasStatusTransition = /(status|상태)/i.test(allText);
  if (!hasStatusTransition) {
    addIssue({
      area: "정책",
      severity: "warn",
      missingFact: makeReviewMessage("FACT_STATUS_TRANSITION_MISSING"),
      designDivergence: makeReviewMessage("DIVERGENCE_STATUS_TRANSITION"),
      fixSuggestion: makeReviewMessage("FIX_STATUS_TRANSITION"),
      nextAction: makeReviewMessage("ACTION_STATUS_TRANSITION"),
    });
  }

  const hasFailureRule = /(실패|재시도|타임아웃|예외|fallback)/i.test(allText);
  if (!hasFailureRule) {
    addIssue({
      area: "운영",
      severity: "warn",
      missingFact: makeReviewMessage("FACT_FAILURE_RULE_MISSING"),
      designDivergence: makeReviewMessage("DIVERGENCE_FAILURE_RULE"),
      fixSuggestion: makeReviewMessage("FIX_FAILURE_RULE"),
      nextAction: makeReviewMessage("ACTION_FAILURE_RULE"),
    });
  }

  const asyncLikeCount = payload.flowSteps.filter((s) =>
    s.resultHandling === "ASYNC" || s.resultHandling === "NOTIFY" || s.resultHandling === "FOLLOWUP_REQUIRED"
  ).length;
  const hasCostGuard = /(캐시|중복 방지|재사용|debounce|throttle)/i.test(allText);
  if (asyncLikeCount >= 2 && !hasCostGuard) {
    addIssue({
      area: "비용",
      severity: "warn",
      missingFact: makeReviewMessage("FACT_COST_GUARD_MISSING"),
      designDivergence: makeReviewMessage("DIVERGENCE_COST_GUARD"),
      fixSuggestion: makeReviewMessage("FIX_COST_GUARD"),
      nextAction: makeReviewMessage("ACTION_COST_GUARD"),
    });
  }

  payload.flowSteps.forEach((step) => {
    if (step.resultHandling !== "STATUS_ONLY") return;
    const hasLaterView = payload.flowSteps
      .filter((s) => s.stepNo > step.stepNo)
      .some((s) => /(조회|표시|확인|결과|배지|상세)/.test(`${s.userAction} ${s.systemProcess}`));
    if (!hasLaterView) {
      addIssue({
        area: "UX",
        severity: "warn",
        stepNo: step.stepNo,
        field: "resultHandling",
        missingFact: makeReviewMessage("FACT_STATUS_ONLY_WITHOUT_VIEW", { stepNo: step.stepNo }),
        designDivergence: makeReviewMessage("DIVERGENCE_STATUS_ONLY_WITHOUT_VIEW", { stepNo: step.stepNo }),
        fixSuggestion: makeReviewMessage("FIX_STATUS_ONLY_WITHOUT_VIEW", { stepNo: step.stepNo }),
        nextAction: makeReviewMessage("ACTION_STATUS_ONLY_WITHOUT_VIEW", { stepNo: step.stepNo }),
      });
    }
  });

  const gate: FlowReviewGate = issues.some((i) => i.severity === "needs_fix")
    ? "NEEDS_FIX"
    : issues.length > 0
    ? "CAUTION"
    : "GO";

  const reasons: FlowReviewReason[] = issues
    .slice(0, 3)
    .map((issue) => ({
      id: `R${issue.id}`,
      message: issue.designDivergence,
      issueIds: [issue.id],
    }));

  const nextActions: FlowReviewAction[] = [];
  const actionSeen = new Set<string>();
  const sortedIssues = [...issues].sort((a, b) => {
    if (a.severity === b.severity) return 0;
    return a.severity === "needs_fix" ? -1 : 1;
  });
  sortedIssues.forEach((issue) => {
    const actionKey = `${issue.nextAction.key}:${issue.nextAction.params?.stepNo ?? "global"}`;
    if (actionSeen.has(actionKey)) return;
    actionSeen.add(actionKey);
    nextActions.push({
      id: `A${nextActions.length + 1}`,
      message: issue.nextAction,
      issueIds: [issue.id],
    });
  });

  const recommendedRaw = buildRecommendedFlowSteps(payload);
  const asIsFlow: FlowReviewStep[] = payload.flowSteps.map((s) => ({
    stepNo: s.stepNo,
    userAction: s.userAction || "사용자 행동 미정",
    systemProcess: s.systemProcess || "시스템 처리 미정",
    resultHandling: s.resultHandling,
  }));
  const toBeFlow: FlowReviewStep[] = recommendedRaw.map((s, idx) => ({
    stepNo: idx + 1,
    userAction: s.userAction,
    systemProcess: s.systemProcess,
    resultHandling: s.resultHandling,
  }));
  const asIsByStep = new Map<number, FlowReviewPayload["flowSteps"][number]>();
  payload.flowSteps.forEach((s) => asIsByStep.set(s.stepNo, s));
  const toBeByStep = new Map<number, RecommendedFlowStep>();
  recommendedRaw.forEach((s, idx) => toBeByStep.set(idx + 1, s));

  const issuesByStep = new Map<number, FlowReviewIssue[]>();
  issues.forEach((issue) => {
    if (!issue.stepNo) return;
    issuesByStep.set(issue.stepNo, [...(issuesByStep.get(issue.stepNo) ?? []), issue]);
  });

  const toBeDiff: FlowReviewToBeDiff[] = [];
  const maxSteps = Math.max(payload.flowSteps.length, recommendedRaw.length);
  const fields: FlowReviewField[] = ["userAction", "systemProcess", "resultHandling"];
  const normalize = (v: string) => v.trim().replace(/\s+/g, " ");

  for (let idx = 0; idx < maxSteps; idx += 1) {
    const stepNo = idx + 1;
    const asIs = asIsByStep.get(stepNo);
    const toBe = toBeByStep.get(stepNo);
    const stepIssues = issuesByStep.get(stepNo) ?? [];
    const issueIds = stepIssues.map((x) => x.id);
    const tags = Array.from(new Set(stepIssues.map((x) => x.area)));

    fields.forEach((field) => {
      const asIsRaw =
        field === "userAction"
          ? asIs?.userAction ?? "없음"
          : field === "systemProcess"
          ? asIs?.systemProcess ?? "없음"
          : getReviewEnumLabel(asIs?.resultHandling);
      const toBeRaw =
        field === "userAction"
          ? toBe?.userAction ?? "없음"
          : field === "systemProcess"
          ? toBe?.systemProcess ?? "없음"
          : getReviewEnumLabel(toBe?.resultHandling);
      if (normalize(asIsRaw) === normalize(toBeRaw)) return;

      const linked = issueIds.length > 0 ? issueIds : ["I?"];
      const becauseKey: FlowReviewMessageKey =
        field === "userAction"
          ? "DIFF_REASON_USER_ACTION"
          : field === "systemProcess"
          ? "DIFF_REASON_SYSTEM_PROCESS"
          : "DIFF_REASON_RESULT_HANDLING";

      toBeDiff.push({
        stepNo,
        field,
        asIs: asIsRaw,
        toBe: toBeRaw,
        issueIds: linked,
        tags,
        because: makeReviewMessage(becauseKey, { issueIds: linked.join(", ") }),
      });
    });
  }

  return {
    gate,
    reasons,
    toBeDiff,
    nextActions: nextActions.slice(0, 3),
    asIsFlow,
    toBeFlow,
  };
}

function Step2Row({
  left,
  right,
}: {
  left: React.ReactNode;
  right: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "260px 1fr",
        gap: 12,
        padding: "12px 0",
        borderTop: "1px solid #efefef",
      }}
    >
      <div style={{ fontWeight: 600, color: "#4b5563", fontSize: 15 }}>{left}</div>
      <div>{right}</div>
    </div>
  );
}

function Step2SubRow({
  left,
  right,
}: {
  left: React.ReactNode;
  right: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(120px, 180px) minmax(0, 1fr)",
        gap: 10,
        padding: "10px 0",
        borderTop: "1px solid #f2f2f2",
      }}
    >
      <div style={{ fontSize: 13, color: "#4b5563", display: "flex", gap: 6, alignItems: "center", fontWeight: 600 }}>
        {left}
      </div>
      <div style={{ minWidth: 0 }}>{right}</div>
    </div>
  );
}

function Step2Section({
  title,
  desc,
  headerRight,
  noTopGap,
  children,
}: {
  title: string;
  desc: string;
  headerRight?: React.ReactNode;
  noTopGap?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        border: "1px solid #e8e8e8",
        borderRadius: 12,
        padding: 18,
        marginTop: noTopGap ? 0 : 16,
        background: "#fff",
        boxShadow: "0 1px 0 rgba(16,24,40,0.03)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
        <div style={{ fontSize: 16, fontWeight: 800 }}>{title}</div>
        {headerRight ? <div>{headerRight}</div> : null}
      </div>
      <p
        style={{
          fontSize: 13,
          color: "#666",
          marginTop: 8,
          marginBottom: 0,
          lineHeight: 1.6,
          whiteSpace: "pre-line",
        }}
      >
        {desc}
      </p>
      <div style={{ marginTop: 12 }}>{children}</div>
    </div>
  );
}

function Step2Hint({ text }: { text: string }) {
  const [open, setOpen] = useState(false);

  return (
    <span
      style={{
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
      }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <span
        style={{
          width: 18,
          height: 18,
          borderRadius: 999,
          border: "1px solid #ddd",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 12,
          fontWeight: 800,
          color: "#666",
          cursor: "help",
        }}
      >
        ?
      </span>

      {open && (
        <span
          style={{
            position: "absolute",
            left: 24,
            top: "50%",
            transform: "translateY(-50%)",
            background: "#111",
            color: "#fff",
            padding: "10px 12px",
            borderRadius: 10,
            fontSize: 12,
            lineHeight: 1.5,
            whiteSpace: "pre-line",
            width: 280,
            zIndex: 9999,
          }}
        >
          {text}
        </span>
      )}
    </span>
  );
}

function loadItems(): any[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LS_ITEMS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}
function updateHomeItemOnStepSave(itemId: string, stepLabel: string, updatedAt: number) {
  const items = loadItems().map((it: any) => {
    if (String(it.id) !== String(itemId)) return it;

    return {
      ...it,
      stage: stepLabel,   // ✅ 홈 탭/필터가 이걸 보고 있음
      updatedAt,          // ✅ 홈에서 최신 정렬
      status: it.status ?? "진행중",
    };
  });

  localStorage.setItem(LS_ITEMS_KEY, JSON.stringify(items));
}

function loadStep1Detail(itemId: string): ItemDetailLike | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(LS_DETAIL_PREFIX + itemId);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveStep1Detail(itemId: string, next: ItemDetailLike) {
  localStorage.setItem(LS_DETAIL_PREFIX + itemId, JSON.stringify(next));
}

function makeDefaultStep2(itemId: string, flowId: string): Step2Detail {
  return {
    itemId,
    flowId,
    updatedAt: Date.now(),
    status: "진행중",
    persona: { user: "", situation: "", goal: "" },
    steps: [],
    aiRules: {
      trigger: "",
      taskType: "",
      mixedTaskTypes: [],
      resultMode: "",
      includeStep1Summary: true,
    },
    midReview: null,
  };
}

function loadStep2Detail(itemId: string, flowId: string): Step2Detail | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(LS_STEP2_DETAIL_PREFIX + `${itemId}:${flowId}`);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    const base = makeDefaultStep2(itemId, flowId);

    const legacySteps =
      Array.isArray(parsed?.happyPathSteps) && parsed.happyPathSteps.length > 0
        ? parsed.happyPathSteps.map((x: string) => ({
            id: makeStepId(),
            userAction: String(x ?? ""),
            systemAction: "",
            aiTrigger: "none" as const,
            resultHandling: "",
          }))
        : [];

    const parsedSteps = Array.isArray(parsed?.steps)
      ? parsed.steps
          .map((s: any) => ({
            id: String(s?.id ?? makeStepId()),
            userAction: String(s?.userAction ?? ""),
            systemAction: String(s?.systemAction ?? ""),
            aiTrigger: ["user_action", "save_submit", "event", "batch", "none"].includes(
              String(s?.aiTrigger)
            )
              ? (String(s?.aiTrigger) as Step2Step["aiTrigger"])
              : "none",
            resultHandling: [
              "immediate_response",
              "read_after_save",
              "status_only",
              "separate_notification",
              "followup_required",
            ].includes(String(s?.resultHandling))
              ? (String(s?.resultHandling) as Step2Step["resultHandling"])
              : "",
          }))
          .filter((s: Step2Step) => s.id)
      : [];

    const normalizedSteps = parsedSteps.length > 0 ? parsedSteps : legacySteps;
    const mixedTaskTypes = Array.isArray(parsed?.aiRules?.mixedTaskTypes)
      ? parsed.aiRules.mixedTaskTypes
          .map((x: any) => String(x))
          .filter((x: string) => ["review", "extract", "validate"].includes(x))
      : [];

    return {
      ...base,
      ...(parsed ?? {}),
      persona: {
        user: parsed?.persona?.user ?? parsed?.userScenario?.who ?? base.persona.user,
        situation:
          parsed?.persona?.situation ?? parsed?.userScenario?.when ?? base.persona.situation,
        goal: parsed?.persona?.goal ?? parsed?.userScenario?.goal ?? base.persona.goal,
      },
      steps: normalizedSteps,
      aiRules: {
        trigger: normalizeTrigger(parsed?.aiRules?.trigger ?? parsed?.aiCallPoint),
        taskType: normalizeTaskType(parsed?.aiRules?.taskType),
        mixedTaskTypes: mixedTaskTypes as MixedTask[],
        resultMode: normalizeResultMode(parsed?.aiRules?.resultMode),
        includeStep1Summary:
          typeof parsed?.aiRules?.includeStep1Summary === "boolean"
            ? parsed.aiRules.includeStep1Summary
            : true,
      },
      midReview:
        parsed?.midReview && typeof parsed.midReview === "object"
          ? {
              version: Number(parsed.midReview.version ?? 1),
              createdAt: Number(parsed.midReview.createdAt ?? Date.now()),
              inputsSnapshotHash: String(parsed.midReview.inputsSnapshotHash ?? ""),
              findings: Array.isArray(parsed.midReview.findings)
                ? parsed.midReview.findings.map((x: any) => String(x))
                : [],
              followupAnswers: {
                cache: ["yes", "no", "tbd", ""].includes(parsed.midReview.followupAnswers?.cache)
                  ? parsed.midReview.followupAnswers.cache
                  : "",
                retry: ["none", "1", "2", "tbd", ""].includes(parsed.midReview.followupAnswers?.retry)
                  ? parsed.midReview.followupAnswers.retry
                  : "",
                invalidation: ["invalidate", "keep", "tbd", ""].includes(
                  parsed.midReview.followupAnswers?.invalidation
                )
                  ? parsed.midReview.followupAnswers.invalidation
                  : "",
                resultApply: ["immediate", "after_save", "save_only", "tbd", ""].includes(
                  parsed.midReview.followupAnswers?.resultApply
                )
                  ? parsed.midReview.followupAnswers.resultApply
                  : "",
              },
            }
          : null,
    };
  } catch {
    return null;
  }
}

function saveStep2Detail(itemId: string, flowId: string, detail: Step2Detail) {
  localStorage.setItem(LS_STEP2_DETAIL_PREFIX + `${itemId}:${flowId}`, JSON.stringify(detail));
}
// ✅ Step1Body가 터지지 않게 하기 위한 기본 Step1 구조
function makeDefaultStep1Detail(itemId: string) {
  return {
    id: itemId,
    title: "(제목 없음)",
    stage: "1",
    updatedAt: Date.now(),
    status: "진행중",
    userContext: {
      userType: "",
      usageContext: "",
      expectedOutcome: "",
    },

    identity: {
      whatWhy: "",
      asIs: "",
      toBe: "",
      oneLine: "",
    },

    aiNeed: {
      aiPresence: "",
      withoutAI: "",
      whyBreaks: [],
      whyAI: [],
    },

    dataDef: {
      hasData: "",
      keepsComing: "",
      dataTypes: [],
      dataExample: "",
    },

    gate: {
      clearOneLine: false,
      aiNeedExplained: false,
      dataChecked: false,
    },

    memos: [],
  };
}

// ✅ localStorage에 Step1이 불완전해도 안전하게 보정
function migrateStep1Detail(raw: any, base: any) {
  const d = { ...base, ...(raw ?? {}) };

  d.userContext = {
    userType: raw?.userContext?.userType ?? "",
    usageContext: raw?.userContext?.usageContext ?? "",
    expectedOutcome: raw?.userContext?.expectedOutcome ?? "",
  };

  d.identity = {
    whatWhy: raw?.identity?.whatWhy ?? "",
    asIs: raw?.identity?.asIs ?? "",
    toBe: raw?.identity?.toBe ?? "",
    oneLine: raw?.identity?.oneLine ?? "",
  };

  d.aiNeed = {
    aiPresence: raw?.aiNeed?.aiPresence ?? "",
    withoutAI: raw?.aiNeed?.withoutAI ?? "",
    whyBreaks: Array.isArray(raw?.aiNeed?.whyBreaks) ? raw.aiNeed.whyBreaks : [],
    whyAI: Array.isArray(raw?.aiNeed?.whyAI) ? raw.aiNeed.whyAI : [],
  };

  d.dataDef = {
    hasData: raw?.dataDef?.hasData ?? "",
    keepsComing: raw?.dataDef?.keepsComing ?? "",
    dataTypes: Array.isArray(raw?.dataDef?.dataTypes) ? raw.dataDef.dataTypes : [],
    dataExample: raw?.dataDef?.dataExample ?? "",
  };

  d.gate = {
    clearOneLine: !!raw?.gate?.clearOneLine,
    aiNeedExplained: !!raw?.gate?.aiNeedExplained,
    dataChecked: !!raw?.gate?.dataChecked,
  };

  d.memos = Array.isArray(raw?.memos) ? raw.memos : [];

  return d;
}



export default function Step2FlowDetailPage() {
  const router = useRouter();
  const params = useParams();

  const itemId = String((params as any)?.id ?? "");
  const flowId = String((params as any)?.flowId ?? "");

  const [step1, setStep1] = useState<ItemDetailLike | null>(null);
  const [step2, setStep2] = useState<Step2Detail | null>(null);
  const [flowReviewResult, setFlowReviewResult] = useState<FlowReviewResult | null>(null);

  // 우측 메모 입력(수동)
  const [memoDraft, setMemoDraft] = useState("");
  const [rightTab, setRightTab] = useState<"summary" | "review" | "risk" | "memo">("memo");

  // Step1 접기/펼치기(읽기 전용)
  const [step1Open, setStep1Open] = useState(true);

  useEffect(() => {
    if (!itemId || !flowId) return;

    // Step1 불러오기
    const d1 = loadStep1Detail(itemId);
    const baseStep1 = makeDefaultStep1Detail(itemId);
    // Step1 detail이 없으면 최소 정보만이라도 보여주기 위해 items에서 title 뽑아옴
    if (!d1) {
      const item = loadItems().find((x: any) => String(x.id) === itemId);
      setStep1({
        ...baseStep1,
        title: item?.title ?? baseStep1.title,
        stage: item?.stage ?? baseStep1.stage,
        updatedAt: item?.updatedAt ?? baseStep1.updatedAt,
        status: item?.status ?? baseStep1.status,
      });
    } else {
      setStep1(migrateStep1Detail(d1, baseStep1));
    }

    // Step2 불러오기/기본 생성
    const d2raw = loadStep2Detail(itemId, flowId);
    const d2 = d2raw ?? makeDefaultStep2(itemId, flowId);
    setStep2(d2);

    // 없던 거면 저장해서 다음부터 유지
    if (!d2raw) saveStep2Detail(itemId, flowId, d2);
  }, [itemId, flowId]);

  const memosSorted = useMemo(() => {
    const memos = step1?.memos ?? [];
    return [...memos].sort((a, b) => b.ts - a.ts);
  }, [step1]);

  const gateSummaryBlock = useMemo(() => {
    if (!flowReviewResult) return null;
    const points = flowReviewResult.reasons
      .slice(0, 2)
      .map((x) => renderFlowReviewMessage(x.message));

    if (flowReviewResult.gate === "GO") {
      return {
        title: "현재 플로우는 기능 설계 진입 가능합니다.",
        lead: "",
        points: [] as string[],
        impact: "",
      };
    }

    if (flowReviewResult.gate === "CAUTION") {
      return {
        title: "현재 플로우는 기능 설계 진입 가능합니다.",
        lead: "다만,",
        points,
        impact: "기능 설계 중 해석 차이가 발생할 수 있습니다.",
      };
    }

    return {
      title: "기능 설계 진입 전 보완이 필요합니다.",
      lead: "현재,",
      points,
      impact: "이 상태로 설계하면 API/저장 구조가 갈릴 수 있습니다.",
    };
  }, [flowReviewResult]);

  if (!step1 || !step2) {
    return <div style={{ padding: 24, fontFamily: "system-ui" }}>loading...</div>;
  }
  const canSaveStep2 = true;

  const filledFlowRows = step2.steps.filter(
    (s) => s.userAction.trim().length > 0 || s.systemAction.trim().length > 0
  );
  const hasAnyPersona =
    String(step1?.userContext?.userType ?? "").trim().length > 0 ||
    String(step1?.userContext?.usageContext ?? "").trim().length > 0 ||
    String(step1?.userContext?.expectedOutcome ?? "").trim().length > 0;
  const canRunMidReview = hasAnyPersona || step2.steps.length > 0;

  const serviceFlowSummaryRows = filledFlowRows.map((s, idx) => {
    const user = s.userAction.trim() || "(사용자 행동 미입력)";
    const system = s.systemAction.trim() || "(시스템 처리 미입력)";
    return {
      index: idx + 1,
      user,
      system,
      resultHandling: getResultHandlingLabel(s.resultHandling),
    };
  });

  const serviceFlowSummary = serviceFlowSummaryRows.map(
    (s) =>
      `${s.index}) ${s.user}\n   → ${s.system}\n   → 결과 처리: ${s.resultHandling}`
  );

  /** -----------------------
   * 상단 버튼: 저장
   * - Step2 저장 + (필요하면 Step1 updatedAt 갱신)
   * ---------------------- */
  function handleSave() {
    if (!step2 || !itemId || !flowId) return;

    const now = Date.now();
    const next2: Step2Detail = { ...step2, updatedAt: now };
    setStep2(next2);
    saveStep2Detail(itemId, flowId, next2);
    updateHomeItemOnStepSave(itemId, "2. 가용 데이터(전처리)", now);
    alert("저장됨");
  }

  function updateStepRow(id: string, patch: Partial<Step2Step>) {
    setStep2((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        steps: prev.steps.map((row) => (row.id === id ? { ...row, ...patch } : row)),
      };
    });
  }

  function addStepRow() {
    setStep2((prev) => (prev ? { ...prev, steps: [...prev.steps, makeEmptyStep()] } : prev));
  }

  function removeStepRow(id: string) {
    setStep2((prev) => {
      if (!prev) return prev;
      return { ...prev, steps: prev.steps.filter((row) => row.id !== id) };
    });
  }

  async function copyServiceSummary() {
    const text = serviceFlowSummary.join("\n");
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      alert("프리뷰를 복사했어.");
    } catch {
      alert("복사에 실패했어.");
    }
  }

  async function runFlowReview() {
    if (!step2) return;
    const payload = buildFlowReviewPayload(step1, step2);

    // TODO: API 연동 시 아래 mock 호출을 교체
    // const res = await fetch("/api/flow-review", { method: "POST", body: JSON.stringify(payload) });
    // const result = (await res.json()) as FlowReviewResult;
    const result = mockFlowReview(payload);
    setFlowReviewResult(result);
  }

  async function copyRecommendedFlow() {
    if (!flowReviewResult?.toBeFlow?.length) return;
    const text = flowReviewResult.toBeFlow
      .map((s) => {
        const handling = getReviewEnumLabel(s.resultHandling);
        return `${s.stepNo}) ${s.userAction}\n→ ${s.systemProcess}\n→ 결과 처리: ${handling}`;
      })
      .join("\n\n");
    try {
      await navigator.clipboard.writeText(text);
      alert("추천 To-Be 플로우를 복사했어.");
    } catch {
      alert("복사에 실패했어.");
    }
  }

  function applyRecommendedFlow() {
    if (!flowReviewResult?.toBeFlow?.length) return;
    alert("반영하기는 다음 단계에서 연결할게.");
  }

  /** -----------------------
   * 우측 메모: 수동 메모 추가
   * - Step1의 memos에 넣어서 단계가 바뀌어도 동일하게 보이게
   * ---------------------- */
  function addManualMemo() {
    if (!step1 || !itemId) return;

    const t = memoDraft.trim();
    if (!t) return;

    const entry: MemoItem = {
      id:
        (typeof crypto !== "undefined" && "randomUUID" in crypto
          ? // @ts-ignore
            crypto.randomUUID()
          : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`),
      ts: Date.now(),
      kind: "manual",
      title: "수동 메모",
      text: t,
    };

    const next1: ItemDetailLike = {
      ...step1,
      memos: [...(step1.memos ?? []), entry],
      updatedAt: Date.now(),
    };

    setStep1(next1);
    saveStep1Detail(itemId, next1);
    setMemoDraft("");
  }

  return (
    <main
      style={{
        padding: 24,
        maxWidth: 1200,
        margin: "0 auto",
        fontFamily: "system-ui",
        color: "#1f2937",
      }}
    >
      {/* 상단: 목록 */}
      <div style={{ marginBottom: 10 }}>
        <Link href="/">← 목록</Link>
        <span style={{ marginLeft: 10, color: "#666", fontSize: 12 }}>
          (현재: Step2 상세)
        </span>
      </div>

      {/* 상단: 제목/버튼 (Step1과 동일한 형태) */}
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 260 }}>
          <div
            style={{
              width: "100%",
              padding: 10,
              borderRadius: 10,
              border: "1px solid #ddd",
              fontSize: 18,
              fontWeight: 700,
              color: "#1f2937",
              background: "#fff",
            }}
          >
            {step1.title}
          </div>

          <div style={{ fontSize: 13, color: "#666", marginTop: 8 }}>
            단계: 2 / 상태: {step2.status} / 마지막 저장: {new Date(step2.updatedAt).toLocaleString()}
          </div>
        </div>

        {/* ✅ 상단 버튼 3개만 */}
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button
            onClick={handleSave}
            disabled={!canSaveStep2}
            style={{
              padding: "8px 12px",
              fontWeight: 800,
              border: "1px solid #ddd",
              borderRadius: 8,
              background: canSaveStep2 ? "#fff" : "#f5f5f5",
              cursor: canSaveStep2 ? "pointer" : "not-allowed",
              opacity: canSaveStep2 ? 1 : 0.65,
            }}
          >
            저장
          </button>

          <button
            onClick={() => alert("다음 단계(추후 Step3 연결)")}
            style={{
              padding: "8px 12px",
              fontWeight: 800,
              color: "#374151",
              background: "#fff",
              border: "1px solid #ddd",
              borderRadius: 8,
            }}
          >
            다음 단계
          </button>

          <button
            onClick={() => alert("여기서 멈추기(추후 연결)")}
            style={{ padding: "8px 12px", fontWeight: 800 }}
          >
            여기서 멈추기
          </button>
        </div>
      </div>

      {/* 본문 + 메모 패널 (Step1과 동일한 좌/우 레이아웃) */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) minmax(360px, 420px)",
          gap: 16,
          alignItems: "start",
          marginTop: 14,
        }}
      >
        {/* 좌측: Step1 읽기 + Step2 작성 */}
        <div>
{/* Step1 (그대로) 읽기전용 + 접기 */}
<div style={{ border: "1px solid #eee", borderRadius: 12, padding: 16, background: "#fff" }}>
  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
    <div style={{ fontSize: 16, fontWeight: 800 }}>STEP 1. 문제 & AI 적합성 검토</div>
    <button
      onClick={() => setStep1Open((v) => !v)}
      aria-label={step1Open ? "STEP 1 접기" : "STEP 1 펼치기"}
      style={{
        padding: "4px 10px",
        borderRadius: 10,
        border: "1px solid #ddd",
        background: "#fff",
        fontSize: 18,
        lineHeight: 1,
        fontWeight: 800,
      }}
    >
      {step1Open ? "⌃" : "⌄"}
    </button>
  </div>

  {step1Open && (
    <div style={{ marginTop: 12 }}>
      <Step1Body
        detail={migrateStep1Detail(step1, makeDefaultStep1Detail(itemId))}
        setDetail={() => {}}          // ✅ 읽기전용이라 변경 막을거라 noop 가능
        savedOnce={true}              // ✅ Step1Body 내부 버튼 조건 막히지 않게(읽기전용이면 사실 의미없음)
        review={null}
        canRunReview={() => false}    // ✅ Step2에서는 리뷰 버튼 비활성
        handleRunReview={() => {}}
        readOnly={true}               // ✅ 핵심: 폼 모양 그대로 + 수정만 막힘
      />
    </div>
  )}
</div>

          {/* ---------------------
              Step2 작성 영역(최소)
             --------------------- */}
          <div style={{ height: 14 }} />

          <div className="step2-scope" style={{ border: "1px solid #eee", borderRadius: 12, padding: 16, background: "#fff" }}>
            <div
              style={{
                marginBottom: 12,
                padding: "8px 0",
                borderRadius: 10,
                border: "none",
                background: "transparent",
              }}
            >
              <span style={{ fontSize: 16, fontWeight: 800, color: "#1d4ed8" }}>
                STEP 2. 메인 플로우 설계
              </span>
            </div>

            <Step2Section
              title="[B] 핵심 플로우 정의"
            headerRight={
              <button
                onClick={addStepRow}
                style={{
                  padding: "10px 14px",
                  fontWeight: 800,
                  borderRadius: 10,
                  border: "1px solid #ddd",
                  background: "#fff",
                  cursor: "pointer",
                }}
              >
                + 단계 추가
              </button>
            }
            desc={
              "실제로 굴러갈 수 있는 서비스 구조를 정의해요.\n" +
              "사용자 행동 → 시스템 처리 → 결과 처리 흐름을 구조화해요.\n" +
              "이 플로우를 기준으로 필요한 처리/API/결과 표시 방식을 찾을 수 있어요."
            }
          >
            <div style={{ borderTop: "1px solid #f1f1f1", marginTop: 2, paddingTop: 10 }}>

              {step2.steps.length === 0 ? (
                <div style={{ marginTop: 10, fontSize: 13, color: "#666" }}>
                  아직 단계가 없어요. "단계 추가"로 시작해요.
                </div>
              ) : (
                <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
                  {step2.steps.map((row, idx) => (
                    <div key={row.id} style={{ border: "1px solid #ececec", borderRadius: 10, padding: 10, background: "#fcfcfc" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                        <div style={{ fontWeight: 800, fontSize: 13 }}>{idx + 1}단계</div>
                        <button
                          onClick={() => removeStepRow(row.id)}
                          style={{
                            padding: "6px 10px",
                            borderRadius: 8,
                            border: "1px solid #ddd",
                            background: "#fff",
                            cursor: "pointer",
                          }}
                        >
                          삭제
                        </button>
                      </div>

                      <div style={{ marginTop: 8 }}>
                        <Step2SubRow
                          left={
                            <>
                              사용자 행동
                              <Step2Hint text={"사용자가 실제로 하는 행동을 적어요.\n클릭·입력·요청 등 외부에서 시작되는 행위예요."} />
                            </>
                          }
                          right={
                            <input
                              className="step2-input"
                              value={row.userAction}
                              onChange={(e) => updateStepRow(row.id, { userAction: e.target.value })}
                              placeholder="ex) 저장 버튼을 누른다"
                              style={{
                                width: "100%",
                                maxWidth: "100%",
                                boxSizing: "border-box",
                                padding: 10,
                                borderRadius: 10,
                                border: "1px solid #ddd",
                              }}
                            />
                          }
                        />
                        <Step2SubRow
                          left={
                            <>
                              시스템 처리
                              <Step2Hint text={"내부에서 실행되는 로직이나 처리 과정을 적어요.\n검증·저장·API 호출 등이 여기에 해당해요."} />
                            </>
                          }
                          right={
                            <input
                              className="step2-input"
                              value={row.systemAction}
                              onChange={(e) => updateStepRow(row.id, { systemAction: e.target.value })}
                              placeholder="ex) 입력값 검증 후 DB 저장"
                              style={{
                                width: "100%",
                                maxWidth: "100%",
                                boxSizing: "border-box",
                                padding: 10,
                                borderRadius: 10,
                                border: "1px solid #ddd",
                              }}
                            />
                          }
                        />
                        <Step2SubRow
                          left={
                            <>
                              결과 처리 방식
                              <Step2Hint text={"처리 결과가 화면에 어떻게 표시되는지 선택해요.\n이걸 정하지 않으면 사용자는 작업이 끝났는지 알 수 없어요."} />
                            </>
                          }
                          right={
                            <div>
                              <div className="step2-radio-group">
                                {RESULT_HANDLING_OPTIONS.map((op) => (
                                  <label
                                    key={op.value}
                                    className="step2-radio-option"
                                    style={{ display: "flex", gap: 8, alignItems: "center" }}
                                  >
                                    <input
                                      type="radio"
                                      name={`row-result-${row.id}`}
                                      checked={row.resultHandling === op.value}
                                      onChange={() =>
                                        updateStepRow(row.id, { resultHandling: op.value as Step2Step["resultHandling"] })
                                      }
                                    />
                                    {op.label}
                                  </label>
                                ))}
                              </div>
                              {(() => {
                                const guide = getResultHandlingGuide(row.resultHandling);
                                if (!guide) return null;
                                return (
                                  <div
                                    style={{
                                      marginTop: 8,
                                      padding: "10px 12px",
                                      background: "#fff7e6",
                                      border: "1px solid #ffe0a3",
                                      borderRadius: 8,
                                      fontSize: 12,
                                      lineHeight: 1.6,
                                    }}
                                  >
                                    <div>동작 방식: {guide.mode}</div>
                                    <div>장점: {guide.pros}</div>
                                    <div>단점: {guide.cons}</div>
                                  </div>
                                );
                              })()}
                            </div>
                          }
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            </Step2Section>

            <style jsx>{`
              .step2-scope input[type="radio"] {
                appearance: none;
                -webkit-appearance: none;
                width: 14px;
                height: 14px;
                border: 1px solid #cfcfcf;
                border-radius: 3px;
                background: #fff;
                cursor: pointer;
                margin: 0;
                flex: 0 0 14px;
              }

              .step2-scope input[type="radio"]:checked {
                border-color: #111;
                background: #111;
                box-shadow: inset 0 0 0 2px #fff;
              }

              .step2-scope .step2-radio-option {
                min-height: 28px;
                line-height: 1.3;
                color: #374151;
                font-size: 13px;
                white-space: nowrap;
              }

              .step2-scope .step2-radio-group {
                display: flex;
                flex-wrap: wrap;
                gap: 8px 14px;
              }

              .step2-scope .step2-input {
                font-size: 13px;
                line-height: 1.4;
                color: #374151;
              }

              .step2-scope .step2-input::placeholder {
                font-size: 13px;
                color: #9ca3af;
              }
            `}</style>
          </div>

          <div style={{ height: 30 }} />
        </div>

        {/* 우측: 메모 패널(동일) */}
        <div
          style={{
            position: "sticky",
            top: 18,
            border: "1px solid #eee",
            borderRadius: 12,
            padding: 12,
            background: "#fff",
          }}
        >
          <div
            style={{
              display: "flex",
              gap: 6,
              marginBottom: 10,
              borderBottom: "1px solid #e5e7eb",
              paddingBottom: 0,
            }}
          >
            {[
              { id: "summary", label: "프리뷰" },
              { id: "review", label: "AI 리뷰" },
              { id: "risk", label: "리스크" },
            ].map((tab) => {
              const active = rightTab === (tab.id as typeof rightTab);
              return (
                <button
                  key={tab.id}
                  onClick={() => setRightTab(tab.id as typeof rightTab)}
                  style={{
                    padding: "9px 12px",
                    border: active ? "1px solid #dbeafe" : "1px solid #e5e7eb",
                    borderBottom: active ? "1px solid #fff" : "1px solid #e5e7eb",
                    borderRadius: "10px 10px 0 0",
                    background: active ? "#fff" : "#f8fafc",
                    color: active ? "#1d4ed8" : "#6b7280",
                    fontWeight: active ? 800 : 600,
                    fontSize: 12,
                    cursor: "pointer",
                    marginBottom: -1,
                    lineHeight: 1.2,
                  }}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {rightTab === "summary" ? (
            <div>
              <div
                style={{
                  border: "1px solid #eee",
                  borderRadius: 10,
                  padding: 10,
                  background: "#fafafa",
                  fontSize: 13,
                  color: "#444",
                  lineHeight: 1.6,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  overflowWrap: "anywhere",
                }}
              >
                {serviceFlowSummaryRows.length > 0 ? (
                  <div style={{ display: "grid", gap: 10 }}>
                    {serviceFlowSummaryRows.map((s) => (
                      <div
                        key={s.index}
                        style={{
                          border: "1px solid #eee",
                          borderRadius: 8,
                          padding: "8px 10px",
                          background: "#fff",
                        }}
                      >
                        <div style={{ fontWeight: 800, marginBottom: 4 }}>
                          {s.index}) {s.user}
                        </div>
                        <div style={{ marginBottom: 6 }}>→ {s.system}</div>
                        <span
                          style={{
                            display: "inline-block",
                            fontSize: 12,
                            padding: "3px 8px",
                            borderRadius: 999,
                            border: "1px solid #eceff3",
                            background: "#fafafa",
                            color: "#9ca3af",
                          }}
                        >
                          결과 처리: {s.resultHandling}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  "요약할 단계가 아직 없어요."
                )}
              </div>
              <button
                onClick={copyServiceSummary}
                disabled={serviceFlowSummary.length === 0}
                style={{
                  marginTop: 8,
                  padding: "8px 12px",
                  border: "1px solid #ddd",
                  borderRadius: 8,
                  background: serviceFlowSummary.length > 0 ? "#fff" : "#f5f5f5",
                  cursor: serviceFlowSummary.length > 0 ? "pointer" : "not-allowed",
                }}
              >
                Copy
              </button>
            </div>
          ) : null}

          {rightTab === "review" ? (
            <div>
              <div style={{ marginTop: 10, fontSize: 13, color: "#444", lineHeight: 1.6 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 4 }}>
                  <div style={{ fontWeight: 800 }}>무엇을 중점으로 확인하나요</div>
                  <button
                    onClick={canRunMidReview ? runFlowReview : undefined}
                    disabled={!canRunMidReview}
                    style={{
                      padding: "8px 12px",
                      fontWeight: 800,
                      borderRadius: 10,
                      border: "1px solid #ddd",
                      background: canRunMidReview ? "#fff" : "#f7f7f7",
                      cursor: canRunMidReview ? "pointer" : "not-allowed",
                      opacity: canRunMidReview ? 1 : 0.65,
                    }}
                  >
                    AI 리뷰
                  </button>
                </div>
                <div>• 논리 연결</div>
                <div>• 비용 증가 가능성</div>
                <div>• 운영 가능성</div>
                <div>• 보완 방향 (To-Be 제안)</div>
              </div>

              {flowReviewResult ? (
                <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
                  <div
                    style={{
                      border: "1px solid #e5e7eb",
                      borderRadius: 10,
                      padding: "10px 12px",
                      background: "#f8fbff",
                    }}
                  >
                    <div style={{ fontWeight: 800, fontSize: 13, color: "#1f2937" }}>
                      {flowReviewResult.gate === "GO"
                        ? "🟢 기능 설계 진입 가능"
                        : flowReviewResult.gate === "CAUTION"
                        ? "🟡 진입 가능하나 일부 보완 필요"
                        : "🔴 진입 전 보완 필요"}
                    </div>
                    {gateSummaryBlock ? (
                      <div style={{ marginTop: 6, fontSize: 13, color: "#374151", lineHeight: 1.7 }}>
                        <div>{gateSummaryBlock.title}</div>
                        {gateSummaryBlock.lead ? <div style={{ marginTop: 4 }}>{gateSummaryBlock.lead}</div> : null}
                        {gateSummaryBlock.points.map((line, idx) => (
                          <div key={idx}>- {line}</div>
                        ))}
                        {gateSummaryBlock.impact ? <div style={{ marginTop: 4 }}>→ {gateSummaryBlock.impact}</div> : null}
                      </div>
                    ) : null}
                  </div>

                  <div
                    style={{
                      border: "1px solid #eee",
                      borderRadius: 10,
                      padding: 10,
                      background: "#fff",
                    }}
                  >
                    <div style={{ fontWeight: 800, marginBottom: 6, display: "flex", alignItems: "center", gap: 8 }}>
                      <span>To-Be 플로우 추천</span>
                      <Step2Hint
                        text={
                          "구현: 처리 로직/API/저장 구조 정의 관련 보완\n" +
                          "UX: 결과 표시/완료 인지/사용자 흐름 관련 보완\n" +
                          "운영: 실패 대응/재시도/운영 절차 관련 보완\n" +
                          "정책: 상태 전이/갱신 규칙/기준 정의 관련 보완\n" +
                          "비용: 중복 실행 방지/호출 비용 제어 관련 보완"
                        }
                      />
                    </div>
                    <div
                      style={{
                        border: "1px solid #f1f1f1",
                        borderRadius: 8,
                        background: "#fafafa",
                        padding: "8px 10px",
                        fontSize: 13,
                        lineHeight: 1.6,
                        color: "#444",
                      }}
                    >
                      {flowReviewResult.toBeFlow.length > 0 ? (
                        <div style={{ display: "grid", gap: 10 }}>
                          {Array.from(
                            { length: Math.max(flowReviewResult.asIsFlow.length, flowReviewResult.toBeFlow.length) },
                            (_, idx) => idx + 1
                          ).map((stepNo) => {
                            const asIs = flowReviewResult.asIsFlow[stepNo - 1];
                            const toBe = flowReviewResult.toBeFlow[stepNo - 1];
                            return (
                              <div
                                key={`compare-${stepNo}`}
                                style={{
                                  border: "1px solid #eceff3",
                                  borderRadius: 8,
                                  background: "#fff",
                                  padding: "8px 10px",
                                }}
                              >
                                <div style={{ fontWeight: 800, marginBottom: 6 }}>{stepNo}단계 비교</div>
                                {([
                                  {
                                    key: "userAction" as const,
                                    label: "사용자 행동",
                                    asIs: asIs?.userAction ?? "없음",
                                    toBe: toBe?.userAction ?? "없음",
                                  },
                                  {
                                    key: "systemProcess" as const,
                                    label: "시스템 처리",
                                    asIs: asIs?.systemProcess ?? "없음",
                                    toBe: toBe?.systemProcess ?? "없음",
                                  },
                                  {
                                    key: "resultHandling" as const,
                                    label: "결과 처리",
                                    asIs: getReviewEnumLabel(asIs?.resultHandling),
                                    toBe: getReviewEnumLabel(toBe?.resultHandling),
                                  },
                                ] as const).map((row) => {
                                  const diff = flowReviewResult.toBeDiff.find(
                                    (d) => d.stepNo === stepNo && d.field === row.key
                                  );
                                  const changed = !!diff;
                                  const fallbackTags: Record<typeof row.key, FlowReviewArea[]> = {
                                    userAction: ["구현"],
                                    systemProcess: ["구현"],
                                    resultHandling: ["UX"],
                                  };
                                  const tags = changed
                                    ? diff.tags.length > 0
                                      ? diff.tags
                                      : fallbackTags[row.key]
                                    : [];
                                  return (
                                    <div key={`${stepNo}-${row.key}`} style={{ borderTop: "1px solid #f3f4f6", paddingTop: 8 }}>
                                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                                        <span style={{ fontSize: 12, color: "#374151", fontWeight: 700 }}>{row.label}</span>
                                        {changed ? (
                                          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                                            {tags.map((tag) => (
                                              <span
                                                key={`${stepNo}-${row.key}-${tag}`}
                                                style={{
                                                  fontSize: 11,
                                                  padding: "2px 7px",
                                                  borderRadius: 999,
                                                  border: "1px solid #dbeafe",
                                                  background: "#eff6ff",
                                                  color: "#1d4ed8",
                                                  fontWeight: 700,
                                                }}
                                              >
                                                {tag}
                                              </span>
                                            ))}
                                          </div>
                                        ) : null}
                                      </div>
                                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                                        <div
                                          style={{
                                            border: "1px solid #e5e7eb",
                                            borderRadius: 8,
                                            padding: "6px 8px",
                                            background: "#f9fafb",
                                          }}
                                        >
                                          <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 2 }}>AS-IS</div>
                                          <div style={{ fontSize: 13, color: "#374151" }}>{row.asIs}</div>
                                        </div>
                                        <div
                                          style={{
                                            border: changed ? "1px solid #bfdbfe" : "1px solid #e5e7eb",
                                            borderRadius: 8,
                                            padding: "6px 8px",
                                            background: changed ? "#eff6ff" : "#fff",
                                          }}
                                        >
                                          <div style={{ fontSize: 11, color: changed ? "#1d4ed8" : "#6b7280", marginBottom: 2 }}>
                                            TO-BE
                                          </div>
                                          <div style={{ fontSize: 13, color: "#1f2937" }}>{row.toBe}</div>
                                        </div>
                                      </div>
                                      {changed && diff ? (
                                        <div style={{ marginTop: 6, fontSize: 12, color: "#4b5563", display: "grid", gap: 3 }}>
                                          <div>→ 제안 사유: {renderFlowReviewMessage(diff.because)}</div>
                                        </div>
                                      ) : null}
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        "추천 플로우가 없어요."
                      )}
                    </div>
                    <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
                      <button
                        onClick={copyRecommendedFlow}
                        style={{
                          padding: "8px 12px",
                          border: "1px solid #ddd",
                          borderRadius: 8,
                          background: "#fff",
                          cursor: "pointer",
                        }}
                      >
                        Copy
                      </button>
                      <button
                        onClick={applyRecommendedFlow}
                        style={{
                          padding: "8px 12px",
                          border: "1px solid #ddd",
                          borderRadius: 8,
                          background: "#fff",
                          cursor: "pointer",
                        }}
                      >
                        반영하기
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {rightTab === "memo" ? (
            <div>
              <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 10 }}>메모</div>
              <div style={{ marginBottom: 12 }}>
                <textarea
                  value={memoDraft}
                  onChange={(e) => setMemoDraft(e.target.value)}
                  placeholder="메모를 남겨요. (저장과 별개로 기록돼요)"
                  style={{
                    width: "100%",
                    minHeight: 120,
                    padding: 10,
                    borderRadius: 10,
                    border: "1px solid #ddd",
                    fontFamily: "system-ui",
                    resize: "vertical",
                  }}
                />
                <button
                  onClick={addManualMemo}
                  style={{
                    width: "100%",
                    marginTop: 8,
                    padding: "10px 12px",
                    fontWeight: 800,
                    color: "#1e3a8a",
                    background: "#eff6ff",
                    border: "1px solid #bfdbfe",
                    borderRadius: 8,
                    cursor: "pointer",
                  }}
                >
                  메모 남기기
                </button>
              </div>

              <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 8 }}>타임라인</div>

              {memosSorted.length === 0 ? (
                <div style={{ fontSize: 13, color: "#666", lineHeight: 1.5 }}>
                  아직 메모가 없어요.
                  <br />
                  저장하면 변경 내역이 자동으로 기록돼요.
                </div>
              ) : (
                <div style={{ display: "grid", gap: 10, maxHeight: 600, overflow: "auto", paddingRight: 4 }}>
                  {memosSorted.map((m) => (
                    <div key={m.id} style={{ border: "1px solid #f1f1f1", borderRadius: 10, padding: 10 }}>
                      <div style={{ display: "grid", gap: 4 }}>
                        <div style={{ fontWeight: 800, fontSize: 13 }}>
                          {m.kind === "auto" ? "자동" : "수동"} · {m.title}
                        </div>
                        <div style={{ fontSize: 12, color: "#666" }}>
                          {new Date(m.ts).toLocaleString()}
                        </div>
                      </div>

                      {m.kind === "manual" && m.text ? (
                        <div style={{ marginTop: 8, fontSize: 13, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
                          {m.text}
                        </div>
                      ) : null}

                      {m.kind === "auto" ? (
                        <div style={{ marginTop: 8, fontSize: 12, color: "#444", lineHeight: 1.5 }}>
                          <div style={{ color: "#666" }}>변경 전</div>
                          <div style={{ whiteSpace: "pre-wrap" }}>{m.before || "—"}</div>
                          <div style={{ color: "#666", marginTop: 6 }}>변경 후</div>
                          <div style={{ whiteSpace: "pre-wrap" }}>{m.after || "—"}</div>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}

          {rightTab === "risk" ? (
            <div>
              <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 8 }}>리스크</div>
              <div style={{ minHeight: 180 }} />
            </div>
          ) : null}

        </div>
      </div>

      <button
        onClick={() => setRightTab((prev) => (prev === "memo" ? "summary" : "memo"))}
        aria-label="메모 열기"
        title="메모"
        style={{
          position: "fixed",
          right: 16,
          bottom: 16,
          width: 42,
          height: 42,
          borderRadius: 999,
          border: rightTab === "memo" ? "1px solid #bfdbfe" : "1px solid #9ca3af",
          background: rightTab === "memo" ? "#eff6ff" : "#3f3f46",
          color: rightTab === "memo" ? "#1d4ed8" : "#e5e7eb",
          fontSize: 18,
          boxShadow: "0 2px 8px rgba(0,0,0,0.18)",
          cursor: "pointer",
          zIndex: 1100,
        }}
      >
        📝
      </button>
    </main>
  );
}
