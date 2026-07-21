# Changelog

이 프로젝트의 주요 변경 사항을 기록한다. 형식은 [Keep a Changelog](https://keepachangelog.com/ko/1.1.0/)를 따르고, 버전은 [Semantic Versioning](https://semver.org/lang/ko/)을 따른다.

## [0.5.0](https://github.com/opendata-kr/core/compare/v0.4.1...v0.5.0) (2026-07-21)


### Features

* **logger:** createCallLogger 공개 API·도구 래퍼 추가 ([34b7718](https://github.com/opendata-kr/core/commit/34b7718d3841466ff41b8f28ee2a2e831eeb6f1c))
* **logger:** jsonl writer·ALS 호출 컨텍스트·클라이언트 upstream 계측 추가 ([4853451](https://github.com/opendata-kr/core/commit/48534516051f57576a9db586b2e3314212d9c05e))
* **logger:** 로그 경로 해석·파일 전략·이벤트 스키마·마스킹 순수 계층 추가 ([2270a66](https://github.com/opendata-kr/core/commit/2270a6632f24bba2e94a5a92fb6282e054686216))


### Bug Fixes

* **logger:** 최종 리뷰 확정 결함 수정 (빈 content 오판·stderr 무방어·비plain 왜곡·회전 보존) ([b5c8889](https://github.com/opendata-kr/core/commit/b5c8889553830f5da389cd63010e167cf8a08800))


### Documentation

* **roadmap:** B4 corpinfo 이행 완료·팬아웃 미채택 결정 반영, B4 전 리포 종료 ([7245acf](https://github.com/opendata-kr/core/commit/7245acfb0907afa87352691fec42923b16d24c37))
* **roadmap:** B4 opening·bid 이행 완료 반영 ([8700eb8](https://github.com/opendata-kr/core/commit/8700eb8ccd74ed5e7fb3c88ba744e83fdfba550e))
* **roadmap:** B4 prespec 이행 완료, 파일럿 확립 패턴 기록 ([d057aeb](https://github.com/opendata-kr/core/commit/d057aeb8c5221a081a273af9bc4d1f609f19c71c))
* **roadmap:** B4 공통 작업에 다중 요청 도구의 트래픽 소모 명시 추가 ([48913b7](https://github.com/opendata-kr/core/commit/48913b78cb7500f17ba4909ca370420006c99e67))
* **roadmap:** B4 만연체 분절, 공통 작업·리포별 항목을 원자 불릿으로 재구조화 ([b766fc1](https://github.com/opendata-kr/core/commit/b766fc13546ba1f85cea02db779f146e6827052c))
* **roadmap:** B7 장시간 호출 방어 백로그 등록, 로거 항목 완료 반영 ([b884f56](https://github.com/opendata-kr/core/commit/b884f560e4d45e98a23b737a56c6b9763a357f2a))
* **roadmap:** B7에 로거 마스킹 창 한계 백로그 추가 ([0b6c39a](https://github.com/opendata-kr/core/commit/0b6c39a45b0685731ca460dd60f5d400b1e3d494))
* **roadmap:** 비표준 오류 봉투(nkoneps) 정규화 백로그 B6 등록 ([2e26b43](https://github.com/opendata-kr/core/commit/2e26b439728b78a3357380bee7a1ba7e16af211b))
* **roadmap:** 이행 소비 버전을 0.4.1로 정정 (TextToolResult fix 반영) ([49b8c9d](https://github.com/opendata-kr/core/commit/49b8c9d458d6b8b1cd126803d5755e89f9b5f4ab))

## [0.4.1](https://github.com/opendata-kr/core/compare/v0.4.0...v0.4.1) (2026-07-14)


### Bug Fixes

* **mcp:** TextToolResult를 type alias로 변경해 CallToolResult 할당 오류 수정 ([0257f89](https://github.com/opendata-kr/core/commit/0257f89673b6e8517cddfc108dd9c303e048418f))


### Documentation

* **roadmap:** dependabot vitest 잔여분 B5 등록 ([0737648](https://github.com/opendata-kr/core/commit/07376485cdf76da5258348b4b927a88ff6f35afe))
* **roadmap:** 서비스 리포 0.4.0 이행 체크리스트 B4 추가 ([e74c3a4](https://github.com/opendata-kr/core/commit/e74c3a46f5e378b387776d7424fbc273d96e0b15))

## [0.4.0](https://github.com/opendata-kr/core/compare/v0.3.1...v0.4.0) (2026-07-14)


### ⚠ BREAKING CHANGES

* createClient·call·fetchAllPages·fetchWindows·OperationResult·RawItem·withKeyHint 제거. dataGoKr.create의 get·paginate·paginateWindows와 DataGoKrResponse로 대체

### Features

* **core:** MCP 도구 응답 헬퍼(textResult·guard·READONLY) 흡수 ([92747a2](https://github.com/opendata-kr/core/commit/92747a2acf848d88b1b1f154b333f584f7a33b80))
* **core:** request·response 인터셉터 매니저 추가 ([bff89d1](https://github.com/opendata-kr/core/commit/bff89d1d9299759d7bf2f4a598e82051ac1563b1))
* **core:** Standard Schema 계약 타입·응답 봉투 타입·isError 가드 추가 ([7f8781b](https://github.com/opendata-kr/core/commit/7f8781bc7275208b34d545ebe96ace6464277d5f))
* 전송계층을 dataGoKr 네임스페이스·스키마 검증 클라이언트로 재설계 ([7c94f67](https://github.com/opendata-kr/core/commit/7c94f67c9fb8dfed3e8aebb3449cbe106c0ef622))


### Bug Fixes

* **core:** 본문 읽기 타임아웃·paginate 부분결과 오보고·인터셉터 undefined 회복 차단 등 리뷰 결함 수정 ([7478784](https://github.com/opendata-kr/core/commit/74787844834449c67813b26299f03826f223bfc8))


### Documentation

* **readme:** 응답 스키마 작성 규약·invalid 소비법·fanOut 병렬 검색 예시 추가 ([0f56b2a](https://github.com/opendata-kr/core/commit/0f56b2a554043cc2666d3b1bb4e0b6986aa89d5c))
* **roadmap:** typed-transport 재설계 후속 백로그 등록 ([489eb94](https://github.com/opendata-kr/core/commit/489eb94bc9393fa3e998fe5df4681c18d23373ee))

## [0.3.1](https://github.com/opendata-kr/core/compare/v0.3.0...v0.3.1) (2026-07-14)


### Chores

* 0.3.1 릴리즈(tsc 빌드 전환 발행) ([cff6640](https://github.com/opendata-kr/core/commit/cff664010886db24b5658f0faad31487efd5e2ba))

## [0.3.0](https://github.com/opendata-kr/core/compare/v0.2.0...v0.3.0) (2026-07-08)


### Features

* **errMessage:** 에러 축약 관용구 통일 유틸 추가 ([738028e](https://github.com/opendata-kr/core/commit/738028ecf2a0b8b8e0f87cb52c530895d46ee121))
* **fanOut:** label 결과맵 fan-out 프리미티브 추가 ([9fb1bb3](https://github.com/opendata-kr/core/commit/9fb1bb3a2f08d1a3ec474dbcd0b547cda9416742))
* **keyHint:** 인증키 회복 안내 withKeyHint 승격 ([56949ca](https://github.com/opendata-kr/core/commit/56949ca3ca5ae6a14516e3574d1d635776f39a25))
* **params:** dateRangeParams·pagingParams 승격 ([2dfe6e6](https://github.com/opendata-kr/core/commit/2dfe6e6d2ed593b434c10ee5075832edfa646f38))
* **windows:** splitCalendarMonths 추가·고정 일수 splitDateWindows 제거 ([d43848f](https://github.com/opendata-kr/core/commit/d43848f37ed099df5075f439da0193c923fb65e8))


### Bug Fixes

* **fanOut:** 결과맵을 Object.create(null)로 만들어 프로토타입 키 오탐 방지 ([c79694f](https://github.com/opendata-kr/core/commit/c79694fa2b1d9c94cc897bed9e833dd71edc2df7))

## [0.2.0](https://github.com/opendata-kr/core/compare/v0.1.3...v0.2.0) (2026-07-07)


### Features

* **client:** retryable 에러 1회 재시도·httpStatus·rawBody 구조화 ([1f07efa](https://github.com/opendata-kr/core/commit/1f07efa4281821d19920e3a2e28047e258633ee8))
* **concurrency:** 인라인 세마포어 mapWithConcurrency 추가 ([e8829cf](https://github.com/opendata-kr/core/commit/e8829cf7d709ac54881e9fcaae93b33b324e6ce8))
* **config:** DATA_GO_KR_TIMEOUT_MS env·기본 30초 타임아웃 해석 ([318ac96](https://github.com/opendata-kr/core/commit/318ac96f44c5358ed0e19ff87b4cfe1e0d04619e))
* **errors:** DataGoKrError에 kind·retryable·httpStatus·rawBody 추가 ([8fc4f78](https://github.com/opendata-kr/core/commit/8fc4f78e14a8fc1016fae9904f384e1f8ae874b8))
* **fetchWindows:** 윈도우 동시성·부분실패(failedWindows) 헬퍼 추가 ([cc45680](https://github.com/opendata-kr/core/commit/cc45680c53266899e9fc0d1953800f9f78f090b6))
* **index:** 신규 페치 프리미티브·fetchWindows export ([0e3ded3](https://github.com/opendata-kr/core/commit/0e3ded3dc9d0eea17bb8f0cc7e15b853afd5560d))
* **paginate:** fetchAllPages를 core로 승격 ([2d7814c](https://github.com/opendata-kr/core/commit/2d7814c705a517345abf11362e6c9f954bf42a15))
* **windows:** splitDateWindows를 core로 승격 ([b9ec975](https://github.com/opendata-kr/core/commit/b9ec975b598f144e2df7bf305954d9e40f3339f8))


### Bug Fixes

* **windows:** splitDateWindows maxDays&lt;=0 무한루프 방지 가드 ([74bfdaf](https://github.com/opendata-kr/core/commit/74bfdafda159da2e6995fe9c81f0dad9735a7b57))

## [0.1.3](https://github.com/opendata-kr/core/compare/v0.1.2...v0.1.3) (2026-07-06)


### Automation

* packageManager 필드 추가로 pnpm/action-setup 발행 실패 해결 ([ccc461d](https://github.com/opendata-kr/core/commit/ccc461de709c4c552bccc6106fa33567a47e1bde))

## [0.1.2](https://github.com/opendata-kr/core/compare/v0.1.1...v0.1.2) (2026-07-06)


### Automation

* setup-node의 잘못된 cache:false를 package-manager-cache:false로 정정 ([0d757d6](https://github.com/opendata-kr/core/commit/0d757d653be1fc1868167ad0944709399783d49c))

## [0.1.1](https://github.com/opendata-kr/core/compare/v0.1.0...v0.1.1) (2026-07-06)


### Documentation

* 뱃지·CHANGELOG를 0.1.0 릴리스 기준으로 정정 ([690864b](https://github.com/opendata-kr/core/commit/690864b3192c4bd1410dc55dcc5f4a7db5af9b3d))

## [0.1.0] - 2026-07-06

### Added
- data.go.kr OpenAPI 표준 전송계층 초기 구현
