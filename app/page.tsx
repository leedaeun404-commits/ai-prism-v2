"use client";

/*
  [0] app/page.tsx = 홈(목록) 화면
  - [상단] 툴 제목 + 단계 설명(메인/서브 문장)
  - [1층] 단계 탭 (1~7)
  - [2층] 필터 + 신규 버튼
  - [3층] 가로 테이블(기획 리스트)
  - [3층 하단] 총 n건 (테이블 왼쪽 아래)

  [이번 버전 핵심]
  - +신규 버튼 동작:
    (1) 빈 기획 생성
    (2) localStorage 저장
    (3) /project/[id]로 이동
*/

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getOrCreateMainStep2Flow } from "@/lib/step2Flows";

/* =========================
   [1] 타입 정의
========================= */

// [1-1] 단계(탭) 타입
const STAGE1_OLD = "1. 문제 정의(데이터 정의)" as const;
const STAGE1_NEW = "문제 & AI 적합성 검토" as const;
const STAGE2_OLD = "2. 가용 데이터(전처리)" as const;
const STAGE2_NEW = "메인 플로우 설계" as const;
const STAGE3_OLD = "3. 모델 구조 설계" as const;
const STAGE3_NEW = "기능 & 화면" as const;
const STAGE4_OLD = "4. 모델 학습" as const;
const STAGE4_NEW = "AI 모델 & 데이터" as const;
const STAGE5_OLD = "5. 모델 평가 & 검증" as const;
const STAGE5_NEW = "운영 & 리스크" as const;
const STAGE6_NEW = "비용 & 지표" as const;

type Stage =
  | typeof STAGE1_NEW
  | typeof STAGE2_NEW
  | typeof STAGE3_NEW
  | typeof STAGE4_NEW
  | typeof STAGE5_NEW
  | typeof STAGE6_NEW;

// [1-2] 홈 리스트에 저장되는 요약 아이템
type Item = {
  id: string;
  title: string;
  stage: Stage | typeof STAGE1_OLD | typeof STAGE2_OLD | typeof STAGE3_OLD | typeof STAGE4_OLD | typeof STAGE5_OLD;
  updatedAt: number;

  status?: "진행중" | "완료";
  doneReason?: string;
};

/* =========================
   [2] 상수(고정 데이터)
========================= */

// [2-1] 단계 목록
const STAGES: Stage[] = [
  STAGE1_NEW,
  STAGE2_NEW,
  STAGE3_NEW,
  STAGE4_NEW,
  STAGE5_NEW,
  STAGE6_NEW,
];

// [2-2] 단계별 상단 문구(메인/서브) — “요. 체” + “무엇/왜/안하면” 톤 고정
const STAGE_COPY: Record<Stage, { main: string; sub: string }> = {
  [STAGE1_NEW]: {
    main: "문제를 정의하고, 데이터로 풀 수 있는지 확인해요.",
    sub: "문제·AI 필요성·데이터가 한 흐름으로 연결되게 정리해요.",
  },
  [STAGE2_NEW]: {
    main: "쓸 수 있는 데이터를 확정하고 전처리 기준을 정해요.",
    sub: "데이터 품질/형태를 고정해요. 고정되지 않으면 학습이 흔들려요.",
  },
  [STAGE3_NEW]: {
    main: "이 문제를 어떤 방식으로 풀지 설계해요.",
    sub: "입력·출력·제약을 먼저 고정해요. 고정되지 않으면 구현이 계속 바뀌어요.",
  },
  [STAGE4_NEW]: {
    main: "학습으로 갈지, 프롬프트로 충분한지 판단해요.",
    sub: "학습 비용 대비 효과를 확인해요. 확인 없이 진행하면 되돌아와요.",
  },
  [STAGE5_NEW]: {
    main: "서비스에 써도 되는 수준인지 검증해요.",
    sub: "성공/실패 기준으로 통과 여부를 결정해요. 기준이 없으면 결론이 흔들려요.",
  },
  [STAGE6_NEW]: {
    main: "성능 변화를 추적하고 유지 전략을 정해요.",
    sub: "지표/로그/알림을 고정해요. 고정되지 않으면 이상을 놓쳐요.",
  },
};

// [2-3] 로컬스토리지 키(홈 리스트)
const LS_KEY = "ai-planner-items-v1";
const LS_DETAIL_PREFIX = "ai-planner-detail-v1:";
const LS_STEP2_FLOWLIST_PREFIX = "ai-planner-step2-v1:";
const LS_STEP2_DETAIL_PREFIX = "ai-planner-step2-detail-v1:";

