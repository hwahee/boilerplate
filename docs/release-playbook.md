# 릴리즈 플레이북 (OTA / 스토어 / 강제 업데이트)

모바일 릴리즈의 모든 판단과 절차를 이 문서에서 다룹니다.

## 핵심 개념: runtimeVersion

**OTA(무선) 업데이트는 같은 네이티브 runtimeVersion 안에서만 안전합니다.**
JS 번들은 네이티브 바이너리가 노출하는 모듈/뷰에 의존하므로, 네이티브가 달라진
바이너리에 다른 세대의 JS를 얹으면 크래시합니다. expo-updates는 runtimeVersion이
일치하는 업데이트만 적용하므로 이 사고는 **구조적으로** 차단됩니다.

이 저장소의 정책은 `runtimeVersion: { policy: 'appVersion' }` (app.config.ts):
**스토어 릴리즈(버전 범프) 하나 = OTA 호환 그룹 하나.** 단순하고 안전하며,
"이 바이너리에 이 OTA가 가도 되나?"를 고민할 필요가 없습니다.

## 판단 체크리스트: 이 변경은 어떤 경로로 나가는가?

```
변경 사항에 다음이 하나라도 포함되는가?
  - 네이티브 모듈/라이브러리 추가·제거·업그레이드 (신규 pod/gradle 의존성)
  - app.config.ts 의 네이티브 반영 항목 변경
    (권한, scheme, intentFilters/associatedDomains, 아이콘/스플래시,
     plugins, newArchEnabled, SDK 업그레이드 …)
  - Expo SDK / React Native 버전 업
  ├─ 예 → ❷ 스토어 배포 (버전 범프 필수)
  └─ 아니오 (JS/TS·에셋·번들 내 리소스만 변경)
      → ❶ OTA 업데이트 가능

이 변경이 없으면 구버전 앱이 오동작하거나 보안 문제가 있는가?
  (API 계약 파괴, 심각한 버그, 보안 패치, 법적 요구)
  ├─ 예 → ❸ 강제 업데이트 (minSupportedVersion 인상)
  └─ 아니오 → 선택 업데이트로 충분 (스킵 허용)
```

확신이 없으면 스토어 배포를 선택하세요. OTA는 좁은 지름길이고, 잘못 태우면
크래시 루프입니다.

## ❶ OTA 업데이트 (JS만 변경)

1. `main`에 변경 머지 → CI 그린 확인.
2. 번들 배포:
   ```bash
   cd apps/mobile
   eas update --branch production --message "fix: …"
   # 채널: development / staging / production (eas.json 프로필과 매칭)
   ```
3. 서버 정책 갱신 — 앱이 "새 버전 있음(OTA)" 프롬프트를 띄우게:
   ```bash
   curl -X PUT "$API/api/admin/version-policy/ios" \
     -H "Authorization: Bearer $ADMIN_TOKEN" -H "content-type: application/json" \
     -d '{"minSupportedVersion":"1.0.0","latestVersion":"1.0.1",
          "updateMode":"ota","storeUrl":"https://apps.apple.com/app/id…"}'
   # android 도 동일하게
   ```
   ※ OTA는 **버전 문자열을 바꾸지 않으므로**(runtimeVersion=appVersion 그대로)
   latestVersion 운용을 단순히 하려면 OTA 시 정책을 건드리지 않고 조용히 배포해도
   됩니다(앱 시작 시 expo-updates 가 자동 적용). 프롬프트로 알리고 싶을 때만 위
   정책을 사용하세요.
4. 롤백: `eas update --branch production --message "rollback"` 으로 직전 커밋의
   번들을 다시 게시.

앱 쪽 소비는 `src/version/updates.ts` 파사드로 추상화되어 있어, EAS Update 대신
셀프호스팅 expo-updates 서버로 가려면 `updates.url`(app.config.ts)만 바꾸면 됩니다.

## ❷ 스토어 배포 (네이티브 변경)

1. `apps/mobile/app.config.ts` 의 `version` 을 semver 로 범프 (예: 1.0.0 → 1.1.0).
   - **빌드 넘버**(iOS buildNumber / Android versionCode)는 수동 관리하지 않습니다 —
     EAS Build 의 `autoIncrement` 가 릴리즈마다 올립니다.
