"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { useParams } from "next/navigation";
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
  type Step1AiMinRole,
  type Step1Exposure,
  type Step1Hitl,
  type Step1Impact,
  type Step1NoAiAlternative,
  type Step1ResultState,
  type Step1Reversibility,
  type Step1Target,
} from "@/lib/prismMvp";

const TARGET_OPTIONS: Array<{ value: Step1Target; label: string }> = [
  { value: "internal_operator", label: "내부 운영자" },
  { value: "content_writer", label: "콘텐츠 작성자" },
  { value: "admin", label: "관리자" },
  { value: "general_user", label: "일반 사용자" },
  { value: "customer", label: "고객" },
];

const RESULT_STATE_OPTIONS: Array<{ value: Step1ResultState; label: string }> = [
  { value: "draft", label: "draft 저장" },
  { value: "status_change", label: "상태 변경" },
  { value: "external_publish", label: "외부 게시" },
  { value: "internal_reference", label: "내부 참고 자료" },
];

const AI_MIN_ROLE_OPTIONS: Array<{ value: Step1AiMinRole; label: string }> = [
  { value: "draft_only", label: "초안 생성까지만" },
  { value: "auto_publish", label: "자동 게시까지" },
];

const NO_AI_OPTIONS: Array<{ value: Step1NoAiAlternative; label: string }> = [
  { value: "manual", label: "수동 작성" },
  { value: "template", label: "템플릿 기반" },
  { value: "rule_based", label: "룰 기반 처리" },
  { value: "search_based", label: "검색 기반" },
  { value: "other", label: "기타" },
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
  { value: "medium", label: "고객 혼선" },
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
  medium: "고객 혼선",
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
  | "ai_min_role"
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

function getSingleSelectOptionsByRowId(rowId: Step1TableRowId) {
  switch (rowId) {
    case "target":
      return TARGET_OPTIONS;
    case "result_state":
      return RESULT_STATE_OPTIONS;
    case "ai_min_role":
      return AI_MIN_ROLE_OPTIONS;
    case "no_ai_alternative":
      return NO_AI_OPTIONS;
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
const AI_MIN_ROLE_LABEL_BY_VALUE: Record<Step1AiMinRole, string> = Object.fromEntries(AI_MIN_ROLE_OPTIONS.map((o) => [o.value, o.label])) as Record<Step1AiMinRole, string>;
const NO_AI_LABEL_BY_VALUE: Record<Step1NoAiAlternative, string> = Object.fromEntries(NO_AI_OPTIONS.map((o) => [o.value, o.label])) as Record<Step1NoAiAlternative, string>;
const RESULT_LABEL_BY_VALUE: Record<Step1ResultState, string> = Object.fromEntries(RESULT_STATE_OPTIONS.map((o) => [o.value, o.label])) as Record<Step1ResultState, string>;
const EXPOSURE_LABEL_BY_VALUE: Record<Step1Exposure, string> = Object.fromEntries(EXPOSURE_OPTIONS.map((o) => [o.value, o.label])) as Record<Step1Exposure, string>;
const REVERSIBILITY_LABEL_BY_VALUE: Record<Step1Reversibility, string> = Object.fromEntries(REVERSIBILITY_OPTIONS.map((o) => [o.value, o.label])) as Record<Step1Reversibility, string>;
const IMPACT_LABEL_BY_VALUE: Record<Step1Impact, string> = Object.fromEntries(IMPACT_OPTIONS.map((o) => [o.value, o.label])) as Record<Step1Impact, string>;
const HITL_LABEL_BY_VALUE: Record<Step1Hitl, string> = Object.fromEntries(HITL_OPTIONS.map((o) => [o.value, o.label])) as Record<Step1Hitl, string>;

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

function buildStep1TableRows(data: Step1Data): Step1TableRow[] {
  return [
    { id: "why", section: "전략", field: "왜 AI를 붙이나요", note: "", value: data.why },
    { id: "target", section: "전략", field: "누구를 위한 기능인가요", note: "폼 모드에서 복수 선택 가능", value: data.target[0] ? TARGET_LABEL_BY_VALUE[data.target[0]] : "" },
    { id: "as_is", section: "문제", field: "현재 어떤 문제가 있나요 (AS-IS)", note: "", value: data.as_is },
    { id: "result_state", section: "결과", field: "이 플로우가 끝나면 무엇이 남나요 (결과 상태)", note: "", value: data.result_state ? RESULT_LABEL_BY_VALUE[data.result_state] : "" },
    { id: "ai_min_role", section: "전략", field: "AI는 어디까지 맡나요 (최소 역할)", note: "", value: data.ai_min_role ? AI_MIN_ROLE_LABEL_BY_VALUE[data.ai_min_role] : "" },
    { id: "no_ai_alternative", section: "대안", field: "AI 없이 가능한 방법은 무엇인가요", note: "폼 모드에서 복수 선택 가능", value: data.no_ai_alternative[0] ? NO_AI_LABEL_BY_VALUE[data.no_ai_alternative[0]] : "" },
    { id: "exposure", section: "운영", field: "AI 결과가 외부에 공개되나요 (Exposure)", note: "", value: data.exposure ? EXPOSURE_LABEL_BY_VALUE[data.exposure] : "" },
    { id: "reversibility", section: "운영", field: "문제가 생기면 되돌릴 수 있나요 (Reversibility)", note: "", value: data.reversibility ? REVERSIBILITY_LABEL_BY_VALUE[data.reversibility] : "" },
    { id: "impact", section: "운영", field: "틀리면 가장 부담이 큰 곳은 어디인가요 (Impact)", note: "", value: data.impact ? IMPACT_LABEL_BY_VALUE[data.impact] : "" },
    { id: "hitl", section: "운영", field: "사람이 언제 한 번이라도 보게 되나요 (HITL)", note: "", value: data.hitl ? HITL_LABEL_BY_VALUE[data.hitl] : "" },
    { id: "kpi", section: "문제", field: "KPI / 성공 가설", note: "", value: data.kpi },
  ];
}

export default function ScreeningPage() {
  const params = useParams();
  const id = String(params?.id ?? "");

  const [data, setData] = useState<Step1Data>(getDefaultStep1());
  const [frozen, setFrozen] = useState(false);
  const [message, setMessage] = useState("");
  const [inputMode, setInputMode] = useState<InputMode>("table");
  const [rightPanelTab, setRightPanelTab] = useState<RightPanelTab>("preview");
  const [rightPanelWidth, setRightPanelWidth] = useState(360);
  const [isResizing, setIsResizing] = useState(false);
  const twoPaneRef = useRef<HTMLDivElement | null>(null);
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const [activeRowIndex, setActiveRowIndex] = useState<number | null>(null);
  const [selectionRange, setSelectionRange] = useState<{ start: number; end: number } | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const [editingRowId, setEditingRowId] = useState<Step1TableRowId | null>(null);

  useEffect(() => {
    if (!id) return;
    setData(getStep1Data(id));
    setFrozen(getProgress(id).step1Frozen);
  }, [id]);

  const riskLevel = useMemo(() => computeRisk(data), [data]);
  const freezeReady = canFreezeStep1(data);
  const missingForFreeze = useMemo(() => getMissingStep1RequiredFields(data), [data]);

  const autoDraft = true;
  const autoPublish = data.exposure !== "public" && data.impact !== "high";
  const manualReviewRequired = data.impact === "high" || data.hitl === "pre_review";
  const stateFlow = manualReviewRequired
    ? ["input", "generating", "draft", "review_required", "approved", "publish"]
    : ["input", "generating", "draft", "approved", "publish"];
  const targetSummary = data.target.length > 0 ? data.target.map((v) => TARGET_LABEL_BY_VALUE[v]).join(", ") : "미선택";
  const resultStateSummary = data.result_state ? `${RESULT_LABEL_BY_VALUE[data.result_state]} (${data.result_state.toUpperCase()})` : "미선택 (UNSET)";
  const kpiSummary = data.kpi.trim() || "미입력";
  const exposureSummary = data.exposure ? `${EXPOSURE_LABEL[data.exposure]} (${data.exposure.toUpperCase()})` : "미선택 (UNSET)";
  const reversibilitySummary = data.reversibility
    ? `${REVERSIBILITY_LABEL[data.reversibility]} (${data.reversibility.toUpperCase()})`
    : "미선택 (UNSET)";
  const impactSummary = data.impact ? `${IMPACT_LABEL[data.impact]} (${data.impact.toUpperCase()})` : "미선택 (UNSET)";
  const hitlSummary = data.hitl ? `${HITL_LABEL[data.hitl]} (${data.hitl.toUpperCase()})` : "미선택 (UNSET)";
  const riskReasons = [
    data.exposure === "public"
      ? "외부 공개 범위 (Exposure=PUBLIC)"
      : data.exposure === "limited_external"
        ? "제한적 고객 노출 (Exposure=LIMITED_EXTERNAL)"
        : "내부 노출 중심 (Exposure=INTERNAL)",
    data.hitl === "pre_review"
      ? "사전 검토 존재 (HITL=PRE_REVIEW)"
      : data.hitl === "post_monitoring"
        ? "사후 모니터링 기반 (HITL=POST_MONITORING)"
        : "인간 개입 없음 (HITL=NONE)",
    data.reversibility === "easy"
      ? "되돌림 가능 (Reversibility=EASY)"
      : data.reversibility === "limited"
        ? "부분 되돌림 가능 (Reversibility=LIMITED)"
        : "되돌림 어려움 (Reversibility=IRREVERSIBLE)",
  ];
  const tableRows = useMemo(() => buildStep1TableRows(data), [data]);
  const selectedIndices = useMemo(() => {
    if (!selectionRange) return [];
    const from = Math.min(selectionRange.start, selectionRange.end);
    const to = Math.max(selectionRange.start, selectionRange.end);
    return Array.from({ length: to - from + 1 }, (_, i) => from + i);
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
    if (frozen) return;
    setData((prev) => ({ ...prev, [key]: value }));
  }

  function toggleMultiValue<K extends "target" | "no_ai_alternative">(key: K, value: Step1Data[K][number]) {
    if (frozen) return;
    setData((prev) => {
      const current = prev[key] as string[];
      const exists = current.includes(value as string);
      const next = exists ? current.filter((v) => v !== value) : [...current, value as string];
      return { ...prev, [key]: next } as Step1Data;
    });
  }

  function updateTableCell(rowId: Step1TableRowId, rawValue: string) {
    if (frozen) return;
    setData((prev) => {
      switch (rowId) {
        case "why":
          return { ...prev, why: rawValue };
        case "target":
          return {
            ...prev,
            target: (() => {
              const single = parseSingleByOption(rawValue, TARGET_OPTIONS);
              return single ? [single] : [];
            })(),
          };
        case "as_is":
          return { ...prev, as_is: rawValue };
        case "result_state":
          return { ...prev, result_state: parseSingleByOption(rawValue, RESULT_STATE_OPTIONS) };
        case "ai_min_role":
          return { ...prev, ai_min_role: parseSingleByOption(rawValue, AI_MIN_ROLE_OPTIONS) };
        case "no_ai_alternative":
          return {
            ...prev,
            no_ai_alternative: (() => {
              const single = parseSingleByOption(rawValue, NO_AI_OPTIONS);
              return single ? [single] : [];
            })(),
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

  function startRowSelection(rowIndex: number) {
    setActiveRowIndex(rowIndex);
    setSelectionRange({ start: rowIndex, end: rowIndex });
    setIsSelecting(true);
    setEditingRowId(null);
    sheetRef.current?.focus();
  }

  function extendRowSelection(rowIndex: number) {
    if (!isSelecting || activeRowIndex === null) return;
    setSelectionRange({ start: activeRowIndex, end: rowIndex });
  }

  function copySelectedRowsToText() {
    const rowsToCopy = selectedIndices.length > 0 ? selectedIndices : activeRowIndex !== null ? [activeRowIndex] : [];
    if (rowsToCopy.length === 0) return null;
    const header = "Field\tValue\tNote";
    return {
      text: [
        header,
        ...rowsToCopy.map((idx) => {
          const row = tableRows[idx];
          if (!row) return "";
          return [row.field, row.value, row.note ?? ""].join("\t");
        }),
      ].join("\n"),
      count: rowsToCopy.length,
    };
  }

  function applyPasteByRows(startIndex: number, text: string) {
    const lines = text
      .split(/\r?\n/)
      .map((line) => {
        const cols = line.split("\t").map((c) => c.trim());
        if (cols.length >= 2) return cols[1] ?? "";
        return cols[0] ?? "";
      })
      .filter((line) => line.length > 0);
    if (lines.length === 0) return;

    for (let i = 0; i < lines.length; i += 1) {
      const rowIndex = startIndex + i;
      if (rowIndex >= tableRows.length) break;
      updateTableCell(tableRows[rowIndex].id, lines[i]);
    }
    const endIndex = Math.min(startIndex + lines.length - 1, tableRows.length - 1);
    setSelectionRange({ start: startIndex, end: endIndex });
    setActiveRowIndex(startIndex);
    setMessage(`붙여넣기 완료: ${endIndex - startIndex + 1}행`);
  }

  function isEditableTarget(target: EventTarget | null) {
    if (!(target instanceof HTMLElement)) return false;
    return Boolean(target.closest("textarea, input, select, option"));
  }

  function handleSheetCopy(e: React.ClipboardEvent<HTMLDivElement>) {
    if (inputMode !== "table") return;
    if (isEditableTarget(e.target)) return;
    const copied = copySelectedRowsToText();
    if (!copied) return;
    e.preventDefault();
    e.clipboardData.setData("text/plain", copied.text);
    setMessage(`값 ${copied.count}행 복사 완료`);
  }

  function handleSheetPaste(e: React.ClipboardEvent<HTMLDivElement>) {
    if (inputMode !== "table") return;
    if (isEditableTarget(e.target)) return;
    if (activeRowIndex === null) return;
    e.preventDefault();
    const text = e.clipboardData.getData("text/plain");
    applyPasteByRows(activeRowIndex, text);
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
      setActiveRowIndex(0);
      setSelectionRange({ start: 0, end: tableRows.length - 1 });
      setMessage("표 전체 행 선택");
    }
    if (e.key === "Enter" && activeRowIndex !== null && !frozen) {
      e.preventDefault();
      setEditingRowId(tableRows[activeRowIndex]?.id ?? null);
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
    setMessage("STEP1 저장 완료 (STEP2 초안 자동 갱신)");
  }

  function handleFreeze() {
    if (!id || frozen) return;
    if (!freezeReady) {
      setMessage(`Freeze 불가: 필수 항목 ${missingForFreeze.length}개를 채워주세요.`);
      return;
    }
    setStep1Data(id, data);
    setProgress(id, { step1Frozen: true });
    addHistoryEvent(id, {
      stage: "step1",
      action: HISTORY_EVENT_TYPES.FREEZE_STEP1,
      detail: "STEP1 Freeze 완료",
    });
    setFrozen(true);
    setMessage("STEP1 Freeze 완료 (수정 잠금)");
  }

  return (
    <div ref={twoPaneRef} className="two-pane" style={twoPaneStyle}>
      <section style={mainPanelStyle}>
        <p style={subtleStyle}>전략 입력을 고정하고 운영 감당선(4축)을 선언하면 다음 단계가 열립니다.</p>

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
            <button onClick={handleSave} disabled={frozen} style={buttonStyle}>
              저장
            </button>
            <button onClick={handleFreeze} disabled={frozen || !freezeReady} style={buttonStyle}>
              Freeze
            </button>
            {frozen && <span style={{ ...subtleStyle, alignSelf: "center" }}>🔒 Frozen</span>}
          </div>
        </div>

        {inputMode === "form" && (
          <>
            <div style={blockStyle}>
              <div style={blockTitleStyle}>STEP1 질문 순서</div>
              <QuestionRow question="왜 AI를 붙이나요">
                <textarea
                  value={data.why}
                  onChange={(e) => update("why", e.target.value)}
                  disabled={frozen}
                  placeholder="반복 작업 자동화, 시간 단축, 비용 절감, 일관성 확보"
                  style={{ ...inputStyle, minHeight: 84 }}
                />
              </QuestionRow>
              <QuestionRow question="누구를 위한 기능인가요">
                <div style={choiceGroupStyle}>
                  {TARGET_OPTIONS.map((option) => (
                    <label key={option.value} style={choiceLabelStyle}>
                      <input
                        type="checkbox"
                        checked={data.target.includes(option.value)}
                        onChange={() => toggleMultiValue("target", option.value)}
                        disabled={frozen}
                      />
                      {option.label}
                    </label>
                  ))}
                </div>
              </QuestionRow>
              <QuestionRow question="현재 어떤 문제인가요 (AS-IS)">
                <textarea
                  value={data.as_is}
                  onChange={(e) => update("as_is", e.target.value)}
                  disabled={frozen}
                  style={{ ...inputStyle, minHeight: 84 }}
                />
              </QuestionRow>
              <QuestionRow question="이 플로우가 끝나면 무엇이 남나요 (결과 상태)">
                <div style={choiceGroupStyle}>
                  {RESULT_STATE_OPTIONS.map((option) => (
                    <label key={option.value} style={choiceLabelStyle}>
                      <input
                        type="radio"
                        name="result_state"
                        checked={data.result_state === option.value}
                        onChange={() => update("result_state", option.value)}
                        disabled={frozen}
                      />
                      {option.label}
                    </label>
                  ))}
                </div>
              </QuestionRow>
              <QuestionRow question="AI는 어디까지 맡나요 (최소 역할)">
                <div style={choiceGroupStyle}>
                  {AI_MIN_ROLE_OPTIONS.map((option) => (
                    <label key={option.value} style={choiceLabelStyle}>
                      <input
                        type="radio"
                        name="ai_min_role"
                        checked={data.ai_min_role === option.value}
                        onChange={() => update("ai_min_role", option.value)}
                        disabled={frozen}
                      />
                      {option.label}
                    </label>
                  ))}
                </div>
              </QuestionRow>
              <QuestionRow question="AI 없이 가능한 대안이 있나요">
                <div style={choiceGroupStyle}>
                  {NO_AI_OPTIONS.map((option) => (
                    <label key={option.value} style={choiceLabelStyle}>
                      <input
                        type="checkbox"
                        checked={data.no_ai_alternative.includes(option.value)}
                        onChange={() => toggleMultiValue("no_ai_alternative", option.value)}
                        disabled={frozen}
                      />
                      {option.label}
                    </label>
                  ))}
                </div>
              </QuestionRow>
              <QuestionRow question="AI 결과가 외부에 공개되나요 (Exposure)">
                <div style={choiceGroupStyle}>
                  {EXPOSURE_OPTIONS.map((option) => (
                    <label key={option.value} style={choiceLabelStyle}>
                      <input
                        type="radio"
                        name="exposure"
                        checked={data.exposure === option.value}
                        onChange={() => update("exposure", option.value)}
                        disabled={frozen}
                      />
                      {option.label}
                    </label>
                  ))}
                </div>
              </QuestionRow>
              <QuestionRow question="문제가 생기면 되돌릴 수 있나요 (Reversibility)">
                <div style={choiceGroupStyle}>
                  {REVERSIBILITY_OPTIONS.map((option) => (
                    <label key={option.value} style={choiceLabelStyle}>
                      <input
                        type="radio"
                        name="reversibility"
                        checked={data.reversibility === option.value}
                        onChange={() => update("reversibility", option.value)}
                        disabled={frozen}
                      />
                      {option.label}
                    </label>
                  ))}
                </div>
              </QuestionRow>
              <QuestionRow question="틀리면 가장 부담이 큰 곳은 어디인가요 (Impact)">
                <div style={choiceGroupStyle}>
                  {IMPACT_OPTIONS.map((option) => (
                    <label key={option.value} style={choiceLabelStyle}>
                      <input
                        type="radio"
                        name="impact"
                        checked={data.impact === option.value}
                        onChange={() => update("impact", option.value)}
                        disabled={frozen}
                      />
                      {option.label}
                    </label>
                  ))}
                </div>
              </QuestionRow>
              <QuestionRow question="사람이 언제 한번이라도 보게되나요 (HITL)">
                <div style={choiceGroupStyle}>
                  {HITL_OPTIONS.map((option) => (
                    <label key={option.value} style={choiceLabelStyle}>
                      <input
                        type="radio"
                        name="hitl"
                        checked={data.hitl === option.value}
                        onChange={() => update("hitl", option.value)}
                        disabled={frozen}
                      />
                      {option.label}
                    </label>
                  ))}
                </div>
              </QuestionRow>
              <QuestionRow question="KPI / 성공 가설">
                <textarea
                  value={data.kpi}
                  onChange={(e) => update("kpi", e.target.value)}
                  disabled={frozen}
                  style={{ ...inputStyle, minHeight: 84 }}
                />
              </QuestionRow>
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
              const isSelected = selectedIndices.includes(rowIndex);
              const isActive = activeRowIndex === rowIndex;
              return (
              <div
                key={row.id}
                style={{
                  ...sheetDataRowStyle,
                  background: isSelected ? "#eaf2ff" : "#fff",
                  boxShadow: isActive ? "inset 0 0 0 1px #93c5fd" : undefined,
                }}
                onMouseDown={(e) => {
                  if (isEditableTarget(e.target)) return;
                  e.preventDefault();
                  startRowSelection(rowIndex);
                }}
                onMouseEnter={() => extendRowSelection(rowIndex)}
              >
                <div
                  style={{ ...sheetFieldCellStyle, cursor: "cell" }}
                >
                  <div>{row.field}</div>
                </div>
                <div style={sheetValueCellStyle}>
                  {editingRowId === row.id ? (
                    getSingleSelectOptionsByRowId(row.id) ? (
                      <select
                        autoFocus
                        disabled={frozen}
                        value={
                          row.id === "target"
                            ? data.target[0] ?? ""
                            : row.id === "result_state"
                              ? data.result_state
                              : row.id === "ai_min_role"
                                ? data.ai_min_role
                              : row.id === "no_ai_alternative"
                                ? data.no_ai_alternative[0] ?? ""
                                : row.id === "exposure"
                                  ? data.exposure
                                  : row.id === "reversibility"
                                    ? data.reversibility
                                    : row.id === "impact"
                                      ? data.impact
                                      : data.hitl
                        }
                        onChange={(e) => updateTableCell(row.id, e.target.value)}
                        onBlur={() => setEditingRowId(null)}
                        style={sheetSelectStyle}
                      >
                        <option value="">선택</option>
                        {getSingleSelectOptionsByRowId(row.id)?.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <textarea
                        autoFocus
                        value={row.value}
                        onChange={(e) => updateTableCell(row.id, e.target.value)}
                        onBlur={() => setEditingRowId(null)}
                        disabled={frozen}
                        style={sheetValueInputStyle}
                        placeholder="입력"
                      />
                    )
                  ) : (
                    <div
                      style={sheetValueDisplayStyle}
                      onDoubleClick={() => {
                        if (frozen) return;
                        setEditingRowId(row.id);
                      }}
                      title="더블클릭 또는 Enter로 편집"
                    >
                      {row.value || "입력"}
                    </div>
                  )}
                </div>
                <div style={sheetNoteCellStyle}>{row.note || ""}</div>
              </div>
            );
            })}
          </div>
        )}

        {!frozen && missingForFreeze.length > 0 && (
          <p style={{ ...subtleStyle, marginTop: 8 }}>
            Freeze 전 필수 입력: {missingForFreeze.join(", ")}
          </p>
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
            <div style={previewFrameStyle}>
              <PreviewSection title="[STRATEGY]">
                <PreviewItem label="목적 (Purpose)" value={data.why.trim() || "미입력"} />
                <PreviewItem label="대상 사용자 (Target)" value={targetSummary} />
                <PreviewItem label="결과 상태 (Result State)" value={resultStateSummary} />
                <PreviewItem label="성공 가설 (KPI Hypothesis)" value={kpiSummary} />
              </PreviewSection>

              <PreviewSection title="[OPERATIONAL POLICY]">
                <PreviewItem label="노출 범위 (Exposure)" value={exposureSummary} />
                <PreviewItem label="되돌림 가능성 (Reversibility)" value={reversibilitySummary} />
                <PreviewItem label="실패 비용 위치 (Impact)" value={impactSummary} />
                <PreviewItem label="인간 개입 시점 (HITL)" value={hitlSummary} />
              </PreviewSection>

              <PreviewSection title="[AUTOMATION BOUNDARY]">
                <PreviewItem label="초안 자동 생성 (Draft Generation)" value={autoDraft ? "ENABLED" : "DISABLED"} />
                <PreviewItem label="자동 게시 (Auto Publish)" value={autoPublish ? "ENABLED" : "DISABLED"} />
                <PreviewItem label="사전 검토 단계 (Pre Review)" value={manualReviewRequired ? "REQUIRED" : "NOT REQUIRED"} />
                <PreviewItem label="조건부 자동 승인 (Conditional Auto Approve)" value={autoPublish ? "ALLOWED" : "NOT ALLOWED"} />
              </PreviewSection>

              <PreviewSection title="[STATE FLOW]">
                <div style={previewFlowStyle}>{stateFlow.map((node) => (node === stateFlow[0] ? node : `-> ${node}`)).join("\n")}</div>
              </PreviewSection>

              <PreviewSection title="[RISK PROFILE]" isLast>
                <PreviewItem label="Calculated Risk Level" value={riskLevel.toUpperCase()} />
                <div style={previewReasonStyle}>근거:</div>
                <ul style={previewReasonListStyle}>
                  {riskReasons.map((reason) => (
                    <li key={reason}>- {reason}</li>
                  ))}
                </ul>
              </PreviewSection>
            </div>
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

function QuestionRow({ question, children }: { question: string; children: React.ReactNode }) {
  return (
    <div style={questionRowStyle}>
      <div style={questionLabelStyle}>
        <div>{question}</div>
      </div>
      <div style={questionInputStyle}>{children}</div>
    </div>
  );
}

function PreviewSection({ title, children, isLast = false }: { title: string; children: React.ReactNode; isLast?: boolean }) {
  return (
    <section style={{ ...previewSectionStyle, borderBottom: isLast ? "none" : previewSectionStyle.borderBottom }}>
      <div style={previewSectionTitleStyle}>{title}</div>
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
  border: "1px solid #d1d5db",
  borderRadius: 10,
  overflow: "hidden",
  background: "#fff",
  outline: "none",
};

const sheetHeaderRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "260px minmax(0, 1fr) 200px",
  background: "#f3f4f6",
  borderBottom: "1px solid #d1d5db",
  fontSize: 12,
  fontWeight: 700,
  color: "#374151",
};

const sheetHeadFieldStyle: CSSProperties = {
  padding: "10px 12px",
  borderRight: "1px solid #d1d5db",
};

const sheetHeadValueStyle: CSSProperties = {
  padding: "10px 12px",
  borderRight: "1px solid #d1d5db",
};

const sheetHeadNoteStyle: CSSProperties = {
  padding: "10px 12px",
};

const sheetDataRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "260px minmax(0, 1fr) 200px",
  borderBottom: "1px solid #e5e7eb",
};

const sheetFieldCellStyle: CSSProperties = {
  padding: "10px 12px",
  borderRight: "1px solid #e5e7eb",
  fontSize: 13,
  fontWeight: 600,
  color: "#374151",
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
  gridTemplateColumns: "240px minmax(0, 1fr)",
  gap: 12,
  padding: "12px",
  borderTop: "1px solid #f1f5f9",
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
  border: "1px solid #d6dbe2",
  borderRadius: 8,
  padding: "10px 12px",
  fontSize: 15,
  color: "#374151",
  background: "#f9fafb",
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
