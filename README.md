# Mobile Fullstack Boilerplate

React Native(Expo) 앱 + Bun 서버가 한 저장소에 사는 **모바일 서비스 모노레포
보일러플레이트**입니다. 공통 코드는 `packages/shared`(순수 TypeScript)에 두고
Metro(Hermes)와 Bun 이 같은 소스를 소비합니다.

> 전제: 앱 런타임은 Metro/Hermes입니다. Bun 은 앱의 런타임이 아니라 **패키지
> 매니저·스크립트 러너·서버 런타임**입니다. HMR 은 앱=Metro Fast Refresh,
> 서버=`bun --watch` 로 각각 동작합니다.

## 온보딩 (명령 한 번씩)

```bash
bun install                                  # 1. 전체 워크스페이스 설치
cp apps/server/.env.example apps/server/.env # 2. 서버 환경 파일
bun run db:setup                             # 3. Postgres 기동 + 마이그레이션 + 시드
bun run dev:server                           # 4. API 서버 (bun --watch)
bun run dev:mobile                           # 5. 앱 (expo start — 별도 터미널)
```

테스트/품질 게이트는 외부 환경 없이 한 번에 돕니다(인메모리 DB):

```bash
bun test          # 단위 + API 통합 테스트
bun run check     # format + lint + typecheck + knip + test
```

## 구조

```
apps/
  server/          # Bun HTTP+WebSocket 서버 (web/worker 역할 분리 가능)
    src/
      config.ts        # .env 스키마 검증 (부팅 시 fail-fast)
      container.ts     # 컴포지션 루트 — 프로세스당 lazy 싱글톤
      app.ts           # 라우트 테이블 + WS + pub/sub→WS 브리지
      http/            # 에러 봉투, 로케일 협상, CORS, 426 버전 게이트
      repositories/    # 인터페이스 + postgres/memory 구현 (동일 계약)
      services/        # 비즈니스 로직 + 명시적 트랜잭션 경계
      push/            # 푸시 발송 파사드 (dry-run 기본 / expo)
      pubsub/          # memory | redis (수평 확장 팬아웃)
    migrations/        # SQL 마이그레이션 (bun run db:migrate)
  mobile/          # Expo(React Native) 앱 — iPhone/Galaxy 폰 전용
    app.config.ts      # APP_ENV 하나로 dev/stg/prod 전환 (나란히 설치 가능)
    src/
      boot/            # 부트 시퀀스 상태 머신 + 광고 슬롯 게이트
      version/         # 업데이트 정책·OTA 파사드·스토어 이동(플랫폼 분리 예시)
      config/          # 원격 설정: 폴링(ETag/304) + WS push, useConfig()
      api/             # API 카탈로그(endpoints.ts) + TanStack Query 훅
      theme/           # 디자인 토큰 A/B × 라이트/다크
      components/      # 디자인 시스템 (testID 필수 prop)
      offline/         # 오프라인 배너 + 쿼리 캐시 디스크 persist
      storage/         # kv(AsyncStorage)·secure(Keychain/Keystore) 파사드
      analytics/       # 크래시/애널리틱스 파사드 (콘솔 더미)
packages/
  shared/          # 순수 TS: 검증 파사드, 도메인 계약, i18n, 시간, semver, 커서
docs/              # platform-decisions / ui-automation / release-playbook
```

## 아키텍처 결정

- **의존 방향**: `shared → (없음)`, `server → shared(+mobile 허용)`,
  `mobile → shared` (server 런타임 코드 금지, 타입 전용 import 만 허용).
  ESLint `no-restricted-imports` 로 강제합니다.
- **검증 파사드**: 스키마 라이브러리(현재 zod/mini)는 `packages/shared/src/validation`
  뒤에 숨어 있습니다. `Validator<T>` 계약만 소비하므로 yup 등으로 교체해도 소비자
  코드는 무변경. zod 직접 import 는 ESLint 가 차단합니다.
- **시간은 UTC**: 서버·DB(`timestamptz`)는 항상 UTC. 타임존 변환은 표시 시점
  (`formatUtcInTimeZone`, 기기 타임존)에서만.
- **i18n**: 카탈로그는 shared 에 있고 서버(에러 메시지, `Accept-Language` 협상)와
  앱(UI, 기기 로케일 감지 + 인앱 변경)이 같은 키를 씁니다.
- **목록 API = 커서 페이지네이션**: `?limit&cursor` → `{items, nextCursor}`.
  keyset 방식이라 스크롤 중 삽입/삭제에도 중복·누락이 없고, `useInfiniteQuery`
  의 `getNextPageParam` 에 그대로 물립니다.
