"use client";

/**
 * [STEP2 홈 / 리스트 화면]
 * 경로: /project/[id]/screening
 *
 * 역할:
 * - Step2에서 만들 "플로우 문서(Flow)" 목록을 보여줌
 * - + 신규 플로우 만들기
 * - 플로우 클릭 → /project/[id]/screening (기본 라우트)
 */

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

/** -----------------------
 * LocalStorage 키 (Step1과 분리)
 * ---------------------- */
const LS_STEP2_PREFIX = "ai-planner-step2-v1:";

type Step2Flow = {
  id: string;
  name: string;
  updatedAt: number;
  status: "진행중" | "완료";
  // 리스트에서 한 줄로 보여줄 요약(선택)
  summary?: string;
};

function loadFlows(itemId: string): Step2Flow[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LS_STEP2_PREFIX + itemId);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveFlows(itemId: string, flows: Step2Flow[]) {
  localStorage.setItem(LS_STEP2_PREFIX + itemId, JSON.stringify(flows));
}

// 안전한 ID 생성
function makeId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    // @ts-ignore
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export default function Step2HomePage() {
  const params = useParams();
  const id = String((params as any)?.id ?? "");

  const [flows, setFlows] = useState<Step2Flow[]>([]);
  const [filter, setFilter] = useState<"진행중" | "완료" | "all">("진행중");

  useEffect(() => {
    if (!id) return;
    setFlows(loadFlows(id));
  }, [id]);

  const filtered = useMemo(() => {
    if (filter === "all") return flows;
    return flows.filter((f) => f.status === filter);
  }, [flows, filter]);

  function handleNew() {
    const flowId = makeId();
    const next: Step2Flow = {
      id: flowId,
      name: "새 플로우",
      updatedAt: Date.now(),
      status: "진행중",
    };

    const merged = [next, ...flows];
    setFlows(merged);
    saveFlows(id, merged);

    // 1단계 라우트 개편: 상세 라우트는 다음 단계에서 연결
  }

  return (
    <main style={{ padding: 24, maxWidth: 1100, margin: "0 auto", fontFamily: "system-ui" }}>
      {/* 상단: Step1 목록으로 */}
      <div style={{ marginBottom: 12 }}>
        <Link href="/">← 전체 목록</Link>
        <span style={{ marginLeft: 10, color: "#666", fontSize: 12 }}>
          (현재 아이템의 Step2 플로우 목록)
        </span>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 900 }}>STEP 2. 서비스 & DB 플로우</div>
          <div style={{ marginTop: 6, color: "#666", fontSize: 13, lineHeight: 1.5 }}>
            유저 행동 → 서비스 처리 → AI → 데이터/로그 흐름을 “한 장”으로 설계해요.
          </div>
        </div>

        <button onClick={handleNew} style={{ padding: "10px 12px", fontWeight: 900 }}>
          신규 플로우
        </button>
      </div>

      {/* 필터 */}
      <div style={{ marginTop: 14, display: "flex", gap: 12, alignItems: "center" }}>
        <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input type="radio" checked={filter === "진행중"} onChange={() => setFilter("진행중")} />
          진행중
        </label>
        <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input type="radio" checked={filter === "완료"} onChange={() => setFilter("완료")} />
          완료
        </label>
        <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input type="radio" checked={filter === "all"} onChange={() => setFilter("all")} />
          전체
        </label>
      </div>

      {/* 리스트 테이블 */}
      <div style={{ marginTop: 14, border: "1px solid #eee", borderRadius: 12, overflow: "hidden", background: "#fff" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 180px 100px", padding: 12, background: "#fafafa", fontWeight: 900 }}>
          <div>플로우 이름</div>
          <div>마지막 수정</div>
          <div>상태</div>
        </div>

        {filtered.length === 0 ? (
          <div style={{ padding: 14, color: "#666" }}>조건에 맞는 항목이 없어요.</div>
        ) : (
          filtered.map((f) => (
            <div
              key={f.id}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 180px 100px",
                padding: 12,
                borderTop: "1px solid #f1f1f1",
              }}
            >
              <div style={{ fontWeight: 900 }}>{f.name}</div>
              <div style={{ color: "#666", fontSize: 12 }}>{new Date(f.updatedAt).toLocaleString()}</div>
              <div>{f.status}</div>
            </div>
          ))
        )}

        <div style={{ padding: 12, borderTop: "1px solid #f1f1f1", color: "#666", fontSize: 12 }}>
          총 {filtered.length}건
        </div>
      </div>

      {/* Step1 상세로 돌아가기(아이템 id 유지) */}
      <div style={{ marginTop: 14 }}>
        <Link href={`/project/${id}`}>← Step1 상세로 돌아가기</Link>
      </div>
    </main>
  );
}
