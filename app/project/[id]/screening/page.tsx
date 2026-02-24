"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  addHistoryEvent,
  canFreezeStep1,
  computeRisk,
  generateStep2Data,
  HISTORY_EVENT_TYPES,
  getDefaultStep1,
  getMissingStep1RequiredFields,
  getProgress,
  getStep1Data,
  setProgress,
  setStep1Data,
  setStep2Data,
  type Step1Data,
  type Step1AiTaskType,
  type Step1AiMinRole,
  type Step1Exposure,
  type Step1Hitl,
  type Step1Impact,
  type Step1ResultState,
  type Step1Reversibility,
  type Step1Target,
} from "@/lib/prismMvp";
import Step1PreviewPanel, { type Step1PreviewAreaKey, type Step1PreviewRowId } from "../_components/Step1PreviewPanel";

const TARGET_OPTIONS: Array<{ value: Step1Target; label: string }> = [
  { value: "internal_staff", label: "내부 실무자" },
  { value: "approver_admin", label: "승인자/관리자" },
  { value: "end_user", label: "최종 사용자" },
  { value: "external_customer_partner", label: "외부 고객/파트너" },
  { value: "system_operator", label: "시스템 운영자" },
];

const RESULT_STATE_OPTIONS: Array<{ value: Step1ResultState; label: string }> = [
  { value: "draft_saved", label: "초안 저장" },
  { value: "status_changed", label: "상태 변경" },
  { value: "review_requested", label: "승인 요청 생성" },
  { value: "published_or_executed", label: "게시/실행 완료" },
  { value: "reference_saved", label: "리포트 저장" },
  { value: "action_triggered", label: "알림 트리거" },
  { value: "task_created", label: "작업 생성" },
  { value: "ephemeral_response", label: "일회성 응답 (저장 없음)" },
];

const AI_MIN_ROLE_OPTIONS: Array<{ value: Step1AiMinRole; label: string }> = [
  { value: "draft_only", label: "초안 생성까지만" },
  { value: "auto_publish", label: "자동 게시까지" },
];

const AI_TASK_TYPE_OPTIONS: Array<{ value: Step1AiTaskType; label: string }> = [
  { value: "draft_generation", label: "초안 생성" },
  { value: "candidate_suggestion", label: "후보 제시" },
  { value: "revision_suggestion", label: "개선 제안" },
  { value: "policy_check", label: "정책 점검" },
  { value: "classification", label: "분류" },
  { value: "approval_assist", label: "승인 보조" },
];

const EXPOSURE_OPTIONS: Array<{ value: Step1Exposure; label: string }> = [
  { value: "internal", label: "내부 참고용" },
  { value: "limited_external", label: "제한적 고객 노출" },
  { value: "public", label: "누구나 공개" },
];

const REVERSIBILITY_OPTIONS: Array<{ value: Step1Reversibility; label: string }> = [
  { value: "easy", label: "언제든 수정·중단 가능" },
  { value: "limited", label: "일부만 수정 가능" },
  { value: "irreversible", label: "되돌리기 어려움" },
];

const IMPACT_OPTIONS: Array<{ value: Step1Impact; label: string }> = [
  { value: "low", label: "내부 업무 불편" },
  { value: "medium", label: "고객 경험" },
  { value: "high", label: "금전·법적·브랜드 영향" },
];

const HITL_OPTIONS: Array<{ value: Step1Hitl; label: string }> = [
  { value: "pre_review", label: "사람이 먼저 보고 결정" },
  { value: "post_monitoring", label: "적용 후에만 지켜봄" },
  { value: "none", label: "사람은 따로 보지 않음" },
];

const EXPOSURE_LABEL: Record<Step1Exposure, string> = {
  internal: "내부 참고",
  limited_external: "제한적 노출",
  public: "전체 공개",
};

const REVERSIBILITY_LABEL: Record<Step1Reversibility, string> = {
  easy: "수정/중단 용이",
  limited: "일부만 수정 가능",
  irreversible: "되돌리기 어려움",
};

const IMPACT_LABEL: Record<Step1Impact, string> = {
  low: "내부 업무 불편",
  medium: "고객 경험",
  high: "금전/법적/브랜드 영향",
};

const HITL_LABEL: Record<Step1Hitl, string> = {
  pre_review: "사전 검토",
  post_monitoring: "사후 모니터링",
  none: "인간 개입 없음",
};

type InputMode = "form" | "table";
type RightPanelTab = "preview" | "impact";
type Step1TableRowId =
  | "why"
  | "target"
  | "as_is"
  | "result_state"
  | "ai_task_types"
  | "no_ai_alternative"
  | "exposure"
  | "reversibility"
  | "impact"
  | "hitl"
  | "kpi";

type Step1TableRow = {
  id: Step1TableRowId;
  section: string;
  field: string;
  note: string;
  value: string;
};

type SheetColIndex = 0 | 1 | 2;
type SheetCell = { row: number; col: SheetColIndex };
type Step1TableNotes = Partial<Record<Step1TableRowId, string>>;
const GUIDED_TEST_MODE = true;

const DEFAULT_STEP1_ROW_ORDER: Step1TableRowId[] = [
  "why",
  "target",
  "as_is",
  "result_state",
  "ai_task_types",
  "no_ai_alternative",
  "exposure",
  "reversibility",
  "impact",
  "hitl",
  "kpi",
];

const PREVIEW_AREA_ROW_IDS: Record<Step1PreviewAreaKey, Step1TableRowId[]> = {
  strategy: ["why", "target", "result_state", "kpi"],
  policy: ["exposure", "reversibility", "impact", "hitl"],
  automation: ["ai_task_types", "result_state", "exposure", "impact", "hitl"],
  state_flow: ["result_state", "hitl"],
  risk_profile: ["exposure", "reversibility", "impact", "hitl"],
};

function getSingleSelectOptionsByRowId(rowId: Step1TableRowId) {
  switch (rowId) {
    case "result_state":
      return RESULT_STATE_OPTIONS;
    case "exposure":
      return EXPOSURE_OPTIONS;
    case "reversibility":
      return REVERSIBILITY_OPTIONS;
    case "impact":
      return IMPACT_OPTIONS;
    case "hitl":
      return HITL_OPTIONS;
    default:
      return null;
  }
}

const TARGET_LABEL_BY_VALUE: Record<Step1Target, string> = Object.fromEntries(TARGET_OPTIONS.map((o) => [o.value, o.label])) as Record<Step1Target, string>;
const AI_TASK_TYPE_LABEL_BY_VALUE: Record<Step1AiTaskType, string> = Object.fromEntries(AI_TASK_TYPE_OPTIONS.map((o) => [o.value, o.label])) as Record<Step1AiTaskType, string>;
const RESULT_LABEL_BY_VALUE: Record<Step1ResultState, string> = Object.fromEntries(RESULT_STATE_OPTIONS.map((o) => [o.value, o.label])) as Record<Step1ResultState, string>;
const EXPOSURE_LABEL_BY_VALUE: Record<Step1Exposure, string> = Object.fromEntries(EXPOSURE_OPTIONS.map((o) => [o.value, o.label])) as Record<Step1Exposure, string>;
const REVERSIBILITY_LABEL_BY_VALUE: Record<Step1Reversibility, string> = Object.fromEntries(REVERSIBILITY_OPTIONS.map((o) => [o.value, o.label])) as Record<Step1Reversibility, string>;
const IMPACT_LABEL_BY_VALUE: Record<Step1Impact, string> = Object.fromEntries(IMPACT_OPTIONS.map((o) => [o.value, o.label])) as Record<Step1Impact, string>;
const HITL_LABEL_BY_VALUE: Record<Step1Hitl, string> = Object.fromEntries(HITL_OPTIONS.map((o) => [o.value, o.label])) as Record<Step1Hitl, string>;
const AI_TASK_TYPE_VALUE_SET = new Set<Step1AiTaskType>(AI_TASK_TYPE_OPTIONS.map((o) => o.value));

function normalizeTokens(raw: string): string[] {
  return raw
    .split(/[\n,]/)
    .map((v) => v.trim())
    .filter(Boolean);
}

function parseSingleByOption<T extends string>(raw: string, options: Array<{ value: T; label: string }>): T | "" {
  const token = normalizeTokens(raw)[0]?.toLowerCase();
  if (!token) return "";
  for (const option of options) {
    if (option.value.toLowerCase() === token || option.label.toLowerCase() === token) return option.value;
  }
  return "";
}

function parseMultiByOption<T extends string>(raw: string, options: Array<{ value: T; label: string }>): T[] {
  const tokens = normalizeTokens(raw).map((token) => token.toLowerCase());
  if (tokens.length === 0) return [];
  const matched = new Set<T>();
  for (const token of tokens) {
    for (const option of options) {
      if (option.value.toLowerCase() === token || option.label.toLowerCase() === token) {
        matched.add(option.value);
      }
    }
  }
  return Array.from(matched);
}

