"use client";

import React from "react";

export default function Step1Body(props: {
  detail: any;
  setDetail: (next: any) => void;

  savedOnce: boolean;
  review: any;
  canRunReview: (d: any, saved: boolean) => boolean;
  handleRunReview: () => void;

  // Step2에서 읽기 전용이면 true
  readOnly?: boolean;
  showReviewSection?: boolean;
}) {
  const {
    detail,
    setDetail,
    savedOnce,
    review,
    canRunReview,
    handleRunReview,
    readOnly,
    showReviewSection = true,
  } = props;

  return (
    <fieldset
      disabled={!!readOnly}
      style={{
        border: 0,
        padding: 0,
        margin: 0,
        opacity: readOnly ? 0.85 : 1,
      }}
    >
      {/* =========================================================
          ✅ 여기부터 "Step1 page.tsx의 좌측 본문(A~D)"를
          ✅ 1글자도 바꾸지 말고 그대로 잘라서 붙여넣어
          ========================================================= */}

      {/* =========================
    [8-3-L] 좌측 입력 본문 (A/B/C/D)
    - Section의 desc(섹션 상단 설명)는 그대로 유지
    - 입력칸 placeholder에 있던 "긴 안내문"은 제거
    - 긴 안내문은 ?(호버)로 이동
========================= */}
      <div>
        <Section
          title="[사용자 기준]"
          desc={
            "이 플로우의 기준 사용자와 맥락을 먼저 고정해요.\n" +
            "기준이 있어야 호출/저장/결과 처리 판단이 흔들리지 않아요."
          }
        >
          <Row2Col
            left={
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span>사용자 유형</span>
                <Hint
                  text={
                    "이 플로우의 기준 사용자를 정해요.\n" +
                    "없으면 화면/권한 설계가 흔들려요."
                  }
                />
              </div>
            }
            right={
              <input
                value={detail?.userContext?.userType ?? ""}
                onChange={(e) =>
                  setDetail({
                    ...detail,
                    userContext: {
                      ...(detail?.userContext ?? {}),
                      userType: e.target.value,
                    },
                  })
                }
                placeholder="누가 (ex. 내부 AI 서비스 기획자)"
                style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ddd" }}
              />
            }
          />

          <Row2Col
            left={
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span>사용 맥락</span>
                <Hint
                  text={
                    "실제 사용하는 상황을 적어요.\n" +
                    "없으면 호출·저장 타이밍이 애매해져요."
                  }
                />
              </div>
            }
            right={
              <input
                value={detail?.userContext?.usageContext ?? ""}
                onChange={(e) =>
                  setDetail({
                    ...detail,
                    userContext: {
                      ...(detail?.userContext ?? {}),
                      usageContext: e.target.value,
                    },
                  })
                }
                placeholder="언제/어떤 상황에서 (ex. 신규 기능 기획 초안 작성 시)"
                style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ddd" }}
              />
            }
          />

          <Row2Col
            left={
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span>기대 결과</span>
                <Hint
                  text={
                    "끝났을 때 무엇이 남는지 정의해요.\n" +
                    "없으면 저장·갱신 기준이 모호해져요."
                  }
                />
              </div>
            }
            right={
              <input
                value={detail?.userContext?.expectedOutcome ?? ""}
                onChange={(e) =>
                  setDetail({
                    ...detail,
                    userContext: {
                      ...(detail?.userContext ?? {}),
                      expectedOutcome: e.target.value,
                    },
                  })
                }
                placeholder="이 플로우가 끝났을 때 시스템에 남는 상태 (ex. 리뷰 결과가 저장된 상태)"
                style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ddd" }}
              />
            }
          />
        </Section>

        {/* =========================
    [A] 문제 요약 (정석 버전)
    - 순서: AS-IS → TO-BE → 왜 해야 하나(가치/임팩트) → 문제 요약(한 줄)
    - 섹션 상단 설명(desc)은 그대로 유지
    - 입력창 placeholder는 "작성 방향 + 템플릿 + 예시"
    - ✅ 호버(Hint) 텍스트는 '원문' 그대로 유지
========================= */}
        <Section
          title="[A] 문제 정의"
          desc={
            "문제와 목표를 한 화면에서 합의 가능한 문장으로 정리해요.\n" +
            "이 문장이 이후 데이터/모델/평가의 기준이 돼요.\n" +
            "기준이 없으면 각자 해석이 달라서 설명·합의·조율이 늘어요."
          }
        >
          {/* 1) AS-IS 문제 */}
          <Row2Col
            left={
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span>AS-IS 문제</span>
                {/* ✅ 호버 텍스트: 원문 유지 */}
                <Hint
                  text={
                    "현재 어떤 문제가 발생하고 있는지 정리해요.\n" +
                    "현재 상태를 알아야 개선 여부를 판단할 수 있어요.\n" +
                    "정리하지 않으면 문제인지 아닌지부터 다시 논의하게 돼요."
                  }
                />
              </div>
            }
            right={
              <TextArea
                value={detail.identity.asIs}
                onChange={(v) =>
                  setDetail({
                    ...detail,
                    identity: { ...detail.identity, asIs: v },
                  })
                }
                placeholder={
                  "작성 방향: 지금 어떤 문제가, 어디서, 얼마나 자주 발생하고 있고 어떤 비용이 드는지\n" +
                  "템플릿: [어디서/단계]에서 [무엇이] [얼마나 자주] 발생 → [비용/리스크]\n\n" +
                  "예)\n" +
                  "- 현재 ○○ 단계에서 수동 처리로 업무가 지연됨\n" +
                  "- 하루 평균 △△건 중 □□%가 누락/오류 발생\n" +
                  "- 담당자가 매번 확인해야 해서 처리 시간이 오래 걸림\n" +
                  "- 그 결과 CS 증가 / 운영 비용 상승 / 유저 경험 저하 발생"
                }
              />
            }
          />

          {/* 2) TO-BE 방향 */}
          <Row2Col
            left={
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span>TO-BE 방향</span>
                {/* ✅ 호버 텍스트: 원문 유지 */}
                <Hint
                  text={
                    "문제가 해결된 상태를 정리해요.\n" +
                    "목표 상태가 있어야 개선 여부를 비교할 수 있어요.\n" +
                    "정의하지 않으면 바뀐 게 맞는지 기준이 없어요."
                  }
                />
              </div>
            }
            right={
              <TextArea
                value={detail.identity.toBe}
                onChange={(v) =>
                  setDetail({
                    ...detail,
                    identity: { ...detail.identity, toBe: v },
                  })
                }
                placeholder={
                  "작성 방향: 문제가 해결되었을 때 사용자가/운영이 어떤 상태가 되길 원하는지 (결과 중심)\n" +
                  "템플릿: [대상]이 [상황]에서 [목표 상태]가 되도록 한다\n\n" +
                  "예)\n" +
                  "- 반복적인 수동 확인 없이 자동으로 처리되는 상태\n" +
                  "- 오류·누락이 사전에 탐지되어 안정적으로 운영되는 상태\n" +
                  "- 사용자는 기다리지 않고 즉시 결과를 확인할 수 있음\n" +
                  "- 운영자는 예외 상황에만 개입하면 되는 구조"
                }
              />
            }
          />

          {/* 3) 왜 해야 하나(가치/임팩트) */}
          <Row2Col
            left={
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span>왜 해야 하나(가치/임팩트)</span>
                {/* ✅ 호버 텍스트: "무엇을 왜 해야 하는지" 원문 유지 */}
                <Hint
                  text={
                    "문제를 어떤 기준으로 풀 것인지 정리해요.\n" +
                    "기준이 있어야 같은 문제를 같은 방식으로 이해할 수 있어요.\n" +
                    "기준이 없으면 설명과 합의에 시간이 계속 들어요."
                  }
                />
              </div>
            }
            right={
              <TextArea
                value={detail.identity.whatWhy}
                onChange={(v) =>
                  setDetail({
                    ...detail,
                    identity: { ...detail.identity, whatWhy: v },
                  })
                }
                placeholder={
                  "작성 방향: '왜 지금 해야 하는지'를 비즈니스/운영/사용자 관점으로\n" +
                  "템플릿: (1) 비용 절감 (2) 리스크 감소 (3) 경험 개선 (4) 규제/신뢰 대응\n\n" +
                  "예)\n" +
                  "- 수동 처리로 발생하는 운영 비용과 인력 소모를 줄이기 위해\n" +
                  "- 오류·누락으로 인한 금전적 손실과 CS 리스크를 낮추기 위해\n" +
                  "- 서비스 신뢰도와 사용자 만족도를 유지·개선하기 위해\n" +
                  "- 규제/감사 대응 리스크를 사전에 관리하기 위해"
                }
              />
            }
          />

          {/* 4) 문제 요약(한 줄) */}
          <Row2Col
            left={
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span>문제 요약(한 줄)</span>
                {/* ✅ 호버 텍스트: 원문 유지 */}
                <Hint
                  text={
                    "문제를 한 문장으로 정리해요.\n" +
                    "한 줄로 정리되면 판단 기준을 빠르게 공유할 수 있어요.\n" +
                    "정리되지 않으면 설명할 때마다 말이 달라져요."
                  }
                />
              </div>
            }
            right={
              <TextArea
                value={detail.identity.oneLine}
                onChange={(v) =>
                  setDetail({
                    ...detail,
                    identity: { ...detail.identity, oneLine: v },
                  })
                }
                placeholder={
                  "작성 방향: 위 내용을 한 문장으로 압축 (이후 모든 판단 기준)\n" +
                  "템플릿: [대상]이 [상황]에서 [문제]를 겪고 있어, [목표 상태]로 개선한다\n\n" +
                  "예)\n" +
                  "- 결제 로그를 기반으로 이상거래를 자동 분류해 처리 시간을 줄이고 누락·오탐 리스크를 최소화한다."
                }
              />
            }
          />
        </Section>

        {/* =========================
   [B] AI 타당성 (AI 필요성 검토)
   - PRISM 기준: R(Risk) / S(Solution)
   - 1) 현재 AI 사용 여부 (현황)
   - 2) AI 없이 풀 수 있는가? (대안 검토) ✅ 중요
   - 3) 기존 방식이 깨지는 이유 (AI 필요 근본 원인)
   - 4) 그래서 AI를 쓰는 이유(=AI 최소 역할) ✅ 스펙 폭주 방지
========================= */}
        <Section
          title="[B] AI 타당성"
          desc={
            "이 문제가 정말 AI로 풀어야 하는지 검토해요.\n" +
            "AI 없이 가능한지, AI가 맡을 최소 역할은 무엇인지 점검해요.\n" +
            "기술·데이터·운영 측면의 리스크를 초기에 확인해요.\n\n" +
            "※ 이 단계는 PRISM 중 R(Risk) / S(Solution) 검토에 해당해요."
          }
        >
          {/* -------------------------
     [B-1] 현재 서비스에 AI가 있는가? (현황)
     - ✅ 호버(Hint) 없음 (요청사항)
  ------------------------- */}
          <Row2Col
            left="현재 서비스에 AI가 있는가?"
            right={
              <SingleChoice
                options={AI_PRESENCE_OPTIONS as any}
                value={detail.aiNeed?.aiPresence ?? ""}
                onChange={(v) =>
                  setDetail({
                    ...detail,
                    aiNeed: {
                      ...(detail.aiNeed ?? {}),
                      aiPresence: v,
                    },
                  })
                }
              />
            }
          />

          {/* [B-2] AI 없이 풀 수 있는가? (대안 검토) */}
          <Row2Col
            left={
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span>AI 없이 풀 수 있는가?</span>
                <Hint
                  text={
                    "AI는 비용과 복잡도가 높은 수단이에요.\n" +
                    "검토하지 않으면 불필요한 AI 개발이 시작돼요."
                  }
                />
              </div>
            }
            right={
              <SingleChoice
                options={WITHOUT_AI_OPTIONS as any}
                value={detail.aiNeed?.withoutAI ?? ""}
                onChange={(v) =>
                  setDetail({
                    ...detail,
                    aiNeed: { ...(detail.aiNeed ?? {}), withoutAI: v },
                  })
                }
              />
            }
          />

          {/* -------------------------
     [B-3] 기존 방식이 깨지는 이유
  ------------------------- */}
          <Row2Col
            left={
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span>기존 방식이 깨지는 이유</span>
                <Hint
                  text={
                    "기존 방식이 왜 유지되지 않는지 카테고리화해요.\n" +
                    "깨지는 지점을 확인하고, 해결 수단을 적용해요."
                  }
                />
              </div>
            }
            right={
              <MultiChoice
                options={BREAKS_OPTIONS as any}
                /** ✅ values.includes 에러 방지: undefined면 [] */
                values={detail.aiNeed?.whyBreaks ?? []}
                onChange={(next) =>
                  setDetail({
                    ...detail,
                    aiNeed: { ...(detail.aiNeed ?? {}), whyBreaks: next },
                  })
                }
              />
            }
          />

          {/* -------------------------
     [B-4] 그래서 AI를 쓰는 이유 (=AI 최소 역할)
     - ✅ 스펙 폭주 방지
  ------------------------- */}
          <Row2Col
            left={
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span>그래서 AI를 쓰는 이유 (AI 역할)</span>
                <Hint
                  text={
                    "AI가 어떤 역할을 맡는지 선택해요.\n" +
                    "역할이 명확해야 과도한 스펙 설정을 막을 수 있어요.\n" +
                    "정리하지 않으면 AI가 모든 걸 해결한다는 전제에 빠질 수 있어요."
                  }
                />
              </div>
            }
            right={
              <MultiChoice
                options={WHY_AI_OPTIONS as any}
                max={2}
                /** ✅ values.includes 에러 방지 */
                values={detail.aiNeed?.whyAI ?? []}
                onChange={(next) =>
                  setDetail({
                    ...detail,
                    aiNeed: { ...(detail.aiNeed ?? {}), whyAI: next },
                  })
                }
              />
            }
          />
        </Section>

        {/* =========================
    [C] 데이터 정의
    - 이 문제와 바로 연결된 데이터가 있는지 확인
    - 있으면 바로 써볼 수 있고, 없으면 만들어야 함
========================= */}
        <Section
          title="[C] 데이터 정의"
          desc={
            "이 문제와 바로 연결된 데이터가 있는지 확인해요.\n" +
            "있다면 바로 써볼 수 있고, 없다면 만들어야 해요."
          }
        >
          {/* 1) 지금 데이터가 있나? */}
          <Row2Col
            left="지금 데이터가 있나?"
            right={
              <SingleChoice
                options={YES_NO_OPTIONS}
                value={detail.dataDef.hasData}
                onChange={(v) =>
                  setDetail({
                    ...detail,
                    dataDef: { ...detail.dataDef, hasData: v },
                  })
                }
              />
            }
          />

          {/* 데이터 없음 선택 시 안내 (TIP / WARNING 느낌) */}
          {detail.dataDef.hasData === "아니오" && (
            <div
              style={{
                marginTop: 6,
                marginBottom: 6,
                padding: "10px 12px",
                background: "#fff7e6",
                border: "1px solid #ffe0a3",
                borderRadius: 8,
                fontSize: 13,
                lineHeight: 1.5,
              }}
            >
              모델 선택 전이라면,<br />
              <b>먼저 성공 기준과 기대 효과</b>까지 정리해 둘 수 있어요.
              <br />
              <span style={{ color: "#666" }}>
                → 어떤 변화가 생기면 “잘 되고 있다”고 말할 수 있는지<br />
                → 그걸 어떻게 확인할 수 있는지
              </span>
            </div>
          )}

          {/* 2) 앞으로도 계속 쌓이나? */}
          <Row2Col
            left={
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span>앞으로도 계속 쌓이나?</span>
                <Hint
                  text={
                    "일회성 데이터인지, 계속 쌓이는 데이터인지 확인해요.\n" +
                    "지속 데이터가 있으면 모델 개선·재학습·운영이 가능해요.\n" +
                    "없다면 일회성 분석이나 룰 기반 접근이 더 적합할 수 있어요."
                  }
                />
              </div>
            }
            right={
              <SingleChoice
                options={YES_NO_OPTIONS}
                value={detail.dataDef.keepsComing}
                onChange={(v) =>
                  setDetail({
                    ...detail,
                    dataDef: { ...detail.dataDef, keepsComing: v },
                  })
                }
              />
            }
          />

          {/* 3) 데이터 형태 */}
          <Row2Col
            left={
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span>데이터 형태</span>
                <Hint
                  text={
                    "데이터가 어떤 형태인지 선택해요.\n" +
                    "형태에 따라 모델 방식과 구현 난이도가 달라져요."
                  }
                />
              </div>
            }
            right={
              <MultiChoice
                options={[
                  { value: "로그", label: "로그 (Log)" },
                  { value: "문서", label: "문서 (Document)" },
                  { value: "라벨", label: "라벨 (Label)" },
                  { value: "대화", label: "대화 (Conversation)" },
                  { value: "이미지", label: "이미지 (Image)" },
                  { value: "기타", label: "기타 (Other)" },
                ]}
                values={detail.dataDef.dataTypes}
                onChange={(next) =>
                  setDetail({
                    ...detail,
                    dataDef: { ...detail.dataDef, dataTypes: next },
                  })
                }
              />
            }
          />

          {/* 4) 데이터 예시(샘플) */}
          <Row2Col
            left={
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span>데이터 예시(샘플)</span>
                <Hint
                  text={
                    "실제로 존재하는 데이터 한 줄을 그대로 적어보세요.\n" +
                    "완벽하지 않아도 괜찮아요.\n\n" +
                    "이 한 줄만으로도 모델 입력, 전처리, 평가 가능성을 가늠할 수 있어요."
                  }
                />
              </div>
            }
            right={
              <TextArea
                value={detail.dataDef.dataExample}
                onChange={(v) =>
                  setDetail({
                    ...detail,
                    dataDef: { ...detail.dataDef, dataExample: v },
                  })
                }
                placeholder={
                  "예시)\n\n" +
                  "[사용자 질문]\n" +
                  "“환불은 언제 처리되나요?”\n\n" +
                  "[서비스 로그]\n" +
                  "user_id=1234 action=payment_failed timestamp=2024-03-01\n\n" +
                  "[분류 라벨]\n" +
                  "정상 거래 / 이상 거래\n\n" +
                  "[상담 대화 일부]\n" +
                  "“결제가 두 번 됐는데 하나는 취소 가능한가요?”"
                }
              />
            }
          />
        </Section>

        {/* =========================
    [D] 문제 정의 리뷰
========================= */}
        {showReviewSection && (
          <Section
            title="[D] 문제 정의 리뷰"
            desc={
              "문제 정의 단계에서 문제–AI–데이터 간 논리 연결을 검토해요.\n" +
              "기획 초반에 놓치기 쉬운 위험 신호를 참고하기 위한 목적이에요."
            }
          >
          {/* PRISM 리뷰 실행 버튼 */}
          {(() => {
            const enabled = canRunReview(detail, savedOnce);
            return (
              <button
                onClick={enabled ? handleRunReview : undefined}
                disabled={!enabled}
                style={{
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

          {/* 보조 설명 텍스트 */}
          <div
            style={{
              fontSize: 13,
              color: "#666",
              lineHeight: 1.6,
              marginTop: 10,
            }}
          >
            리뷰가 실행되면 아래에 결과가 정리돼요.
            <br />- <b>한 줄 결론</b>
            <br />- <b>논리적으로 어긋난 지점</b>
            <br />- <b>실무에서 위험해질 수 있는 조합</b>
            <br />- <b>다음에 하면 좋은 행동(To-do)</b>
          </div>

          {/* ✅ 결과 카드 영역 (임시 mock 렌더링) */}
          {review && (
            <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
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
                <div style={{ fontWeight: 900, marginBottom: 6 }}>
                  논리 끊긴 지점
                </div>
                <ul
                  style={{
                    margin: 0,
                    paddingLeft: 18,
                    fontSize: 13,
                    color: "#444",
                    lineHeight: 1.6,
                  }}
                >
                  {review.logicGaps.map((x: any, i: number) => (
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
                <div style={{ fontWeight: 900, marginBottom: 6 }}>
                  위험한 조합
                </div>
                <ul
                  style={{
                    margin: 0,
                    paddingLeft: 18,
                    fontSize: 13,
                    color: "#444",
                    lineHeight: 1.6,
                  }}
                >
                  {review.risks.map((x: any, i: number) => (
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
                <div style={{ fontWeight: 900, marginBottom: 6 }}>
                  다음 행동(To-do)
                </div>
                <ul
                  style={{
                    margin: 0,
                    paddingLeft: 18,
                    fontSize: 13,
                    color: "#444",
                    lineHeight: 1.6,
                  }}
                >
                  {review.todos.map((x: any, i: number) => (
                    <li key={i}>{x}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* 결과 카드 영역 (추후 AI 결과 렌더링 위치) */}
          {/* <PrismReviewCards /> */}
          </Section>
        )}

        <div style={{ height: 30 }} />
      </div>
      {/* ===== 여기까지 복붙 END ===== */}
    </fieldset>
  );
}

/* =========================================================
   아래부터는 Step1Body 내부에서 사용하는
   "UI Helper 컴포넌트들"

   ⚠️ 원래는 item/[id]/page.tsx 안에 있었음
   ⚠️ Step1Body로 분리하면서 같이 옮겨줘야 함
   ⚠️ 내용/스타일/구조 절대 수정하지 말 것
========================================================= */

/* =========================
   Section
   - A/B/C/D 큰 덩어리 박스
========================= */
function Section({
  title,
  desc,
  children,
}: {
  title: string;
  desc?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        border: "1px solid #eee",
        borderRadius: 12,
        padding: 16,
        marginTop: 14,
        background: "#fff",
      }}
    >
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

/* =========================
   Row2Col
   - 좌: 질문 / 우: 입력 UI
========================= */
function Row2Col({
  left,
  right,
}: {
  left: React.ReactNode;
  right: React.ReactNode;
}) {
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

/* =========================
   TextArea
   - 멀티라인 입력
========================= */
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

/* =========================
   Hint
   - ? 아이콘 호버 설명
========================= */
function Hint({ text }: any) {
  const [open, setOpen] = React.useState(false);

  return (
    <span
      style={{
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
      }}
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
   SingleChoice
   - 체크박스 UI지만 1개만 선택
========================= */
function SingleChoice({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
      {options.map((op) => {
        const checked = value === op.value;
        return (
          <label
            key={op.value}
            style={{ display: "flex", gap: 6, alignItems: "center" }}
          >
            <input
              type="checkbox"
              checked={checked}
              onChange={() => onChange(checked ? "" : op.value)}
            />
            {op.label}
          </label>
        );
      })}
    </div>
  );
}

/* =========================
   MultiChoice
   - 여러 개 선택 가능
========================= */
function MultiChoice({
  options,
  values,
  onChange,
  max,
}: {
  options: { value: string; label: string }[];
  values: string[];
  onChange: (next: string[]) => void;
  max?: number;
}) {
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
            style={{
              display: "flex",
              gap: 6,
              alignItems: "center",
              opacity: disabled ? 0.5 : 1,
            }}
          >
            <input
              type="checkbox"
              checked={checked}
              disabled={disabled}
              onChange={() => toggle(op.value)}
            />
            {op.label}
          </label>
        );
      })}
      {max ? <div style={{ fontSize: 12, color: "#666" }}>(최대 {max}개)</div> : null}
    </div>
  );
}

/* =========================
   Step1 옵션 상수들
   (page.tsx에서 쓰던 걸 그대로 옮김)
========================= */
const AI_PRESENCE_OPTIONS = [
  { value: "없다(신규 도입)", label: "없다(신규 도입)" },
  { value: "있다(개선/고도화)", label: "있다(개선/고도화)" },
];

const WITHOUT_AI_OPTIONS = [
  { value: "수동", label: "수동" },
  { value: "검색", label: "검색" },
  { value: "룰", label: "룰" },
  { value: "가이드", label: "가이드" },
  { value: "포기", label: "포기" },
];

const BREAKS_OPTIONS = [
  { value: "스케일", label: "스케일" },
  { value: "다양성", label: "다양성" },
  { value: "비용", label: "비용" },
  { value: "UX", label: "UX" },
  { value: "일관성", label: "일관성" },
];

const WHY_AI_OPTIONS = [
  { value: "분류", label: "분류 (Classification)" },
  { value: "요약", label: "요약 (Summarization)" },
  { value: "추천", label: "추천 (Recommendation)" },
  { value: "탐지", label: "탐지 (Detection)" },
  { value: "보조 판단", label: "보조 판단 (Decision Support)" },
];

const YES_NO_OPTIONS = [
  { value: "예", label: "예" },
  { value: "아니오", label: "아니오" },
];
