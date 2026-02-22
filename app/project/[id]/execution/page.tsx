"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  addHistoryEvent,
  generateStep3Policy,
  HISTORY_EVENT_TYPES,
  getDefaultStep1,
  getDefaultPolicy,
  getProgress,
  getStep1Data,
  getStep3Policy,
  getStep2Data,
  getStep2MissingFields,
  setProgress,
  setStep2Data,
  setStep3Policy,
  type Step1Data,
  type Step2Data,
} from "@/lib/prismMvp";
import Step1PreviewPanel, { type Step1PreviewAreaKey } from "../_components/Step1PreviewPanel";

type Step2FieldKey =
  | "status_model"
  | "user_flow"
  | "ai_intervention"
  | "system_process"
  | "human_control"
  | "failure_strategy"
  | "delivery_mode"
  | "data_storage"
  | "log_fields"
  | "cost_strategy";

type RowOrderPosition = "before" | "after";
type SheetColIndex = 0 | 1 | 2;
type SheetCell = { row: number; col: SheetColIndex };

const STEP2_FIELDS: Array<{ key: Step2FieldKey; label: string }> = [
  { key: "user_flow", label: "사용자는 어떤 순서로 기능을 이용하나요" },
  { key: "ai_intervention", label: "그 순서 중에서, AI가 실행되는 순간은" },
  { key: "human_control", label: "AI 결과는 바로 확정되나요, 아니면 사람이 한 번 더 확인하나요" },
  { key: "delivery_mode", label: "사용자는 결과를 이렇게 확인해요" },
  { key: "status_model", label: "사용자가 끝났다고 느끼는 순간까지, 화면 몇 번 바꿀건지" },
  { key: "system_process", label: "버튼 누르면 서버 어떻게 처리할건지" },
  { key: "failure_strategy", label: "AI 실패하면 처리는" },
  { key: "data_storage", label: "기능 한 번 돌릴 때, DB에 뭐 남길까요" },
  { key: "log_fields", label: "이슈 터지면, 우리가 뭘 보고 원인 찾을 건지" },
  { key: "cost_strategy", label: "모델 사용이랑 비용은 어뜨케 할까요" },
];

const STEP2_DEFAULT_ORDER: Step2FieldKey[] = STEP2_FIELDS.map((f) => f.key);
const STEP2_LEGACY_DEFAULT_ORDER: Step2FieldKey[] = [
  "user_flow",
  "ai_intervention",
  "human_control",
  "status_model",
  "system_process",
  "failure_strategy",
  "delivery_mode",
  "data_storage",
  "log_fields",
  "cost_strategy",
];

