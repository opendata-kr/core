# Changelog

이 프로젝트의 주요 변경 사항을 기록한다. 형식은 [Keep a Changelog](https://keepachangelog.com/ko/1.1.0/)를 따르고, 버전은 [Semantic Versioning](https://semver.org/lang/ko/)을 따른다.

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
