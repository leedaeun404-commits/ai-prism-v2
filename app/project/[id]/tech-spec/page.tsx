"use client";

import { memo, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  addHistoryEvent,
  canAccessTechSpec,
  generateTechSpecRows,
  getStep4Rows,
  HISTORY_EVENT_TYPES,
  TECH_SPEC_ROW_DEFS,
  getProgress,
  getStep1Data,
  getStep2Data,
  getStep3Policy,
  setStep4Rows,
  type Step1AiTaskType,
  type Step4Row,
  type Step4RowId,
  type Step4TabKey,
} from "@/lib/prismMvp";

type DiagramTab = Step4TabKey;
type RightPanelTab = "preview" | "impact";
type InputMode = "table" | "form";
type SheetColIndex = 0 | 1 | 2;
type SheetCell = { row: number; col: SheetColIndex };
type ApiSpecRow = {
  method: string;
  endpoint: string;
  purpose: string;
  extras: string[];
};
type StateModelSheetRow = {
  state: string;
  meaning: string;
  enterCondition: string;
  exitCondition: string;
  extras: string[];
};
type OutputSchemaSheetRow = {
  field: string;
  type: string;
  required: string;
  description: string;
  extras: string[];
};
type MiniGridCell = { row: number; col: number };

function normalizeRequiredValue(value: string): "ON" | "OFF" | "" {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return "";
  if (["on", "y", "yes", "true", "1", "required"].includes(normalized)) return "ON";
  if (["off", "n", "no", "false", "0", "optional"].includes(normalized)) return "OFF";
  return "";
}

function isRequiredToken(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return ["on", "off", "y", "n", "yes", "no", "true", "false", "1", "0", "required", "optional"].includes(normalized);
}

function parseClipboardGrid(text: string): string[][] {
  const lines = text.replace(/\r/g, "").split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  return lines.map((line) => line.split("\t"));
}

function normalizeGridCellForClipboard(value: string): string {
  return value
    .replace(/\r?\n/g, " ")
    .replace(/\t/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function isControlElementTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(target.closest("button, a, [role='button']"));
}

function useMiniTableSelection(params: { rowCount: number; colCount: number; getCellText: (row: number, col: number) => string }) {
  const { rowCount, colCount, getCellText } = params;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const anchorRef = useRef<MiniGridCell | null>(null);
  const mouseDownRef = useRef(false);
  const [anchorCell, setAnchorCell] = useState<MiniGridCell | null>(null);
  const [focusCell, setFocusCell] = useState<MiniGridCell | null>(null);
  const [isDraggingSelection, setIsDraggingSelection] = useState(false);

  useEffect(() => {
    function onUp() {
      mouseDownRef.current = false;
    }
    window.addEventListener("mouseup", onUp);
    return () => window.removeEventListener("mouseup", onUp);
  }, []);

  const bounds = useMemo(() => {
    if (!anchorCell || !focusCell) return null;
    return {
      rowMin: Math.min(anchorCell.row, focusCell.row),
      rowMax: Math.max(anchorCell.row, focusCell.row),
      colMin: Math.min(anchorCell.col, focusCell.col),
      colMax: Math.max(anchorCell.col, focusCell.col),
    };
  }, [anchorCell, focusCell]);

  function startSelection(row: number, col: number, target: EventTarget | null) {
    if (isControlElementTarget(target)) return;
    mouseDownRef.current = true;
    const cell = { row, col };
    anchorRef.current = cell;
    setAnchorCell(cell);
    setFocusCell(cell);
    setIsDraggingSelection(false);
  }

  function extendSelection(row: number, col: number) {
    if (!mouseDownRef.current) return;
    const anchor = anchorRef.current;
    if (!anchor) return;
    if (!isDraggingSelection && (anchor.row !== row || anchor.col !== col)) {
      setIsDraggingSelection(true);
      window.getSelection()?.removeAllRanges();
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      containerRef.current?.focus();
    }
    setFocusCell({ row, col });
  }

  function isCellSelected(row: number, col: number) {
    if (!bounds) return false;
    return row >= bounds.rowMin && row <= bounds.rowMax && col >= bounds.colMin && col <= bounds.colMax;
  }

  function copyRangeText() {
    if (!bounds) return null;
    const lines: string[] = [];
    for (let r = bounds.rowMin; r <= bounds.rowMax; r += 1) {
      if (r < 0 || r >= rowCount) continue;
      const cols: string[] = [];
      for (let c = bounds.colMin; c <= bounds.colMax; c += 1) {
        if (c < 0 || c >= colCount) continue;
        cols.push(normalizeGridCellForClipboard(getCellText(r, c)));
      }
      lines.push(cols.join("\t"));
    }
    return lines.join("\n");
  }

  function handleCopy(e: React.ClipboardEvent<HTMLDivElement>) {
    const text = copyRangeText();
    if (!text) return;
    e.preventDefault();
    e.clipboardData.setData("text/plain", text);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (!(e.metaKey || e.ctrlKey)) return;
    if (e.key.toLowerCase() !== "c") return;
    const text = copyRangeText();
    if (!text) return;
    e.preventDefault();
    navigator.clipboard.writeText(text).catch(() => {
      // ignore clipboard error
    });
  }

  return {
    containerRef,
    isCellSelected,
    startSelection,
    extendSelection,
    handleCopy,
    handleKeyDown,
    isDraggingSelection,
  };
}

const SHEET_FIELD_COL_WIDTH = 220;
const SHEET_MIN_VALUE_COL_WIDTH = 240;
const SHEET_MIN_NOTE_COL_WIDTH = 48;
const SHEET_MAX_NOTE_COL_WIDTH = 520;
const SHEET_COLLAPSED_NOTE_COL_WIDTH = 36;
const TWO_PANE_GAP = 16;
const RESIZER_TOTAL_WIDTH = 14;
const MIN_MAIN_PANEL_WIDTH = SHEET_FIELD_COL_WIDTH + SHEET_MIN_VALUE_COL_WIDTH + SHEET_MIN_NOTE_COL_WIDTH;
const MIN_RIGHT_PANEL_WIDTH = 260;
const MAX_RIGHT_PANEL_WIDTH = 760;
const MIN_TWO_PANE_WIDTH = MIN_MAIN_PANEL_WIDTH + MIN_RIGHT_PANEL_WIDTH + TWO_PANE_GAP + RESIZER_TOTAL_WIDTH;

const DIAGRAM_TABS: Array<{ key: DiagramTab; label: string }> = [
  { key: "state", label: "State" },
  { key: "sequence", label: "Sequence" },
  { key: "observability", label: "Observability" },
  { key: "pipeline", label: "Pipeline" },
  { key: "ia", label: "IA" },
  { key: "dataflow", label: "Data Flow" },
  { key: "error_retry", label: "Error/Retry" },
  { key: "auth", label: "Auth Matrix" },
  { key: "rollback", label: "Rollback" },
  { key: "cost", label: "Cost Path" },
];

const DISABLED_DIAGRAM_TABS = new Set<DiagramTab>([
  "pipeline",
  "ia",
  "dataflow",
  "error_retry",
  "auth",
  "rollback",
  "cost",
]);

const RIGHT_PANEL_TABS: Array<{ key: RightPanelTab; label: string }> = [
  { key: "preview", label: "Preview" },
  { key: "impact", label: "영향도맵" },
];

const DIAGRAM_TAB_META: Record<DiagramTab, { label: string; bg: string; fg: string; border: string }> = {
  state: { label: "State", bg: "#e0f2fe", fg: "#0c4a6e", border: "#7dd3fc" },
  sequence: { label: "Sequence", bg: "#ede9fe", fg: "#4c1d95", border: "#c4b5fd" },
  error_retry: { label: "Error/Retry", bg: "#fee2e2", fg: "#7f1d1d", border: "#fca5a5" },
  auth: { label: "Auth Matrix", bg: "#dcfce7", fg: "#14532d", border: "#86efac" },
  dataflow: { label: "Data Flow", bg: "#cffafe", fg: "#155e75", border: "#67e8f9" },
  observability: { label: "Observability", bg: "#ffedd5", fg: "#7c2d12", border: "#fdba74" },
  pipeline: { label: "Pipeline", bg: "#f3e8ff", fg: "#581c87", border: "#d8b4fe" },
  rollback: { label: "Rollback", bg: "#fee2e2", fg: "#881337", border: "#fda4af" },
  cost: { label: "Cost Path", bg: "#fef9c3", fg: "#713f12", border: "#fde68a" },
  ia: { label: "IA", bg: "#e5e7eb", fg: "#1f2937", border: "#cbd5e1" },
};

type SchemaFieldDef = { key: string; label: string; defaultOn: boolean; more?: boolean };
type TaskSchemaTemplate = {
  key: Step1AiTaskType;
  label: string;
  fields: SchemaFieldDef[];
};

const TASK_SCHEMA_TEMPLATES: TaskSchemaTemplate[] = [
  {
    key: "draft_generation",
    label: "초안 생성 (Draft Generation)",
    fields: [
      { key: "topic", label: "주제 (Topic)", defaultOn: true },
      { key: "platform", label: "대상 플랫폼 (Platform)", defaultOn: true },
      { key: "tone", label: "톤 (Tone)", defaultOn: false },
      { key: "max_length", label: "길이 제한 (Max Length)", defaultOn: false },
      { key: "constraints", label: "제약 조건 (Constraints)", defaultOn: false },
      { key: "key_messages", label: "핵심 메시지 목록 (Key Messages[])", defaultOn: false, more: true },
      { key: "language", label: "언어 (Language / Locale)", defaultOn: false, more: true },
      { key: "audience", label: "대상 독자 (Audience)", defaultOn: false, more: true },
      { key: "brand_guide_ref", label: "브랜드 가이드 참조 (Brand Guide Ref)", defaultOn: false, more: true },
      { key: "format", label: "형식/포맷 (Format)", defaultOn: false, more: true },
    ],
  },
  {
    key: "candidate_suggestion",
    label: "후보 제시 (Candidate Suggestion)",
    fields: [
      { key: "topic", label: "주제 (Topic)", defaultOn: true },
      { key: "count", label: "생성 개수 (Count)", defaultOn: true },
      { key: "style", label: "스타일 (Style)", defaultOn: false },
      { key: "max_length", label: "길이 제한 (Max Length)", defaultOn: false },
      { key: "constraints", label: "제약 조건 (Constraints)", defaultOn: false },
      { key: "draft_text", label: "기존 초안 (Draft Text)", defaultOn: false, more: true },
      { key: "platform", label: "플랫폼 (Platform)", defaultOn: false, more: true },
      { key: "language", label: "언어 (Language)", defaultOn: false, more: true },
      { key: "audience", label: "타겟 독자 (Audience)", defaultOn: false, more: true },
    ],
  },
  {
    key: "revision_suggestion",
    label: "개선 제안 (Revision Suggestion)",
    fields: [
      { key: "draft_text", label: "기존 텍스트 (Draft Text)", defaultOn: true },
      { key: "improvement_goal", label: "개선 목표 (Improvement Goal)", defaultOn: true },
      { key: "target_tone", label: "목표 톤 (Target Tone)", defaultOn: false },
      { key: "length_adjust", label: "길이 조정 옵션 (Length Adjust)", defaultOn: false },
      { key: "constraints", label: "제약 조건 (Constraints)", defaultOn: false },
      { key: "brand_guide_ref", label: "브랜드 가이드 참조 (Brand Guide Ref)", defaultOn: false, more: true },
      { key: "forbidden_phrases", label: "금지 표현 목록 (Forbidden Phrases[])", defaultOn: false, more: true },
      { key: "focus_keywords", label: "강조 키워드 (Focus Keywords[])", defaultOn: false, more: true },
      { key: "language", label: "언어 (Language)", defaultOn: false, more: true },
    ],
  },
  {
    key: "policy_check",
    label: "정책 점검 (Policy Check)",
    fields: [
      { key: "text", label: "텍스트 (Text)", defaultOn: true },
      { key: "policy_rules", label: "정책 규칙 (Policy Rules)", defaultOn: true },
      { key: "risk_threshold", label: "위험 임계값 (Risk Threshold)", defaultOn: false },
      { key: "forbidden_keywords", label: "금지 키워드 목록 (Forbidden Keywords[])", defaultOn: false },
      { key: "sensitive_categories", label: "민감 카테고리 목록 (Sensitive Categories[])", defaultOn: false },
      { key: "brand_guide_ref", label: "브랜드 가이드 참조 (Brand Guide Ref)", defaultOn: false, more: true },
      { key: "impact_level", label: "영향도 레벨 (Impact Level)", defaultOn: false, more: true },
      { key: "auto_block_flag", label: "자동 차단 여부 (Auto Block Flag)", defaultOn: false, more: true },
    ],
  },
  {
    key: "classification",
    label: "분류 (Classification)",
    fields: [
      { key: "text", label: "텍스트 (Text)", defaultOn: true },
      { key: "category_list", label: "분류 기준 목록 (Category List[])", defaultOn: true },
      { key: "language", label: "언어 (Language / Locale)", defaultOn: false },
      { key: "confidence_threshold", label: "신뢰도 임계값 (Confidence Threshold)", defaultOn: false },
      { key: "multi_label_allowed", label: "다중 분류 허용 여부 (Multi-label Allowed)", defaultOn: false },
      { key: "category_description", label: "카테고리 설명 (Category Description)", defaultOn: false, more: true },
      { key: "classification_mode", label: "분류 방식 (Single vs Multi Class)", defaultOn: false, more: true },
      { key: "custom_rules", label: "커스텀 룰 (Custom Rules)", defaultOn: false, more: true },
    ],
  },
  {
    key: "approval_assist",
    label: "승인 보조 (Approval Assist)",
    fields: [
      { key: "draft_text", label: "텍스트 (Draft Text)", defaultOn: true },
      { key: "approval_rules", label: "승인 기준 (Approval Rules)", defaultOn: true },
      { key: "impact_level", label: "영향도 레벨 (Impact Level)", defaultOn: false },
      { key: "policy_flags", label: "정책 위반 여부 (Policy Flags)", defaultOn: false },
      { key: "confidence_threshold", label: "신뢰도 임계값 (Confidence Threshold)", defaultOn: false },
      { key: "auto_approval_condition", label: "자동 승인 조건 (Auto-Approval Condition)", defaultOn: false, more: true },
      { key: "manual_escalation_rule", label: "수동 전환 조건 (Manual Escalation Rule)", defaultOn: false, more: true },
      { key: "sla_threshold", label: "SLA 기준 (SLA Threshold)", defaultOn: false, more: true },
    ],
  },
];

function renderFieldTemplateBlock(label: string) {
  return [
    label,
    " • 설명(Description): 이 필드가 뭘 의미하는지",
    " • 제약(Constraints): 길이/금지어/형식/허용 값 등",
    " • 예시(Example): 한 줄 예시",
    " • 비고(Notes): 팀 합의/주의사항",
  ].join("\n");
}

function toKoreanTaskLabel(label: string) {
  return label.replace(/\s*\([^)]*\)\s*$/, "").trim();
}

function parseApiSpecSheet(spec: string): { rows: ApiSpecRow[]; extraHeaders: string[] } {
  const lines = spec
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  let extraHeaders: string[] = [];
  if (lines[0]?.startsWith("@columns\t")) {
    extraHeaders = lines[0].split("\t").slice(1);
  }
  const rows: ApiSpecRow[] = [];
  for (const line of lines) {
    if (line.startsWith("@columns\t")) continue;
    const cols = line.split("\t");
    if (cols.length >= 3) {
      rows.push({
        method: cols[0] || "",
        endpoint: cols[1] || "",
        purpose: cols[2] || "",
        extras: cols.slice(3),
      });
      continue;
    }
    const m = line.match(/^(GET|POST|PUT|PATCH|DELETE)\s+(\S+)\s*(.*)$/i);
    if (m) {
      rows.push({
        method: m[1].toUpperCase(),
        endpoint: m[2],
        purpose: "",
        extras: [],
      });
    }
  }
  const maxExtras = rows.reduce((acc, row) => Math.max(acc, row.extras.length), 0);
  if (extraHeaders.length === 0 && maxExtras > 0) {
    extraHeaders = Array.from({ length: maxExtras }, (_, i) => `추가 항목 ${i + 1}`);
  }
  if (extraHeaders.length > 0) {
    for (const row of rows) {
      while (row.extras.length < extraHeaders.length) row.extras.push("");
    }
  }
  return { rows, extraHeaders };
}

function parseApiSpecRows(spec: string): ApiSpecRow[] {
  return parseApiSpecSheet(spec).rows;
}

function stringifyApiSpecRows(rows: ApiSpecRow[], extraHeaders: string[]): string {
  const lines: string[] = [];
  if (extraHeaders.length > 0) {
    lines.push(["@columns", ...extraHeaders].join("\t"));
  }
  const body = rows
    .filter((row) => row.method.trim() || row.endpoint.trim() || row.purpose.trim())
    .map((row) => [row.method.trim(), row.endpoint.trim(), row.purpose.trim(), ...row.extras.map((x) => x.trim())].join("\t"));
  lines.push(...body);
  return lines.join("\n");
}

