# 아이콘 시스템 — 스킨별 아이콘 라이브러리 추상화 기술 검토

스킨(`data-design`)을 바꾸는 것만으로 **아이콘 라이브러리까지 함께 바뀌는** 시스템을
설계하기 위한 기술 검토 문서입니다. 요구사항 분석 → 문제의 본질 → 계약 설계 → 대안 비교
→ 리스크 → 단계별 도입 계획 순으로 정리합니다.

> **요약(결론 먼저):** 이 저장소가 이미 두 번 푼 문제입니다.
> `@shared/validation`은 "라이브러리를 어댑터 뒤로 숨기고 ESLint로 직접 import를 금지"했고,
> `@shared/i18n`은 "동일 개념을 여러 백엔드(로케일)가 각자의 문자열로 표현하는 것"을
> `Record<Locale, Record<MessageKey, string>>` 전수 카탈로그로 풀었습니다.
> **아이콘은 정확히 이 둘의 교집합**입니다 — 어댑터 + 전수 카탈로그.
>
> 핵심 설계 3줄:
>
> 1. **의미론적 아이콘 이름**(`action.delete`)을 유일한 공개 어휘로 두고, 라이브러리 이름
>    (`Trash2`/`TrashIcon`/`Trash`/`delete`)은 어댑터 안에만 존재시킨다.
> 2. 스킨별 아이콘 세트를 `Record<IconName, IconRenderer>`로 강제해 **"이 라이브러리엔 그
>    아이콘이 없다"를 런타임 구멍이 아니라 컴파일 에러**로 만든다.
> 3. **크기·색은 JS prop이 아니라 CSS 토큰**으로 정규화한다 — 라이브러리마다 제각각인
>    사이징 API(`size` / `className` / `width·height` / 폰트 `font-size`)를 호출부에서 지운다.

---

## 1. 요구사항 정리

사용자 요청을 검토 가능한 항목으로 분해했습니다.

| #   | 요구                                                      | 설계 반영                                             |
| --- | --------------------------------------------------------- | ----------------------------------------------------- |
| R1  | 스킨마다 **다른 아이콘 라이브러리/패키지**를 고를 수 있음 | 스킨 → 아이콘 세트 매핑 테이블 (§5.4)                 |
| R2  | **스킨 전환만으로** 아이콘 모습이 바뀜 (호출부 코딩 0)    | 호출부는 `<Icon name="…" />` 하나 (§5.2)              |
| R3  | 라이브러리마다 **같은 아이콘의 이름이 다름**              | 의미론적 이름 레지스트리 + 세트별 어댑터 (§4.1, §5.1) |
| R4  | 라이브러리마다 **없는 아이콘이 있음**                     | 전수 `Record` 강제 + 3단 결손 정책 (§6)               |
| R5  | (암묵) 기존 스킨 시스템의 철학을 깨지 않을 것             | 토큰 기반 CSS 전환 + `<html>` 속성 관찰 가능 (§5.5)   |
| R6  | (암묵) 접근성·UI 자동화 규약 유지                         | `aria-hidden` 기본값, `data-icon` 앵커 (§8)           |

### 범위 밖 (명시적 비목표)

- **서버 데이터에서 온 동적 아이콘 이름**(예: DB의 카테고리별 아이콘). 지금 요구가 아니며,
  타입 안전성의 전제를 무너뜨립니다. 필요해지면 §6.4의 별도 경로로 처리합니다.
- **아이콘 자체를 디자인/제작**하는 일. 이 문서는 "고르고 갈아끼우는 배관"만 다룹니다.
- **테마(light/dark)별 아이콘 분기**. 색은 `currentColor`로 해결되므로 축을 늘릴 이유가
  없습니다 (§5.4에서 근거와 함께 기각).

---

## 2. 현재 상태 (as-is)

```
lucide-react  ──직접 import──▶  5개 파일 / 9개 호출부
```

| 파일                           | 아이콘                                  | 용도                                 |
| ------------------------------ | --------------------------------------- | ------------------------------------ |
| `ui/accordion.tsx`             | `ChevronDown`                           | 패널 확장 표시                       |
| `ui/palette.tsx`               | `ChevronDown`, `Check`, `TriangleAlert` | 드롭다운 트리거 / 선택됨 / 대비 경고 |
| `app.tsx`                      | `Moon`, `Sun`, `Palette`                | 테마 토글 / 스킨 토글                |
| `pages/todos-page.tsx`         | `Plus`, `Trash2`                        | 생성 / 삭제                          |
| `pages/design-system-page.tsx` | `Image`                                 | 데모 설명                            |

호출부는 전부 이런 모양입니다:

```tsx
<ChevronDown className="accordion__chevron" aria-hidden size="1.25em" />
```

여기서 **lucide에 종속된 것이 세 가지**입니다:

1. **심볼 이름** `ChevronDown` — 다른 라이브러리에선 `ChevronDownIcon`(heroicons),
   `CaretDown`(phosphor), `expand_more`(Material Symbols)입니다.
2. **사이징 API** `size="1.25em"` — lucide 고유입니다. heroicons는 `size` prop이 아예
   없고 `className`의 `w-*/h-*`로, Radix Icons는 `width`/`height`로, Material Symbols는
   `font-size`로 크기를 정합니다.
