"use client";

import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { useParams } from "next/navigation";
import {
  addHistoryEvent,
  getHistory,
  canAccessTechSpec,
  generateTechSpecRows,
  getStep4Rows,
  getProgress,
  getStep1Data,
  getStep2Data,
  getStep3Policy,
  setStep4Rows,
  type Step4Row,
} from "@/lib/prismMvp";

export default function TechSpecPage() {
  const params = useParams();
  const id = String(params?.id ?? "");

  const [locked, setLocked] = useState(true);
  const [rows, setRows] = useState<Step4Row[]>([]);
  const [historyPreview, setHistoryPreview] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const [dropPosition, setDropPosition] = useState<"before" | "after">("before");

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
    } else {
      const savedMap = new Map(savedRows.map((r) => [r.item, r]));
      const merged = generatedRows.map((row) => {
        const saved = savedMap.get(row.item);
        if (!saved) return row;
        return {
          item: row.item,
          spec: saved.spec || row.spec,
          note: saved.note || row.note,
        };
      });
      setRows(merged);
      setStep4Rows(id, merged);
    }
    const history = getHistory(id).slice(0, 5).map((h) => `${new Date(h.ts).toLocaleTimeString()} ${h.stage}/${h.action}`);
    setHistoryPreview(history);
  }, [id]);

  function updateRow(item: string, key: "spec" | "note", value: string) {
    setRows((prev) => prev.map((row) => (row.item === item ? { ...row, [key]: value } : row)));
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
      action: "save",
      summary: "STEP4 기술 스펙 저장",
    });
    setMessage("STEP4 저장 완료");
  }

  return (
    <div style={twoPaneStyle}>
      <section style={mainPanelStyle}>
        <h1 style={titleStyle}>STEP 4 기술 스펙</h1>

        {locked && (
          <div style={lockStyle}>
            🔒 STEP3 완료 전에는 접근할 수 없습니다.
          </div>
        )}

        {!locked && (
          <div style={tableWrapStyle}>
            <div style={{ ...rowStyle, ...headStyle }}>
              <div style={cellItemStyle}>STEP 4 - 기술 스펙</div>
              <div style={cellSpecStyle}>STEP 4 ex</div>
              <div style={cellNoteStyle}>비고</div>
            </div>
            {rows.map((row) => (
              <div
                key={row.item}
                style={{
                  ...rowStyle,
                  background: dragIndex !== null && rows[dragIndex]?.item === row.item ? "#f8fafc" : undefined,
                  borderTop:
                    dropIndex !== null && dropIndex === rows.findIndex((r) => r.item === row.item) && dropPosition === "before"
                      ? "2px solid #3b82f6"
                      : rowStyle.borderTop,
                  borderBottom:
                    dropIndex !== null && dropIndex === rows.findIndex((r) => r.item === row.item) && dropPosition === "after"
                      ? "2px solid #3b82f6"
                      : undefined,
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  const currentIndex = rows.findIndex((r) => r.item === row.item);
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
                    onDragStart={() => setDragIndex(rows.findIndex((r) => r.item === row.item))}
                    onDragEnd={() => {
                      setDragIndex(null);
                      setDropIndex(null);
                    }}
                    title="드래그해서 순서 변경"
                    style={dragHandleStyle}
                  >
                    ⋮⋮
                  </button>
                  {row.item}
                </div>
                <div style={cellSpecStyle}>
                  <textarea
                    value={row.spec}
                    onChange={(e) => updateRow(row.item, "spec", e.target.value)}
                    style={cellInputStyle}
                  />
                </div>
                <div style={cellNoteStyle}>
                  <textarea
                    value={row.note}
                    onChange={(e) => updateRow(row.item, "note", e.target.value)}
                    style={cellInputStyle}
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        {!locked && (
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button style={saveButtonStyle} onClick={handleSave}>
              저장
            </button>
            {message && <p style={{ ...subtleStyle, margin: 0, alignSelf: "center" }}>{message}</p>}
          </div>
        )}
      </section>

      <aside style={sidePanelStyle}>
        <h2 style={{ margin: 0, fontSize: 16 }}>우측 패널</h2>
        <p style={{ ...subtleStyle, marginTop: 8 }}>STEP1~3 입력을 기반으로 생성된 읽기 전용 더미 스펙입니다.</p>
        {historyPreview.length > 0 && (
          <div style={{ marginTop: 12, border: "1px solid #e5e7eb", borderRadius: 8, padding: 10, background: "#f8fafc" }}>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>최근 변경</div>
            {historyPreview.map((line, idx) => (
              <div key={`${idx}-${line}`} style={{ ...subtleStyle, fontSize: 12, marginTop: 4 }}>
                • {line}
              </div>
            ))}
          </div>
        )}
      </aside>
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
  width: 320,
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
  border: "1px solid #d1d5db",
  borderRadius: 6,
  background: "#f9fafb",
  color: "#6b7280",
  cursor: "grab",
  fontSize: 12,
  lineHeight: 1,
  padding: "6px 4px",
  marginTop: 1,
  flexShrink: 0,
};
