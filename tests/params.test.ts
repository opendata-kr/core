import { describe, it, expect } from "vitest";
import { dateRangeParams, pagingParams } from "../src/params.js";

describe("dateRangeParams", () => {
  it("시작·종료를 0000/2359로 변환", () => {
    expect(dateRangeParams("20260101", "20260131")).toEqual({ inqryBgnDt: "202601010000", inqryEndDt: "202601312359" });
  });
  it("한쪽만 주면 그쪽만", () => {
    expect(dateRangeParams("20260101")).toEqual({ inqryBgnDt: "202601010000" });
    expect(dateRangeParams(undefined, "20260131")).toEqual({ inqryEndDt: "202601312359" });
  });
});
describe("pagingParams", () => {
  it("기본값 pageNo 1·numOfRows 10", () => {
    expect(pagingParams()).toEqual({ pageNo: 1, numOfRows: 10 });
  });
  it("지정값 반영", () => {
    expect(pagingParams(3, 50)).toEqual({ pageNo: 3, numOfRows: 50 });
  });
});