3. **import 경로** — 5개 파일에 흩어져 있어 교체 지점이 5곳입니다.

**진단:** 규모는 작지만(9곳) 결합은 세 겹입니다. 지금 손대는 비용이 가장 쌉니다.

### 2.1 이 저장소가 이미 가진 전례

새 패턴을 발명할 필요가 없습니다. 두 개의 선례를 그대로 합치면 됩니다.

| 선례                 | 해결한 문제                                 | 메커니즘                                              |
| -------------------- | ------------------------------------------- | ----------------------------------------------------- |
| `@shared/validation` | "zod를 yup으로 바꾸고 싶다"                 | `Validator<T>` 계약 + 어댑터 1파일 + ESLint 금지 규칙 |
| `@shared/i18n`       | "같은 개념을 로케일마다 다른 문자열로 표현" | `Record<Locale, Record<MessageKey, string>>` 전수 맵  |

아이콘 문제를 이 어휘로 번역하면 **정확히 일치**합니다:

```
MessageKey  ↔  IconName      (의미론적 키 — 공개 어휘)
Locale      ↔  Design(스킨)  (어떤 카탈로그를 쓸지 고르는 축)
catalogs    ↔  ICON_SETS     (Record<축, Record<키, 값>> — 전수 강제)
zod-adapter ↔  lucide-adapter (라이브러리 종속을 가두는 단 하나의 파일)
```

i18n에서 "ko 카탈로그에 키 하나가 빠지면 컴파일 에러"가 나는 것과 똑같이,
"kids 스킨의 아이콘 세트에 `action.delete`가 빠지면 컴파일 에러"가 나야 합니다.
**이것이 R4(없는 아이콘 문제)의 답입니다.**

---

## 3. 문제의 본질 — 왜 단순 재export로는 안 되는가

"`icons.ts`에서 몰아서 re-export하면 되지 않나?"가 첫 번째 유혹입니다.

```ts
// ❌ 겉보기 파사드 — R1/R4를 못 푼다
export { ChevronDown, Check, Trash2 } from 'lucide-react';
```

이건 import 경로만 한 곳으로 모을 뿐, **세트가 하나뿐**이라 스킨별 전환(R1)이 불가능하고,
"없는 아이콘"(R4)을 표현할 자리도 없습니다. 실제로 풀어야 할 비대칭은 네 가지입니다.

### 3.1 이름 비대칭 — 같은 그림, 다른 이름

| 의미      | lucide          | heroicons                 | phosphor    | Material Symbols | Bootstrap              |
| --------- | --------------- | ------------------------- | ----------- | ---------------- | ---------------------- |
| 삭제      | `Trash2`        | `TrashIcon`               | `Trash`     | `delete`         | `trash3`               |
| 경고      | `TriangleAlert` | `ExclamationTriangleIcon` | `Warning`   | `warning`        | `exclamation-triangle` |
| 아래 꺾쇠 | `ChevronDown`   | `ChevronDownIcon`         | `CaretDown` | `expand_more`    | `chevron-down`         |

여기서 중요한 관찰: **명명 철학 자체가 다릅니다.** lucide/bootstrap은 *생김새*로
(`chevron-down`), Material Symbols는 *기능*으로(`expand_more`), phosphor는 또 다른 도상
어휘로(`caret`) 부릅니다. 그래서 **기계적 이름 변환 규칙(camelCase↔kebab 등)은 원리적으로
불가능**합니다 — 사람이 한 번 적어주는 매핑 테이블 외에 답이 없습니다.

> 덤: 이름은 라이브러리 _내부에서도_ 불안정합니다. lucide는 `AlertTriangle`을
> `TriangleAlert`로 개명한 전적이 있습니다. 매핑 테이블은 라이브러리 간 이식성뿐 아니라
> **버전 업그레이드 충격 흡수**에도 값을 합니다.

### 3.2 API 비대칭 — 크기·두께·색을 정하는 방법이 다름

| 라이브러리             | 크기             | 두께/변형                                           | 색             | 그리드      |
| ---------------------- | ---------------- | --------------------------------------------------- | -------------- | ----------- |
| lucide-react           | `size` prop      | `strokeWidth`                                       | `currentColor` | 24px        |
| @heroicons/react       | className (w/h)  | 경로가 다름 (`/24/outline`,`/24/solid`,`/16/solid`) | `currentColor` | 24/20/16    |
| @phosphor-icons/react  | `size` prop      | `weight`(thin…fill, duotone)                        | `color` prop   | 256 viewBox |
| @radix-ui/react-icons  | `width`/`height` | 없음 (단일 스타일)                                  | `currentColor` | 15px        |
| @tabler/icons-react    | `size`           | `stroke`                                            | `currentColor` | 24px        |
| Material Symbols(폰트) | `font-size`      | 가변축 `FILL,wght,GRAD,opsz`                        | `color`        | 24px        |

호출부가 `size="1em"`을 계속 쓰면, heroicons·Radix로 바꾸는 순간 **그 prop이 무시되어
아이콘이 제멋대로 커집니다**. → 사이징을 JS prop에서 CSS로 옮기는 것이 §5.3의 핵심입니다.

### 3.3 커버리지 비대칭 — 없는 아이콘