/* =========================
   [3] 로컬스토리지 유틸
========================= */

// [3-1] 불러오기
function loadItems(): Item[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as Item[]) : [];
  } catch {
    return [];
  }
}

// [3-2] 저장하기
function saveItems(items: Item[]) {
  localStorage.setItem(LS_KEY, JSON.stringify(items));
}

function loadDetailPreview(id: string): {
  oneLine?: string;
  role?: string;
  userType?: string;
  asIs?: string;
  toBe?: string;
  whatWhy?: string;
  aiPresence?: string;
  withoutAI?: string;
  whyBreaks?: string[];
  whyAI?: string[];
} {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(LS_DETAIL_PREFIX + id);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    const oneLine = parsed?.identity?.oneLine ? String(parsed.identity.oneLine) : "";
    const asIs = parsed?.identity?.asIs ? String(parsed.identity.asIs) : "";
    const toBe = parsed?.identity?.toBe ? String(parsed.identity.toBe) : "";
    const whatWhy = parsed?.identity?.whatWhy ? String(parsed.identity.whatWhy) : "";
    const aiPresence = parsed?.aiNeed?.aiPresence ? String(parsed.aiNeed.aiPresence) : "";
    const withoutAI = parsed?.aiNeed?.withoutAI ? String(parsed.aiNeed.withoutAI) : "";
    const whyBreaks = Array.isArray(parsed?.aiNeed?.whyBreaks) ? parsed.aiNeed.whyBreaks.map(String) : [];
    const whyAI = Array.isArray(parsed?.aiNeed?.whyAI) ? parsed.aiNeed.whyAI.map(String) : [];
    const role = Array.isArray(parsed?.aiNeed?.whyAI) ? String(parsed.aiNeed.whyAI[0] ?? "") : "";
    const userType = parsed?.identity?.whatWhy ? "내부 운영자" : "";
    return { oneLine, role, userType, asIs, toBe, whatWhy, aiPresence, withoutAI, whyBreaks, whyAI };
  } catch {
    return {};
  }
}

// [3-3] 안전한 ID 생성 (환경에 따라 randomUUID가 없을 수 있어 fallback 포함)
function makeId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    // @ts-ignore
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeStage(stage: string): Stage {
  if (stage === STAGE1_OLD) return STAGE1_NEW;
  if (stage === STAGE2_OLD) return STAGE2_NEW;
  if (stage === STAGE3_OLD) return STAGE3_NEW;
  if (stage === STAGE4_OLD) return STAGE4_NEW;
  if (stage === STAGE5_OLD) return STAGE5_NEW;
  if (stage === "운영 & 비용 & 리스크") return STAGE5_NEW;
  if (stage === "6. 모델 배포" || stage === "7. 모니터링 & 유지보수") return STAGE6_NEW;
  if ((STAGES as string[]).includes(stage)) return stage as Stage;
  return STAGES[0];
}

function compactPreviewText(v?: string) {
  if (!v) return "";
  return v
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 2)
    .join("\n");
}

function compactListText(v?: string[]) {
  if (!v || v.length === 0) return "";
  return v.map((s) => String(s).trim()).filter(Boolean).slice(0, 2).join(", ");
}