- **환경 전환은 설정 한 번**: 서버=.env 교체(부팅 시 스키마 검증), 앱=`APP_ENV`
  빌드 프로필(dev/stg/prod 별 앱 이름·번들 ID·API URL, 한 기기에 나란히 설치).
  **앱 번들은 공개물** — extra 에 비밀을 넣지 않습니다. 비밀이 필요한 일은 전부
  서버가 대행합니다.
- **GraphQL 미사용**: 도입한다면 persisted query(핑거프린트만 일반 허용, 임의
  쿼리는 관리자 토큰)를 전제로 하세요 — admin 라우트 주석 참고.

## 앱 버전·업데이트 정책 (요약 — 상세는 docs/release-playbook.md)

- **서버 `version_policies` 테이블이 단일 진실 공급원**입니다.
  `GET /api/version-policy` 를 앱이 시작 시 + 포그라운드 복귀 시 확인합니다.
- 세 경로: **OTA**(expo-updates, 버튼 한 번에 다운로드→재시작, 채널 파사드로 EAS/
  셀프호스팅 교체 가능) / **스토어**(App Store·Play 이동, Android in-app update
  자리 마련) / **강제**(`minSupportedVersion` 미만 전체 화면 차단).
- 선택 업데이트의 "나중에"는 같은 버전을 3일간 침묵시킵니다(공유 `decideUpdate`).
- **버전 스큐**: 앱은 모든 요청에 `X-App-Version`/`X-Platform` 을 보내고, 서버는
  지원 종료 버전에 **426 UPGRADE_REQUIRED** 를 반환합니다. breaking change 는
  오직 `minSupportedVersion` 인상(=강제 업데이트)으로만 해소합니다.
  하위호환 규약(필드 제거 금지 등)은 release-playbook 에 문서화되어 있습니다.

## 부트 시퀀스 / 원격 설정 / 점검 모드

- 네이티브 스플래시 → JS 부트 화면 → 메인. 전이는 **명시적 상태 머신**
  (`apps/mobile/src/boot/machine.ts`, 순수 리듀서 + 단위 테스트)으로 구현.
  부트 중: 원격 설정 로드, 버전 정책 확인(강제/점검이면 차단), 세션 복원 자리.
- **광고 슬롯**: 인터페이스 + 더미 구현만 포함(`src/ads`). 최소 노출 시간·스킵
  허용은 원격 설정(`bootAd`)이 제어하고, 로드 실패/타임아웃은 절대 진입을 막지
  않습니다. 시동 화면 디자인은 `BootSplashDesign.tsx` 한 파일 교체로 바뀝니다.
- **원격 설정**(`app_config` 테이블, revision 기반): 폴링(간격도 원격 제어, 변경
  없으면 ETag/304로 무본문) + WebSocket push(다중 인스턴스는 pub/sub 팬아웃) +
  포그라운드 복귀 보완. 소비는 `useConfig()` 하나. 데모: 기능 플래그, 공지 배너,
  **점검 모드 kill switch**(켜면 즉시 전체 앱이 점검 화면으로 전환).

```bash
# 점검 모드 켜보기 (ADMIN_TOKEN 은 apps/server/.env)
curl -X PUT localhost:3000/api/admin/app-config/maintenance \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H "content-type: application/json" \
  -d '{"value":{"enabled":true,"message":"점검 중입니다 (~09:00 UTC)"}}'
```

## 지원 매트릭스

| 항목                                    | 지원                                        |
| --------------------------------------- | ------------------------------------------- |
| 기기                                    | Apple iPhone, Samsung Galaxy **폰**         |
| iOS                                     | 15.1+ (Expo SDK 54 / RN 0.81 기준)          |
| Android                                 | 7.0(API 24)+ — 삼성 기기 기준 One UI 시리즈 |
| 웹 / 태블릿 레이아웃 / 폴더블 특수 대응 | **없음** (의도적 배제)                      |

플랫폼 분기 원칙과 결정 이력(`*.ios.ts`/`*.android.ts` 분리 컨벤션 포함)은
[docs/platform-decisions.md](docs/platform-decisions.md).

## 로컬 개발 연결 (앱 ↔ 로컬 서버)

| 실행 환경          | API 주소                       | 비고                                                             |
| ------------------ | ------------------------------ | ---------------------------------------------------------------- |
| iOS 시뮬레이터     | `http://localhost:3000`        | 기본값 (자동)                                                    |
| Android 에뮬레이터 | `http://10.0.2.2:3000`         | 기본값 (자동) — 호스트 루프백 별칭                               |
| 실기기             | `http://<맥/PC의 LAN IP>:3000` | `EXPO_PUBLIC_API_URL=http://192.168.x.x:3000 bun run dev:mobile` |

