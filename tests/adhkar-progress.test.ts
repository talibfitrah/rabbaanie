import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn().mockResolvedValue(null),
    setItem: vi.fn().mockResolvedValue(undefined),
  },
}));

import AsyncStorage from "@react-native-async-storage/async-storage";
import { loadAdhkarProgress, saveAdhkarProgress } from "../lib/adhkar-progress";
import { ADHKAR_CATEGORIES, categoryTitle } from "../lib/adhkar-data";

describe("adhkar progress persists per local day", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("round-trips today's counts through storage", async () => {
    await saveAdhkarProgress({ morning_1: 3 });
    const [key, raw] = (AsyncStorage.setItem as any).mock.calls[0];
    expect(key).toBe("@adhkar_progress");
    (AsyncStorage.getItem as any).mockResolvedValue(raw);
    expect(await loadAdhkarProgress()).toEqual({ morning_1: 3 });
  });

  it("drops the after_every_prayer ids, which recur five times a day", async () => {
    const id = ADHKAR_CATEGORIES.find((c) => c.id === "after_every_prayer")!.adhkar[0].id;
    await saveAdhkarProgress({ [id]: 1, morning_x: 2 });
    const [, raw] = (AsyncStorage.setItem as any).mock.calls[0];
    expect(JSON.parse(raw).counts).toEqual({ morning_x: 2 });
  });

  it("discards counts saved on an earlier day", async () => {
    (AsyncStorage.getItem as any).mockResolvedValue('{"day":"2000-01-01","counts":{"morning_1":3}}');
    expect(await loadAdhkarProgress()).toEqual({});
  });
});

// Source-level guards (no renderer is installed; same style as tests/i18n-leaks.test.ts).
describe("app/details/adhkar.tsx wires the persistence", () => {
  const src = readFileSync(join(__dirname, "..", "app", "details", "adhkar.tsx"), "utf8");

  it("loads and saves through lib/adhkar-progress", () => {
    expect(src).toContain("loadAdhkarProgress(");
    expect(src).toContain("saveAdhkarProgress(");
  });

  it("ignores a tap until the stored counts have loaded", () => {
    // Otherwise the tap saves {X:1} over today's counts and the stale load
    // then overwrites it in state.
    expect(src).toMatch(/!\w+\.current\)\s*return prev/);
  });
});

describe("categoryTitle", () => {
  const cat = ADHKAR_CATEGORIES[0];

  it("picks the title for the UI language", () => {
    expect(categoryTitle(cat, "nl")).toBe(cat.titleNL);
    expect(categoryTitle(cat, "en")).toBe(cat.titleEN);
    expect(categoryTitle(cat, "ar")).toBe(cat.title);
  });

  it("falls back to the Arabic title when the localized field is empty", () => {
    expect(categoryTitle({ ...cat, titleNL: "" }, "nl")).toBe(cat.title);
  });
});
