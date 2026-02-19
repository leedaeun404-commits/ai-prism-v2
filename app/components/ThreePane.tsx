"use client";

import type { CSSProperties, ReactNode } from "react";

type ThreePaneProps = {
  left: ReactNode;
  middle: ReactNode;
  right: ReactNode;
  leftTitle?: string;
  middleTitle?: string;
  rightTitle?: string;
};

export default function ThreePane({
  left,
  middle,
  right,
  leftTitle = "Navigation",
  middleTitle = "Editor",
  rightTitle = "Insights",
}: ThreePaneProps) {
  return (
    <div
      className="three-pane-grid"
      style={{ display: "grid", gridTemplateColumns: "240px minmax(0, 1fr) 320px", gap: 16 }}
    >
      <aside style={{ position: "sticky", top: 16, alignSelf: "start" }}>
        <div style={panelStyle}>
          <div style={titleStyle}>{leftTitle}</div>
          <div>{left}</div>
        </div>
      </aside>

      <section>
        <div style={panelStyle}>
          <div style={titleStyle}>{middleTitle}</div>
          <div>{middle}</div>
        </div>
      </section>

      <aside style={{ position: "sticky", top: 16, alignSelf: "start" }}>
        <div style={panelStyle}>
          <div style={titleStyle}>{rightTitle}</div>
          <div>{right}</div>
        </div>
      </aside>

      <style jsx>{`
        @media (max-width: 1100px) {
          .three-pane-grid {
            grid-template-columns: 1fr;
          }

          aside {
            position: static !important;
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
  padding: 14,
};

const titleStyle: CSSProperties = {
  fontSize: 13,
  fontWeight: 800,
  marginBottom: 10,
  color: "#374151",
};