lucide ~1,600종, phosphor ~1,500종(×6 weight), Radix Icons ~300종. Radix처럼 작은 세트를
고르면 결손은 *예외가 아니라 일상*입니다. "없으면 조용히 다른 걸로 대체"는 최악입니다 —
쓰레기통 대신 X표가 나오는 걸 아무도 모른 채 배포됩니다.

### 3.4 시각 비대칭 — 정렬·광학 무게

24px 그리드 아이콘과 15px 그리드 아이콘을 똑같이 `1em`으로 늘리면 **선 굵기 체감이
달라집니다**(15px 그리드가 더 굵고 뭉툭해 보임). 세트별 미세 보정(scale) 여지가 필요합니다.

---

## 4. 설계 원칙

### 4.1 이름은 역할로, 슬롯 개수는 글리프로 결정한다

**두 개의 결정을 분리해야 합니다.** 이 둘을 뭉뚱그려 "역할로 명명한다"고만 쓰면 _"같은
기능인데 생김새를 다르게 하고 싶다"_ 가 금지되는 것처럼 읽힙니다. 금지되지 않습니다.

| 결정                              | 무엇이 정하는가                                                 |
| --------------------------------- | --------------------------------------------------------------- |
| 이름을 무엇으로 짓는가 (naming)   | **역할** — `action.delete`(○), `Trash2`·`trash-can`(×)          |
| 슬롯을 몇 개 둘 것인가 (identity) | **글리프** — 한 스킨에서라도 다른 그림이어야 하면 슬롯을 나눈다 |

`IconName`은 아이콘의 *설명*이 아니라 *주소*입니다. 주소가 둘이라고 해서 기능이 둘이어야
할 이유는 없습니다.

#### 같은 기능, 다른 생김새 → 슬롯 두 개

| 화면                    | 기능 | 원하는 글리프 | 슬롯            |
| ----------------------- | ---- | ------------- | --------------- |
| 목록 행의 삭제 버튼     | 제거 | 휴지통        | `action.delete` |
| 태그 칩의 제거 어피던스 | 제거 | ×             | `chip.remove`   |
| 다이얼로그 닫기         | 닫기 | ×             | `overlay.close` |

`chip.remove`와 `overlay.close`는 네 스킨 전부에서 같은 그림일 수도 있습니다 — 그래도
슬롯은 둘입니다. 어느 스킨이 칩의 ×만 더 작고 둥근 것으로 바꾸고 싶어질 때, 슬롯이 하나면
그 스킨은 다이얼로그 닫기 버튼까지 같이 바뀝니다.

#### 이름에 맥락은 넣되, 생김새는 넣지 않는다

`chip.remove`는 역할 이름입니다(어디서·무엇을). `chip.x`는 아닙니다 — office 스킨이 ×가
아닌 다른 그림을 쓰는 순간 거짓말이 됩니다. **생김새를 이름에서 배제하는 이유(§3.1)와
슬롯을 나누는 기준은 서로 무관한 문제**이며, 전자가 후자를 제약하지 않습니다.

부수 효과로, 역할 이름은 i18n의 `MessageKey`가 문자열 내용이 아니라 용처로 명명된 것과
같은 원리로 §3.1의 명명 철학 차이가 호출부로 새어나오는 것을 막습니다.

#### 쪼개는 기준

> **"어떤 스킨에서든, 어떤 화면에서든, 이 두 자리가 서로 다른 그림이어야 할 수 있는가?"**

그렇다면 지금 쪼갭니다. 아니라면 한 슬롯으로 두고 필요해질 때 쪼갭니다 — 나중에 쪼개는
비용은 호출부 한 줄과 스킨 수만큼의 표 항목이라 싸고, 되돌리기도 쉽습니다.

이 문서가 `disclosure.expand`와 `disclosure.dropdown`을 나눠둔 것이 바로 이 기준의
적용입니다: 둘 다 "펼친다"는 **같은 기능**인데, office 스킨에서 콤보박스 화살표(▼)와 그룹
확장 표시(＋/－)가 다른 글리프이기 때문입니다.

### 4.2 라이브러리 종속은 정확히 한 디렉터리에 가둔다

`src/client/ui/icon/adapters/*` 밖에서 `lucide-react`를 import하면 ESLint 에러.
`zod`를 `src/shared/validation` 밖에서 금지한 규칙과 **문자 그대로 같은 메커니즘**입니다.
파사드가 규율이 아니라 *강제*가 되는 지점이 여기입니다.

### 4.3 결손은 침묵하지 않는다

타입 시스템이 "이 스킨에서 이 아이콘을 어떻게 할 것인가"를 **반드시 답하게** 만듭니다.
답의 종류는 여러 개여도 되지만(§6), *답하지 않는 것*은 선택지가 아닙니다.

### 4.4 크기·색의 권한은 스킨(CSS 토큰)에 둔다

기존 토큰 시스템의 원칙 그대로입니다 — README의 표현을 빌리면 _"컴포넌트는 시맨틱
토큰만 소비하고, 그것이 `<html>` 속성 하나로 전환이 가능한 이유"_ 입니다. 아이콘도 예외를
두지 않습니다.

### 4.5 (유보) 글리프 층을 따로 둘 것인가

