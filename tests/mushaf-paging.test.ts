import { describe, it, expect } from "vitest";
import {
  TOTAL_PAGES,
  RTL_PAGING,
  pageToIndex,
  indexToPage,
} from "@/lib/mushaf-paging";

describe("mushaf paging — RTL page/index geometry", () => {
  it("covers all 604 Madinah pages", () => {
    expect(TOTAL_PAGES).toBe(604);
  });

  it("is a lossless round-trip for every page", () => {
    // The FlatList maps page<->index both ways (scrollToIndex on jump,
    // index->page on momentum end); a mismatch would land on the wrong page.
    for (let page = 1; page <= TOTAL_PAGES; page++) {
      expect(indexToPage(pageToIndex(page))).toBe(page);
    }
  });

  it("maps every index back to a valid page and back", () => {
    for (let index = 0; index < TOTAL_PAGES; index++) {
      const page = indexToPage(index);
      expect(page).toBeGreaterThanOrEqual(1);
      expect(page).toBeLessThanOrEqual(TOTAL_PAGES);
      expect(pageToIndex(page)).toBe(index);
    }
  });

  it("places page 1 at the right end under RTL (reversed data, no transform)", () => {
    // RTL_PAGING reverses the data so page 1 is the LAST index (right end) and
    // page 604 is index 0 — the printed-mushaf direction. If this flips, the
    // whole reader reads backwards (the one device-test toggle).
    expect(RTL_PAGING).toBe(true);
    expect(pageToIndex(1)).toBe(TOTAL_PAGES - 1); // 603
    expect(pageToIndex(TOTAL_PAGES)).toBe(0);
    expect(indexToPage(0)).toBe(TOTAL_PAGES);
    expect(indexToPage(TOTAL_PAGES - 1)).toBe(1);
  });
});
