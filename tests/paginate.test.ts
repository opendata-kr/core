import { describe, it, expect, vi } from "vitest";
import { fetchAllPages } from "../src/paginate.js";

describe("fetchAllPages", () => {
  it("totalCount까지 페이지를 소진해 합친다", async () => {
    const call = vi.fn()
      .mockResolvedValueOnce({ totalCount: 3, pageNo: 1, items: [{ a: "1" }, { a: "2" }] })
      .mockResolvedValueOnce({ totalCount: 3, pageNo: 2, items: [{ a: "3" }] });
    const r = await fetchAllPages(call as never, "op", {}, { pageSize: 2, maxPages: 10 });
    expect(r.items.map((i) => i.a)).toEqual(["1", "2", "3"]);
    expect(r.totalCount).toBe(3);
    expect(r.truncated).toBe(false);
    expect(call).toHaveBeenCalledTimes(2);
  });
  it("maxPages 초과 시 truncated=true", async () => {
    const call = vi.fn().mockResolvedValue({ totalCount: 100, pageNo: 1, items: [{ a: "x" }] });
    const r = await fetchAllPages(call as never, "op", {}, { pageSize: 1, maxPages: 2 });
    expect(r.items).toHaveLength(2);
    expect(r.truncated).toBe(true);
  });
});