§4.1을 따르면 슬롯이 늘고, 슬롯이 늘면 **같은 그림을 여러 슬롯에 반복 기술**하게 됩니다
(`chip.remove`와 `overlay.close`가 네 스킨 모두에서 같은 ×라면 표에 8칸). 이때 떠오르는
것이 2층 구조입니다.

```ts
interface IconSet {
  glyphs: Record<GlyphName, IconRenderer>; // 이 라이브러리가 그릴 수 있는 형태
  roles: Record<IconName, GlyphName>; // 이 스킨이 역할에 배정한 형태
}
```

장점은 셋입니다. (1) 중복 제거, (2) _"이 두 슬롯은 항상 같은 그림이어야 한다"_ 는 제약을
표현할 수 있음, (3) 역할이 아니라 형태를 정말로 지정해야 하는 예외의 탈출구.

**그럼에도 지금은 1층을 권고합니다.** 근거는 이 저장소의 색 토큰입니다. README는 토큰이
3계층이라고 말하지만 **색만 보면 사실상 1층**입니다 — `tokens.css`에 공유 원시 팔레트
(`--indigo-500` 류)는 없고, `--color-primary: #5b5bd6`이 `[data-design][data-theme]` 조합
**마다 직접** 적혀 있습니다. 8개 블록에 같은 값이 반복되는 것을 감수하고 층을 하나 줄인
선택입니다. 아이콘도 같은 저울입니다: 슬롯 10여 개 · 스킨 4개 규모에서 층을 더 얹을 값이
아직 없습니다.

**승격 신호:** 역할 표에서 같은 글리프 지정이 반복되기 시작할 때(대략 슬롯 30개 이상,
또는 _"이 둘은 항상 같아야 한다"_ 를 주석으로 쓰기 시작할 때). 이 승격은 **호출부를 건드리지
않습니다** — `<Icon name="action.delete" />`는 그대로이고 세트 내부 구조만 바뀝니다.
§7에서 Iconify·CSS mask를 "나중에 꽂을 수 있는 선택지"로 남겨둔 것과 같은 성격의 유보입니다.

**2층의 대가도 미리 적어둡니다:** `GlyphName`이 라이브러리 공용 어휘가 되는 순간 §3.1의
이름 문제가 한 층 아래에서 재현됩니다 — lucide에는 `caret-down`이 없고 phosphor에는
`chevron-down`이 없습니다. 그때의 답은 §6과 같습니다. 두 글리프 이름이 한 렌더러를 가리키게
두고, "이 라이브러리는 이 구분을 갖지 않는다"를 표에 명시적으로 남기는 것입니다.

---

## 5. 권고 설계 (Option A)

### 5.1 계약 — `src/client/ui/icon/contract.ts`

```ts
/**
 * Icon facade — public contract.
 *
 * Consumers name icons by ROLE (`action.delete`), never by a library's own
 * symbol name. Which library draws that role is decided per skin in
 * ./registry.ts; the libraries themselves are confined to ./adapters/*.
 */
export const ICON_NAMES = [
  'action.create', // Plus
  'action.delete', // Trash2
  'status.selected', // Check
  'status.warning', // TriangleAlert
  'disclosure.expand', // accordion chevron
  'disclosure.dropdown', // combobox/popover trigger caret  ← 4.1에 따라 분리
  'theme.light', // Sun
  'theme.dark', // Moon
  'skin.switch', // Palette
  'media.image', // Image
] as const;

export type IconName = (typeof ICON_NAMES)[number];

export interface IconRenderProps {
  /** Set-declared default weight/variant is applied by the adapter, not here. */
  readonly className?: string;
}

/** What an adapter must produce for one icon. */
export type IconRenderer = (props: IconRenderProps) => ReactElement;

export interface IconSet {
  /** Stable id, surfaced as `<html data-icon-set>` for UI automation. */
  readonly id: string;
  /** Exhaustive by construction — a missing key is a compile error. */
  readonly icons: Readonly<Record<IconName, IconRenderer>>;
  /** Optical compensation for a different source grid (§3.4). Default 1. */
  readonly scale?: number;
}
```

`Record<IconName, IconRenderer>`가 전부입니다. **`Partial`이 아니라는 점이 이 설계의
전체 무게를 지탱합니다** — R4가 여기서 끝납니다.

### 5.2 호출부 — 이것이 전부

```tsx
// before
<ChevronDown className="accordion__chevron" aria-hidden size="1.25em" />

// after
<Icon name="disclosure.expand" className="accordion__chevron" size="lg" />
```

- `aria-hidden`은 **기본값**입니다. 의미를 가진 아이콘만 `label="삭제"`로 옵트인하며,
  그때만 `role="img" aria-label=…`가 붙습니다. (지금은 9곳 전부가 손으로
  `aria-hidden`을 적고 있습니다 — 하나라도 빠뜨리면 스크린리더가 SVG 제목을 읽습니다.)
- `size`는 `'sm' | 'md' | 'lg'` 토큰 이름입니다. `1.25em` 같은 **하드코딩된 치수가
  호출부에서 사라지는 것**이 §3.2 문제의 해소입니다.

### 5.3 렌더러 — `src/client/ui/icon/icon.tsx`

