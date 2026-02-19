"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { useParams } from "next/navigation";
import {
  addHistoryEvent,
  canFreezeStep1,
  generateStep2Data,
  HISTORY_EVENT_TYPES,
  getDefaultStep1,
  getGoStopResult,
  getMissingStep1RequiredFields,
  getProgress,
  getStep1Data,
  setProgress,
  setStep1Data,
  setStep2Data,
  type Step1Data,
} from "@/lib/prismMvp";

export default function ScreeningPage() {
  const params = useParams();
  const id = String(params?.id ?? "");

  const [data, setData] = useState<Step1Data>(getDefaultStep1());
  const [frozen, setFrozen] = useState(false);
  const [message, setMessage] = useState("");
  const [rightPanelTab, setRightPanelTab] = useState<"preview" | "impact">("preview");
  const [rightPanelWidth, setRightPanelWidth] = useState(360);
  const [isResizing, setIsResizing] = useState(false);
  const twoPaneRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!id) return;
    setData(getStep1Data(id));
    setFrozen(getProgress(id).step1Frozen);
  }, [id]);

  const decision = useMemo(() => getGoStopResult(data), [data]);
  const missingForFreeze = useMemo(() => getMissingStep1RequiredFields(data), [data]);
  const freezeReady = canFreezeStep1(data);

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

  function update<K extends keyof Step1Data>(key: K, value: Step1Data[K]) {
    if (frozen) return;
    setData((prev) => ({ ...prev, [key]: value }));
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

  function handleGenerateStep2Draft() {
    if (!id) return;
    setStep2Data(id, generateStep2Data(data));
    addHistoryEvent(id, {
      stage: "step2",
      action: HISTORY_EVENT_TYPES.GENERATE_STEP2_DRAFT,
      detail: "사용자 수동 실행으로 STEP2 초안 생성",
    });
    setMessage("STEP2 설계 초안 생성 완료");
  }

  return (
    <div ref={twoPaneRef} className="two-pane" style={twoPaneStyle}>
      <section style={mainPanelStyle}>
        <h1 style={titleStyle}>STEP 1 전략&방향</h1>
        <p style={subtleStyle}>입력 고정 후 Freeze해야 다음 단계로 이동할 수 있습니다.</p>

        <div style={fieldGridStyle}>
          <LabeledText
            label="왜 AI를 붙이는가"
            value={data.why_ai}
            onChange={(v) => update("why_ai", v)}
            disabled={frozen}
          />
          <LabeledText
            label="누구를 위한 기능인가"
            value={data.target_user}
            onChange={(v) => update("target_user", v)}
            disabled={frozen}
          />
          <LabeledText
            label="AS-IS 문제"
            value={data.as_is_problem}
            onChange={(v) => update("as_is_problem", v)}
            disabled={frozen}
            textarea
          />
          <LabeledText
            label="끝나면 무엇이 남는가 (결과 상태/저장물)"
            value={data.result_artifact}
            onChange={(v) => update("result_artifact", v)}
            disabled={frozen}
            textarea
          />

          <label style={labelStyle}>
            AI는 어디까지 맡는가 (최소 역할)
            <select
              value={data.ai_min_role}
              onChange={(e) => update("ai_min_role", e.target.value as Step1Data["ai_min_role"])}
              disabled={frozen}
              style={inputStyle}
            >
              <option value="draft_only">draft_only</option>
              <option value="auto_publish">auto_publish</option>
            </select>
          </label>

          <label style={labelStyle}>
            리스크 허용 수준
            <select
              value={data.risk_level}
              onChange={(e) => update("risk_level", e.target.value as Step1Data["risk_level"])}
              disabled={frozen}
              style={inputStyle}
            >
              <option value="low">low</option>
              <option value="medium">medium</option>
              <option value="high">high</option>
            </select>
          </label>

          <LabeledText
            label="KPI/지표 가설"
            value={data.kpi_hypothesis}
            onChange={(v) => update("kpi_hypothesis", v)}
            disabled={frozen}
            textarea
          />
          <LabeledText
            label="AI 없이 대안 1줄"
            value={data.no_ai_alternative}
            onChange={(v) => update("no_ai_alternative", v)}
            disabled={frozen}
          />
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <button onClick={handleSave} disabled={frozen} style={buttonStyle}>
            저장
          </button>
          <button onClick={handleFreeze} disabled={frozen || !freezeReady} style={buttonStyle}>
            Freeze
          </button>
          {frozen && <span style={{ ...subtleStyle, alignSelf: "center" }}>🔒 Frozen</span>}
        </div>

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
            <div
              style={{
                marginTop: 10,
                border: "1px solid #e5e7eb",
                borderRadius: 10,
                padding: 12,
                background: decision === "STOP" ? "#fef2f2" : "#f0fdf4",
              }}
            >
              <div style={{ fontWeight: 700, marginBottom: 6 }}>GO / STOP 카드</div>
              <div style={{ fontSize: 22, fontWeight: 800 }}>{decision}</div>
              <p style={{ ...subtleStyle, marginTop: 8 }}>
                룰: risk_level=high & ai_min_role=auto_publish 이면 STOP
              </p>
            </div>

            <button onClick={handleGenerateStep2Draft} style={{ ...buttonStyle, marginTop: 12, width: "100%" }}>
              STEP2 초안 생성
            </button>
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

function LabeledText({
  label,
  value,
  onChange,
  disabled,
  textarea,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  textarea?: boolean;
}) {
  return (
    <label style={labelStyle}>
      {label}
      {textarea ? (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} style={{ ...inputStyle, minHeight: 84 }} />
      ) : (
        <input value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} style={inputStyle} />
      )}
    </label>
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

const subtleStyle: CSSProperties = {
  margin: 0,
  color: "#6b7280",
  fontSize: 15,
};

const fieldGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 12,
  marginTop: 14,
};

const labelStyle: CSSProperties = {
  display: "grid",
  gap: 6,
  fontSize: 15,
  fontWeight: 600,
  color: "#4b5563",
};

const inputStyle: CSSProperties = {
  border: "1px solid #d6dbe2",
  borderRadius: 8,
  padding: "10px 12px",
  fontSize: 15,
  color: "#374151",
  background: "#f9fafb",
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
