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
}));

vi.mock("../server/db", () => dbMocks);

import { cycleRouter } from "../server/cycle";

const context = (overrides: any = {}) => ({
  req: {} as any,
  res: {} as any,
  user: { id: 1, name: "Test User", language: "ar", profileData: {}, ...overrides },
});
const call = (userId: number) => cycleRouter.createCaller(context({ id: userId }));

const genders: Record<number, string> = { 1: "man", 2: "vrouw", 3: "vrouw", 4: "man" };
// getPartnersOfUser's real PartnerRecord (server/db.ts) keys the partner by
// `id`, not `userId` — confirmed against getPartnersOfUser's own type and
// against tests/daily-diagnostic.test.ts's mocks of the same function.
const partners: Record<number, Array<{ id: number; partnershipConfirmed: boolean }>> = {
  1: [{ id: 2, partnershipConfirmed: true }, { id: 3, partnershipConfirmed: true }], // husband of 2 and 3
  4: [], // ex-husband: dissolved partnership → not listed
};

beforeEach(() => {
  vi.clearAllMocks();
  dbMocks.getUserById.mockImplementation(async (id: number) => ({ id, gender: genders[id] ?? "", profileData: {} }));
  dbMocks.getPartnersOfUser.mockImplementation(async (id: number) => partners[id] ?? []);
  dbMocks.getCycleSettings.mockResolvedValue({ userId: 2, enabled: true });
  dbMocks.listCycleDays.mockResolvedValue([{ userId: 2, date: "2026-09-01", flow: "blood", color: null, ghusl: false, note: null }]);
  dbMocks.upsertCycleDay.mockResolvedValue(undefined);
  dbMocks.deleteAllCycleDays.mockResolvedValue(undefined);
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

  it("an ex-husband (dissolved partnership) is refused", async () => {
    await expect(call(4).getPartner({ partnerId: 2 })).rejects.toThrow(/FORBIDDEN|not allowed/i);
  });

  it("a man cannot write cycle days", async () => {
    await expect(call(1).upsertDay({ date: "2026-09-01", flow: "blood" })).rejects.toThrow(/FORBIDDEN|women/i);
  });

  it("a woman can write and read her own days", async () => {
    await expect(call(2).upsertDay({ date: "2026-09-01", flow: "blood" })).resolves.toBeUndefined();
    const mine = await call(2).getMine();
    expect(mine.enabled).toBe(true);
  });

  it("disable deletes her rows", async () => {
    await call(2).disable();
    expect(dbMocks.deleteAllCycleDays).toHaveBeenCalledWith(2);
    expect(dbMocks.saveCycleSettings).toHaveBeenCalledWith(2, { enabled: false });
  });
});
