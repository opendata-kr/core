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

ESM 전용 패키지다(CJS `require` 미지원). 타입 선언(`.d.ts`)이 포함된다. 런타임 의존성은 없다. Node 20 이상을 요구하고(`engines`) 개발·CI는 Node 24(`.nvmrc`)를 쓴다.

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

### `createCallLogger(options): CallLogger`

도구 호출의 전 과정을 구조화 이벤트(jsonl)로 로컬 파일에 적재하는 호출 로거를 만든다. 프로세스당 1회 만들고 각 도구 핸들러를 `logger.tool`로 감싼다. 취소·실패 호출의 사후 재구성과 upstream 지연 분포 축적에 쓴다.

```ts
interface CallLoggerOptions {
  app: string; // 로그 파일명이 되는 서버 식별자 (예: "narajangteo-bid-mcp")
  dir?: string; // 테스트 주입용 경로 오버라이드
  env?: Record<string, string | undefined>; // 테스트 주입용, 기본 process.env
}

interface CallLogger {
  readonly enabled: boolean; // off·경로 해석 실패 시 false
  readonly file: string | undefined; // 활성 시 현재 로그 파일 절대경로
  tool<A>(
    name: string,
    run: (args: A) => Promise<unknown>,
  ): (args: A, extra?: { signal?: AbortSignal }) => Promise<TextToolResult>;
  flush(): Promise<void>; // 대기 중 쓰기 완료 대기 (테스트·종료용)
}
```

```ts
import dataGoKr, { createCallLogger, READONLY } from "@opendata-kr/core";

const logger = createCallLogger({ app: "narajangteo-bid-mcp" });

server.registerTool(
  "search_bids",
  { annotations: READONLY /* inputSchema 등 */ },
  logger.tool("search_bids", async (args) => run(client, args)),
);
```

- `logger.tool`은 `guard`의 변환을 재사용한다. 성공 payload는 `textResult`로 감싸고 예외는 `isError` 응답으로 바꾼다. `run`이 완성된 `TextToolResult`를 반환하면 재래핑 없이 통과시킨다. 비활성 로거도 이 변환·반환 계약을 유지하고 기록만 생략한다.
- 이벤트는 라인당 1건이고 `callId`로 상관된다. `call_start`(도구명·인자) → `upstream`(dataGoKr 클라이언트 경유 요청마다 `op`·`params`·`attempt`·`ms`·`ok`와 성공 시 건수, 실패 시 에러) → `cancelled`(`extra.signal` abort 수신 즉시) → `call_end`(`outcome`·`ms`). 취소돼도 핸들러는 중단하지 않고, 취소 후 정착하면 `call_end`에 `afterCancel: true`가 남는다.
- 서비스키는 모든 이벤트에서 마스킹된다. `serviceKey` 파라미터 키를 제거하고 키 원문·URL 인코딩 변형을 `***`로 치환한다. 응답 본문(rawBody)은 기록하지 않는다.
- 파일은 `<dir>/<app>.<기동 epoch 초>-<pid>.jsonl`이다. 프로세스마다 자기 파일에만 쓰고, 5 MiB를 넘으면 새 파일로 전환하며, 기동 시 수정 시각 7일 초과분과 최신 8개 초과분을 삭제한다. 한 앱의 로그는 `<app>.*.jsonl` 전체를 수정 시각순으로 병합해 읽는다.
- 경로 우선순위는 `OPENDATA_LOG=off`(비활성) > `dir` 옵션 > env `OPENDATA_LOG_DIR` > 플랫폼 기본(macOS `~/Library/Logs/opendata-kr`, Windows `%LOCALAPPDATA%\opendata-kr\Log`, Linux `$XDG_STATE_HOME/opendata-kr`, 미설정 시 `~/.local/state/opendata-kr`)이다.
- 로깅 실패는 도구 경로로 전파되지 않는다. 경로 해석·디렉터리 생성·쓰기 실패는 stderr 경고 1회 후 비활성으로 전환하고 서버는 계속 동작한다. stdout에는 쓰지 않는다(stdio 전송 보호).

### 조합 프리미티브

| export | 시그니처 | 설명 |
|---|---|---|
| `fanOut` | `(items, task, { label, concurrency, mapError? }) => Promise<FanOutResult<R, K>>` | label별 병렬 실행. 결과를 `results[label] = { ok, value \| error }`로 모으고 부분실패를 격리 |
| `mapWithConcurrency` | `(items, limit, fn) => Promise<PromiseSettledResult<R>[]>` | 외부 의존 없는 동시성 제한 map. `fanOut`·`paginateWindows`의 저수준 |
| `splitCalendarMonths` | `(start: string, end: string) => DateWindow[]` | YYYYMMDD 구간을 캘린더 월 경계로 분할. data.go.kr 조회기간 한계(종료일 ≤ 시작일 + 1개월)를 지킨다 |
| `dateRangeParams` | `(startDate?, endDate?) => Params` | YYYYMMDD를 `inqryBgnDt`(0000)·`inqryEndDt`(2359)로 변환 |
| `pagingParams` | `(page?, pageSize?) => Params` | `pageNo`(기본 1)·`numOfRows`(기본 10) |
| `errMessage` | `(reason: unknown) => string` | 에러를 표시용 문자열로 축약 |

