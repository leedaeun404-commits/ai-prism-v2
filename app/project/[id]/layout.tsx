"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import {
  canAccessExecution,
  canAccessPolicy,
  canAccessTechSpec,
  getProgress,
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

  useEffect(() => {
    if (!id) return;
    const sync = () => setProgressState(getProgress(id));
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
        label: "STEP 1 전략&방향",
        locked: false,
      },
      {
        href: `/project/${id}/execution`,
        label: "STEP 2 설계 초안",
        locked: !canAccessExecution(progress),
      },
      {
        href: `/project/${id}/policy`,
        label: "STEP 3 자동화/리스크",
        locked: !canAccessPolicy(progress),
      },
      {
        href: `/project/${id}/tech-spec`,
        label: "STEP 4 기술 스펙",
        locked: !canAccessTechSpec(progress),
      },
    ],
    [id, progress]
  );

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
    </div>
  );
}
