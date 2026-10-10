import { describe, expect, it } from "vitest";
import { parsePageParam, paginationOffsets, totalPageCount } from "@/lib/pagination";

describe("parsePageParam", () => {
  it("defaults to page 1 when the param is absent", () => {
    expect(parsePageParam(undefined)).toBe(1);
  });

  it("parses a valid page number", () => {
    expect(parsePageParam("3")).toBe(3);
  });

  it("takes the first value when the param is repeated", () => {
    expect(parsePageParam(["2", "5"])).toBe(2);
  });

  it("falls back to 1 for zero, negative, or garbage input", () => {
    expect(parsePageParam("0")).toBe(1);
    expect(parsePageParam("-4")).toBe(1);
    expect(parsePageParam("not-a-number")).toBe(1);
  });

  it("truncates a decimal to its integer part, like parseInt does", () => {
    expect(parsePageParam("2.5")).toBe(2);
  });
});

describe("paginationOffsets / totalPageCount", () => {
  it("computes skip/take for a given page and page size", () => {
    expect(paginationOffsets(1, 20)).toEqual({ skip: 0, take: 20 });
    expect(paginationOffsets(2, 20)).toEqual({ skip: 20, take: 20 });
    expect(paginationOffsets(3, 20)).toEqual({ skip: 40, take: 20 });
  });

  it("rounds the total page count up, and never reports zero pages for an empty list", () => {
    expect(totalPageCount(45, 20)).toBe(3);
    expect(totalPageCount(40, 20)).toBe(2);
    expect(totalPageCount(0, 20)).toBe(1);
  });
});

describe("offset pagination — consistent total across consecutive pages (no concurrent writes)", () => {
  /**
   * The documented tradeoff (see pagination.ts) is that offset pagination
   * can drift if rows are inserted/removed between two page loads. This
   * test pins down the case the brief asks to at least verify: against a
   * dataset that doesn't change between calls, paging through every page
   * reconstructs the exact original list — no row skipped, none repeated,
   * and the last page is never short by the wrong amount.
   */
  it("reconstructs the full ordered dataset with no gaps or duplicates across all pages", () => {
    const dataset = Array.from({ length: 45 }, (_, i) => `row-${i}`);
    const pageSize = 20;
    const pages = totalPageCount(dataset.length, pageSize);

    const reconstructed: string[] = [];
    for (let page = 1; page <= pages; page++) {
      const { skip, take } = paginationOffsets(page, pageSize);
      reconstructed.push(...dataset.slice(skip, skip + take));
    }

    expect(reconstructed).toEqual(dataset);
    expect(new Set(reconstructed).size).toBe(dataset.length);
  });

  it("the last page holds exactly the remainder, not a full page of padding", () => {
    const dataset = Array.from({ length: 45 }, (_, i) => `row-${i}`);
    const { skip, take } = paginationOffsets(totalPageCount(dataset.length, 20), 20);

    expect(dataset.slice(skip, skip + take)).toHaveLength(5);
  });
});