```tsx
export function Icon({ name, size = 'md', className, label }: IconProps) {
  const { design } = useTheme();
  const set = ICON_SET_BY_DESIGN[design];
  const render = set.icons[name];
  return (
    <span
      className={['icon', className].filter(Boolean).join(' ')}
      data-icon={name} // UI 자동화 앵커 — 스킨과 무관하게 "무슨 아이콘인지" 단언 가능
      data-icon-size={size}
      style={set.scale ? { '--icon-scale': set.scale } : undefined}
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
    >
      {render({ className: 'icon__glyph' })}
    </span>
  );
}
```

동반 CSS — **라이브러리별 사이징 API 차이를 여기서 무력화합니다**:

```css
.icon {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  inline-size: calc(var(--icon-size-md) * var(--icon-scale, 1));
  block-size: calc(var(--icon-size-md) * var(--icon-scale, 1));
  color: inherit; /* 모든 세트는 currentColor로 그린다 */
}
.icon[data-icon-size='sm'] {
  inline-size: calc(var(--icon-size-sm) * var(--icon-scale, 1)); /* … */
}
.icon[data-icon-size='lg'] {
  /* … */
}

/* 라이브러리가 무엇을 반환하든 상자에 맞춘다 — size prop이 없어도, 있어도 무관 */
.icon > svg,
.icon > .icon__glyph {
  inline-size: 100%;
  block-size: 100%;
  display: block;
}
```

그리고 스킨은 `tokens.css`에서 아이콘 스케일에 대한 권한을 갖습니다:

```css
[data-design='a'] {
  --icon-size-sm: 0.875em;
  --icon-size-md: 1em;
  --icon-size-lg: 1.25em;
}
[data-design='b'] {
  --icon-size-sm: 1em;
  --icon-size-md: 1.15em;
  --icon-size-lg: 1.4em;
} /* 시인성 */
[data-design='office'] {
  --icon-size-sm: 0.8em;
  --icon-size-md: 0.9em;
  --icon-size-lg: 1em;
} /* 조밀 */
[data-design='kids'] {
  --icon-size-sm: 1em;
  --icon-size-md: 1.25em;
  --icon-size-lg: 1.6em;
} /* 큼직 */
```

**이 표가 "코딩 없이 스킨만 바꿔서 아이콘 모습이 바뀐다"(R2)의 절반**입니다. 나머지 절반이
아래의 세트 매핑입니다.

### 5.4 어댑터와 스킨 매핑

```ts
// adapters/lucide.ts — 저장소에서 'lucide-react'를 import할 수 있는 유일한 부류의 파일
import { Check, ChevronDown, Image, Moon, Plus, Sun, Palette, Trash2, TriangleAlert }
  from 'lucide-react';
const L = (C: LucideIcon, props?: Partial<LucideProps>): IconRenderer =>
  (p) => <C {...p} {...props} aria-hidden />;

export const lucideSet: IconSet = {
  id: 'lucide',
  icons: {
    'action.create': L(Plus),
    'action.delete': L(Trash2),
    'status.selected': L(Check),
    'status.warning': L(TriangleAlert),
    'disclosure.expand': L(ChevronDown),
    'disclosure.dropdown': L(ChevronDown),
    'theme.light': L(Sun),
    'theme.dark': L(Moon),
    'skin.switch': L(Palette),
    'media.image': L(Image),
  },
};
```

세트는 **합성(composition)이 자연스럽습니다** — 한 아이콘만 갈아끼우는 스킨은 스프레드로:

```ts
export const kidsSet: IconSet = {
  id: 'phosphor-duotone',
  icons: {
    ...phosphorSet({ weight: 'duotone' }).icons,
    'skin.switch': fromLocal(CrayonSvg), // 이 스킨만 손그림 아이콘을 쓰고 싶다
  },
};
```

스킨 매핑은 한 파일, 한 테이블입니다:

```ts
// registry.ts
export const ICON_SET_BY_DESIGN: Record<Design, IconSet> = {
  a: lucideSet, // 심미: 얇은 스트로크
  b: heroiconsSolid, // 시인성: 꽉 찬 솔리드가 원거리 판독에 유리
  office: fluentSet, // 2000년대 오피스: 조밀한 16px 그리드 + 채워진 글리프
  kids: kidsSet, // 놀이터: duotone/fill, 둥글고 두꺼움
};
```

> **왜 `Design`만 축으로 쓰고 `theme`(light/dark)은 안 쓰는가:** 모든 세트가
> `currentColor`로 그리므로 명암은 색 토큰이 이미 해결합니다. 다크에서만 다른 글리프를
> 쓸 실제 사례가 없습니다. 필요해지면 `Record<`Design`, …>`를
> ``Record<`${Design}:${Theme}`, …>``로 바꾸는 **한 줄 변경**이며, 그 전까지 카탈로그
> 개수를 4개에서 8개로 늘리는 비용(= 사람이 채워야 할 칸이 2배)을 지불할 이유가 없습니다.

**스킨별 라이브러리 추천 (구체안):**

| 스킨     | 성격                     | 후보                                          | 라이선스 |
| -------- | ------------------------ | --------------------------------------------- | -------- |
| `a`      | 심미 우선, 얇은 선       | **lucide** (현행 유지)                        | ISC      |
| `b`      | 시인성 우선, 고대비      | **heroicons `24/solid`** 또는 phosphor `bold` | MIT      |
| `office` | 2000년대 MS Office 밀도  | **Fluent UI System Icons** (`filled` 16/20)   | MIT      |
| `kids`   | 둥글고 통통, 과장된 모션 | **phosphor `duotone`/`fill`** 또는 Iconoir    | MIT      |

