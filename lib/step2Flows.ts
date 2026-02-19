const LS_STEP2_PREFIX = "ai-planner-step2-v1:";

// 안전한 id
function makeId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    // @ts-ignore
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export type Step2Flow = {
  id: string;
  name: string;
  updatedAt: number;
  status: "진행중" | "완료";
  summary?: string;
};

export function getOrCreateMainStep2Flow(itemId: string): Step2Flow {
  if (typeof window === "undefined") {
    // SSR 방어 (실제로는 client에서만 호출)
    return { id: "ssr", name: "메인 플로우", updatedAt: Date.now(), status: "진행중" };
  }

  const key = LS_STEP2_PREFIX + itemId;
  let flows: Step2Flow[] = [];

  try {
    const raw = localStorage.getItem(key);
    flows = raw ? JSON.parse(raw) : [];
  } catch {
    flows = [];
  }

  // 이미 있으면 첫 번째를 메인으로 사용
  if (flows.length > 0) return flows[0];

  // 없으면 생성
  const next: Step2Flow = {
    id: makeId(),
    name: "메인 플로우",
    updatedAt: Date.now(),
    status: "진행중",
  };

  localStorage.setItem(key, JSON.stringify([next]));
  return next;
}