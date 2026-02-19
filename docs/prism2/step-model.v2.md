# PRISM 2.0 Step Model v2

## Step Structure
1. STEP 1 전략·방향
- 왜 AI를 붙이는가
- 누구 문제인가
- AS-IS / TO-BE
- 결과 저장물과 최소 역할
- KPI/대안/리스크 허용 수준

2. STEP 2 설계 초안
- 상태 모델 초안
- 사용자 행동 흐름
- AI 개입 위치
- 시스템 처리 구조
- 데이터 저장/로그/비용 전략 초안

3. STEP 3 자동화·리스크·운영 정책
- 자동화 범위 및 human-in-the-loop
- confidence 임계값 정책
- 실패/재시도/fallback/guardrail
- 모니터링/롤백/모델 버전 정책
- PII/보안 정책

4. STEP 4 기술 스펙
- API/권한/rate limit/에러코드
- 입출력 스키마
- 서버 상태 전이 규칙
- DB/로그 스키마
- 동기/비동기 실행 구조

## Note
- Artifacts는 단계가 아니라 산출물 영역으로 유지한다.
