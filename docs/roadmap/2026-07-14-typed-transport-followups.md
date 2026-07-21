# typed-transport 재설계 후속 백로그

0.4 재설계(dataGoKr 네임스페이스·스키마 검증 전송)의 최종 리뷰가 남긴 비차단 항목.

## B1. 테스트 타입 게이트·헬퍼 통합

런타임 테스트(`tests/**/*.test.ts`)가 tsc 게이트에 포함되지 않는다(tsconfig은 src, tsconfig.test.json은 src+test-d만). include 확장 또는 `typecheck:test` 스크립트로 게이트를 닫는다. 같은 작업에서 `mockFetch`를 fetch 시그니처로 타이핑해 `as string`·`as unknown as typeof fetch` 캐스트를 제거하고, 6개 파일에 복붙된 헬퍼(base·mockFetch·bodyWith·errorBody)를 `tests/helpers.ts`로 모은다.

## B2. build 스크립트 clean 단계

`tsc`만 도는 build는 소스 파일 삭제 시 구 dist 산출물을 남긴다. `files: dist` 발행이라 stale 파일이 패키지에 실릴 수 있다. build 전 dist 삭제를 스크립트에 넣는다.

## B3. 키 힌트 전달 경계 문서화

기본 키 힌트는 onRejected 체인 맨 앞에서 부착되므로, 하류 소비자 인터셉터가 에러 메시지를 새로 만들면 안내가 유실된다. 힌트가 `resultMsg` 필드에도 섞이는 소음도 있다. 서비스 이행 가이드에 "에러 번역 인터셉터는 원본 message를 보존하라"를 명시하고, resultMsg 분리 여부를 검토한다.

## B4. 서비스 리포 core 0.4 이행 (리포당 1 PR)

소비 버전은 `^0.4.1` 이상으로 고정한다. 0.4.0은 `TextToolResult`가 interface여서 registerTool 콜백 반환이 TS2322로 깨진다(0.4.1에서 type alias로 수정).

공통 작업:

- `dataGoKr.create({ baseURL })` 전환. gateway의 path 분리 제거
- `call` → `get`
- 응답을 zod `looseObject` 스키마로 검증(README 스키마 작성 규약 준수). format 계층의 `as` 캐스트 소멸
- 도구 응답에 `invalid` 건수 노출
- 라이브 검증에서 `invalid > 0` 실패 승격
- 다중 요청 도구(fan-out·창 분할)의 API 요청 소모량을 description·파라미터 설명에 명시. 스킬 writing-mcp-tool-descriptions [다중 요청 도구], prespec#9 선례
- 리포별 `textResult`/`guard`/`READONLY` 사본을 core import로 교체
- `withKeyHint` 수동 조립 제거
- `pnpm-workspace.yaml` `minimumReleaseAgeExclude`에 소비하는 core 정확 버전 추가(현재 `@opendata-kr/core@0.4.1`)

리포별 함께 처리(감사 발견의 이행 흡수):