API base URL 은 코드가 아니라 환경 설정(`EXPO_PUBLIC_API_URL` 또는 빌드 프로필)로만
제어합니다 (`apps/mobile/src/config/env.ts`).

## 서버 하이라이트

- **수평 확장**: 인스턴스 간 통신은 pub/sub 추상화(`PUBSUB_DRIVER=memory|redis`).
  WS 팬아웃·버전 정책 캐시 무효화·백그라운드 잡이 모두 이 버스를 탑니다.
- **역할 분리**: `SERVER_ROLE=web|worker|all` — 같은 바이너리로 HTTP 와 잡 처리를
  독립 스케일.
- **리포지토리 패턴**: Postgres(Bun 내장 SQL)·in-memory 가 같은 계약. 테스트와
  `DB_DRIVER=memory` 로컬 해킹은 외부 의존성 0.
- **트랜잭션 경계 명시**: 서비스 코드의 `uow.run(async (tx) => …)` 블록이 곧 경계.
- **N+1 방지**: 목록은 페이지당 1쿼리(keyset). 관련 행이 생기면 `IN (…)` 일괄 조회
  주석 참고 (`repositories/types.ts`).
- **헬스체크**: `/api/health/live`(프로세스 생존) / `/api/health/ready`(DB 연결,
  종료 드레인 중 503) 분리. graceful shutdown 은 readiness 하강 → 드레인 →
  in-flight 정리 → 리소스 해제 순.
- **푸시 파사드**: `PUSH_DRIVER=dry-run`(기본, 자격증명 불필요·로그로 확인) |
  `expo`. 토큰 등록/해제 API + `POST /api/admin/push/broadcast`(워커가 발송).

## API 요약

| 메서드/경로                                                 | 설명                                    |
| ----------------------------------------------------------- | --------------------------------------- |
| `GET /api/health/live` · `/ready`                           | 헬스체크 (생존/트래픽 수용)             |
| `GET /api/version-policy?platform=`                         | 버전 정책 (426 게이트 제외 대상)        |
| `GET /api/app-config`                                       | 원격 설정 (ETag/304, 게이트 제외 대상)  |
| `GET/POST /api/todos`, `GET/PATCH/DELETE /api/todos/:id`    | 데모 도메인 (커서 목록)                 |
| `POST /api/push-tokens`, `POST /api/push-tokens/unregister` | 푸시 토큰 등록/해제                     |
| `PUT /api/admin/version-policy/:platform`                   | 정책 갱신 (Bearer ADMIN_TOKEN)          |
| `PUT /api/admin/app-config/:key`                            | 설정 갱신 + WS 브로드캐스트             |
| `POST /api/admin/push/broadcast`                            | 전체 푸시(잡 큐 경유)                   |
| `WS /ws`                                                    | `config.changed` / `todos.changed` push |

에러는 항상 `{ error: { code, message(로컬라이즈드), details? } }` 봉투입니다.

## DX / CI / CD

- `bun run check` = prettier + eslint(경계 규칙 포함) + tsc(3 워크스페이스) +
  knip + bun test. husky pre-commit(staged lint/format), pre-push(전체 게이트).
- GitHub Actions: [ci.yml](.github/workflows/ci.yml) 이 push 마다 JS 레벨 검증,
  [native-build.yml](.github/workflows/native-build.yml) 이 수동/태그 트리거로
  EAS Build (EXPO_TOKEN 시크릿 필요 — 파일 헤더에 설정법).
- 서버는 Bun 번들러로 빌드(`bun run build:server`), Docker 로 DB 기동 +
  컨테이너 빌드(`docker compose --profile app up --build`).
- **앱 버전 규약**: semver 는 `apps/mobile/app.config.ts` 의 `version` 이 유일한
  출처, 플랫폼 빌드 넘버는 EAS `autoIncrement` 로 자동 증가. 코드사이닝 자산은
  커밋 금지(gitignore 등록) — 관리법은 release-playbook.

## 문서

- [docs/platform-decisions.md](docs/platform-decisions.md) — 플랫폼 분기 결정 이력
- [docs/ui-automation.md](docs/ui-automation.md) — testID 규약 + Maestro E2E
- [docs/release-playbook.md](docs/release-playbook.md) — OTA/스토어/강제 업데이트
  판단 기준·절차, API 하위호환 규약, 코드사이닝