라이선스는 전부 상용 사용 가능한 허용형입니다. 다만 **Font Awesome Free는 CC BY 4.0으로
저작자 표시 의무**가 있어 보일러플레이트 기본값으로는 권하지 않습니다 (§9).

### 5.5 관찰 가능성

`<html>`에 `data-icon-set`을 함께 노출합니다 (`data-theme`/`data-design` 옆). 그러면
`docs/ui-automation.md`의 "전역 상태 전환" 표에 한 줄이 추가되고, E2E는 스킨 전환이
아이콘 세트까지 갈아치웠는지를 **관찰 가능한 사실**로 단언할 수 있습니다.

---

## 6. 결손 정책 — "이 라이브러리엔 그 아이콘이 없다"

`Record<IconName, IconRenderer>` 전수 강제 덕분에, 개발자는 **반드시 셋 중 하나로
답해야 합니다.** 침묵은 컴파일 에러입니다.

### 6.1 1단계 — 이름만 다르다 (대부분)

매핑 테이블이 곧 답입니다. 추가 비용 0.
`'action.delete': P(Trash)` / `'action.delete': H(TrashIcon)`.

### 6.2 2단계 — 근사 대체가 가능하다

같은 세트 안의 다른 글리프로 **명시적으로** 대체하고, 사유를 주석으로 남깁니다.

```ts
// Radix has no dedicated palette glyph; the color-wheel reads the same here.
'skin.switch': R(ColorWheelIcon),
```

핵심은 *명시성*입니다. 리뷰어가 diff에서 대체 사실과 근거를 봅니다.

### 6.3 3단계 — 정말 없다 → 지역 SVG 또는 차용

```ts
'skin.switch': fromLocal(PaletteGlyph),   // src/client/ui/icon/local/palette.tsx
'skin.switch': fromLucide(Palette),       // 다른 세트에서 차용 (혼재는 감수)
```

`fromLocal`은 24px 그리드 인라인 SVG 한 조각이면 됩니다. 이 탈출구가 있어야
**"커버리지가 작은 라이브러리도 스킨으로 채택 가능"** 해집니다 — 없으면 Radix Icons
같은 선택지는 처음부터 배제됩니다.

### 6.4 (비목표) 동적 이름

서버 데이터가 아이콘 이름을 주는 날이 오면, `Icon`의 `name: IconName` 계약을 흔들지 말고
경계에서 정규화하는 별도 함수를 둡니다:

```ts
function resolveIconName(raw: string): IconName | null; // 미지의 값은 null → 호출부가 결정
```

`@shared/i18n`이 미지의 키에 대해 기본 로케일로 폴백하는 것과 같은 층위의 결정입니다.

---

## 7. 대안 비교

### Option B — Iconify (`@iconify/react`)

문자열 하나로 200,000+ 아이콘을 부르는 통합 API입니다. `<Icon icon="lucide:trash-2" />`,
`<Icon icon="ph:trash-duotone" />` 처럼 **접두사만 바꾸면 라이브러리가 바뀝니다.**

| 장점                                      | 단점                                                                  |
| ----------------------------------------- | --------------------------------------------------------------------- |
| 라이브러리별 어댑터 코드가 사실상 불필요  | **기본 동작이 런타임 CDN fetch** — 오프라인/사설망/CSP 환경에서 위험  |
| 커버리지가 압도적 → §6.3 상황이 거의 없음 | 오프라인 번들링은 `@iconify/json` + 빌드 플러그인이 추가로 필요       |
| 세트 추가가 문자열 접두사 한 개           | Bun 번들러 기준 별도 툴링 검증 필요 (이 저장소는 번들러 플러그인 0개) |
| 크기/색 API가 세트 무관하게 통일됨        | **§3.1의 이름 매핑은 여전히 필요** — 문제를 옮길 뿐 없애지 못함       |

**판정: 기본안으로는 기각, 탈출구로는 채택.** 결정적 이유는 두 가지입니다.
(1) 이 보일러플레이트는 *"외부 패키지 없이 Bun 내장 기능"*을 반복적으로 선택해 온
저장소(DB 드라이버, Redis, 번들러)이며, 런타임 네트워크 의존은 그 철학과 정면 충돌합니다.
(2) Iconify를 쓰더라도 `IconName → 'ph:trash-duotone'` 매핑 테이블은 그대로 필요합니다 —
즉 **Option A의 레지스트리는 Iconify 도입 여부와 무관하게 필요하고**, Iconify는 §5.4의
어댑터 자리에 세트 하나로 꽂히면 그만입니다. Option A는 Option B를 배제하지 않습니다.

### Option C — CSS `mask-image` (JS 0줄)

```css
.icon[data-icon='action.delete'] {
  mask-image: var(--icon-action-delete);
}
[data-design='kids'] {
  --icon-action-delete: url('data:image/svg+xml,…');
}
.icon {
  background-color: currentColor;
}
```

