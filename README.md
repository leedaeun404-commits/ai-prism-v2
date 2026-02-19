## PRISM v2 MVP Quick Start

철학(1줄): 입력 고정 → 최소 설계 생성 → 정책으로 잠금 → 스펙으로 번역

### 실행 (3001)

```bash
npm run dev -- -p 3001
```

브라우저: `http://localhost:3001`

### 라우트 표

| Route | 설명 |
| --- | --- |
| `/` | Project Hub |
| `/project/[id]` | STEP 1로 진입 |
| `/project/[id]/screening` | STEP 1 전략&방향 |
| `/project/[id]/execution` | STEP 2 설계 초안 |
| `/project/[id]/policy` | STEP 3 자동화/리스크 |
| `/project/[id]/tech-spec` | STEP 4 기술 스펙 |
| `/project/[id]/artifacts` | Artifacts |

### 게이트 규칙 표

| 단계 | 진입 조건 | 완료 조건 |
| --- | --- | --- |
| STEP 1 | 없음 | 필수 입력 후 Freeze |
| STEP 2 | `step1Frozen=true` | 10개 항목 입력 + 10개 검토 체크 |
| STEP 3 | `step1Frozen=true && step2Completed=true` | 12개 항목 입력 + 12개 검토 체크 |
| STEP 4 | `step1Frozen=true && step2Completed=true && step3Completed=true` | 저장 완료(문서 확정은 팀 프로세스) |

---

문서:
- `docs/MVP_SPEC.md`
- `docs/ARCHITECTURE.md`
- `docs/DEBT.md`

---

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
