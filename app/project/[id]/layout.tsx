"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import {
  addHistoryEvent,
  getHistory,
  getProgress,
  HISTORY_EVENT_TYPES,
  type HistoryEvent,
  type ProjectProgress,
} from "@/lib/prismMvp";

export default function ProjectLayout({ children }: { children: ReactNode }) {
  const params = useParams();
  const pathname = usePathname();
  const id = String(params?.id ?? "");
  const [progress, setProgressState] = useState<ProjectProgress>({
    step1Frozen: false,
    step2Completed: false,
    step3Completed: false,
  });
  const [memoOpen, setMemoOpen] = useState(false);
  const [memoText, setMemoText] = useState("");
  const [history, setHistory] = useState<HistoryEvent[]>([]);
  const [memoMessage, setMemoMessage] = useState("");

  useEffect(() => {
    if (!id) return;
    const sync = () => {
      setProgressState(getProgress(id));
      setHistory(getHistory(id));
    };
    sync();
    window.addEventListener("storage", sync);
    window.addEventListener("prism-progress-updated", sync as EventListener);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("prism-progress-updated", sync as EventListener);
    };
  }, [id, pathname]);

  const steps = useMemo(
    () => [
      {
        href: `/project/${id}/screening`,
        label: "STEP 1 문제 정의",
        locked: false,
      },
      {
        href: `/project/${id}/execution`,
        label: "STEP 2 플로우 확인",
        locked: !progress.step1Frozen,
      },
      {
        href: `/project/${id}/policy`,
        label: "STEP 3 운영 정책",
        locked: !progress.step1Frozen,
      },
      {
        href: `/project/${id}/tech-spec`,
        label: "STEP 4 기술 명세",
        locked: !progress.step1Frozen || !progress.step2Completed || !progress.step3Completed,
      },
      {
        href: `/project/${id}/poc-review`,
        label: "STEP 5 PoC 리뷰",
        locked: !progress.step1Frozen || !progress.step2Completed || !progress.step3Completed,
      },
    ],
    [id, progress]
  );

  function handleSaveMemo() {
    if (!id) return;
    const text = memoText.trim();
    if (!text) {
      setMemoMessage("메모 내용을 입력해 주세요.");
      return;
    }
    addHistoryEvent(id, {
      stage: "system",
      action: HISTORY_EVENT_TYPES.MANUAL_MEMO,
      detail: text,
    });
    setMemoText("");
    setMemoMessage("메모가 타임라인에 저장되었습니다.");
  }

  const timeline = useMemo(() => {
    return [...history].sort((a, b) => b.ts - a.ts);
  }, [history]);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f8fafc",
        color: "#374151",
        lineHeight: 1.45,
        fontFamily:
          '"Pretendard","Apple SD Gothic Neo","Noto Sans KR","Malgun Gothic","Segoe UI",sans-serif',
      }}
    >
      <header style={{ padding: 16, borderBottom: "1px solid #e5e7eb", background: "#f9fafb" }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 10 }}>
          <Link href="/" style={{ textDecoration: "none", color: "#4b5563", fontWeight: 600 }}>
            ← Home
          </Link>
          <strong style={{ color: "#111827", letterSpacing: "-0.01em" }}>PRISM 2.0</strong>
          <span style={{ color: "#6b7280" }}>Project: {id}</span>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {steps.map((step) => {
            const active = pathname === step.href;
            const style: CSSProperties = {
              padding: "7px 11px",
              border: "1px solid #d1d5db",
              borderRadius: 999,
              fontSize: 13,
              color: step.locked ? "#9ca3af" : "#4b5563",
              background: active ? "#1f2937" : "#f8fafc",
              opacity: step.locked ? 0.85 : 1,
              fontWeight: 600,
            };
            if (active) style.color = "#fff";

            if (step.locked) {
              return (
                <span key={step.href} style={style}>
                  🔒 {step.label}
                </span>
              );
            }

            return (
              <Link key={step.href} href={step.href} style={{ textDecoration: "none" }}>
                <span style={style}>{step.label}</span>
              </Link>
            );
          })}
        </div>
      </header>

      <main style={{ padding: 16 }}>{children}</main>

      <button
        type="button"
        aria-label="메모 열기"
        onClick={() => setMemoOpen((prev) => !prev)}
        style={floatingMemoButtonStyle}
      >
        {memoOpen ? "✕" : "📝"}
      </button>

      {memoOpen && (
        <aside style={memoPanelStyle}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: "#111827" }}>메모</h3>
          <p style={{ margin: "6px 0 0", color: "#6b7280", fontSize: 13 }}>메모는 자동 히스토리와 함께 타임라인에 기록됩니다.</p>

          <textarea
            value={memoText}
            onChange={(e) => {
              setMemoText(e.target.value);
              if (memoMessage) setMemoMessage("");
            }}
            placeholder="메모를 남겨요. (저장과 별개로 기록됨)"
            style={memoInputStyle}
          />
          <button type="button" onClick={handleSaveMemo} style={memoSaveButtonStyle}>
            메모 남기기
          </button>
          {memoMessage && <p style={{ margin: "8px 0 0", fontSize: 12, color: "#4b5563" }}>{memoMessage}</p>}

          <div style={memoTimelineWrapStyle}>
            <div style={{ fontWeight: 700, color: "#111827", marginBottom: 8 }}>타임라인</div>
            <div style={memoTimelineListStyle}>
              {timeline.length === 0 && <p style={{ margin: 0, color: "#9ca3af", fontSize: 13 }}>아직 기록이 없습니다.</p>}
              {timeline.map((event) => (
                <article key={event.id} style={memoTimelineCardStyle}>
                  <div style={{ fontWeight: 700, color: "#1f2937", fontSize: 14 }}>
                    {event.action === HISTORY_EVENT_TYPES.MANUAL_MEMO ? "수동 메모" : `자동 · ${event.stage.toUpperCase()} ${event.action}`}
                  </div>
                  <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>{formatTs(event.ts)}</div>
                  <p style={{ margin: "8px 0 0", whiteSpace: "pre-wrap", fontSize: 13, color: "#111827" }}>{event.summary}</p>
                </article>
              ))}
            </div>
          </div>
        </aside>
      )}
    </div>
  );
}

