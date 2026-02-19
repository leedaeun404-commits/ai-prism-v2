# PRISM v2 MVP Spec

## 0) One-liner
얕게 여러 개를 빠르게 구조화(스크리닝)하고, 살아남은 것만 깊게 설계/구현으로 넘기는 구조 기반 실험 시스템.

## 1) 목표
- 입력을 고정한다.
- 최소 설계를 자동 생성한다.
- 운영 정책으로 잠근다.
- 기술 스펙으로 번역한다.

## 2) 구현 범위
- 프레임워크: Next.js App Router + TypeScript
- 저장소: localStorage (MVP)
- AI 호출: 없음 (더미 생성 로직)
- 핵심 라우트:
  - `/project/[id]/screening`
  - `/project/[id]/execution`
  - `/project/[id]/policy`
  - `/project/[id]/tech-spec`

## 3) 단계별 상세

### STEP 1 — Screening (전략&방향)
- 입력 필드 8개:
  - `why_ai`
  - `target_user`
  - `as_is_problem`
  - `result_artifact`
  - `ai_min_role` (`draft_only|auto_publish`)
  - `risk_level` (`low|medium|high`)
  - `kpi_hypothesis`
  - `no_ai_alternative`
- 기능:
  - 저장: step1 저장 + step2 초안 자동 갱신
  - Freeze: 필수 항목 충족 시 잠금
  - GO/STOP 카드:
    - `risk_level=high` and `ai_min_role=auto_publish` => `STOP`
    - else => `GO`

### STEP 2 — Execution (설계 초안)
- 진입 조건: `step1Frozen=true`
- 자동 생성 10개 항목:
  - 상태 모델
  - 사용자 행동 흐름
  - AI 개입 위치
  - 시스템 처리 구조
  - Human control
  - 실패 대응
  - 결과 전달 방식
  - 데이터 저장 구조
  - 로그 항목
  - 비용 전략
- 완료 조건:
  - 10개 항목 입력 완료
  - 10개 검토 체크 완료
- 저장 결과:
  - `step2Completed=true`
  - step3 정책 초안 자동 생성/병합

### STEP 3 — Policy (자동화·리스크)
- 진입 조건: `step1Frozen=true && step2Completed=true`
- 자동 생성 12개 항목:
  - 자동화 수준 조정
  - 자동 처리 범위 조정
  - 허용 오차 조정
  - Human review 삽입 여부
  - 실패 UX 정책
  - AI 판단 최종 여부
  - 비용-품질 균형 전략
  - 캐시 전략
  - 데이터 자산화 전략
  - 모니터링 기준
  - 롤백 기준
  - 모델 버전 관리
- 정책 정합성 고정 문구:
  - `auto_approved = 초안 내부 저장 승인(배포 아님)`
  - `publish 승인 = 외부 반영 승인(휴먼 필수)`
- 완료 조건:
  - 12개 항목 입력 완료
  - 12개 검토 체크 완료
- 저장 결과:
  - `step3Completed=true`

### STEP 4 — Tech Spec (기술 스펙)
- 진입 조건: `step1Frozen=true && step2Completed=true && step3Completed=true`
- 선언형 Row 모델:
  - `rowId`, `title`, `spec`, `note`, `relatedTabs`
- 기본 row 14개:
  - API 정의
  - 입력 스키마
  - 출력 스키마
  - 상태 모델
  - 상태 전이 규칙
  - 모델 조건
  - Fallback 조건
  - Guardrail 정책
  - 저장 구조
  - 로그 구조
  - 모니터링 항목
  - 롤백 정책
  - 보안/PII 정책
  - 실행 구조
- 기능:
  - 편집 가능한 `spec/note`
  - 드래그앤드롭 행 순서 변경
  - 저장(localStorage)
  - 우측 다이어그램 탭 연동
  - 탭 클릭 시 관련 행 하이라이트
  - 행 선택 시 연관 탭 배지/추천 탭 표시

## 4) 우측 다이어그램 탭
- State
- Sequence
- Error/Retry
- Auth Matrix
- Data Flow
- Observability
- Pipeline
- Rollback
- Cost Path
- IA

## 5) 공통 UX
- 상단 Step Navigator + 잠금 표시
- 플로팅 메모 버튼(우하단)
- 메모 입력 + 자동 히스토리 타임라인 통합

## 6) 완료 기준(현재)
- 1→2→3→4 게이트 흐름 동작
- 자동 생성/검토/저장/히스토리 동작
- build 통과