2. 빌드 & 제출:
   ```bash
   cd apps/mobile
   eas build --profile production --platform all
   eas submit --platform ios && eas submit --platform android
   ```
   (CI에서는 `.github/workflows/native-build.yml` — 수동/태그 트리거)
3. 심사 통과·단계적 출시 후, 서버 정책의 `latestVersion` 을 새 버전으로 올리고
   `updateMode: "store"` 로 설정 → 구버전 사용자에게 선택 업데이트 프롬프트.
4. 이후 이 버전에 대한 JS 수정은 다시 ❶(OTA) 경로로.

## ❸ 강제 업데이트

`minSupportedVersion` 미만 버전은:

- 부트 시 전체 화면 차단(`ForceUpdateScreen`) — 스토어 버튼 외 조작 불가
- API 레벨에서도 **426 UPGRADE_REQUIRED** 로 차단 (서버 version gate)

절차:

1. 대상 버전이 스토어에 **충분히 배포된 뒤** 실행 (강제 대상에게 갈 곳이 있어야 함).
2. ```bash
   curl -X PUT "$API/api/admin/version-policy/android" \
     -H "Authorization: Bearer $ADMIN_TOKEN" -H "content-type: application/json" \
     -d '{"minSupportedVersion":"1.1.0","latestVersion":"1.2.0",
          "updateMode":"store","storeUrl":"https://play.google.com/store/apps/details?id=…",
          "message":"보안 문제로 1.1.0 미만 버전 지원이 종료되었습니다."}'
   ```
3. 정책은 30초 캐시 + pub/sub 무효화로 전 인스턴스에 반영됩니다.

## 버전 스큐: API 하위호환 규약

웹과 달리 **모바일 클라이언트는 강제 새로고침이 불가능**합니다. 스토어 심사·사용자의
업데이트 지연 때문에 구버전 앱이 수 주간 살아 있습니다. 따라서:

1. **응답 필드는 제거·의미 변경 금지.** 추가만 허용. (에러 `code`, 커서 봉투
   `items`/`nextCursor` 포함)
2. **요청 파라미터의 필수화 금지.** 새 파라미터는 항상 optional + 기본값.
3. **에러 code 는 추가만.** 기존 code 재활용 금지 — 구버전 앱이 분기하고 있다.
4. 지원 중인 모든 버전(`>= minSupportedVersion`)과의 호환을 유지한다.
5. **breaking change 가 정말 필요하면**: 새 필드/엔드포인트를 추가해 신버전 앱이
   사용하게 하고, 구버전 지원을 끊어야 하는 시점에 `minSupportedVersion` 을 올려
   ❸ 강제 업데이트로만 해소한다. 이것이 유일한 탈출구다.

앱은 모든 요청에 `X-App-Version` / `X-Platform` 헤더를 보내고(자동, `src/api/client.ts`),
서버는 이를 근거로 지원 종료 버전에 426을 반환합니다. `/api/version-policy` 와
`/api/app-config` 는 게이트에서 제외되어, 차단당한 앱도 "어떻게 업데이트하는지"는
항상 알 수 있습니다.

## 선택 업데이트의 "나중에" 정책

강제가 아닌 프롬프트는 스킵할 수 있고, 스킵한 **그 버전**은 3일간
(`SKIP_REMIND_AFTER_MS`, shared/domain/version-policy.ts) 다시 묻지 않습니다.
더 새로운 버전이 나오면 즉시 다시 묻습니다. 로직은 공유 `decideUpdate()` 에 있고
단위 테스트로 고정되어 있습니다.

## 코드사이닝 자산 관리

**keystore / 인증서 / 프로비저닝 프로파일은 절대 커밋 금지** — `.gitignore` 에
`*.jks, *.keystore, *.p8, *.p12, *.mobileprovision, google-services.json` 등이
이미 등록되어 있습니다. 권장 관리:

- **EAS 관리 모드(기본)**: 서명 자산을 EAS 가 생성·보관. 로컬에 파일이 남지 않음.
- 자체 보관이 필요하면 팀 시크릿 매니저(1Password/Vault)에 두고, CI 에는
  GitHub Actions Secrets 로만 주입.
- 유출 시: 즉시 폐기·재발급하고, Android 는 Play App Signing 을 쓰고 있다면
  업로드 키만 교체하면 됩니다.