| 장점                                                  | 단점                                                                  |
| ----------------------------------------------------- | --------------------------------------------------------------------- |
| **스킨 전환이 순수 CSS** — 기존 토큰 철학과 가장 일치 | 스프라이트/데이터URI 생성 빌드 스텝이 필요 (현재 빌드는 스크립트 1개) |
| 런타임 JS·리렌더 0                                    | 트리셰이킹 불가 — 4세트 전부가 CSS에 상주                             |
| 세트별 두께/변형이 그냥 다른 URL                      | `role="img"`/`aria-label` 같은 a11y를 span에 수동으로 붙여야 함       |
|                                                       | prop(두께·변형)을 아이콘별로 줄 수 없음                               |

**판정: 기각하되 기록해 둘 가치 있음.** 아이콘 수가 수백 개로 늘고 JS 번들이 문제가 되는
날, 이 방식이 정답이 될 수 있습니다. **중요한 것은 Option A의 계약이 바뀌지 않는다는 점**
입니다 — `IconRenderer`가 `<span className="icon__glyph" style={{maskImage:…}}/>`를
반환하는 세트를 하나 추가하면 호출부는 한 글자도 안 바뀝니다. 즉 A는 C로 가는 길을
막지 않습니다.

### Option D — 현행 유지 + 스킨별 CSS로 아이콘 변형만 조정

`[data-design='kids'] .icon { stroke-width: 3 }` 같은 접근. 두께·크기는 되지만
**글리프 자체(라이브러리)는 못 바꿉니다.** R1 미충족 → 기각.

### 종합

| 기준                 | A (어댑터 레지스트리) | B (Iconify)    | C (CSS mask)   | D (현행+CSS) |
| -------------------- | --------------------- | -------------- | -------------- | ------------ |
| R1 스킨별 라이브러리 | ✅                    | ✅             | ✅             | ❌           |
| R2 호출부 무변경     | ✅                    | ✅             | ✅             | ✅           |
| R3 이름 비대칭       | ✅ 매핑               | ⚠️ 매핑 여전   | ✅ 매핑        | —            |
| R4 결손 컴파일 검출  | ✅                    | ❌ 런타임      | ❌ 런타임      | —            |
| 신규 런타임 의존     | 없음                  | 있음(네트워크) | 없음           | 없음         |
| 신규 빌드 툴링       | 없음                  | 필요           | 필요           | 없음         |
| 저장소 철학 정합     | ✅ (validation 전례)  | ⚠️             | ✅ (토큰 전례) | —            |

**→ Option A 권고.** B와 C는 A의 어댑터 자리에 나중에 꽂을 수 있는 *구현 선택지*로 남습니다.

---

## 8. 접근성 · UI 자동화

| 항목             | 규칙                                                                       |
| ---------------- | -------------------------------------------------------------------------- |
| 장식 아이콘      | **기본값** `aria-hidden="true"` — 옵트인 실수 방지 (현재는 9곳 수동 기재)  |
| 의미 있는 아이콘 | `label` prop → `role="img" aria-label={label}`, 문자열은 i18n 카탈로그에서 |
| 아이콘 전용 버튼 | 버튼 쪽 `aria-label`이 이름을 담당하고 아이콘은 장식 — **현행 유지**       |
| 자동화 앵커      | `data-icon="{name}"` — 스킨 무관하게 "어떤 아이콘인지" 단언 가능           |
| 세트 관찰        | `<html data-icon-set="lucide">` — `docs/ui-automation.md` 표에 1행 추가    |

`testId`는 **필요 없습니다**. 아이콘은 인터랙티브 요소가 아니며, 규약상 testId는
인터랙티브 컴포넌트의 필수 prop입니다. `data-icon`은 그와 별개의 시맨틱 앵커입니다.

---

## 9. 리스크와 완화

| 리스크                                   | 영향                                    | 완화                                                                                                                           |
| ---------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| 4개 세트가 전부 번들에 상주              | 번들 증가                               | 아이콘 10종 × 4세트 ≈ 수십 KB로 무시 가능. **레지스트리가 40종을 넘으면** 세트별 동적 `import()` + Suspense로 전환 (계약 불변) |
| 배럴 import 실수 (`import * as Icons`)   | 라이브러리 전체가 번들에 유입           | 어댑터 파일만 named import 허용 + `bun run build` 산출물 크기 회귀 감시                                                        |
| 폰트 기반 세트(Material Symbols) 채택 시 | 폰트 로드 전 ligature 텍스트 노출(FOUT) | `font-display: block` + preload, 또는 SVG 패키지 사용 권장                                                                     |
| 라이브러리 간 광학 무게 불일치           | 스킨 품질 저하                          | `IconSet.scale`로 세트별 보정 (§3.4)                                                                                           |
| 아이콘 라이선스 (특히 Font Awesome Free) | 저작자 표시 의무                        | 허용형(MIT/ISC/Apache-2.0) 세트만 채택, §5.4 표를 기준으로                                                                     |
| 라이브러리 버전업 시 심볼 개명           | 빌드 실패                               | **이것이 오히려 이득** — 어댑터 1파일에서만 터지고, 호출부 9곳은 무사                                                          |
| 레지스트리 비대화 (아이콘 200종 × 4세트) | 유지보수 부담                           | 세트 합성(스프레드)으로 기본 세트 + 차이만 기술 (§5.4)                                                                         |

---

