# typed-transport 재설계 후속 백로그

0.4.0 재설계(dataGoKr 네임스페이스·스키마 검증 전송)의 최종 리뷰가 남긴 비차단 항목.

## B1. 테스트 타입 게이트·헬퍼 통합

런타임 테스트(`tests/**/*.test.ts`)가 tsc 게이트에 포함되지 않는다(tsconfig은 src, tsconfig.test.json은 src+test-d만). include 확장 또는 `typecheck:test` 스크립트로 게이트를 닫는다. 같은 작업에서 `mockFetch`를 fetch 시그니처로 타이핑해 `as string`·`as unknown as typeof fetch` 캐스트를 제거하고, 6개 파일에 복붙된 헬퍼(base·mockFetch·bodyWith·errorBody)를 `tests/helpers.ts`로 모은다.

## B2. build 스크립트 clean 단계

`tsc`만 도는 build는 소스 파일 삭제 시 구 dist 산출물을 남긴다. `files: dist` 발행이라 stale 파일이 패키지에 실릴 수 있다. build 전 dist 삭제를 스크립트에 넣는다.

## B3. 키 힌트 전달 경계 문서화

기본 키 힌트는 onRejected 체인 맨 앞에서 부착되므로, 하류 소비자 인터셉터가 에러 메시지를 새로 만들면 안내가 유실된다. 힌트가 `resultMsg` 필드에도 섞이는 소음도 있다. 서비스 이행 가이드에 "에러 번역 인터셉터는 원본 message를 보존하라"를 명시하고, resultMsg 분리 여부를 검토한다.