function parseStateModelSheet(spec: string): { rows: StateModelSheetRow[]; extraHeaders: string[] } {
  const lines = spec
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  let extraHeaders: string[] = [];
  if (lines[0]?.startsWith("@columns\t")) {
    extraHeaders = lines[0].split("\t").slice(1);
  }
  const tsvRows = lines
    .filter((line) => !line.startsWith("@columns\t"))
    .map((line) => line.split("\t"));
  if (tsvRows.some((cols) => cols.length >= 2)) {
    const rows = tsvRows
      .map((cols) => ({
        state: cols[0]?.trim() || "",
        meaning: cols[1]?.trim() || "",
        enterCondition: cols[2]?.trim() || "",
        exitCondition: cols[3]?.trim() || "",
        extras: cols.slice(4).map((c) => c.trim()),
      }))
      .filter((row) => row.state || row.meaning || row.enterCondition || row.exitCondition);
    if (rows.length > 0) {
      const maxExtras = rows.reduce((acc, row) => Math.max(acc, row.extras.length), 0);
      if (extraHeaders.length === 0 && maxExtras > 0) {
        extraHeaders = Array.from({ length: maxExtras }, (_, i) => `추가 항목 ${i + 1}`);
      }
      if (extraHeaders.length > 0) {
        for (const row of rows) {
          while (row.extras.length < extraHeaders.length) row.extras.push("");
        }
      }
      return { rows, extraHeaders };
    }
  }

  const chain = spec
    .split(/->|→/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (chain.length > 0) {
    return {
      rows: chain.map((state, idx) => ({
        state,
        meaning: "",
        enterCondition: idx === 0 ? "요청 시작" : "",
        exitCondition: idx < chain.length - 1 ? chain[idx + 1] : "",
        extras: [],
      })),
      extraHeaders: [],
    };
  }

  return {
    rows: [
      { state: "input", meaning: "입력 완료", enterCondition: "POST /posts", exitCondition: "generate 호출", extras: [] },
      { state: "generating", meaning: "생성 중", enterCondition: "generate 호출", exitCondition: "모델 응답", extras: [] },
      { state: "draft", meaning: "초안 생성", enterCondition: "생성 완료", exitCondition: "수정/게시 요청", extras: [] },
    ],
    extraHeaders: [],
  };
}

function stringifyStateModelSheet(rows: StateModelSheetRow[], extraHeaders: string[]): string {
  const lines: string[] = [];
  if (extraHeaders.length > 0) {
    lines.push(["@columns", ...extraHeaders].join("\t"));
  }
  const body = rows
    .filter(
      (row) =>
        row.state.trim() ||
        row.meaning.trim() ||
        row.enterCondition.trim() ||
        row.exitCondition.trim() ||
        row.extras.some((x) => x.trim())
    )
    .map((row) => [row.state.trim(), row.meaning.trim(), row.enterCondition.trim(), row.exitCondition.trim(), ...row.extras.map((x) => x.trim())].join("\t"));
  lines.push(...body);
  return lines.join("\n");
}

function getStateNamesFromStateModelSpec(spec: string): string[] {
  const { rows } = parseStateModelSheet(spec);
  const names = rows.map((row) => row.state.trim()).filter(Boolean);
  return names.length > 0 ? names : ["input", "generating", "draft", "publish", "failed"];
}

function parseOutputSchemaSheet(spec: string): { rows: OutputSchemaSheetRow[]; extraHeaders: string[] } {
  const lines = spec
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  let extraHeaders: string[] = [];
  if (lines[0]?.startsWith("@columns\t")) {
    extraHeaders = lines[0].split("\t").slice(1);
  }
  const tsvRows = lines
    .filter((line) => !line.startsWith("@columns\t"))
    .map((line) => line.split("\t"));
  if (tsvRows.some((cols) => cols.length >= 2)) {
    const rows = tsvRows
      .map((cols) => {
        const col2 = cols[2]?.trim() || "";
        const col3 = cols[3]?.trim() || "";
        const usesOldOrder = isRequiredToken(col2) && !isRequiredToken(col3);
        const description = usesOldOrder ? col3 : col2;
        const requiredRaw = usesOldOrder ? col2 : col3;
        return {
          field: cols[0]?.trim() || "",
          type: cols[1]?.trim() || "",
          description,
          required: normalizeRequiredValue(requiredRaw),
          extras: cols.slice(4).map((c) => c.trim()),
        };
      })
      .filter((row) => row.field || row.type || row.required || row.description || row.extras.some((x) => x));
    if (rows.length > 0) {
      const maxExtras = rows.reduce((acc, row) => Math.max(acc, row.extras.length), 0);
      if (extraHeaders.length === 0 && maxExtras > 0) {
        extraHeaders = Array.from({ length: maxExtras }, (_, i) => `추가 항목 ${i + 1}`);
      }
      if (extraHeaders.length > 0) {
        for (const row of rows) {
          while (row.extras.length < extraHeaders.length) row.extras.push("");
        }
      }
      return { rows, extraHeaders };
    }
  }

  const csvFields = spec
    .split(/[,\n]/)
    .map((x) => x.trim())
    .filter(Boolean);
  if (csvFields.length > 0) {
    return {
      rows: csvFields.map((field) => ({ field, type: "string", required: "ON", description: "", extras: [] })),
      extraHeaders: [],
    };
  }

  return {
    rows: [
      { field: "draft_text", type: "string", required: "ON", description: "생성 초안 텍스트", extras: [] },
      { field: "confidence", type: "number", required: "OFF", description: "모델 신뢰도", extras: [] },
    ],
    extraHeaders: [],
  };
}

function stringifyOutputSchemaSheet(rows: OutputSchemaSheetRow[], extraHeaders: string[]): string {
  const lines: string[] = [];
  if (extraHeaders.length > 0) {
    lines.push(["@columns", ...extraHeaders].join("\t"));
  }
  const body = rows
    .filter(
      (row) =>
        row.field.trim() ||
        row.type.trim() ||
        row.description.trim() ||
        row.required.trim() ||
        row.extras.some((x) => x.trim())
    )
    .map((row) => [row.field.trim(), row.type.trim(), row.description.trim(), normalizeRequiredValue(row.required), ...row.extras.map((x) => x.trim())].join("\t"));
  lines.push(...body);
  return lines.join("\n");
}

function summarizeOutputSchema(spec: string): string {
  const { rows } = parseOutputSchemaSheet(spec);
  const summary = rows
    .map((row) => {
      const field = row.field.trim();
      const type = row.type.trim();
      if (!field) return "";
      return type ? `${field}:${type}` : field;
    })
    .filter(Boolean)
    .join(", ");
  return summary || "draft_text, confidence";
}

const ApiDefinitionSheetEditor = memo(function ApiDefinitionSheetEditor({
  spec,
  disabled,
  onSpecChange,
}: {
  spec: string;
  disabled: boolean;
  onSpecChange: (value: string) => void;
}) {
  const parsed = useMemo(() => parseApiSpecSheet(spec), [spec]);
  const [rows, setRows] = useState<ApiSpecRow[]>(() => {
    return parsed.rows.length > 0
      ? parsed.rows
      : [
          { method: "POST", endpoint: "/posts", purpose: "", extras: [] },
          { method: "POST", endpoint: "/posts/{id}/generate", purpose: "", extras: [] },
          { method: "POST", endpoint: "/posts/{id}/revise", purpose: "", extras: [] },
          { method: "PATCH", endpoint: "/posts/{id}", purpose: "", extras: [] },
        ];
  });
  const [extraHeaders, setExtraHeaders] = useState<string[]>(() => parsed.extraHeaders);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const [dropPosition, setDropPosition] = useState<"before" | "after">("before");
  const { containerRef, isCellSelected, startSelection, extendSelection, handleCopy, handleKeyDown } = useMiniTableSelection({
    rowCount: rows.length + 1,
    colCount: 3 + extraHeaders.length,
    getCellText: (rowIndex, colIndex) => {
      if (rowIndex === 0) {
        if (colIndex === 0) return "메서드 (Method)";
        if (colIndex === 1) return "엔드포인트 (Endpoint)";
        if (colIndex === 2) return "목적 (Purpose)";
        return extraHeaders[colIndex - 3] ?? "";
      }
      const row = rows[rowIndex - 1];
      if (!row) return "";
      if (colIndex === 0) return row.method;
      if (colIndex === 1) return row.endpoint;
      if (colIndex === 2) return row.purpose;
      return row.extras[colIndex - 3] ?? "";
    },
  });

  useEffect(() => {
    const nextSpec = stringifyApiSpecRows(rows, extraHeaders);
    if (nextSpec === spec) return;
    onSpecChange(nextSpec);
  }, [extraHeaders, onSpecChange, rows, spec]);

  function updateRow(index: number, key: "method" | "endpoint" | "purpose", value: string) {
    setRows((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [key]: value };
      return next;
    });
  }

  function updateExtraCell(rowIndex: number, colIndex: number, value: string) {
    setRows((prev) => {
      const next = [...prev];
      const extras = [...next[rowIndex].extras];
      extras[colIndex] = value;
      next[rowIndex] = { ...next[rowIndex], extras };
      return next;
    });
  }

  function applyGridPaste(startRow: number, startCol: number, text: string) {
    const grid = parseClipboardGrid(text);
    if (grid.length === 0) return;
    setRows((prev) => {
      const next = [...prev];
      for (let r = 0; r < grid.length; r += 1) {
        const rowIndex = startRow + r;
        if (!next[rowIndex]) break;
        for (let c = 0; c < grid[r].length; c += 1) {
          const colIndex = startCol + c;
          const value = grid[r][c];
          if (colIndex === 0) next[rowIndex] = { ...next[rowIndex], method: value };
          else if (colIndex === 1) next[rowIndex] = { ...next[rowIndex], endpoint: value };
          else if (colIndex === 2) next[rowIndex] = { ...next[rowIndex], purpose: value };
          else {
            const extraIndex = colIndex - 3;
            if (extraIndex < 0 || extraIndex >= extraHeaders.length) continue;
            const extras = [...next[rowIndex].extras];
            extras[extraIndex] = value;
            next[rowIndex] = { ...next[rowIndex], extras };
          }
        }
      }
      return next;
    });
  }

  function addRow() {
    setRows((prev) => [...prev, { method: "POST", endpoint: "", purpose: "", extras: Array.from({ length: extraHeaders.length }, () => "") }]);
  }

  function addColumnRight() {
    setExtraHeaders((prev) => [...prev, `추가 항목 ${prev.length + 1}`]);
    setRows((prev) => prev.map((row) => ({ ...row, extras: [...row.extras, ""] })));
  }

  function updateExtraHeader(index: number, value: string) {
    setExtraHeaders((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  }

  function removeExtraColumn(index: number) {
    setExtraHeaders((prev) => prev.filter((_, i) => i !== index));
    setRows((prev) =>
      prev.map((row) => ({
        ...row,
        extras: row.extras.filter((_, i) => i !== index),
      }))
    );
  }

  function removeRow(index: number) {
    setRows((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((_, i) => i !== index);
    });
  }

  function moveRow(from: number, to: number) {
    if (from === to || from < 0 || to < 0 || from >= rows.length || to >= rows.length) return;
    setRows((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }

  function startDragSelectApi(e: React.MouseEvent, rowIndex: number, colIndex: number) {
    startSelection(rowIndex, colIndex, e.target);
  }

  return (
    <div
      data-editable="true"
      style={apiSheetWrapStyle}
      ref={containerRef}
      tabIndex={0}
      onCopy={handleCopy}
      onKeyDown={handleKeyDown}
    >
      <div data-editable="true" style={apiSheetScrollStyle}>
        <table style={apiTableStyle}>
          <colgroup>
            <col style={{ width: 34 }} />
            <col style={{ width: 100 }} />
            <col />
            <col />
            {extraHeaders.map((_, idx) => (
              <col key={`col-extra-${idx}`} />
            ))}
            <col style={{ width: 44 }} />
          </colgroup>
          <thead>
            <tr>
              <th style={apiActionThStyle} />
              <th
                style={{ ...apiThStyle, ...(isCellSelected(0, 0) ? miniSelectedCellStyle : {}) }}
                onMouseDown={(e) => startDragSelectApi(e, 0, 0)}
                onMouseEnter={() => extendSelection(0, 0)}
              >
                메서드 (Method)
              </th>
              <th
                style={{ ...apiThStyle, ...(isCellSelected(0, 1) ? miniSelectedCellStyle : {}) }}
                onMouseDown={(e) => startDragSelectApi(e, 0, 1)}
                onMouseEnter={() => extendSelection(0, 1)}
              >
                엔드포인트 (Endpoint)
              </th>
              <th
                style={{ ...apiThStyle, ...(isCellSelected(0, 2) ? miniSelectedCellStyle : {}) }}
                onMouseDown={(e) => startDragSelectApi(e, 0, 2)}
                onMouseEnter={() => extendSelection(0, 2)}
              >
                목적 (Purpose)
              </th>
              {extraHeaders.map((header, idx) => (
                <th
                  key={`head-extra-${idx}`}
                  style={{ ...apiThStyle, ...(isCellSelected(0, 3 + idx) ? miniSelectedCellStyle : {}) }}
                  onMouseDown={(e) => startDragSelectApi(e, 0, 3 + idx)}
                  onMouseEnter={() => extendSelection(0, 3 + idx)}
                >
                  <div style={apiHeaderCellInnerStyle}>
                    <AutoGrowTextarea value={header} onChange={(value) => updateExtraHeader(idx, value)} disabled={disabled} style={apiHeaderInputStyle} />
                    {!disabled && (
                      <button
                        type="button"
                        data-editable="true"
                        onClick={() => removeExtraColumn(idx)}
                        style={apiHeaderDeleteButtonStyle}
                        title="이 컬럼 삭제"
                        aria-label="이 컬럼 삭제"
                      >
                        ×
                      </button>
                    )}
                  </div>
                </th>
              ))}
              <th style={apiActionThStyle}>
                {!disabled && (
                  <button type="button" data-editable="true" onClick={addColumnRight} style={apiIconButtonStyle} title="오른쪽에 컬럼 추가" aria-label="오른쪽에 컬럼 추가">
                    +
                  </button>
                )}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr
                key={`api-row-${idx}`}
                style={{
                  ...(dropIndex === idx && dropPosition === "before" ? { borderTop: "2px solid #3b82f6" } : {}),
                  ...(dropIndex === idx && dropPosition === "after" ? { borderBottom: "2px solid #3b82f6" } : {}),
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  const rect = (e.currentTarget as HTMLTableRowElement).getBoundingClientRect();
                  const pos: "before" | "after" = e.clientY < rect.top + rect.height / 2 ? "before" : "after";
                  setDropIndex(idx);
                  setDropPosition(pos);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragIndex === null || dropIndex === null) return;
                  let target = dropIndex;
                  if (dropPosition === "after") target += 1;
                  if (dragIndex < target) target -= 1;
                  target = Math.max(0, Math.min(rows.length - 1, target));
                  moveRow(dragIndex, target);
                  setDragIndex(null);
                  setDropIndex(null);
                }}
                onDragLeave={() => setDropIndex(null)}
              >
                <td style={apiActionTdStyle}>
                  {!disabled && (
                    <button
                      type="button"
                      data-editable="true"
                      draggable
                      onDragStart={() => setDragIndex(idx)}
                      onDragEnd={() => {
                        setDragIndex(null);
                        setDropIndex(null);
                      }}
                      style={apiDragButtonStyle}
                      title="드래그해서 순서 변경"
                      aria-label="API 행 순서 변경"
                    >
                      ≡
                    </button>
                  )}
                </td>
                <td
                  style={{ ...apiTdStyle, ...(isCellSelected(idx + 1, 0) ? miniSelectedCellStyle : {}) }}
                  onMouseDown={(e) => startDragSelectApi(e, idx + 1, 0)}
                  onMouseEnter={() => extendSelection(idx + 1, 0)}
                >
                  <AutoGrowTextarea
                    value={row.method}
                    onChange={(value) => updateRow(idx, "method", value)}
                    onPaste={(e) => {
                      const text = e.clipboardData.getData("text/plain");
                      if (!text.includes("\t") && !text.includes("\n")) return;
                      e.preventDefault();
                      applyGridPaste(idx, 0, text);
                    }}
                    disabled={disabled}
                    style={apiTextareaStyle}
                  />
                </td>
                <td
                  style={{ ...apiTdStyle, ...(isCellSelected(idx + 1, 1) ? miniSelectedCellStyle : {}) }}
                  onMouseDown={(e) => startDragSelectApi(e, idx + 1, 1)}
                  onMouseEnter={() => extendSelection(idx + 1, 1)}
                >
                  <AutoGrowTextarea
                    value={row.endpoint}
                    onChange={(value) => updateRow(idx, "endpoint", value)}
                    onPaste={(e) => {
                      const text = e.clipboardData.getData("text/plain");
                      if (!text.includes("\t") && !text.includes("\n")) return;
                      e.preventDefault();
                      applyGridPaste(idx, 1, text);
                    }}
                    disabled={disabled}
                    style={apiTextareaStyle}
                  />
                </td>
                <td
                  style={{ ...apiTdStyle, ...(isCellSelected(idx + 1, 2) ? miniSelectedCellStyle : {}) }}
                  onMouseDown={(e) => startDragSelectApi(e, idx + 1, 2)}
                  onMouseEnter={() => extendSelection(idx + 1, 2)}
                >
                  <AutoGrowTextarea
                    value={row.purpose}
                    onChange={(value) => updateRow(idx, "purpose", value)}
                    onPaste={(e) => {
                      const text = e.clipboardData.getData("text/plain");
                      if (!text.includes("\t") && !text.includes("\n")) return;
                      e.preventDefault();
                      applyGridPaste(idx, 2, text);
                    }}
                    disabled={disabled}
                    style={apiTextareaStyle}
                  />
                </td>
                {extraHeaders.map((_, extraIdx) => (
                  <td
                    key={`extra-${idx}-${extraIdx}`}
                    style={{ ...apiTdStyle, ...(isCellSelected(idx + 1, 3 + extraIdx) ? miniSelectedCellStyle : {}) }}
                    onMouseDown={(e) => startDragSelectApi(e, idx + 1, 3 + extraIdx)}
                    onMouseEnter={() => extendSelection(idx + 1, 3 + extraIdx)}
                  >
                    <AutoGrowTextarea
                      value={row.extras[extraIdx] ?? ""}
                      onChange={(value) => updateExtraCell(idx, extraIdx, value)}
                      onPaste={(e) => {
                        const text = e.clipboardData.getData("text/plain");
                        if (!text.includes("\t") && !text.includes("\n")) return;
                        e.preventDefault();
                        applyGridPaste(idx, 3 + extraIdx, text);
                      }}
                      disabled={disabled}
                      style={apiTextareaStyle}
                    />
                  </td>
                ))}
                <td style={apiActionTdStyle}>
                  {!disabled && (
                    <button type="button" data-editable="true" onClick={() => removeRow(idx)} style={apiIconButtonStyle} title="API 행 삭제" aria-label="API 행 삭제">
                      <span style={trashIconStyle}>🗑</span>
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {!disabled && (
              <tr>
                <td style={apiActionTdStyle}>
                  <div style={apiFooterActionWrapStyle}>
                    <button type="button" data-editable="true" onClick={addRow} style={apiIconButtonStyle} title="API 행 추가" aria-label="API 행 추가">
                      +
                    </button>
                  </div>
                </td>
                <td colSpan={4 + extraHeaders.length} style={apiAddRowCellStyle} />
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
});

const StateModelSheetEditor = memo(function StateModelSheetEditor({
  spec,
  disabled,
  onSpecChange,
}: {
  spec: string;
  disabled: boolean;
  onSpecChange: (value: string) => void;
}) {
  const parsed = useMemo(() => parseStateModelSheet(spec), [spec]);
  const [rows, setRows] = useState<StateModelSheetRow[]>(() => parsed.rows);
  const [extraHeaders, setExtraHeaders] = useState<string[]>(() => parsed.extraHeaders);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const [dropPosition, setDropPosition] = useState<"before" | "after">("before");
  const { containerRef, isCellSelected, startSelection, extendSelection, handleCopy, handleKeyDown } = useMiniTableSelection({
    rowCount: rows.length + 1,
    colCount: 4 + extraHeaders.length,
    getCellText: (rowIndex, colIndex) => {
      if (rowIndex === 0) {
        if (colIndex === 0) return "상태 (State)";
        if (colIndex === 1) return "의미 (Meaning)";
        if (colIndex === 2) return "생성 조건 (Entry Condition)";
        if (colIndex === 3) return "종료 조건 (Exit Condition)";
        return extraHeaders[colIndex - 4] ?? "";
      }
      const row = rows[rowIndex - 1];
      if (!row) return "";
      if (colIndex === 0) return row.state;
      if (colIndex === 1) return row.meaning;
      if (colIndex === 2) return row.enterCondition;
      if (colIndex === 3) return row.exitCondition;
      return row.extras[colIndex - 4] ?? "";
    },
  });

  useEffect(() => {
    setRows(parsed.rows);
    setExtraHeaders(parsed.extraHeaders);
  }, [parsed]);

  useEffect(() => {
    const nextSpec = stringifyStateModelSheet(rows, extraHeaders);
    if (nextSpec === spec) return;
    onSpecChange(nextSpec);
  }, [extraHeaders, onSpecChange, rows, spec]);

  function updateCell(index: number, key: keyof StateModelSheetRow, value: string) {
    setRows((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [key]: value };
      return next;
    });
  }

  function addRow() {
    setRows((prev) => [...prev, { state: "", meaning: "", enterCondition: "", exitCondition: "", extras: Array.from({ length: extraHeaders.length }, () => "") }]);
  }

  function removeRow(index: number) {
    setRows((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((_, i) => i !== index);
    });
  }

  function moveRow(from: number, to: number) {
    if (from === to || from < 0 || to < 0 || from >= rows.length || to >= rows.length) return;
    setRows((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }

  function addColumnRight() {
    setExtraHeaders((prev) => [...prev, `추가 항목 ${prev.length + 1}`]);
    setRows((prev) => prev.map((row) => ({ ...row, extras: [...row.extras, ""] })));
  }

  function updateExtraHeader(index: number, value: string) {
    setExtraHeaders((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  }

  function removeExtraColumn(index: number) {
    setExtraHeaders((prev) => prev.filter((_, i) => i !== index));
    setRows((prev) =>
      prev.map((row) => ({
        ...row,
        extras: row.extras.filter((_, i) => i !== index),
      }))
    );
  }

  function updateExtraCell(rowIndex: number, colIndex: number, value: string) {
    setRows((prev) => {
      const next = [...prev];
      const extras = [...next[rowIndex].extras];
      extras[colIndex] = value;
      next[rowIndex] = { ...next[rowIndex], extras };
      return next;
    });
  }

  function applyGridPaste(startRow: number, startCol: number, text: string) {
    const grid = parseClipboardGrid(text);
    if (grid.length === 0) return;
    setRows((prev) => {
      const next = [...prev];
      for (let r = 0; r < grid.length; r += 1) {
        const rowIndex = startRow + r;
        if (!next[rowIndex]) break;
        for (let c = 0; c < grid[r].length; c += 1) {
          const colIndex = startCol + c;
          const value = grid[r][c];
          if (colIndex === 0) next[rowIndex] = { ...next[rowIndex], state: value };
          else if (colIndex === 1) next[rowIndex] = { ...next[rowIndex], meaning: value };
          else if (colIndex === 2) next[rowIndex] = { ...next[rowIndex], enterCondition: value };
          else if (colIndex === 3) next[rowIndex] = { ...next[rowIndex], exitCondition: value };
          else {
            const extraIndex = colIndex - 4;
            if (extraIndex < 0 || extraIndex >= extraHeaders.length) continue;
            const extras = [...next[rowIndex].extras];
            extras[extraIndex] = value;
            next[rowIndex] = { ...next[rowIndex], extras };
          }
        }
      }
      return next;
    });
  }

  function startDragSelectState(e: React.MouseEvent, rowIndex: number, colIndex: number) {
    startSelection(rowIndex, colIndex, e.target);
  }

  return (
    <div
      data-editable="true"
      style={stateSheetWrapStyle}
      ref={containerRef}
      tabIndex={0}
      onCopy={handleCopy}
      onKeyDown={handleKeyDown}
    >
      <div data-editable="true" style={stateSheetScrollStyle}>
        <table style={stateTableStyle}>
          <colgroup>
            <col style={{ width: 34 }} />
            <col />
            <col />
            <col />
            <col />
            {extraHeaders.map((_, idx) => (
              <col key={`state-extra-col-${idx}`} />
            ))}
            <col style={{ width: 44 }} />
          </colgroup>
          <thead>
            <tr>
              <th style={apiActionThStyle} />
              <th
                style={{ ...stateThStyle, ...(isCellSelected(0, 0) ? miniSelectedCellStyle : {}) }}
                onMouseDown={(e) => startDragSelectState(e, 0, 0)}
                onMouseEnter={() => extendSelection(0, 0)}
              >
                상태 (State)
              </th>
              <th
                style={{ ...stateThStyle, ...(isCellSelected(0, 1) ? miniSelectedCellStyle : {}) }}
                onMouseDown={(e) => startDragSelectState(e, 0, 1)}
                onMouseEnter={() => extendSelection(0, 1)}
              >
                의미 (Meaning)
              </th>
              <th
                style={{ ...stateThStyle, ...(isCellSelected(0, 2) ? miniSelectedCellStyle : {}) }}
                onMouseDown={(e) => startDragSelectState(e, 0, 2)}
                onMouseEnter={() => extendSelection(0, 2)}
              >
                생성 조건 (Entry Condition)
              </th>
              <th
                style={{ ...stateThStyle, ...(isCellSelected(0, 3) ? miniSelectedCellStyle : {}) }}
                onMouseDown={(e) => startDragSelectState(e, 0, 3)}
                onMouseEnter={() => extendSelection(0, 3)}
              >
                종료 조건 (Exit Condition)
              </th>
              {extraHeaders.map((header, idx) => (
                <th
                  key={`state-extra-head-${idx}`}
                  style={{ ...apiThStyle, ...(isCellSelected(0, 4 + idx) ? miniSelectedCellStyle : {}) }}
                  onMouseDown={(e) => startDragSelectState(e, 0, 4 + idx)}
                  onMouseEnter={() => extendSelection(0, 4 + idx)}
                >
                  <div style={apiHeaderCellInnerStyle}>
                    <AutoGrowTextarea value={header} onChange={(value) => updateExtraHeader(idx, value)} disabled={disabled} style={apiHeaderInputStyle} />
                    {!disabled && (
                      <button
                        type="button"
                        data-editable="true"
                        onClick={() => removeExtraColumn(idx)}
                        style={apiHeaderDeleteButtonStyle}
                        title="이 컬럼 삭제"
                        aria-label="이 컬럼 삭제"
                      >
                        ×
                      </button>
                    )}
                  </div>
                </th>
              ))}
              <th style={apiActionThStyle}>
                {!disabled && (
                  <button type="button" data-editable="true" onClick={addColumnRight} style={apiIconButtonStyle} title="오른쪽에 컬럼 추가" aria-label="오른쪽에 컬럼 추가">
                    +
                  </button>
                )}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr
                key={`state-row-${idx}`}
                style={{
                  ...(dropIndex === idx && dropPosition === "before" ? { borderTop: "2px solid #3b82f6" } : {}),
                  ...(dropIndex === idx && dropPosition === "after" ? { borderBottom: "2px solid #3b82f6" } : {}),
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  const rect = (e.currentTarget as HTMLTableRowElement).getBoundingClientRect();
                  const pos: "before" | "after" = e.clientY < rect.top + rect.height / 2 ? "before" : "after";
                  setDropIndex(idx);
                  setDropPosition(pos);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragIndex === null || dropIndex === null) return;
                  let target = dropIndex;
                  if (dropPosition === "after") target += 1;
                  if (dragIndex < target) target -= 1;
                  target = Math.max(0, Math.min(rows.length - 1, target));
                  moveRow(dragIndex, target);
                  setDragIndex(null);
                  setDropIndex(null);
                }}
                onDragLeave={() => setDropIndex(null)}
              >
                <td style={stateActionTdStyle}>
                  {!disabled && (
                    <button
                      type="button"
                      data-editable="true"
                      draggable
                      onDragStart={() => setDragIndex(idx)}
                      onDragEnd={() => {
                        setDragIndex(null);
                        setDropIndex(null);
                      }}
                      style={apiDragButtonStyle}
                      title="드래그해서 순서 변경"
                      aria-label="상태 행 순서 변경"
                    >
                      ≡
                    </button>
                  )}
                </td>
                <td
                  style={{ ...stateTdStyle, ...(isCellSelected(idx + 1, 0) ? miniSelectedCellStyle : {}) }}
                  onMouseDown={(e) => startDragSelectState(e, idx + 1, 0)}
                  onMouseEnter={() => extendSelection(idx + 1, 0)}
                >
                  <AutoGrowTextarea
                    value={row.state}
                    onChange={(value) => updateCell(idx, "state", value)}
                    onPaste={(e) => {
                      const text = e.clipboardData.getData("text/plain");
                      if (!text.includes("\t") && !text.includes("\n")) return;
                      e.preventDefault();
                      applyGridPaste(idx, 0, text);
                    }}
                    disabled={disabled}
                    style={stateTextareaStyle}
                  />
                </td>
                <td
                  style={{ ...stateTdStyle, ...(isCellSelected(idx + 1, 1) ? miniSelectedCellStyle : {}) }}
                  onMouseDown={(e) => startDragSelectState(e, idx + 1, 1)}
                  onMouseEnter={() => extendSelection(idx + 1, 1)}
                >
                  <AutoGrowTextarea
                    value={row.meaning}
                    onChange={(value) => updateCell(idx, "meaning", value)}
                    onPaste={(e) => {
                      const text = e.clipboardData.getData("text/plain");
                      if (!text.includes("\t") && !text.includes("\n")) return;
                      e.preventDefault();
                      applyGridPaste(idx, 1, text);
                    }}
                    disabled={disabled}
                    style={stateTextareaStyle}
                  />
                </td>
                <td
                  style={{ ...stateTdStyle, ...(isCellSelected(idx + 1, 2) ? miniSelectedCellStyle : {}) }}
                  onMouseDown={(e) => startDragSelectState(e, idx + 1, 2)}
                  onMouseEnter={() => extendSelection(idx + 1, 2)}
                >
                  <AutoGrowTextarea
                    value={row.enterCondition}
                    onChange={(value) => updateCell(idx, "enterCondition", value)}
                    onPaste={(e) => {
                      const text = e.clipboardData.getData("text/plain");
                      if (!text.includes("\t") && !text.includes("\n")) return;
                      e.preventDefault();
                      applyGridPaste(idx, 2, text);
                    }}
                    disabled={disabled}
                    style={stateTextareaStyle}
                  />
                </td>
                <td
                  style={{ ...stateTdStyle, ...(isCellSelected(idx + 1, 3) ? miniSelectedCellStyle : {}) }}
                  onMouseDown={(e) => startDragSelectState(e, idx + 1, 3)}
                  onMouseEnter={() => extendSelection(idx + 1, 3)}
                >
                  <AutoGrowTextarea
                    value={row.exitCondition}
                    onChange={(value) => updateCell(idx, "exitCondition", value)}
                    onPaste={(e) => {
                      const text = e.clipboardData.getData("text/plain");
                      if (!text.includes("\t") && !text.includes("\n")) return;
                      e.preventDefault();
                      applyGridPaste(idx, 3, text);
                    }}
                    disabled={disabled}
                    style={stateTextareaStyle}
                  />
                </td>
                {extraHeaders.map((_, extraIdx) => (
                  <td
                    key={`state-extra-cell-${idx}-${extraIdx}`}
                    style={{ ...stateTdStyle, ...(isCellSelected(idx + 1, 4 + extraIdx) ? miniSelectedCellStyle : {}) }}
                    onMouseDown={(e) => startDragSelectState(e, idx + 1, 4 + extraIdx)}
                    onMouseEnter={() => extendSelection(idx + 1, 4 + extraIdx)}
                  >
                    <AutoGrowTextarea
                      value={row.extras[extraIdx] ?? ""}
                      onChange={(value) => updateExtraCell(idx, extraIdx, value)}
                      onPaste={(e) => {
                        const text = e.clipboardData.getData("text/plain");
                        if (!text.includes("\t") && !text.includes("\n")) return;
                        e.preventDefault();
                        applyGridPaste(idx, 4 + extraIdx, text);
                      }}
                      disabled={disabled}
                      style={stateTextareaStyle}
                    />
                  </td>
                ))}
                <td style={stateActionTdStyle}>
                  {!disabled && (
                    <button type="button" data-editable="true" onClick={() => removeRow(idx)} style={apiIconButtonStyle} title="상태 행 삭제" aria-label="상태 행 삭제">
                      <span style={trashIconStyle}>🗑</span>
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {!disabled && (
              <tr>
                <td style={stateActionTdStyle}>
                  <button type="button" data-editable="true" onClick={addRow} style={apiIconButtonStyle} title="상태 행 추가" aria-label="상태 행 추가">
                    +
                  </button>
                </td>
                <td colSpan={5 + extraHeaders.length} style={apiAddRowCellStyle} />
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
});

const OutputSchemaSheetEditor = memo(function OutputSchemaSheetEditor({
  spec,
  disabled,
  onSpecChange,
}: {
  spec: string;
  disabled: boolean;
  onSpecChange: (value: string) => void;
}) {
  const parsed = useMemo(() => parseOutputSchemaSheet(spec), [spec]);
  const [rows, setRows] = useState<OutputSchemaSheetRow[]>(() => parsed.rows);
  const [extraHeaders, setExtraHeaders] = useState<string[]>(() => parsed.extraHeaders);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const [dropPosition, setDropPosition] = useState<"before" | "after">("before");
  const { containerRef, isCellSelected, startSelection, extendSelection, handleCopy, handleKeyDown } = useMiniTableSelection({
    rowCount: rows.length + 1,
    colCount: 4 + extraHeaders.length,
    getCellText: (rowIndex, colIndex) => {
      if (rowIndex === 0) {
        if (colIndex === 0) return "필드 (Field)";
        if (colIndex === 1) return "타입 (Type)";
        if (colIndex === 2) return "설명 (Description)";
        if (colIndex === 3) return "필수 (Required)";
        return extraHeaders[colIndex - 4] ?? "";
      }
      const row = rows[rowIndex - 1];
      if (!row) return "";
      if (colIndex === 0) return row.field;
      if (colIndex === 1) return row.type;
      if (colIndex === 2) return row.description;
      if (colIndex === 3) return normalizeRequiredValue(row.required);
      return row.extras[colIndex - 4] ?? "";
    },
  });

  useEffect(() => {
    setRows(parsed.rows);
    setExtraHeaders(parsed.extraHeaders);
  }, [parsed]);

  useEffect(() => {
    const nextSpec = stringifyOutputSchemaSheet(rows, extraHeaders);
    if (nextSpec === spec) return;
    onSpecChange(nextSpec);
  }, [extraHeaders, onSpecChange, rows, spec]);

  function updateCell(index: number, key: keyof OutputSchemaSheetRow, value: string) {
    setRows((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [key]: value };
      return next;
    });
  }

  function addRow() {
    setRows((prev) => [...prev, { field: "", type: "string", required: "ON", description: "", extras: Array.from({ length: extraHeaders.length }, () => "") }]);
  }

  function removeRow(index: number) {
    setRows((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((_, i) => i !== index);
    });
  }

  function moveRow(from: number, to: number) {
    if (from === to || from < 0 || to < 0 || from >= rows.length || to >= rows.length) return;
    setRows((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }

  function addColumnRight() {
    setExtraHeaders((prev) => [...prev, `추가 항목 ${prev.length + 1}`]);
    setRows((prev) => prev.map((row) => ({ ...row, extras: [...row.extras, ""] })));
  }

  function updateExtraHeader(index: number, value: string) {
    setExtraHeaders((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  }

  function removeExtraColumn(index: number) {
    setExtraHeaders((prev) => prev.filter((_, i) => i !== index));
    setRows((prev) =>
      prev.map((row) => ({
        ...row,
        extras: row.extras.filter((_, i) => i !== index),
      }))
    );
  }

  function updateExtraCell(rowIndex: number, colIndex: number, value: string) {
    setRows((prev) => {
      const next = [...prev];
      const extras = [...next[rowIndex].extras];
      extras[colIndex] = value;
      next[rowIndex] = { ...next[rowIndex], extras };
      return next;
    });
  }

  function applyGridPaste(startRow: number, startCol: number, text: string) {
    const grid = parseClipboardGrid(text);
    if (grid.length === 0) return;
    setRows((prev) => {
      const next = [...prev];
      for (let r = 0; r < grid.length; r += 1) {
        const rowIndex = startRow + r;
        if (!next[rowIndex]) break;
        for (let c = 0; c < grid[r].length; c += 1) {
          const colIndex = startCol + c;
          const value = grid[r][c];
          if (colIndex === 0) next[rowIndex] = { ...next[rowIndex], field: value };
          else if (colIndex === 1) next[rowIndex] = { ...next[rowIndex], type: value };
          else if (colIndex === 2) next[rowIndex] = { ...next[rowIndex], description: value };
          else if (colIndex === 3) next[rowIndex] = { ...next[rowIndex], required: normalizeRequiredValue(value) };
          else {
            const extraIndex = colIndex - 4;
            if (extraIndex < 0 || extraIndex >= extraHeaders.length) continue;
            const extras = [...next[rowIndex].extras];
            extras[extraIndex] = value;
            next[rowIndex] = { ...next[rowIndex], extras };
          }
        }
      }
      return next;
    });
  }

  function startDragSelectOutput(e: React.MouseEvent, rowIndex: number, colIndex: number) {
    startSelection(rowIndex, colIndex, e.target);
  }

  return (
    <div
      data-editable="true"
      style={stateSheetWrapStyle}
      ref={containerRef}
      tabIndex={0}
      onCopy={handleCopy}
      onKeyDown={handleKeyDown}
    >
      <div data-editable="true" style={stateSheetScrollStyle}>
        <table style={stateTableStyle}>
          <colgroup>
            <col style={{ width: 34 }} />
            <col />
            <col />
            <col />
            <col style={{ width: 96 }} />
            {extraHeaders.map((_, idx) => (
              <col key={`out-extra-col-${idx}`} />
            ))}
            <col style={{ width: 44 }} />
          </colgroup>
          <thead>
            <tr>
              <th style={apiActionThStyle} />
              <th
                style={{ ...stateThStyle, ...(isCellSelected(0, 0) ? miniSelectedCellStyle : {}) }}
                onMouseDown={(e) => startDragSelectOutput(e, 0, 0)}
                onMouseEnter={() => extendSelection(0, 0)}
              >
                필드 (Field)
              </th>
              <th
                style={{ ...stateThStyle, ...(isCellSelected(0, 1) ? miniSelectedCellStyle : {}) }}
                onMouseDown={(e) => startDragSelectOutput(e, 0, 1)}
                onMouseEnter={() => extendSelection(0, 1)}
              >
                타입 (Type)
              </th>
              <th
                style={{ ...stateThStyle, ...(isCellSelected(0, 2) ? miniSelectedCellStyle : {}) }}
                onMouseDown={(e) => startDragSelectOutput(e, 0, 2)}
                onMouseEnter={() => extendSelection(0, 2)}
              >
                설명 (Description)
              </th>
              <th
                style={{ ...stateThStyle, ...(isCellSelected(0, 3) ? miniSelectedCellStyle : {}) }}
                onMouseDown={(e) => startDragSelectOutput(e, 0, 3)}
                onMouseEnter={() => extendSelection(0, 3)}
              >
                필수 (Required)
              </th>
              {extraHeaders.map((header, idx) => (
                <th
                  key={`out-extra-head-${idx}`}
                  style={{ ...apiThStyle, ...(isCellSelected(0, 4 + idx) ? miniSelectedCellStyle : {}) }}
                  onMouseDown={(e) => startDragSelectOutput(e, 0, 4 + idx)}
                  onMouseEnter={() => extendSelection(0, 4 + idx)}
                >
                  <div style={apiHeaderCellInnerStyle}>
                    <AutoGrowTextarea value={header} onChange={(value) => updateExtraHeader(idx, value)} disabled={disabled} style={apiHeaderInputStyle} />
                    {!disabled && (
                      <button
                        type="button"
                        data-editable="true"
                        onClick={() => removeExtraColumn(idx)}
                        style={apiHeaderDeleteButtonStyle}
                        title="이 컬럼 삭제"
                        aria-label="이 컬럼 삭제"
                      >
                        ×
                      </button>
                    )}
                  </div>
                </th>
              ))}
              <th style={apiActionThStyle}>
                {!disabled && (
                  <button type="button" data-editable="true" onClick={addColumnRight} style={apiIconButtonStyle} title="오른쪽에 컬럼 추가" aria-label="오른쪽에 컬럼 추가">
                    +
                  </button>
                )}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr
                key={`output-row-${idx}`}
                style={{
                  ...(dropIndex === idx && dropPosition === "before" ? { borderTop: "2px solid #3b82f6" } : {}),
                  ...(dropIndex === idx && dropPosition === "after" ? { borderBottom: "2px solid #3b82f6" } : {}),
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  const rect = (e.currentTarget as HTMLTableRowElement).getBoundingClientRect();
                  const pos: "before" | "after" = e.clientY < rect.top + rect.height / 2 ? "before" : "after";
                  setDropIndex(idx);
                  setDropPosition(pos);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragIndex === null || dropIndex === null) return;
                  let target = dropIndex;
                  if (dropPosition === "after") target += 1;
                  if (dragIndex < target) target -= 1;
                  target = Math.max(0, Math.min(rows.length - 1, target));
                  moveRow(dragIndex, target);
                  setDragIndex(null);
                  setDropIndex(null);
                }}
                onDragLeave={() => setDropIndex(null)}
              >
                <td style={stateActionTdStyle}>
                  {!disabled && (
                    <button
                      type="button"
                      data-editable="true"
                      draggable
                      onDragStart={() => setDragIndex(idx)}
                      onDragEnd={() => {
                        setDragIndex(null);
                        setDropIndex(null);
                      }}
                      style={apiDragButtonStyle}
                      title="드래그해서 순서 변경"
                      aria-label="출력 필드 순서 변경"
                    >
                      ≡
                    </button>
                  )}
                </td>
                <td
                  style={{ ...stateTdStyle, ...(isCellSelected(idx + 1, 0) ? miniSelectedCellStyle : {}) }}
                  onMouseDown={(e) => startDragSelectOutput(e, idx + 1, 0)}
                  onMouseEnter={() => extendSelection(idx + 1, 0)}
                >
                  <AutoGrowTextarea
                    value={row.field}
                    onChange={(value) => updateCell(idx, "field", value)}
                    onPaste={(e) => {
                      const text = e.clipboardData.getData("text/plain");
                      if (!text.includes("\t") && !text.includes("\n")) return;
                      e.preventDefault();
                      applyGridPaste(idx, 0, text);
                    }}
                    disabled={disabled}
                    style={stateTextareaStyle}
                  />
                </td>
                <td
                  style={{ ...stateTdStyle, ...(isCellSelected(idx + 1, 1) ? miniSelectedCellStyle : {}) }}
                  onMouseDown={(e) => startDragSelectOutput(e, idx + 1, 1)}
                  onMouseEnter={() => extendSelection(idx + 1, 1)}
                >
                  <AutoGrowTextarea
                    value={row.type}
                    onChange={(value) => updateCell(idx, "type", value)}
                    onPaste={(e) => {
                      const text = e.clipboardData.getData("text/plain");
                      if (!text.includes("\t") && !text.includes("\n")) return;
                      e.preventDefault();
                      applyGridPaste(idx, 1, text);
                    }}
                    disabled={disabled}
                    style={stateTextareaStyle}
                  />
                </td>
                <td
                  style={{ ...stateTdStyle, ...(isCellSelected(idx + 1, 2) ? miniSelectedCellStyle : {}) }}
                  onMouseDown={(e) => startDragSelectOutput(e, idx + 1, 2)}
                  onMouseEnter={() => extendSelection(idx + 1, 2)}
                >
                  <AutoGrowTextarea
                    value={row.description}
                    onChange={(value) => updateCell(idx, "description", value)}
                    onPaste={(e) => {
                      const text = e.clipboardData.getData("text/plain");
                      if (!text.includes("\t") && !text.includes("\n")) return;
                      e.preventDefault();
                      applyGridPaste(idx, 2, text);
                    }}
                    disabled={disabled}
                    style={stateTextareaStyle}
                  />
                </td>
                <td
                  style={{ ...stateTdStyle, ...(isCellSelected(idx + 1, 3) ? miniSelectedCellStyle : {}) }}
                  onMouseDown={(e) => startDragSelectOutput(e, idx + 1, 3)}
                  onMouseEnter={() => extendSelection(idx + 1, 3)}
                >
                  <div style={{ display: "grid", placeItems: "center", minHeight: 30 }}>
                    <button
                      type="button"
                      data-editable="true"
                      disabled={disabled}
                      onClick={() => updateCell(idx, "required", normalizeRequiredValue(row.required) === "ON" ? "OFF" : "ON")}
                      style={{
                        ...fieldToggleStyle,
                        ...(normalizeRequiredValue(row.required) === "ON" ? fieldToggleOnStyle : fieldToggleOffStyle),
                      }}
                      aria-label="필수 여부 토글"
                      title="필수 여부 토글"
                    >
                      {normalizeRequiredValue(row.required) || ""}
                    </button>
                  </div>
                </td>
                {extraHeaders.map((_, extraIdx) => (
                  <td
                    key={`out-extra-cell-${idx}-${extraIdx}`}
                    style={{ ...stateTdStyle, ...(isCellSelected(idx + 1, 4 + extraIdx) ? miniSelectedCellStyle : {}) }}
                    onMouseDown={(e) => startDragSelectOutput(e, idx + 1, 4 + extraIdx)}
                    onMouseEnter={() => extendSelection(idx + 1, 4 + extraIdx)}
                  >
                    <AutoGrowTextarea
                      value={row.extras[extraIdx] ?? ""}
                      onChange={(value) => updateExtraCell(idx, extraIdx, value)}
                      onPaste={(e) => {
                        const text = e.clipboardData.getData("text/plain");
                        if (!text.includes("\t") && !text.includes("\n")) return;
                        e.preventDefault();
                        applyGridPaste(idx, 4 + extraIdx, text);
                      }}
                      disabled={disabled}
                      style={stateTextareaStyle}
                    />
                  </td>
                ))}
                <td style={stateActionTdStyle}>
                  {!disabled && (
                    <button type="button" data-editable="true" onClick={() => removeRow(idx)} style={apiIconButtonStyle} title="출력 필드 삭제" aria-label="출력 필드 삭제">
                      <span style={trashIconStyle}>🗑</span>
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {!disabled && (
              <tr>
                <td style={stateActionTdStyle}>
                  <button type="button" data-editable="true" onClick={addRow} style={apiIconButtonStyle} title="출력 필드 추가" aria-label="출력 필드 추가">
                    +
                  </button>
                </td>
                <td colSpan={5 + extraHeaders.length} style={apiAddRowCellStyle} />
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
});

const AutoGrowTextarea = memo(function AutoGrowTextarea({
  value,
  onChange,
  onPaste,
  disabled,
  style,
}: {
  value: string;
  onChange: (value: string) => void;
  onPaste?: (e: React.ClipboardEvent<HTMLTextAreaElement>) => void;
  disabled: boolean;
  style: CSSProperties;
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  useEffect(() => {
    const el = ref.current;
    const parent = el?.parentElement;
    if (!el || !parent) return;
    const syncHeight = () => {
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    };
    const observer = new ResizeObserver(syncHeight);
    observer.observe(parent);
    return () => observer.disconnect();
  }, []);

  return (
    <textarea
      ref={ref}
      data-editable="true"
      disabled={disabled}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onPaste={onPaste}
      style={style}
    />
  );
});

const InputSchemaBuilder = memo(function InputSchemaBuilder({
  taskTypes,
  disabled,
  onSpecChange,
  onCopyDone,
}: {
  taskTypes: Step1AiTaskType[];
  disabled: boolean;
  onSpecChange: (value: string) => void;
  onCopyDone: () => void;
}) {
  const selectedTemplates = useMemo(
    () => TASK_SCHEMA_TEMPLATES.filter((t) => taskTypes.includes(t.key)),
    [taskTypes]
  );
  const [fieldOnMap, setFieldOnMap] = useState<Record<string, boolean>>(() => {
    const nextOn: Record<string, boolean> = {};
    for (const task of selectedTemplates) {
      for (const field of task.fields) {
        nextOn[`${task.key}:${field.key}`] = field.defaultOn;
      }
    }
    return nextOn;
  });
  const [showMoreMap, setShowMoreMap] = useState<Record<Step1AiTaskType, boolean>>(() => {
    const nextMore: Record<Step1AiTaskType, boolean> = {} as Record<Step1AiTaskType, boolean>;
    for (const task of selectedTemplates) nextMore[task.key] = false;
    return nextMore;
  });
  const [sharedModeMap, setSharedModeMap] = useState<Record<string, "shared" | "per_task">>({});
  const lastSpecRef = useRef("");

  const commonCandidates = useMemo(() => {
    const count = new Map<string, { label: string; tasks: Step1AiTaskType[] }>();
    for (const task of selectedTemplates) {
      for (const field of task.fields) {
        const key = `${task.key}:${field.key}`;
        if (!fieldOnMap[key]) continue;
        const current = count.get(field.key);
        if (!current) {
          count.set(field.key, { label: field.label, tasks: [task.key] });
        } else {
          current.tasks.push(task.key);
        }
      }
    }
    return Array.from(count.entries())
      .filter(([, v]) => v.tasks.length >= 2)
      .map(([fieldKey, v]) => ({ fieldKey, label: v.label, tasks: v.tasks }));
  }, [selectedTemplates, fieldOnMap]);

  const specText = useMemo(() => {
    const blocks: string[] = [];
    for (const candidate of commonCandidates) {
      if ((sharedModeMap[candidate.fieldKey] ?? "per_task") === "shared") {
        blocks.push(renderFieldTemplateBlock(candidate.label));
      }
    }
    for (const task of selectedTemplates) {
      for (const field of task.fields) {
        const key = `${task.key}:${field.key}`;
        if (!fieldOnMap[key]) continue;
        const isSharedCandidate = commonCandidates.some((c) => c.fieldKey === field.key);
        if (isSharedCandidate && (sharedModeMap[field.key] ?? "per_task") === "shared") continue;
        blocks.push(renderFieldTemplateBlock(`${toKoreanTaskLabel(task.label)} - ${field.label}`));
      }
    }
    if (blocks.length === 0) return "";
    return ["[입력 스키마 조건]", ...blocks].join("\n\n");
  }, [commonCandidates, fieldOnMap, selectedTemplates, sharedModeMap]);

  useEffect(() => {
    if (lastSpecRef.current === specText) return;
    lastSpecRef.current = specText;
    onSpecChange(specText);
  }, [onSpecChange, specText]);

  function copyToClipboard() {
    if (!specText.trim()) return;
    navigator.clipboard.writeText(specText).then(onCopyDone).catch(() => {
      // ignore clipboard error
    });
  }

  if (selectedTemplates.length === 0) {
    return <div style={builderEmptyStyle}>STEP1에서 작업 유형(Task Type)을 선택하면 입력 스키마 후보가 표시됩니다.</div>;
  }

  return (
    <div style={builderWrapStyle}>
      {commonCandidates.length > 0 && (
        <div style={builderSectionStyle}>
          <div style={builderSectionTitleStyle}>공통 입력 여부</div>
          {commonCandidates.map((candidate) => (
            <div key={candidate.fieldKey} style={sharedRowStyle}>
              <div style={{ fontSize: 13, color: "#1f2937" }}>{candidate.label}</div>
              <div style={modeToggleMiniStyle}>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => setSharedModeMap((prev) => ({ ...prev, [candidate.fieldKey]: "shared" }))}
                  style={{
                    ...modeToggleMiniOptionStyle,
                    ...((sharedModeMap[candidate.fieldKey] ?? "per_task") === "shared" ? modeToggleMiniActiveStyle : {}),
                  }}
                >
                  공통 입력
                </button>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => setSharedModeMap((prev) => ({ ...prev, [candidate.fieldKey]: "per_task" }))}
                  style={{
                    ...modeToggleMiniOptionStyle,
                    ...((sharedModeMap[candidate.fieldKey] ?? "per_task") === "per_task" ? modeToggleMiniActiveStyle : {}),
                  }}
                >
                  개별 입력
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={builderSectionPlainStyle}>
        <div style={builderTitleRowStyle}>
          <div style={builderSectionTitleStyle}>선택된 작업 유형에 맞는 입력 타입을 선택해요</div>
          <button type="button" onClick={copyToClipboard} disabled={disabled} style={copyIconButtonStyle} title="선택한 입력 스키마 복사">
            ⧉
          </button>
        </div>
        {selectedTemplates.map((task) => (
          <div key={task.key} style={taskCardStyle}>
            <div style={taskCardTitleStyle}>{task.label}</div>
            {task.fields.filter((f) => !f.more).map((field) => {
              const fieldKey = `${task.key}:${field.key}`;
              const sharedCandidate = commonCandidates.find((c) => c.fieldKey === field.key);
              if (sharedCandidate && (sharedModeMap[field.key] ?? "per_task") === "shared") return null;
              const on = Boolean(fieldOnMap[fieldKey]);
              return (
                <div key={fieldKey} style={fieldRowStyle}>
                  <span style={fieldLabelStyle}>{field.label}</span>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => setFieldOnMap((prev) => ({ ...prev, [fieldKey]: !on }))}
                    style={{ ...fieldToggleStyle, ...(on ? fieldToggleOnStyle : fieldToggleOffStyle) }}
                  >
                    {on ? "ON" : "OFF"}
                  </button>
                </div>
              );
            })}
            <button
              type="button"
              disabled={disabled}
              onClick={() => setShowMoreMap((prev) => ({ ...prev, [task.key]: !prev[task.key] }))}
              style={moreToggleStyle}
            >
              {showMoreMap[task.key] ? "▾ 더보기 닫기" : "▸ 더보기"}
            </button>
            {showMoreMap[task.key] &&
              task.fields
                .filter((f) => f.more)
                .map((field) => {
                  const fieldKey = `${task.key}:${field.key}`;
                  const sharedCandidate = commonCandidates.find((c) => c.fieldKey === field.key);
                  if (sharedCandidate && (sharedModeMap[field.key] ?? "per_task") === "shared") return null;
                  const on = Boolean(fieldOnMap[fieldKey]);
                  return (
                    <div key={fieldKey} style={fieldRowStyle}>
                      <span style={fieldLabelStyle}>{field.label}</span>
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => setFieldOnMap((prev) => ({ ...prev, [fieldKey]: !on }))}
                        style={{ ...fieldToggleStyle, ...(on ? fieldToggleOnStyle : fieldToggleOffStyle) }}
                      >
                        {on ? "ON" : "OFF"}
                      </button>
                    </div>
                  );
                })}
          </div>
        ))}
      </div>
    </div>
  );
});

const InputSchemaSheetPicker = memo(function InputSchemaSheetPicker({
  taskTypes,
  disabled,
  onSpecChange,
  onCopyDone,
}: {
  taskTypes: Step1AiTaskType[];
  disabled: boolean;
  onSpecChange: (value: string) => void;
  onCopyDone: () => void;
}) {
  const selectedTemplates = useMemo(
    () => TASK_SCHEMA_TEMPLATES.filter((t) => taskTypes.includes(t.key)),
    [taskTypes]
  );
  const [fieldOnMap, setFieldOnMap] = useState<Record<string, boolean>>(() => {
    const nextOn: Record<string, boolean> = {};
    for (const task of selectedTemplates) {
      for (const field of task.fields) {
        nextOn[`${task.key}:${field.key}`] = field.defaultOn;
      }
    }
    return nextOn;
  });
  const [showMoreMap, setShowMoreMap] = useState<Record<Step1AiTaskType, boolean>>(() => {
    const nextMore: Record<Step1AiTaskType, boolean> = {} as Record<Step1AiTaskType, boolean>;
    for (const task of selectedTemplates) nextMore[task.key] = false;
    return nextMore;
  });
  const [sharedModeMap, setSharedModeMap] = useState<Record<string, "shared" | "per_task">>({});
  const lastSpecRef = useRef("");

  const commonCandidates = useMemo(() => {
    const count = new Map<string, { key: string; label: string; tasks: Step1AiTaskType[] }>();
    for (const task of selectedTemplates) {
      for (const field of task.fields) {
        const fieldOn = Boolean(fieldOnMap[`${task.key}:${field.key}`]);
        if (!fieldOn) continue;
        const candidateKey = field.key;
        const current = count.get(candidateKey);
        if (!current) {
          count.set(candidateKey, { key: field.key, label: field.label, tasks: [task.key] });
        } else {
          if (field.label.length < current.label.length) current.label = field.label;
          current.tasks.push(task.key);
        }
      }
    }
    return Array.from(count.values()).filter((v) => v.tasks.length >= 2);
  }, [fieldOnMap, selectedTemplates]);

  const specText = useMemo(() => {
    const blocks: string[] = [];
    const sharedFields = commonCandidates.filter((c) => (sharedModeMap[c.key] ?? "per_task") === "shared");
    if (sharedFields.length > 0) {
      blocks.push(["공통 입력 여부\t상태", ...sharedFields.map((field) => `${field.label}\t공통 입력`)].join("\n"));
    }
    for (const task of selectedTemplates) {
      const visibleFields = task.fields.filter((field) => {
        if (field.more && !showMoreMap[task.key]) return false;
        const shared = sharedFields.some((s) => s.key === field.key);
        return !shared;
      });
      if (visibleFields.length === 0) continue;
      const onCount = task.fields.filter((field) => {
        if (sharedFields.some((s) => s.key === field.key)) return false;
        return fieldOnMap[`${task.key}:${field.key}`];
      }).length;
      const lines = [
        `${task.label}\tON ${onCount}`,
        "입력 타입\t상태",
        ...visibleFields.map((field) => `${field.label}\t${fieldOnMap[`${task.key}:${field.key}`] ? "ON" : "OFF"}`),
      ];
      blocks.push(lines.join("\n"));
    }
    return blocks.join("\n\n");
  }, [commonCandidates, fieldOnMap, selectedTemplates, sharedModeMap, showMoreMap]);

  const templateText = useMemo(() => {
    const blocks: string[] = [];
    const sharedFields = commonCandidates.filter((c) => (sharedModeMap[c.key] ?? "per_task") === "shared");
    for (const shared of sharedFields) {
      blocks.push(renderFieldTemplateBlock(shared.label));
    }
    for (const task of selectedTemplates) {
      for (const field of task.fields) {
        const on = Boolean(fieldOnMap[`${task.key}:${field.key}`]);
        if (!on) continue;
        if ((sharedModeMap[field.key] ?? "per_task") === "shared") continue;
        blocks.push(renderFieldTemplateBlock(`${toKoreanTaskLabel(task.label)} - ${field.label}`));
      }
    }
    if (blocks.length === 0) return "";
    return ["[입력 스키마 조건]", ...blocks].join("\n\n");
  }, [commonCandidates, fieldOnMap, selectedTemplates, sharedModeMap]);

  useEffect(() => {
    if (lastSpecRef.current === specText) return;
    lastSpecRef.current = specText;
    onSpecChange(specText);
  }, [onSpecChange, specText]);

  function copyTemplateToClipboard() {
    if (!templateText.trim()) return;
    navigator.clipboard.writeText(templateText).then(onCopyDone).catch(() => {
      // ignore clipboard error
    });
  }

  if (selectedTemplates.length === 0) {
    return <div style={builderEmptyStyle}>STEP1에서 작업 유형(Task Type)을 선택하면 입력 스키마 후보가 표시됩니다.</div>;
  }

  return (
    <div data-editable="true" style={sheetPickerWrapStyle}>
      <div style={builderTitleRowStyle}>
        <div style={builderSectionTitleStyle}>선택된 작업 유형에 맞는 입력 타입을 선택해요</div>
        <button
          type="button"
          data-editable="true"
          onClick={copyTemplateToClipboard}
          disabled={disabled}
          style={copyIconButtonStyle}
          title="선택한 입력 스키마 복사"
        >
          ⧉
        </button>
      </div>
      {commonCandidates.length > 0 && (
        <div style={sheetPickerTaskBlockStyle}>
          <div style={sheetPickerTopRowStyle}>
            <div style={sheetPickerTaskTitleStyle}>공통 입력 여부</div>
          </div>
          <div style={sheetPickerGridStyle}>
            <div style={sheetPickerCommonHeaderRowStyle}>
              <div style={{ ...sheetPickerHeadCellStyle, borderRight: "1px solid #e5e7eb" }}>입력 타입</div>
              <div style={sheetPickerHeadCellStyle}>적용 방식</div>
            </div>
            {commonCandidates.map((candidate) => (
              <div key={`common-${candidate.key}`} style={sheetPickerCommonDataRowStyle}>
                <div style={sheetPickerTypeCellStyle}>{candidate.label}</div>
                <div style={sheetPickerStateCellStyle}>
                  <div style={modeToggleMiniStyle}>
                    <button
                      type="button"
                      data-editable="true"
                      disabled={disabled}
                      onClick={() => setSharedModeMap((prev) => ({ ...prev, [candidate.key]: "shared" }))}
                      style={{
                        ...modeToggleMiniOptionStyle,
                        ...((sharedModeMap[candidate.key] ?? "per_task") === "shared" ? modeToggleMiniActiveStyle : {}),
                      }}
                    >
                      공통 입력
                    </button>
                    <button
                      type="button"
                      data-editable="true"
                      disabled={disabled}
                      onClick={() => setSharedModeMap((prev) => ({ ...prev, [candidate.key]: "per_task" }))}
                      style={{
                        ...modeToggleMiniOptionStyle,
                        ...((sharedModeMap[candidate.key] ?? "per_task") === "per_task" ? modeToggleMiniActiveStyle : {}),
                      }}
                    >
                      개별 입력
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {selectedTemplates.map((task) => {
        const visibleFields = task.fields.filter((f) => {
          if (f.more && !showMoreMap[task.key]) return false;
          return (sharedModeMap[f.key] ?? "per_task") !== "shared";
        });
        const onCount = task.fields.filter((f) => {
          if ((sharedModeMap[f.key] ?? "per_task") === "shared") return false;
          return fieldOnMap[`${task.key}:${f.key}`];
        }).length;
        return (
          <div key={`sheet-task-${task.key}`} style={sheetPickerTaskBlockStyle}>
            <div style={sheetPickerTopRowStyle}>
              <div style={sheetPickerTaskTitleStyle}>{task.label}</div>
              <span style={sheetPickerMetaStyle}>ON {onCount}</span>
            </div>

            <div style={sheetPickerGridStyle}>
              <div style={sheetPickerHeaderRowStyle}>
                <div style={{ ...sheetPickerHeadCellStyle, borderRight: "1px solid #e5e7eb" }}>입력 타입</div>
                <div style={sheetPickerHeadCellStyle}>상태</div>
              </div>
              {visibleFields.map((field) => {
                const fieldKey = `${task.key}:${field.key}`;
                const on = Boolean(fieldOnMap[fieldKey]);
                return (
                  <div key={fieldKey} style={sheetPickerDataRowStyle}>
                    <div style={sheetPickerTypeCellStyle}>{field.label}</div>
                    <div style={sheetPickerStateCellStyle}>
                      <button
                        type="button"
                        data-editable="true"
                        disabled={disabled}
                        onClick={() => setFieldOnMap((prev) => ({ ...prev, [fieldKey]: !on }))}
                        style={{ ...fieldToggleStyle, ...(on ? fieldToggleOnStyle : fieldToggleOffStyle) }}
                      >
                        {on ? "ON" : "OFF"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {task.fields.some((f) => f.more) && (
              <button
                type="button"
                data-editable="true"
                disabled={disabled}
                onClick={() => setShowMoreMap((prev) => ({ ...prev, [task.key]: !prev[task.key] }))}
                style={moreToggleStyle}
              >
                {showMoreMap[task.key] ? "▾ 더보기 닫기" : "▸ 더보기"}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
});

export default function TechSpecPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = String(params?.id ?? "");
  const initialDiagramTab = useMemo<DiagramTab>(() => {
    const raw = searchParams.get("diagram");
    if (!raw) return "state";
    return DIAGRAM_TAB_META[raw as DiagramTab] ? (raw as DiagramTab) : "state";
  }, [searchParams]);
  const isDiagramOnly = useMemo(() => searchParams.get("diagramOnly") === "1", [searchParams]);

  const [locked, setLocked] = useState(true);
  const [rows, setRows] = useState<Step4Row[]>([]);
  const [savedRowsSnapshot, setSavedRowsSnapshot] = useState<Step4Row[] | null>(null);
  const [step1TaskTypes, setStep1TaskTypes] = useState<Step1AiTaskType[]>([]);
  const [inputMode, setInputMode] = useState<InputMode>("table");
  const [message, setMessage] = useState("");
  const [noteColWidth, setNoteColWidth] = useState(280);
  const [sheetViewportWidth, setSheetViewportWidth] = useState(0);
  const [isColumnResizing, setIsColumnResizing] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const [dropPosition, setDropPosition] = useState<"before" | "after">("before");
  const [activeCell, setActiveCell] = useState<SheetCell | null>(null);
  const [selectionRange, setSelectionRange] = useState<{ start: SheetCell; end: SheetCell } | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const [editingValueRowId, setEditingValueRowId] = useState<Step4RowId | null>(null);
  const [editingNoteRowId, setEditingNoteRowId] = useState<Step4RowId | null>(null);
  const [diagramTab, setDiagramTab] = useState<DiagramTab>(initialDiagramTab);
  const [rightPanelTab, setRightPanelTab] = useState<RightPanelTab>("preview");
  const [selectedRowId, setSelectedRowId] = useState<Step4RowId | null>(null);
  const [rightPanelWidth, setRightPanelWidth] = useState(560);
  const [isResizing, setIsResizing] = useState(false);
  const [isStackedLayout, setIsStackedLayout] = useState(false);
  const twoPaneRef = useRef<HTMLDivElement | null>(null);
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const deferredRows = useDeferredValue(rows);
  const maxNoteColWidthByViewport = useMemo(() => {
    if (sheetViewportWidth <= 0) return SHEET_MAX_NOTE_COL_WIDTH;
    const maxByViewport = Math.min(SHEET_MAX_NOTE_COL_WIDTH, sheetViewportWidth - SHEET_FIELD_COL_WIDTH - SHEET_MIN_VALUE_COL_WIDTH);
    return Math.max(SHEET_MIN_NOTE_COL_WIDTH, maxByViewport);
  }, [sheetViewportWidth]);
  const isNoteAutoCollapsed = !isStackedLayout && rightPanelWidth >= 560;
  const effectiveNoteColWidth = useMemo(
    () => (isNoteAutoCollapsed ? SHEET_COLLAPSED_NOTE_COL_WIDTH : Math.max(SHEET_MIN_NOTE_COL_WIDTH, Math.min(noteColWidth, maxNoteColWidthByViewport))),
    [isNoteAutoCollapsed, maxNoteColWidthByViewport, noteColWidth]
  );
  const tableGridTemplateColumns = `${SHEET_FIELD_COL_WIDTH}px minmax(${SHEET_MIN_VALUE_COL_WIDTH}px, 1fr) ${effectiveNoteColWidth}px`;

  useEffect(() => {
    if (!id) return;
    const progress = getProgress(id);
    const canAccess = canAccessTechSpec(progress);
    setLocked(!canAccess);
    if (!canAccess) {
      router.replace(`/project/${id}/policy`);
      return;
    }

    const loadedStep1 = getStep1Data(id);
    setStep1TaskTypes(loadedStep1.ai_task_types);
    const loadedStep2 = getStep2Data(id);
    const loadedStep3 = getStep3Policy(id);
    const generatedRows = generateTechSpecRows(loadedStep1, loadedStep2, loadedStep3);
    const savedRows = getStep4Rows(id);
    if (savedRows.length === 0) {
      setRows(generatedRows);
      setStep4Rows(id, generatedRows);
      setSavedRowsSnapshot(generatedRows);
      setSelectedRowId(generatedRows[0]?.rowId ?? null);
      setMessage("STEP1~3 확정 기준으로 STEP4 초안을 자동 생성했습니다.");
    } else {
      const savedMap = new Map(savedRows.map((r) => [r.rowId, r]));
      const merged = generatedRows.map((row) => {
        const saved = savedMap.get(row.rowId);
        if (!saved) return row;
        return {
          rowId: row.rowId,
          title: row.title,
          relatedTabs: row.relatedTabs,
          spec: saved.spec || row.spec,
          note: saved.note || row.note,
        };
      });
      setRows(merged);
      setStep4Rows(id, merged);
      setSavedRowsSnapshot(merged);
      setSelectedRowId((prev) => prev ?? merged[0]?.rowId ?? null);
    }
  }, [id, router]);

  const hasUnsavedChanges = useMemo(() => {
    if (!savedRowsSnapshot) return false;
    if (rows.length !== savedRowsSnapshot.length) return true;
    for (let i = 0; i < rows.length; i += 1) {
      const current = rows[i];
      const saved = savedRowsSnapshot[i];
      if (!saved) return true;
      if (current.rowId !== saved.rowId) return true;
      if (current.spec !== saved.spec) return true;
      if (current.note !== saved.note) return true;
    }
    return false;
  }, [rows, savedRowsSnapshot]);

  function updateRow(rowId: Step4RowId, key: "spec" | "note", value: string) {
    setRows((prev) => {
      let changed = false;
      const next = prev.map((row) => {
        if (row.rowId !== rowId) return row;
        if (row[key] === value) return row;
        changed = true;
        return { ...row, [key]: value };
      });
      return changed ? next : prev;
    });
  }

  function moveRow(from: number, to: number) {
    if (from === to || from < 0 || to < 0 || from >= rows.length || to >= rows.length) return;
    setRows((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
    setMessage("행 순서가 변경되었습니다. 저장해 적용하세요.");
  }

  function handleSave() {
    if (!id || locked || !hasUnsavedChanges) return;
    setStep4Rows(id, rows);
    setSavedRowsSnapshot(rows);
    addHistoryEvent(id, {
      stage: "step4",
      action: HISTORY_EVENT_TYPES.SAVE_STEP4,
      detail: "STEP4 기술 스펙 저장",
    });
    setMessage("STEP4 저장 완료");
  }

  function handleRegenerateDraft() {
    if (!id || locked) return;
    const loadedStep1 = getStep1Data(id);
    const loadedStep2 = getStep2Data(id);
    const loadedStep3 = getStep3Policy(id);
    const regenerated = generateTechSpecRows(loadedStep1, loadedStep2, loadedStep3);
    setRows(regenerated);
    setStep4Rows(id, regenerated);
    setSavedRowsSnapshot(regenerated);
    setSelectedRowId(regenerated[0]?.rowId ?? null);
    setMessage("STEP1~3 기준으로 STEP4 초안을 재생성했습니다.");
  }

  function handleConfirm() {
    if (!id || locked) return;
    if (hasUnsavedChanges) handleSave();
    setMessage("STEP4 확정 완료");
  }

  function handleOpenDiagramNewWindow() {
    const url = `/project/${id}/tech-spec?diagram=${diagramTab}&diagramOnly=1`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  const specMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const row of deferredRows) m.set(row.rowId, row.spec);
    return m;
  }, [deferredRows]);

  const diagramText = useMemo(() => {
    const apiRows = parseApiSpecRows(specMap.get("api_definition") || "");
    const api = apiRows.map((row) => `${row.method} ${row.endpoint}`.trim()).filter(Boolean);
    const stateSpec = specMap.get("state_model") || "input -> generating -> draft -> user_edit -> review_requested -> published";
    const states = getStateNamesFromStateModelSpec(stateSpec);
    const storage = specMap.get("storage_structure") || "posts / post_drafts";
    const logs = specMap.get("log_structure") || "logs";
    const fallback = specMap.get("fallback_conditions") || "retry -> failed";
    const monitor = specMap.get("monitoring_items") || "오류율/응답시간/사용자 수정률";
    const execution = specMap.get("execution_structure") || "초안 생성 동기 처리 / 게시 승인 비동기 처리";
    const inputSchema = specMap.get("input_schema") || "topic, platform, tone";
    const outputSchema = summarizeOutputSchema(specMap.get("output_schema") || "");
    const guardrail = specMap.get("guardrail_policy") || "confidence < 0.7 경고 + 정책 필터";
    const model = specMap.get("model_conditions") || "기본 모델 + 조건부 상위 모델";
    const toStateDisplayLabel = (state: string) => {
      const key = state.trim().toLowerCase();
      if (key === "input") return "입력 (Input)";
      if (key === "generating") return "생성 중 (Generating)";
      if (key === "draft") return "초안 (Draft)";
      if (key === "revising") return "개선 중 (Revising)";
      if (key === "review_required") return "검토 대기 (Review Required)";
      if (key === "draft_saved") return "초안 저장 (Draft Saved)";
      if (key === "published") return "게시 완료 (Published)";
      if (key === "failed") return "실패 (Failed)";
      if (!state.trim()) return "상태 미정 (Unknown State)";
      return `${state} (${state})`;
    };

    if (diagramTab === "state") {
      const safeStates = states.length > 0 ? states : ["input", "generating", "draft", "publish", "failed"];
      const lines = [
        "flowchart LR",
        "  L1[상태 (State)] --> L2[상태 전이 (State Transition)]",
        "  L2 --> L3[종료 조건 (Exit Condition)]",
      ];
      safeStates.forEach((st, idx) => {
        lines.push(`  S${idx}[${toStateDisplayLabel(st)}]`);
        if (idx > 0) lines.push(`  S${idx - 1} -->|상태 전이 (State Transition)| S${idx}`);
      });
      lines.push(`  S${Math.max(0, safeStates.length - 2)} --> FAIL[실패 종료 (Failed)]`);
      lines.push(`  S${Math.max(0, safeStates.length - 1)} --> END[게시 종료 (Published)]`);
      return lines.join("\n");
    }

    if (diagramTab === "ia") {
      const safeStates = states.length > 0 ? states : ["input", "generating", "draft", "publish"];
      const lines = ["flowchart LR", "  HOME[Project Hub] --> EDIT[STEP4 스펙 편집]"];
      safeStates.forEach((st, idx) => {
        lines.push(`  N${idx}[${st}]`);
        if (idx === 0) lines.push(`  EDIT --> N0`);
        if (idx > 0) lines.push(`  N${idx - 1} --> N${idx}`);
      });
      lines.push("  N" + (safeStates.length - 1) + " --> AR[Artifacts]");
      return lines.join("\n");
    }

    if (diagramTab === "sequence") {
      const mainApi = api[1] || api[0] || "POST /posts/{id}/generate";
      const saveApi = api[2] || "PATCH /posts/{id}";
      const approveApi = api[4] || api[3] || "POST /posts/{id}/approve";
      return [
        "sequenceDiagram",
        "  participant U as 요청자 (User)",
        "  participant UI as PRISM UI",
        "  participant API as 백엔드 API (Backend API)",
        "  participant M as AI 모델 (AI Model)",
        "  participant DB as 데이터베이스 (DB)",
        "  U->>UI: 요청 (Request)",
        `  UI->>API: 요청 전달 (Request) - ${mainApi}`,
        "  API->>M: 모델 호출 (Model Call)",
        "  M-->>API: 모델 응답 (Model Response)",
        `  API->>DB: 상태 반영 (State Update) - ${saveApi} / 초안 저장 및 로그 (Save Draft + Logs)`,
        "  API-->>UI: 상태 반영 결과 (State Update Result)",
        `  UI->>API: 승인 요청 (Request) - ${approveApi}`,
        "  API->>DB: 상태 반영 (State Update) - 전이 및 감사 로그 (Transition + Audit Log)",
        "  UI-->>U: 결과 반환 (Response)",
      ].join("\n");
    }

    if (diagramTab === "dataflow") {
      return [
        "flowchart LR",
        `  IN[Input: ${inputSchema.replace(/\n/g, " / ")}] --> PRE[Validation/Normalize]`,
        `  PRE --> MODEL[Model: ${model}]`,
        `  MODEL --> POST[Post-process: ${guardrail.replace(/\n/g, " / ")}]`,
        `  POST --> STORE[${storage.replace(/\n/g, " / ")}]`,
        `  POST --> LOGS[${logs.replace(/\n/g, " / ")}]`,
        `  STORE --> OUT[Output: ${outputSchema.replace(/\n/g, " / ")}]`,
      ].join("\n");
    }

    if (diagramTab === "error_retry") {
      return [
        "flowchart TD",
        "  REQ[Generate Request] --> CALL[Model Call]",
        "  CALL --> OK{Success?}",
        "  OK -->|Yes| SAVE[Save Draft]",
        "  OK -->|No| TYPE{4xx or 5xx}",
        "  TYPE -->|4xx| BAD[Validation/Policy Error]",
        "  TYPE -->|5xx| RETRY[Retry with backoff]",
        "  RETRY --> RETRY_OK{Recovered?}",
        "  RETRY_OK -->|Yes| SAVE",
        "  RETRY_OK -->|No| FAIL[failed 상태 전환 + 수동 모드]",
      ].join("\n");
    }

    if (diagramTab === "auth") {
      return [
        "flowchart LR",
        "  USER[user] --> API1[POST /posts]",
        "  USER --> API2[POST /posts/{id}/generate]",
        "  USER --> API3[PATCH /posts/{id}]",
        "  USER --> API4[POST /posts/{id}/publish-request]",
        "  APPROVER[approver] --> API5[POST /posts/{id}/approve]",
        "  SYSTEM[system] --> AUDIT[audit log write]",
        "  API5 --> AUDIT",
      ].join("\n");
    }

    if (diagramTab === "observability") {
      const apiEndpoints = apiRows.map((row) => row.endpoint.trim().toLowerCase()).filter(Boolean);
      const stateNames = states.map((s) => s.trim().toLowerCase()).filter(Boolean);
      const outputFields = parseOutputSchemaSheet(specMap.get("output_schema") || "")
        .rows.map((row) => row.field.trim().toLowerCase())
        .filter(Boolean);

      const hasReview =
        stateNames.includes("review_required") ||
        apiEndpoints.some((endpoint) => endpoint.includes("approve") || endpoint.includes("publish-request"));

      const stageOrder: Array<{ id: string; label: string }> = [
        { id: "VAL", label: "검증 단계 (Validation)" },
        { id: "MOD", label: "모델 호출 단계 (Model Call)" },
        { id: "PER", label: "저장 단계 (Persist)" },
      ];
      if (hasReview) stageOrder.push({ id: "REV", label: "검토 단계 (Review)" });
      stageOrder.push({ id: "RES", label: "응답 단계 (Response)" });

      const outputRecommended = [
        ...new Set(outputFields.filter((field) => ["trace_id", "confidence"].includes(field))),
      ];
      const outputRecommendedLabel =
        outputRecommended.length > 0 ? outputRecommended.join(", ") : "confidence, trace_id";

      return [
        "flowchart LR",
        ...stageOrder.map((stage) => `  ${stage.id}[${stage.label}]`),
        ...stageOrder.slice(1).map((stage, index) => `  ${stageOrder[index].id} --> ${stage.id}`),
        "  RES --> RCA",
        "  MET[지표 (Metrics)]",
        "  MODM[모델 호출 지표 (Model Call): latency_ms, token_usage, cost_estimate]",
        "  PERM[저장 지표 (Persist): storage_success_rate]",
        ...(hasReview ? ["  REVM[검토 지표 (Review): manual_intervention_rate, edit_rate]"] : []),
        "  FLOWM[전체 흐름 지표 (Flow): end_to_end_latency]",
        `  OUTM[출력 스키마 기반 권장 (Output Schema): ${outputRecommendedLabel}]`,
        "  DSH[대시보드 (Dashboard)]",
        "  LOG[로그 (Logs)]",
        "  TRC[추적 (Trace)]",
        `  MON[운영 지표 요약 (Monitoring): ${monitor.replace(/\n/g, " / ")}]`,
        "  ALT[알림 규칙 (Alert Rule)]",
        "  RCA[원인 분석 (Root Cause)]",
        `  VAL --> MET`,
        ...(hasReview ? ["  REV --> LOG"] : ["  PER --> LOG"]),
        "  MET --> MODM",
        "  MET --> PERM",
        ...(hasReview ? ["  MET --> REVM"] : []),
        "  MET --> FLOWM",
        "  MET --> OUTM",
        "  MET --> DSH",
        "  LOG --> TRC",
        "  LOG --> MON",
        "  TRC --> ALT",
        "  MON --> DSH",
        "  TRC --> RCA",
      ].join("\n");
    }

    return [
      ...(diagramTab === "rollback"
        ? [
            "flowchart LR",
            "  CHANGE[Model/Prompt Change] --> IMPACT[Impact Detection]",
            "  IMPACT --> API[API 영향]",
            "  IMPACT --> STATE[State 영향]",
            "  IMPACT --> KPI[KPI 영향]",
            "  KPI --> GATE{오류율 5% 초과?}",
            "  GATE -->|Yes| RB[Rollback to previous version]",
            "  GATE -->|No| KEEP[Keep rollout]",
          ]
        : diagramTab === "cost"
          ? [
              "flowchart TD",
              "  REQ[Request] --> LEN{Input > 800자?}",
              "  LEN -->|No| BASE[Base Model]",
              "  LEN -->|Yes| PRO[Higher Model]",
              "  BASE --> COST1[Cost Budget Check]",
              "  PRO --> COST2[Cost Spike Check]",
              "  COST1 --> OUT[Return Draft]",
              "  COST2 --> OUT",
            ]
          : [
              "flowchart TD",
              "  A[Request] --> B[Sync Generate]",
              `  B --> C[State: ${states.join(" -> ")}]`,
              `  B --> D[Fallback: ${fallback.replace(/\n/g, " / ")}]`,
              "  C --> E[Save Draft]",
              "  E --> F[Async Approve/Publish]",
              `  F --> G[Monitoring: ${monitor.replace(/\n/g, " / ")}]`,
              `  G --> H[Ops Rule: ${execution.replace(/\n/g, " / ")}]`,
            ]),
    ].join("\n");
  }, [diagramTab, specMap]);

  const selectedRow = useMemo(
    () => rows.find((row) => row.rowId === selectedRowId) ?? TECH_SPEC_ROW_DEFS.find((row) => row.rowId === selectedRowId),
    [rows, selectedRowId]
  );

  function clampRightPanelWidth(nextWidth: number, containerWidth: number) {
    const maxByContainer = containerWidth - MIN_MAIN_PANEL_WIDTH - TWO_PANE_GAP - RESIZER_TOTAL_WIDTH;
    const effectiveMax = Math.min(MAX_RIGHT_PANEL_WIDTH, maxByContainer);
    if (effectiveMax < MIN_RIGHT_PANEL_WIDTH) return MIN_RIGHT_PANEL_WIDTH;
    return Math.max(MIN_RIGHT_PANEL_WIDTH, Math.min(effectiveMax, nextWidth));
  }

  useEffect(() => {
    if (isStackedLayout) return;
    if (!isResizing) return;
    function onMove(e: MouseEvent) {
      const rect = twoPaneRef.current?.getBoundingClientRect();
      if (!rect) return;
      const next = rect.right - e.clientX;
      const clamped = clampRightPanelWidth(next, rect.width);
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
  }, [isResizing, isStackedLayout]);

  useEffect(() => {
    function syncWidthToViewport() {
      const rect = twoPaneRef.current?.getBoundingClientRect();
      if (!rect) return;
      setIsStackedLayout(rect.width < MIN_TWO_PANE_WIDTH);
      setRightPanelWidth((prev) => clampRightPanelWidth(prev, rect.width));
    }
    syncWidthToViewport();
    const observerTarget = twoPaneRef.current;
    const observer = observerTarget ? new ResizeObserver(syncWidthToViewport) : null;
    if (observer && observerTarget) observer.observe(observerTarget);
    window.addEventListener("resize", syncWidthToViewport);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", syncWidthToViewport);
    };
  }, []);

  useEffect(() => {
    if (!isSelecting) return;
    function onUp() {
      setIsSelecting(false);
    }
    window.addEventListener("mouseup", onUp);
    return () => window.removeEventListener("mouseup", onUp);
  }, [isSelecting]);

  useEffect(() => {
    const el = sheetRef.current;
    if (!el) return;
    const updateWidth = () => setSheetViewportWidth(el.clientWidth);
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(el);
    window.addEventListener("resize", updateWidth);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateWidth);
    };
  }, []);

  useEffect(() => {
    if (!isColumnResizing) return;
    function onMove(e: MouseEvent) {
      const rect = sheetRef.current?.getBoundingClientRect();
      if (!rect) return;
      const next = rect.right - e.clientX;
      const maxByViewport = Math.max(SHEET_MIN_NOTE_COL_WIDTH, Math.min(SHEET_MAX_NOTE_COL_WIDTH, rect.width - SHEET_FIELD_COL_WIDTH - SHEET_MIN_VALUE_COL_WIDTH));
      const clamped = Math.max(SHEET_MIN_NOTE_COL_WIDTH, Math.min(maxByViewport, next));
      setNoteColWidth(clamped);
    }
    function onUp() {
      setIsColumnResizing(false);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [isColumnResizing]);

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
    return Boolean(target.closest("textarea, input, select, option, button, [data-editable='true']"));
  }

  function startCellSelection(row: number, col: SheetColIndex) {
    const cell: SheetCell = { row, col };
    setActiveCell(cell);
    setSelectionRange({ start: cell, end: cell });
    setIsSelecting(true);
    setEditingValueRowId(null);
    setEditingNoteRowId(null);
    setSelectedRowId(rows[row]?.rowId ?? null);
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

  function normalizeCellForClipboard(value: string) {
    return value
      .replace(/\r?\n/g, " ")
      .replace(/\t/g, " ")
      .replace(/\s{2,}/g, " ")
      .trim();
  }

  function getCellText(row: Step4Row, col: SheetColIndex): string {
    if (col === 0) return row.title;
    if (col === 1) return row.spec;
    return row.note;
  }

  function copySelectedCellsToText() {
    if (!selectedBounds && !activeCell) return null;
    const rowMin = selectedBounds?.rowMin ?? activeCell?.row ?? 0;
    const rowMax = selectedBounds?.rowMax ?? activeCell?.row ?? 0;
    const colMin = selectedBounds?.colMin ?? (activeCell?.col ?? 0);
    const colMax = selectedBounds?.colMax ?? (activeCell?.col ?? 0);
    const lines: string[] = [];
    let cellCount = 0;
    for (let r = rowMin; r <= rowMax; r += 1) {
      const row = rows[r];
      if (!row) continue;
      const cols: string[] = [];
      for (let c = colMin; c <= colMax; c += 1) {
        const col = c as SheetColIndex;
        const raw = getCellText(row, col);
        if ((row.rowId === "input_schema" || row.rowId === "api_definition") && col === 1) {
          cols.push(raw.trim());
        } else {
          cols.push(normalizeCellForClipboard(raw));
        }
        cellCount += 1;
      }
      lines.push(cols.join("\t"));
    }
    return { text: lines.join("\n"), count: cellCount };
  }

  function applyPasteByCells(start: SheetCell, text: string) {
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.split("\t").map((c) => c.trim()))
      .filter((cols) => cols.some((v) => v.length > 0));
    if (lines.length === 0) return;

    let updatedCells = 0;
    setRows((prev) => {
      const next = [...prev];
      for (let r = 0; r < lines.length; r += 1) {
        const rowIndex = start.row + r;
        if (rowIndex >= next.length) break;
        for (let c = 0; c < lines[r].length; c += 1) {
          const colIndex = start.col + c;
          if (colIndex === 1) {
            next[rowIndex] = { ...next[rowIndex], spec: lines[r][c] };
            updatedCells += 1;
          }
          if (colIndex === 2) {
            next[rowIndex] = { ...next[rowIndex], note: lines[r][c] };
            updatedCells += 1;
          }
        }
      }
      return next;
    });

    const end: SheetCell = {
      row: Math.min(start.row + lines.length - 1, rows.length - 1),
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
    setMessage(`값 ${copied.count}셀 복사 완료`);
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
      if (rows.length === 0) return;
      setActiveCell({ row: 0, col: 0 });
      setSelectionRange({ start: { row: 0, col: 0 }, end: { row: rows.length - 1, col: 2 } });
      setMessage("표 전체 셀 선택");
    }
    if (e.key === "Enter" && activeCell) {
      e.preventDefault();
      const rowId = rows[activeCell.row]?.rowId;
      if (!rowId) return;
      if (activeCell.col === 1 && !locked) setEditingValueRowId(rowId);
      if (activeCell.col === 2 && !locked) setEditingNoteRowId(rowId);
    }
  }

  if (isDiagramOnly) {
    return (
      <div style={{ minHeight: "100vh", background: "#fff", padding: 16 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
          {DIAGRAM_TABS.map((tab) => {
            const disabled = DISABLED_DIAGRAM_TABS.has(tab.key);
            return (
              <button
                key={`popup-${tab.key}`}
                onClick={() => {
                  if (disabled) return;
                  setDiagramTab(tab.key);
                }}
                disabled={disabled}
                style={getDiagramTabButtonStyle(tab.key, diagramTab === tab.key, disabled)}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
        {diagramTab === "sequence" ? (
          <SequenceDiagramView source={diagramText} />
        ) : (
          <FlowchartDiagramView source={diagramText} />
        )}
      </div>
    );
  }

  return (
    <div
      ref={twoPaneRef}
      className="two-pane"
      style={isStackedLayout ? { ...twoPaneStyle, display: "grid", gridTemplateColumns: "1fr" } : twoPaneStyle}
    >
      <section style={mainPanelStyle}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <h1 style={titleStyle}>STEP 4 기술 명세</h1>
          {!locked && (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button style={saveButtonStyle} onClick={handleRegenerateDraft}>
                초안 재생성
              </button>
              <button
                style={getActionButtonStyle(hasUnsavedChanges, locked || !hasUnsavedChanges)}
                onClick={handleSave}
                disabled={locked || !hasUnsavedChanges}
              >
                저장
              </button>
              <button
                style={getActionButtonStyle(hasUnsavedChanges, locked)}
                onClick={handleConfirm}
                disabled={locked}
              >
                POC 리뷰
              </button>
            </div>
          )}
        </div>
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

        {locked && (
          <div style={lockStyle}>
            🔒 STEP1 확정 전에는 접근할 수 없습니다.
          </div>
        )}

        {!locked && inputMode === "table" && (
          <>
            <div
              ref={sheetRef}
              tabIndex={0}
              onKeyDown={handleSheetKeyDown}
              onCopy={handleSheetCopy}
              onPaste={handleSheetPaste}
              style={tableWrapStyle}
            >
              <div>
                <div style={{ ...rowStyle, ...headStyle, gridTemplateColumns: tableGridTemplateColumns }}>
                  <div style={headCellStyle}>필드 (Field)</div>
                  <div style={{ ...headCellStyle, ...headCellResizableStyle }}>
                    값 (Value)
                    <button
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setIsColumnResizing(true);
                      }}
                      style={columnResizeHandleStyle}
                      title="드래그해서 Value/Note 너비 조절"
                      aria-label="Value/Note 너비 조절"
                    />
                  </div>
                  <div style={headCellStyle}>{isNoteAutoCollapsed ? "N" : "노트 (Note)"}</div>
                </div>
                {rows.map((row, rowIdx) => {
                  const linkedTabs = row.relatedTabs;
                  const isRelated = linkedTabs.includes(diagramTab);
                  const isDraggingThis = dragIndex !== null && rows[dragIndex]?.rowId === row.rowId;
                  const isSelected = selectedRowId === row.rowId;
                  return (
                    <div
                      key={row.rowId}
                      onClick={() => setSelectedRowId(row.rowId)}
                      style={{
                        ...rowStyle,
                        gridTemplateColumns: tableGridTemplateColumns,
                        background: isDraggingThis ? "#f8fafc" : isRelated ? "#f8fbff" : isSelected ? "#f8fafc" : undefined,
                        boxShadow: isRelated ? "inset 3px 0 0 #60a5fa" : undefined,
                        outline: isSelected ? "1px solid #93c5fd" : undefined,
                        borderTop:
                          dropIndex !== null && dropIndex === rowIdx && dropPosition === "before"
                            ? "2px solid #3b82f6"
                            : rowStyle.borderTop,
                        borderBottom:
                          dropIndex !== null && dropIndex === rowIdx && dropPosition === "after"
                            ? "2px solid #3b82f6"
                            : undefined,
                      }}
                onDragOver={(e) => {
                  e.preventDefault();
                  const currentIndex = rowIdx;
                  const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                  const pos: "before" | "after" = e.clientY < rect.top + rect.height / 2 ? "before" : "after";
                  setDropIndex(currentIndex);
                  setDropPosition(pos);
                }}
                onDrop={() => {
                  if (dragIndex === null || dropIndex === null) return;
                  let targetIndex = dropIndex;
                  if (dropPosition === "after") targetIndex = dropIndex + 1;
                  if (dragIndex < targetIndex) targetIndex -= 1;
                  targetIndex = Math.max(0, Math.min(rows.length - 1, targetIndex));
                  moveRow(dragIndex, targetIndex);
                  setDragIndex(null);
                  setDropIndex(null);
                }}
                onDragLeave={() => {
                  setDropIndex(null);
                }}
              >
                <div
                  style={{
                    ...cellItemStyle,
                    background: isCellInSelection(rowIdx, 0) ? "#eaf2ff" : undefined,
                    boxShadow: activeCell?.row === rowIdx && activeCell.col === 0 ? "inset 0 0 0 1px #93c5fd" : undefined,
                  }}
                  onMouseDown={(e) => {
                    if (isEditableTarget(e.target)) return;
                    e.preventDefault();
                    startCellSelection(rowIdx, 0);
                  }}
                  onMouseEnter={() => extendCellSelection(rowIdx, 0)}
                >
                  <button
                    type="button"
                    draggable
                    className="drag-handle"
                    onDragStart={() => setDragIndex(rowIdx)}
                    onDragEnd={() => {
                      setDragIndex(null);
                      setDropIndex(null);
                    }}
                    title="드래그해서 순서 변경"
                    style={dragHandleStyle}
                  >
                    ≡
                  </button>
                  <div style={{ display: "grid", gap: 6 }}>
                    <div style={{ color: isRelated ? "#0f172a" : undefined }}>{row.title}</div>
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      {row.relatedTabs.map((tab) => {
                        const meta = DIAGRAM_TAB_META[tab];
                        return (
                          <span key={`${row.rowId}-${tab}`} style={{ ...linkBadgeStyle, background: meta.bg, color: meta.fg, borderColor: meta.border }}>
                            {meta.label}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                </div>
                <div
                  style={{
                    ...cellSpecStyle,
                    background: isCellInSelection(rowIdx, 1) ? "#eaf2ff" : undefined,
                    boxShadow: activeCell?.row === rowIdx && activeCell.col === 1 ? "inset 0 0 0 1px #93c5fd" : undefined,
                  }}
                  onMouseDown={(e) => {
                    if (isEditableTarget(e.target)) return;
                    e.preventDefault();
                    startCellSelection(rowIdx, 1);
                  }}
                  onMouseEnter={() => extendCellSelection(rowIdx, 1)}
                >
                  {row.rowId === "api_definition" ? (
                    <ApiDefinitionSheetEditor
                      spec={row.spec}
                      disabled={locked}
                      onSpecChange={(next) => updateRow(row.rowId, "spec", next)}
                    />
                  ) : row.rowId === "state_model" ? (
                    <StateModelSheetEditor
                      spec={row.spec}
                      disabled={locked}
                      onSpecChange={(next) => updateRow(row.rowId, "spec", next)}
                    />
                  ) : row.rowId === "output_schema" ? (
                    <OutputSchemaSheetEditor
                      spec={row.spec}
                      disabled={locked}
                      onSpecChange={(next) => updateRow(row.rowId, "spec", next)}
                    />
                  ) : row.rowId === "input_schema" ? (
                    <div data-editable="true" style={sheetSchemaBuilderWrapStyle}>
                      <InputSchemaSheetPicker
                        key={`sheet-${step1TaskTypes.join("|")}`}
                        taskTypes={step1TaskTypes}
                        disabled={locked}
                        onSpecChange={(next) => updateRow(row.rowId, "spec", next)}
                        onCopyDone={() => setMessage("입력 스키마 복사 완료")}
                      />
                    </div>
                  ) : editingValueRowId === row.rowId && !locked ? (
                    <textarea
                      autoFocus
                      value={row.spec}
                      onChange={(e) => updateRow(row.rowId, "spec", e.target.value)}
                      onBlur={() => setEditingValueRowId(null)}
                      style={sheetValueInputStyle}
                    />
                  ) : (
                    <div
                      style={sheetValueDisplayStyle}
                      onDoubleClick={() => {
                        if (!locked) setEditingValueRowId(row.rowId);
                      }}
                      title={locked ? "잠금 상태" : "더블클릭 또는 Enter로 편집"}
                    >
                      {row.spec || <span style={sheetValuePlaceholderStyle}>입력</span>}
                    </div>
                  )}
                </div>
                <div
                  style={{
                    ...cellNoteStyle,
                    background: isCellInSelection(rowIdx, 2) ? "#eaf2ff" : undefined,
                    boxShadow: activeCell?.row === rowIdx && activeCell.col === 2 ? "inset 0 0 0 1px #93c5fd" : undefined,
                  }}
                  onMouseDown={(e) => {
                    if (isEditableTarget(e.target)) return;
                    e.preventDefault();
                    startCellSelection(rowIdx, 2);
                  }}
                  onMouseEnter={() => extendCellSelection(rowIdx, 2)}
                >
                  {isNoteAutoCollapsed ? (
                    <div style={sheetNoteCollapsedCellStyle} title={row.note || "노트"}>
                      …
                    </div>
                  ) : editingNoteRowId === row.rowId && !locked ? (
                    <textarea
                      autoFocus
                      value={row.note}
                      onChange={(e) => updateRow(row.rowId, "note", e.target.value)}
                      onBlur={() => setEditingNoteRowId(null)}
                      style={sheetNoteInputStyle}
                    />
                  ) : (
                    <div
                      style={sheetNoteDisplayStyle}
                      onDoubleClick={() => {
                        if (!locked) setEditingNoteRowId(row.rowId);
                      }}
                      title={locked ? "잠금 상태" : "더블클릭 또는 Enter로 편집"}
                    >
                      {row.note || <span style={sheetNotePlaceholderStyle}>입력</span>}
                    </div>
                  )}
                </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {!locked && inputMode === "form" && (
          <div style={formSheetWrapStyle}>
            <div style={formSheetHeaderRowStyle}>
              <div style={formSheetHeadFieldStyle}>필드 (Field)</div>
              <div style={formSheetHeadValueStyle}>값 (Value)</div>
              <div style={formSheetHeadNoteStyle}>노트 (Note)</div>
            </div>
            {rows.map((row, rowIdx) => (
              <div
                key={`form-${row.rowId}`}
                style={{
                  ...formSheetDataRowStyle,
                  borderTop:
                    dropIndex !== null && dropIndex === rowIdx && dropPosition === "before"
                      ? "2px solid #3b82f6"
                      : formSheetDataRowStyle.borderTop,
                  borderBottom:
                    dropIndex !== null && dropIndex === rowIdx && dropPosition === "after"
                      ? "2px solid #3b82f6"
                      : undefined,
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  const currentIndex = rowIdx;
                  const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                  const pos: "before" | "after" = e.clientY < rect.top + rect.height / 2 ? "before" : "after";
                  setDropIndex(currentIndex);
                  setDropPosition(pos);
                }}
                onDrop={() => {
                  if (dragIndex === null || dropIndex === null) return;
                  let targetIndex = dropIndex;
                  if (dropPosition === "after") targetIndex = dropIndex + 1;
                  if (dragIndex < targetIndex) targetIndex -= 1;
                  targetIndex = Math.max(0, Math.min(rows.length - 1, targetIndex));
                  moveRow(dragIndex, targetIndex);
                  setDragIndex(null);
                  setDropIndex(null);
                }}
                onDragLeave={() => {
                  setDropIndex(null);
                }}
              >
                <div style={formSheetFieldCellStyle}>
                  <button
                    type="button"
                    draggable
                    className="drag-handle"
                    onDragStart={() => setDragIndex(rowIdx)}
                    onDragEnd={() => {
                      setDragIndex(null);
                      setDropIndex(null);
                    }}
                    title="드래그해서 순서 변경"
                    style={dragHandleStyle}
                  >
                    ≡
                  </button>
                  <strong style={{ fontSize: 14, color: "#111827" }}>{row.title}</strong>
                </div>
                <div style={formSheetValueCellStyle}>
                  {row.rowId === "input_schema" ? (
                    <InputSchemaBuilder
                      key={`form-${step1TaskTypes.join("|")}`}
                      taskTypes={step1TaskTypes}
                      disabled={locked}
                      onSpecChange={(next) => updateRow(row.rowId, "spec", next)}
                      onCopyDone={() => setMessage("입력 스키마 복사 완료")}
                    />
                  ) : (
                    <textarea
                      value={row.spec}
                      onChange={(e) => updateRow(row.rowId, "spec", e.target.value)}
                      style={formTextAreaStyle}
                    />
                  )}
                </div>
                <div style={formSheetNoteCellStyle}>
                  <textarea
                    value={row.note}
                    onChange={(e) => updateRow(row.rowId, "note", e.target.value)}
                    style={formTextAreaStyle}
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        {!locked && message && <p style={{ ...subtleStyle, marginTop: 10 }}>{message}</p>}
      </section>

      {!isStackedLayout && (
        <div
          className="pane-resizer"
          onMouseDown={() => setIsResizing(true)}
          title="드래그해서 오른쪽 패널 크기 조절"
          style={resizerStyle}
        />
      )}

      <aside className="right-pane" style={{ ...sidePanelStyle, width: isStackedLayout ? "auto" : rightPanelWidth }}>
        <h2 style={{ margin: 0, fontSize: 16 }}>우측 패널</h2>
        <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
          {RIGHT_PANEL_TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setRightPanelTab(tab.key)}
              style={{
                ...topPanelTabStyle,
                background: rightPanelTab === tab.key ? "#111827" : "#f3f4f6",
                color: rightPanelTab === tab.key ? "#fff" : "#374151",
                borderColor: rightPanelTab === tab.key ? "#111827" : "#d1d5db",
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {rightPanelTab === "preview" && (
          <>
            <p style={{ ...subtleStyle, marginTop: 8 }}>STEP4 편집 내용이 실시간으로 다이어그램에 반영됩니다.</p>
            <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
              {DIAGRAM_TABS.map((tab) => {
                const disabled = DISABLED_DIAGRAM_TABS.has(tab.key);
                return (
                  <button
                    key={tab.key}
                    onClick={() => {
                      if (disabled) return;
                      setDiagramTab(tab.key);
                    }}
                    disabled={disabled}
                    style={getDiagramTabButtonStyle(tab.key, diagramTab === tab.key, disabled)}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>
            <div style={diagramPanelWrapStyle}>
              {diagramTab === "sequence" ? (
                <SequenceDiagramView source={diagramText} />
              ) : (
                <FlowchartDiagramView source={diagramText} />
              )}
              <button
                type="button"
                onClick={handleOpenDiagramNewWindow}
                style={diagramOpenWindowButtonStyle}
                title="새창으로 크게 보기"
                aria-label="새창으로 크게 보기"
              >
                ↗
              </button>
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
        .drag-handle {
          opacity: 0.45;
        }
        .drag-handle:hover {
          opacity: 0.85;
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
  gap: TWO_PANE_GAP,
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

const tableWrapStyle: CSSProperties = {
  marginTop: 12,
  border: "1px solid #e5e7eb",
  borderRadius: 10,
  overflowX: "auto",
  overflowY: "hidden",
  background: "#fff",
};

const headCellResizableStyle: CSSProperties = {
  position: "relative",
};

const columnResizeHandleStyle: CSSProperties = {
  position: "absolute",
  top: 0,
  right: -4,
  width: 8,
  height: "100%",
  border: "none",
  borderRadius: 0,
  background: "transparent",
  cursor: "col-resize",
  padding: 0,
  zIndex: 2,
};

const formSheetWrapStyle: CSSProperties = {
  marginTop: 12,
  border: "1px solid #e5e7eb",
  borderRadius: 10,
  overflow: "hidden",
  background: "#fff",
};

const formSheetHeaderRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "220px minmax(0, 1fr) 320px",
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
  gridTemplateColumns: "220px minmax(0, 1fr) 320px",
  borderTop: "1px solid #eef2f7",
  minHeight: 92,
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
  padding: "10px 12px",
};

const formSheetNoteCellStyle: CSSProperties = {
  padding: "10px 12px",
};

const formTextAreaStyle: CSSProperties = {
  width: "100%",
  minHeight: 84,
  border: "none",
  borderRadius: 0,
  padding: "0",
  fontSize: 13,
  lineHeight: 1.5,
  color: "#374151",
  background: "transparent",
  resize: "vertical",
  outline: "none",
  fontFamily: "inherit",
};

const rowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "220px minmax(0, 1fr) 320px",
  borderTop: "1px solid #e5e7eb",
  background: "#fff",
};

const headStyle: CSSProperties = {
  borderTop: "none",
  background: "#f3f4f6",
  borderBottom: "1px solid #bfc9d9",
  fontWeight: 800,
};

const cellBase: CSSProperties = {
  padding: "10px 12px",
  fontSize: 13,
  whiteSpace: "pre-wrap",
  lineHeight: 1.5,
};

const headCellStyle: CSSProperties = {
  ...cellBase,
  color: "#374151",
  fontSize: 12,
  borderRight: "1px solid #e5e7eb",
};

const cellItemStyle: CSSProperties = {
  ...cellBase,
  fontWeight: 700,
  color: "#111827",
  display: "flex",
  alignItems: "flex-start",
  gap: 8,
  borderRight: "1px solid #e5e7eb",
  minHeight: 92,
};

const cellSpecStyle: CSSProperties = {
  ...cellBase,
  color: "#1f2937",
  borderRight: "1px solid #e5e7eb",
  minHeight: 92,
  minWidth: 0,
};

const cellNoteStyle: CSSProperties = {
  ...cellBase,
  color: "#374151",
  minHeight: 92,
};

const sheetValueInputStyle: CSSProperties = {
  width: "100%",
  minHeight: 84,
  border: "none",
  borderRadius: 0,
  padding: 0,
  fontSize: 13,
  lineHeight: 1.5,
  color: "#374151",
  resize: "vertical",
  outline: "none",
  fontFamily: "inherit",
  background: "transparent",
};

const sheetValueDisplayStyle: CSSProperties = {
  minHeight: 84,
  padding: 0,
  fontSize: 13,
  lineHeight: 1.6,
  color: "#1f2937",
  whiteSpace: "pre-wrap",
  cursor: "text",
};

const sheetSchemaBuilderWrapStyle: CSSProperties = {
  minHeight: 84,
};

const sheetPickerWrapStyle: CSSProperties = {
  position: "relative",
  display: "grid",
  gap: 8,
};

const sheetPickerTopRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
};

const sheetPickerTaskBlockStyle: CSSProperties = {
  display: "grid",
  gap: 8,
  border: "1px solid #e5e7eb",
  borderRadius: 8,
  padding: 8,
  background: "#fff",
};

const sheetPickerTaskTitleStyle: CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  color: "#1f2937",
};

const sheetPickerMetaStyle: CSSProperties = {
  fontSize: 12,
  color: "#6b7280",
  fontWeight: 700,
};

const sheetPickerGridStyle: CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 8,
  overflow: "hidden",
};

const sheetPickerHeaderRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 96px",
};

const sheetPickerCommonHeaderRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 220px",
};

const sheetPickerHeadCellStyle: CSSProperties = {
  background: "#f8fafc",
  borderBottom: "1px solid #e5e7eb",
  padding: "6px 8px",
  fontSize: 12,
  fontWeight: 700,
  color: "#374151",
};

const sheetPickerDataRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 96px",
  borderTop: "1px solid #eef2f7",
};

const sheetPickerCommonDataRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 220px",
  borderTop: "1px solid #eef2f7",
};

const sheetPickerTypeCellStyle: CSSProperties = {
  padding: "8px",
  fontSize: 13,
  color: "#1f2937",
  borderRight: "1px solid #eef2f7",
};

const sheetPickerStateCellStyle: CSSProperties = {
  padding: "8px",
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
};

const sheetValuePlaceholderStyle: CSSProperties = {
  color: "#9ca3af",
};

const sheetNoteInputStyle: CSSProperties = {
  ...sheetValueInputStyle,
  minHeight: 360,
  height: "100%",
};

const sheetNoteDisplayStyle: CSSProperties = {
  ...sheetValueDisplayStyle,
  color: "#4b5563",
};

const sheetNotePlaceholderStyle: CSSProperties = {
  color: "#9ca3af",
};

const sheetNoteCollapsedCellStyle: CSSProperties = {
  width: "100%",
  minHeight: 46,
  display: "grid",
  placeItems: "center",
  color: "#94a3b8",
  fontSize: 14,
  fontWeight: 700,
  userSelect: "none",
};

const apiSheetWrapStyle: CSSProperties = {
  width: "100%",
  minWidth: 0,
  border: "1px solid #e5e7eb",
  borderRadius: 8,
  overflow: "hidden",
  background: "#fff",
};

const apiSheetScrollStyle: CSSProperties = {
  width: "100%",
  minWidth: 0,
  overflowX: "hidden",
  overflowY: "hidden",
};

const apiTableStyle: CSSProperties = {
  width: "100%",
  minWidth: 0,
  borderCollapse: "collapse",
  tableLayout: "fixed",
};

const apiThStyle: CSSProperties = {
  background: "#f8fafc",
  border: "1px solid #e5e7eb",
  padding: "8px 10px",
  fontSize: 12,
  fontWeight: 700,
  color: "#374151",
  textAlign: "left",
};

const apiActionThStyle: CSSProperties = {
  ...apiThStyle,
  width: 44,
  padding: 0,
  textAlign: "center",
  verticalAlign: "middle",
  border: "1px solid #e5e7eb",
  background: "#f8fafc",
};

const apiTdStyle: CSSProperties = {
  border: "1px solid #eef2f7",
  padding: "4px 6px",
  verticalAlign: "top",
};

const apiActionTdStyle: CSSProperties = {
  ...apiTdStyle,
  width: 44,
  padding: 0,
  textAlign: "center",
  verticalAlign: "middle",
  border: "1px solid #eef2f7",
  background: "#fff",
};

const apiTextareaStyle: CSSProperties = {
  width: "100%",
  minHeight: 30,
  border: "none",
  background: "transparent",
  fontSize: 13,
  color: "#1f2937",
  outline: "none",
  padding: "4px 6px",
  lineHeight: 1.4,
  resize: "none",
  overflow: "hidden",
  fontFamily: "inherit",
  whiteSpace: "pre-wrap",
  wordBreak: "normal",
  overflowWrap: "break-word",
};

const apiHeaderInputStyle: CSSProperties = {
  ...apiTextareaStyle,
  minHeight: 20,
  padding: "0",
  fontSize: 12,
  fontWeight: 700,
  color: "#374151",
  whiteSpace: "pre-wrap",
};

const apiHeaderCellInnerStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
};

const apiHeaderDeleteButtonStyle: CSSProperties = {
  border: "none",
  background: "transparent",
  color: "#9ca3af",
  fontSize: 14,
  fontWeight: 700,
  lineHeight: 1,
  cursor: "pointer",
  padding: 0,
};

const apiAddRowCellStyle: CSSProperties = {
  padding: 0,
  border: "1px solid #eef2f7",
  background: "#fff",
};

const apiIconButtonStyle: CSSProperties = {
  border: "none",
  background: "transparent",
  color: "#94a3b8",
  fontSize: 16,
  fontWeight: 700,
  cursor: "pointer",
  lineHeight: 1,
  display: "inline-grid",
  placeItems: "center",
  padding: 2,
  outline: "none",
  boxShadow: "none",
  borderRadius: 0,
  whiteSpace: "nowrap",
};

const apiDragButtonStyle: CSSProperties = {
  ...apiIconButtonStyle,
  cursor: "grab",
  color: "#cbd5e1",
};

const trashIconStyle: CSSProperties = {
  color: "#e5e7eb",
  fontSize: 9,
  lineHeight: 1,
  display: "inline-block",
};

const apiFooterActionWrapStyle: CSSProperties = {
  minHeight: 34,
  display: "grid",
  placeItems: "center",
  justifyContent: "center",
  padding: 0,
};

const stateSheetWrapStyle: CSSProperties = {
  width: "100%",
  minWidth: 0,
  border: "1px solid #e5e7eb",
  borderRadius: 8,
  overflow: "hidden",
  background: "#fff",
};

const stateSheetScrollStyle: CSSProperties = {
  width: "100%",
  minWidth: 0,
  overflowX: "hidden",
  overflowY: "hidden",
};

const stateTableStyle: CSSProperties = {
  width: "100%",
  minWidth: 0,
  borderCollapse: "collapse",
  tableLayout: "fixed",
};

const stateThStyle: CSSProperties = {
  background: "#f8fafc",
  border: "1px solid #e5e7eb",
  padding: "8px 10px",
  fontSize: 12,
  fontWeight: 700,
  color: "#374151",
  textAlign: "left",
  whiteSpace: "nowrap",
};

const stateTdStyle: CSSProperties = {
  border: "1px solid #eef2f7",
  padding: "4px 6px",
  verticalAlign: "top",
};

const miniSelectedCellStyle: CSSProperties = {
  background: "#eaf2ff",
};

const stateActionTdStyle: CSSProperties = {
  ...stateTdStyle,
  width: 44,
  minWidth: 44,
  maxWidth: 44,
  position: "sticky",
  right: 0,
  zIndex: 2,
  background: "#fff",
  boxShadow: "-1px 0 0 #eef2f7",
  textAlign: "center",
  padding: 0,
  verticalAlign: "middle",
};

const stateTextareaStyle: CSSProperties = {
  width: "100%",
  minHeight: 30,
  border: "none",
  background: "transparent",
  fontSize: 13,
  color: "#1f2937",
  outline: "none",
  padding: "4px 6px",
  lineHeight: 1.4,
  resize: "none",
  overflow: "hidden",
  fontFamily: "inherit",
  whiteSpace: "pre-wrap",
  wordBreak: "normal",
  overflowWrap: "break-word",
};

const saveButtonStyle: CSSProperties = {
  border: "1px solid #d1d5db",
  borderRadius: 8,
  padding: "8px 12px",
  background: "#fff",
  fontWeight: 700,
  cursor: "pointer",
};

function getActionButtonStyle(primary: boolean, disabled: boolean): CSSProperties {
  if (disabled) {
    return {
      ...saveButtonStyle,
      background: "#f9fafb",
      color: "#9ca3af",
      borderColor: "#e5e7eb",
      cursor: "not-allowed",
    };
  }
  if (primary) {
    return {
      ...saveButtonStyle,
      background: "#2563eb",
      color: "#fff",
      borderColor: "#2563eb",
    };
  }
  return saveButtonStyle;
}

const dragHandleStyle: CSSProperties = {
  border: "none",
  borderRadius: 0,
  background: "transparent",
  color: "#9ca3af",
  cursor: "grab",
  fontSize: 14,
  fontWeight: 600,
  lineHeight: 1,
  padding: 0,
  width: 16,
  height: 20,
  display: "grid",
  placeItems: "center",
  marginTop: 0,
  flexShrink: 0,
  alignSelf: "center",
};

const linkBadgeStyle: CSSProperties = {
  borderWidth: 1,
  borderStyle: "solid",
  borderRadius: 999,
  padding: "2px 6px",
  fontSize: 10,
  fontWeight: 700,
  lineHeight: 1.2,
};

const resizerStyle: CSSProperties = {
  background: "transparent",
};

const tabButtonStyle: CSSProperties = {
  borderWidth: 1,
  borderStyle: "solid",
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 600,
  padding: "4px 8px",
  cursor: "pointer",
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

const diagramPreviewStyle: CSSProperties = {
  marginTop: 10,
  border: "1px solid #e5e7eb",
  borderRadius: 8,
  padding: 10,
  background: "#f8fafc",
  fontSize: 12,
  lineHeight: 1.5,
  whiteSpace: "pre-wrap",
  minHeight: 210,
};

const builderWrapStyle: CSSProperties = {
  display: "grid",
  gap: 10,
};

const copyIconButtonStyle: CSSProperties = {
  border: "1px solid #d1d5db",
  borderRadius: 9,
  width: 30,
  height: 30,
  display: "grid",
  placeItems: "center",
  background: "#fff",
  cursor: "pointer",
  fontSize: 13,
};

const builderSectionStyle: CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 8,
  padding: 10,
  background: "#fff",
  display: "grid",
  gap: 8,
};

const builderSectionPlainStyle: CSSProperties = {
  padding: 0,
  display: "grid",
  gap: 8,
};

const builderTitleRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
};

const builderSectionTitleStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: "#6b7280",
};

const builderEmptyStyle: CSSProperties = {
  border: "1px dashed #cbd5e1",
  borderRadius: 8,
  padding: 10,
  color: "#6b7280",
  fontSize: 12,
};

const builderEmptyInlineStyle: CSSProperties = {
  color: "#9ca3af",
  fontSize: 12,
};

const sharedRowStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 10,
};

const modeToggleMiniStyle: CSSProperties = {
  display: "inline-flex",
  border: "1px solid #d1d5db",
  borderRadius: 8,
  overflow: "hidden",
};

const modeToggleMiniOptionStyle: CSSProperties = {
  border: "none",
  background: "#fff",
  fontSize: 12,
  padding: "6px 10px",
  cursor: "pointer",
  color: "#4b5563",
  whiteSpace: "nowrap",
};

const modeToggleMiniActiveStyle: CSSProperties = {
  background: "#eff6ff",
  color: "#1e3a8a",
  border: "1px solid #bfdbfe",
};

const taskCardStyle: CSSProperties = {
  border: "1px solid #eef2f7",
  borderRadius: 8,
  padding: 10,
  display: "grid",
  gap: 8,
};

const taskCardTitleStyle: CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  color: "#1f2937",
};

const fieldRowStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 10,
};

const fieldLabelStyle: CSSProperties = {
  fontSize: 13,
  color: "#374151",
};

const fieldToggleStyle: CSSProperties = {
  minWidth: 52,
  borderRadius: 999,
  border: "none",
  padding: "4px 10px",
  fontSize: 11,
  fontWeight: 800,
  cursor: "pointer",
};

const fieldToggleOnStyle: CSSProperties = {
  background: "#eff6ff",
  color: "#1e3a8a",
  border: "1px solid #bfdbfe",
};

const fieldToggleOffStyle: CSSProperties = {
  background: "#e5e7eb",
  color: "#6b7280",
};

const moreToggleStyle: CSSProperties = {
  border: "none",
  background: "transparent",
  color: "#4b5563",
  fontSize: 12,
  fontWeight: 700,
  padding: 0,
  cursor: "pointer",
  textAlign: "left",
};

function getDiagramTabButtonStyle(tab: DiagramTab, active: boolean, disabled: boolean): CSSProperties {
  const meta = DIAGRAM_TAB_META[tab];
  if (disabled) {
    return {
      ...tabButtonStyle,
      background: "#f3f4f6",
      color: "#9ca3af",
      borderColor: "#d1d5db",
      textDecoration: "line-through",
      cursor: "not-allowed",
      opacity: 0.9,
    };
  }
  if (active) {
    return {
      ...tabButtonStyle,
      background: meta.fg,
      color: "#fff",
      borderColor: meta.fg,
      boxShadow: `0 0 0 1px ${meta.border} inset`,
    };
  }
  return {
    ...tabButtonStyle,
    background: meta.bg,
    color: meta.fg,
    borderColor: meta.border,
  };
}

const SequenceDiagramView = memo(function SequenceDiagramView({ source }: { source: string }) {
  const parsed = useMemo(() => {
    const lines = source.split("\n").map((x) => x.trim());
    const participants: Array<{ key: string; label: string }> = [];
    const messages: Array<{ from: string; to: string; text: string; dashed: boolean }> = [];

    for (const line of lines) {
      const p = line.match(/^participant\s+(\w+)\s+as\s+(.+)$/);
      if (p) {
        participants.push({ key: p[1], label: p[2] });
        continue;
      }

      const solid = line.match(/^(\w+)->>(\w+):\s*(.+)$/);
      if (solid) {
        messages.push({ from: solid[1], to: solid[2], text: solid[3], dashed: false });
        continue;
      }

      const dashed = line.match(/^(\w+)-->>(\w+):\s*(.+)$/);
      if (dashed) {
        messages.push({ from: dashed[1], to: dashed[2], text: dashed[3], dashed: true });
      }
    }

    return { participants, messages };
  }, [source]);

  if (parsed.participants.length === 0) {
    return <pre style={diagramPreviewStyle}>{source}</pre>;
  }

  const colWidth = 132;
  const startX = 56;
  const topY = 24;
  const lifelineTop = 78;
  const rowGap = 56;
  const messageTextWidthEstimate = Math.max(0, ...parsed.messages.map((m) => m.text.length)) * 6.8;
  const rawWidth = Math.max(
    startX * 2 + (parsed.participants.length - 1) * colWidth,
    startX * 2 + messageTextWidthEstimate + 120
  );
  const rawHeight = lifelineTop + 30 + parsed.messages.length * rowGap;
  const width = Math.max(PREVIEW_MIN_CANVAS_WIDTH, rawWidth);
  const height = Math.max(PREVIEW_MIN_CANVAS_HEIGHT, rawHeight);
  const xOf = (key: string) => startX + parsed.participants.findIndex((p) => p.key === key) * colWidth;

  return (
    <div style={diagramViewportStyle}>
      <svg viewBox={`0 0 ${width} ${height}`} style={diagramSvgStyle}>
        <defs>
          <marker id="arrow-end" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#374151" />
          </marker>
        </defs>

        {parsed.participants.map((p, i) => {
          const x = startX + i * colWidth;
          return (
            <g key={p.key}>
              <rect x={x - 59} y={topY} width={118} height={34} rx={8} fill="#eef2ff" stroke="#d1d5db" />
              <text x={x} y={topY + 22} textAnchor="middle" style={sequenceLabelStyle}>
                {p.label}
              </text>
              <line x1={x} y1={lifelineTop} x2={x} y2={height - 14} stroke="#cbd5e1" strokeDasharray="4 4" />
            </g>
          );
        })}

        {parsed.messages.map((m, i) => {
          const y = lifelineTop + 24 + i * rowGap;
          const x1 = xOf(m.from);
          const x2 = xOf(m.to);
          const labelX = (x1 + x2) / 2;
          return (
            <g key={`${m.from}-${m.to}-${i}`}>
              <line
                x1={x1}
                y1={y}
                x2={x2}
                y2={y}
                stroke="#374151"
                strokeWidth={1.25}
                strokeDasharray={m.dashed ? "6 4" : undefined}
                markerEnd="url(#arrow-end)"
              />
              <text x={labelX} y={y - 8} textAnchor="middle" style={sequenceTextStyle}>
                {m.text}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
});

const FlowchartDiagramView = memo(function FlowchartDiagramView({ source }: { source: string }) {
  function splitNodeLabel(label: string, maxChars = 20, maxLines = 6): string[] {
    const text = label.trim();
    if (!text) return [""];
    if (text.length <= maxChars) return [text];

    const words = text.split(/\s+/).filter(Boolean);
    if (words.length <= 1 || !text.includes(" ")) {
      const chunks: string[] = [];
      for (let i = 0; i < text.length; i += maxChars) {
        chunks.push(text.slice(i, i + maxChars));
      }
      return chunks.slice(0, maxLines);
    }

    const lines: string[] = [];
    let current = "";
    for (const word of words) {
      const next = current ? `${current} ${word}` : word;
      if (next.length <= maxChars) {
        current = next;
      } else {
        if (current) lines.push(current);
        current = word;
        if (lines.length >= maxLines - 1) break;
      }
    }
    if (lines.length < maxLines && current) lines.push(current);
    return lines.slice(0, maxLines);
  }

  const parsed = useMemo(() => {
    const lines = source.split("\n").map((x) => x.trim()).filter(Boolean);
    const first = lines[0] ?? "";
    const direction: "LR" | "TD" = first.includes("TD") ? "TD" : "LR";
    const nodeMap = new Map<string, string>();
    const edges: Array<{ from: string; to: string }> = [];

    for (const line of lines.slice(1)) {
      const edgeWithLabels = line.match(/^([A-Za-z0-9_]+)\[(.+?)\]\s*-->\s*([A-Za-z0-9_]+)\[(.+?)\]$/);
      if (edgeWithLabels) {
        const from = edgeWithLabels[1];
        const fromLabel = edgeWithLabels[2];
        const to = edgeWithLabels[3];
        const toLabel = edgeWithLabels[4];
        nodeMap.set(from, fromLabel);
        nodeMap.set(to, toLabel);
        edges.push({ from, to });
        continue;
      }

      const edgeToLabeled = line.match(/^([A-Za-z0-9_]+)\s*-->\s*([A-Za-z0-9_]+)\[(.+?)\]$/);
      if (edgeToLabeled) {
        const from = edgeToLabeled[1];
        const to = edgeToLabeled[2];
        const toLabel = edgeToLabeled[3];
        if (!nodeMap.has(from)) nodeMap.set(from, from);
        nodeMap.set(to, toLabel);
        edges.push({ from, to });
        continue;
      }

      const edgeFromLabeled = line.match(/^([A-Za-z0-9_]+)\[(.+?)\]\s*-->\s*([A-Za-z0-9_]+)$/);
      if (edgeFromLabeled) {
        const from = edgeFromLabeled[1];
        const fromLabel = edgeFromLabeled[2];
        const to = edgeFromLabeled[3];
        nodeMap.set(from, fromLabel);
        if (!nodeMap.has(to)) nodeMap.set(to, to);
        edges.push({ from, to });
        continue;
      }

      const nodeOnly = line.match(/^([A-Za-z0-9_]+)\[(.+?)\]$/);
      if (nodeOnly) {
        nodeMap.set(nodeOnly[1], nodeOnly[2]);
        continue;
      }

      const edgeOnly = line.match(/^([A-Za-z0-9_]+)\s*-->\s*([A-Za-z0-9_]+)$/);
      if (edgeOnly) {
        const from = edgeOnly[1];
        const to = edgeOnly[2];
        if (!nodeMap.has(from)) nodeMap.set(from, from);
        if (!nodeMap.has(to)) nodeMap.set(to, to);
        edges.push({ from, to });
      }
    }

    const nodes = Array.from(nodeMap.entries()).map(([id, label]) => ({ id, label }));
    return { direction, nodes, edges };
  }, [source]);

  if (parsed.nodes.length === 0) return <pre style={diagramPreviewStyle}>{source}</pre>;

  const nodeW = 196;
  const baseNodeH = 72;
  const lineHeight = 15;
  const rankSpacing = parsed.direction === "TD" ? 220 : 236;
  const start = 20;
  const labelMaxChars = 20;
  const labelMaxLines = 4;
  const labelLinesByNode = new Map(
    parsed.nodes.map((n) => [n.id, splitNodeLabel(n.label, labelMaxChars, labelMaxLines)] as const)
  );
  const nodeHeightByNode = new Map(
    parsed.nodes.map((n) => {
      const lines = labelLinesByNode.get(n.id)?.length ?? 1;
      return [n.id, Math.max(baseNodeH, lines * lineHeight + 26)] as const;
    })
  );
  const maxNodeHeight = Math.max(baseNodeH, ...Array.from(nodeHeightByNode.values()));
  const laneSpacing = maxNodeHeight + 24;

  const levelMap = new Map<string, number>();
  const indeg = new Map<string, number>();
  const nexts = new Map<string, string[]>();

  for (const n of parsed.nodes) {
    indeg.set(n.id, 0);
    nexts.set(n.id, []);
  }
  for (const e of parsed.edges) {
    indeg.set(e.to, (indeg.get(e.to) ?? 0) + 1);
    nexts.set(e.from, [...(nexts.get(e.from) ?? []), e.to]);
  }
  const q = parsed.nodes.filter((n) => (indeg.get(n.id) ?? 0) === 0).map((n) => n.id);
  for (const id of q) levelMap.set(id, 0);
  while (q.length > 0) {
    const cur = q.shift() as string;
    const curLv = levelMap.get(cur) ?? 0;
    for (const nx of nexts.get(cur) ?? []) {
      const lv = Math.max(levelMap.get(nx) ?? 0, curLv + 1);
      levelMap.set(nx, lv);
      indeg.set(nx, (indeg.get(nx) ?? 0) - 1);
      if ((indeg.get(nx) ?? 0) <= 0) q.push(nx);
    }
  }

  const grouped = new Map<number, string[]>();
  for (const n of parsed.nodes) {
    const lv = levelMap.get(n.id) ?? 0;
    grouped.set(lv, [...(grouped.get(lv) ?? []), n.id]);
  }
  const maxLv = Math.max(...Array.from(grouped.keys()));
  const pos = new Map<string, { x: number; y: number }>();
  for (let lv = 0; lv <= maxLv; lv++) {
    const ids = grouped.get(lv) ?? [];
    ids.forEach((id, idx) => {
      if (parsed.direction === "LR") {
        pos.set(id, { x: start + lv * rankSpacing, y: start + idx * laneSpacing });
      } else {
        pos.set(id, { x: start + idx * rankSpacing, y: start + lv * laneSpacing });
      }
    });
  }

  const maxLaneCount = Math.max(1, ...Array.from(grouped.values()).map((ids) => ids.length));
  const rawWidth =
    parsed.direction === "LR" ? start + (maxLv + 1) * rankSpacing + 96 : start + maxLaneCount * rankSpacing + 96;
  const rawHeight = parsed.direction === "LR" ? start + maxLaneCount * laneSpacing + 92 : start + (maxLv + 1) * laneSpacing + 112;
  const width = Math.max(PREVIEW_MIN_CANVAS_WIDTH, rawWidth);
  const height = Math.max(PREVIEW_MIN_CANVAS_HEIGHT, rawHeight);

  return (
    <div style={diagramViewportStyle}>
      <svg viewBox={`0 0 ${width} ${height}`} style={diagramSvgStyle}>
        <defs>
          <marker id="flow-arrow-end" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#374151" />
          </marker>
        </defs>
        {parsed.edges.map((e, i) => {
          const a = pos.get(e.from);
          const b = pos.get(e.to);
          if (!a || !b) return null;
          const x1 = a.x + nodeW / 2;
          const y1 = a.y + (nodeHeightByNode.get(e.from) ?? baseNodeH) / 2;
          const x2 = b.x + nodeW / 2;
          const y2 = b.y + (nodeHeightByNode.get(e.to) ?? baseNodeH) / 2;
          return <line key={`${e.from}-${e.to}-${i}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#475569" strokeWidth={1.25} markerEnd="url(#flow-arrow-end)" />;
        })}
        {parsed.nodes.map((n) => {
          const p = pos.get(n.id);
          if (!p) return null;
          const labelLines = labelLinesByNode.get(n.id) ?? [n.label];
          const nodeH = nodeHeightByNode.get(n.id) ?? baseNodeH;
          const firstLineY = p.y + (nodeH - lineHeight * labelLines.length) / 2 + 12;
          return (
            <g key={n.id}>
              <rect x={p.x} y={p.y} width={nodeW} height={nodeH} rx={9} fill="#eef2ff" stroke="#d1d5db" />
              <text x={p.x + nodeW / 2} y={firstLineY} textAnchor="middle" style={sequenceLabelStyle}>
                {labelLines.map((line, idx) => (
                  <tspan key={`${n.id}-line-${idx}`} x={p.x + nodeW / 2} dy={idx === 0 ? 0 : lineHeight}>
                    {line}
                  </tspan>
                ))}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
});

const diagramViewportStyle: CSSProperties = {
  marginTop: 10,
  border: "1px solid #e5e7eb",
  borderRadius: 8,
  background: "#f8fafc",
  overflow: "hidden",
};

const diagramPanelWrapStyle: CSSProperties = {
  position: "relative",
};

const diagramOpenWindowButtonStyle: CSSProperties = {
  position: "absolute",
  left: 14,
  bottom: 14,
  zIndex: 2,
  border: "1px solid #d1d5db",
  borderRadius: 10,
  background: "#fff",
  color: "#374151",
  fontSize: 16,
  fontWeight: 800,
  width: 32,
  height: 32,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  lineHeight: 1,
  cursor: "pointer",
};

const PREVIEW_MIN_CANVAS_WIDTH = 640;
const PREVIEW_MIN_CANVAS_HEIGHT = 460;

const diagramSvgStyle: CSSProperties = {
  display: "block",
  width: "100%",
  height: "auto",
  minHeight: 460,
};

const sequenceLabelStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  fill: "#1f2937",
};

const sequenceTextStyle: CSSProperties = {
  fontSize: 11,
  fill: "#374151",
};
