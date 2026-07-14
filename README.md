# @opendata-kr/core

data.go.kr OpenAPI MCP 서비스 공통 계층 (전송·스키마 검증·서버 헬퍼)

[![npm version](https://img.shields.io/npm/v/@opendata-kr/core)](https://www.npmjs.com/package/@opendata-kr/core)
[![license](https://img.shields.io/npm/l/@opendata-kr/core)](./LICENSE)
![types](https://img.shields.io/badge/types-included-blue)

data.go.kr의 수많은 OpenAPI는 인증·응답 봉투·에러코드가 제각각이다. `core`는 전송(serviceKey 주입·타임아웃·재시도·봉투 정규화), 스키마 검증(응답 item의 런타임 검증과 타입 유도), MCP 서버 헬퍼(`textResult`·`guard`·`READONLY`)를 한 곳으로 표준화한다. `<service>-mcp` 리포들이 공유한다.

```ts
import dataGoKr from "@opendata-kr/core";
import { z } from "zod";

const client = dataGoKr.create({
  baseURL: "https://apis.data.go.kr/1230000/ad/BidPublicInfoService",
  params: { type: "json" },
});

const Bid = z.looseObject({
  bidNtceNo: z.string(),
  bidNtceNm: z.string(),
});

const { data, totalCount, invalid } = await client.get("getBidPblancListInfoCnstwk", {
  params: { pageNo: 1, numOfRows: 10, inqryDiv: 1 },
  schema: Bid,
});
// data: { bidNtceNo: string; bidNtceNm: string }[] (z.infer 타입으로 흐른다)
// invalid: 스키마 탈락 item (throw하지 않고 격리)
```

## 설치

```bash
pnpm add @opendata-kr/core
```

ESM 전용 패키지다(CJS `require` 미지원). 타입 선언(`.d.ts`)이 포함된다. 런타임 의존성은 없다. 전역 `fetch`를 쓰므로 Node 18 이상에서 동작하고 개발·CI는 Node 24(`.nvmrc`)를 쓴다.

스키마는 [Standard Schema v1](https://standardschema.dev) 인터페이스로 받는다. zod 4 스키마를 그대로 넘기면 되고 core가 zod에 의존하지는 않는다.

## API

### `dataGoKr.create(config?): DataGoKrClient`

한 서비스에 묶인 클라이언트를 만든다.

| 옵션 | 타입 | 기본값 | 설명 |
|---|---|---|---|
| `baseURL` | `string` | env `DATA_GO_KR_BASE_URL` | 서비스 경로를 포함한 전체 URL. 예: `https://apis.data.go.kr/1230000/ad/BidPublicInfoService`. 옵션·환경변수 모두 없거나, 경로 없는 호스트 전용 값(`https://apis.data.go.kr`)이거나, URL로 해석할 수 없으면 throw |
| `serviceKey` | `string` | env `DATA_GO_KR_SERVICE_KEY` | data.go.kr **Decoding(원본) 키**. 옵션이 환경변수보다 우선. 둘 다 없으면 throw |
| `params` | `Record<string, string \| number>` | `{}` | 모든 호출에 병합되는 기본 파라미터(예: `{ type: "json" }`) |
| `timeout` | `number` | `30000` | 요청 타임아웃(ms). 헤더 수신뿐 아니라 본문 읽기 완료까지 잰다. env `DATA_GO_KR_TIMEOUT_MS`가 있으면 그 값이 우선 |
| `retry` | `RetryOptions` | 재시도 1회 | `retries`·`baseDelayMs`·`jitterMs`·`sleep`. 재시도 대상은 스로틀·네트워크·HTTP 429/5xx |
| `fetch` | `typeof fetch` | 전역 `fetch` | 주입용(테스트) |

### `DataGoKrClient`

`get`·`paginate`·`paginateWindows`는 `schema` 유무로 오버로드가 갈린다. `schema`가 있으면 T가 스키마에서 추론되고, 없으면 타입 인자를 받지 않아 `get<Bid>(op)`처럼 무검증 T를 주장할 수 없다(컴파일 에러).

```ts
interface DataGoKrClient {
  get<T>(op: string, config: SchemaRequestConfig<T>): Promise<DataGoKrResponse<T>>;
  get(op: string, config?: RequestConfig): Promise<DataGoKrResponse<Record<string, unknown>>>;
  paginate<T>(
    op: string,
    config: SchemaRequestConfig<T> & { pageSize: number; maxPages: number },
  ): Promise<PaginatedResponse<T>>;
  paginate(
    op: string,
    config: RequestConfig & { pageSize: number; maxPages: number },
  ): Promise<PaginatedResponse<Record<string, unknown>>>;
  paginateWindows<T>(
    op: string,
    config: SchemaRequestConfig<T> & {
      windows: readonly DateWindow[];
      pageSize: number;
      maxPages: number;
      concurrency: number;
    },
  ): Promise<WindowedResponse<T>>;
  paginateWindows(
    op: string,
    config: RequestConfig & {
      windows: readonly DateWindow[];
      pageSize: number;
      maxPages: number;
      concurrency: number;
    },
  ): Promise<WindowedResponse<Record<string, unknown>>>;
  interceptors: {
    request: RequestInterceptorManager;
    response: ResponseInterceptorManager;
  };
  readonly serviceKeyLooksPreEncoded: boolean;
}

interface RequestConfig {
  params?: Params; // undefined 값은 쿼리에서 제외
}

interface SchemaRequestConfig<T> extends RequestConfig {
  schema: StandardSchemaV1<unknown, T>; // T는 이 스키마 검증에서만 태어난다
}
```

#### `get(op, config?)`

`baseURL`에 `op`를 붙여 1회 호출한다. 파이프라인은 request 인터셉터 → fetch(타임아웃·재시도·비JSON 폴백) → 봉투 정규화 → response 인터셉터 → 스키마 파싱 순서다.

- data.go.kr의 `items` 변형(배열 직접, `items.item` 배열, `items.item` 단건, 빈 문자열)을 `data` 배열 하나로 정규화한다.
- 결과코드 `00`/`0` = 정상, `03` = 데이터 없음(`data: []`), 그 외 = `DataGoKrError` throw. 비JSON(XML) 오류 봉투의 `returnReasonCode`도 처리한다.
- `schema`가 있으면 item별로 검증한다. 통과 item은 `data`, 탈락 item은 `invalid`로 격리하고 throw하지 않는다. `invalid[].index`는 그 호출이 수신한 전체 item 시퀀스의 0기반 누적 위치이고 원본은 `raw`에 보존된다.

```ts
interface DataGoKrResponse<T = Record<string, unknown>> {
  data: T[];
  totalCount: number; // API 보고값 그대로
  pageNo: number;
  invalid: InvalidItem[]; // { index, issues: string[], raw }
}
```

#### `paginate(op, config)`

`get`을 페이지 순서대로 반복해 결과를 합친다. 수신 item(`data` + `invalid`)이 `totalCount`에 도달하거나 빈 페이지를 만나면 끝난다. `truncated: true`는 부분 결과 신호다. `maxPages` 소진, 또는 빈 페이지로 끝났는데 수신 합계가 `totalCount` 미만인 경우다. `totalCount`는 API 보고값을 따르되, 데이터를 이미 수신한 뒤의 0 보고(noData 폴백 페이지)로는 덮어쓰지 않는다.

#### `paginateWindows(op, config)`

날짜 창(`windows`)마다 `paginate`를 `concurrency` 제한으로 병렬 실행한다. 실패한 창은 throw 대신 `failedWindows: { window, error }[]`로 격리하고 성공 창 결과는 유지한다. `totalCount`는 창별 합산이다. 창 파라미터는 `inqryBgnDt`/`inqryEndDt`로 주입된다.

#### 인터셉터

axios 관례를 따른다. 페이지·창 호출도 전부 같은 파이프라인을 통과한다.

```ts
client.interceptors.request.use((ctx) => ({ ...ctx, params: { ...ctx.params, type: "json" } }));
const id = client.interceptors.response.use(
  (res) => res, // 스키마 파싱 전 shape (DataGoKrResponse<Record<string, unknown>>)
  (err) => {
    throw err; // 값을 반환하면 회복, throw하면 다음 onRejected로 전파
  },
);
client.interceptors.response.eject(id);
```

- 등록순으로 직렬 실행하고 반환값이 다음 단계의 입력이 된다. `onFulfilled`의 `undefined` 반환은 원본 유지다.
- 스키마 파싱 이전 단계의 throw는 response `onRejected` 체인으로 라우팅된다. `onRejected`가 파싱 전 shape 값을 반환하면 스키마 파싱부터 재진입해 호출자에 resolve된다. `undefined` 반환은 회복이 아니라 원본 에러를 다음 `onRejected`로 계속 전파한다(로깅 전용 등록 방어).
- request 매니저에는 `onRejected`가 없다.
- 기본 인터셉터 1개가 설치되어 있다. 키가 사전 인코딩(`serviceKeyLooksPreEncoded`)된 상태에서 인증류 에러가 나면 message에 Decoding 키 안내를 붙여 재던진다.

### `dataGoKr.isError(e): e is DataGoKrError`

`catch`에서 data.go.kr 에러를 좁히는 타입 가드.

```ts
class DataGoKrError extends Error {
  readonly code: string; // data.go.kr resultCode
  readonly resultMsg: string; // 원본 resultMsg 통과
  readonly kind: ErrorKind; // "throttle" | "auth" | "param" | "network" | "unknown"
  readonly retryable: boolean;
  readonly httpStatus?: number;
  readonly rawBody?: string;
}
```

### MCP 서버 헬퍼

MCP SDK에 의존하지 않는 구조적 타입이라 `registerTool` 콜백 반환값으로 그대로 쓴다.

| export | 시그니처 | 설명 |
|---|---|---|
| `textResult` | `(payload: unknown, isError?: boolean) => TextToolResult` | payload를 JSON 텍스트 콘텐츠 하나로 감싼다. 성공 응답에는 `isError` 키를 두지 않는다 |
| `guard` | `(run: () => Promise<unknown>) => Promise<TextToolResult>` | 도구 핸들러를 감싸 성공은 `textResult(값)`, 예외는 `textResult({ error }, true)`로 변환 |
| `READONLY` | `{ readOnlyHint: true, openWorldHint: true }` | 조회 전용 data.go.kr 도구의 표준 애노테이션 |

### 조합 프리미티브

| export | 시그니처 | 설명 |
|---|---|---|
| `fanOut` | `(items, task, { label, concurrency, mapError? }) => Promise<FanOutResult<R, K>>` | label별 병렬 실행. 결과를 `results[label] = { ok, value \| error }`로 모으고 부분실패를 격리 |
| `mapWithConcurrency` | `(items, limit, fn) => Promise<PromiseSettledResult<R>[]>` | 외부 의존 없는 동시성 제한 map. `fanOut`·`paginateWindows`의 저수준 |
| `splitCalendarMonths` | `(start: string, end: string) => DateWindow[]` | YYYYMMDD 구간을 캘린더 월 경계로 분할. data.go.kr 조회기간 한계(종료일 ≤ 시작일 + 1개월)를 지킨다 |
| `dateRangeParams` | `(startDate?, endDate?) => Params` | YYYYMMDD를 `inqryBgnDt`(0000)·`inqryEndDt`(2359)로 변환 |
| `pagingParams` | `(page?, pageSize?) => Params` | `pageNo`(기본 1)·`numOfRows`(기본 10) |
| `errMessage` | `(reason: unknown) => string` | 에러를 표시용 문자열로 축약 |

공개 타입: `DataGoKrConfig`·`RequestConfig`·`SchemaRequestConfig`·`Params`·`DataGoKrClient`·`DataGoKrResponse`·`PaginatedResponse`·`WindowedResponse`·`InvalidItem`·`FailedWindow`·`DateWindow`·`ErrorKind`·`RetryOptions`·`StandardSchemaV1`·`InferOutput`·`RequestContext`·`RequestInterceptorManager`·`ResponseInterceptorManager`·`Outcome`·`FanOutResult`·`TextToolResult`.

## 사용 (서비스 서버에서)

`<service>-mcp` 서버는 클라이언트 하나를 만들고 각 도구 핸들러를 `guard`로 감싼다.

```ts
import dataGoKr, { guard, READONLY, splitCalendarMonths, dateRangeParams } from "@opendata-kr/core";

const client = dataGoKr.create({
  baseURL: "https://apis.data.go.kr/1230000/ad/BidPublicInfoService",
  params: { type: "json" },
});

server.registerTool(
  "search_bids",
  { annotations: READONLY /* inputSchema 등 */ },
  async ({ startDate, endDate }) =>
    guard(async () => {
      const windows = splitCalendarMonths(startDate, endDate);
      const { data, totalCount, failedWindows } = await client.paginateWindows(
        "getBidPblancListInfoCnstwk",
        { params: { inqryDiv: 1 }, windows, pageSize: 50, maxPages: 4, concurrency: 3 },
      );
      return { totalCount, bids: data, failedWindows };
    }),
);
```

필수 요청 파라미터(`inqryDiv`, 조회일시 범위 등)는 감싸는 data.go.kr 서비스마다 다르다. core는 전송·검증만 표준화하고 어떤 파라미터를 보낼지는 각 도구가 정한다. 응답 포맷 파라미터(`type`/`dataType`)도 core가 주입하지 않는다.

## 환경변수

| 이름 | 필수 | 기본값 | 설명 |
|---|---|---|---|
| `DATA_GO_KR_SERVICE_KEY` | 예 (옵션 미지정 시) | (없음) | 공공데이터포털 **Decoding(원본)** 인증키 |
| `DATA_GO_KR_BASE_URL` | 예 (옵션 미지정 시) | (없음) | 서비스 경로를 포함한 전체 URL |
| `DATA_GO_KR_TIMEOUT_MS` | 아니오 | `30000` | 요청 타임아웃(ms). 옵션 `timeout`보다 우선 |

### 주의: Decoding 키를 쓸 것

공공데이터포털은 Encoding과 Decoding 두 키를 준다. core는 쿼리를 만들 때 키를 한 번 인코딩하므로 **Decoding(원본) 키**를 넣어야 한다. Encoding 키를 넣으면 이중 인코딩으로 인증에 실패하고 `serviceKeyLooksPreEncoded`가 `true`가 된다. 이때 인증류 에러 message에는 기본 인터셉터가 Decoding 키 안내를 붙여 준다.

## License

MIT
