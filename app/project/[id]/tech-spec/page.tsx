"use client";

import { memo, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { useParams } from "next/navigation";
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
  type Step4Row,
  type Step4RowId,
  type Step4TabKey,
} from "@/lib/prismMvp";

type DiagramTab = Step4TabKey;
type RightPanelTab = "preview" | "impact";

const DIAGRAM_TABS: Array<{ key: DiagramTab; label: string }> = [
  { key: "state", label: "State" },
  { key: "sequence", label: "Sequence" },
  { key: "error_retry", label: "Error/Retry" },
  { key: "auth", label: "Auth Matrix" },
  { key: "dataflow", label: "Data Flow" },
  { key: "observability", label: "Observability" },
  { key: "pipeline", label: "Pipeline" },
  { key: "rollback", label: "Rollback" },
  { key: "cost", label: "Cost Path" },
  { key: "ia", label: "IA" },
];

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

export default function TechSpecPage() {
  const params = useParams();
  const id = String(params?.id ?? "");

  const [locked, setLocked] = useState(true);
  const [rows, setRows] = useState<Step4Row[]>([]);
  const [message, setMessage] = useState("");
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const [dropPosition, setDropPosition] = useState<"before" | "after">("before");
  const [diagramTab, setDiagramTab] = useState<DiagramTab>("state");
  const [rightPanelTab, setRightPanelTab] = useState<RightPanelTab>("preview");
  const [selectedRowId, setSelectedRowId] = useState<Step4RowId | null>(null);
  const [rightPanelWidth, setRightPanelWidth] = useState(420);
  const [isResizing, setIsResizing] = useState(false);
  const twoPaneRef = useRef<HTMLDivElement | null>(null);
  const deferredRows = useDeferredValue(rows);

  useEffect(() => {
    if (!id) return;
    const progress = getProgress(id);
    const canAccess = canAccessTechSpec(progress);
    setLocked(!canAccess);
    if (!canAccess) return;

    const loadedStep1 = getStep1Data(id);
    const loadedStep2 = getStep2Data(id);
    const loadedStep3 = getStep3Policy(id);
    const generatedRows = generateTechSpecRows(loadedStep1, loadedStep2, loadedStep3);
    const savedRows = getStep4Rows(id);
    if (savedRows.length === 0) {
      setRows(generatedRows);
      setStep4Rows(id, generatedRows);
      setSelectedRowId(generatedRows[0]?.rowId ?? null);
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
      setSelectedRowId((prev) => prev ?? merged[0]?.rowId ?? null);
    }
  }, [id]);

  function updateRow(rowId: Step4RowId, key: "spec" | "note", value: string) {
    setRows((prev) => prev.map((row) => (row.rowId === rowId ? { ...row, [key]: value } : row)));
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
    if (!id || locked) return;
    setStep4Rows(id, rows);
    addHistoryEvent(id, {
      stage: "step4",
      action: HISTORY_EVENT_TYPES.SAVE_STEP4,
      detail: "STEP4 기술 스펙 저장",
    });
    setMessage("STEP4 저장 완료");
  }

  const specMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const row of deferredRows) m.set(row.rowId, row.spec);
    return m;
  }, [deferredRows]);

  const diagramText = useMemo(() => {
    const api = (specMap.get("api_definition") || "").split("\n").filter(Boolean);
    const state = specMap.get("state_model") || "input -> generating -> draft -> user_edit -> review_requested -> published";
    const states = state
      .split(/->|→/)
      .map((s) => s.trim())
      .filter(Boolean);
    const storage = specMap.get("storage_structure") || "posts / post_drafts";
    const logs = specMap.get("log_structure") || "logs";
    const fallback = specMap.get("fallback_conditions") || "retry -> failed";
    const monitor = specMap.get("monitoring_items") || "오류율/응답시간/사용자 수정률";
    const execution = specMap.get("execution_structure") || "초안 생성 동기 처리 / 게시 승인 비동기 처리";
    const inputSchema = specMap.get("input_schema") || "topic, platform, tone";
    const outputSchema = specMap.get("output_schema") || "draft_text, confidence";
    const guardrail = specMap.get("guardrail_policy") || "confidence < 0.7 경고 + 정책 필터";
    const model = specMap.get("model_conditions") || "기본 모델 + 조건부 상위 모델";

    if (diagramTab === "state") {
      const safeStates = states.length > 0 ? states : ["input", "generating", "draft", "publish", "failed"];
      const lines = ["flowchart LR"];
      safeStates.forEach((st, idx) => {
        lines.push(`  S${idx}[${st}]`);
        if (idx > 0) lines.push(`  S${idx - 1} --> S${idx}`);
      });
      lines.push(`  S${Math.max(0, safeStates.length - 2)} --> FAIL[failed]`);
      lines.push(`  S${Math.max(0, safeStates.length - 1)} --> END[published]`);
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
        "  participant U as User",
        "  participant UI as PRISM UI",
        "  participant API as Backend API",
        "  participant M as AI Model",
        "  participant DB as DB",
        `  U->>UI: 요청`,
        `  UI->>API: ${mainApi}`,
        "  API->>M: generate call",
        "  M-->>API: draft result",
        `  API->>DB: ${saveApi} (save draft + logs)`,
        "  API-->>UI: draft + status",
        `  UI->>API: ${approveApi}`,
        "  API->>DB: state transition + audit log",
        "  UI-->>U: 결과 표시",
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
      return [
        "flowchart LR",
        "  API[API Stage] --> MET[Metrics]",
        "  API --> LOG[Logs]",
        "  API --> TRACE[Trace]",
        `  MET --> DASH[Dashboard: ${monitor.replace(/\n/g, " / ")}]`,
        "  LOG --> ALERT[Alert Rule]",
        "  TRACE --> RCA[Root Cause 분석]",
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
              `  B --> C[State: ${state}]`,
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

  return (
    <div ref={twoPaneRef} className="two-pane" style={twoPaneStyle}>
      <section style={mainPanelStyle}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <h1 style={titleStyle}>STEP 4 기술 스펙</h1>
          {!locked && (
            <button style={saveButtonStyle} onClick={handleSave}>
              저장
            </button>
          )}
        </div>
        <div style={policyMeaningStyle}>
          auto_approved = 초안 내부 저장 승인(배포 아님) · publish 승인 = 외부 반영 승인(휴먼 필수)
        </div>

        {locked && (
          <div style={lockStyle}>
            🔒 STEP3 완료 전에는 접근할 수 없습니다.
          </div>
        )}

        {!locked && (
          <div style={tableWrapStyle}>
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
                    background: isDraggingThis ? "#f8fafc" : isRelated ? "#f8fbff" : isSelected ? "#f8fafc" : undefined,
                    boxShadow: isRelated ? "inset 3px 0 0 #60a5fa" : undefined,
                    outline: isSelected ? "1px solid #93c5fd" : undefined,
                    borderTop:
                      dropIndex !== null && dropIndex === rowIdx && dropPosition === "before"
                        ? "2px solid #3b82f6"
                        : rowIdx === 0
                          ? "none"
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
                <div style={cellItemStyle}>
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
                <div style={cellSpecStyle}>
                  <textarea
                    value={row.spec}
                    onChange={(e) => updateRow(row.rowId, "spec", e.target.value)}
                    style={cellInputStyle}
                  />
                </div>
                <div style={cellNoteStyle}>
                  <textarea
                    value={row.note}
                    onChange={(e) => updateRow(row.rowId, "note", e.target.value)}
                    style={cellInputStyle}
                  />
                </div>
              </div>
              );
            })}
          </div>
        )}

        {!locked && message && <p style={{ ...subtleStyle, marginTop: 10 }}>{message}</p>}
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
              {DIAGRAM_TABS.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setDiagramTab(tab.key)}
                  style={getDiagramTabButtonStyle(tab.key, diagramTab === tab.key)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            {diagramTab === "sequence" ? (
              <SequenceDiagramView source={diagramText} />
            ) : (
              <FlowchartDiagramView source={diagramText} />
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

const tableWrapStyle: CSSProperties = {
  marginTop: 12,
  border: "1px solid #e5e7eb",
  borderRadius: 10,
  overflow: "hidden",
  background: "#fff",
};

const rowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "220px minmax(0, 1fr) 320px",
  borderTop: "1px solid #e5e7eb",
};

const headStyle: CSSProperties = {
  borderTop: "none",
  background: "#f3f4f6",
  fontWeight: 800,
};

const cellBase: CSSProperties = {
  padding: "10px 12px",
  fontSize: 13,
  whiteSpace: "pre-wrap",
  lineHeight: 1.5,
};

const cellItemStyle: CSSProperties = {
  ...cellBase,
  fontWeight: 700,
  color: "#111827",
  display: "flex",
  alignItems: "flex-start",
  gap: 8,
};

const cellSpecStyle: CSSProperties = {
  ...cellBase,
  color: "#1f2937",
};

const cellNoteStyle: CSSProperties = {
  ...cellBase,
  color: "#374151",
};

const cellInputStyle: CSSProperties = {
  width: "100%",
  minHeight: 84,
  border: "1px solid #d1d5db",
  borderRadius: 8,
  padding: "8px 10px",
  fontSize: 13,
  lineHeight: 1.5,
  color: "#374151",
  background: "#fff",
};

const saveButtonStyle: CSSProperties = {
  border: "1px solid #d1d5db",
  borderRadius: 8,
  padding: "8px 12px",
  background: "#fff",
  fontWeight: 700,
  cursor: "pointer",
};

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
  fontSize: 12,
  fontWeight: 600,
  padding: "5px 10px",
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

function getDiagramTabButtonStyle(tab: DiagramTab, active: boolean): CSSProperties {
  const meta = DIAGRAM_TAB_META[tab];
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

  const colWidth = 165;
  const startX = 80;
  const topY = 26;
  const lifelineTop = 72;
  const rowGap = 42;
  const width = startX * 2 + (parsed.participants.length - 1) * colWidth;
  const height = lifelineTop + 30 + parsed.messages.length * rowGap;
  const xOf = (key: string) => startX + parsed.participants.findIndex((p) => p.key === key) * colWidth;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={sequenceSvgStyle}>
      <defs>
        <marker id="arrow-end" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#374151" />
        </marker>
      </defs>

      {parsed.participants.map((p, i) => {
        const x = startX + i * colWidth;
        return (
          <g key={p.key}>
            <rect x={x - 62} y={topY} width={124} height={30} rx={8} fill="#eef2ff" stroke="#d1d5db" />
            <text x={x} y={topY + 20} textAnchor="middle" style={sequenceLabelStyle}>
              {p.label}
            </text>
            <line x1={x} y1={lifelineTop} x2={x} y2={height - 14} stroke="#cbd5e1" strokeDasharray="4 4" />
          </g>
        );
      })}

      {parsed.messages.map((m, i) => {
        const y = lifelineTop + 22 + i * rowGap;
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
              strokeDasharray={m.dashed ? "6 4" : undefined}
              markerEnd="url(#arrow-end)"
            />
            <text x={labelX} y={y - 7} textAnchor="middle" style={sequenceTextStyle}>
              {m.text}
            </text>
          </g>
        );
      })}
    </svg>
  );
});

