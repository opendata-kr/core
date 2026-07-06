# @opendata-kr/core

data.go.kr OpenAPI 표준 전송계층. `<service>-mcp` 도구들이 공유한다.

[![npm version](https://img.shields.io/npm/v/@opendata-kr/core)](https://www.npmjs.com/package/@opendata-kr/core)
[![license](https://img.shields.io/badge/license-MIT-blue)](./LICENSE)
[![types](https://img.shields.io/badge/types-included-blue)](./dist/index.d.ts)

data.go.kr의 수많은 OpenAPI는 인증·응답 봉투·에러코드가 제각각이다. `core`는 이 전송계층을 한 곳으로 표준화한다. `serviceKey` 주입, 기본 파라미터 병합, 타임아웃, 응답 봉투·`items` 정규화, 결과코드 정규화를 담당한다.

```ts
import { createClient } from "@opendata-kr/core";

const client = createClient({
  path: "/1230000/ad/BidPublicInfoService",
  params: { type: "json" },
});

const { totalCount, items } = await client.call("getBidPblancListInfoCnstwk", {
  pageNo: 1,
  numOfRows: 10,
  inqryDiv: 1,
  inqryBgnDt: "202606060000",
  inqryEndDt: "202607060000",
});
```

## 설치

```bash
pnpm add @opendata-kr/core
```

ESM 전용 패키지다(CJS `require` 미지원). 타입 선언(`.d.ts`)이 포함된다. 전역 `fetch`를 쓰므로 Node 18 이상에서 동작하고, 개발·CI는 Node 24(`.nvmrc`)를 쓴다.

## API

### `createClient(options): DataGoKrClient`

한 서비스 경로에 묶인 클라이언트를 만든다.

| 옵션 | 타입 | 기본값 | 설명 |
|---|---|---|---|
| `path` | `string` | (필수) | 게이트웨이 이후 서비스 경로. 예: `/1230000/ad/BidPublicInfoService` |
| `serviceKey` | `string` | env `DATA_GO_KR_SERVICE_KEY` | data.go.kr **Decoding(원본) 키**. 옵션이 환경변수보다 우선 |
| `baseURL` | `string` | `https://apis.data.go.kr` | 게이트웨이 base. env `DATA_GO_KR_BASE_URL`로도 설정 |
| `params` | `Record<string, string \| number>` | `{}` | 모든 호출에 병합되는 기본 파라미터(예: `{ type: "json" }`) |
| `timeout` | `number` | `10000` | 요청 타임아웃(ms) |
| `fetch` | `typeof fetch` | 전역 `fetch` | 주입용(테스트) |

`serviceKey`가 옵션·환경변수 모두 없으면 throw 한다.

### `DataGoKrClient`

```ts
interface DataGoKrClient {
  call(operation: string, params?: Params): Promise<OperationResult>;
  readonly serviceKeyLooksPreEncoded: boolean;
}
```

- `call(operation, params)`: `path`에 `operation`을 붙여 호출한다. `params`의 `undefined` 값은 쿼리에서 제외된다. `serviceKey`는 소문자 쿼리 파라미터로 자동 주입된다.
- `serviceKeyLooksPreEncoded`: 키가 이미 URL 인코딩된(`%XX`) 것으로 보이면 `true`. Encoding 키를 잘못 넣었다는 신호다(아래 주의 참고).

반환 `OperationResult`:

```ts
interface OperationResult {
  totalCount: number;
  pageNo: number;
  items: Record<string, string>[]; // RawItem[]
}
```

- 결과코드 `00`/`0` = 정상, `03` = 데이터 없음(`items: []`), 그 외 = `DataGoKrError` throw(`resultMsg` 통과).
- data.go.kr의 세 가지 `items` 형태(배열 직접, `items.item` 배열, `items.item` 단건)를 모두 배열로 정규화한다.
- 비-JSON(XML) 오류 봉투의 `returnReasonCode`도 처리한다.
- HTTP 2xx가 아니면 throw 한다.

### `DataGoKrError`

```ts
class DataGoKrError extends Error {
  readonly code: string; // data.go.kr resultCode
  readonly resultMsg: string; // 원본 resultMsg 통과
}
```

기타 export(모두 타입): `CreateClientOptions`, `Params`, `OperationResult`, `RawItem`, `RawApiResponse`, `NormalizedResult`.

## 사용 (서비스 서버에서)

`<service>-mcp` 서버는 서비스 경로로 게이트웨이를 만들고, 각 도구가 `client.call`을 쓴다.

```ts
import { createClient, DataGoKrError } from "@opendata-kr/core";

const client = createClient({
  path: "/1230000/ad/BidPublicInfoService",
  params: { type: "json" },
});

// 잘못된 키 변형 조기 경고
if (client.serviceKeyLooksPreEncoded) {
  console.error(
    "경고: DATA_GO_KR_SERVICE_KEY가 이미 인코딩된 키로 보입니다. Decoding(원본) 키를 사용하세요.",
  );
}

try {
  const { totalCount, items } = await client.call("getBidPblancListInfoCnstwk", {
    pageNo: 1,
    numOfRows: 10,
    inqryDiv: 1,
    inqryBgnDt: "202606060000",
    inqryEndDt: "202607060000",
  });
} catch (err) {
  if (err instanceof DataGoKrError) {
    // err.code, err.resultMsg (data.go.kr 원본 메시지)
  }
}
```

필수 요청 파라미터(`inqryDiv`, 조회일시 범위 등)는 감싸는 data.go.kr 서비스마다 다르다. core는 응답 형태만 표준화하고, 어떤 파라미터를 보낼지는 각 도구가 정한다. 응답 포맷 파라미터(`type`/`dataType`)도 core가 주입하지 않는다.

## 환경변수

| 이름 | 필수 | 기본값 | 설명 |
|---|---|---|---|
| `DATA_GO_KR_SERVICE_KEY` | 예 | (없음) | 공공데이터포털 **Decoding(원본)** 인증키 |
| `DATA_GO_KR_BASE_URL` | 아니오 | `https://apis.data.go.kr` | 게이트웨이 base 오버라이드 |

### 주의: Decoding 키를 쓸 것

공공데이터포털은 Encoding과 Decoding 두 키를 준다. core는 쿼리를 만들 때 키를 한 번 인코딩하므로 **Decoding(원본) 키**를 넣어야 한다. 이미 인코딩된 Encoding 키를 넣으면 이중 인코딩으로 인증(HTTP 401)에 실패하고, `serviceKeyLooksPreEncoded`가 `true`가 된다.

## License

MIT
