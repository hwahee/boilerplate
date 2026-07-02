# UI 자동화 가이드 (E2E / 테스트 자동화 설계)

클라이언트의 **모든 요소는 UI 자동화가 가능하도록** 설계되어 있으며, 그 규약 전체를 이
문서 하나에서 확인할 수 있습니다.

## 원칙

1. **모든 인터랙티브 컴포넌트는 `testId`가 필수 prop**입니다
   (`Button`, `TextField`, `Select`, `Checkbox`). testId 없이 렌더링하면 타입 에러가 나므로
   자동화 불가능한 컨트롤이 애초에 만들어질 수 없습니다.
2. **testid 문자열은 인라인으로 쓰지 않습니다.** 유일한 출처는
   [`src/client/testing/testids.ts`](../src/client/testing/testids.ts)의 `TESTID` 레지스트리입니다.
   테스트 코드도 같은 레지스트리를 import해서 selector 오타·드리프트를 없앱니다.
3. **네이밍**: `{page}.{section}.{element}`, kebab-case.
   엔티티별 요소는 팩토리 함수 — 예: `TESTID.todos.item(todo.id)` → `todos.item.<uuid>`.
4. **ARIA 우선 선택**: 시맨틱이 있는 곳은 role/label 기반 selector
   (`getByRole('button', { name: … })`)를 우선 사용하고, testid는 안정적인 앵커/폴백으로
   사용하세요. 모든 컨트롤은 접근 가능한 이름(label, `aria-label`)을 갖습니다.

## 상태 신호 (기다림/검증에 사용)

| 신호                                | 의미                                        |
| ----------------------------------- | ------------------------------------------- |
| `role="status"` + 로딩 testid       | 초기 로딩 중 (`todos.loading`)              |
| `role="alert"` (`todos.error`)      | 로드 실패 — 재시도 버튼 `todos.error.retry` |
| `aria-busy="true"` (목록/버튼)      | 백그라운드 refetch / mutation 진행 중       |
| `aria-live="polite"` 페이지 표시    | 페이지네이션 상태 갱신                      |
| `aria-current="page"` (nav 링크)    | 활성 라우트                                 |
| `aria-invalid` + `aria-describedby` | 폼 필드 검증 오류                           |

## 전역 상태 전환 (테마/디자인/언어)

`<html>` 속성으로 관찰·제어 가능합니다:

- `data-theme="light|dark"` — 토글 버튼: `app.controls.theme-toggle`
- `data-design="a|b"` — 토글 버튼: `app.controls.design-toggle`
- `lang="en|ko"` — 셀렉트: `app.controls.locale-select`

셋 다 `localStorage`(`app.theme` / `app.design` / `app.locale`)에 저장되므로 테스트
셋업에서 미리 주입해 원하는 상태로 시작할 수 있습니다.

## testid 레지스트리 요약

전체 목록은 `src/client/testing/testids.ts`가 소스 오브 트루스입니다. 주요 항목:

| 영역          | testid                                                                                  |
| ------------- | --------------------------------------------------------------------------------------- |
| 앱 셸         | `app.header`, `app.nav.todos`, `app.nav.design-system`, `app.controls.*`                |
| Todos 생성    | `todos.create.form` / `.input` / `.submit` (+ `todos.create.input.error`)               |
| Todos 목록    | `todos.list`, `todos.item.<id>`, `todos.item.<id>.toggle`, `todos.item.<id>.delete`     |
| Todos 상태    | `todos.loading`, `todos.error`, `todos.error.retry`, `todos.empty`, `todos.total-count` |
| 필터/정렬     | `todos.filter.status`, `todos.sort.by`                                                  |
| 페이지네이션  | `todos.pagination` / `.prev` / `.next` / `.status`                                      |
| 디자인 시스템 | `design-system.page`, `design-system.section.<name>`, `ds.*` (쇼케이스 컴포넌트)        |
| NotFound      | `not-found.page`, `not-found.home-link`                                                 |

`TextField`는 에러 표시 시 자동으로 `` `${testId}.error` `` 요소를 추가합니다.

## Playwright 예시

```ts
import { TESTID } from '../src/client/testing/testids';

test('creates a todo', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId(TESTID.todos.createInput).fill('Write e2e tests');
  await page.getByTestId(TESTID.todos.createSubmit).click();
  await expect(page.getByTestId(TESTID.todos.list)).toContainText('Write e2e tests');
});

test('switches to high-visibility design', async ({ page }) => {
  await page.goto('/design-system');
  await page.getByTestId(TESTID.app.designToggle).click();
  await expect(page.locator('html')).toHaveAttribute('data-design', 'b');
});
```

## 새 요소를 추가할 때 체크리스트

1. `TESTID` 레지스트리에 항목 추가 (인라인 문자열 금지).
2. 인터랙티브 요소면 디자인 시스템 컴포넌트를 사용 (testId 필수 prop이 강제됨).
3. 접근 가능한 이름 확인 — 아이콘 전용 버튼은 반드시 `aria-label`.
4. 비동기 상태가 있으면 위 표의 ARIA 신호(`aria-busy` 등)로 노출.
5. 이 문서의 요약 표를 갱신.
