# UI 자동화 가이드 (testID 규약 + E2E)

앱의 **모든 인터랙티브 요소는 UI 자동화가 가능하도록** 설계되어 있으며, 규약 전체를
이 문서 하나에서 확인할 수 있습니다.

## 원칙

1. **인터랙티브 디자인 시스템 컴포넌트는 `testID`가 필수 prop**입니다
   (`Button`, `IconButton`, `TextField`). testID 없이 렌더링하면 타입 에러가 나므로
   자동화 불가능한 컨트롤이 애초에 만들어질 수 없습니다.
2. **testID 문자열은 인라인으로 쓰지 않습니다.** 유일한 출처는
   [`apps/mobile/src/testing/testids.ts`](../apps/mobile/src/testing/testids.ts)의
   `TESTID` 레지스트리입니다. Maestro 플로우(YAML)는 import를 못 하므로, 레지스트리의
   문자열이 곧 자동화 계약입니다 — 함부로 바꾸지 마세요.
3. **네이밍**: `{screen}.{section}.{element}`, kebab-case.
   엔티티별 요소는 팩토리 함수 — 예: `TESTID.todos.item(todo.id)` → `todos.item.<uuid>`.
4. **접근성 우선**: 모든 컨트롤은 `accessibilityRole` + 접근 가능한 이름
   (`accessibilityLabel` 또는 가시 텍스트)을 갖습니다. 아이콘 전용 버튼(`IconButton`)은
   `accessibilityLabel`이 **필수 prop**입니다. VoiceOver/TalkBack 이 읽을 수 있으면
   자동화 도구도 읽을 수 있습니다.

## 상태 신호 (기다림/검증에 사용)

| 신호                                        | 의미                         |
| ------------------------------------------- | ---------------------------- |
| `todos.loading` (progressbar)               | 초기 로딩 중                 |
| `todos.error` (alert) + `todos.error.retry` | 로드 실패 / 재시도 버튼      |
| `todos.empty`                               | 빈 목록                      |
| `todos.footer.loading`                      | 무한 스크롤 다음 페이지 로딩 |
| `offline.banner` (alert)                    | 오프라인 상태                |
| `boot.screen` → 사라짐                      | 부트 시퀀스 종료             |
| `maintenance.screen`                        | 점검 모드(kill switch) 활성  |
| `update.force.screen`                       | 강제 업데이트 게이트         |
| Button `accessibilityState.busy`            | mutation 진행 중             |

## testID 레지스트리 요약

전체 목록은 `apps/mobile/src/testing/testids.ts`가 소스 오브 트루스입니다. 주요 항목:

| 영역          | testID                                                                                                               |
| ------------- | -------------------------------------------------------------------------------------------------------------------- |
| 부트/광고     | `boot.screen`, `boot.ad.slot`, `boot.ad.skip`                                                                        |
| 점검/업데이트 | `maintenance.screen`/`.retry`, `update.force.screen`/`.store-button`, `update.prompt.*`                              |
| 탭            | `tabs.todos`, `tabs.settings`                                                                                        |
| Todos 생성    | `todos.create.input` / `.submit` (+ `todos.create.input.error`)                                                      |
| Todos 목록    | `todos.list`, `todos.item.<id>`, `todos.item.<id>.toggle`, `todos.item.<id>.delete`                                  |
| Todos 상태    | `todos.loading`, `todos.error`, `todos.error.retry`, `todos.empty`, `todos.footer.loading`                           |
| 필터          | `todos.filter.all` / `.open` / `.done`                                                                               |
| 설정          | `settings.locale.*`, `settings.theme.*`, `settings.design.*`, `settings.check-update`, `settings.design-system-link` |
| 배너          | `notice.banner`, `offline.banner`                                                                                    |
| 디자인 시스템 | `design-system.screen`, `design-system.section.<name>`, `ds.*`                                                       |

`TextField`는 에러 표시 시 자동으로 `` `${testID}.error` `` 요소를 추가합니다.

## E2E — Maestro (권장)

시나리오는 [`apps/mobile/e2e/`](../apps/mobile/e2e)에 YAML로 있습니다:

- `boot-and-create-todo.yaml` — 부트(광고 스킵) → 할 일 생성/토글
- `settings-theme-design.yaml` — 테마/디자인/언어 전환

실행 방법:

```bash
# 1. Maestro 설치 (1회)
curl -Ls https://get.maestro.mobile.dev | bash

# 2. 로컬 서버 + DB 기동
bun run db:setup && bun run dev:server

# 3. dev 빌드를 시뮬레이터/에뮬레이터에 설치하고 앱 기동
cd apps/mobile && bun run ios   # 또는 bun run android

# 4. 플로우 실행
maestro test apps/mobile/e2e/boot-and-create-todo.yaml
maestro test apps/mobile/e2e/    # 전체
```

Detox를 선호하면 같은 testID 레지스트리를 그대로 selector로 사용하면 됩니다 —
규약은 도구 중립적입니다.

## 새 요소를 추가할 때 체크리스트

1. `TESTID` 레지스트리에 항목 추가 (인라인 문자열 금지).
2. 인터랙티브 요소면 디자인 시스템 컴포넌트 사용 (testID 필수 prop이 강제됨).
3. 접근 가능한 이름 확인 — 아이콘 전용 버튼은 반드시 `accessibilityLabel`.
4. 비동기 상태가 있으면 위 표처럼 로딩/에러 신호 요소를 노출.
5. 이 문서의 요약 표를 갱신.
