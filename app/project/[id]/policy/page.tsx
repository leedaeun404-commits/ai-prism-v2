"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  addHistoryEvent,
  canCompleteStep3,
  HISTORY_EVENT_TYPES,
  getProgress,
  getStep1Data,
  getStep2Data,
  generateStep3Policy,
  getStep3MissingFields,
  getStep3Policy,
  setProgress,
  setStep3Policy,
  type Step1Data,
  type Step2Data,
  type Step3Policy,
} from "@/lib/prismMvp";
import Step1PreviewPanel, { type Step3PreviewMetricId } from "../_components/Step1PreviewPanel";

type Step3FieldKey = keyof Omit<Step3Policy, "reviewed">;
type Step3CoreFieldKey = "automation_level_adjustment" | "auto_processing_scope" | "data_assetization_strategy";
type InputMode = "table" | "form";
type RowOrderPosition = "before" | "after";
type SheetColIndex = 0 | 1 | 2;
type SheetCell = { row: number; col: SheetColIndex };

const STEP3_CORE_FIELDS: Array<{ key: Step3CoreFieldKey; label: string }> = [
  { key: "automation_level_adjustment", label: "자동 실행은 어느 수준까지 할까요" },
  { key: "auto_processing_scope", label: "자동 승인 기준은 무엇인가요" },
  { key: "data_assetization_strategy", label: "결과 데이터를 어떻게 활용할까요" },
];
const STEP3_DEFAULT_ORDER: Step3CoreFieldKey[] = STEP3_CORE_FIELDS.map((f) => f.key);

const STEP3_SELECT_OPTIONS: Record<Step3CoreFieldKey, string[]> = {
  automation_level_adjustment: [
    "수동 (Manual)",
    "트리거 실행 (Trigger-based)",
    "조건부 자동 (Conditional Automation)",
    "전면 자동 (Full Automation)",
  ],
  auto_processing_scope: [
    "자동 승인 없음 (No Auto Approval)",
    "조건부 자동 승인 (Conditional Approval)",
    "전면 자동 승인 (Full Auto Approval)",
  ],
  data_assetization_strategy: [
    "저장 안 함 (No Storage)",
    "익명 저장 (Anonymous Storage)",
    "학습 활용 (Training Usage)",
  ],
};

const STEP3_HELPER_TEXT: Record<Step3CoreFieldKey, string> = {
  automation_level_adjustment:
    "[자동 실행 수준]\n수동/트리거/조건부 자동/전면 자동 중 운영 가능한 수준을 선택해요.\n고위험 시나리오는 수동 또는 조건부 자동을 권장해요.",
  auto_processing_scope:
    "[자동 승인 기준]\n자동 승인 없음/조건부 자동 승인/전면 자동 승인 중 선택해요.\n조건부 자동 승인이라면 기준값(confidence, safety 등)을 명시해요.",
  data_assetization_strategy:
    "[결과 데이터 활용]\n저장 안 함/익명 저장/학습 활용 중 선택해요.\n보존 기간, 삭제 정책, 학습 사용 조건을 추가로 적어주세요.",
};

