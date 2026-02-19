import Link from "next/link";
import type { ReactNode } from "react";

export default function ProjectLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: { id: string };
}) {
  const { id } = params;

  const tabs = [
    { href: `/project/${id}`, label: "STEP 1 전략·방향" },
    { href: `/project/${id}/screening`, label: "STEP 2 설계 초안" },
    { href: `/project/${id}/execution`, label: "STEP 3 자동화·리스크·운영" },
    { href: `/project/${id}/tech-spec`, label: "STEP 4 기술 스펙" },
    { href: `/project/${id}/artifacts`, label: "산출물" },
  ];

  return (
    <div style={{ minHeight: "100vh" }}>
      <div style={{ padding: 16, borderBottom: "1px solid #e5e5e5" }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <Link href="/" style={{ textDecoration: "none" }}>
            ← Home
          </Link>
          <div style={{ fontWeight: 700 }}>PRISM 2.0</div>
          <div style={{ color: "#666" }}>Project: {id}</div>
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
          {tabs.map((t) => (
            <Link key={t.href} href={t.href} style={{ textDecoration: "none" }}>
              <div
                style={{
                  padding: "6px 10px",
                  border: "1px solid #ddd",
                  borderRadius: 999,
                  fontSize: 13,
                }}
              >
                {t.label}
              </div>
            </Link>
          ))}
        </div>
      </div>

      <div style={{ padding: 16 }}>{children}</div>
    </div>
  );
}
