# 플랫폼 분기 결정 이력 (Platform Decisions)

지원 대상은 **애플 iPhone + 삼성 Galaxy 폰**뿐입니다(웹·태블릿·폴더블 대응 없음 —
지원 매트릭스는 README 참고). 그 안에서도 iOS/Android 분기는 다음 원칙을 따릅니다.

## 원칙

1. **기본은 통합.** 공통 컴포넌트 하나로 두 플랫폼을 커버할 수 있으면 통합한다.
   `Platform.select`/`Platform.OS`는 최후의 수단이며, 사용하는 경우 한 파일 안에
   국소화한다.
2. **애매하면 과감히 분리.** 플랫폼별 UX·API가 본질적으로 다른 영역은 코드 재사용을
   희생하더라도 `module.ios.ts` / `module.android.ts` 파일로 분리한다(Metro가 번들
   시점에 선택). 공유 타입은 `module.d.ts`에 선언해 소비자는 플랫폼을 모른다.
3. **분기에는 반드시 기록을 남긴다.**
   - 분리된 파일 상단 주석에 "왜 분리했는지"를 적는다.
   - 이 문서에 결정 항목을 추가한다(아래 표 + 상세).

새 분기를 만들 때 체크리스트:

- [ ] 통합 구현(공통 컴포넌트 + 국소 `Platform.select`)으로 해결되지 않는가?
- [ ] `*.ios.ts(x)` / `*.android.ts(x)` + `*.d.ts` 컨벤션을 따랐는가?
- [ ] 파일 주석 + 이 문서에 근거를 기록했는가?

## 결정 이력

| #   | 날짜    | 영역                 | 결정                                                   | 상태 |
| --- | ------- | -------------------- | ------------------------------------------------------ | ---- |
| 1   | 2026-07 | 스토어 업데이트 이동 | `store-update.ios.ts` / `store-update.android.ts` 분리 | 적용 |
| 2   | 2026-07 | 로컬 API 접속 주소   | 분리하지 않음 — `env.ts` 안 `Platform.select` 국소화   | 적용 |
| 3   | 2026-07 | 지원 기기 범위       | 웹/태블릿/폴더블 코드 전면 배제                        | 적용 |

### 1. 스토어 업데이트 이동 (`apps/mobile/src/version/store-update.*`)

- **문제**: "앱을 업데이트하러 스토어로 보내기"는 플랫폼마다 규칙이 다르다.
  iOS는 App Store 상품 URL을 여는 것이 유일한 경로. Android는 `market://` 딥링크가
  우선이고, 향후 Play In-App Update API(flexible/immediate)로 대체될 자리다.
- **결정**: 파일 분리. 인라인 `Platform.select`로 합치면 서로 무관한 두 스토어의
  규칙이 한 함수에 얽히고, Android의 in-app update 확장 자리가 사라진다.
- **비용**: `openStore` 시그니처가 두 벌. 감수한다 — 소비자는 `store-update.d.ts`
  타입 하나만 본다.

### 2. 로컬 API 접속 주소 (`apps/mobile/src/config/env.ts`)

- **문제**: 개발 중 iOS 시뮬레이터는 `localhost`, Android 에뮬레이터는 `10.0.2.2`로
  호스트에 접근한다.
- **결정**: 파일 분리하지 **않음**. 값 하나의 차이일 뿐 동작 차이가 아니므로
  `Platform.select` 한 줄을 `env.ts`에 국소화했다. 이 이상 번지면 그때 분리를
  재검토한다.

### 3. 지원 기기 범위

- **결정**: `app.config.ts`에 `platforms: ['ios','android']`, `supportsTablet: false`.
  웹 대응(react-native-web), 태블릿 레이아웃, 폴더블 힌지 대응 코드는 저장소에
  존재하지 않는다. 필요해지는 시점에 이 문서에 결정을 추가하고 시작한다.