## 10. 테스트 전략

이 저장소의 클라이언트 테스트는 **DOM 없이 순수 함수만** 검증합니다
(`ui/popover-position.test.ts`가 유일). 이 제약을 지키는 선에서:

```ts
// src/client/ui/icon/icon.test.ts — 렌더링 없이도 계약 전부를 검증할 수 있다
describe('icon registry', () => {
  test('모든 스킨이 모든 아이콘 이름을 커버한다', () => {
    for (const set of Object.values(ICON_SET_BY_DESIGN)) {
      expect(Object.keys(set.icons).sort()).toEqual([...ICON_NAMES].sort());
      for (const name of ICON_NAMES) expect(typeof set.icons[name]).toBe('function');
    }
  });
  test('모든 Design 값에 세트가 배정되어 있다', () => {
    /* … */
  });
  test('세트 id가 유일하다', () => {
    /* data-icon-set 관찰값의 전제 */
  });
});
```

타입이 이미 보장하는 것을 런타임에서 한 번 더 확인하는 이유는 `as`/`any` 우회에 대한
방어벽이며, `@shared/i18n`의 카탈로그 테스트와 같은 성격입니다.

**시각 검증은 `/design-system` 페이지**에 아이콘 갤러리 섹션을 추가해 담당합니다 —
현재 스킨의 전 아이콘을 이름과 함께 한 화면에 나열하면, 스킨 토글 버튼을 4번 눌러
결손·정렬·광학 무게를 즉시 눈으로 확인할 수 있습니다. 이 페이지의 기존 역할과 정확히
같은 방식입니다.

---

## 11. 도입 계획

| 단계  | 내용                                                                                              | 산출물/검증                              | 규모   |
| ----- | ------------------------------------------------------------------------------------------------- | ---------------------------------------- | ------ |
| **0** | 계약 + lucide 어댑터 + `Icon` + CSS 토큰 + 호출부 9곳 치환 + ESLint 금지 규칙 + 레지스트리 테스트 | **시각적 변화 0** — `bun run check` 통과 | 반나절 |
| **1** | 두 번째 세트 1개(예: kids ← phosphor duotone) + `/design-system` 아이콘 갤러리                    | 스킨 토글로 아이콘이 바뀌는 것을 눈으로  | 2시간  |
| **2** | 나머지 스킨 세트(b, office) 채택 + `<html data-icon-set>` 노출                                    | ui-automation 문서 1행 추가              | 2시간  |
| **3** | README "디자인 시스템" 항목 갱신 + 이 문서 링크                                                   | 문서 정합                                | 30분   |

**단계 0을 시각적 변화 0으로 잡은 것이 의도적입니다.** 배관 교체와 디자인 변경을 같은
커밋에 섞으면 리뷰가 불가능해집니다. 0이 끝난 시점에 `git diff`는 "lucide 직접 호출 9개가
`Icon`으로 바뀌었고 그 결과 픽셀이 동일하다"만 말해야 합니다.

### 함께 손대야 할 파일

```
신규  src/client/ui/icon/{contract,icon,registry}.ts(x)
      src/client/ui/icon/adapters/{lucide,phosphor,…}.tsx
      src/client/ui/icon/icon.test.ts
수정  src/client/{app.tsx,pages/*.tsx,ui/{accordion,palette}.tsx}   ← 9개 호출부
      src/client/styles/tokens.css   ← --icon-size-* (스킨 4개 블록)
      src/client/styles/main.css     ← .icon 규칙
      eslint.config.js               ← 아이콘 라이브러리 direct import 금지 블록
      docs/ui-automation.md          ← data-icon / data-icon-set
      README.md                      ← 디자인 시스템 항목 + 이 문서 링크
```

ESLint 규칙은 zod 블록과 `ignores`가 달라 **별도 블록**이 필요합니다:

```js
// Facade: icon libraries are an implementation detail of src/client/ui/icon.
{
  files: ['src/**/*.{ts,tsx}'],
  ignores: ['src/client/ui/icon/**'],
  rules: { 'no-restricted-imports': ['error', { paths: [
    { name: 'lucide-react', message: 'Import { Icon } from @client/ui/icon instead.' },
    // 세트를 추가할 때 여기에 한 줄씩 늘어난다
  ]}]},
}
```

---

## 12. 결론

- **권고: Option A** — 의미론적 이름 레지스트리 + 스킨별 전수 어댑터 맵 + CSS 토큰 사이징.
- 요구사항 대응: R1 §5.4 / R2 §5.2 · §5.3 / R3 §4.1 · §5.4 / R4 §6 / R5 §5.3 / R6 §8.
- **새 런타임 의존성이 없고**, 새 빌드 툴링이 없으며, 이 저장소가 이미 두 번 검증한
  패턴(validation 파사드 + i18n 카탈로그)의 재사용입니다.
- Iconify(B)와 CSS mask(C)는 **폐기되는 것이 아니라, 같은 계약 뒤에 언제든 꽂을 수 있는
  구현 선택지**로 남습니다. 이것이 A를 고르는 가장 실질적인 이유입니다 — 되돌릴 수 있는
  결정이기 때문입니다.
- 지금 착수 비용이 가장 쌉니다. 호출부가 9곳일 때와 90곳일 때의 차이는 한 자릿수입니다.
