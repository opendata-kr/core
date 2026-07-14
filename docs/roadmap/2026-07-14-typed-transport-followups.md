# typed-transport 재설계 후속 백로그

0.4 재설계(dataGoKr 네임스페이스·스키마 검증 전송)의 최종 리뷰가 남긴 비차단 항목.

## B1. 테스트 타입 게이트·헬퍼 통합

런타임 테스트(`tests/**/*.test.ts`)가 tsc 게이트에 포함되지 않는다(tsconfig은 src, tsconfig.test.json은 src+test-d만). include 확장 또는 `typecheck:test` 스크립트로 게이트를 닫는다. 같은 작업에서 `mockFetch`를 fetch 시그니처로 타이핑해 `as string`·`as unknown as typeof fetch` 캐스트를 제거하고, 6개 파일에 복붙된 헬퍼(base·mockFetch·bodyWith·errorBody)를 `tests/helpers.ts`로 모은다.

## B2. build 스크립트 clean 단계

`tsc`만 도는 build는 소스 파일 삭제 시 구 dist 산출물을 남긴다. `files: dist` 발행이라 stale 파일이 패키지에 실릴 수 있다. build 전 dist 삭제를 스크립트에 넣는다.

## B3. 키 힌트 전달 경계 문서화

기본 키 힌트는 onRejected 체인 맨 앞에서 부착되므로, 하류 소비자 인터셉터가 에러 메시지를 새로 만들면 안내가 유실된다. 힌트가 `resultMsg` 필드에도 섞이는 소음도 있다. 서비스 이행 가이드에 "에러 번역 인터셉터는 원본 message를 보존하라"를 명시하고, resultMsg 분리 여부를 검토한다.

## B4. 서비스 리포 core 0.4 이행 (리포당 1 PR)

공통 작업: `dataGoKr.create({ baseURL })` 전환(gateway의 path 분리 제거), `call`→`get`, 응답을 zod `looseObject` 스키마로 검증(README 스키마 작성 규약 준수, format 계층의 `as` 캐스트 소멸), 도구 응답에 `invalid` 건수 노출, 라이브 검증에서 `invalid > 0` 실패 승격, 리포별 `textResult`/`guard`/`READONLY` 사본을 core import로 교체, `withKeyHint` 수동 조립 제거, `pnpm-workspace.yaml` `minimumReleaseAgeExclude`에 소비하는 core 정확 버전 추가(현재 `@opendata-kr/core@0.4.1`). 의존 범위는 `^0.4.1` 이상으로 고정한다. 0.4.0은 `TextToolResult`가 interface여서 registerTool 콜백 반환이 TS2322로 깨지므로 쓰지 않는다(0.4.1에서 type alias로 수정).

리포별 함께 처리(감사 발견의 이행 흡수):

- prespec: 완료(narajangteo-prespec-mcp#7). 파일럿에서 확립한 패턴: raw 스키마는 `src/api/schema.ts`에 `looseObject`+조인 키만 필수+금액·건수 `coerce.string`, 도구 응답 필드명은 `invalidCount`, 테스트는 가짜 클라이언트 객체 대신 실제 `dataGoKr.create`에 `fetch` 주입(캐스트 없이 봉투 정규화·키 힌트 인터셉터까지 통과), `DATA_GO_KR_BASE_URL` 오버라이드는 전체 URL 규약으로 문서·server.json 동기.
- opening: 수기 Args를 `z.infer` 파생으로 통일(`args as X` 캐스트 제거), `fetchAllPages`/`fetchWindows` 호출을 `client.paginate`/`paginateWindows`로, endpoints의 `inqryDiv` 반환 타입 리터럴 유니온화, server.ts 인라인 catch를 `guard`로.
- bid: 수기 Args 8종 `z.infer` 통일, `runOps`의 `label: string`을 `BidKind` 리터럴 보존으로(또는 fanOut+get 직조합으로 대체), 도구별 인라인 `inqryDiv` 문자열 정리.
- corpinfo: 공통 작업 + facet 팬아웃 재구현을 fanOut 채택으로 재검토(corpinfo 백로그 항목과 병합).

## B5. dependabot #2 잔여분 (vitest 2→4)

dependabot #2(TS 5→7·@types/node·vitest) 중 빌드·타입체크는 tsc 전환으로 해소됐다. vitest 2→4는 `ERR_PACKAGE_PATH_NOT_EXPORTED`가 나서 별도 검토 후 rebase 병합한다. B1(테스트 타입 게이트)과 같은 작업에서 처리하면 효율적이다.