- prespec: 완료(narajangteo-prespec-mcp#7·#9). 파일럿이 확립한 패턴:
  - raw 스키마는 `src/api/schema.ts`. `looseObject`, 조인 키만 필수, 금액·건수는 `coerce.string`
  - 도구 응답 필드명은 `invalidCount`
  - 테스트는 가짜 클라이언트 객체 대신 실제 `dataGoKr.create`에 `fetch` 주입. 캐스트 없이 봉투 정규화·키 힌트 인터셉터까지 통과
  - `DATA_GO_KR_BASE_URL` 오버라이드는 전체 URL 규약. README·server.json 동기
- opening: 완료(narajangteo-opening-mcp#6). 수기 Args z.infer 통일, paginate/paginateWindows 전환, inqryDiv 리터럴 유니온, guard 대체. 라이브 발견: D 계열(투찰)은 bidNtceNo 필수, 그 에러가 비표준 nkoneps 봉투로 온다(B6 등록 계기)
- bid: 완료(narajangteo-bid-mcp#13). 수기 Args 8종 z.infer 통일, runOps 라벨 K extends string 제네릭 보존, kind 부분집합 상수 as const 파생 유니온화. 스키마는 발행 출력계약(전 필드 optional)에 맞춰 필수 필드 없음. 인라인 inqryDiv는 도구별 의미가 정확해 유지
- corpinfo: 완료(narajangteo-corpinfo-mcp#4). 팬아웃 검토 결정 = fanOut 미채택. 이질 facet(반환 타입이 facet마다 다름)에 쓰면 Outcome<unknown>으로 타입이 죽어, fetchFacet(FacetError 격리)+allSettled 현행이 같은 부분실패 보장을 타입 보존으로 제공. 백로그의 toSanctionResult 추출·테스트 유틸 통합·server.json icons도 함께 해소

## B5. dependabot #2 잔여분 (vitest 2→4)

dependabot #2(TS 5→7·@types/node·vitest) 중 빌드·타입체크는 tsc 전환으로 해소됐다. vitest 2→4는 `ERR_PACKAGE_PATH_NOT_EXPORTED`가 나서 별도 검토 후 rebase 병합한다. B1(테스트 타입 게이트)과 같은 작업에서 처리하면 효율적이다.

## B6. 비표준 오류 봉투 정규화 (nkoneps ResponseError)

data.go.kr 일부 오류는 표준 `response.header`가 아니라 `{"nkoneps.com.response.ResponseError": {"header": {"resultCode", "resultMsg"}}}` 봉투로 온다. 현재 core는 이 코드를 못 읽어 "[?] 응답에 결과코드가 없습니다"로 뭉갠다. opening 라이브에서 재현: D 계열(투찰)을 `bidNtceNo` 없이 기간 조회하면 resultCode 08(필수값 입력 에러)이 이 봉투로 온다(낙찰 리포 작업에서도 동일 증상). `callOnce`의 JSON 경로에서 이 루트 키를 인식해 `normalizeResultCode`로 태우면 원인 코드가 소비자에게 전달된다.

## B7. 장시간 호출 방어 프리미티브 (취소 전파·창 부분 실행)

MCP 클라이언트는 도구 호출을 일정 시간 후 취소한다(Claude Desktop 실측 240초 하드캡, `notifications/cancelled` 발신. 모델은 이 타임아웃을 서버 다운으로 오진한다). 넓은 기간 × fan-out 호출(창 수 × maxPages × kinds × 재시도 1회)은 이 캡을 쉽게 넘는다. 라이브 사례·OSS 선례 조사·서비스 측 우선순위(창 병렬화 → 커서 부분 결과 계약)는 opening `docs/roadmap/2026-07-21-client-timeout-defense.md`.

- 구조화 호출 로거: 완료. core가 `createCallLogger`·`logger.tool`로 제공한다. 도구 호출 단위 jsonl 이벤트 스트림(`call_start`·`upstream`·`cancelled`·`call_end`, callId 상관), 서비스키 마스킹, env-paths log 관례 경로 인라인(macOS `~/Library/Logs/opendata-kr/`, Windows `%LOCALAPPDATA%\opendata-kr\Log`, Linux `$XDG_STATE_HOME/opendata-kr/`, `OPENDATA_LOG_DIR` 오버라이드·`OPENDATA_LOG=off`), 프로세스당 파일 + 5 MiB 전환 + 7일·8개 보존, AbortSignal 청취 취소 기록(취소 전파의 앞부분). 서비스 리포 배선은 리포별 후속 태스크.
- 취소 전파: 도구 핸들러가 받은 AbortSignal을 클라이언트 요청(fetch)까지 전파해 취소 후 upstream 트래픽 낭비를 끊는다.
- 창 부분 실행: `paginateWindows`에 처리할 창 상한(또는 시작 오프셋+상한)을 받아 그만큼만 조회하고 미처리 창 목록을 결과에 반환한다. 서비스 계층이 이를 stateless 커서(`nextCursor`)로 인코딩해 커서 기반 부분 결과 계약을 구현한다. 시간 기반 데드라인 절단이 아니라 창 개수 기반 결정론적 절단이다.
- 진단 도구 구현 제공: 로거 기록을 읽어 "직전 호출 부검"을 반환하는 get_diagnostics 도구 구현(`readOnlyHint: true`, 작은 응답, 키 마스킹)을 core가 제공하고 서비스는 등록만 한다.
