# Tech Debt / Lint Debt

기준: 현재 브랜치에서 `npm run lint` 결과 + `rg -n "\\bany\\b|@ts-ignore" app lib docs` 스캔.

## 1) 요약

- lint 상태: 실패
- 주요 유형:
  - `@typescript-eslint/no-explicit-any`
  - `@typescript-eslint/ban-ts-comment` (`@ts-ignore`)
  - `react-hooks/set-state-in-effect`
  - 일부 `react/no-unescaped-entities`, `no-unused-vars`, `no-img-element`

## 2) any / @ts-ignore 남은 위치

### lib
- `lib/step2Flows.ts:6` (`@ts-ignore`)

### app/page.tsx
- `app/page.tsx:147` (`@ts-ignore`)
- `app/page.tsx:227` (`any`)

### app/components/Step1Body.tsx
- `app/components/Step1Body.tsx:6`
- `app/components/Step1Body.tsx:7`
- `app/components/Step1Body.tsx:10`
- `app/components/Step1Body.tsx:11`
- `app/components/Step1Body.tsx:335`
- `app/components/Step1Body.tsx:365`
- `app/components/Step1Body.tsx:394`
- `app/components/Step1Body.tsx:426`
- `app/components/Step1Body.tsx:690`
- `app/components/Step1Body.tsx:716`
- `app/components/Step1Body.tsx:742`
- `app/components/Step1Body.tsx:877`

### app/item/[id]/page.tsx
- `app/item/[id]/page.tsx:130`
- `app/item/[id]/page.tsx:140`
- `app/item/[id]/page.tsx:144`
- `app/item/[id]/page.tsx:161` (`@ts-ignore`)
- `app/item/[id]/page.tsx:213` (`@ts-ignore`)
- `app/item/[id]/page.tsx:421`
- `app/item/[id]/page.tsx:501`
- `app/item/[id]/page.tsx:502`
- `app/item/[id]/page.tsx:556`
- `app/item/[id]/page.tsx:597`
- `app/item/[id]/page.tsx:621`
- `app/item/[id]/page.tsx:737`
- `app/item/[id]/page.tsx:776`
- `app/item/[id]/page.tsx:791`
- `app/item/[id]/page.tsx:888`

### app/item/[id]/step2/page.tsx
- `app/item/[id]/step2/page.tsx:48` (`@ts-ignore`)
- `app/item/[id]/step2/page.tsx:57`

### app/item/[id]/step2/[flowId]/page.tsx
- `app/item/[id]/step2/[flowId]/page.tsx:171` (`@ts-ignore`)
- `app/item/[id]/step2/[flowId]/page.tsx:639`
- `app/item/[id]/step2/[flowId]/page.tsx:652`
- `app/item/[id]/step2/[flowId]/page.tsx:1080`
- `app/item/[id]/step2/[flowId]/page.tsx:1090`
- `app/item/[id]/step2/[flowId]/page.tsx:1159`
- `app/item/[id]/step2/[flowId]/page.tsx:1184`
- `app/item/[id]/step2/[flowId]/page.tsx:1215`
- `app/item/[id]/step2/[flowId]/page.tsx:1292`
- `app/item/[id]/step2/[flowId]/page.tsx:1339`
- `app/item/[id]/step2/[flowId]/page.tsx:1340`
- `app/item/[id]/step2/[flowId]/page.tsx:1361`
- `app/item/[id]/step2/[flowId]/page.tsx:1541` (`@ts-ignore`)

## 3) 제거 계획

### Phase 1 (안전/저위험, 1~2일)
- `@ts-ignore`를 `@ts-expect-error`로 우선 치환하고 이유 주석 추가
- localStorage read/write 경계에 `unknown` 파서 도입(legacy 영역 포함)
- `any`를 `unknown` + 타입가드로 우선 치환

### Phase 2 (모델링, 2~4일)
- `app/item/*` 레거시 페이지에 공통 타입 도입:
  - `ItemSummary`
  - `ItemDetail`
  - `Step2Flow`
  - `ReviewPayload`
- 함수 시그니처의 `any` 제거
- 데이터 마이그레이션 함수 입력/출력 타입 명시

### Phase 3 (lint 규칙 정리, 1~2일)
- `react-hooks/set-state-in-effect` 위반을 초기 상태 계산 + 이벤트 구독 구조로 리팩터링
- `no-unused-vars`, `react/no-unescaped-entities`, `no-img-element` 순차 정리

## 4) 우선순위

1. 타입 안전성: `any/@ts-ignore` 제거
2. effect 규칙 위반 제거
3. 나머지 스타일/가독성 경고 정리

## 5) 완료 기준 (권장)

- `npm run lint` 에러 0
- `any/@ts-ignore` 0
- `npm run build` 통과 유지
