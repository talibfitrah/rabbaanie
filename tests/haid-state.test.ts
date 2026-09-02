import { describe, it, expect, vi, beforeEach } from "vitest";
const store = new Map<string, string>();
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn(async (k: string) => store.get(k) ?? null),
    setItem: vi.fn(async (k: string, v: string) => { store.set(k, v); }),
    removeItem: vi.fn(async (k: string) => { store.delete(k); }),
  },
}));
import { haidExcusedKey, readExcusedState, writeExcusedState, clearExcusedState } from "../lib/haid-state";

describe("haid excused flag", () => {
  beforeEach(() => store.clear());
  it("is account-keyed and round-trips", async () => {
    expect(haidExcusedKey(5)).toBe("@haid_excused_5");
    await writeExcusedState(5, { excused: true, until: "2999-01-01" });
    expect(await readExcusedState(5)).toEqual({ excused: true, until: "2999-01-01" });
    expect(await readExcusedState(6)).toEqual({ excused: false });
  });
  it("an expired `until` reads as not excused; clear removes it", async () => {
    await writeExcusedState(5, { excused: true, until: "2000-01-01" });
    expect(await readExcusedState(5)).toEqual({ excused: false });
    await writeExcusedState(5, { excused: true, until: "2999-01-01" });
    await clearExcusedState(5);
    expect(store.has("@haid_excused_5")).toBe(false);
  });
});