const FlowchartDiagramView = memo(function FlowchartDiagramView({ source }: { source: string }) {
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

  const rankSpacing = 170;
  const laneSpacing = 74;
  const start = 80;
  const nodeW = 120;
  const nodeH = 34;

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

  const width = parsed.direction === "LR" ? start + (maxLv + 1) * rankSpacing + 80 : start + 4 * rankSpacing + 80;
  const height = parsed.direction === "LR" ? start + 6 * laneSpacing + 80 : start + (maxLv + 1) * laneSpacing + 120;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={sequenceSvgStyle}>
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
        const y1 = a.y + nodeH / 2;
        const x2 = b.x + nodeW / 2;
        const y2 = b.y + nodeH / 2;
        return <line key={`${e.from}-${e.to}-${i}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#475569" markerEnd="url(#flow-arrow-end)" />;
      })}
      {parsed.nodes.map((n) => {
        const p = pos.get(n.id);
        if (!p) return null;
        return (
          <g key={n.id}>
            <rect x={p.x} y={p.y} width={nodeW} height={nodeH} rx={8} fill="#eef2ff" stroke="#d1d5db" />
            <text x={p.x + nodeW / 2} y={p.y + 22} textAnchor="middle" style={sequenceLabelStyle}>
              {n.label.length > 18 ? `${n.label.slice(0, 18)}...` : n.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
});

const sequenceSvgStyle: CSSProperties = {
  marginTop: 10,
  border: "1px solid #e5e7eb",
  borderRadius: 8,
  background: "#f8fafc",
  width: "100%",
  minHeight: 260,
};

const sequenceLabelStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  fill: "#1f2937",
};

const sequenceTextStyle: CSSProperties = {
  fontSize: 10,
  fill: "#374151",
};
