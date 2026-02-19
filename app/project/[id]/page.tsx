"use client";

/*
  [0] app/project/[id]/page.tsx = 상세 화면 ...export default function
*/

import React, { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter, useParams } from "next/navigation";
import { DROP_REASONS, getRecommendedDropReasons } from "@/lib/dropReasons";
import Step1Body from "@/app/components/Step1Body";

/* =========================
   [1] 타입 정의
========================= */

type Option = { value: string; label: string };

/* =========================
   [1-1] 메모 항목
   - 수동 메모 / 자동 메모 공통
   - PRISM 리뷰 결과도 자동 메모로 남길 수 있음
========================= */
type MemoItem = {
  id: string;              // 고유 키
  ts: number;              // 기록 시간 (timestamp)
  kind: "manual" | "auto"; // 수동 / 자동
  title: string;           // 한 줄 제목 (무엇이 바뀌었는지)
  before?: string;         // 자동 메모: 변경 전 (선택)
  after?: string;          // 자동 메모: 변경 후 (선택)
  text?: string;           // 수동 메모: 내용 (선택)
};

/* =========================
   [1-2] 기획 상세 데이터 (저장 대상)
   - 사용자가 직접 입력한 "사실 데이터"
   - LocalStorage / DB에 저장됨
========================= */
type ItemDetail = {
  id: string;
  title: string;
  stage: string;
  updatedAt: number;

  status?: "진행중" | "완료";
  doneReason?: string;
  doneMemo?: string;

  /* [사용자 기준] */
  userContext: {
    userType: string;
    usageContext: string;
    expectedOutcome: string;
  };

  /* [A] 문제 요약 */
  identity: {
    whatWhy: string; // 왜 해야 하는지 (가치/맥락)
    asIs: string;    // AS-IS 문제
    toBe: string;    // TO-BE 방향
    oneLine: string; // 문제 한 줄 요약 (사람이 직접 작성)
  };

  /* [B] AI 필요성 */
  aiNeed: {
    aiPresence: string; // "없다(신규 도입)" | "있다(개선/고도화)" | ""
    withoutAI: string; // AI 없이 풀 수 있는 방식
    whyBreaks: string[]; // 기존 방식이 깨지는 이유
    whyAI: string[];     // 그래서 AI를 쓰는 이유 (= AI 역할)
  };

  /* [C] 데이터 정의 */
  dataDef: {
    hasData: string;        // 지금 데이터가 있나?
    keepsComing: string;    // 앞으로도 계속 쌓이나?
    dataTypes: string[];    // 데이터 형태
    dataExample: string;    // 데이터 예시 (샘플)
  };

  /* [D] 진행 상태 체크 (저장용 최소 상태) */
  gate: {
    clearOneLine: boolean;    // 문제 한 줄 명확
    aiNeedExplained: boolean;// AI 필요성 설명됨
    dataChecked: boolean;    // 데이터 확인 완료
  };

  /* [E] 메모 (이 상세 페이지에서만 유지) */
  memos: MemoItem[];
};

/* =========================
   [1-3] PRISM 리뷰 결과 타입 (저장 ❌ / 파생 결과)
   - A/B/C 입력을 종합해 AI가 생성
   - "시니어 기획 리뷰" 역할
   - 필요 시 자동 메모로만 남김
========================= */
type PrismReview = {
  grade: "GO" | "CAUTION" | "STOP";
  // GO: 다음 단계 진행 가능
  // CAUTION: 보완 필요
  // STOP: 지금은 AI로 풀기 부적절

  headline: string;
  // 한 줄 결론 요약
  // 예) "데이터 없는 상태에서 모델 설계를 시도하고 있음"

  summary: string;
  // 전체 맥락 요약 (문제–AI–데이터 연결 상태)

  logicGaps: string[];
  // 논리적으로 끊긴 지점
  // 예) AS-IS 문제와 선택한 AI 역할 불일치

  risks: string[];
  // 실무에서 자주 터지는 위험한 조합
  // 예) 데이터 없음 + 운영형 AI 설계

  todos: string[];
  // 다음 단계에서 바로 할 수 있는 행동 제안
  // 예) 데이터 수집 계획 정리 / 성공 지표 정의
};

/* =========================
   [2] 저장 키/유틸
========================= */

const LS_ITEMS_KEY = "ai-planner-items-v1";
const LS_DETAIL_PREFIX = "ai-planner-detail-v1:";

