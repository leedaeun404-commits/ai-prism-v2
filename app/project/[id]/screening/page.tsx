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

export default function ScreeningPage() {
  const params = useParams();
  const id = String(params?.id ?? "");

  const [data, setData] = useState<Step1Data>(getDefaultStep1());
  const [frozen, setFrozen] = useState(false);
  const [message, setMessage] = useState("");
  const [rightPanelWidth, setRightPanelWidth] = useState(360);
  const [isResizing, setIsResizing] = useState(false);
  const twoPaneRef = useRef<HTMLDivElement | null>(null);

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
    ? "입력 -> 생성 -> 초안 -> 검토 -> 승인 -> 게시"
    : "입력 -> 생성 -> 초안 -> 승인 -> 게시";

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

  function toggleMultiValue<K extends "target" | "no_ai_alternative">(key: K, value: Step1Data[K][number]) {
    if (frozen) return;
    setData((prev) => {
      const current = prev[key] as string[];
      const exists = current.includes(value as string);
      const next = exists ? current.filter((v) => v !== value) : [...current, value as string];
      return { ...prev, [key]: next } as Step1Data;
    });
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
        <h1 style={titleStyle}>STEP 1 전략&방향</h1>
        <p style={subtleStyle}>전략 입력을 고정하고 운영 감당선(4축)을 선언하면 다음 단계가 열립니다.</p>

        <div style={blockStyle}>
          <div style={blockTitleStyle}>① 전략 목적 블록 (의도 고정)</div>
          <QuestionRow question="왜 AI를 붙이나요?">
            <textarea
              value={data.why}
              onChange={(e) => update("why", e.target.value)}
              disabled={frozen}
              placeholder="반복 작업 자동화, 시간 단축, 비용 절감, 일관성 확보"
              style={{ ...inputStyle, minHeight: 84 }}
            />
          </QuestionRow>
          <QuestionRow question="누구를 위한 기능인가요?">
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
              <input
                value={data.target_detail}
                onChange={(e) => update("target_detail", e.target.value)}
                disabled={frozen}
                placeholder="보완 설명 (선택)"
                style={inputStyle}
              />
            </div>
          </QuestionRow>
        </div>

        <div style={blockStyle}>
          <div style={blockTitleStyle}>② 문제 정의 블록</div>
          <QuestionRow question="현재 어떤 문제가 있나요? (AS-IS)">
            <textarea
              value={data.as_is}
              onChange={(e) => update("as_is", e.target.value)}
              disabled={frozen}
              style={{ ...inputStyle, minHeight: 84 }}
            />
          </QuestionRow>
          <QuestionRow question="이게 성공이라면 무엇이 달라져야 하나요? (KPI/지표)">
            <textarea
              value={data.kpi}
              onChange={(e) => update("kpi", e.target.value)}
              disabled={frozen}
              style={{ ...inputStyle, minHeight: 84 }}
            />
          </QuestionRow>
        </div>

        <div style={blockStyle}>
          <div style={blockTitleStyle}>③ 결과 정의 블록 (출구 고정)</div>
          <QuestionRow question="이 플로우가 끝나면 무엇이 남나요? (결과 상태)">
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
        </div>

        <div style={blockStyle}>
          <div style={blockTitleStyle}>④ AI 대안 블록 (현실성 체크)</div>
          <QuestionRow question="AI 없이 가능한 방법은 무엇인가요?">
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
          <QuestionRow question="AI 없이 보완 설명이 필요한가요? (선택)">
            <input
              value={data.no_ai_alternative_detail}
              onChange={(e) => update("no_ai_alternative_detail", e.target.value)}
              disabled={frozen}
              placeholder="예: 템플릿 + 수동 편집 조합"
              style={inputStyle}
            />
          </QuestionRow>
        </div>

        <div style={blockStyle}>
          <div style={blockTitleStyle}>⑤ 운영 감당선 블록 (4축)</div>
          <QuestionRow question="AI 결과가 외부에 공개되나요? (Exposure)">
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
          <QuestionRow question="문제가 생기면 되돌릴 수 있나요? (Reversibility)">
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
          <QuestionRow question="틀리면 가장 부담이 큰 곳은 어디인가요? (Impact)">
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
          <QuestionRow question="사람이 언제 한 번이라도 보게 되나요? (HITL)">
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
        <h2 style={{ margin: 0, fontSize: 16 }}>우측 프리뷰</h2>
        <p style={{ ...subtleStyle, marginTop: 8 }}>입력값이 운영 구조로 실시간 번역됩니다.</p>

        <div style={previewCardStyle}>
          <div style={previewTitleStyle}>1) 운영 감당선 요약</div>
          <ul style={previewListStyle}>
            <li>노출 범위: {data.exposure ? EXPOSURE_LABEL[data.exposure] : "미선택"}</li>
            <li>되돌림 가능성: {data.reversibility ? REVERSIBILITY_LABEL[data.reversibility] : "미선택"}</li>
            <li>실패 비용 위치: {data.impact ? IMPACT_LABEL[data.impact] : "미선택"}</li>
            <li>인간 개입 시점: {data.hitl ? HITL_LABEL[data.hitl] : "미선택"}</li>
          </ul>
        </div>

        <div style={previewCardStyle}>
          <div style={previewTitleStyle}>2) 자동화 범위</div>
          <ul style={previewListStyle}>
            <li>초안 자동 생성: {autoDraft ? "활성화" : "비활성화"}</li>
            <li>자동 게시: {autoPublish ? "활성화" : "비활성화"}</li>
            <li>사전 검토 단계 삽입: {manualReviewRequired ? "예" : "아니오"}</li>
          </ul>
        </div>

        <div style={previewCardStyle}>
          <div style={previewTitleStyle}>3) 상태 흐름 미리보기</div>
          <div style={previewFlowStyle}>{stateFlow}</div>
        </div>

        <div
          style={{
            ...previewCardStyle,
            background: riskLevel === "high" ? "#fef2f2" : riskLevel === "medium" ? "#fffbeb" : "#f0fdf4",
            borderColor: riskLevel === "high" ? "#fecaca" : riskLevel === "medium" ? "#fde68a" : "#bbf7d0",
          }}
        >
          <div style={previewTitleStyle}>4) Risk Profile</div>
          <div style={{ fontSize: 20, fontWeight: 800 }}>RISK PROFILE: {riskLevel.toUpperCase()}</div>
        </div>
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

const blockStyle: CSSProperties = {
  marginTop: 14,
  border: "1px solid #e5e7eb",
  borderRadius: 10,
  background: "#fff",
  overflow: "hidden",
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

const previewCardStyle: CSSProperties = {
  marginTop: 10,
  border: "1px solid #e5e7eb",
  borderRadius: 10,
  padding: 12,
  background: "#fff",
};

const previewTitleStyle: CSSProperties = {
  fontSize: 14,
  fontWeight: 700,
  marginBottom: 6,
};

const previewListStyle: CSSProperties = {
  margin: 0,
  paddingLeft: 16,
  display: "grid",
  gap: 4,
  fontSize: 13,
  color: "#374151",
};

const previewFlowStyle: CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 8,
  padding: "8px 10px",
  background: "#f8fafc",
  fontSize: 13,
  color: "#1f2937",
};
