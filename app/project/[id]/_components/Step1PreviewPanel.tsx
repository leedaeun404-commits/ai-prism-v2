"use client";

import { useMemo } from "react";
import type { CSSProperties } from "react";
import {
  buildStep2FlowPreview,
  type Step1AiTaskType,
  type Step1Data,
  type Step1Exposure,
  type Step1Hitl,
  type Step1Impact,
  type Step1ResultState,
  type Step1Reversibility,
  type Step1Target,
  type Step2Data,
  type Step2FlowStep,
  type Step2FlowSourceTag,
} from "@/lib/prismMvp";

export type Step1PreviewAreaKey = "strategy" | "policy" | "automation" | "state_flow" | "risk_profile";

type BadgeMeta = { bg: string; fg: string; border: string; label: string };

export const STEP1_PREVIEW_BADGES: Record<Step1PreviewAreaKey, BadgeMeta> = {
  strategy: { label: "기획 의도", bg: "#e0f2fe", fg: "#075985", border: "#7dd3fc" },
  policy: { label: "통제 포인트", bg: "#dcfce7", fg: "#166534", border: "#86efac" },
  automation: { label: "실행 방식", bg: "#f3e8ff", fg: "#6b21a8", border: "#d8b4fe" },
  state_flow: { label: "상태 모델", bg: "#fef3c7", fg: "#92400e", border: "#fcd34d" },
  risk_profile: { label: "리스크 영향", bg: "#fee2e2", fg: "#991b1b", border: "#fca5a5" },
};

const TARGET_LABEL_BY_VALUE: Record<Step1Target, string> = {
  internal_staff: "내부 실무자",
  approver_admin: "승인자/관리자",
  end_user: "최종 사용자",
  external_customer_partner: "외부 고객/파트너",
  system_operator: "시스템 운영자",
};

const RESULT_LABEL_BY_VALUE: Record<Step1ResultState, string> = {
  draft_saved: "초안 생성/저장",
  status_changed: "상태 변경",
  review_requested: "검토/승인 요청 생성",
  published_or_executed: "게시/실행 완료",
  reference_saved: "내부 참고자료/리포트 저장",
  action_triggered: "알림/후속 액션 트리거",
  task_created: "티켓/작업 생성",
  ephemeral_response: "저장 없음(일회성 응답)",
  failed: "실패 기록",
  cancelled: "취소/중단",
};

const AI_TASK_LABEL_BY_VALUE: Record<Step1AiTaskType, string> = {
  draft_generation: "초안 생성",
  candidate_suggestion: "후보 제시",
  revision_suggestion: "개선 제안",
  policy_check: "정책 점검",
  classification: "분류",
  approval_assist: "승인 보조",
};

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

function areSourceTagsEqual(a: Step2FlowSourceTag[], b: Step2FlowSourceTag[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i]?.key !== b[i]?.key || a[i]?.label !== b[i]?.label) return false;
  }
  return true;
}

function formatSourceTagLabel(tag: Step2FlowSourceTag, mode: "step1" | "step2"): string {
  if (tag.key === "step1" || tag.key === "ai_task_types" || tag.key === "hitl" || tag.key === "result_state" || tag.key === "final_executor" || tag.key === "exposure") {
    return mode === "step2" ? `Step1 ${tag.label}` : tag.label;
  }
  return tag.label;
}