const STEP2_HELPER_TEXT: Record<Step2FieldKey, string> = {
  user_flow: "[사용자 흐름]\n사용자가 실제로 클릭하는 순서를 처음부터 끝까지 적어요.\n이 순서가 기준이 되고, 이후 AI 실행과 승인 위치가 여기에 올라가요.",
  ai_intervention: "[AI 개입 위치]\n위에서 적은 단계 중 하나에 AI 실행 지점을 표시해요.\n자동 실행인지, 버튼 실행인지 구분해요.\n이 위치가 모호하면 의도하지 않은 자동 동작이 생길 수 있어요.",
  human_control: "[최종 승인/통제 지점]\nAI 실행 다음 단계에서 사람이 개입하는 위치를 적어요.\n승인이 필요한 지점이 있으면 책임&통제 범위가 정리돼요.",
  delivery_mode: "[결과 노출 기준]\n결과가 언제, 어떤 상태에서 화면에 노출되는지 적어요.\n저장 완료 전 노출인지, 저장 후 노출인지 구분해요.",
  status_model: "[상태 구조]\n이 기능이 시작에서 종료까지 어떤 상태를 거치는지 적어요.\n시작 상태와 종료 상태를 명확히 해야 저장·승인·실패 흐름이 충돌하지 않아요.",
  system_process:
    "[처리 로직 순서]\n사용자 행동 뒤에서 어떤 순서로 처리되는지 적어요.\n검증 먼저 할 건지,\nAI 호출은 어디서 할 건지,\n저장은 언제 할 건지,\n상태 변경은 저장 전에 할 건지 후에 할 건지 정해요.\n이 순서 안 정하면 구현에서 해석이 갈릴 수 있어요",
  failure_strategy:
    "[예외/실패 처리 기준]\n재시도 몇 번?\n실패하면 화면은 어떻게 보여줄 건지?\n수동 전환 버튼 줄 건지?\n중복 저장 안 생기게 할 건지?\n\n이거 안 정하면 나중에 운영에서 케어 하면 돼요",
  data_storage:
    "[저장 구조]\n초안 원문 저장할지,\n수정 이력 버전으로 남길지,\nconfidence 저장할지,\n승인 상태도 같이 저장할건지\n이거 정하면 나중에 왜 이렇게 됐는지 추적 가능하긴 해요.",
  log_fields:
    "[로그/추적 기준]\n모델 버전 남길지,\n호출 시간, latency 남길지,\n에러 코드 남길지,\n요청 ID로 묶을 건지,\n로그 기준 없으면 장애 나면 감으로 대응 해야돼요.",
  cost_strategy:
    "[모델 호출 통제 기준]\n특정 조건에서 고급 모델 쓸건지\n호출 제한 둘건지\n자동 게시 막는 기준 잡을지\n토큰 길이 기준 분기할지\n기준 없이 호출 늘어나면, 나중에 비용 늘어날 수 있어요.",
};

const PREVIEW_TO_STEP2_FIELDS: Record<Step1PreviewAreaKey, Step2FieldKey[]> = {
  strategy: ["user_flow", "delivery_mode", "data_storage"],
  policy: ["system_process", "human_control", "failure_strategy"],
  automation: ["ai_intervention", "human_control", "user_flow"],
  state_flow: ["status_model", "user_flow"],
  risk_profile: ["failure_strategy", "log_fields", "cost_strategy"],
};