function parseTargetTokenWithAlias(rawToken: string): Step1Target | "" {
  const token = rawToken.toLowerCase();
  const direct = parseSingleByOption(token, TARGET_OPTIONS);
  if (direct) return direct;
  if (token.includes("마케터") || token.includes("작성자") || token.includes("콘텐츠") || token.includes("내부")) return "internal_staff";
  if (token.includes("승인") || token.includes("관리자")) return "approver_admin";
  if (token.includes("일반") || token.includes("최종") || token.includes("end user")) return "end_user";
  if (token.includes("고객") || token.includes("파트너")) return "external_customer_partner";
  if (token.includes("시스템") || token.includes("운영자")) return "system_operator";
  return "";
}

function parseTargetsWithAlias(raw: string): Step1Target[] {
  const tokens = normalizeTokens(raw);
  if (tokens.length === 0) return [];
  const matched = new Set<Step1Target>();
  for (const token of tokens) {
    const parsed = parseTargetTokenWithAlias(token);
    if (parsed) matched.add(parsed);
  }
  return Array.from(matched);
}

function getSingleValueByRowId(rowId: Step1TableRowId, data: Step1Data): string {
  if (rowId === "result_state") return data.result_state;
  if (rowId === "exposure") return data.exposure;
  if (rowId === "reversibility") return data.reversibility;
  if (rowId === "impact") return data.impact;
  if (rowId === "hitl") return data.hitl;
  return "";
}

function getValueExampleByRowId(rowId: Step1TableRowId): string {
  switch (rowId) {
    case "why":
      return "ex) 반복 작업 자동화로 작성 시간을 줄이고 일관성을 높임";
    case "target":
      return "ex) 콘텐츠 작성자";
    case "as_is":
      return "ex) 초안 작성이 오래 걸리고 톤이 들쭉날쭉함";
    case "result_state":
      return "ex) 초안 생성/저장";
    case "ai_task_types":
      return "ex) 분류, 추천";
    case "no_ai_alternative":
      return "ex) 템플릿 기반 수동 작성";
    case "exposure":
      return "ex) 제한적 고객 노출";
    case "reversibility":
      return "ex) 언제든 수정·중단 가능";
    case "impact":
      return "ex) 고객 경험";
    case "hitl":
      return "ex) 사람이 먼저 보고 결정";
    case "kpi":
      return "ex) 작성 시간 10% 단축 → 발행 빈도 증가";
    default:
      return "예시를 입력해 주세요";
  }
}

function buildStep1TableRows(data: Step1Data): Step1TableRow[] {
  const normalizedAiTaskTypes = data.ai_task_types.filter((v): v is Step1AiTaskType => AI_TASK_TYPE_VALUE_SET.has(v));
  return [
    { id: "why", section: "전략", field: "왜 AI를 붙이나요", note: "", value: data.why },
    { id: "target", section: "전략", field: "누구를 위한 기능인가요", note: "", value: data.target.map((v) => TARGET_LABEL_BY_VALUE[v]).join(", ") },
    { id: "as_is", section: "문제", field: "현재 어떤 문제가 있나요 (AS-IS)", note: "", value: data.as_is },
    { id: "result_state", section: "결과", field: "이 플로우가 끝나면 무엇이 남나요 (결과 상태)", note: "", value: data.result_state ? RESULT_LABEL_BY_VALUE[data.result_state] : "" },
    { id: "ai_task_types", section: "전략", field: "AI는 무엇을 하나요 (작업 유형)", note: "", value: normalizedAiTaskTypes.map((v) => AI_TASK_TYPE_LABEL_BY_VALUE[v]).join(", ") },
    { id: "no_ai_alternative", section: "대안", field: "AI 없이 대안 1줄", note: "", value: data.no_ai_alternative_detail },
    { id: "exposure", section: "운영", field: "AI 결과가 외부에 공개되나요 (Exposure)", note: "", value: data.exposure ? EXPOSURE_LABEL_BY_VALUE[data.exposure] : "" },
    { id: "reversibility", section: "운영", field: "문제가 생기면 되돌릴 수 있나요 (Reversibility)", note: "", value: data.reversibility ? REVERSIBILITY_LABEL_BY_VALUE[data.reversibility] : "" },
    { id: "impact", section: "운영", field: "틀리면 가장 부담이 큰 곳은 어디인가요 (Impact)", note: "", value: data.impact ? IMPACT_LABEL_BY_VALUE[data.impact] : "" },
    { id: "hitl", section: "운영", field: "사람이 언제 한 번이라도 보게 되나요 (HITL)", note: "", value: data.hitl ? HITL_LABEL_BY_VALUE[data.hitl] : "" },
    { id: "kpi", section: "문제", field: "KPI / 성공 가설", note: "", value: data.kpi },
  ];
}

function getNotePlaceholderByRowId(rowId: Step1TableRowId): string {
  if (rowId === "target" || rowId === "ai_task_types") return "복수 선택 가능";
  return "";
}

