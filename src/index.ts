import { create } from "./client.js";
import { isError } from "./errors.js";

// axios 관례의 default 네임스페이스. create·isError는 이 네임스페이스 경유로만 노출한다.
const dataGoKr = { create, isError };
export default dataGoKr;

export { fanOut } from "./fanOut.js";
export { mapWithConcurrency } from "./concurrency.js";
export { splitCalendarMonths } from "./windows.js";
export { dateRangeParams, pagingParams } from "./params.js";
export { errMessage } from "./errMessage.js";
export { DataGoKrError } from "./errors.js";
export { textResult, guard, READONLY } from "./mcp.js";
export { createCallLogger } from "./callLogger.js";

export type {
  DataGoKrConfig,
  RequestConfig,
  SchemaRequestConfig,
  Params,
  DataGoKrClient,
  RetryOptions,
} from "./client.js";
export type {
  DataGoKrResponse,
  PaginatedResponse,
  WindowedResponse,
  InvalidItem,
  FailedWindow,
} from "./response.js";
export type { DateWindow } from "./windows.js";
export type { ErrorKind } from "./errors.js";
export type { StandardSchemaV1, InferOutput } from "./standardSchema.js";
export type {
  RequestContext,
  RequestInterceptorManager,
  ResponseInterceptorManager,
} from "./interceptors.js";
export type { Outcome, FanOutResult } from "./fanOut.js";
export type { TextToolResult } from "./mcp.js";
export type { CallLogger, CallLoggerOptions } from "./callLogger.js";
