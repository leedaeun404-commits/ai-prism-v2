"use client";

import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { useParams } from "next/navigation";
import {
  addHistoryEvent,
  canAccessPolicy,
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
  type Step3Policy,
} from "@/lib/prismMvp";

type Step3FieldKey = keyof Omit<Step3Policy, "reviewed">;

const STEP3_FIELDS: Array<{ key: Step3FieldKey; label: string }> = [
  { key: "automation_level_adjustment", label: "자동화 수준 조정" },
  { key: "auto_processing_scope", label: "자동 처리 범위 조정" },
  { key: "tolerance_adjustment", label: "허용 오차 조정" },
  { key: "human_review_insertion", label: "Human review 삽입 여부" },
  { key: "failure_ux_policy", label: "실패 시 UX 정책" },
  { key: "final_decision_policy", label: "AI 판단 최종 여부" },
  { key: "cost_quality_strategy", label: "비용-품질 균형 전략" },
  { key: "cache_strategy", label: "캐시 전략" },
  { key: "data_assetization_strategy", label: "데이터 자산화 전략" },
  { key: "monitoring_standard", label: "모니터링 기준" },
  { key: "rollback_standard", label: "롤백 기준" },
  { key: "model_versioning", label: "모델 버전 관리" },
];

export default function PolicyPage() {
  const params = useParams();
  const id = String(params?.id ?? "");

  const [locked, setLocked] = useState(true);
  const [policy, setPolicy] = useState<Step3Policy | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!id) return;
    const progress = getProgress(id);
    const canAccess = canAccessPolicy(progress);
    setLocked(!canAccess);
    if (!canAccess) return;

    const step1 = getStep1Data(id);
    const step2 = getStep2Data(id);
    const generated = generateStep3Policy(step1, step2);
    const existing = getStep3Policy(id);

    const merged: Step3Policy = {
      ...generated,
      ...existing,
      reviewed: { ...generated.reviewed, ...(existing.reviewed ?? {}) },
    };

    for (const field of STEP3_FIELDS) {
      const v = String(existing[field.key] ?? "").trim();
      if (!v) merged[field.key] = generated[field.key];
    }

    setPolicy(merged);
    setStep3Policy(id, merged);
  }, [id]);

  function updateField(key: Step3FieldKey, value: string) {
    setPolicy((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  function toggleReviewed(key: keyof Step3Policy["reviewed"]) {
    setPolicy((prev) =>
      prev
        ? {
            ...prev,
            reviewed: { ...prev.reviewed, [key]: !prev.reviewed[key] },
          }
        : prev
    );
  }

  function handleSave() {
    if (!id || locked || !policy) return;
    if (!canCompleteStep3(policy)) {
      const missing = getStep3MissingFields(policy);
      setMessage(`저장 불가: 필수 항목/검토 체크를 완료하세요 (${missing.length}개 누락).`);
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

  const missing = policy ? getStep3MissingFields(policy) : [];
  const complete = policy ? canCompleteStep3(policy) : false;

  return (
    <div style={twoPaneStyle}>
      <section style={mainPanelStyle}>
        <h1 style={titleStyle}>STEP 3 자동화/리스크</h1>

        {locked && <div style={lockStyle}>🔒 STEP2 저장 완료 전에는 접근할 수 없습니다.</div>}

        <p style={subtleStyle}>STEP2 검토 결과를 기반으로 정책 초안이 자동 생성됩니다.</p>
        <div style={policyMeaningStyle}>
          auto_approved = 초안 내부 저장 승인(배포 아님) · publish 승인 = 외부 반영 승인(휴먼 필수)
        </div>

        {policy && (
          <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
            {STEP3_FIELDS.map((field) => (
              <Step3FieldRow
                key={field.key}
                label={field.label}
                value={policy[field.key]}
                reviewed={policy.reviewed[field.key]}
                disabled={locked}
                onChange={(v) => updateField(field.key, v)}
                onToggle={() => toggleReviewed(field.key)}
              />
            ))}
          </div>
        )}

        {!locked && (
          <p style={{ ...subtleStyle, marginTop: 10 }}>
            완료 조건: 필수 항목 12개 입력 + 검토 체크 12개 완료 ({complete ? "충족" : "미충족"})
          </p>
        )}

        <button onClick={handleSave} disabled={locked || !complete} style={{ ...buttonStyle, marginTop: 12 }}>
          저장
        </button>
        {message && <p style={{ ...subtleStyle, marginTop: 8 }}>{message}</p>}
      </section>

      <aside style={sidePanelStyle}>
        <h2 style={{ margin: 0, fontSize: 16 }}>우측 패널</h2>
        <p style={{ ...subtleStyle, marginTop: 8 }}>STEP3 저장(완료 조건 충족) 시 STEP4 기술 스펙 탭이 열립니다.</p>
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

function Step3FieldRow({
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
