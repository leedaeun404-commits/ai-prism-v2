// "탈락 사유" 표준 목록 (드롭다운/라디오에서 그대로 쓰기 좋음)
export const DROP_REASONS = [
  "AI 효용성 부족",
  "데이터 부족",
  "비용 대비 효과 미흡",
  "정확도·신뢰 리스크",
  "UX 개선 효과 없음",
  "운영 불가능",
  "우선순위 변경",
  "기타",
] as const;

// DROP_REASONS 배열 안의 값 중 하나만 허용하는 타입
// 예: DropReason = "AI 효용성 부족" | "데이터 부족" | ...
export type DropReason = typeof DROP_REASONS[number];

// 현재 단계(stage)에 따라 "자주 나오는 탈락 사유"를 추천해주는 함수
// (강제 X, 그냥 기본값/추천칩으로 쓰려고)
export function getRecommendedDropReasons(stage: string): DropReason[] {
  if (stage.startsWith("1.")) return ["AI 효용성 부족", "UX 개선 효과 없음"];
  if (stage.startsWith("2.")) return ["데이터 부족"];
  if (stage.startsWith("3.")) return ["비용 대비 효과 미흡", "정확도·신뢰 리스크"];
  if (stage.startsWith("4.")) return ["비용 대비 효과 미흡", "데이터 부족"];
  if (stage.startsWith("5.")) return ["정확도·신뢰 리스크"];
  if (stage.startsWith("6.")) return ["운영 불가능"];
  if (stage.startsWith("7.")) return ["우선순위 변경"];
  return ["기타"];
}