export default function PolicyPage() {
  const params = useParams();
  const router = useRouter();
  const id = String(params?.id ?? "");

  const [locked, setLocked] = useState(true);
  const [policy, setPolicy] = useState<Step3Policy | null>(null);
  const [step1Data, setStep1DataState] = useState<Step1Data | null>(null);
  const [step2Data, setStep2DataState] = useState<Step2Data | null>(null);
  const [inputMode, setInputMode] = useState<InputMode>("table");
  const [storageNote, setStorageNote] = useState("");
  const [message, setMessage] = useState("");
  const [rowOrder, setRowOrder] = useState<Step3CoreFieldKey[]>(STEP3_DEFAULT_ORDER);
  const [dragRowId, setDragRowId] = useState<Step3CoreFieldKey | null>(null);
  const [dropRowId, setDropRowId] = useState<Step3CoreFieldKey | null>(null);
  const [dropPosition, setDropPosition] = useState<RowOrderPosition>("after");
  const [openSelectRowId, setOpenSelectRowId] = useState<Step3CoreFieldKey | null>(null);
  const [activeCell, setActiveCell] = useState<SheetCell | null>(null);
  const [selectionRange, setSelectionRange] = useState<{ start: SheetCell; end: SheetCell } | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const [rightPanelTab, setRightPanelTab] = useState<"preview" | "impact">("preview");
  const [rightPanelWidth, setRightPanelWidth] = useState(420);
  const [isResizing, setIsResizing] = useState(false);
  const [activeStep3MetricId, setActiveStep3MetricId] = useState<Step3PreviewMetricId | null>(null);
  const twoPaneRef = useRef<HTMLDivElement | null>(null);
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const activeSelectWrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!id) return;
    const progress = getProgress(id);
    const canAccess = progress.step1Frozen;
    setLocked(!canAccess);
    if (!canAccess) {
      router.replace(`/project/${id}/screening`);
      return;
    }

    const step1 = getStep1Data(id);
    const step2 = getStep2Data(id);
    setStep1DataState(step1);
    setStep2DataState(step2);
    const generated = generateStep3Policy(step1, step2);
    const existing = getStep3Policy(id);

    const merged: Step3Policy = {
      ...generated,
      ...existing,
      reviewed: { ...generated.reviewed, ...(existing.reviewed ?? {}) },
    };

    for (const field of STEP3_CORE_FIELDS) {
      const v = String(existing[field.key] ?? "").trim();
      if (!v) merged[field.key] = generated[field.key];
    }

    setPolicy(merged);
    const storageValue = String(merged.data_assetization_strategy ?? "");
    const storageMatch = STEP3_SELECT_OPTIONS.data_assetization_strategy.find((opt) => storageValue.startsWith(opt));
    if (storageMatch) {
      const note = storageValue.slice(storageMatch.length).replace(/^\s*[-:]\s*/, "").trim();
      setStorageNote(note);
    } else {
      setStorageNote("");
    }
    setStep3Policy(id, merged);
    try {
      const raw = localStorage.getItem(`prism:mvp:${id}:step3:row-order`);
      if (!raw) {
        setRowOrder(STEP3_DEFAULT_ORDER);
      } else {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) {
          setRowOrder(STEP3_DEFAULT_ORDER);
        } else {
          const normalized = [
            ...parsed.filter((k): k is Step3CoreFieldKey => STEP3_DEFAULT_ORDER.includes(k)),
            ...STEP3_DEFAULT_ORDER.filter((k) => !parsed.includes(k)),
          ];
          setRowOrder(normalized);
        }
      }
    } catch {
      setRowOrder(STEP3_DEFAULT_ORDER);
    }
  }, [id, router]);

  useEffect(() => {
    if (!id || rowOrder.length === 0) return;
    try {
      localStorage.setItem(`prism:mvp:${id}:step3:row-order`, JSON.stringify(rowOrder));
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

  useEffect(() => {
    if (!openSelectRowId) return;
    function onPointerDown(e: MouseEvent) {
      const target = e.target as Node | null;
      if (activeSelectWrapRef.current && target && !activeSelectWrapRef.current.contains(target)) {
        setOpenSelectRowId(null);
      }
    }
    window.addEventListener("mousedown", onPointerDown);
    return () => window.removeEventListener("mousedown", onPointerDown);
  }, [openSelectRowId]);

  function updateField(key: Step3FieldKey, value: string) {
    setPolicy((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  function updateCoreSelectField(key: Step3CoreFieldKey, value: string) {
    if (key !== "data_assetization_strategy") {
      updateField(key, value);
      return;
    }
    const note = storageNote.trim();
    updateField(key, note ? `${value} - ${note}` : value);
  }

  function updateStorageNote(next: string) {
    setStorageNote(next);
    setPolicy((prev) => {
      if (!prev) return prev;
      const selected = STEP3_SELECT_OPTIONS.data_assetization_strategy.find((opt) =>
        String(prev.data_assetization_strategy ?? "").startsWith(opt)
      );
      if (!selected) return prev;
      const value = next.trim() ? `${selected} - ${next.trim()}` : selected;
      return { ...prev, data_assetization_strategy: value };
    });
  }

  function getSelectedOption(key: Step3CoreFieldKey, value: string): string {
    const options = STEP3_SELECT_OPTIONS[key];
    return options.find((opt) => value.startsWith(opt)) ?? "";
  }

  function moveRow(dragId: Step3CoreFieldKey, targetId: Step3CoreFieldKey, pos: RowOrderPosition) {
    setRowOrder((prev) => {
      const current = prev.length > 0 ? prev : STEP3_DEFAULT_ORDER;
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

  function toMetricId(key: Step3CoreFieldKey): Step3PreviewMetricId {
    if (key === "automation_level_adjustment") return "execution_level";
    if (key === "auto_processing_scope") return "approval_level";
    return "data_policy";
  }

  function isEditableTarget(target: EventTarget | null) {
    if (!(target instanceof HTMLElement)) return false;
    return Boolean(target.closest("textarea, input, select, option, button, [data-editable='true']"));
  }

  function startCellSelection(row: number, col: SheetColIndex) {
    const cell: SheetCell = { row, col };
    setActiveCell(cell);
    setSelectionRange({ start: cell, end: cell });
    setIsSelecting(true);
    setOpenSelectRowId(null);
    sheetRef.current?.focus();
  }

  function extendCellSelection(row: number, col: SheetColIndex) {
    if (!isSelecting || !selectionRange) return;
    setSelectionRange((prev) => (prev ? { ...prev, end: { row, col } } : prev));
  }

  function isCellInSelection(row: number, col: SheetColIndex) {
    if (!selectionRange) return activeCell?.row === row && activeCell?.col === col;
    const rowMin = Math.min(selectionRange.start.row, selectionRange.end.row);
    const rowMax = Math.max(selectionRange.start.row, selectionRange.end.row);
    const colMin = Math.min(selectionRange.start.col, selectionRange.end.col);
    const colMax = Math.max(selectionRange.start.col, selectionRange.end.col);
    return row >= rowMin && row <= rowMax && col >= colMin && col <= colMax;
  }

  function getCellText(field: { key: Step3CoreFieldKey; label: string }, col: SheetColIndex) {
    if (!policy) return "";
    if (col === 0) return field.label;
    if (col === 1) return policy[field.key] || "";
    return STEP3_HELPER_TEXT[field.key];
  }

  function copySelectedCellsToText() {
    if (!selectionRange && !activeCell) return null;
    const rowMin = selectionRange ? Math.min(selectionRange.start.row, selectionRange.end.row) : (activeCell?.row ?? 0);
    const rowMax = selectionRange ? Math.max(selectionRange.start.row, selectionRange.end.row) : (activeCell?.row ?? 0);
    const colMin = selectionRange ? Math.min(selectionRange.start.col, selectionRange.end.col) : (activeCell?.col ?? 0);
    const colMax = selectionRange ? Math.max(selectionRange.start.col, selectionRange.end.col) : (activeCell?.col ?? 0);

    const lines: string[] = [];
    for (let r = rowMin; r <= rowMax; r += 1) {
      const field = orderedFields[r];
      if (!field) continue;
      const cols: string[] = [];
      for (let c = colMin; c <= colMax; c += 1) {
        cols.push(getCellText(field, c as SheetColIndex));
      }
      lines.push(cols.join("\t"));
    }
    return {
      text: lines.join("\n"),
      count: lines.length,
    };
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

  function applyPasteByCells(start: SheetCell, text: string) {
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.split("\t").map((c) => c.trim()))
      .filter((cols) => cols.some((v) => v.length > 0));
    if (lines.length === 0) return;

    let updated = 0;
    for (let r = 0; r < lines.length; r += 1) {
      const rowIndex = start.row + r;
      const field = orderedFields[rowIndex];
      if (!field) break;
      for (let c = 0; c < lines[r].length; c += 1) {
        const colIndex = start.col + c;
        if (colIndex !== 1) continue;
        const raw = lines[r][c];
        if (!raw) continue;
        updateField(field.key, raw);
        if (field.key === "data_assetization_strategy") {
          const matched = STEP3_SELECT_OPTIONS.data_assetization_strategy.find((opt) => raw.startsWith(opt));
          setStorageNote(matched ? raw.slice(matched.length).replace(/^\s*[-:]\s*/, "").trim() : "");
        }
        updated += 1;
      }
    }
    setMessage(`붙여넣기 완료: ${updated}셀`);
  }

  function handleSheetPaste(e: React.ClipboardEvent<HTMLDivElement>) {
    if (inputMode !== "table") return;
    if (isEditableTarget(e.target)) return;
    if (!activeCell || locked) return;
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
      if (orderedFields.length === 0) return;
      setActiveCell({ row: 0, col: 0 });
      setSelectionRange({ start: { row: 0, col: 0 }, end: { row: orderedFields.length - 1, col: 2 } });
      setMessage("표 전체 셀 선택");
    }
  }

  function handleSave() {
    if (!id || locked || !policy) return;
    if (!canCompleteStep3(policy)) {
      const missing = getStep3MissingFields(policy);
      setMessage(`저장 불가: 필수 항목을 완료하세요 (${missing.length}개 누락).`);
      return;
    }

    const progressBefore = getProgress(id);
    setStep3Policy(id, policy);
    setProgress(id, { step3Completed: true });
    addHistoryEvent(id, {
      stage: "step3",
      action: HISTORY_EVENT_TYPES.SAVE_STEP3,
      detail: "STEP3 정책 저장(검토 완료)",
    });
    if (!progressBefore.step3Completed) {
      addHistoryEvent(id, {
        stage: "step3",
        action: HISTORY_EVENT_TYPES.COMPLETE_STEP3,
        detail: "STEP3 완료 상태로 전환",
      });
    }
    setMessage("STEP3 저장 완료");
  }

  function handleConfirm() {
    handleSave();
    setMessage("STEP3 확정 완료");
  }

  const missing = policy ? getStep3MissingFields(policy) : [];
  const complete = policy ? canCompleteStep3(policy) : false;
  const fieldMap = new Map(STEP3_CORE_FIELDS.map((f) => [f.key, f]));
  const orderedFields = [
    ...rowOrder.map((key) => fieldMap.get(key)).filter((f): f is { key: Step3CoreFieldKey; label: string } => Boolean(f)),
    ...STEP3_CORE_FIELDS.filter((f) => !rowOrder.includes(f.key)),
  ];

  return (
    <div ref={twoPaneRef} className="two-pane" style={twoPaneStyle}>
      <section style={mainPanelStyle}>
        <h1 style={titleStyle}>STEP 3 운영 정책</h1>

        {locked && <div style={lockStyle}>🔒 STEP1 확정 전에는 접근할 수 없습니다.</div>}

        <p style={subtleStyle}>STEP2 검토 결과를 기반으로 정책 초안이 자동 생성됩니다.</p>
        <div style={policyMeaningStyle}>
          auto_approved = 초안 내부 저장 승인(배포 아님) · publish 승인 = 외부 반영 승인(휴먼 필수)
        </div>
        <div style={modeSwitchWrapStyle}>
          <div style={modeToggleStyle}>
            <button
              type="button"
              onClick={() => setInputMode("table")}
              style={{ ...modeToggleOptionStyle, ...(inputMode === "table" ? modeToggleOptionActiveStyle : {}) }}
            >
              표 모드
            </button>
            <button
              type="button"
              onClick={() => setInputMode("form")}
              style={{ ...modeToggleOptionStyle, ...(inputMode === "form" ? modeToggleOptionActiveStyle : {}) }}
            >
              폼 모드
            </button>
          </div>
        </div>
        <div style={topActionRowStyle}>
          <button onClick={handleSave} disabled={locked || !complete} style={buttonStyle}>
            저장
          </button>
          <button onClick={handleConfirm} disabled={locked || !complete} style={buttonStyle}>
            확정하기
          </button>
        </div>

        {policy && inputMode === "table" && (
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
            {orderedFields.map((field, rowIndex) => (
              <div
                key={field.key}
                style={{
                  ...sheetDataRowStyle,
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
                  setMessage("STEP3 행 순서가 변경되었습니다.");
                }}
                onDragLeave={() => setDropRowId(null)}
              >
                <div
                  style={{
                    ...sheetFieldCellStyle,
                    background: isCellInSelection(rowIndex, 0) ? "#eaf2ff" : undefined,
                    boxShadow: activeCell?.row === rowIndex && activeCell.col === 0 ? "inset 0 0 0 1px #93c5fd" : undefined,
                    cursor: "cell",
                  }}
                  onMouseDown={(e) => {
                    if (isEditableTarget(e.target)) return;
                    e.preventDefault();
                    setActiveStep3MetricId(toMetricId(field.key));
                    startCellSelection(rowIndex, 0);
                  }}
                  onMouseEnter={() => extendCellSelection(rowIndex, 0)}
                >
                  <button
                    type="button"
                    draggable
                    style={rowDragHandleStyle}
                    onMouseDown={(e) => e.stopPropagation()}
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
                  <span>{field.label}</span>
                </div>
                <div
                  style={{
                    ...sheetValueCellStyle,
                    background: isCellInSelection(rowIndex, 1) ? "#eaf2ff" : undefined,
                    boxShadow: activeCell?.row === rowIndex && activeCell.col === 1 ? "inset 0 0 0 1px #93c5fd" : undefined,
                  }}
                  onMouseDown={(e) => {
                    if (isEditableTarget(e.target)) return;
                    e.preventDefault();
                    setActiveStep3MetricId(toMetricId(field.key));
                    startCellSelection(rowIndex, 1);
                  }}
                  onMouseEnter={() => extendCellSelection(rowIndex, 1)}
                >
                  <div style={sheetValueInnerStyle}>
                    <div
                      ref={openSelectRowId === field.key ? activeSelectWrapRef : null}
                      style={sheetSelectWrapStyle}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          if (locked) return;
                          setActiveStep3MetricId(toMetricId(field.key));
                          setOpenSelectRowId((prev) => (prev === field.key ? null : field.key));
                        }}
                        disabled={locked}
                        data-editable="true"
                        style={sheetSelectTriggerStyle}
                      >
                        <span>{getSelectedOption(field.key, policy[field.key]) || "선택"}</span>
                        <span style={sheetSelectChevronStyle}>{openSelectRowId === field.key ? "▴" : "▾"}</span>
                      </button>
                      {!locked && openSelectRowId === field.key && (
                        <div data-editable="true" style={sheetSelectMenuStyle}>
                          {STEP3_SELECT_OPTIONS[field.key].map((option) => {
                            const selected = getSelectedOption(field.key, policy[field.key]) === option;
                            return (
                              <button
                                key={option}
                                type="button"
                                onClick={() => {
                                  updateCoreSelectField(field.key, option);
                                  setOpenSelectRowId(null);
                                }}
                                data-editable="true"
                                style={{
                                  ...sheetSelectOptionStyle,
                                  ...(selected ? sheetSelectOptionActiveStyle : {}),
                                }}
                              >
                                {option}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                    {field.key === "data_assetization_strategy" && (
                      <textarea
                        value={storageNote}
                        onChange={(e) => updateStorageNote(e.target.value)}
                        onFocus={() => setActiveStep3MetricId("data_policy")}
                        disabled={locked}
                        data-editable="true"
                        style={sheetValueInputStyle}
                        placeholder="추가 기준을 텍스트로 입력하세요."
                      />
                    )}
                  </div>
                </div>
                <div
                  style={{
                    ...sheetNoteCellStyle,
                    background: isCellInSelection(rowIndex, 2) ? "#eaf2ff" : undefined,
                    boxShadow: activeCell?.row === rowIndex && activeCell.col === 2 ? "inset 0 0 0 1px #93c5fd" : undefined,
                    cursor: "cell",
                  }}
                  onMouseDown={(e) => {
                    if (isEditableTarget(e.target)) return;
                    e.preventDefault();
                    setActiveStep3MetricId(toMetricId(field.key));
                    startCellSelection(rowIndex, 2);
                  }}
                  onMouseEnter={() => extendCellSelection(rowIndex, 2)}
                >
                  <div style={sheetNoteTextStyle}>{STEP3_HELPER_TEXT[field.key]}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {policy && inputMode === "form" && (
          <div style={formSheetWrapStyle}>
            <div style={formSheetHeaderRowStyle}>
              <div style={formSheetHeadFieldStyle}>Field</div>
              <div style={formSheetHeadValueStyle}>Value</div>
              <div style={formSheetHeadNoteStyle}>Note</div>
            </div>
            {orderedFields.map((field) => (
              <div
                key={field.key}
                style={{
                  ...formSheetDataRowStyle,
                  ...(dropRowId === field.key && dropPosition === "before" ? { borderTop: "2px solid #3b82f6" } : {}),
                  ...(dropRowId === field.key && dropPosition === "after" ? { borderBottom: "2px solid #3b82f6" } : {}),
                }}
                onMouseDown={() => setActiveStep3MetricId(toMetricId(field.key))}
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
                  setMessage("STEP3 행 순서가 변경되었습니다.");
                }}
                onDragLeave={() => setDropRowId(null)}
              >
                <div style={formSheetFieldCellStyle}>
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
                  <span>{field.label}</span>
                </div>
                <div style={formSheetValueCellStyle}>
                  <div style={sheetValueInnerStyle}>
                    <div style={sheetChoiceListStyle}>
                      {STEP3_SELECT_OPTIONS[field.key].map((option) => {
                        const checked = getSelectedOption(field.key, policy[field.key]) === option;
                        return (
                          <label key={option} style={sheetChoiceItemStyle}>
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => updateCoreSelectField(field.key, checked ? "" : option)}
                              disabled={locked}
                              style={sheetChoiceCheckboxStyle}
                            />
                            <span>{option}</span>
                          </label>
                        );
                      })}
                    </div>
                    {field.key === "data_assetization_strategy" && (
                      <textarea
                        value={storageNote}
                        onChange={(e) => updateStorageNote(e.target.value)}
                        onFocus={() => setActiveStep3MetricId("data_policy")}
                        disabled={locked}
                        style={sheetValueInputStyle}
                        placeholder="추가 기준을 텍스트로 입력하세요."
                      />
                    )}
                  </div>
                </div>
                <div style={formSheetNoteCellStyle}>
                  <div style={sheetNoteTextStyle}>{STEP3_HELPER_TEXT[field.key]}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {!locked && (
          <p style={{ ...subtleStyle, marginTop: 10 }}>
            완료 조건: 필수 항목 3개 입력 ({complete ? "충족" : "미충족"})
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
            <p style={{ ...subtleStyle, marginTop: 8 }}>GUIDED 모드에서는 STEP1 확정 후 STEP2/3/4 탭에 접근할 수 있습니다.</p>
            {step1Data && step2Data && (
              <Step1PreviewPanel
                data={step1Data}
                step2Data={step2Data}
                step3PolicyMetrics={
                  policy
                    ? {
                        executionLevel: policy.automation_level_adjustment,
                        approvalLevel: policy.auto_processing_scope,
                        dataPolicy: policy.data_assetization_strategy,
                      }
                    : null
                }
                mode="step2"
                flowSectionTitle="STEP 1 & 2 처리 플로우"
                showExecutionSection={false}
                showFlowSourceTags
                flowSourceTagTone="neutral"
                flowSourceTagLabelMode="summary"
                activeStep3MetricId={activeStep3MetricId}
              />
            )}
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

const modeSwitchWrapStyle: CSSProperties = {
  marginTop: 10,
};

const modeToggleStyle: CSSProperties = {
  display: "inline-flex",
  border: "1px solid #d1d5db",
  borderRadius: 8,
  overflow: "hidden",
  background: "#fff",
};

const modeToggleOptionStyle: CSSProperties = {
  border: "none",
  background: "transparent",
  padding: "8px 12px",
  fontSize: 13,
  cursor: "pointer",
  color: "#374151",
};

const modeToggleOptionActiveStyle: CSSProperties = {
  background: "#111827",
  color: "#fff",
};

const sheetWrapStyle: CSSProperties = {
  marginTop: 12,
  border: "1px solid #cbd5e1",
  borderRadius: 10,
  overflow: "visible",
  background: "#fff",
  position: "relative",
  zIndex: 1,
};

const sheetHeaderRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "260px minmax(0, 1fr) 320px",
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
  gridTemplateColumns: "260px minmax(0, 1fr) 320px",
  borderBottom: "1px solid #eef2f7",
  minHeight: 92,
  background: "#fff",
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

const sheetValueInnerStyle: CSSProperties = {
  display: "grid",
  gap: 8,
  padding: "10px 12px",
  background: "#fff",
};

const sheetChoiceListStyle: CSSProperties = {
  display: "grid",
  gap: 8,
};

const sheetSelectWrapStyle: CSSProperties = {
  position: "relative",
};

const sheetSelectTriggerStyle: CSSProperties = {
  width: "100%",
  minHeight: 44,
  border: "1px solid #e7edf4",
  borderRadius: 12,
  background: "#ffffff",
  color: "#1f2937",
  fontSize: 14,
  padding: "10px 14px",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  cursor: "pointer",
  textAlign: "left",
};

const sheetSelectChevronStyle: CSSProperties = {
  color: "#94a3b8",
  fontSize: 12,
  lineHeight: 1,
};

const sheetSelectMenuStyle: CSSProperties = {
  position: "absolute",
  left: 0,
  right: 0,
  top: 50,
  zIndex: 30,
  border: "1px solid #cbd5e1",
  borderRadius: 14,
  background: "#fff",
  boxShadow: "0 16px 30px rgba(15, 23, 42, 0.14)",
  padding: 10,
  display: "grid",
  gap: 6,
};

const sheetSelectOptionStyle: CSSProperties = {
  border: "1px solid transparent",
  background: "transparent",
  borderRadius: 10,
  padding: "12px 14px",
  textAlign: "left",
  fontSize: 14,
  color: "#1f2937",
  cursor: "pointer",
};

const sheetSelectOptionActiveStyle: CSSProperties = {
  background: "#dbeafe",
  color: "#1d4ed8",
  fontWeight: 700,
  borderColor: "#93c5fd",
};

const sheetChoiceItemStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  fontSize: 14,
  color: "#1f2937",
  minHeight: 24,
};

const sheetChoiceCheckboxStyle: CSSProperties = {
  width: 16,
  height: 16,
};

const sheetValueInputStyle: CSSProperties = {
  width: "100%",
  minHeight: 72,
  border: "1px solid #d1d5db",
  borderRadius: 8,
  outline: "none",
  resize: "vertical",
  padding: "8px 10px",
  fontSize: 14,
  color: "#1f2937",
  background: "#fff",
  lineHeight: 1.45,
  fontFamily: "inherit",
};

const sheetNoteCellStyle: CSSProperties = {
  padding: "10px 12px",
};

const sheetNoteTextStyle: CSSProperties = {
  margin: 0,
  fontSize: 13,
  color: "#9ca3af",
  lineHeight: 1.45,
  whiteSpace: "pre-wrap",
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

const formSheetWrapStyle: CSSProperties = {
  marginTop: 12,
  border: "1px solid #cbd5e1",
  borderRadius: 10,
  overflow: "visible",
  background: "#fff",
  position: "relative",
  zIndex: 1,
};

const formSheetHeaderRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "260px minmax(0, 1fr) 320px",
  background: "#f3f4f6",
  borderBottom: "1px solid #bfc9d9",
  fontSize: 12,
  fontWeight: 700,
  color: "#374151",
};

const formSheetHeadFieldStyle: CSSProperties = {
  padding: "10px 12px",
  borderRight: "1px solid #e5e7eb",
};

const formSheetHeadValueStyle: CSSProperties = {
  padding: "10px 12px",
  borderRight: "1px solid #e5e7eb",
};

const formSheetHeadNoteStyle: CSSProperties = {
  padding: "10px 12px",
};

const formSheetDataRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "260px minmax(0, 1fr) 320px",
  borderBottom: "1px solid #eef2f7",
  minHeight: 92,
  background: "#fff",
};

const formSheetFieldCellStyle: CSSProperties = {
  padding: "10px 12px",
  borderRight: "1px solid #e5e7eb",
  fontSize: 13,
  fontWeight: 700,
  color: "#374151",
  display: "flex",
  alignItems: "center",
  gap: 8,
};

const formSheetValueCellStyle: CSSProperties = {
  borderRight: "1px solid #e5e7eb",
};

const formSheetNoteCellStyle: CSSProperties = {
  padding: "10px 12px",
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

const policyMeaningStyle: CSSProperties = {
  marginTop: 8,
  border: "1px solid #bfdbfe",
  borderRadius: 8,
  padding: "8px 10px",
  background: "#eff6ff",
  color: "#1e3a8a",
  fontSize: 12,
  fontWeight: 700,
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