function previewLine(v?: string, fallback = "—", max = 42) {
  const text = (v ?? "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)
    .join(" ");
  if (!text) return fallback;
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

type PreviewRow = { label: string; value: string };
type PreviewBlock = { section: string; rows: PreviewRow[] };

function step2ResultLabel(value: unknown) {
  const v = String(value ?? "");
  const map: Record<string, string> = {
    immediate_response: "동기 처리",
    read_after_save: "비동기 처리",
    status_only: "상태값만 갱신",
    separate_notification: "별도 채널 알림",
    followup_required: "사용자 후속 액션 필요",
  };
  return map[v] ?? "미정";
}

function loadStep2Preview(itemId: string): {
  user?: string;
  situation?: string;
  goal?: string;
  steps?: Array<{ userAction?: string; systemAction?: string; resultHandling?: string }>;
} {
  if (typeof window === "undefined") return {};
  try {
    const flowListRaw = localStorage.getItem(LS_STEP2_FLOWLIST_PREFIX + itemId);
    const flows = flowListRaw ? JSON.parse(flowListRaw) : [];
    const mainFlowId = Array.isArray(flows) && flows.length > 0 ? String(flows[0]?.id ?? "") : "";
    if (!mainFlowId) return {};

    const detailRaw = localStorage.getItem(LS_STEP2_DETAIL_PREFIX + `${itemId}:${mainFlowId}`);
    if (!detailRaw) return {};
    const parsed = JSON.parse(detailRaw);

    return {
      user: parsed?.persona?.user ? String(parsed.persona.user) : "",
      situation: parsed?.persona?.situation ? String(parsed.persona.situation) : "",
      goal: parsed?.persona?.goal ? String(parsed.persona.goal) : "",
      steps: Array.isArray(parsed?.steps)
        ? parsed.steps.map((s: any) => ({
            userAction: s?.userAction ? String(s.userAction) : "",
            systemAction: s?.systemAction ? String(s.systemAction) : "",
            resultHandling: s?.resultHandling ? String(s.resultHandling) : "",
          }))
        : [],
    };
  } catch {
    return {};
  }
}

function buildRecentPreviewBlocks(item: Item): PreviewBlock[] {
  const stage = normalizeStage(item.stage);

  if (stage === STAGE2_NEW) {
    const s2 = loadStep2Preview(item.id);
    const steps = Array.isArray(s2.steps) ? s2.steps : [];
    const first = steps[0] ?? {};
    const second = steps[1] ?? {};
    return [
      {
        section: "[B] 핵심 플로우 정의",
        rows: [
          { label: "1단계 처리", value: previewLine(first.systemAction) },
          { label: "1단계 결과", value: previewLine(step2ResultLabel(first.resultHandling), "미정") },
          { label: "2단계 처리", value: previewLine(second.systemAction) },
          { label: "2단계 결과", value: previewLine(step2ResultLabel(second.resultHandling), "미정") },
        ],
      },
    ];
  }

  const s1 = loadDetailPreview(item.id);
  return [
    {
      section: "[A] 문제 정의",
      rows: [
        { label: "AS-IS 문제", value: previewLine(compactPreviewText(s1.asIs)) },
        { label: "TO-BE 방향", value: previewLine(compactPreviewText(s1.toBe)) },
        { label: "왜 해야 하나", value: previewLine(compactPreviewText(s1.whatWhy)) },
        { label: "문제 요약", value: previewLine(compactPreviewText(s1.oneLine)) },
      ],
    },
    {
      section: "[B] AI 타당성",
      rows: [
        { label: "현재 AI 유무", value: previewLine(compactPreviewText(s1.aiPresence)) },
        { label: "AI 없이 가능", value: previewLine(compactPreviewText(s1.withoutAI)) },
        { label: "깨지는 이유", value: previewLine(compactListText(s1.whyBreaks), "—", 36) },
        { label: "AI 역할", value: previewLine(compactListText(s1.whyAI), "—", 36) },
      ],
    },
  ];
}

/* =========================
   [4] Home 컴포넌트
========================= */

export default function Home() {
  /* -------------------------
     [4-1] 라우터
  ------------------------- */
  const router = useRouter(); // [4-1-a] +신규 → 상세 이동

    function openItem(it: Item) {
    const stage = normalizeStage(it.stage);
    // Step 1
    if (stage === STAGE1_NEW || stage.startsWith("1.")) {
      router.push(`/project/${it.id}`);
      return;
    }

    // Step 2
    if (stage === STAGE2_NEW || stage.startsWith("2.")) {
  const flow = getOrCreateMainStep2Flow(it.id);
  router.push(`/project/${it.id}/screening`);
  return;
}
    // 나머지는 일단 Step1
    router.push(`/project/${it.id}`);
  }
  
  /* -------------------------
     [4-2] 상태(State)
  ------------------------- */
  const [activeTab, setActiveTab] = useState<Stage | typeof STAGE1_OLD>(STAGES[0]); // [4-2-a] 현재 탭
  const [items, setItems] = useState<Item[]>([]); // [4-2-b] 전체 목록
  // [4-2-d] 신규 생성 모달 상태 + 입력값
  const [showNewModal, setShowNewModal] = useState(false);
  const [newTitle, setNewTitle] = useState("");

  // [4-2-c] 필터
  const [statusFilter, setStatusFilter] = useState<"전체" | "진행중" | "완료">("전체");
  const [searchQuery, setSearchQuery] = useState("");
  const [hoverRowId, setHoverRowId] = useState<string | null>(null);
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const resolvedActiveTab = normalizeStage(activeTab);

  /* -------------------------
     [4-3] 최초 로딩
  ------------------------- */
  useEffect(() => {
    setItems(loadItems());
  }, []);

  /* -------------------------
     [4-4] 탭+필터 적용된 리스트
  ------------------------- */
  const filtered = useMemo(() => {
    return items
      .filter((it) => normalizeStage(it.stage) === resolvedActiveTab)
      .filter((it) =>
        searchQuery.trim()
          ? it.title.toLowerCase().includes(searchQuery.trim().toLowerCase())
          : true
      )
      .filter((it) => {
        const status = it.status ?? "진행중";
        if (statusFilter === "전체") return true;
        return status === statusFilter;
      })
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }, [items, resolvedActiveTab, searchQuery, statusFilter]);

  const recentItems = useMemo(
    () => [...items].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 4),
    [items]
  );

/* -------------------------
   [4-5] +신규 버튼 동작
   (1) 생성 모달 오픈
   (2) 제목 입력
   (3) 확인 시에만 실제 생성 + 이동
------------------------- */
function handleNew() {
  setNewTitle("ex) 이상거래 탐지 자동 분류"); // 기본 예시
  setShowNewModal(true);                  // ✅ 모달만 연다
}
function confirmCreate() {
  const title = newTitle.trim() || "(제목 없음)";
  const id = makeId();

  const newItem: Item = {
    id,
    title,
    stage: resolvedActiveTab,
    updatedAt: Date.now(),
    status: "진행중",
  };

  const next = [newItem, ...items];
  setItems(next);
  saveItems(next);

  setShowNewModal(false);
  router.push(`/project/${id}`);
}
  /* =========================
     [5] UI
     - 화면에 보이는 모든 영역
     - 테이블 / 신규 버튼 / 신규 생성 모달 포함
  ========================= */

  return (
    <main style={{ padding: 24, maxWidth: 1220, margin: "0 auto", fontFamily: "system-ui", color: "#1f2937" }}>
      <div style={{ display: "grid", gap: 18 }}>
        {/* 상단: 로고 + 검색 */}
        <div style={{ display: "grid", gridTemplateColumns: "170px minmax(0, 1fr)", gap: 12, alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <img
              src="/prism-logo.png"
              alt="PRISM 로고"
              style={{ width: 22, height: 22, objectFit: "contain", display: "block" }}
            />
            <div style={{ fontSize: 22, fontWeight: 800 }}>PRISM</div>
          </div>
          <div
            style={{
              height: 48,
              border: "1px solid #d1d5db",
              borderRadius: 999,
              background: "#f8fafc",
              display: "flex",
              alignItems: "center",
              padding: "0 16px",
              gap: 8,
            }}
          >
            <span style={{ color: "#6b7280" }}>⌕</span>
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="검색"
              style={{
                width: "100%",
                border: "none",
                outline: "none",
                background: "transparent",
                fontSize: 15,
                color: "#1f2937",
              }}
            />
          </div>
        </div>

        {/* 최근 작업 */}
        <div
          style={{
            marginLeft: "calc(50% - 50vw)",
            marginRight: "calc(50% - 50vw)",
            background: "#fafafa",
            padding: "14px 0",
          }}
        >
          <section style={{ maxWidth: 1220, margin: "0 auto", padding: "0 24px" }}>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 10 }}>최근 작업</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 14 }}>
            <button
              onClick={handleNew}
              style={{
                border: "1px solid #d1d5db",
                borderRadius: 10,
                background: "#fff",
                minHeight: 300,
                cursor: "pointer",
                display: "grid",
                gridTemplateRows: "1fr auto",
                textAlign: "left",
                overflow: "hidden",
              }}
              title="새로 만들기"
            >
              <div
                style={{
                  height: 236,
                  padding: "10px 10px 8px",
                  borderBottom: "1px solid #e5e7eb",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    display: "grid",
                    placeItems: "center",
                  }}
                >
                  <div style={{ fontSize: 52, lineHeight: 1, color: "#4f46e5" }}>+</div>
                </div>
              </div>
              <div
                style={{
                  padding: "10px 12px 12px",
                  minHeight: 40,
                  display: "flex",
                  alignItems: "flex-end",
                }}
              >
                <div style={{ fontSize: 13, color: "#6b7280" }}>새로 만들기</div>
              </div>
            </button>
            {recentItems.map((it) => {
              const previewBlocks = buildRecentPreviewBlocks(it);
              return (
                <button
                  key={it.id}
                  onClick={() => openItem(it)}
                  style={{
                    border: "1px solid #d1d5db",
                    borderRadius: 10,
                    background: "#fff",
                    minHeight: 300,
                    cursor: "pointer",
                    textAlign: "left",
                    display: "grid",
                    gridTemplateRows: "1fr auto",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      background: "#fff",
                      height: 236,
                      padding: "10px 10px 8px",
                      overflow: "hidden",
                      borderBottom: "1px solid #e5e7eb",
                    }}
                  >
                    <div style={{ display: "grid", gap: 8, maxHeight: 210, overflow: "hidden" }}>
                      {previewBlocks.map((block) => (
                        <div
                          key={block.section}
                          style={{
                            display: "grid",
                            gap: 4,
                            borderTop: "1px solid #eef2f7",
                            paddingTop: 6,
                          }}
                        >
                          <div style={{ fontSize: 8.5, fontWeight: 700, color: "#374151" }}>{block.section}</div>
                          {block.rows.map((row) => (
                            <div
                              key={`${block.section}-${row.label}`}
                              style={{
                                display: "grid",
                                gridTemplateColumns: "68px 1fr",
                                alignItems: "start",
                                gap: 6,
                              }}
                            >
                              <div
                                style={{
                                  fontSize: 7.8,
                                  fontWeight: 700,
                                  color: "#4b5563",
                                  lineHeight: 1.4,
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {row.label}
                              </div>
                              <div
                                style={{
                                  border: "1px solid #d1d5db",
                                  borderRadius: 6,
                                  minHeight: 22,
                                  padding: "3px 6px",
                                  fontSize: 8,
                                  color: "#4b5563",
                                  lineHeight: 1.35,
                                  whiteSpace: "nowrap",
                                  textOverflow: "ellipsis",
                                  overflow: "hidden",
                                }}
                              >
                                {row.value || "—"}
                              </div>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div style={{ padding: "10px 12px 12px" }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "#111827", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {it.title}
                    </div>
                    <div style={{ marginTop: 4 }}>
                      <div style={{ fontSize: 12, color: "#6b7280", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        마지막으로 연 시간 {new Date(it.updatedAt).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
            {Array.from({ length: Math.max(0, 4 - recentItems.length) }).map((_, i) => (
              <div key={`empty-${i}`} style={{ border: "1px dashed #e5e7eb", borderRadius: 10, minHeight: 300, background: "#fff" }} />
            ))}
            </div>
          </section>
        </div>

        {/* 작업 상태 탭 */}
        <section>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {STAGES.map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  padding: "8px 12px",
                  borderRadius: 999,
                  border: "1px solid #d1d5db",
                  background: resolvedActiveTab === tab ? "#111827" : "#fff",
                  color: resolvedActiveTab === tab ? "#fff" : "#111827",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                {tab}
              </button>
            ))}
          </div>
        </section>

        {/* 프로젝트 리스트 */}
        <section style={{ border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden", background: "#fff" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1.2fr 1.4fr 1fr 1fr 1fr 1fr 1fr",
              background: "#fafafa",
              borderBottom: "1px solid #e5e7eb",
              fontWeight: 700,
              fontSize: 13,
              color: "#374151",
            }}
          >
            <div style={{ padding: 10, borderRight: "1px solid #f8fafc" }}>서비스 이름</div>
            <div style={{ padding: 10, borderRight: "1px solid #f8fafc" }}>기능 이름</div>
            <div style={{ padding: 10, borderRight: "1px solid #f8fafc" }}>Primary (Tag)</div>
            <div style={{ padding: 10, borderRight: "1px solid #f8fafc" }}>AI 역할</div>
            <div style={{ padding: 10, borderRight: "1px solid #f8fafc" }}>사용자 구분</div>
            <div
              style={{
                padding: 10,
                borderRight: "1px solid #f8fafc",
                position: "relative",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
              }}
            >
              <button
                onClick={() => setStatusMenuOpen((v) => !v)}
                style={{
                  border: "none",
                  background: "transparent",
                  padding: 0,
                  margin: 0,
                  color: "#374151",
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                기능 상태
              </button>
              <button
                onClick={() => setStatusMenuOpen((v) => !v)}
                aria-label="기능 상태 필터"
                title="기능 상태 필터"
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 999,
                  border: "1px solid rgba(107,114,128,0.22)",
                  background: "rgba(107,114,128,0.08)",
                  color: "#6b7280",
                  fontSize: 12,
                  display: "grid",
                  placeItems: "center",
                  cursor: "pointer",
                }}
              >
                ▾
              </button>
              {statusMenuOpen && (
                <div
                  style={{
                    position: "absolute",
                    top: "calc(100% + 6px)",
                    right: 0,
                    zIndex: 20,
                    minWidth: 92,
                    border: "1px solid #e5e7eb",
                    borderRadius: 8,
                    background: "#fff",
                    boxShadow: "0 6px 20px rgba(15,23,42,0.12)",
                    overflow: "hidden",
                  }}
                >
                  {(["전체", "진행중", "완료"] as const).map((option) => (
                    <button
                      key={option}
                      onClick={() => {
                        setStatusFilter(option);
                        setStatusMenuOpen(false);
                      }}
                      style={{
                        width: "100%",
                        border: "none",
                        background: statusFilter === option ? "#f8fafc" : "#fff",
                        color: "#374151",
                        fontSize: 12,
                        padding: "8px 10px",
                        textAlign: "left",
                        cursor: "pointer",
                      }}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div style={{ padding: 10 }}>최근 수정일</div>
          </div>

          {filtered.length === 0 ? (
            <div style={{ padding: 14, color: "#6b7280" }}>조건에 맞는 항목이 없어요.</div>
          ) : (
            filtered.map((it) => {
              const preview = loadDetailPreview(it.id);
              return (
                <div
                  key={it.id}
                  onClick={() => openItem(it)}
                  role="button"
                  tabIndex={0}
                  onMouseEnter={() => setHoverRowId(it.id)}
                  onMouseLeave={() => setHoverRowId((prev) => (prev === it.id ? null : prev))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      openItem(it);
                    }
                  }}
                  aria-label={`${it.title} 상세 열기`}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1.2fr 1.4fr 1fr 1fr 1fr 1fr 1fr",
                    borderBottom: "1px solid #f3f4f6",
                    fontSize: 14,
                    cursor: "pointer",
                    background: hoverRowId === it.id ? "#f8fbff" : "#fff",
                    transition: "background 120ms ease",
                  }}
                >
                  <div style={{ padding: 10, color: "#6b7280", borderRight: "1px solid #f8fafc" }}>—</div>
                  <div
                    title={it.title}
                    style={{
                      padding: 10,
                      color: "#374151",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      borderRight: "1px solid #f8fafc",
                      transition: "color 120ms ease",
                    }}
                  >
                    {it.title}
                  </div>
                  <div style={{ padding: 10, color: "#374151", borderRight: "1px solid #f8fafc" }}>{preview.role || "—"}</div>
                  <div style={{ padding: 10, color: "#374151", borderRight: "1px solid #f8fafc" }}>{preview.role || "—"}</div>
                  <div style={{ padding: 10, color: "#374151", borderRight: "1px solid #f8fafc" }}>{preview.userType || "—"}</div>
                  <div style={{ padding: 10, color: "#374151", borderRight: "1px solid #f8fafc" }}>{it.status ?? "진행중"}</div>
                  <div style={{ padding: 10, color: "#374151" }}>{new Date(it.updatedAt).toLocaleDateString()}</div>
                </div>
              );
            })
          )}

          <div style={{ padding: "8px 12px", fontSize: 13, color: "#6b7280", borderTop: "1px solid #e5e7eb", background: "#fafafa" }}>
            총 {filtered.length}건
          </div>
        </section>
      </div>

      {/* =========================
         [5-7] 신규 생성 모달
         - 신규 버튼 클릭 시 표시
         - 제목 입력 후 '생성'해야 실제로 만들어짐
      ========================= */}
      {showNewModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            zIndex: 50,
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 520,
              background: "#fff",
              borderRadius: 12,
              padding: 16,
            }}
          >
            <div style={{ fontWeight: 900, fontSize: 16, marginBottom: 10 }}>
              새로운 기획안을 만들게요.
            </div>

            <input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="ex) 이상거래 탐지 자동 분류"
              style={{
                width: "100%",
                padding: 10,
                border: "1px solid #ddd",
                borderRadius: 8,
              }}
              autoFocus
            />

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: 8,
                marginTop: 12,
              }}
            >
              <button onClick={() => setShowNewModal(false)}>
                취소
              </button>
              <button
                onClick={confirmCreate}
                style={{ fontWeight: 900 }}
              >
                생성
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
} 