export default function ScreeningPage() {
  const params = useParams();
  const router = useRouter();
  const id = String(params?.id ?? "");

  const [data, setData] = useState<Step1Data>(getDefaultStep1());
  const [frozen, setFrozen] = useState(false);
  const [message, setMessage] = useState("");
  const [inputMode, setInputMode] = useState<InputMode>("table");
  const [rightPanelTab, setRightPanelTab] = useState<RightPanelTab>("preview");
  const [activePreviewArea, setActivePreviewArea] = useState<Step1PreviewAreaKey | null>(null);
  const [rowOrder, setRowOrder] = useState<Step1TableRowId[]>(DEFAULT_STEP1_ROW_ORDER);
  const [dragRowId, setDragRowId] = useState<Step1TableRowId | null>(null);
  const [dropRowId, setDropRowId] = useState<Step1TableRowId | null>(null);
  const [dropPosition, setDropPosition] = useState<"before" | "after">("after");
  const [rightPanelWidth, setRightPanelWidth] = useState(420);
  const [isResizing, setIsResizing] = useState(false);
  const twoPaneRef = useRef<HTMLDivElement | null>(null);
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const [activeCell, setActiveCell] = useState<SheetCell | null>(null);
  const [selectionRange, setSelectionRange] = useState<{ start: SheetCell; end: SheetCell } | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const [editingRowId, setEditingRowId] = useState<Step1TableRowId | null>(null);
  const [tableNotes, setTableNotes] = useState<Step1TableNotes>({});
  const [savedDataSnapshot, setSavedDataSnapshot] = useState<Step1Data | null>(null);
  const [savedNotesSnapshot, setSavedNotesSnapshot] = useState<Step1TableNotes | null>(null);
  const [savedRowOrderSnapshot, setSavedRowOrderSnapshot] = useState<Step1TableRowId[] | null>(null);

  useEffect(() => {
    if (!id) return;
    const loadedData = getStep1Data(id);
    setData(loadedData);
    setSavedDataSnapshot(loadedData);
    setFrozen(getProgress(id).step1Frozen);
    let normalizedOrder = DEFAULT_STEP1_ROW_ORDER;
    try {
      const raw = localStorage.getItem(`prism:mvp:${id}:step1:row-order`);
      if (!raw) {
        setRowOrder(DEFAULT_STEP1_ROW_ORDER);
      } else {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) {
          setRowOrder(DEFAULT_STEP1_ROW_ORDER);
        } else {
          normalizedOrder = [
            ...parsed.filter((v): v is Step1TableRowId => DEFAULT_STEP1_ROW_ORDER.includes(v)),
            ...DEFAULT_STEP1_ROW_ORDER.filter((v) => !parsed.includes(v)),
          ];
          setRowOrder(normalizedOrder);
        }
      }
    } catch {
      setRowOrder(DEFAULT_STEP1_ROW_ORDER);
    }
    setSavedRowOrderSnapshot(normalizedOrder);

    let loadedNotes: Step1TableNotes = {};
    try {
      const rawNotes = localStorage.getItem(`prism:mvp:${id}:step1:notes`);
      if (!rawNotes) {
        loadedNotes = {};
        setTableNotes(loadedNotes);
      } else {
        const parsedNotes = JSON.parse(rawNotes) as Step1TableNotes;
        loadedNotes = parsedNotes ?? {};
        setTableNotes(loadedNotes);
      }
    } catch {
      loadedNotes = {};
      setTableNotes(loadedNotes);
    }
    setSavedNotesSnapshot(loadedNotes);
  }, [id]);

  useEffect(() => {
    if (!id) return;
    const normalized = data.ai_task_types.filter((v): v is Step1AiTaskType => AI_TASK_TYPE_VALUE_SET.has(v));
    if (normalized.length === data.ai_task_types.length) return;
    setData((prev) => ({ ...prev, ai_task_types: normalized }));
    addHistoryEvent(id, {
      stage: "system",
      action: HISTORY_EVENT_TYPES.SCHEMA_INVALID_RECOVERED,
      detail: "step1 ai_task_types invalid values dropped",
    });
  }, [id, data.ai_task_types]);

  const riskLevel = useMemo(() => computeRisk(data), [data]);
  const freezeReady = canFreezeStep1(data);
  const missingForFreeze = useMemo(() => getMissingStep1RequiredFields(data), [data]);

  const aiRoleSummary =
    data.ai_task_types.filter((v): v is Step1AiTaskType => AI_TASK_TYPE_VALUE_SET.has(v)).length > 0
      ? Array.from(new Set(data.ai_task_types.filter((v): v is Step1AiTaskType => AI_TASK_TYPE_VALUE_SET.has(v))))
          .map((v) => `${AI_TASK_TYPE_LABEL_BY_VALUE[v]} (ai_task_type=${v})`)
          .join("\n")
      : "—";
  const humanReviewSummary = data.hitl ? `${HITL_LABEL[data.hitl]} (hitl=${data.hitl})` : "—";

  const executionAuthoritySummary = useMemo(() => {
    if (!data.result_state) return "—";
    return `${RESULT_LABEL_BY_VALUE[data.result_state]} (result_state=${data.result_state})`;
  }, [data.result_state]);

  const conditionalDelegationSummary = useMemo(() => {
    let label = "조건부 자동 적용 (conditional_handling=conditional_apply)";
    if (data.hitl === "pre_review") {
      label = "사전 검토 후 적용 (conditional_handling=pre_review_then_apply)";
    } else if (data.hitl === "post_monitoring") {
      label = "적용 후 모니터링 (conditional_handling=post_monitoring)";
    } else if (data.hitl === "none" && data.exposure === "internal" && data.impact && data.impact !== "high") {
      label = "자동 적용 (conditional_handling=auto_apply)";
    }
    const signal = `입력: impact=${data.impact || "-"}, exposure=${data.exposure || "-"}, hitl=${data.hitl || "-"}`;
    return `${label}\n${signal}`;
  }, [data.exposure, data.impact, data.hitl]);

  const stateFlow = useMemo(() => {
    const steps: string[] = ["입력 (input)"];
    if (data.ai_task_types.includes("draft_generation")) {
      steps.push("AI 초안 생성 (draft_generation)");
    }
    if (data.hitl === "pre_review") {
      steps.push("사전 검토 (pre_review)");
    }
    if (data.result_state) {
      steps.push(`${RESULT_LABEL_BY_VALUE[data.result_state]} (${data.result_state})`);
    }
    return steps;
  }, [data.ai_task_types, data.hitl, data.result_state]);
  const stateFlowWarning = useMemo(() => {
    if (data.result_state === "review_requested" && data.hitl && data.hitl !== "pre_review") {
      return "현재 실행 방식과 상태 흐름이 일치하지 않습니다.";
    }
    return "";
  }, [data.result_state, data.hitl]);
  const targetSummary = data.target.length > 0 ? data.target.map((v) => TARGET_LABEL_BY_VALUE[v]).join(", ") : "미선택";
  const resultStateSummary = data.result_state ? `${RESULT_LABEL_BY_VALUE[data.result_state]} (result_state=${data.result_state})` : "미선택 (UNSET)";
  const kpiSummary = data.kpi.trim() || "미입력";
  const exposureSummary = data.exposure ? `${EXPOSURE_LABEL[data.exposure]} (exposure=${data.exposure})` : "미선택 (UNSET)";
  const reversibilitySummary = data.reversibility
    ? `${REVERSIBILITY_LABEL[data.reversibility]} (reversibility=${data.reversibility})`
    : "미선택 (UNSET)";
  const impactSummary = data.impact ? `${IMPACT_LABEL[data.impact]} (impact=${data.impact})` : "미선택 (UNSET)";
  const hitlSummary = data.hitl ? `${HITL_LABEL[data.hitl]} (hitl=${data.hitl})` : "미선택 (UNSET)";

  const impactAnchor = data.impact
    ? `${IMPACT_LABEL[data.impact]} (impact=${data.impact})`
    : "실패 비용 위치 입력 필요";
  const exposureReference = data.exposure
    ? `${EXPOSURE_LABEL_BY_VALUE[data.exposure]} (exposure=${data.exposure})`
    : "";
  const hitlReference = data.hitl
    ? `${HITL_LABEL_BY_VALUE[data.hitl]} (hitl=${data.hitl})`
    : "";
  const reversibilityReference = data.reversibility
    ? `${REVERSIBILITY_LABEL_BY_VALUE[data.reversibility]} (reversibility=${data.reversibility})`
    : "";
  const riskReasons = [
    data.exposure
      ? data.exposure === "public"
        ? "외부 공개 범위 (Exposure=PUBLIC)"
        : data.exposure === "limited_external"
          ? "제한적 고객 노출 (Exposure=LIMITED_EXTERNAL)"
          : "내부 노출 중심 (Exposure=INTERNAL)"
      : "노출 범위 미선택",
    data.hitl
      ? data.hitl === "pre_review"
        ? "사전 검토 존재 (HITL=PRE_REVIEW)"
        : data.hitl === "post_monitoring"
          ? "사후 모니터링 기반 (HITL=POST_MONITORING)"
          : "인간 개입 없음 (HITL=NONE)"
      : "인간 개입 시점 미선택",
    data.reversibility
      ? data.reversibility === "easy"
        ? "되돌림 가능 (Reversibility=EASY)"
        : data.reversibility === "limited"
          ? "부분 되돌림 가능 (Reversibility=LIMITED)"
          : "되돌림 어려움 (Reversibility=IRREVERSIBLE)"
      : "되돌림 가능성 미선택",
  ];
  const riskSignals = [exposureReference, hitlReference, reversibilityReference].filter(Boolean);
  const tableRows = useMemo(() => {
    const baseRows = buildStep1TableRows(data);
    const rowById = new Map(baseRows.map((row) => [row.id, row]));
    const normalizedOrder = [
      ...rowOrder.filter((rowId) => rowById.has(rowId)),
      ...DEFAULT_STEP1_ROW_ORDER.filter((rowId) => rowById.has(rowId) && !rowOrder.includes(rowId)),
    ];
    return normalizedOrder
      .map((rowId) => rowById.get(rowId))
      .filter((row): row is Step1TableRow => Boolean(row))
      .map((row) => ({ ...row, note: tableNotes[row.id] ?? row.note }));
  }, [data, rowOrder, tableNotes]);
  const highlightedRowIds = useMemo(
    () => new Set<Step1TableRowId>(activePreviewArea ? PREVIEW_AREA_ROW_IDS[activePreviewArea] : []),
    [activePreviewArea]
  );
  const activePreviewRowId = useMemo<Step1PreviewRowId | null>(() => {
    if (editingRowId) return editingRowId;
    if (activeCell) return (tableRows[activeCell.row]?.id as Step1PreviewRowId | undefined) ?? null;
    return null;
  }, [activeCell, editingRowId, tableRows]);
  const isDirty = useMemo(() => {
    if (!savedDataSnapshot || !savedNotesSnapshot || !savedRowOrderSnapshot) return false;
    const normalizeNotes = (notes: Step1TableNotes) =>
      Object.fromEntries(Object.entries(notes).filter(([, value]) => (value ?? "").trim().length > 0));
    return (
      JSON.stringify(data) !== JSON.stringify(savedDataSnapshot) ||
      JSON.stringify(rowOrder) !== JSON.stringify(savedRowOrderSnapshot) ||
      JSON.stringify(normalizeNotes(tableNotes)) !== JSON.stringify(normalizeNotes(savedNotesSnapshot))
    );
  }, [data, rowOrder, tableNotes, savedDataSnapshot, savedNotesSnapshot, savedRowOrderSnapshot]);
  const selectedBounds = useMemo(() => {
    if (!selectionRange) return null;
    return {
      rowMin: Math.min(selectionRange.start.row, selectionRange.end.row),
      rowMax: Math.max(selectionRange.start.row, selectionRange.end.row),
      colMin: Math.min(selectionRange.start.col, selectionRange.end.col) as SheetColIndex,
      colMax: Math.max(selectionRange.start.col, selectionRange.end.col) as SheetColIndex,
    };
  }, [selectionRange]);

  useEffect(() => {
    if (!isResizing) return;
    function onMove(e: MouseEvent) {
      const rect = twoPaneRef.current?.getBoundingClientRect();
      if (!rect) return;
      const next = rect.right - e.clientX;
      const clamped = Math.max(320, Math.min(760, next));
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
    if (!isSelecting) return;
    function onUp() {
      setIsSelecting(false);
    }
    window.addEventListener("mouseup", onUp);
    return () => window.removeEventListener("mouseup", onUp);
  }, [isSelecting]);

  function update<K extends keyof Step1Data>(key: K, value: Step1Data[K]) {
    setData((prev) => ({ ...prev, [key]: value }));
  }

  function toggleMultiValue(key: "target", value: Step1Data["target"][number]) {
    setData((prev) => {
      const current = prev[key];
      const exists = current.includes(value);
      const next = exists ? current.filter((v) => v !== value) : [...current, value];
      return { ...prev, [key]: next };
    });
  }

  function updateTableCell(rowId: Step1TableRowId, rawValue: string) {
    setData((prev) => {
      switch (rowId) {
        case "why":
          return { ...prev, why: rawValue };
        case "target":
          return {
            ...prev,
            target: parseTargetsWithAlias(rawValue),
          };
        case "as_is":
          return { ...prev, as_is: rawValue };
        case "result_state":
          return { ...prev, result_state: parseSingleByOption(rawValue, RESULT_STATE_OPTIONS) };
        case "ai_task_types":
          return { ...prev, ai_task_types: parseMultiByOption(rawValue, AI_TASK_TYPE_OPTIONS) };
        case "no_ai_alternative":
          return {
            ...prev,
            no_ai_alternative_detail: rawValue,
            no_ai_alternative: rawValue.trim() ? prev.no_ai_alternative : [],
          };
        case "exposure":
          return { ...prev, exposure: parseSingleByOption(rawValue, EXPOSURE_OPTIONS) };
        case "reversibility":
          return { ...prev, reversibility: parseSingleByOption(rawValue, REVERSIBILITY_OPTIONS) };
        case "impact":
          return { ...prev, impact: parseSingleByOption(rawValue, IMPACT_OPTIONS) };
        case "hitl":
          return { ...prev, hitl: parseSingleByOption(rawValue, HITL_OPTIONS) };
        case "kpi":
          return { ...prev, kpi: rawValue };
        default:
          return prev;
      }
    });
  }

  function startCellSelection(row: number, col: SheetColIndex) {
    const cell: SheetCell = { row, col };
    setActiveCell(cell);
    setSelectionRange({ start: cell, end: cell });
    setIsSelecting(true);
    setEditingRowId(null);
    sheetRef.current?.focus();
  }

  function extendCellSelection(row: number, col: SheetColIndex) {
    if (!isSelecting || !activeCell) return;
    setSelectionRange({ start: activeCell, end: { row, col } });
  }

  function isCellInSelection(row: number, col: SheetColIndex) {
    if (!selectedBounds) return false;
    return row >= selectedBounds.rowMin && row <= selectedBounds.rowMax && col >= selectedBounds.colMin && col <= selectedBounds.colMax;
  }

  function getCellText(row: Step1TableRow, col: SheetColIndex) {
    if (col === 0) return row.field;
    if (col === 1) return row.value;
    return row.note ?? "";
  }

  function copySelectedCellsToText() {
    if (!selectedBounds && !activeCell) return null;
    const rowMin = selectedBounds?.rowMin ?? activeCell?.row ?? 0;
    const rowMax = selectedBounds?.rowMax ?? activeCell?.row ?? 0;
    const colMin = selectedBounds?.colMin ?? (activeCell?.col ?? 0);
    const colMax = selectedBounds?.colMax ?? (activeCell?.col ?? 0);

    const lines: string[] = [];
    for (let r = rowMin; r <= rowMax; r += 1) {
      const row = tableRows[r];
      if (!row) continue;
      const cols: string[] = [];
      for (let c = colMin; c <= colMax; c += 1) {
        cols.push(getCellText(row, c as SheetColIndex));
      }
      lines.push(cols.join("\t"));
    }

    return {
      text: lines.join("\n"),
      count: lines.length,
    };
  }

  function applyPasteByCells(start: SheetCell, text: string) {
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.split("\t").map((c) => c.trim()))
      .filter((cols) => cols.some((v) => v.length > 0));
    if (lines.length === 0) return;

    let updatedRows = 0;
    for (let r = 0; r < lines.length; r += 1) {
      const rowIndex = start.row + r;
      if (rowIndex >= tableRows.length) break;
      const rowId = tableRows[rowIndex]?.id;
      if (!rowId) continue;

      for (let c = 0; c < lines[r].length; c += 1) {
        const colIndex = (start.col + c) as number;
        if (colIndex !== 1) continue;
        updateTableCell(rowId, lines[r][c]);
        updatedRows += 1;
      }
    }

    const end: SheetCell = {
      row: Math.min(start.row + lines.length - 1, tableRows.length - 1),
      col: Math.min((start.col + (lines[0]?.length ?? 1) - 1) as number, 2) as SheetColIndex,
    };
    setSelectionRange({ start, end });
    setActiveCell(start);
    setMessage(`붙여넣기 완료: ${updatedRows}셀`);
  }

  function isEditableTarget(target: EventTarget | null) {
    if (!(target instanceof HTMLElement)) return false;
    return Boolean(target.closest("textarea, input, select, option"));
  }

  function handleSheetCopy(e: React.ClipboardEvent<HTMLDivElement>) {
    if (inputMode !== "table") return;
    if (isEditableTarget(e.target)) return;
    const copied = copySelectedCellsToText();
    if (!copied) return;
    e.preventDefault();
    e.clipboardData.setData("text/plain", copied.text);
    setMessage(`값 ${copied.count}행 복사 완료`);
  }

  function handleSheetPaste(e: React.ClipboardEvent<HTMLDivElement>) {
    if (inputMode !== "table") return;
    if (isEditableTarget(e.target)) return;
    if (!activeCell) return;
    e.preventDefault();
    const text = e.clipboardData.getData("text/plain");
    applyPasteByCells(activeCell, text);
  }

  function handleSheetKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (inputMode !== "table") return;
    const target = e.target as HTMLElement;
    const tag = target.tagName.toLowerCase();
    if (tag === "textarea" || tag === "input" || tag === "select") return;

    const cmd = e.metaKey || e.ctrlKey;
    if (!cmd) return;

    if (e.key.toLowerCase() === "a") {
      e.preventDefault();
      if (tableRows.length === 0) return;
      setActiveCell({ row: 0, col: 0 });
      setSelectionRange({ start: { row: 0, col: 0 }, end: { row: tableRows.length - 1, col: 2 } });
      setMessage("표 전체 셀 선택");
    }
    if (e.key === "Enter" && activeCell) {
      e.preventDefault();
      if (activeCell.col === 1) {
        setEditingRowId(tableRows[activeCell.row]?.id ?? null);
      }
    }
  }

  function moveRow(dragId: Step1TableRowId, targetId: Step1TableRowId, pos: "before" | "after") {
    setRowOrder((prev) => {
      const current = prev.length > 0 ? prev : DEFAULT_STEP1_ROW_ORDER;
      const next = [...current];
      const from = next.indexOf(dragId);
      const target = next.indexOf(targetId);
      if (from === -1 || target === -1) return current;
      next.splice(from, 1);
      let insertAt = target;
      if (from < target) insertAt -= 1;
      if (pos === "after") insertAt += 1;
      insertAt = Math.max(0, Math.min(next.length, insertAt));
      next.splice(insertAt, 0, dragId);
      return next;
    });
  }

  useEffect(() => {
    if (!id || rowOrder.length === 0) return;
    try {
      localStorage.setItem(`prism:mvp:${id}:step1:row-order`, JSON.stringify(rowOrder));
    } catch {
      // ignore localStorage quota/read-only errors
    }
  }, [id, rowOrder]);

  useEffect(() => {
    if (!id) return;
    try {
      localStorage.setItem(`prism:mvp:${id}:step1:notes`, JSON.stringify(tableNotes));
    } catch {
      // ignore localStorage quota/read-only errors
    }
  }, [id, tableNotes]);

  function updateTableNote(rowId: Step1TableRowId, note: string) {
    setTableNotes((prev) => ({ ...prev, [rowId]: note }));
  }

  function renderFormInputByRowId(rowId: Step1TableRowId) {
    switch (rowId) {
      case "why":
        return (
          <textarea
            value={data.why}
            onChange={(e) => update("why", e.target.value)}
            disabled={false}
            placeholder="ex) 반복 작업 자동화로 작성 시간을 줄이고 일관성을 높임"
            style={{ ...inputStyle, minHeight: 84 }}
          />
        );
      case "target":
        return (
          <div style={choiceGroupStyle}>
            {TARGET_OPTIONS.map((option) => (
              <label key={option.value} style={choiceLabelStyle}>
                <input
                  type="checkbox"
                  checked={data.target.includes(option.value)}
                  onChange={() => toggleMultiValue("target", option.value)}
                  disabled={false}
                />
                {option.label}
              </label>
            ))}
          </div>
        );
      case "as_is":
        return (
          <textarea
            value={data.as_is}
            onChange={(e) => update("as_is", e.target.value)}
            disabled={false}
            placeholder="ex) 게시글 초안 작성 시간이 오래 걸리고 톤 일관성이 떨어짐"
            style={{ ...inputStyle, minHeight: 84 }}
          />
        );
      case "result_state":
        return (
          <div style={choiceGroupStyle}>
            {RESULT_STATE_OPTIONS.map((option) => (
              <label key={option.value} style={choiceLabelStyle}>
                <input
                  type="radio"
                  name="result_state"
                  checked={data.result_state === option.value}
                  onChange={() => update("result_state", option.value)}
                  disabled={false}
                />
                {option.label}
              </label>
            ))}
          </div>
        );
      case "ai_task_types":
        return (
          <div style={choiceGroupStyle}>
            {AI_TASK_TYPE_OPTIONS.map((option) => (
              <label key={option.value} style={choiceLabelStyle}>
                <input
                  type="checkbox"
                  checked={data.ai_task_types.includes(option.value)}
                  onChange={() =>
                    update(
                      "ai_task_types",
                      data.ai_task_types.includes(option.value)
                        ? data.ai_task_types.filter((v) => v !== option.value)
                        : [...data.ai_task_types, option.value]
                    )
                  }
                  disabled={false}
                />
                {option.label}
              </label>
            ))}
          </div>
        );
      case "no_ai_alternative":
        return (
          <textarea
            value={data.no_ai_alternative_detail}
            onChange={(e) => update("no_ai_alternative_detail", e.target.value)}
            disabled={false}
            placeholder="ex) 템플릿 기반 수동 작성"
            style={{ ...inputStyle, minHeight: 84 }}
          />
        );
      case "exposure":
        return (
          <div style={choiceGroupStyle}>
            {EXPOSURE_OPTIONS.map((option) => (
              <label key={option.value} style={choiceLabelStyle}>
                <input
                  type="radio"
                  name="exposure"
                  checked={data.exposure === option.value}
                  onChange={() => update("exposure", option.value)}
                  disabled={false}
                />
                {option.label}
              </label>
            ))}
          </div>
        );
      case "reversibility":
        return (
          <div style={choiceGroupStyle}>
            {REVERSIBILITY_OPTIONS.map((option) => (
              <label key={option.value} style={choiceLabelStyle}>
                <input
                  type="radio"
                  name="reversibility"
                  checked={data.reversibility === option.value}
                  onChange={() => update("reversibility", option.value)}
                  disabled={false}
                />
                {option.label}
              </label>
            ))}
          </div>
        );
      case "impact":
        return (
          <div style={choiceGroupStyle}>
            {IMPACT_OPTIONS.map((option) => (
              <label key={option.value} style={choiceLabelStyle}>
                <input
                  type="radio"
                  name="impact"
                  checked={data.impact === option.value}
                  onChange={() => update("impact", option.value)}
                  disabled={false}
                />
                {option.label}
              </label>
            ))}
          </div>
        );
      case "hitl":
        return (
          <div style={choiceGroupStyle}>
            {HITL_OPTIONS.map((option) => (
              <label key={option.value} style={choiceLabelStyle}>
                <input
                  type="radio"
                  name="hitl"
                  checked={data.hitl === option.value}
                  onChange={() => update("hitl", option.value)}
                  disabled={false}
                />
                {option.label}
              </label>
            ))}
          </div>
        );
      case "kpi":
        return (
          <textarea
            value={data.kpi}
            onChange={(e) => update("kpi", e.target.value)}
            disabled={false}
            placeholder="ex) 작성 시간 10% 단축 → 발행 빈도 증가"
            style={{ ...inputStyle, minHeight: 84 }}
          />
        );
      default:
        return null;
    }
  }

  function handleSave() {
    if (!id) return;
    setStep1Data(id, data);
    setStep2Data(id, generateStep2Data(data));
    addHistoryEvent(id, {
      stage: "step1",
      action: HISTORY_EVENT_TYPES.SAVE_STEP1,
      detail: "STEP1 저장",
    });
    addHistoryEvent(id, {
      stage: "step1",
      action: HISTORY_EVENT_TYPES.SET_EXPOSURE,
      detail: `노출 범위=${data.exposure || "미정"}`,
    });
    addHistoryEvent(id, {
      stage: "step1",
      action: HISTORY_EVENT_TYPES.SET_REVERSIBILITY,
      detail: `되돌림 가능성=${data.reversibility || "미정"}`,
    });
    addHistoryEvent(id, {
      stage: "step1",
      action: HISTORY_EVENT_TYPES.SET_IMPACT,
      detail: `실패 비용 위치=${data.impact || "미정"}`,
    });
    addHistoryEvent(id, {
      stage: "step1",
      action: HISTORY_EVENT_TYPES.SET_HITL,
      detail: `인간 개입 시점=${data.hitl || "미정"}`,
    });
    addHistoryEvent(id, {
      stage: "step2",
      action: HISTORY_EVENT_TYPES.GENERATE_STEP2_DRAFT,
      detail: "STEP1 저장으로 STEP2 초안 자동 갱신",
    });
    setSavedDataSnapshot(data);
    setSavedNotesSnapshot(tableNotes);
    setSavedRowOrderSnapshot(rowOrder);
    setMessage("STEP1 저장 완료 (STEP2 초안 자동 갱신)");
  }

  function handleFreeze() {
    if (!id) return;
    if (!freezeReady && !GUIDED_TEST_MODE) {
      setMessage(`확정 불가: 필수 항목 ${missingForFreeze.length}개를 채워주세요.`);
      return;
    }
    setStep1Data(id, data);
    setStep2Data(id, generateStep2Data(data));
    setProgress(id, { step1Frozen: true, step2Completed: false, step3Completed: false });
    addHistoryEvent(id, {
      stage: "step2",
      action: HISTORY_EVENT_TYPES.REGENERATE_STEP2_FROM_STEP1,
      detail: "STEP1 확정으로 STEP2 초안 재생성(기존 STEP2 덮어쓰기)",
    });
    addHistoryEvent(id, {
      stage: "step1",
      action: HISTORY_EVENT_TYPES.FREEZE_STEP1,
      detail: frozen ? "STEP1 재확정 완료" : "STEP1 확정 완료",
    });
    setSavedDataSnapshot(data);
    setSavedNotesSnapshot(tableNotes);
    setSavedRowOrderSnapshot(rowOrder);
    setFrozen(true);
    if (!freezeReady && GUIDED_TEST_MODE) {
      setMessage(
        `GUIDED 테스트 모드로 확정되었습니다. (${missingForFreeze.length}개 미입력) STEP2 초안은 현재 입력 기준으로 재생성되었습니다.`
      );
      router.push(`/project/${id}/execution`);
      return;
    }
    setMessage(frozen ? "STEP1 재확정 완료 (변경 반영)" : "STEP1 확정 완료 (다음 단계 열림)");
    router.push(`/project/${id}/execution`);
  }

  return (
    <div ref={twoPaneRef} className="two-pane" style={twoPaneStyle}>
      <section style={mainPanelStyle}>
        <p style={subtleStyle}>전략 입력을 고정하고 운영 감당선(4축)을 선언하면 다음 단계가 열립니다.</p>
        <p style={warningInlineStyle}>STEP1을 다시 확정하면 STEP2 초안은 재생성되어 기존 수정 내용이 덮어써질 수 있습니다.</p>

        <div style={headerRowStyle}>
          <div style={modeSwitchWrapStyle}>
            <button
              type="button"
              aria-label={`작성 방식 전환: 현재 ${inputMode === "table" ? "표작성" : "폼작성"}`}
              onClick={() => setInputMode((prev) => (prev === "table" ? "form" : "table"))}
              style={modeToggleStyle}
            >
              <span
                style={{
                  ...modeToggleOptionStyle,
                  ...(inputMode === "table" ? modeToggleOptionActiveStyle : {}),
                }}
              >
                표작성
              </span>
              <span
                style={{
                  ...modeToggleOptionStyle,
                  ...(inputMode === "form" ? modeToggleOptionActiveStyle : {}),
                }}
              >
                폼작성
              </span>
            </button>
          </div>
          <div style={headerActionStyle}>
            <button
              onClick={handleSave}
              disabled={!isDirty}
              style={{
                ...buttonStyle,
                color: isDirty ? "#2563eb" : "#6b7280",
                borderColor: isDirty ? "#93c5fd" : "#d6dbe2",
                background: isDirty ? "#eff6ff" : "#f8fafc",
                cursor: !isDirty ? "not-allowed" : "pointer",
                opacity: !isDirty ? 0.7 : 1,
              }}
            >
              저장
            </button>
            <button
              onClick={handleFreeze}
              disabled={GUIDED_TEST_MODE ? false : !freezeReady || (frozen && !isDirty)}
              style={buttonStyle}
            >
              확정하기
            </button>
          </div>
        </div>

        {inputMode === "form" && (
          <>
            <div style={blockStyle}>
              <div style={formHeaderRowStyle}>
                <div style={formHeadFieldStyle}>Field</div>
                <div style={formHeadValueStyle}>Value</div>
                <div style={formHeadNoteStyle}>Note</div>
              </div>
              {tableRows.map((row) => {
                const isRelated = highlightedRowIds.has(row.id);
                const isDraggingThis = dragRowId === row.id;
                const dropBefore = dropRowId === row.id && dropPosition === "before";
                const dropAfter = dropRowId === row.id && dropPosition === "after";
                return (
                  <div
                    key={`form-${row.id}`}
                    style={{
                      ...questionRowStyle,
                      background: isDraggingThis ? "#f8fafc" : isRelated ? "#f8fbff" : undefined,
                      boxShadow: isRelated ? "inset 3px 0 0 #60a5fa" : undefined,
                      borderTop: dropBefore ? "2px solid #3b82f6" : questionRowStyle.borderTop,
                      borderBottom: dropAfter ? "2px solid #3b82f6" : undefined,
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                      const pos: "before" | "after" = e.clientY < rect.top + rect.height / 2 ? "before" : "after";
                      setDropRowId(row.id);
                      setDropPosition(pos);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (!dragRowId || !dropRowId) return;
                      moveRow(dragRowId, dropRowId, dropPosition);
                      setDropRowId(null);
                      setDragRowId(null);
                      setMessage("행 순서가 변경되었습니다.");
                    }}
                    onDragLeave={() => setDropRowId(null)}
                  >
                    <div style={questionLabelStyle}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <button
                          type="button"
                          draggable
                          style={rowDragHandleStyle}
                          onDragStart={(e) => {
                            e.dataTransfer.effectAllowed = "move";
                            e.dataTransfer.setData("text/plain", row.id);
                            setDragRowId(row.id);
                          }}
                          onDragEnd={() => {
                            setDragRowId(null);
                            setDropRowId(null);
                          }}
                          title="드래그해서 행 순서 변경"
                        >
                          ≡
                        </button>
                        <span>{row.field}</span>
                      </div>
                    </div>
                    <div style={questionInputStyle}>{renderFormInputByRowId(row.id)}</div>
                    <div style={formNoteCellStyle}>
                      <textarea
                        value={row.note || ""}
                        onChange={(e) => updateTableNote(row.id, e.target.value)}
                        style={formNoteInputStyle}
                        placeholder={getNotePlaceholderByRowId(row.id)}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {inputMode === "table" && (
          <div
            ref={sheetRef}
            tabIndex={0}
            onKeyDown={handleSheetKeyDown}
            onCopy={handleSheetCopy}
            onPaste={handleSheetPaste}
            style={sheetWrapStyle}
          >
            <div style={sheetHeaderRowStyle}>
              <div style={sheetHeadFieldStyle}>Field</div>
              <div style={sheetHeadValueStyle}>Value</div>
              <div style={sheetHeadNoteStyle}>Note</div>
            </div>
            {tableRows.map((row, rowIndex) => {
              const isRelated = highlightedRowIds.has(row.id);
              const isFieldSelected = isCellInSelection(rowIndex, 0);
              const isValueSelected = isCellInSelection(rowIndex, 1);
              const isNoteSelected = isCellInSelection(rowIndex, 2);
              const isFieldActive = activeCell?.row === rowIndex && activeCell.col === 0;
              const isValueActive = activeCell?.row === rowIndex && activeCell.col === 1;
              const isNoteActive = activeCell?.row === rowIndex && activeCell.col === 2;
              const isDraggingThis = dragRowId === row.id;
              const dropBefore = dropRowId === row.id && dropPosition === "before";
              const dropAfter = dropRowId === row.id && dropPosition === "after";
              return (
              <div
                key={row.id}
                style={{
                  ...sheetDataRowStyle,
                  background: isDraggingThis ? "#f8fafc" : isRelated ? "#f8fbff" : "#fff",
                  boxShadow: isRelated ? "inset 3px 0 0 #60a5fa" : undefined,
                  borderTop: dropBefore ? "2px solid #3b82f6" : undefined,
                  borderBottom: dropAfter ? "2px solid #3b82f6" : sheetDataRowStyle.borderBottom,
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                  const pos: "before" | "after" = e.clientY < rect.top + rect.height / 2 ? "before" : "after";
                  setDropRowId(row.id);
                  setDropPosition(pos);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (!dragRowId || !dropRowId) return;
                  moveRow(dragRowId, dropRowId, dropPosition);
                  setDropRowId(null);
                  setDragRowId(null);
                  setMessage("행 순서가 변경되었습니다.");
                }}
                onDragLeave={() => {
                  setDropRowId(null);
                }}
              >
                <div
                  style={{
                    ...sheetFieldCellStyle,
                    cursor: "cell",
                    background: isFieldSelected ? "#eaf2ff" : undefined,
                    boxShadow: isFieldActive ? "inset 0 0 0 1px #93c5fd" : undefined,
                  }}
                  onMouseDown={(e) => {
                    if (isEditableTarget(e.target)) return;
                    e.preventDefault();
                    startCellSelection(rowIndex, 0);
                  }}
                  onMouseEnter={() => extendCellSelection(rowIndex, 0)}
                >
                  <button
                    type="button"
                    draggable
                    style={rowDragHandleStyle}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                    }}
                    onDragStart={(e) => {
                      e.stopPropagation();
                      e.dataTransfer.effectAllowed = "move";
                      e.dataTransfer.setData("text/plain", row.id);
                      setDragRowId(row.id);
                    }}
                    onDragEnd={() => {
                      setDragRowId(null);
                      setDropRowId(null);
                    }}
                    title="드래그해서 행 순서 변경"
                  >
                    ≡
                  </button>
                  <div>{row.field}</div>
                </div>
                <div
                  style={{
                    ...sheetValueCellStyle,
                    background: isValueSelected ? "#eaf2ff" : undefined,
                    boxShadow: isValueActive ? "inset 0 0 0 1px #93c5fd" : undefined,
                  }}
                  onMouseDown={(e) => {
                    if (isEditableTarget(e.target)) return;
                    e.preventDefault();
                    startCellSelection(rowIndex, 1);
                  }}
                  onMouseEnter={() => extendCellSelection(rowIndex, 1)}
                >
                  {editingRowId === row.id ? (
                    row.id === "ai_task_types" || row.id === "target" ? (
                      <div style={sheetDropdownWrapStyle}>
                        <button
                          type="button"
                          style={sheetDropdownTriggerStyle}
                          onMouseDown={(e) => e.stopPropagation()}
                        >
                          <span
                            style={{
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                              color: row.value ? "#1f2937" : "#9ca3af",
                            }}
                          >
                            {row.value || "선택"}
                          </span>
                          <svg
                            viewBox="0 0 20 20"
                            aria-hidden="true"
                            style={sheetDropdownChevronStyle}
                          >
                            <path d="M5.5 7.5L10 12l4.5-4.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </button>
                        <div style={sheetDropdownMenuStyle} onMouseDown={(e) => e.stopPropagation()}>
                          {(row.id === "target" ? TARGET_OPTIONS : AI_TASK_TYPE_OPTIONS).map((option) => {
                            const checked = row.id === "target"
                              ? data.target.includes(option.value as Step1Target)
                              : data.ai_task_types.includes(option.value as Step1AiTaskType);
                            return (
                              <label key={option.value} style={sheetMultiOptionItemStyle}>
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => {
                                    if (row.id === "target") {
                                      update(
                                        "target",
                                        checked
                                          ? data.target.filter((v) => v !== (option.value as Step1Target))
                                          : [...data.target, option.value as Step1Target]
                                      );
                                      return;
                                    }
                                    update(
                                      "ai_task_types",
                                      checked
                                        ? data.ai_task_types.filter((v) => v !== (option.value as Step1AiTaskType))
                                        : [...data.ai_task_types, option.value as Step1AiTaskType]
                                    );
                                  }}
                                />
                                <span>{option.label}</span>
                              </label>
                            );
                          })}
                          <button
                            type="button"
                            style={sheetMultiDoneButtonStyle}
                            onClick={() => setEditingRowId(null)}
                          >
                            완료
                          </button>
                        </div>
                      </div>
                    ) : getSingleSelectOptionsByRowId(row.id) ? (
                      <div style={sheetDropdownWrapStyle}>
                        <button
                          type="button"
                          style={sheetDropdownTriggerStyle}
                          onMouseDown={(e) => e.stopPropagation()}
                        >
                          <span
                            style={{
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                              color: getSingleValueByRowId(row.id, data) ? "#1f2937" : "#9ca3af",
                            }}
                          >
                            {(() => {
                              const current = getSingleValueByRowId(row.id, data);
                              const options = getSingleSelectOptionsByRowId(row.id) ?? [];
                              const selected = options.find((o) => o.value === current);
                              return selected?.label ?? "선택";
                            })()}
                          </span>
                          <svg
                            viewBox="0 0 20 20"
                            aria-hidden="true"
                            style={sheetDropdownChevronStyle}
                          >
                            <path d="M5.5 7.5L10 12l4.5-4.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </button>
                        <div style={sheetDropdownMenuStyle} onMouseDown={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            style={sheetDropdownOptionStyle}
                            onClick={() => {
                              updateTableCell(row.id, "");
                              setEditingRowId(null);
                            }}
                          >
                            선택
                          </button>
                          {(getSingleSelectOptionsByRowId(row.id) ?? []).map((option) => {
                            const selected = getSingleValueByRowId(row.id, data) === option.value;
                            return (
                              <button
                                key={option.value}
                                type="button"
                                style={{
                                  ...sheetDropdownOptionStyle,
                                  ...(selected ? sheetDropdownOptionActiveStyle : {}),
                                }}
                                onClick={() => {
                                  updateTableCell(row.id, option.value);
                                  setEditingRowId(null);
                                }}
                              >
                                {option.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      <textarea
                        autoFocus
                        value={row.value}
                        onChange={(e) => updateTableCell(row.id, e.target.value)}
                        onBlur={() => setEditingRowId(null)}
                        disabled={false}
                        style={sheetValueInputStyle}
                        placeholder={getValueExampleByRowId(row.id)}
                      />
                    )
                  ) : (
                    <div
                      style={sheetValueDisplayStyle}
                      onDoubleClick={() => {
                        setEditingRowId(row.id);
                      }}
                      title="더블클릭 또는 Enter로 편집"
                    >
                      {getSingleSelectOptionsByRowId(row.id) || row.id === "ai_task_types" || row.id === "target" ? (
                        <div style={sheetValueSelectDisplayStyle}>
                          <span style={row.value ? undefined : sheetValuePlaceholderStyle}>{row.value || "선택"}</span>
                          <svg viewBox="0 0 20 20" aria-hidden="true" style={sheetDropdownChevronStyle}>
                            <path d="M5.5 7.5L10 12l4.5-4.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </div>
                      ) : row.value ? (
                        row.value
                      ) : (
                        <span style={sheetValuePlaceholderStyle}>
                          {getValueExampleByRowId(row.id)}
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <div
                  style={{
                    ...sheetNoteCellStyle,
                    background: isNoteSelected ? "#eaf2ff" : undefined,
                    boxShadow: isNoteActive ? "inset 0 0 0 1px #93c5fd" : undefined,
                  }}
                  onMouseDown={(e) => {
                    if (isEditableTarget(e.target)) return;
                    e.preventDefault();
                    startCellSelection(rowIndex, 2);
                  }}
                  onMouseEnter={() => extendCellSelection(rowIndex, 2)}
                >
                  <textarea
                    value={row.note || ""}
                    onChange={(e) => updateTableNote(row.id, e.target.value)}
                    style={sheetNoteInputStyle}
                    placeholder={getNotePlaceholderByRowId(row.id)}
                  />
                </div>
              </div>
            );
            })}
          </div>
        )}

        {message && <p style={{ ...subtleStyle, marginTop: 10 }}>{message}</p>}
      </section>

      <div
        className="pane-resizer"
        onMouseDown={() => setIsResizing(true)}
        title="드래그해서 오른쪽 패널 크기 조절"
        style={resizerStyle}
      />

      <aside className="right-pane" style={{ ...sidePanelStyle, width: rightPanelWidth }}>
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
            프리뷰
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
            <p style={{ ...subtleStyle, marginTop: 8 }}>입력값이 구조로 실시간 반영됩니다.</p>
            <Step1PreviewPanel
              data={data}
              activeRowId={activePreviewRowId}
              activeArea={activePreviewArea}
              onAreaClick={setActivePreviewArea}
            />
          </>
        )}

        {rightPanelTab === "impact" && (
          <div style={{ marginTop: 10, border: "1px solid #e5e7eb", borderRadius: 8, padding: 12, background: "#f8fafc" }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>영향도맵</div>
            <p style={{ ...subtleStyle, marginTop: 6 }}>영향도맵 상세 내용은 다음 단계에서 추가 예정입니다.</p>
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
      `}</style>
    </div>
  );
}

function PreviewSection({
  title,
  children,
  isLast = false,
  active = false,
  onClick,
  badge,
}: {
  title: string;
  children: React.ReactNode;
  isLast?: boolean;
  active?: boolean;
  onClick?: () => void;
  badge?: { bg: string; fg: string; border: string };
}) {
  return (
    <section
      onClick={onClick}
      style={{
        ...previewSectionStyle,
        borderBottom: isLast ? "none" : previewSectionStyle.borderBottom,
        background: active ? "#f8fbff" : undefined,
        boxShadow: active ? "inset 3px 0 0 #60a5fa" : undefined,
        cursor: onClick ? "pointer" : "default",
      }}
    >
      <div style={previewSectionTitleStyle}>
        {badge ? (
          <span style={{ ...previewBadgeStyle, background: badge.bg, color: badge.fg, borderColor: badge.border }}>{title}</span>
        ) : (
          title
        )}
      </div>
      <div style={previewSectionBodyStyle}>{children}</div>
    </section>
  );
}

function PreviewItem({ label, value }: { label: string; value: string }) {
  return (
    <div style={previewItemStyle}>
      <div style={previewItemLabelStyle}>{label}</div>
      <div style={previewItemValueStyle}>{value}</div>
    </div>
  );
}

const panelStyle: CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 12,
  background: "#fcfcfd",
  padding: 16,
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
  position: "sticky",
  top: 12,
  height: "calc(100vh - 24px)",
  minHeight: 0,
  overflowY: "auto",
  overscrollBehavior: "contain",
};

const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: 34,
  fontWeight: 700,
  letterSpacing: "-0.02em",
  color: "#1f2937",
};

const headerRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  marginTop: 12,
};

const headerActionStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  flexShrink: 0,
};

const subtleStyle: CSSProperties = {
  margin: 0,
  color: "#6b7280",
  fontSize: 15,
};

const warningInlineStyle: CSSProperties = {
  margin: "8px 0 0",
  color: "#92400e",
  background: "#fffbeb",
  border: "1px solid #fde68a",
  borderRadius: 8,
  padding: "8px 10px",
  fontSize: 13,
};

const modeSwitchWrapStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
};

const modeToggleStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  border: "1px solid #d1d5db",
  borderRadius: 999,
  background: "#f8fafc",
  padding: 3,
  cursor: "pointer",
};

const modeToggleOptionStyle: CSSProperties = {
  borderRadius: 999,
  padding: "5px 10px",
  fontSize: 12,
  fontWeight: 700,
  color: "#6b7280",
  background: "transparent",
};

const modeToggleOptionActiveStyle: CSSProperties = {
  background: "#111827",
  color: "#ffffff",
};

const topPanelTabStyle: CSSProperties = {
  borderWidth: 1,
  borderStyle: "solid",
  borderRadius: 8,
  fontSize: 12,
  fontWeight: 700,
  padding: "6px 12px",
  cursor: "pointer",
};

const blockStyle: CSSProperties = {
  marginTop: 14,
  border: "1px solid #e5e7eb",
  borderRadius: 10,
  background: "#fff",
  overflow: "hidden",
};

const sheetWrapStyle: CSSProperties = {
  marginTop: 14,
  border: "1px solid #cbd5e1",
  borderRadius: 10,
  overflow: "hidden",
  background: "#fff",
  outline: "none",
};

const sheetHeaderRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "260px minmax(0, 1fr) 200px",
  background: "#f3f4f6",
  borderBottom: "1px solid #bfc9d9",
  fontSize: 12,
  fontWeight: 700,
  color: "#374151",
};

const sheetHeadFieldStyle: CSSProperties = {
  padding: "10px 12px",
  borderRight: "1px solid #e5e7eb",
};

const sheetHeadValueStyle: CSSProperties = {
  padding: "10px 12px",
  borderRight: "1px solid #e5e7eb",
};

const sheetHeadNoteStyle: CSSProperties = {
  padding: "10px 12px",
};

const sheetDataRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "260px minmax(0, 1fr) 200px",
  borderBottom: "1px solid #eef2f7",
};

const sheetFieldCellStyle: CSSProperties = {
  padding: "10px 12px",
  borderRight: "1px solid #e5e7eb",
  fontSize: 13,
  fontWeight: 600,
  color: "#374151",
  display: "flex",
  alignItems: "flex-start",
  gap: 8,
};

const sheetValueCellStyle: CSSProperties = {
  padding: 0,
  borderRight: "1px solid #e5e7eb",
};

const sheetNoteCellStyle: CSSProperties = {
  padding: "10px 12px",
  fontSize: 12,
  color: "#6b7280",
};

const sheetNoteInputStyle: CSSProperties = {
  width: "100%",
  minHeight: 52,
  border: "none",
  outline: "none",
  resize: "vertical",
  background: "transparent",
  fontSize: 13,
  lineHeight: 1.45,
  color: "#374151",
  fontFamily: "inherit",
};

const sheetValueInputStyle: CSSProperties = {
  width: "100%",
  minHeight: 88,
  border: "none",
  outline: "none",
  resize: "vertical",
  padding: "10px 12px",
  fontSize: 14,
  color: "#1f2937",
  background: "#fff",
  fontFamily: "inherit",
};

const sheetValueDisplayStyle: CSSProperties = {
  minHeight: 52,
  padding: "10px 12px",
  fontSize: 14,
  color: "#1f2937",
  whiteSpace: "pre-wrap",
  lineHeight: 1.5,
  cursor: "cell",
};

const sheetValuePlaceholderStyle: CSSProperties = {
  color: "#9ca3af",
};

const sheetValueSelectDisplayStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
  minHeight: 44,
  border: "1px solid #e7edf4",
  borderRadius: 12,
  padding: "10px 14px",
  background: "#fff",
};

const sheetSelectStyle: CSSProperties = {
  width: "100%",
  minHeight: 52,
  border: "none",
  outline: "none",
  padding: "10px 12px",
  fontSize: 14,
  color: "#1f2937",
  background: "#fff",
  fontFamily: "inherit",
};

const sheetDropdownWrapStyle: CSSProperties = {
  position: "relative",
  width: "100%",
  minHeight: 52,
  padding: "6px 8px",
  background: "#fff",
};

const sheetDropdownTriggerStyle: CSSProperties = {
  width: "100%",
  minHeight: 44,
  border: "1px solid #e7edf4",
  borderRadius: 12,
  background: "#fff",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "10px 14px",
  fontSize: 14,
  color: "#1f2937",
  textAlign: "left",
  cursor: "pointer",
};

const sheetDropdownChevronStyle: CSSProperties = {
  width: 14,
  height: 14,
  color: "#64748b",
  opacity: 0.5,
  marginLeft: 8,
  flexShrink: 0,
};

const sheetDropdownMenuStyle: CSSProperties = {
  position: "absolute",
  top: 56,
  left: 8,
  right: 8,
  border: "1px solid #cbd5e1",
  borderRadius: 14,
  background: "#fff",
  boxShadow: "0 16px 30px rgba(15, 23, 42, 0.14)",
  padding: 10,
  display: "grid",
  gap: 6,
  zIndex: 20,
};

const sheetDropdownOptionStyle: CSSProperties = {
  border: "1px solid transparent",
  borderRadius: 10,
  background: "transparent",
  textAlign: "left",
  padding: "12px 14px",
  fontSize: 14,
  color: "#1f2937",
  cursor: "pointer",
};

const sheetDropdownOptionActiveStyle: CSSProperties = {
  background: "#dbeafe",
  color: "#1d4ed8",
  fontWeight: 700,
  borderColor: "#93c5fd",
};

const sheetMultiOptionItemStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  borderRadius: 8,
  padding: "8px 10px",
  fontSize: 14,
  color: "#1f2937",
};

const sheetMultiDoneButtonStyle: CSSProperties = {
  border: "1px solid #d1d5db",
  borderRadius: 8,
  background: "#f8fafc",
  color: "#374151",
  fontSize: 13,
  fontWeight: 600,
  padding: "7px 10px",
  cursor: "pointer",
  justifySelf: "end",
};

const rowDragHandleStyle: CSSProperties = {
  border: "none",
  borderRadius: 6,
  background: "transparent",
  color: "#9ca3af",
  cursor: "grab",
  fontSize: 14,
  fontWeight: 700,
  lineHeight: 1,
  padding: "2px 4px",
  marginTop: 0,
  alignSelf: "center",
  flexShrink: 0,
};

const blockTitleStyle: CSSProperties = {
  fontSize: 14,
  fontWeight: 700,
  color: "#111827",
  padding: "10px 12px",
  background: "#f8fafc",
  borderBottom: "1px solid #e5e7eb",
};

const questionRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "240px minmax(0, 1fr) 200px",
  gap: 12,
  padding: "12px",
  borderTop: "1px solid #f1f5f9",
};

const formHeaderRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "240px minmax(0, 1fr) 200px",
  background: "#f3f4f6",
  borderTop: "1px solid #e5e7eb",
  borderBottom: "1px solid #e5e7eb",
  fontSize: 12,
  fontWeight: 700,
  color: "#374151",
};

const formHeadFieldStyle: CSSProperties = {
  padding: "10px 12px",
  borderRight: "1px solid #d1d5db",
};

const formHeadValueStyle: CSSProperties = {
  padding: "10px 12px",
  borderRight: "1px solid #d1d5db",
};

const formHeadNoteStyle: CSSProperties = {
  padding: "10px 12px",
};

const questionLabelStyle: CSSProperties = {
  display: "grid",
  fontSize: 14,
  fontWeight: 700,
  color: "#374151",
  paddingTop: 8,
};

const questionInputStyle: CSSProperties = {
  display: "grid",
  gap: 8,
};

const formNoteCellStyle: CSSProperties = {
  borderLeft: "1px solid #f1f5f9",
  paddingLeft: 12,
  minWidth: 0,
};

const formNoteInputStyle: CSSProperties = {
  width: "100%",
  minHeight: 72,
  border: "none",
  outline: "none",
  resize: "vertical",
  background: "transparent",
  fontSize: 13,
  lineHeight: 1.45,
  color: "#374151",
  fontFamily: "inherit",
};

const choiceGroupStyle: CSSProperties = {
  display: "grid",
  gap: 8,
};

const choiceLabelStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "center",
  fontSize: 14,
  color: "#374151",
};

const inputStyle: CSSProperties = {
  border: "none",
  borderRadius: 0,
  padding: "2px 0",
  fontSize: 15,
  color: "#374151",
  background: "transparent",
  width: "100%",
};

const buttonStyle: CSSProperties = {
  border: "1px solid #d6dbe2",
  borderRadius: 8,
  padding: "8px 12px",
  background: "#f8fafc",
  fontWeight: 600,
  color: "#374151",
  cursor: "pointer",
};

const resizerStyle: CSSProperties = {
  background: "transparent",
};

const previewFrameStyle: CSSProperties = {
  marginTop: 10,
  border: "1px solid #e5e7eb",
  borderRadius: 10,
  background: "#fff",
  overflow: "hidden",
};

const previewBadgeStyle: CSSProperties = {
  borderWidth: 1,
  borderStyle: "solid",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 700,
  lineHeight: 1.2,
  padding: "5px 10px",
};

const previewSectionStyle: CSSProperties = {
  borderBottom: "1px solid #e5e7eb",
};

const previewSectionTitleStyle: CSSProperties = {
  fontSize: 13,
  fontWeight: 800,
  padding: "10px 12px",
  color: "#1f2937",
  letterSpacing: "0.01em",
};

const previewSectionBodyStyle: CSSProperties = {
  padding: "0 12px 12px",
  display: "grid",
  gap: 8,
};

const previewItemStyle: CSSProperties = {
  display: "grid",
  gap: 3,
};

const previewItemLabelStyle: CSSProperties = {
  fontSize: 12,
  color: "#6b7280",
};

const previewItemValueStyle: CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: "#111827",
  whiteSpace: "pre-wrap",
  lineHeight: 1.4,
};

const previewFlowStyle: CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 8,
  padding: "8px 10px",
  background: "#f8fafc",
  fontSize: 13,
  color: "#1f2937",
  whiteSpace: "pre-wrap",
  lineHeight: 1.5,
};

const previewReasonStyle: CSSProperties = {
  fontSize: 12,
  color: "#6b7280",
  marginTop: 2,
};

const previewReasonListStyle: CSSProperties = {
  margin: 0,
  paddingLeft: 0,
  listStyle: "none",
  display: "grid",
  gap: 4,
  fontSize: 12,
  color: "#374151",
};
