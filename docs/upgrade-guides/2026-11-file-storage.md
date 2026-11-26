# 업스트림 업데이트 적용: 파일 업로드 · 저장소 · CDN (2026-11)

이 보일러플레이트에서 출발한 저장소(이하 **다운스트림**)에서 일하는 AI 에이전트를 위한 적용 절차입니다.
이 업데이트를 받은 뒤 이 문서를 위에서부터 끝까지 따르세요.

| PR                                                   | 내용                                                                        | main 머지 순서 |
| ---------------------------------------------------- | --------------------------------------------------------------------------- | -------------- |
| [#30](https://github.com/hwahee/boilerplate/pull/30) | 파일 업로드 API, 저장소 드라이버(local/s3/gdrive), `files` 테이블, CDN 주소 | 1              |

파일을 올리면(`POST /api/files`) 바이트는 설정된 저장소(`STORAGE_DRIVER`)에, 나머지 정보는 `files` 테이블에
들어가고, 캐시할 수 있는 주소(`/files/{id}.{확장자}`, `CDN_BASE_URL`이 있으면 CDN 주소)가 돌아옵니다.
설명은 README의 "파일 업로드와 CDN" 절에 있습니다.

## 0. 작업 원칙

- 다운스트림의 `CLAUDE.md`가 업스트림과 다르면 **다운스트림 것이 우선**입니다.
- **3절의 결정 항목은 에이전트가 정하지 않습니다.** 사람에게 묻고, 답을 받기 전에는 기본값(각 항목에 적음)으로 둡니다.
- 각 단계 끝의 검증 명령이 통과해야 다음 단계로 갑니다.

## 1. 이미 적용됐는지 확인

| 확인                                                    | 적용됨의 의미                           |
| ------------------------------------------------------- | --------------------------------------- |
| `ls src/server/storage/index.ts migrations/*_files.sql` | 저장소 드라이버와 마이그레이션이 들어옴 |
| `grep -n "STORAGE_DRIVER" .env.example`                 | 환경 변수 절이 들어옴                   |
| `bun run db:migrate` 출력에 `files`가 없음              | DB에도 적용됨(이미 적용됐으면 안 나옴)  |

## 2. 충돌 해결 원칙

- `migrations/0005_files.sql`의 번호를 다운스트림이 이미 썼다면 다음 빈 번호로 바꿉니다(`bun run db:migrate`가
  알려 줍니다). 다른 마이그레이션에 의존하지 않습니다.
- 다운스트림에 이미 `files` 테이블이나 `/api/files`·`/files/*` 경로가 있으면 **멈추고 사람에게 알립니다**
  (3절). 이름을 임의로 바꾸지 않습니다.
- `src/server/http/respond.ts`, `src/shared/api/errors.ts`: 에러 코드 `FORBIDDEN`(403)·`PAYLOAD_TOO_LARGE`(413)가
  더해졌습니다. 다운스트림이 같은 코드를 이미 더했다면 하나로 합치고, `ERROR_MESSAGE_KEYS`와
  메시지 카탈로그(`error.forbidden`, `error.payloadTooLarge`)가 로케일마다 있는지 확인합니다.
- `src/server/container.ts`, `src/server/app.ts`, `src/client/api/endpoints.ts`, `queries.ts`, `testids.ts`,
  메시지 카탈로그는 **양쪽을 모두 살립니다**(추가만 있음).
- `src/client/pages/home-page.tsx`: 업스트림은 홈 첫 칸을 `home-layout__main`으로 감싸 업로드 예시
  (`UploadDemo`)를 넣었습니다. 다운스트림이 홈을 바꿨다면 다운스트림 구성을 유지하고, 예시를 둘지는 3절을 따릅니다.
- 다운스트림이 로케일을 더했다면 `files.*`·`error.forbidden`·`error.payloadTooLarge` 키를 그 카탈로그에도
  더합니다(타입 검사가 빠진 키를 알려 줍니다).

## 3. 사람에게 확인할 결정

| 결정                                                                                           | 기본값(답을 받기 전)                                            |
| ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| 환경별(local/dev/운영) 저장소: 서버 디스크(`local`), S3·S3 호환(`s3`), 구글 드라이브(`gdrive`) | 로컬 개발만 `local`. 그 밖의 환경은 정해질 때까지 배포하지 않음 |
| 저장소 비밀값(S3 키, 구글 OAuth 클라이언트·리프레시 토큰)을 누가 만들고 어디에 보관하는지      | 없음 — 에이전트가 만들거나 커밋하지 않음                        |
| CDN을 둘지, 둔다면 그 주소(`CDN_BASE_URL`)                                                     | 두지 않음(`CDN_BASE_URL` 비움)                                  |
| 업로드 크기 제한(`UPLOAD_MAX_BYTES`)                                                           | 10MiB                                                           |
| 홈 페이지의 업로드 예시(`UploadDemo`)를 다운스트림 서비스에 남길지                             | 남김                                                            |
| 다운스트림에 기존 업로드 기능·`files` 테이블이 있을 때 어느 쪽으로 합칠지                      | 합치지 않고 멈춤                                                |

## 4. 조치

1. **마이그레이션**: `bun run db:migrate` — `files` 테이블이 생깁니다.
2. **환경 변수**: `.env.example`의 "File uploads & CDN" 절을 각 환경에 옮깁니다. 아무것도 넣지 않으면
   `STORAGE_DRIVER=local`이고, 로컬 개발에서는 `./storage`(gitignore됨)에 저장합니다.
   **`APP_ENV`가 `local`이 아니면 `STORAGE_LOCAL_DIR` 없이는 부팅을 거부합니다** — 3절의 저장소 결정에 따라
   `STORAGE_LOCAL_DIR`(빌드 산출물 밖의 절대 경로) 또는 `s3`/`gdrive` 설정을 넣습니다.
3. **배포(local 드라이버)**: 그 디렉터리가 배포·재시작 뒤에도 남는지 확인합니다. 컨테이너라면 볼륨을
   붙입니다(`docker-compose.yml`의 `uploads` 볼륨 참고). 인스턴스가 여럿이면 모두 같은 볼륨을 보거나 `s3`를 씁니다.
   백업 대상에 넣습니다.
4. **배포(gdrive 드라이버)**: 3절에서 정한 사람이 `bun run storage:gdrive-setup`을 실행해 나온 값을 배포 환경의
   비밀값으로 넣습니다. 에이전트는 이 명령을 대신 실행하지 않습니다(사람의 구글 로그인이 필요).
5. **CDN(둔다면)**: CDN을 이 서버를 원본으로 하는 pull 방식으로 만들고 `/files/*`만 캐시하게 한 뒤
   `CDN_BASE_URL`을 넣습니다. 원본의 `Cache-Control`을 따르게 둡니다.
6. **리버스 프록시**: 서버 앞에 nginx 등이 있으면 본문 크기 제한(`client_max_body_size` 등)이
   `UPLOAD_MAX_BYTES`보다 커야 합니다.
7. **새 규칙**: 업로드는 회원 전용입니다(`CLAUDE.md` "게스트가 할 수 있는 일"의 예시에 추가됨). 다운스트림
   기능이 파일을 받을 때는 `filesApi.upload` / `useUploadFile`을 쓰고, 돌려받은 `StoredFile.url`을 저장합니다.
   `/files` 주소를 직접 조립하지 않습니다(CDN 주소가 빠집니다).

검증: `bun run check` 통과. `bun run dev`로 띄워 홈의 업로드 상자에 이미지를 올리면 미리보기가 보이고,
`curl -I http://localhost:3000/files/{id}.png`에 `cache-control: public, max-age=31536000, immutable`이 있습니다.

## 5. 완료 조건

- `bun run check` 통과, `bun run db:migrate`가 더 적용할 것이 없다고 답함.
- 배포되는 모든 환경에 저장소 설정이 있고(3절 결정 반영), 업로드한 파일이 재배포 뒤에도 열림.
- 3절의 결정이 모두 사람에게서 답을 받았거나, 기본값으로 둔 항목이 PR 설명에 적혀 있음.

## 6. 되돌리기

- 코드: 이 업데이트의 머지를 되돌립니다.
- DB: `DROP TABLE files;`와 `DELETE FROM schema_migrations WHERE …`(해당 마이그레이션 행)로 되돌립니다.
  **이미 올라온 파일이 있으면 그 목록이 사라지므로 먼저 사람에게 확인합니다.**
- 저장소에 남은 바이트(디렉터리·버킷·드라이브 폴더)는 자동으로 지워지지 않습니다. 지울지는 사람이 정합니다.