공개 타입: `DataGoKrConfig`·`RequestConfig`·`SchemaRequestConfig`·`Params`·`DataGoKrClient`·`DataGoKrResponse`·`PaginatedResponse`·`WindowedResponse`·`InvalidItem`·`FailedWindow`·`DateWindow`·`ErrorKind`·`RetryOptions`·`StandardSchemaV1`·`InferOutput`·`RequestContext`·`RequestInterceptorManager`·`ResponseInterceptorManager`·`Outcome`·`FanOutResult`·`TextToolResult`·`CallLogger`·`CallLoggerOptions`.

## 사용 (서비스 서버에서)

### 응답 스키마 작성

data.go.kr 응답은 같은 서비스 안에서도 오퍼레이션마다 필드 구성이 다르고, 예고 없이 필드가 늘거나 숫자·문자열 타입이 섞인다. 스키마를 엄격하게 짜면 API의 사소한 요동마다 item이 탈락한다. 그래서 관용적으로 짠다.

- `z.looseObject`를 기본으로 쓴다. 선언하지 않은 필드는 통과시키고, 선언한 필드만 검증한다. `z.object`는 미지 필드를 벗겨내므로 쓰지 않는다.
- 숫자로도 문자열로도 올 수 있는 필드(금액·건수)는 `z.coerce.string()`으로 수렴시킨다.
- 항상 온다고 확신할 수 없는 필드는 `optional()`로 둔다. 필수는 조인 키(공고번호 등)처럼 없으면 item이 무의미한 필드만.

```ts
const Bid = z.looseObject({
  bidNtceNo: z.string(),                       // 조인 키. 없으면 무의미하므로 필수
  bidNtceNm: z.string().optional(),
  presmptPrce: z.coerce.string().optional(),   // 숫자로 와도 문자열로 수렴
});
```

검증에서 탈락한 item은 에러가 아니라 `invalid` 배열로 격리된다(성공분은 `data`로 정상 반환). 두 곳에서 소비한다.

- 도구 응답에 `invalid.length`를 노출하면 필드 드리프트가 사용자 눈에 보인다.
- 라이브 검증·CI에서는 `invalid.length > 0`을 실패로 승격시켜 스키마와 실제 응답의 어긋남을 즉시 잡는다.

### 도구 핸들러

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

### 업무구분 병렬 검색 (fanOut)

하나의 질문이 여러 오퍼레이션에 걸치는 경우(공사·용역·물품을 한 번에 검색)는 `fanOut`으로 병렬 호출하고 부분 실패를 격리한다. 한 구분이 실패해도 나머지 결과는 산다.

```ts
import dataGoKr, { fanOut, errMessage } from "@opendata-kr/core";

const kinds = ["cnstwk", "servc", "thng"] as const;
const opOf = { cnstwk: "getBidPblancListInfoCnstwk", servc: "getBidPblancListInfoServc", thng: "getBidPblancListInfoThng" };

const { results, anySucceeded } = await fanOut(
  kinds,
  (kind) => client.get(opOf[kind], { params: { inqryDiv: 1, pageNo: 1, numOfRows: 20 }, schema: Bid }),
  { label: (kind) => kind, concurrency: kinds.length },
);

// label이 리터럴 유니온으로 보존되어 results.cnstwk에 자동완성이 붙는다
if (results.cnstwk.ok) {
  results.cnstwk.value.data;     // Bid[] (스키마 타입 그대로)
} else {
  results.cnstwk.error;          // 실패 사유 문자열 (키 힌트는 이미 부착됨)
}
```

에러 문자열화는 기본으로 `errMessage`가 적용되고, 인증류 에러의 Decoding 키 안내는 기본 인터셉터가 이미 message에 붙였으므로 별도 조립이 필요 없다.

## 환경변수

| 이름 | 필수 | 기본값 | 설명 |
|---|---|---|---|
| `DATA_GO_KR_SERVICE_KEY` | 예 (옵션 미지정 시) | (없음) | 공공데이터포털 **Decoding(원본)** 인증키 |
| `DATA_GO_KR_BASE_URL` | 예 (옵션 미지정 시) | (없음) | 서비스 경로를 포함한 전체 URL |
| `DATA_GO_KR_TIMEOUT_MS` | 아니오 | `30000` | 요청 타임아웃(ms). 옵션 `timeout`보다 우선 |
| `OPENDATA_LOG` | 아니오 | (없음) | `off`면 호출 로거 비활성(무경고) |
| `OPENDATA_LOG_DIR` | 아니오 | 플랫폼 로그 경로 | 호출 로그 디렉터리 오버라이드 |

### 주의: Decoding 키를 쓸 것

공공데이터포털은 Encoding과 Decoding 두 키를 준다. core는 쿼리를 만들 때 키를 한 번 인코딩하므로 **Decoding(원본) 키**를 넣어야 한다. Encoding 키를 넣으면 이중 인코딩으로 인증에 실패하고 `serviceKeyLooksPreEncoded`가 `true`가 된다. 이때 인증류 에러 message에는 기본 인터셉터가 Decoding 키 안내를 붙여 준다.

## License

MIT