function FlowStepList({
  steps,
  changedStepIds,
  mode,
}: {
  steps: Step2FlowStep[];
  changedStepIds?: Set<string>;
  mode: "step1" | "step2";
}) {
  if (steps.length === 0) {
    return <div style={previewFlowStyle}>흐름 정보 없음</div>;
  }

  return (
    <div style={previewFlowListStyle}>
      {steps.map((step, index) => {
        const changed = changedStepIds?.has(step.id) ?? false;
        return (
          <div
            key={step.id}
            style={{
              ...previewFlowItemStyle,
              ...(changed ? previewFlowItemChangedStyle : {}),
            }}
          >
            <div style={previewFlowItemHeadStyle}>
              <span style={previewFlowIndexStyle}>{index + 1}</span>
              <span style={previewFlowLabelStyle}>{step.label}</span>
            </div>
            {step.source_tags.length > 0 && (
              <div style={previewTagWrapStyle}>
                {step.source_tags.map((tag) => (
                  <span key={`${step.id}-${tag.key}-${tag.label}`} style={previewSourceTagStyle}>
                    {formatSourceTagLabel(tag, mode)}
                  </span>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function Step1PreviewPanel({
  data,
  step2Data,
  mode = "step1",
  activeArea,
  onAreaClick,
}: {
  data: Step1Data;
  step2Data?: Step2Data | null;
  mode?: "step1" | "step2";
  activeArea?: Step1PreviewAreaKey | null;
  onAreaClick?: (area: Step1PreviewAreaKey) => void;
}) {
  const flowPreview = useMemo(() => buildStep2FlowPreview(data, step2Data ?? undefined), [data, step2Data]);
  const generatedPreview = useMemo(() => buildStep2FlowPreview(data), [data]);
  const changedStepIds = useMemo(() => {
    if (mode !== "step2") return new Set<string>();
    const changed = new Set<string>();
    const current = flowPreview.flow_steps;
    const previous = generatedPreview.flow_steps;
    for (let index = 0; index < current.length; index += 1) {
      const currentStep = current[index];
      const previousStep = previous[index];
      if (!previousStep) {
        changed.add(currentStep.id);
        continue;
      }
      if (previousStep.label !== currentStep.label || !areSourceTagsEqual(previousStep.source_tags, currentStep.source_tags)) {
        changed.add(currentStep.id);
      }
    }
    return changed;
  }, [flowPreview.flow_steps, generatedPreview.flow_steps, mode]);

  const aiRoleSummary =
    data.ai_task_types.length > 0
      ? Array.from(new Set(data.ai_task_types))
          .map((v) => `${AI_TASK_LABEL_BY_VALUE[v]} (ai_task_type=${v})`)
          .join("\n")
      : "—";
  const humanReviewSummary = data.hitl ? `${HITL_LABEL[data.hitl]} (hitl=${data.hitl})` : "—";
  const executionAuthoritySummary = data.result_state ? `${RESULT_LABEL_BY_VALUE[data.result_state]} (result_state=${data.result_state})` : "—";

  let conditionalDelegationSummary = "조건부 자동 적용 (conditional_handling=conditional_apply)";
  if (data.hitl === "pre_review") {
    conditionalDelegationSummary = "사전 검토 후 적용 (conditional_handling=pre_review_then_apply)";
  } else if (data.hitl === "post_monitoring") {
    conditionalDelegationSummary = "적용 후 모니터링 (conditional_handling=post_monitoring)";
  } else if (data.hitl === "none" && data.exposure === "internal" && data.impact && data.impact !== "high") {
    conditionalDelegationSummary = "자동 적용 (conditional_handling=auto_apply)";
  }
  const signal = `입력: impact=${data.impact || "-"}, exposure=${data.exposure || "-"}, hitl=${data.hitl || "-"}`;

  const stateFlowWarning =
    data.result_state === "review_requested" && data.hitl && data.hitl !== "pre_review"
      ? "현재 실행 방식과 상태 흐름이 일치하지 않습니다."
      : "";

  const targetSummary = data.target.length > 0 ? data.target.map((v) => TARGET_LABEL_BY_VALUE[v]).join(", ") : "미선택";
  const resultStateSummary = data.result_state ? `${RESULT_LABEL_BY_VALUE[data.result_state]} (result_state=${data.result_state})` : "미선택 (UNSET)";
  const kpiSummary = data.kpi.trim() || "미입력";
  const exposureSummary = data.exposure ? `${EXPOSURE_LABEL[data.exposure]} (exposure=${data.exposure})` : "미선택 (UNSET)";
  const reversibilitySummary = data.reversibility
    ? `${REVERSIBILITY_LABEL[data.reversibility]} (reversibility=${data.reversibility})`
    : "미선택 (UNSET)";
  const impactSummary = data.impact ? `${IMPACT_LABEL[data.impact]} (impact=${data.impact})` : "미선택 (UNSET)";
  const hitlSummary = data.hitl ? `${HITL_LABEL[data.hitl]} (hitl=${data.hitl})` : "미선택 (UNSET)";

  const impactAnchor = data.impact ? `${IMPACT_LABEL[data.impact]} (impact=${data.impact})` : "실패 비용 위치 입력 필요";
  const riskSignals = [
    data.exposure ? `${EXPOSURE_LABEL[data.exposure]} (exposure=${data.exposure})` : "",
    data.hitl ? `${HITL_LABEL[data.hitl]} (hitl=${data.hitl})` : "",
    data.reversibility ? `${REVERSIBILITY_LABEL[data.reversibility]} (reversibility=${data.reversibility})` : "",
  ].filter(Boolean);

  if (mode === "step2") {
    return (
      <div style={previewFrameStyle}>
        <PreviewSection
          title="Step1 기획 의도"
          badge={STEP1_PREVIEW_BADGES.strategy}
          active={activeArea === "strategy"}
          onClick={onAreaClick ? () => onAreaClick("strategy") : undefined}
        >
          <PreviewItem label="목적 (Purpose)" value={data.why.trim() || "미입력"} />
          <PreviewItem label="대상 사용자 (Target)" value={targetSummary} />
          <PreviewItem label="결과 상태 (Result State)" value={resultStateSummary} />
          <PreviewItem label="성공 가설 (KPI Hypothesis)" value={kpiSummary} />
        </PreviewSection>

        <PreviewSection
          title="처리 플로우"
          badge={STEP1_PREVIEW_BADGES.state_flow}
          active={activeArea === "state_flow"}
          onClick={onAreaClick ? () => onAreaClick("state_flow") : undefined}
        >
          <FlowStepList steps={flowPreview.flow_steps} changedStepIds={changedStepIds} mode={mode} />
        </PreviewSection>

        <PreviewSection
          title="Step2 통제 포인트"
          badge={STEP1_PREVIEW_BADGES.policy}
          active={activeArea === "policy"}
          onClick={onAreaClick ? () => onAreaClick("policy") : undefined}
        >
          <PreviewItem label="노출 범위 (Exposure)" value={exposureSummary} />
          <PreviewItem label="되돌림 가능성 (Reversibility)" value={reversibilitySummary} />
          <PreviewItem label="실패 비용 위치 (Impact)" value={impactSummary} />
          <PreviewItem label="인간 개입 시점 (HITL)" value={hitlSummary} />
        </PreviewSection>

        <PreviewSection
          title="Step2 실행 레이어"
          badge={STEP1_PREVIEW_BADGES.automation}
          active={activeArea === "automation"}
          onClick={onAreaClick ? () => onAreaClick("automation") : undefined}
        >
          <PreviewItem label="AI 실행 방식 (AI Intervention)" value={flowPreview.ai_intervention.value || "미입력"} />
          <div style={previewTagWrapStyle}>
            {flowPreview.ai_intervention.source_tags.map((tag) => (
              <span key={`ai-${tag.key}-${tag.label}`} style={previewSourceTagStyle}>
                {formatSourceTagLabel(tag, mode)}
              </span>
            ))}
          </div>
          <PreviewItem label="사람 개입 방식 (Human Control)" value={flowPreview.human_control.value || "미입력"} />
          <div style={previewTagWrapStyle}>
            {flowPreview.human_control.source_tags.map((tag) => (
              <span key={`human-${tag.key}-${tag.label}`} style={previewSourceTagStyle}>
                {formatSourceTagLabel(tag, mode)}
              </span>
            ))}
          </div>
          <PreviewItem label="시스템 처리 구조 (System Process)" value={flowPreview.system_process.value || "미입력"} />
          <div style={previewTagWrapStyle}>
            {flowPreview.system_process.source_tags.map((tag) => (
              <span key={`sys-${tag.key}-${tag.label}`} style={previewSourceTagStyle}>
                {formatSourceTagLabel(tag, mode)}
              </span>
            ))}
          </div>
        </PreviewSection>

        <PreviewSection
          title="Step1 리스크 영향"
          badge={STEP1_PREVIEW_BADGES.risk_profile}
          active={activeArea === "risk_profile"}
          onClick={onAreaClick ? () => onAreaClick("risk_profile") : undefined}
          isLast
        >
          <PreviewItem label="기준 항목 (Primary Anchor)" value={impactAnchor} />
          <div style={previewReasonStyle}>참고 신호 (Context Signals)</div>
          <ul style={previewReasonListStyle}>
            {riskSignals.map((riskSignal) => (
              <li key={riskSignal}>- {riskSignal}</li>
            ))}
          </ul>
        </PreviewSection>
      </div>
    );
  }

  return (
    <div style={previewFrameStyle}>
      <PreviewSection
        title="기획 의도"
        badge={STEP1_PREVIEW_BADGES.strategy}
        active={activeArea === "strategy"}
        onClick={onAreaClick ? () => onAreaClick("strategy") : undefined}
      >
        <PreviewItem label="목적 (Purpose)" value={data.why.trim() || "미입력"} />
        <PreviewItem label="대상 사용자 (Target)" value={targetSummary} />
        <PreviewItem label="결과 상태 (Result State)" value={resultStateSummary} />
        <PreviewItem label="성공 가설 (KPI Hypothesis)" value={kpiSummary} />
      </PreviewSection>

      <PreviewSection
        title="실행 방식"
        badge={STEP1_PREVIEW_BADGES.automation}
        active={activeArea === "automation"}
        onClick={onAreaClick ? () => onAreaClick("automation") : undefined}
      >
        <PreviewItem label="AI 역할 (AI Role)" value={aiRoleSummary} />
        <PreviewItem label="사람 개입 시점 (Human Review Model)" value={humanReviewSummary} />
        <PreviewItem label="게시/적용 방식 (Execution Authority)" value={executionAuthoritySummary} />
        <PreviewItem label="자동 처리 허용 여부 (Conditional Delegation)" value={`${conditionalDelegationSummary}\n${signal}`} />
      </PreviewSection>

      <PreviewSection
        title="처리 플로우"
        badge={STEP1_PREVIEW_BADGES.state_flow}
        active={activeArea === "state_flow"}
        onClick={onAreaClick ? () => onAreaClick("state_flow") : undefined}
      >
        <FlowStepList steps={flowPreview.flow_steps} mode={mode} />
        {stateFlowWarning && <div style={{ ...previewItemLabelStyle, color: "#b45309", marginTop: 8 }}>{stateFlowWarning}</div>}
      </PreviewSection>

      <PreviewSection
        title="통제 포인트"
        badge={STEP1_PREVIEW_BADGES.policy}
        active={activeArea === "policy"}
        onClick={onAreaClick ? () => onAreaClick("policy") : undefined}
      >
        <PreviewItem label="노출 범위 (Exposure)" value={exposureSummary} />
        <PreviewItem label="되돌림 가능성 (Reversibility)" value={reversibilitySummary} />
        <PreviewItem label="실패 비용 위치 (Impact)" value={impactSummary} />
        <PreviewItem label="인간 개입 시점 (HITL)" value={hitlSummary} />
      </PreviewSection>

      <PreviewSection
        title="리스크 영향"
        badge={STEP1_PREVIEW_BADGES.risk_profile}
        active={activeArea === "risk_profile"}
        onClick={onAreaClick ? () => onAreaClick("risk_profile") : undefined}
        isLast
      >
        <PreviewItem label="기준 항목 (Primary Anchor)" value={impactAnchor} />
        <div style={previewReasonStyle}>참고 신호 (Context Signals)</div>
        <ul style={previewReasonListStyle}>
          {riskSignals.map((riskSignal) => (
            <li key={riskSignal}>- {riskSignal}</li>
          ))}
        </ul>
      </PreviewSection>
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

const previewFrameStyle: CSSProperties = {
  marginTop: 10,
  border: "1px solid #e5e7eb",
  borderRadius: 10,
  background: "#fff",
  overflow: "hidden",
};

const previewBadgeStyle: CSSProperties = {
  display: "inline-block",
  borderWidth: 1,
  borderStyle: "solid",
  borderRadius: 999,
  padding: "2px 8px",
  fontSize: 12,
  fontWeight: 700,
};

const previewSectionStyle: CSSProperties = {
  padding: 10,
  borderBottom: "1px solid #e5e7eb",
};

const previewSectionTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: 12,
  fontWeight: 800,
  color: "#111827",
};

const previewSectionBodyStyle: CSSProperties = {
  marginTop: 8,
  display: "grid",
  gap: 8,
};

const previewItemStyle: CSSProperties = {
  display: "grid",
  gap: 2,
};

const previewItemLabelStyle: CSSProperties = {
  fontSize: 12,
  color: "#6b7280",
};

const previewItemValueStyle: CSSProperties = {
  fontSize: 14,
  fontWeight: 700,
  color: "#1f2937",
  whiteSpace: "pre-wrap",
};

const previewFlowStyle: CSSProperties = {
  border: "1px solid #d1d5db",
  borderRadius: 8,
  background: "#f9fafb",
  padding: "8px 10px",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  fontSize: 12,
  color: "#374151",
  whiteSpace: "pre-wrap",
};

const previewFlowListStyle: CSSProperties = {
  display: "grid",
  gap: 6,
};

const previewFlowItemStyle: CSSProperties = {
  border: "1px solid #d1d5db",
  borderRadius: 8,
  background: "#f9fafb",
  padding: "8px 10px",
};

const previewFlowItemChangedStyle: CSSProperties = {
  background: "#eff6ff",
  borderColor: "#60a5fa",
  boxShadow: "inset 0 0 0 1px #93c5fd",
};

const previewFlowItemHeadStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
};

const previewFlowIndexStyle: CSSProperties = {
  minWidth: 18,
  height: 18,
  borderRadius: 999,
  background: "#e5e7eb",
  color: "#374151",
  fontSize: 11,
  fontWeight: 700,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};

const previewFlowLabelStyle: CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  color: "#1f2937",
};

const previewTagWrapStyle: CSSProperties = {
  marginTop: 6,
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
};

const previewSourceTagStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  border: "1px solid #bfdbfe",
  background: "#eff6ff",
  color: "#1e40af",
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 600,
  padding: "2px 8px",
};

const previewReasonStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: "#6b7280",
};

const previewReasonListStyle: CSSProperties = {
  margin: 0,
  padding: 0,
  listStyle: "none",
  display: "grid",
  gap: 2,
  fontSize: 12,
  color: "#374151",
};