export default function ExecutionPage() {
  const params = useParams();
  const router = useRouter();
  const id = String(params?.id ?? "");

  const [locked, setLocked] = useState(true);
  const [draft, setDraft] = useState<Step2Data | null>(null);
  const [step1, setStep1] = useState<Step1Data>(getDefaultStep1());
  const [message, setMessage] = useState("");
  const [rightPanelTab, setRightPanelTab] = useState<"preview" | "impact">("preview");
  const [activePreviewArea, setActivePreviewArea] = useState<Step1PreviewAreaKey | null>(null);
  const [rowOrder, setRowOrder] = useState<Step2FieldKey[]>(STEP2_DEFAULT_ORDER);
  const [dragRowId, setDragRowId] = useState<Step2FieldKey | null>(null);
  const [dropRowId, setDropRowId] = useState<Step2FieldKey | null>(null);
  const [dropPosition, setDropPosition] = useState<RowOrderPosition>("after");
  const [activeCell, setActiveCell] = useState<SheetCell | null>(null);
  const [selectionRange, setSelectionRange] = useState<{ start: SheetCell; end: SheetCell } | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const [editingRowId, setEditingRowId] = useState<Step2FieldKey | null>(null);
  const [editingNoteRowId, setEditingNoteRowId] = useState<Step2FieldKey | null>(null);
  const [rightPanelWidth, setRightPanelWidth] = useState(360);
  const [isResizing, setIsResizing] = useState(false);
  const twoPaneRef = useRef<HTMLDivElement | null>(null);
  const sheetRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!id) return;
    const progress = getProgress(id);
    const canAccess = progress.step1Frozen;
    setLocked(!canAccess);

    if (!canAccess) {
      router.replace(`/project/${id}/screening`);
      return;
    }

    const loadedStep1 = getStep1Data(id);
    const existing = getStep2Data(id);
    setStep1(loadedStep1);
    setDraft(existing);

    try {
      const raw = localStorage.getItem(`prism:mvp:${id}:step2:row-order`);
      if (!raw) {
        setRowOrder(STEP2_DEFAULT_ORDER);
      } else {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) {
          setRowOrder(STEP2_DEFAULT_ORDER);
        } else {
          const defaultOrder = STEP2_DEFAULT_ORDER;
          const normalized = [
            ...parsed.filter((k): k is Step2FieldKey => defaultOrder.includes(k)),
            ...defaultOrder.filter((k) => !parsed.includes(k)),
          ];
          const isLegacyDefault =
            normalized.length === STEP2_LEGACY_DEFAULT_ORDER.length &&
            normalized.every((k, idx) => k === STEP2_LEGACY_DEFAULT_ORDER[idx]);
          setRowOrder(isLegacyDefault ? STEP2_DEFAULT_ORDER : normalized);
        }
      }
    } catch {
      setRowOrder(STEP2_DEFAULT_ORDER);
    }
  }, [id, router]);

  useEffect(() => {
    if (!id || rowOrder.length === 0) return;
    try {
      localStorage.setItem(`prism:mvp:${id}:step2:row-order`, JSON.stringify(rowOrder));
    } catch {
      // ignore localStorage errors
    }
  }, [id, rowOrder]);

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

  function handleSave() {
    if (!id || locked || !draft) return false;
    if (getStep2MissingFields(draft).length > 0) {
      const missing = getStep2MissingFields(draft);
      setMessage(`저장 불가: 필수 항목을 완료하세요 (${missing.length}개 누락).`);
      return false;
    }
    setStep2Data(id, draft);
    const step1 = getStep1Data(id);
    const existingStep3 = getStep3Policy(id);
    const generatedStep3 = generateStep3Policy(step1, draft);
    const mergedStep3 = {
      ...generatedStep3,
      ...existingStep3,
      reviewed: { ...getDefaultPolicy().reviewed, ...(existingStep3.reviewed ?? {}) },
    };
    const step3Keys: Array<keyof Omit<typeof generatedStep3, "reviewed">> = [
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
    ];
    for (const key of step3Keys) {
      if (!String(existingStep3[key] ?? "").trim()) {
        mergedStep3[key] = generatedStep3[key];
      }
    }
    const progressBefore = getProgress(id);
    setStep3Policy(id, mergedStep3);
    setProgress(id, { step2Completed: true });
    addHistoryEvent(id, {
      stage: "step2",
      action: HISTORY_EVENT_TYPES.SAVE_STEP2,
      detail: "STEP2 설계 초안 저장",
    });
    if (!progressBefore.step2Completed) {
      addHistoryEvent(id, {
        stage: "step2",
        action: HISTORY_EVENT_TYPES.COMPLETE_STEP2,
        detail: "STEP2 완료 상태로 전환",
      });
    }
    addHistoryEvent(id, {
      stage: "step3",
      action: HISTORY_EVENT_TYPES.GENERATE_STEP3_POLICY,
      detail: "STEP2 저장을 기반으로 STEP3 정책 초안 자동 생성/병합",
    });
    setMessage("STEP2 저장 완료");
    return true;
  }

  function handleConfirm() {
    const saved = handleSave();
    if (!saved) return;
    setMessage("STEP2 확정 완료");
  }

  function updateField(key: Step2FieldKey, value: string) {
    setDraft((prev) =>
      prev
        ? {
            ...prev,
            [key]: value,
            reviewed: {
              ...prev.reviewed,
              [key]: value.trim().length > 0,
            },
          }
        : prev
    );
  }

  function updateNote(key: Step2FieldKey, value: string) {
    setDraft((prev) =>
      prev
        ? {
            ...prev,
            notes: {
              ...prev.notes,
              [key]: value,
            },
          }
        : prev
    );
  }

  function moveRow(dragId: Step2FieldKey, targetId: Step2FieldKey, pos: RowOrderPosition) {
    setRowOrder((prev) => {
      const current = prev.length > 0 ? prev : STEP2_DEFAULT_ORDER;
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

  const missing = draft ? getStep2MissingFields(draft) : [];
  const complete = draft ? missing.length === 0 : false;
  const highlightedFields = new Set<Step2FieldKey>(activePreviewArea ? PREVIEW_TO_STEP2_FIELDS[activePreviewArea] : []);
  const fieldMap = new Map(STEP2_FIELDS.map((f) => [f.key, f]));
  const orderedFields = [
    ...rowOrder.map((key) => fieldMap.get(key)).filter((f): f is { key: Step2FieldKey; label: string } => Boolean(f)),
    ...STEP2_FIELDS.filter((f) => !rowOrder.includes(f.key)),
  ];
  const selectedBounds = useMemo(() => {
    if (!selectionRange) return null;
    return {
      rowMin: Math.min(selectionRange.start.row, selectionRange.end.row),
      rowMax: Math.max(selectionRange.start.row, selectionRange.end.row),
      colMin: Math.min(selectionRange.start.col, selectionRange.end.col) as SheetColIndex,
      colMax: Math.max(selectionRange.start.col, selectionRange.end.col) as SheetColIndex,
    };
  }, [selectionRange]);

  function isEditableTarget(target: EventTarget | null) {
    if (!(target instanceof HTMLElement)) return false;
    return Boolean(target.closest("textarea, input, select, option"));
  }

  function startCellSelection(row: number, col: SheetColIndex) {
    const cell: SheetCell = { row, col };
    setActiveCell(cell);
    setSelectionRange({ start: cell, end: cell });
    setIsSelecting(true);
    setEditingRowId(null);
    setEditingNoteRowId(null);
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

  function getCellText(field: { key: Step2FieldKey; label: string }, col: SheetColIndex): string {
    if (!draft) return "";
    if (col === 0) return field.label;
    if (col === 1) return draft[field.key];
    return draft.notes[field.key];
  }

  function copySelectedCellsToText() {
    if (!draft) return null;
    if (!selectedBounds && !activeCell) return null;
    const rowMin = selectedBounds?.rowMin ?? activeCell?.row ?? 0;
    const rowMax = selectedBounds?.rowMax ?? activeCell?.row ?? 0;
    const colMin = selectedBounds?.colMin ?? (activeCell?.col ?? 0);
    const colMax = selectedBounds?.colMax ?? (activeCell?.col ?? 0);
    const lines: string[] = [];
    for (let r = rowMin; r <= rowMax; r += 1) {
      const row = orderedFields[r];
      if (!row) continue;
      const cols: string[] = [];
      for (let c = colMin; c <= colMax; c += 1) {
        cols.push(normalizeCellForClipboard(getCellText(row, c as SheetColIndex)));
      }
      lines.push(cols.join("\t"));
    }
    return { text: lines.join("\n"), count: lines.length };
  }

  function normalizeCellForClipboard(value: string) {
    return value
      .replace(/\r?\n/g, " ")
      .replace(/\t/g, " ")
      .replace(/\s{2,}/g, " ")
      .trim();
  }

  function applyPasteByCells(start: SheetCell, text: string) {
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.split("\t").map((c) => c.trim()))
      .filter((cols) => cols.some((v) => v.length > 0));
    if (lines.length === 0) return;

    let updatedCells = 0;
    for (let r = 0; r < lines.length; r += 1) {
      const rowIndex = start.row + r;
      if (rowIndex >= orderedFields.length) break;
      const row = orderedFields[rowIndex];
      if (!row) continue;
      for (let c = 0; c < lines[r].length; c += 1) {
        const colIndex = start.col + c;
        if (colIndex === 1) {
          updateField(row.key, lines[r][c]);
          updatedCells += 1;
        }
        if (colIndex === 2) {
          updateNote(row.key, lines[r][c]);
          updatedCells += 1;
        }
      }
    }

    const end: SheetCell = {
      row: Math.min(start.row + lines.length - 1, orderedFields.length - 1),
      col: Math.min(start.col + ((lines[0]?.length ?? 1) - 1), 2) as SheetColIndex,
    };
    setSelectionRange({ start, end });
    setActiveCell(start);
    setMessage(`붙여넣기 완료: ${updatedCells}셀`);
  }

  function handleSheetCopy(e: React.ClipboardEvent<HTMLDivElement>) {
    if (isEditableTarget(e.target)) return;
    const copied = copySelectedCellsToText();
    if (!copied) return;
    e.preventDefault();
    e.clipboardData.setData("text/plain", copied.text);
    setMessage(`값 ${copied.count}행 복사 완료`);
  }

  function handleSheetPaste(e: React.ClipboardEvent<HTMLDivElement>) {
    if (isEditableTarget(e.target)) return;
    if (!activeCell) return;
    e.preventDefault();
    const text = e.clipboardData.getData("text/plain");
    applyPasteByCells(activeCell, text);
  }

  function handleSheetKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const target = e.target as HTMLElement;
    const tag = target.tagName.toLowerCase();
    if (tag === "textarea" || tag === "input" || tag === "select") return;

    const cmd = e.metaKey || e.ctrlKey;
    if (!cmd) return;
    if (e.key.toLowerCase() === "a") {
      e.preventDefault();
      if (orderedFields.length === 0) return;
      setActiveCell({ row: 0, col: 0 });
      setSelectionRange({ start: { row: 0, col: 0 }, end: { row: orderedFields.length - 1, col: 2 } });
      setMessage("표 전체 셀 선택");
    }
    if (e.key === "Enter" && activeCell) {
      e.preventDefault();
      if (activeCell.col === 1) {
        setEditingRowId(orderedFields[activeCell.row]?.key ?? null);
      }
    }
  }

  return (
    <div ref={twoPaneRef} className="two-pane" style={twoPaneStyle}>
      <section style={mainPanelStyle}>
        <h1 style={{ ...titleStyle, display: "none" }}>STEP 2 설계 초안</h1>

        {locked && (
          <div style={lockStyle}>
            🔒 STEP1 확정 전에는 접근할 수 없습니다.
          </div>
        )}

        <p style={subtleStyle}>
          동작 방식을 구체화해요.
          <br />
          사용자 흐름, 상태 변경, 승인 지점, 실패 대응까지 정의된 1차 실행 설계 초안을 만들어요.
        </p>
        <p style={warningInlineStyle}>STEP1을 다시 확정하면 STEP2 초안은 재생성되어 기존 수정 내용이 덮어써질 수 있습니다.</p>
        <div style={topActionRowStyle}>
          <button onClick={handleSave} disabled={locked || !complete} style={buttonStyle}>
            저장
          </button>
          <button onClick={handleConfirm} disabled={locked || !complete} style={buttonStyle}>
            확정하기
          </button>
        </div>

        {draft && (
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
            {orderedFields.map((field, rowIndex) => {
              const highlighted = highlightedFields.has(field.key);
              const isFieldSelected = isCellInSelection(rowIndex, 0);
              const isValueSelected = isCellInSelection(rowIndex, 1);
              const isNoteSelected = isCellInSelection(rowIndex, 2);
              const isFieldActive = activeCell?.row === rowIndex && activeCell.col === 0;
              const isValueActive = activeCell?.row === rowIndex && activeCell.col === 1;
              const isNoteActive = activeCell?.row === rowIndex && activeCell.col === 2;
              return (
                <div
                  key={field.key}
                  style={{
                    ...sheetDataRowStyle,
                    background: highlighted ? "#f8fbff" : "#fff",
                    boxShadow: highlighted ? "inset 3px 0 0 #60a5fa" : undefined,
                    ...(dropRowId === field.key && dropPosition === "before" ? { borderTop: "2px solid #3b82f6" } : {}),
                    ...(dropRowId === field.key && dropPosition === "after" ? { borderBottom: "2px solid #3b82f6" } : {}),
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                    const pos: RowOrderPosition = e.clientY < rect.top + rect.height / 2 ? "before" : "after";
                    setDropRowId(field.key);
                    setDropPosition(pos);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (!dragRowId || !dropRowId) return;
                    moveRow(dragRowId, dropRowId, dropPosition);
                    setDropRowId(null);
                    setDragRowId(null);
                    setMessage("STEP2 행 순서가 변경되었습니다.");
                  }}
                  onDragLeave={() => setDropRowId(null)}
                >
                  <div
                    style={{
                      ...sheetFieldCellStyle,
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
                      onDragStart={(e) => {
                        e.dataTransfer.effectAllowed = "move";
                        e.dataTransfer.setData("text/plain", field.key);
                        setDragRowId(field.key);
                      }}
                      onDragEnd={() => {
                        setDragRowId(null);
                        setDropRowId(null);
                      }}
                      title="드래그해서 행 순서 변경"
                    >
                      ≡
                    </button>
                    <div>{field.label}</div>
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
                    {editingRowId === field.key && !locked ? (
                      <textarea
                        autoFocus
                        value={draft[field.key]}
                        onChange={(e) => updateField(field.key, e.target.value)}
                        onBlur={() => setEditingRowId(null)}
                        style={sheetValueInputStyle}
                      />
                    ) : (
                      <div
                        style={sheetValueDisplayStyle}
                        onDoubleClick={() => {
                          if (!locked) setEditingRowId(field.key);
                        }}
                        title={locked ? "잠금 상태" : "더블클릭 또는 Enter로 편집"}
                      >
                        {draft[field.key] || <span style={sheetValuePlaceholderStyle}>입력</span>}
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
                    {editingNoteRowId === field.key && !locked ? (
                      <textarea
                        autoFocus
                        value={draft.notes[field.key]}
                        onChange={(e) => updateNote(field.key, e.target.value)}
                        onBlur={() => setEditingNoteRowId(null)}
                        style={sheetNoteInputStyle}
                        placeholder={STEP2_HELPER_TEXT[field.key]}
                      />
                    ) : (
                      <div
                        style={sheetNoteDisplayStyle}
                        onDoubleClick={() => {
                          if (!locked) setEditingNoteRowId(field.key);
                        }}
                        title={locked ? "잠금 상태" : "더블클릭으로 편집"}
                      >
                        {draft.notes[field.key] || <span style={sheetNotePlaceholderStyle}>{STEP2_HELPER_TEXT[field.key]}</span>}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {!locked && (
          <p style={{ ...subtleStyle, marginTop: 10 }}>
            완료 조건: 필수 항목 10개 입력 ({complete ? "충족" : "미충족"})
          </p>
        )}

        {message && <p style={{ ...subtleStyle, marginTop: 8 }}>{message}</p>}
      </section>

      <div
        className="pane-resizer"
        onMouseDown={() => setIsResizing(true)}
        title="드래그해서 오른쪽 패널 크기 조절"
        style={resizerStyle}
      />

      <aside className="right-pane" style={{ ...sidePanelStyle, width: rightPanelWidth }}>
        <h2 style={{ margin: 0, fontSize: 16 }}>우측 패널</h2>
        <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
          <button
            type="button"
            onClick={() => setRightPanelTab("preview")}
            style={{ ...topPanelTabStyle, background: rightPanelTab === "preview" ? "#111827" : "#f3f4f6", color: rightPanelTab === "preview" ? "#fff" : "#374151", borderColor: rightPanelTab === "preview" ? "#111827" : "#d1d5db" }}
          >
            Preview
          </button>
          <button
            type="button"
            onClick={() => setRightPanelTab("impact")}
            style={{ ...topPanelTabStyle, background: rightPanelTab === "impact" ? "#111827" : "#f3f4f6", color: rightPanelTab === "impact" ? "#fff" : "#374151", borderColor: rightPanelTab === "impact" ? "#111827" : "#d1d5db" }}
          >
            영향도맵
          </button>
        </div>

        {rightPanelTab === "preview" && (
          <>
            <p style={{ ...subtleStyle, marginTop: 8 }}>
              GUIDED 모드에서는 STEP1 확정 후 STEP2/3/4 탭에 접근할 수 있습니다.
            </p>
            <Step1PreviewPanel data={step1} activeArea={activePreviewArea} onAreaClick={setActivePreviewArea} />
            {!locked && missing.length > 0 && (
              <div style={{ marginTop: 10, border: "1px solid #e5e7eb", borderRadius: 8, padding: 10, background: "#f8fafc" }}>
                <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>누락 항목</div>
                {missing.map((m) => (
                  <div key={m} style={{ ...subtleStyle, fontSize: 12, marginTop: 4 }}>
                    • {m}
                  </div>
                ))}
              </div>
            )}
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

const panelStyle: CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 12,
  background: "#fff",
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
  fontSize: 22,
  fontWeight: 800,
};

const subtleStyle: CSSProperties = {
  margin: 0,
  color: "#6b7280",
  fontSize: 13,
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
  gridTemplateColumns: "240px minmax(0, 1fr) 300px",
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
  gridTemplateColumns: "240px minmax(0, 1fr) 300px",
  borderBottom: "1px solid #eef2f7",
  minHeight: 92,
};

const sheetFieldCellStyle: CSSProperties = {
  padding: "10px 12px",
  borderRight: "1px solid #e5e7eb",
  fontSize: 13,
  fontWeight: 700,
  color: "#374151",
  display: "flex",
  alignItems: "center",
  gap: 8,
};

const sheetValueCellStyle: CSSProperties = {
  borderRight: "1px solid #e5e7eb",
};

const sheetValueInputStyle: CSSProperties = {
  width: "100%",
  minHeight: 72,
  border: "none",
  outline: "none",
  resize: "vertical",
  padding: "10px 12px",
  fontSize: 14,
  color: "#1f2937",
  background: "transparent",
  lineHeight: 1.45,
  fontFamily: "inherit",
};

const sheetValueDisplayStyle: CSSProperties = {
  minHeight: 72,
  padding: "10px 12px",
  fontSize: 14,
  color: "#1f2937",
  whiteSpace: "pre-wrap",
  lineHeight: 1.45,
  cursor: "cell",
};

const sheetValuePlaceholderStyle: CSSProperties = {
  color: "#9ca3af",
};

const sheetNoteCellStyle: CSSProperties = {
  padding: 0,
  display: "flex",
  alignItems: "flex-start",
};

const sheetNoteInputStyle: CSSProperties = {
  width: "100%",
  minHeight: 92,
  border: "none",
  outline: "none",
  resize: "vertical",
  padding: "10px 12px",
  fontSize: 13,
  color: "#374151",
  background: "transparent",
  lineHeight: 1.45,
  fontFamily: "inherit",
};

const sheetNoteDisplayStyle: CSSProperties = {
  minHeight: 92,
  padding: "10px 12px",
  fontSize: 13,
  color: "#374151",
  whiteSpace: "pre-wrap",
  lineHeight: 1.45,
  cursor: "cell",
};

const sheetNotePlaceholderStyle: CSSProperties = {
  color: "#9ca3af",
  whiteSpace: "pre-wrap",
};

const rowDragHandleStyle: CSSProperties = {
  border: "none",
  background: "transparent",
  color: "#9ca3af",
  cursor: "grab",
  fontSize: 15,
  fontWeight: 700,
  lineHeight: 1,
  padding: 0,
};

const buttonStyle: CSSProperties = {
  border: "1px solid #d1d5db",
  borderRadius: 8,
  padding: "8px 12px",
  background: "#fff",
  fontWeight: 700,
  cursor: "pointer",
};

const topActionRowStyle: CSSProperties = {
  marginTop: 10,
  display: "flex",
  justifyContent: "flex-end",
  gap: 8,
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

const resizerStyle: CSSProperties = {
  background: "transparent",
};

const lockStyle: CSSProperties = {
  border: "1px solid #fecaca",
  borderRadius: 8,
  padding: "10px 12px",
  background: "#fff1f2",
  marginTop: 10,
  marginBottom: 10,
  fontWeight: 700,
};
