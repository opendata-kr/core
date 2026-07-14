import { resolveConfig } from "./config.js";
import { normalizeResultCode, DataGoKrError, isError } from "./errors.js";
import {
  RequestInterceptorManager,
  ResponseInterceptorManager,
  type EnvelopeResponse,
} from "./interceptors.js";
import type {
  DataGoKrResponse,
  PaginatedResponse,
  WindowedResponse,
  InvalidItem,
  FailedWindow,
} from "./response.js";
import type { StandardSchemaV1 } from "./standardSchema.js";
import type { DateWindow } from "./windows.js";
import { mapWithConcurrency } from "./concurrency.js";
import { errMessage } from "./errMessage.js";

export interface RetryOptions {
  retries?: number;
  baseDelayMs?: number;
  jitterMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

export interface DataGoKrConfig {
  // 서비스 경로를 포함한 전체 URL (예: https://apis.data.go.kr/1230000/ad/BidPublicInfoService).
  // 생략 시 환경변수 DATA_GO_KR_BASE_URL. 둘 다 없으면 즉시 에러.
  baseURL?: string;
  serviceKey?: string;
  params?: Record<string, string | number>;
  timeout?: number;
  retry?: RetryOptions;
  fetch?: typeof fetch;
}

export type Params = Record<string, string | number | undefined>;

export interface RequestConfig<T> {
  params?: Params;
  // Standard Schema v1 스키마 (zod 4 스키마를 그대로 받는다). 생략 시 무검증
  // Record<string, unknown>로 흐르고 invalid는 항상 빈 배열이다.
  schema?: StandardSchemaV1<unknown, T>;
}

export interface DataGoKrClient {
  get<T = Record<string, unknown>>(
    op: string,
    config?: RequestConfig<T>,
  ): Promise<DataGoKrResponse<T>>;
  paginate<T = Record<string, unknown>>(
    op: string,
    config: RequestConfig<T> & { pageSize: number; maxPages: number },
  ): Promise<PaginatedResponse<T>>;
  paginateWindows<T = Record<string, unknown>>(
    op: string,
    config: RequestConfig<T> & {
      windows: readonly DateWindow[];
      pageSize: number;
      maxPages: number;
      concurrency: number;
    },
  ): Promise<WindowedResponse<T>>;
  interceptors: {
    request: RequestInterceptorManager;
    response: ResponseInterceptorManager;
  };
  readonly serviceKeyLooksPreEncoded: boolean;
}

// --- 내부 봉투 정규화 (구 envelope.ts에서 이전, 비공개) ---

type RawItem = Record<string, unknown>;

interface RawBody {
  totalCount?: number;
  pageNo?: number;
  items?: RawItem[] | { item?: RawItem | RawItem[] } | "";
}

interface RawApiResponse {
  response?: {
    header?: { resultCode?: string; resultMsg?: string };
    body?: RawBody;
  };
}

// data.go.kr 봉투 변형(배열 직접·items.item 중첩·단건 객체·빈 문자열)을 배열 하나로 정규화한다.
function normalizeItems(items: RawBody["items"]): RawItem[] {
  if (Array.isArray(items)) return items;
  if (items && typeof items === "object" && "item" in items) {
    const it = items.item;
    if (Array.isArray(it)) return it;
    if (it) return [it];
  }
  return [];
}

// --- 기본 키 힌트 인터셉터 (구 keyHint.ts에서 이전) ---

// 인증류 에러 메시지(HTTP 401/403, resultCode 3x, SERVICE_KEY, 인증) 판별.
// Encoding 키를 URL 인코딩하면 이중 인코딩이 되어 인증이 실패하므로 Decoding 키를 쓰라고 안내한다.
const AUTH_LIKE = /HTTP 40[13]|\[3\d\]|SERVICE_KEY|인증/i;
const KEY_HINT =
  " (인증 실패 시 Encoding 키의 이중 인코딩일 수 있습니다. data.go.kr의 Decoding 인증키를 DATA_GO_KR_SERVICE_KEY로 사용하세요.)";

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function isAbort(e: unknown): boolean {
  return e instanceof Error && (e.name === "AbortError" || e.name === "TimeoutError");
}

export function create(config: DataGoKrConfig = {}): DataGoKrClient {
  const { baseURL, serviceKey, serviceKeyLooksPreEncoded, timeout } = resolveConfig(process.env, {
    baseURL: config.baseURL,
    serviceKey: config.serviceKey,
    timeout: config.timeout,
  });
  const defaultParams = config.params ?? {};
  const fetchFn = config.fetch ?? fetch;
  const retry = {
    retries: config.retry?.retries ?? 1,
    baseDelayMs: config.retry?.baseDelayMs ?? 300,
    jitterMs: config.retry?.jitterMs ?? 300,
    sleep: config.retry?.sleep ?? defaultSleep,
  };

  const interceptors = {
    request: new RequestInterceptorManager(),
    response: new ResponseInterceptorManager(),
  };

  // 기본 키 힌트 인터셉터. create()가 onRejected 맨 앞에 설치하므로 소비자 등록분보다 먼저 본다.
  // 사전인코딩 키 + 인증류 에러면 안내를 부착한 새 DataGoKrError로 재던진다(회복 아님).
  interceptors.response.use(undefined, (err) => {
    if (serviceKeyLooksPreEncoded && isError(err) && AUTH_LIKE.test(err.message)) {
      throw new DataGoKrError(err.code, err.resultMsg + KEY_HINT, {
        kind: err.kind,
        httpStatus: err.httpStatus,
        rawBody: err.rawBody,
      });
    }
    throw err;
  });

  function buildUrl(operation: string, params: Params): string {
    const op = operation.replace(/^\/+|\/+$/g, "");
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...defaultParams, ...params })) {
      if (v === undefined) continue;
      qs.set(k, String(v));
    }
    // 호출 레벨 params의 serviceKey가 인스턴스 키를 덮어쓰지 못하게 마지막에 고정한다.
    qs.set("serviceKey", serviceKey);
    return `${baseURL}/${op}?${qs.toString()}`;
  }

  function handleNonJson(text: string, params: Params): EnvelopeResponse {
    const m = text.match(/<returnReasonCode>(\d+)<\/returnReasonCode>/);
    if (m) {
      const code = m[1]!;
      const am = text.match(/<returnAuthMsg>([^<]*)<\/returnAuthMsg>/);
      const norm = normalizeResultCode(code, am?.[1]);
      if (norm.error)
        throw new DataGoKrError(norm.error.code, norm.error.resultMsg, {
          kind: norm.error.kind,
          rawBody: text.slice(0, 300),
        });
      if (norm.noData) {
        const pageNo = Number(params.pageNo ?? defaultParams.pageNo ?? 1);
        return { data: [], totalCount: 0, pageNo, invalid: [] };
      }
    }
    throw new DataGoKrError("", "응답을 JSON으로 해석할 수 없습니다", {
      kind: "unknown",
      rawBody: text.trim().slice(0, 300),
    });
  }

  async function callOnce(operation: string, params: Params): Promise<EnvelopeResponse> {
    const url = buildUrl(operation, params);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    let res: Response;
    try {
      res = await fetchFn(url, { signal: controller.signal });
    } catch (e) {
      if (isAbort(e))
        throw new DataGoKrError("", `요청 시간 초과 (${timeout}ms, operation=${operation})`, {
          kind: "network",
        });
      throw new DataGoKrError(
        "",
        `네트워크 오류 (operation=${operation}): ${errMessage(e)}`,
        { kind: "network" },
      );
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new DataGoKrError("", `data.go.kr HTTP ${res.status} 오류 (operation=${operation})`, {
        kind: "unknown",
        httpStatus: res.status,
        rawBody: body.slice(0, 300),
      });
    }
    const text = await res.text();
    let json: RawApiResponse;
    try {
      json = JSON.parse(text) as RawApiResponse;
    } catch {
      return handleNonJson(text, params);
    }
    const header = json.response?.header;
    const norm = normalizeResultCode(header?.resultCode ?? "", header?.resultMsg);
    if (norm.error)
      throw new DataGoKrError(norm.error.code, norm.error.resultMsg, {
        kind: norm.error.kind,
        rawBody: text.slice(0, 300),
      });
    const bodyOut = json.response?.body;
    return {
      data: norm.noData ? [] : normalizeItems(bodyOut?.items),
      totalCount: bodyOut?.totalCount ?? 0,
      pageNo: bodyOut?.pageNo ?? 1,
      invalid: [],
    };
  }

  // 재시도 1회(기본) 루프. retryable 에러(throttle·network·HTTP 429/5xx)만 재시도한다.
  async function callWithRetry(operation: string, params: Params): Promise<EnvelopeResponse> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await callOnce(operation, params);
      } catch (e) {
        const retryable = e instanceof DataGoKrError ? e.retryable : false;
        if (!retryable || attempt >= retry.retries) throw e;
        await retry.sleep(retry.baseDelayMs + Math.floor(Math.random() * retry.jitterMs));
      }
    }
  }

  // Standard Schema 이슈를 사람이 읽을 문자열로 축약한다 (경로가 있으면 "경로: 메시지").
  function issueToString(issue: StandardSchemaV1.Issue): string {
    const path = issue.path
      ?.map((seg) => String(typeof seg === "object" && seg !== null && "key" in seg ? seg.key : seg))
      .join(".");
    return path ? `${path}: ${issue.message}` : issue.message;
  }

  // 스키마 파싱 (정책 B): 성공 item은 data, 탈락 item은 invalid로 격리하고 throw하지 않는다.
  // InvalidItem.index = 이 호출이 수신한 전체 item 시퀀스의 0기반 위치.
  // validate 자체의 예외·reject는 스키마 구현 결함이므로 격리하지 않고 그대로 전파한다.
  async function parseItems<T>(
    envelope: EnvelopeResponse,
    schema: StandardSchemaV1<unknown, T> | undefined,
  ): Promise<DataGoKrResponse<T>> {
    if (!schema) return envelope as DataGoKrResponse<T>;
    const data: T[] = [];
    const invalid: InvalidItem[] = [...envelope.invalid];
    for (const [index, item] of envelope.data.entries()) {
      let result = schema["~standard"].validate(item);
      if (result instanceof Promise) result = await result;
      if (result.issues) {
        invalid.push({ index, issues: result.issues.map(issueToString), raw: item });
      } else {
        data.push(result.value);
      }
    }
    return { data, totalCount: envelope.totalCount, pageNo: envelope.pageNo, invalid };
  }

  // 파이프라인: request 인터셉터 → URL 조립 → fetch(재시도·타임아웃·비JSON 폴백) → 봉투 정규화
  // → response onFulfilled 체인 → 스키마 파싱 → 반환.
  // 스키마 파싱 이전 단계의 throw만 onRejected 체인을 경유하고, 회복 값은 파싱부터 재진입한다.
  // 파싱 단계의 throw(validate 예외)는 try 밖이므로 체인 없이 호출자로 직행한다(회복 루프 불가).
  async function get<T = Record<string, unknown>>(
    op: string,
    config: RequestConfig<T> = {},
  ): Promise<DataGoKrResponse<T>> {
    let envelope: EnvelopeResponse;
    try {
      const ctx = await interceptors.request.run({ op, params: config.params ?? {} });
      const raw = await callWithRetry(ctx.op, ctx.params);
      envelope = await interceptors.response.runFulfilled(raw);
    } catch (err) {
      // 회복 실패면 runRejected가 최종 에러를 그대로 전파한다.
      ({ recovered: envelope } = await interceptors.response.runRejected(err));
    }
    return parseItems(envelope, config.schema);
  }

  // 순차 페이지 소진. 종료 판정의 수신 item 수는 data + invalid 합산이다
  // (invalid는 격리일 뿐 수신 사실은 유지). totalCount는 API 보고값 그대로.
  // 페이지 호출은 자기 get 경유라 인터셉터·기본 키 힌트를 동일하게 통과한다.
  async function paginate<T = Record<string, unknown>>(
    op: string,
    config: RequestConfig<T> & { pageSize: number; maxPages: number },
  ): Promise<PaginatedResponse<T>> {
    const data: T[] = [];
    const invalid: InvalidItem[] = [];
    let totalCount = 0;
    let received = 0;
    for (let page = 1; page <= config.maxPages; page++) {
      const r = await get(op, {
        params: { ...config.params, pageNo: page, numOfRows: config.pageSize },
        schema: config.schema,
      });
      totalCount = r.totalCount;
      data.push(...r.data);
      // 페이지 내 index를 호출 단위 누적 수신 위치로 재계산한다.
      invalid.push(...r.invalid.map((v) => ({ ...v, index: received + v.index })));
      const pageReceived = r.data.length + r.invalid.length;
      received += pageReceived;
      if (received >= totalCount || pageReceived === 0) {
        return { data, totalCount, pageNo: 1, invalid, truncated: false };
      }
    }
    return { data, totalCount, pageNo: 1, invalid, truncated: true };
  }

  // 날짜 창 병렬 소진. 창 하나가 (재시도 후에도) 실패하면 그 창만 failedWindows로 격리한다.
  // 합산·invalid index 재계산은 windows 배열 등록순 기준이다 (mapWithConcurrency가
  // 결과를 입력 index 자리에 두므로 병렬 완료순과 무관하게 결정적이다).
  async function paginateWindows<T = Record<string, unknown>>(
    op: string,
    config: RequestConfig<T> & {
      windows: readonly DateWindow[];
      pageSize: number;
      maxPages: number;
      concurrency: number;
    },
  ): Promise<WindowedResponse<T>> {
    const settled = await mapWithConcurrency(config.windows, config.concurrency, (w) =>
      paginate(op, {
        params: { ...config.params, inqryBgnDt: w.bgn, inqryEndDt: w.end },
        schema: config.schema,
        pageSize: config.pageSize,
        maxPages: config.maxPages,
      }),
    );

    const data: T[] = [];
    const invalid: InvalidItem[] = [];
    let totalCount = 0;
    let truncated = false;
    const failedWindows: FailedWindow[] = [];
    let received = 0;

    settled.forEach((s, i) => {
      if (s.status === "fulfilled") {
        data.push(...s.value.data);
        invalid.push(...s.value.invalid.map((v) => ({ ...v, index: received + v.index })));
        received += s.value.data.length + s.value.invalid.length;
        totalCount += s.value.totalCount;
        truncated = truncated || s.value.truncated;
      } else {
        failedWindows.push({ window: config.windows[i]!, error: errMessage(s.reason) });
      }
    });

    return { data, totalCount, pageNo: 1, invalid, truncated, failedWindows };
  }

  return { get, paginate, paginateWindows, interceptors, serviceKeyLooksPreEncoded };
}