function formatTs(ts: number) {
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(ts));
}

const floatingMemoButtonStyle: CSSProperties = {
  position: "fixed",
  right: 20,
  bottom: 20,
  width: 52,
  height: 52,
  borderRadius: 999,
  border: "1px solid #bfdbfe",
  background: "#eff6ff",
  color: "#1d4ed8",
  fontSize: 22,
  display: "grid",
  placeItems: "center",
  boxShadow: "0 6px 16px rgba(15, 23, 42, 0.15)",
  cursor: "pointer",
  zIndex: 70,
};

const memoPanelStyle: CSSProperties = {
  position: "fixed",
  right: 20,
  bottom: 86,
  width: 400,
  maxWidth: "calc(100vw - 24px)",
  maxHeight: "72vh",
  overflow: "auto",
  border: "1px solid #e5e7eb",
  borderRadius: 14,
  background: "#ffffff",
  padding: 14,
  boxShadow: "0 10px 28px rgba(15, 23, 42, 0.18)",
  zIndex: 70,
};

const memoInputStyle: CSSProperties = {
  width: "100%",
  minHeight: 110,
  marginTop: 10,
  border: "1px solid #d1d5db",
  borderRadius: 10,
  padding: "10px 12px",
  fontSize: 13,
  color: "#111827",
  resize: "vertical",
};

const memoSaveButtonStyle: CSSProperties = {
  width: "100%",
  marginTop: 10,
  border: "1px solid #bfdbfe",
  borderRadius: 10,
  background: "#eff6ff",
  color: "#1e3a8a",
  padding: "9px 12px",
  fontWeight: 700,
  cursor: "pointer",
};

const memoTimelineWrapStyle: CSSProperties = {
  marginTop: 14,
};

const memoTimelineListStyle: CSSProperties = {
  display: "grid",
  gap: 10,
  maxHeight: 340,
  overflow: "auto",
  paddingRight: 2,
};

const memoTimelineCardStyle: CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 12,
  padding: "10px 12px",
  background: "#fcfcfd",
};
