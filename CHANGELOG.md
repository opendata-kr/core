# Changelog

이 프로젝트의 주요 변경 사항을 기록한다. 형식은 [Keep a Changelog](https://keepachangelog.com/ko/1.1.0/)를 따르고, 버전은 [Semantic Versioning](https://semver.org/lang/ko/)을 따른다.

## [0.2.0](https://github.com/opendata-kr/core/compare/v0.1.0...v0.2.0) (2026-07-06)


### Features

* add createClient factory (url build, call, non-json handling) ([f7281fd](https://github.com/opendata-kr/core/commit/f7281fd3a49071240625562f1868df592cac65da))
* add DataGoKrError and normalizeResultCode (resultMsg passthrough) ([3a11657](https://github.com/opendata-kr/core/commit/3a116579d80733448dda4dd776434d45b8a5acc4))
* add envelope types and normalizeItems (3 item shapes) ([c2ecf4d](https://github.com/opendata-kr/core/commit/c2ecf4db9099ccd08e595d8fd6fb1b7d69b237ac))
* add resolveConfig (serviceKey, baseURL, preEncoded) ([d5638b1](https://github.com/opendata-kr/core/commit/d5638b151a3fd32d47d392e6bf0fbacc6dc469a4))
* export public API surface ([a9dd4cc](https://github.com/opendata-kr/core/commit/a9dd4cc7e120325b0b0bc964bdcf39e14bb3c58b))


### Bug Fixes

* harden buildUrl serviceKey precedence, trailing slash, merged pageNo ([d8fdc0c](https://github.com/opendata-kr/core/commit/d8fdc0ccb3c98c6a5f707bb81259cbf8f801ce38))
* harden buildUrl serviceKey precedence, trailing slash, merged pageNo ([687544e](https://github.com/opendata-kr/core/commit/687544ef2f164a4365290c601ef822f0c12a05ef))


### Documentation

* bring README to org standard (원형 B) ([d46e2e6](https://github.com/opendata-kr/core/commit/d46e2e6a6f9f7c67e7fdd1dc0cfcbe1f385cf6e4))
* 뱃지·CHANGELOG를 0.1.0 릴리스 기준으로 정정 ([690864b](https://github.com/opendata-kr/core/commit/690864b3192c4bd1410dc55dcc5f4a7db5af9b3d))

## [0.1.0] - 2026-07-06

### Added
- data.go.kr OpenAPI 표준 전송계층 초기 구현
