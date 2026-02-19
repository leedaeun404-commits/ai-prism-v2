# PRISM v2 Architecture (MVP)

## 1) localStorage Key 규칙

- namespace: `prism2:mvp`
- key pattern: `prism2:mvp:{projectId}:{suffix}`
- suffix:
  - `step1`
  - `step2`
  - `step3`
  - `step4`
  - `progress`
  - `history`

예시:
- `prism2:mvp:4773d95a-...:step1`
- `prism2:mvp:4773d95a-...:progress`

## 2) Stage Gate Rules

| Stage | Route | Gate 조건 | 완료 상태 |
| --- | --- | --- | --- |
| STEP1 | `/project/[id]/screening` | 없음 | `step1Frozen=true` |
| STEP2 | `/project/[id]/execution` | `step1Frozen=true` | `step2Completed=true` |
| STEP3 | `/project/[id]/policy` | `step1Frozen=true && step2Completed=true` | `step3Completed=true` |
| STEP4 | `/project/[id]/tech-spec` | `step1Frozen=true && step2Completed=true && step3Completed=true` | step4 저장(문서 상태) |

## 3) 데이터 모델(요약)

- `Step1Data`: 문제/대상/리스크/AI역할 등 seed 입력 8개
- `Step2Data`: 최소 설계 10개 항목 + reviewed 맵
- `Step3Policy`: 운영 정책 12개 항목 + reviewed 맵
- `Step4Row`: 선언형 row (`rowId/title/spec/note/relatedTabs`)
- `ProjectProgress`: gate 상태
- `HistoryEvent`: 자동/수동 타임라인 이벤트

## 4) Generator Functions 관계도 (텍스트)

```text
Step1 입력 저장
  -> generateStep2Data(step1)
  -> Step2 초안 생성

Step2 저장(검토완료)
  -> generateStep3Policy(step1, step2)
  -> Step3 초안 생성/병합

Step4 진입
  -> generateTechSpecRows(step1, step2, step3)
  -> 선언형 row + spec/note 생성
  -> 저장본(step4) 있으면 rowId 기준 merge
```

추가 보조:
- `generateTechSpec(step1, step2Draft, step3)`는 텍스트 문서형 스펙 변환에 사용 가능
- `getStep2MissingFields`, `getStep3MissingFields`는 단계 완료 체크 지원
- `canAccessExecution|Policy|TechSpec`는 UI/라우트 게이트 계산

## 5) STEP4 연동 설계

- `TECH_SPEC_ROW_DEFS`가 단일 진실 소스(SSOT)
  - `rowId`, `title`, `relatedTabs` 선언
- UI 동작:
  - 우측 탭 선택 => `relatedTabs`에 따라 좌측 행 하이라이트
  - 좌측 행 선택 => 해당 행 `relatedTabs`를 추천 탭으로 표시
  - 저장 merge는 `rowId` 기준

## 6) 정책 의미 고정

- `auto_approved`:
  - 초안 내부 저장 승인
  - 배포/외부 반영 아님
- `publish 승인`:
  - 외부 반영 승인
  - 휴먼 필수
