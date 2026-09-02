import { describe, it, expect, vi, beforeEach } from "vitest";
const store = new Map<string, string>();
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn(async (k: string) => store.get(k) ?? null),
    setItem: vi.fn(async (k: string, v: string) => { store.set(k, v); }),
    removeItem: vi.fn(async (k: string) => { store.delete(k); }),
  },
}));
import { haidExcusedKey, readExcusedState, writeExcusedState, clearExcusedState, deriveExcusedAfterWrite } from "../lib/haid-state";

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

// C8: an ifAbsent no-op ({written:false} — today's row already existed) must
// never be read as "she is excused". The caller (prayer-popup-modal.tsx)
// refetches getMine only in that case; this is what it derives from it.
describe("deriveExcusedAfterWrite (C8)", () => {
  const today = "2026-09-02";
  const settings = { enabled: true, habitLength: 7, contraception: false, ghuslReminder: true };

  it("written:true — trusts the fresh write, no refetch needed", () => {
    expect(deriveExcusedAfterWrite(true, null, today)).toEqual({ excused: true, until: today });
  });

  it("written:false with no fresh data (refetch failed) — skips, never assumes excused", () => {
    expect(deriveExcusedAfterWrite(false, null, today)).toBeNull();
  });

  it("written:false, tracker disabled — skips", () => {
    expect(deriveExcusedAfterWrite(false, { enabled: false, settings: null, days: [] }, today)).toBeNull();
  });

  it("written:false, today genuinely IS haid per the real classified state — writes the real (not assumed) state", () => {
    const days = [{ date: "2026-09-01", flow: "blood" }, { date: today, flow: "blood" }];
    const state = deriveExcusedAfterWrite(false, { enabled: true, settings, days }, today);
    expect(state).toEqual({ excused: true, until: "2026-09-07" });
  });

  it("written:false, today is NOT excused (e.g. already logged dry) — skips instead of forcing true", () => {
    const days = [{ date: today, flow: "dry" }];
    expect(deriveExcusedAfterWrite(false, { enabled: true, settings, days }, today)).toBeNull();
  });
});
