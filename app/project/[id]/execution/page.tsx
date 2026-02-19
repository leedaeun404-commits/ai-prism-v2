"use client";

import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { useParams } from "next/navigation";
import {
  addHistoryEvent,
  canCompleteStep2,
  canAccessExecution,
  generateStep3Policy,
  generateStep2Data,
  HISTORY_EVENT_TYPES,
  getDefaultPolicy,
  getProgress,
  getStep1Data,
  getStep3Policy,
  getStep2Data,
  getStep2MissingFields,
  setProgress,
  setStep2Data,
  setStep3Policy,
  type Step2Data,
} from "@/lib/prismMvp";

export default function ExecutionPage() {
  const params = useParams();
  const id = String(params?.id ?? "");

  const [locked, setLocked] = useState(true);
  const [draft, setDraft] = useState<Step2Data | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!id) return;
    const progress = getProgress(id);
    const canAccess = canAccessExecution(progress);
    setLocked(!canAccess);

    if (!canAccess) return;

    const step1 = getStep1Data(id);
    const generated = generateStep2Data(step1);
    const existing = getStep2Data(id);

    const textKeys: Array<
      | "status_model"
      | "user_flow"
      | "ai_intervention"
      | "system_process"
      | "human_control"
      | "failure_strategy"
      | "delivery_mode"
      | "data_storage"
      | "log_fields"
      | "cost_strategy"
    > = [
      "status_model",
      "user_flow",
      "ai_intervention",
      "system_process",
      "human_control",
      "failure_strategy",
      "delivery_mode",
      "data_storage",
      "log_fields",
      "cost_strategy",
    ];

    const merged: Step2Data = {
      ...generated,
      ...existing,
      reviewed: { ...generated.reviewed, ...existing.reviewed },
    };

    for (const key of textKeys) {
      const value = (existing[key] ?? "").trim();
      if (!value) merged[key] = generated[key];
    }

    const filledCount = textKeys.filter((key) => String(existing[key] ?? "").trim().length > 0).length;
    if (filledCount <= 1 && String(existing.system_process ?? "").includes("[STEP2 설계 초안]")) {
      merged.system_process = generated.system_process;
    }

    setDraft(merged);
    setStep2Data(id, merged);
  }, [id]);

  function handleSave() {
    if (!id || locked || !draft) return;
    if (!canCompleteStep2(draft)) {
      const missing = getStep2MissingFields(draft);
      setMessage(`저장 불가: 필수 항목/검토 체크를 완료하세요 (${missing.length}개 누락).`);
      return;
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
      detail: "STEP2 설계 초안 저장(검토 완료)",
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
  }

  function updateField(key: keyof Step2Data, value: string) {
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  function toggleReviewed(key: keyof Step2Data["reviewed"]) {
    setDraft((prev) =>
      prev
        ? {
            ...prev,
            reviewed: { ...prev.reviewed, [key]: !prev.reviewed[key] },
          }
        : prev
    );
  }

  const missing = draft ? getStep2MissingFields(draft) : [];
  const complete = draft ? canCompleteStep2(draft) : false;

  return (
    <div style={twoPaneStyle}>
      <section style={mainPanelStyle}>
        <h1 style={titleStyle}>STEP 2 설계 초안</h1>

        {locked && (
          <div style={lockStyle}>
            🔒 STEP1 Freeze 완료 전에는 접근할 수 없습니다.
          </div>
        )}

        <p style={subtleStyle}>STEP1 기반 초안이 자동 생성됩니다. 각 항목을 검토 체크해야 저장됩니다.</p>

        {draft && (
          <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
            <Step2FieldRow
              label="기본 상태 모델"
              value={draft.status_model}
              reviewed={draft.reviewed.status_model}
              disabled={locked}
              onChange={(v) => updateField("status_model", v)}
              onToggle={() => toggleReviewed("status_model")}
            />
            <Step2FieldRow
              label="사용자 행동 흐름"
              value={draft.user_flow}
              reviewed={draft.reviewed.user_flow}
              disabled={locked}
              onChange={(v) => updateField("user_flow", v)}
              onToggle={() => toggleReviewed("user_flow")}
            />
            <Step2FieldRow
              label="AI 개입 위치"
              value={draft.ai_intervention}
              reviewed={draft.reviewed.ai_intervention}
              disabled={locked}
              onChange={(v) => updateField("ai_intervention", v)}
              onToggle={() => toggleReviewed("ai_intervention")}
            />
            <Step2FieldRow
              label="시스템 처리 구조"
              value={draft.system_process}
              reviewed={draft.reviewed.system_process}
              disabled={locked}
              onChange={(v) => updateField("system_process", v)}
              onToggle={() => toggleReviewed("system_process")}
            />
            <Step2FieldRow
              label="Human control 기본값"
              value={draft.human_control}
              reviewed={draft.reviewed.human_control}
              disabled={locked}
              onChange={(v) => updateField("human_control", v)}
              onToggle={() => toggleReviewed("human_control")}
            />
            <Step2FieldRow
              label="실패 대응 기본 구조"
              value={draft.failure_strategy}
              reviewed={draft.reviewed.failure_strategy}
              disabled={locked}
              onChange={(v) => updateField("failure_strategy", v)}
              onToggle={() => toggleReviewed("failure_strategy")}
            />
            <Step2FieldRow
              label="결과 전달 방식"
              value={draft.delivery_mode}
              reviewed={draft.reviewed.delivery_mode}
              disabled={locked}
              onChange={(v) => updateField("delivery_mode", v)}
              onToggle={() => toggleReviewed("delivery_mode")}
            />
            <Step2FieldRow
              label="데이터 저장 구조"
              value={draft.data_storage}
              reviewed={draft.reviewed.data_storage}
              disabled={locked}
              onChange={(v) => updateField("data_storage", v)}
              onToggle={() => toggleReviewed("data_storage")}
            />
            <Step2FieldRow
              label="기본 로그 항목"
              value={draft.log_fields}
              reviewed={draft.reviewed.log_fields}
              disabled={locked}
              onChange={(v) => updateField("log_fields", v)}
              onToggle={() => toggleReviewed("log_fields")}
            />
            <Step2FieldRow
              label="비용 전략 기본값"
              value={draft.cost_strategy}
              reviewed={draft.reviewed.cost_strategy}
              disabled={locked}
              onChange={(v) => updateField("cost_strategy", v)}
              onToggle={() => toggleReviewed("cost_strategy")}
            />
          </div>
        )}

        {!locked && (
          <p style={{ ...subtleStyle, marginTop: 10 }}>
            완료 조건: 필수 항목 10개 입력 + 검토 체크 10개 완료 ({complete ? "충족" : "미충족"})
          </p>
        )}

        <button onClick={handleSave} disabled={locked || !complete} style={{ ...buttonStyle, marginTop: 12 }}>
          저장
        </button>
        {message && <p style={{ ...subtleStyle, marginTop: 8 }}>{message}</p>}
      </section>

      <aside style={sidePanelStyle}>
        <h2 style={{ margin: 0, fontSize: 16 }}>우측 패널</h2>
        <p style={{ ...subtleStyle, marginTop: 8 }}>
          STEP2 저장(완료 조건 충족) 시 STEP3(정책) 탭이 열립니다.
        </p>
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
      </aside>
    </div>
  );
}

function Step2FieldRow({
  label,
  value,
  reviewed,
  disabled,
  onChange,
  onToggle,
}: {
  label: string;
  value: string;
  reviewed: boolean;
  disabled: boolean;
  onChange: (value: string) => void;
  onToggle: () => void;
}) {
  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 10, background: "#fcfcfd" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>{label}</div>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#6b7280" }}>
          <input type="checkbox" checked={reviewed} onChange={onToggle} disabled={disabled} />
          검토 완료
        </label>
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        style={{ ...inputStyle, minHeight: 70, width: "100%", marginTop: 8 }}
      />
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

const inputStyle: CSSProperties = {
  border: "1px solid #d1d5db",
  borderRadius: 8,
  padding: "8px 10px",
  fontSize: 14,
};

const buttonStyle: CSSProperties = {
  border: "1px solid #d1d5db",
  borderRadius: 8,
  padding: "8px 12px",
  background: "#fff",
  fontWeight: 700,
  cursor: "pointer",
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
