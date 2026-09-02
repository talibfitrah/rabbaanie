import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Mocks (hoisted, same pattern as tests/daily-diagnostic.test.ts) ──
const dbMocks = vi.hoisted(() => ({
  getUserById: vi.fn(),
  getPartnersOfUser: vi.fn(),
  getCycleSettings: vi.fn(),
  listCycleDays: vi.fn(),
  upsertCycleDay: vi.fn(),
  deleteCycleDay: vi.fn(),
  deleteAllCycleDays: vi.fn(),
  saveCycleSettings: vi.fn(),
  disableCycleTracker: vi.fn(),
}));

vi.mock("../server/db", () => dbMocks);

import { cycleRouter } from "../server/cycle";

const context = (overrides: any = {}) => ({
  req: {} as any,
  res: {} as any,
  user: { id: 1, name: "Test User", language: "ar", profileData: {}, ...overrides },
});
const call = (userId: number) => cycleRouter.createCaller(context({ id: userId }));

// 1 = husband (man), 2/3 = his wives (vrouw), 4 = ex-husband (man)
const genders: Record<number, string> = { 1: "man", 2: "vrouw", 3: "vrouw", 4: "man" };
// getPartnersOfUser's real PartnerRecord (server/db.ts) keys the partner by
// `id`, not `userId` — confirmed against getPartnersOfUser's own type and
// against tests/daily-diagnostic.test.ts's mocks of the same function.
const partners: Record<number, Array<{ id: number; partnershipConfirmed: boolean }>> = {
  1: [{ id: 2, partnershipConfirmed: true }, { id: 3, partnershipConfirmed: true }], // husband of 2 and 3
  4: [], // ex-husband: dissolved partnership → not listed
};
// Per-wife fixtures: wife 2 has enabled the tracker, wife 3 has not.
const cycleSettingsByUser: Record<number, any> = {
  2: { userId: 2, enabled: true },
  3: { userId: 3, enabled: false },
};
const cycleDaysByUser: Record<number, any[]> = {
  2: [{ userId: 2, date: "2026-09-01", flow: "blood", color: null, ghusl: false }],
};

beforeEach(() => {
  vi.clearAllMocks();
  dbMocks.getUserById.mockImplementation(async (id: number) => ({ id, gender: genders[id] ?? "", profileData: {} }));
  dbMocks.getPartnersOfUser.mockImplementation(async (id: number) => partners[id] ?? []);
  dbMocks.getCycleSettings.mockImplementation(async (id: number) => cycleSettingsByUser[id] ?? null);
  dbMocks.listCycleDays.mockImplementation(async (id: number) => cycleDaysByUser[id] ?? []);
  dbMocks.upsertCycleDay.mockResolvedValue({ written: true });
  dbMocks.deleteAllCycleDays.mockResolvedValue(undefined);
  dbMocks.disableCycleTracker.mockResolvedValue(undefined);
  dbMocks.saveCycleSettings.mockImplementation(async (id: number, patch: any) => ({ userId: id, ...patch }));
});

describe("cycle router access", () => {
  it("husband reads his wife's data (no profile-access grant needed)", async () => {
    const r = await call(1).getPartner({ partnerId: 2 });
    expect(r.enabled).toBe(true);
    expect(r.days).toHaveLength(1);
  });

  it("a wife cannot read her co-wife", async () => {
    await expect(call(2).getPartner({ partnerId: 3 })).rejects.toThrow(/FORBIDDEN|not allowed/i);
  });

  it("a wife cannot read her husband", async () => {
    await expect(call(2).getPartner({ partnerId: 1 })).rejects.toThrow(/FORBIDDEN|not allowed/i);
  });

  it("a male target is refused even when the caller is a man", async () => {
    await expect(call(1).getPartner({ partnerId: 4 })).rejects.toThrow(/FORBIDDEN|not allowed/i);
  });

  it("an ex-husband (dissolved partnership) is refused", async () => {
    await expect(call(4).getPartner({ partnerId: 2 })).rejects.toThrow(/FORBIDDEN|not allowed/i);
  });

  it("a not-enabled target returns the shut shape, not her (absent) settings", async () => {
    const r = await call(1).getPartner({ partnerId: 3 });
    expect(r).toEqual({ enabled: false, settings: null, days: [] });
  });

  it("per-wife rows: each wife's data is independent", async () => {
    const w2 = await call(1).getPartner({ partnerId: 2 });
    const w3 = await call(1).getPartner({ partnerId: 3 });
    expect(w2.enabled).toBe(true);
    expect(w2.days).toHaveLength(1);
    expect(w3).toEqual({ enabled: false, settings: null, days: [] });
  });

  it("a man cannot write cycle days", async () => {
    await expect(call(1).upsertDay({ date: "2026-09-01", flow: "blood" })).rejects.toThrow(/FORBIDDEN|women/i);
  });

  it("a woman can write and read her own days", async () => {
    await expect(call(2).upsertDay({ date: "2026-09-01", flow: "blood" })).resolves.toEqual({ written: true });
    const mine = await call(2).getMine();
    expect(mine.enabled).toBe(true);
  });

  it("saveSettings({enabled:false}) is rejected — disabling only goes through disable()", async () => {
    await expect(call(2).saveSettings({ enabled: false } as any)).rejects.toThrow();
  });

  it("an invalid calendar date is rejected (regex-shaped but not real, e.g. Feb 30)", async () => {
    await expect(call(2).upsertDay({ date: "2026-02-30", flow: "blood" })).rejects.toThrow();
  });

  it("a colour on a non-blood flow is rejected", async () => {
    await expect(call(2).upsertDay({ date: "2026-09-01", flow: "dry", color: "red" } as any)).rejects.toThrow();
  });

  it("writes are refused with PRECONDITION_FAILED when the tracker is not enabled", async () => {
    dbMocks.getCycleSettings.mockResolvedValueOnce({ userId: 2, enabled: false });
    await expect(call(2).upsertDay({ date: "2026-09-01", flow: "blood" })).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });

  it("ifAbsent is a no-op against an existing row", async () => {
    dbMocks.upsertCycleDay.mockResolvedValueOnce({ written: false });
    const r = await call(2).upsertDay({ date: "2026-09-01", flow: "blood", ifAbsent: true });
    expect(r).toEqual({ written: false });
    expect(dbMocks.upsertCycleDay).toHaveBeenCalledWith(2, { date: "2026-09-01", flow: "blood" }, true);
  });

  it("disable deletes her rows (disableCycleTracker)", async () => {
    await call(2).disable();
    expect(dbMocks.disableCycleTracker).toHaveBeenCalledWith(2);
  });
});
