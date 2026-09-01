# 다른 보일러플레이트 둘러보기 — 비교와 배울 점

이 저장소를 밖에서 보기 위한 문서입니다. 널리 쓰이는 풀스택 보일러플레이트 8개를 훑고,
우리와 **무엇이 다른지**, 그 차이가 **의도된 선택인지 빈칸인지**를 구분합니다.

> 요약: 우리 강점은 _런타임 아키텍처_(교체 가능한 드라이버, 버전 스큐 차단, 무중단 종료)이고,
> 남들의 강점은 _제품 기능_(인증·과금·메일)과 _운영 관측_(로깅·에러 추적)입니다.
> 우리에게 진짜 빈칸인 것은 §4에 5개로 추렸습니다.

---

## 1. 훑어본 목록

| 보일러플레이트                                                              | 한 줄 성격                     | 핵심 스택                                                             |
| --------------------------------------------------------------------------- | ------------------------------ | --------------------------------------------------------------------- |
| [Epic Stack](https://github.com/epicweb-dev/epic-stack)                     | "의견 있는" 프로덕션 레퍼런스  | Remix, SQLite+LiteFS, Prisma, Fly.io, Playwright                      |
| [create-t3-app](https://github.com/t3-oss/create-t3-app)                    | 타입 안전성 축의 스캐폴더      | Next.js, tRPC, Prisma/Drizzle, NextAuth, Tailwind                     |
| [Better-T-Stack](https://github.com/AmanVarshney01/create-better-t-stack)   | 조합형 CLI ("골라 담기")       | Bun/Node/Workers × Hono/Elysia/Express × tRPC/oRPC × Drizzle/Prisma   |
| [ixartz/Next-js-Boilerplate](https://github.com/ixartz/Next-js-Boilerplate) | 툴링 최대주의                  | Next.js 16, Clerk, Drizzle+PGlite, Sentry, Arcjet, PostHog, Storybook |
| [react-starter-kit](https://github.com/kriasoft/react-starter-kit)          | 엣지 네이티브 모노레포         | Cloudflare Workers ×3, Hono, tRPC, Drizzle+Neon, Better Auth, Stripe  |
| [nestjs-boilerplate](https://github.com/brocoders/nestjs-boilerplate)       | 백엔드 전용 정석               | NestJS, TypeORM/Mongoose, 소셜 로그인, S3, nodemailer, Swagger        |
| [estepanov/fullstack-bun](https://github.com/estepanov/fullstack-bun)       | 가장 가까운 이웃 (Bun 풀스택)  | Bun, Hono, Vite, React 19, Tailwind 4, shadcn, Biome, Pino            |
| [bulletproof-react](https://github.com/alan2207/bulletproof-react)          | 보일러플레이트가 아닌 _규약집_ | 기능 폴더, import 경계, 배럴 파일 금지                                |

## 2. 우리가 다르게 (그리고 의도적으로) 하는 것

이 항목들은 8개 중 어디에도 같은 형태로 없었습니다. 유지할 근거가 있는 차이입니다.

| 우리 선택                              | 바깥의 통념                                                  | 왜 우리가 옳다고 보는가                                                                |
| -------------------------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| **번들러 0개** (Bun 번들러 단독)       | 거의 전부 Vite. Bun 이웃(fullstack-bun)조차 Vite 사용        | 서버가 클라이언트를 품는 단일 산출물 → 배포 정합성이 구조적으로 보장됨                 |
| **버전 핸드셰이크** (`X-App-Version`)  | 아무도 없음                                                  | 롤링 배포 중 구·신 버전 혼재는 실제로 터지는 사고인데 대부분 방치                      |
| **검증 파사드** (`@shared/validation`) | zod를 앱 전역에서 직접 import                                | 라이브러리 교체 비용을 어댑터 1개로 격리                                               |
| **리포지토리 계약 + in-memory 구현**   | ORM(Prisma/Drizzle)에 직접 결합                              | `bun test` 하나가 외부 환경 없이 전 계층을 돈다 — 남들은 testcontainer나 PGlite가 필요 |
| **pub/sub 추상화 + `SERVER_ROLE`**     | 워커는 별도 서비스/큐 제품                                   | 같은 바이너리를 web/worker로 나눠 띄우고, 드라이버만 memory→redis로 바꿔 수평 확장     |
| **UTC 전용 시간 정책 + 브랜드 타입**   | 규약 없음 (`Date`가 아무 데나 흐름)                          | 타임존 버그를 타입으로 막는 곳은 여기 말고 못 봄                                       |
| **testId 필수 prop + 레지스트리**      | 있으면 좋고 없어도 그만                                      | UI 자동화 계약을 컴파일 타임에 강제                                                    |
| **의존 방향 ESLint 강제**              | bulletproof-react만 동일 사상 (`import/no-restricted-paths`) | 유일하게 우리와 겹치는 레퍼런스. 방향은 맞다는 방증                                    |

## 3. 남들에게 있고 우리에게 없는 것 — 그러나 **없어도 되는** 것

보일러플레이트가 제품을 대신 골라주면, 그 선택을 되돌리는 것이 곧 비용입니다.

- **인증/과금 SaaS 결합** (Clerk, Better Auth, Stripe, NextAuth) — 제품이 정해지기 전에 벤더를
  고르는 일. 우리는 도메인 계약만 두고 비워 둡니다.
- **메타프레임워크**(Next.js/Remix)의 SSR·RSC — 우리는 SPA + 단일 산출물이 목표입니다.
- **엣지 런타임 종속**(Workers, Fly, Neon) — 특정 PaaS에 배포 모델이 묶입니다.
- **Storybook** — `/design-system` 페이지가 같은 역할을 하고, 의존성이 0입니다.
- **Turborepo/Nx 모노레포** — 단일 패키지에 `src/{shared,server,client}`로 충분합니다.

## 4. 진짜 빈칸 — 우리도 필요한데 없는 것

여기부터가 이 조사의 결론입니다. 우선순위 순.

| #   | 빈칸                        | 근거                                                                                                                     |
| --- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| B1  | **E2E 테스트 러너**         | testId 레지스트리와 `docs/ui-automation.md`까지 만들어 놓고 정작 소비자가 없음. Epic Stack·ixartz 모두 Playwright 상비   |
| B2  | **구조적 로깅**             | 이웃 fullstack-bun은 Pino, ixartz는 LogTape. 우리는 `console`뿐 — 요청 ID·상관관계 추적이 불가능                         |
| B3  | **레이트 리밋 / 남용 방어** | ixartz는 Arcjet. CORS는 origin만 막을 뿐 호출량은 아무도 안 막고 있음                                                    |
| B4  | **의존성 자동 갱신**        | 버전을 `package.json` 한 곳에 고정해 두었으므로 Renovate/Dependabot이 잘 맞음. 지금은 수동                               |
| B5  | **API 문서 산출물**         | nestjs-boilerplate는 Swagger. 우리는 `endpoints.ts` 주석이 유일한 계약 문서 — 서버 라우트에서 OpenAPI를 뽑을 여지가 있음 |

관측(Sentry 류 에러 추적)은 B2가 먼저입니다. 로그 구조가 없으면 추적 도구를 붙여도 남는 게
없습니다.

## 5. 배운 문장들

- **Epic Stack**: "I've got opinions." — 보일러플레이트의 가치는 선택지가 아니라 _선택_에 있습니다.
- **T3의 3원칙**: 문제를 풀 때만 추가한다 / 책임 있게 최신을 쓴다("옮겨 타기 쉬운 것만 실험한다") /
  타입 안전성은 선택이 아니다. 세 번째는 우리도 같고, 첫 번째는 §3의 근거입니다.
- **Better-T-Stack**: "군더더기 없는 최소 템플릿." 조합형 CLI라는 정반대 답도 있다는 것 —
  우리는 조합을 CLI가 아니라 **드라이버 인터페이스**로 풉니다(DB, pub/sub, 검증).
- **bulletproof-react**: 배럴 파일은 트리셰이킹을 막는다. 기능이 늘면 계층 폴더(`services/`,
  `repositories/`)가 기능 폴더(`features/todo/*`)로 바뀌어야 하는 시점이 옵니다 — 우리 ESLint
  경계 규칙은 그때도 그대로 씁니다.

---

_조사 시점: 2026-09. 별 수·버전은 그 이후 바뀔 수 있습니다._