function loadItems(): any[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LS_ITEMS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveItems(items: any[]) {
  localStorage.setItem(LS_ITEMS_KEY, JSON.stringify(items));
}

function loadDetailRaw(id: string): any | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(LS_DETAIL_PREFIX + id);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveDetail(detail: ItemDetail) {
  localStorage.setItem(LS_DETAIL_PREFIX + detail.id, JSON.stringify(detail));
}

// [2-1] 안전한 ID 생성
function makeId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    // @ts-ignore
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
/* =========================
   [2-STEP2] Step2 플로우 메타 저장 유틸
   - Step1 상세 → Step2로 넘어갈 때
   - "메인 플로우"가 없으면 자동 생성
   - Step2 목록/상세의 기준 데이터
========================= */

const LS_STEP2_FLOWLIST_PREFIX = "ai-planner-step2-flowlist-v1:";

type Step2FlowMeta = {
  id: string;                 // flowId (URL용)
  name: string;               // 플로우 이름
  updatedAt: number;          // 마지막 수정 시간
  status: "진행중" | "완료";  // 상태
};

// Step2 플로우 목록 불러오기
function loadStep2Flows(itemId: string): Step2FlowMeta[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LS_STEP2_FLOWLIST_PREFIX + itemId);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

// Step2 플로우 목록 저장
function saveStep2Flows(itemId: string, flows: Step2FlowMeta[]) {
  localStorage.setItem(
    LS_STEP2_FLOWLIST_PREFIX + itemId,
    JSON.stringify(flows)
  );
}

// Step2 메인 플로우 가져오기
// - 있으면: 기존 첫 번째 플로우 사용
// - 없으면: "메인 플로우" 자동 생성
function getOrCreateMainStep2Flow(itemId: string): Step2FlowMeta {
  const flows = loadStep2Flows(itemId);

  // ✅ 이미 있으면 그걸 사용
  if (flows.length > 0) return flows[0];

  // ✅ 없으면 새로 생성
  const flowId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? // @ts-ignore
        crypto.randomUUID()
      : `flow-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  const created: Step2FlowMeta = {
    id: flowId,
    name: "메인 플로우",
    updatedAt: Date.now(),
    status: "진행중",
  };

  saveStep2Flows(itemId, [created]);
  return created;
}


/* =========================
   [3] 옵션 정의 (라벨 유지)
========================= */

const AI_PRESENCE_OPTIONS: Option[] = [
  { value: "없다(신규 도입)", label: "없다(신규 도입)" },
  { value: "있다(개선/고도화)", label: "있다(개선/고도화)" },
];

const WITHOUT_AI_OPTIONS: Option[] = [
  { value: "수동", label: "수동" },
  { value: "검색", label: "검색" },
  { value: "룰", label: "룰" },
  { value: "가이드", label: "가이드" },
  { value: "포기", label: "포기" },
];

const BREAKS_OPTIONS: Option[] = [
  { value: "스케일", label: "스케일" },
  { value: "다양성", label: "다양성" },
  { value: "비용", label: "비용" },
  { value: "UX", label: "UX" },
  { value: "일관성", label: "일관성" },
];

const WHY_AI_OPTIONS: Option[] = [
  { value: "분류", label: "분류 (Classification)" },
  { value: "요약", label: "요약 (Summarization)" },
  { value: "추천", label: "추천 (Recommendation)" },
  { value: "탐지", label: "탐지 (Detection)" },
  { value: "보조 판단", label: "보조 판단 (Decision Support)" },
];

const YES_NO_OPTIONS: Option[] = [
  { value: "예", label: "예" },
  { value: "아니오", label: "아니오" },
];

const DATA_TYPE_OPTIONS: Option[] = [
  { value: "로그", label: "로그" },
  { value: "문서", label: "문서" },
  { value: "라벨", label: "라벨" },
  { value: "대화", label: "대화" },
  { value: "이미지", label: "이미지" },
  { value: "기타", label: "기타" },
];

// [4] UI 컴포넌트 (기존 유지)

function Section({ title, desc, children }: { title: string; desc?: string; children: ReactNode }) {
  return (
    <div style={{ border: "1px solid #eee", borderRadius: 12, padding: 16, marginTop: 14, background: "#fff" }}>
      <div style={{ fontSize: 16, fontWeight: 900 }}>{title}</div>

      {desc ? (
        <div
          style={{
            fontSize: 13,
            color: "#666",
            marginTop: 6,
            lineHeight: 1.6,
            whiteSpace: "pre-line", 
          }}
        >
          {desc}
        </div>
      ) : null}

      <div style={{ marginTop: 12 }}>{children}</div>
    </div>
  );
}

function Row2Col({ left, right }: { left: ReactNode; right: ReactNode }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "260px 1fr",
        gap: 12,
        padding: "10px 0",
        borderTop: "1px solid #f1f1f1",
      }}
    >
      <div style={{ fontWeight: 900 }}>{left}</div>
      <div>{right}</div>
    </div>
  );
}

function TextArea({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        width: "100%",
        minHeight: 90,
        padding: 10,
        borderRadius: 10,
        border: "1px solid #ddd",
        fontFamily: "system-ui",
        resize: "vertical",
      }}
    />
  );
}

/*
  [4-1] SingleChoice
  - UI는 체크박스처럼 보이지만 "1개만" 선택되게 만든 컴포넌트
*/
function SingleChoice({
  options,
  value,
  onChange,
}: {
  options: Option[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
      {options.map((op) => {
        const checked = value === op.value;
        return (
          <label key={op.value} style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input type="checkbox" checked={checked} onChange={() => onChange(checked ? "" : op.value)} />
            {op.label}
          </label>
        );
      })}
    </div>
  );
}

function MultiChoice({
  options,
  values,
  onChange,
  max,
}: {
  options: Option[];
  values: string[]; // 호출부가 실수해도 아래에서 방어함
  onChange: (next: string[]) => void;
  max?: number;
}) {
  // ✅ 방어: undefined/null이면 빈 배열로 처리
  const safeValues = Array.isArray(values) ? values : [];

  function toggle(v: string) {
    const has = safeValues.includes(v);
    if (has) return onChange(safeValues.filter((x) => x !== v));
    if (max && safeValues.length >= max) return;
    onChange([...safeValues, v]);
  }

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
      {options.map((op) => {
        const checked = safeValues.includes(op.value);
        const disabled = !checked && !!max && safeValues.length >= max;
        return (
          <label
            key={op.value}
            style={{ display: "flex", gap: 6, alignItems: "center", opacity: disabled ? 0.5 : 1 }}
          >
            <input type="checkbox" checked={checked} disabled={disabled} onChange={() => toggle(op.value)} />
            {op.label}
          </label>
        );
      })}
      {max ? <div style={{ fontSize: 12, color: "#666", marginLeft: 6 }}>(최대 {max}개)</div> : null}
    </div>
  );
}

/* =========================
   [4-x] Hover Hint (물음표)
   - 입력칸에 긴 안내문을 넣지 않고
   - ? 아이콘에 마우스 올리면 보여준다
   - ⚠️ 이 함수는 return(...) 밖(컴포넌트 정의 영역)에 있어야 함
========================= */
function Hint({ text }: any) {
  const [open, setOpen] = useState(false);

  return (
    <span
      style={{ position: "relative", display: "inline-flex", alignItems: "center" }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <span
        style={{
          width: 18,
          height: 18,
          borderRadius: 999,
          border: "1px solid #ddd",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 12,
          fontWeight: 900,
          color: "#666",
          cursor: "help",
          userSelect: "none",
        }}
      >
        ?
      </span>

      {open && (
        <span
          style={{
            position: "absolute",
            left: 24,
            top: "50%",
            transform: "translateY(-50%)",
            background: "#111",
            color: "#fff",
            padding: "10px 12px",
            borderRadius: 10,
            fontSize: 12,
            lineHeight: 1.5,
            whiteSpace: "pre-line",
            width: 280,
            zIndex: 9999,
          }}
        >
          {String(text ?? "")}
        </span>
      )}
    </span>
  );
}

/* =========================
   [5] 기본값 + migrate(보정)
========================= */

function makeDefaultDetail(id: string, title: string, stage: string): ItemDetail {
  return {
    id,
    title: title || "(제목 없음)",
    stage,
    updatedAt: Date.now(),
    status: "진행중",

    userContext: { userType: "", usageContext: "", expectedOutcome: "" },

    identity: { whatWhy: "", asIs: "", toBe: "", oneLine: "" },
    aiNeed: { aiPresence: "", withoutAI: "", whyBreaks: [], whyAI: [] },
    dataDef: { hasData: "", keepsComing: "", dataTypes: [], dataExample: "" },
    gate: { clearOneLine: false, aiNeedExplained: false, dataChecked: false },

    memos: [],
  };
}

/*
  [5-1] migrateDetail()
  - 옛 저장 데이터여도 새 구조로 강제 보정
*/
function migrateDetail(raw: any, base: ItemDetail): ItemDetail {
  const d = { ...base, ...(raw ?? {}) } as any;

  d.userContext = {
    userType: raw?.userContext?.userType ?? "",
    usageContext: raw?.userContext?.usageContext ?? "",
    expectedOutcome: raw?.userContext?.expectedOutcome ?? "",
  };

  d.identity = {
    whatWhy: raw?.identity?.whatWhy ?? "",
    asIs: raw?.identity?.asIs ?? "",
    toBe: raw?.identity?.toBe ?? "",
    oneLine: raw?.identity?.oneLine ?? "",
  };

  d.aiNeed = {
    aiPresence: raw?.aiNeed?.aiPresence ?? "",
    withoutAI: raw?.aiNeed?.withoutAI ?? "",
    whyBreaks: Array.isArray(raw?.aiNeed?.whyBreaks) ? raw.aiNeed.whyBreaks : [],
    whyAI: Array.isArray(raw?.aiNeed?.whyAI) ? raw.aiNeed.whyAI : [],
  };

  d.dataDef = {
    hasData: raw?.dataDef?.hasData ?? "",
    keepsComing: raw?.dataDef?.keepsComing ?? "",
    dataTypes: Array.isArray(raw?.dataDef?.dataTypes) ? raw.dataDef.dataTypes : [],
    dataExample: raw?.dataDef?.dataExample ?? "",
  };

  d.gate = {
    clearOneLine: !!raw?.gate?.clearOneLine,
    aiNeedExplained: !!raw?.gate?.aiNeedExplained,
    dataChecked: !!raw?.gate?.dataChecked,
  };

  d.memos = Array.isArray(raw?.memos) ? raw.memos : [];

  d.id = String(d.id ?? base.id);
  d.title = String(d.title ?? base.title);
  d.stage = String(d.stage ?? base.stage);
  d.updatedAt = Number(d.updatedAt ?? base.updatedAt);
  d.status = d.status === "완료" ? "완료" : "진행중";

  return d as ItemDetail;
}

/* =========================
   [6] 자동 메모: 저장 시 변경 감지
========================= */

// [6-1] 변경 감지 대상(사람이 읽기 쉬운 라벨로 기록)
function buildDiff(prev: ItemDetail, next: ItemDetail) {
  const diffs: Array<{ title: string; before: string; after: string }> = [];

  function add(title: string, before: any, after: any) {
    const b = typeof before === "string" ? before : JSON.stringify(before);
    const a = typeof after === "string" ? after : JSON.stringify(after);
    if (b === a) return;
    diffs.push({ title, before: b, after: a });
  }

  add("제목", prev.title, next.title);
  add("[사용자 기준] 사용자 유형", prev.userContext.userType, next.userContext.userType);
  add("[사용자 기준] 사용 맥락", prev.userContext.usageContext, next.userContext.usageContext);
  add("[사용자 기준] 기대 결과", prev.userContext.expectedOutcome, next.userContext.expectedOutcome);

  add("[A] 무엇을 왜 해야 하는지", prev.identity.whatWhy, next.identity.whatWhy);
  add("[A] AS-IS 문제", prev.identity.asIs, next.identity.asIs);
  add("[A] TO-BE 방향", prev.identity.toBe, next.identity.toBe);
  add("[A] 문제 한 줄", prev.identity.oneLine, next.identity.oneLine);

  add("[B] AI 존재 여부", prev.aiNeed.aiPresence, next.aiNeed.aiPresence);
  add("[B] AI 없이 풀면", prev.aiNeed.withoutAI, next.aiNeed.withoutAI);
  add("[B] 그 방식이 깨지는 이유", prev.aiNeed.whyBreaks.join(", "), next.aiNeed.whyBreaks.join(", "));
  add("[B] 그래서 AI를 쓰는 이유", prev.aiNeed.whyAI.join(", "), next.aiNeed.whyAI.join(", "));

  add("[C] 지금 데이터가 있나", prev.dataDef.hasData, next.dataDef.hasData);
  add("[C] 앞으로도 계속 쌓이나", prev.dataDef.keepsComing, next.dataDef.keepsComing);
  add("[C] 데이터 형태", prev.dataDef.dataTypes.join(", "), next.dataDef.dataTypes.join(", "));
  add("[C] 데이터 예시(샘플)", prev.dataDef.dataExample, next.dataDef.dataExample);

  add("[D] 체크: 문제 한 줄 명확", String(prev.gate.clearOneLine), String(next.gate.clearOneLine));
  add("[D] 체크: AI 필요성 설명", String(prev.gate.aiNeedExplained), String(next.gate.aiNeedExplained));
  add("[D] 체크: 데이터 확인", String(prev.gate.dataChecked), String(next.gate.dataChecked));

  return diffs;
}

/* =========================
   [7] 메인 컴포넌트
========================= */

export default function ItemDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = String((params as any)?.id ?? "");

  const [detail, setDetail] = useState<ItemDetail | null>(null);

  // ✅ 마지막 저장 완료 여부 (AI 리뷰 활성 조건)
  const [savedOnce, setSavedOnce] = useState(false);

  // ✅ (임시) PRISM 리뷰 결과 상태 (나중에 API 붙이면 됨)
  const [review, setReview] = useState<PrismReview | null>(null);

  // 완료 처리 모달 상태
  const [showClose, setShowClose] = useState(false);
  const [closeReason, setCloseReason] = useState("AI 효용성 부족");
  const [closeMemo, setCloseMemo] = useState("");

  // 우측 메모 입력(수동)
  const [memoDraft, setMemoDraft] = useState("");
  const [rightTab, setRightTab] = useState<"review" | "summary" | "risk" | "memo">("review");

  useEffect(() => {
    // ✅ id가 준비되기 전(빈 문자열)이면 아무것도 하지 않음
    if (!id) return;

    const items = loadItems();
    const item = items.find((i: any) => String(i.id) === id);

    // ✅ 여기서 바로 push 하지 말고, 화면이 뜨도록 기본값을 넣어둔다 (디버깅 가능)
    if (!item) {
      setDetail(makeDefaultDetail(id, "(제목 없음)", "1"));
      return;
    }

    const base = makeDefaultDetail(id, item.title, item.stage);
    const raw = loadDetailRaw(id);
    const next = raw ? migrateDetail(raw, base) : base;

    setDetail(next);
    if (raw) saveDetail(next);

    // ✅ 이미 저장된 상세가 있다면 "저장된 적 있음"으로 간주
    // (초기 로드에서 리뷰 버튼이 바로 비활성화 되는 것 방지)
    setSavedOnce(!!raw);
  }, [id]);

  const recommended = useMemo(() => {
    if (!detail) return [];
    return getRecommendedDropReasons(detail.stage);
  }, [detail]);

  const memosSorted = useMemo(() => {
    if (!detail) return [];
    return [...(detail.memos ?? [])].sort((a, b) => b.ts - a.ts);
  }, [detail]);

  // ✅ null return 대신 “지금 뭐가 들어왔는지” 화면에 띄워서 잡자
  if (!detail) {
    return (
      <div style={{ padding: 24, fontFamily: "system-ui" }}>
        <div style={{ fontWeight: 900, marginBottom: 8 }}>loading...</div>
        <div>id: {id || "(empty)"}</div>
      </div>
    );
  }

  /* -------------------------
     [7-0] 리뷰 활성 조건
     - A/B 최소 조건 + 저장 버튼 눌렀는지
  ------------------------- */
  function canRunReview(d: ItemDetail, saved: boolean) {
    if (!saved) return false;

    const aOk = (d.identity.oneLine ?? "").trim().length > 0;

    // B는 "AI 없이 풀 수 있는가" + "그래서 AI를 쓰는 이유(역할)" 최소 조건
    const bOk =
      (d.aiNeed.withoutAI ?? "").trim().length > 0 &&
      Array.isArray(d.aiNeed.whyAI) &&
      d.aiNeed.whyAI.length > 0;

    return aOk && bOk;
  }

  /* -------------------------
     [7-0-1] PRISM 리뷰 실행(임시 mock)
     - 나중에 API 호출로 교체
  ------------------------- */
  function handleRunReview() {
    const mock: PrismReview = {
      grade: "CAUTION",
      headline: "기획 초반 리스크가 몇 개 보여요.",
      summary:
        "문제–AI–데이터 연결은 대체로 잡혔지만, 데이터/운영 가정이 아직 비어 있어요.",
      logicGaps: [
        "AS-IS 문제 설명은 있는데, 선택한 AI 역할(whyAI)과 연결되는 기준 문장이 부족해요.",
      ],
      risks: [
        "데이터가 없거나 샘플이 빈 상태에서 운영형 AI를 상정하면, 그럴듯하지만 책임지기 어려운 결과로 갈 가능성이 커요.",
      ],
      todos: [
        "현재 사용 중인 룰/가이드 예시 5~10개를 정리해요.",
        "성공 기준(Measure)을 한 문장으로 정의해요. (무엇이 바뀌면 성공인가?)",
      ],
    };

    setReview(mock);
  }

  /* -------------------------
     [7-1] 저장
     - 저장 시 "이전 저장본"과 비교해서 변경이 있으면 자동 메모 추가
  ------------------------- */
  function handleSave() {
    if (!detail) return;

    const prevRaw = loadDetailRaw(id);
    const prev = prevRaw ? migrateDetail(prevRaw, makeDefaultDetail(id, detail.title, detail.stage)) : detail;

    const next: ItemDetail = { ...detail, updatedAt: Date.now() };

    // (1) 변경 감지 → 자동 메모 생성
    const diffs = buildDiff(prev, next);
    const autoMemos: MemoItem[] = diffs.map((d) => ({
      id: makeId(),
      ts: Date.now(),
      kind: "auto",
      title: d.title,
      before: d.before,
      after: d.after,
    }));

    // (2) 메모 합치기(변경이 있을 때만 추가)
    const merged: ItemDetail =
      autoMemos.length > 0
        ? { ...next, memos: [...(next.memos ?? []), ...autoMemos] }
        : next;

    setDetail(merged);
    saveDetail(merged);

    // 홈 리스트도 업데이트(제목/updatedAt/status/doneReason)
    const items = loadItems().map((i: any) => {
      if (String(i.id) !== id) return i;
      return {
        ...i,
        title: merged.title,
        stage: merged.stage,
        updatedAt: merged.updatedAt,
        status: merged.status ?? "진행중",
        doneReason: merged.doneReason,
      };
    });
    saveItems(items);

    // ✅ 저장 눌렀음을 기록 → 리뷰 활성 조건
    setSavedOnce(true);

    // ✅ 저장하면 이전 리뷰는 초기화(선택)
    setReview(null);

    alert("저장됨");
  }

  /* -------------------------
     [7-2] 완료 처리
  ------------------------- */
  function handleCloseConfirm() {
    if (!detail) return;

    const next: ItemDetail = {
      ...detail,
      status: "완료",
      doneReason: closeReason,
      doneMemo: closeMemo,
      updatedAt: Date.now(),
    };

    setDetail(next);
    saveDetail(next);

    const items = loadItems().map((i: any) => {
      if (String(i.id) !== id) return i;
      return { ...i, status: "완료", doneReason: closeReason, updatedAt: next.updatedAt };
    });
    saveItems(items);

    setShowClose(false);
  }

  /* -------------------------
     [7-3] 삭제
  ------------------------- */
  function handleRemove() {
    if (!confirm("완전히 삭제할까?")) return;
    localStorage.removeItem(LS_DETAIL_PREFIX + id);
    const nextItems = loadItems().filter((i: any) => String(i.id) !== id);
    saveItems(nextItems);
    router.push("/");
  }

  /* -------------------------
     [7-4] 수동 메모 추가
  ------------------------- */
  function addManualMemo() {
    if (!detail) return;

    const t = memoDraft.trim();
    if (!t) return;

    const entry: MemoItem = {
      id: makeId(),
      ts: Date.now(),
      kind: "manual",
      title: "수동 메모",
      text: t,
    };

    const next: ItemDetail = { ...detail, memos: [...(detail.memos ?? []), entry], updatedAt: Date.now() };
    setDetail(next);
    saveDetail(next);

    setMemoDraft("");
  }

  /* =========================
     [8] UI (좌: 본문 / 우: 메모)
  ========================= */

  return (
    <main style={{ padding: 24, maxWidth: 1200, margin: "0 auto", fontFamily: "system-ui" }}>
      {/* [8-0] 상단: 뒤로가기 */}
      <div style={{ marginBottom: 10 }}>
        <Link href="/">← 목록</Link>
      </div>

      {/* [8-1] 상단: 제목/버튼 */}
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 260 }}>
          <input
            value={detail.title}
            onChange={(e) => setDetail({ ...detail, title: e.target.value })}
            placeholder="제목을 입력해줘"
            style={{
              width: "100%",
              padding: 10,
              borderRadius: 10,
              border: "1px solid #ddd",
              fontSize: 18,
              fontWeight: 900,
            }}
          />
          <div style={{ fontSize: 13, color: "#666", marginTop: 8 }}>
            단계: {detail.stage} / 상태: {detail.status ?? "진행중"} / 마지막 저장:{" "}
            {new Date(detail.updatedAt).toLocaleString()}
          </div>
        </div>

        {/* ✅ 상단 버튼: [저장] [AI 리뷰] [다음 단계] [여기서 멈추기] */}
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {/* [저장] */}
          <button onClick={handleSave} style={{ padding: "8px 12px", fontWeight: 900 }}>
            저장
          </button>

          {/* [AI 리뷰] - A/B 완료 + 저장 후 활성 */}
          {(() => {
            const enabled = canRunReview(detail, savedOnce);
            return (
              <button
                onClick={enabled ? handleRunReview : undefined}
                disabled={!enabled}
                style={{
                  padding: "8px 12px",
                  fontWeight: 900,
                  borderRadius: 10,
                  border: "1px solid #ddd",
                  background: enabled ? "#fff" : "#f7f7f7",
                  cursor: enabled ? "pointer" : "not-allowed",
                  opacity: enabled ? 1 : 0.6,
                }}
              >
                AI 리뷰
              </button>
            );
          })()}

        {/* [다음 단계] */}
<button
  onClick={() => {
    const now = Date.now();

    // 1) 홈 목록(stage/updatedAt) 먼저 Step2로 올려서 "진행 단계"가 바뀌게
    const items = loadItems().map((it: any) => {
      if (String(it.id) !== String(id)) return it;
      return {
        ...it,
        stage: "2. 가용 데이터(전처리)",
        updatedAt: now,
        status: it.status ?? "진행중",
      };
    });
    saveItems(items);

    // 2) Step2 메인 플로우 없으면 만들고, Step2 상세로 이동
    const flow = getOrCreateMainStep2Flow(id);
    router.push(`/project/${id}/screening`);
  }}
  style={{ padding: "8px 12px", fontWeight: 900 }}
>
  다음 단계
</button>

          {/* [여기서 멈추기] = 기존 완료 처리 모달 */}
          <button onClick={() => setShowClose(true)} style={{ padding: "8px 12px", fontWeight: 900 }}>
            여기서 멈추기
          </button>
        </div>
      </div>

      {/* [8-2] 완료 처리 패널 */}
      {showClose && (
        <div style={{ marginTop: 12, border: "1px solid #eee", borderRadius: 12, padding: 12, background: "#fff" }}>
          <div style={{ fontWeight: 900 }}>완료 처리</div>
          <div style={{ fontSize: 13, color: "#666", marginTop: 6 }}>
            추천 사유: {recommended.length ? recommended.join(", ") : "—"}
          </div>

          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 900, marginBottom: 6 }}>완료 사유</div>
            <select value={closeReason} onChange={(e) => setCloseReason(e.target.value)} style={{ padding: 8 }}>
              {DROP_REASONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>

          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 900, marginBottom: 6 }}>메모(선택)</div>
            <input
              value={closeMemo}
              onChange={(e) => setCloseMemo(e.target.value)}
              placeholder="완료(탈락) 사유를 짧게 적어"
              style={{ width: "100%", padding: 8, borderRadius: 10, border: "1px solid #ddd" }}
            />
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button onClick={handleCloseConfirm} style={{ padding: "8px 12px", fontWeight: 900 }}>
              확인
            </button>
            <button onClick={() => setShowClose(false)} style={{ padding: "8px 12px" }}>
              취소
            </button>
          </div>
        </div>
      )}

{/* =========================================================
  [Step1 영역]
  - 기존 좌측 본문(A/B/C/D) + 우측 메모 패널을 감싸는 grid
  - 좌측 본문은 Step1Body 컴포넌트로 분리됨
========================================================= */}

<div
  style={{
    display: "grid",
    gridTemplateColumns: "1fr 320px",
    gap: 14,
    alignItems: "start",
    marginTop: 14,
  }}
>
  {/* =========================
      [좌측] Step1 본문 (A/B/C/D)
  ========================= */}
  <Step1Body
    detail={detail}                 // Step1에서 작성 중인 전체 데이터 상태
    setDetail={setDetail}           // 입력 변경 시 상태 업데이트 함수
    savedOnce={savedOnce}           // 최초 저장 여부 (리뷰 버튼 활성화 조건)
    review={review}                 // PRISM 리뷰 결과
    canRunReview={canRunReview}     // 리뷰 실행 가능 여부 판단 함수
    handleRunReview={handleRunReview} // 리뷰 실행 핸들러
    readOnly={false}                // Step1에서는 수정 가능
    showReviewSection={false}       // Step1 D 리뷰는 우측 AI 리뷰 탭에서 노출
  />

  {/* =========================
      [우측] 메모 패널
      ⚠️ 기존 코드 그대로 (변경 없음)
  ========================= */}
  <div
    style={{
      position: "sticky",
      top: 18,
      border: "1px solid #eee",
      borderRadius: 12,
      padding: 12,
      background: "#fff",
    }}
  >
    <div
      style={{
        display: "flex",
        gap: 6,
        marginBottom: 10,
        borderBottom: "1px solid #e5e7eb",
      }}
    >
      {[
        { id: "summary", label: "프리뷰", disabled: true },
        { id: "review", label: "AI 리뷰", disabled: false },
        { id: "risk", label: "리스크", disabled: true },
      ].map((tab) => {
        const active = rightTab === (tab.id as typeof rightTab);
        return (
          <button
            key={tab.id}
            title={tab.disabled ? "준비 중" : undefined}
            onClick={tab.disabled ? undefined : () => setRightTab(tab.id as typeof rightTab)}
            disabled={tab.disabled}
            style={{
              padding: "9px 12px",
              border: active ? "1px solid #dbeafe" : "1px solid #e5e7eb",
              borderBottom: active ? "1px solid #fff" : "1px solid #e5e7eb",
              borderRadius: "10px 10px 0 0",
              background: active ? "#fff" : "#f8fafc",
              color: tab.disabled ? "#9ca3af" : active ? "#1d4ed8" : "#6b7280",
              fontWeight: active ? 800 : 600,
              fontSize: 12,
              cursor: tab.disabled ? "not-allowed" : "pointer",
              marginBottom: -1,
              lineHeight: 1.2,
              opacity: tab.disabled ? 0.8 : 1,
            }}
          >
            {tab.label}
          </button>
        );
      })}
    </div>

    {rightTab === "review" && (
      <div style={{ display: "grid", gap: 10 }}>
        <div style={{ fontSize: 13, color: "#666", lineHeight: 1.6 }}>
          문제 정의 단계에서 문제–AI–데이터 간 논리 연결을 검토해요.
          <br />
          기획 초반에 놓치기 쉬운 위험 신호를 참고하기 위한 목적이에요.
        </div>

        {(() => {
          const enabled = canRunReview(detail, savedOnce);
          return (
            <button
              onClick={enabled ? handleRunReview : undefined}
              disabled={!enabled}
              style={{
                width: "fit-content",
                padding: "10px 14px",
                fontWeight: 900,
                borderRadius: 10,
                border: "1px solid #ddd",
                background: enabled ? "#fff" : "#f7f7f7",
                cursor: enabled ? "pointer" : "not-allowed",
                opacity: enabled ? 1 : 0.6,
              }}
            >
              PRISM 리뷰 실행
            </button>
          );
        })()}

        <div style={{ fontSize: 13, color: "#666", lineHeight: 1.6 }}>
          리뷰가 실행되면 아래에 결과가 정리돼요.
          <br />- <b>한 줄 결론</b>
          <br />- <b>논리적으로 어긋난 지점</b>
          <br />- <b>실무에서 위험해질 수 있는 조합</b>
          <br />- <b>다음에 하면 좋은 행동(To-do)</b>
        </div>

        {review && (
          <div style={{ display: "grid", gap: 10 }}>
            <div
              style={{
                border: "1px solid #eee",
                borderRadius: 12,
                padding: 12,
                background: "#fff",
              }}
            >
              <div style={{ fontWeight: 900, marginBottom: 6 }}>
                {review.grade} · {review.headline}
              </div>
              <div
                style={{
                  fontSize: 13,
                  color: "#444",
                  lineHeight: 1.6,
                  whiteSpace: "pre-line",
                }}
              >
                {review.summary}
              </div>
            </div>

            <div
              style={{
                border: "1px solid #eee",
                borderRadius: 12,
                padding: 12,
                background: "#fff",
              }}
            >
              <div style={{ fontWeight: 900, marginBottom: 6 }}>논리 끊긴 지점</div>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: "#444", lineHeight: 1.6 }}>
                {review.logicGaps.map((x, i) => (
                  <li key={i}>{x}</li>
                ))}
              </ul>
            </div>

            <div
              style={{
                border: "1px solid #eee",
                borderRadius: 12,
                padding: 12,
                background: "#fff",
              }}
            >
              <div style={{ fontWeight: 900, marginBottom: 6 }}>위험한 조합</div>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: "#444", lineHeight: 1.6 }}>
                {review.risks.map((x, i) => (
                  <li key={i}>{x}</li>
                ))}
              </ul>
            </div>

            <div
              style={{
                border: "1px solid #eee",
                borderRadius: 12,
                padding: 12,
                background: "#fff",
              }}
            >
              <div style={{ fontWeight: 900, marginBottom: 6 }}>다음에 하면 좋은 행동</div>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: "#444", lineHeight: 1.6 }}>
                {review.todos.map((x, i) => (
                  <li key={i}>{x}</li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>
    )}

    {rightTab === "memo" ? (
      <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid #f3f4f6" }}>
        <div style={{ fontSize: 14, fontWeight: 900, marginBottom: 10 }}>메모</div>

        {/* [우측-1] 수동 메모 입력(상단) */}
        <div style={{ marginBottom: 12 }}>
          <textarea
            value={memoDraft}
            onChange={(e) => setMemoDraft(e.target.value)}
            placeholder="메모를 남겨요. (저장과 별개로 기록돼요)"
            style={{
              width: "100%",
              minHeight: 120,
              padding: 10,
              borderRadius: 10,
              border: "1px solid #ddd",
              fontFamily: "system-ui",
              resize: "vertical",
            }}
          />
          <button
            onClick={addManualMemo}
            style={{
              width: "100%",
              marginTop: 8,
              padding: "10px 12px",
              fontWeight: 900,
              cursor: "pointer",
            }}
          >
            메모 남기기
          </button>
        </div>

        {/* [우측-2] 타임라인 */}
        <div style={{ fontSize: 13, fontWeight: 900, marginBottom: 8 }}>타임라인</div>

        {memosSorted.length === 0 ? (
          <div style={{ fontSize: 13, color: "#666", lineHeight: 1.5 }}>
            아직 메모가 없어요.
            <br />
            저장하면 변경 내역이 자동으로 기록돼요.
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gap: 10,
              maxHeight: 520,
              overflow: "auto",
              paddingRight: 4,
            }}
          >
            {memosSorted.map((m) => (
              <div
                key={m.id}
                style={{
                  border: "1px solid #f1f1f1",
                  borderRadius: 10,
                  padding: 10,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 8,
                  }}
                >
                  <div style={{ fontWeight: 900, fontSize: 13 }}>
                    {m.kind === "auto" ? "자동" : "수동"} · {m.title}
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color: "#666",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {new Date(m.ts).toLocaleString()}
                  </div>
                </div>

                {m.kind === "manual" && m.text ? (
                  <div
                    style={{
                      marginTop: 8,
                      fontSize: 13,
                      lineHeight: 1.5,
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {m.text}
                  </div>
                ) : null}

                {m.kind === "auto" ? (
                  <div
                    style={{
                      marginTop: 8,
                      fontSize: 12,
                      color: "#444",
                      lineHeight: 1.5,
                    }}
                  >
                    <div style={{ color: "#666" }}>변경 전</div>
                    <div style={{ whiteSpace: "pre-wrap" }}>{m.before || "—"}</div>
                    <div style={{ color: "#666", marginTop: 6 }}>변경 후</div>
                    <div style={{ whiteSpace: "pre-wrap" }}>{m.after || "—"}</div>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>
    ) : null}
  </div>
</div>
<button
  onClick={() => setRightTab((prev) => (prev === "memo" ? "review" : "memo"))}
  aria-label="메모 열기"
  title="메모"
  style={{
    position: "fixed",
    right: 16,
    bottom: 16,
    width: 42,
    height: 42,
    borderRadius: 999,
    border: rightTab === "memo" ? "1px solid #bfdbfe" : "1px solid #9ca3af",
    background: rightTab === "memo" ? "#eff6ff" : "#3f3f46",
    color: rightTab === "memo" ? "#1d4ed8" : "#e5e7eb",
    fontSize: 18,
    boxShadow: "0 2px 8px rgba(0,0,0,0.18)",
    cursor: "pointer",
    zIndex: 1100,
  }}
>
  📝
</button>
</main>
);
}
