import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Parity copy of docs/superpowers/plans/2026-09-02-haid-tracker-server.md
 * Task S6 Step 2, adapted to this repo's two established test harnesses:
 *  - router layer: the wholesale `../server/db` mock from
 *    tests/cycle-router-access.test.ts.
 *  - db.ts layer: the real server/db.ts (via vi.importActual) against a
 *    fake `drizzle-orm/mysql2`, same technique as the `partnershipDb` fake
 *    in tests/partner-profile-access.test.ts (the closest existing
 *    listPartners-adjacent db-level test, since getPartnersOfUser itself
 *    has no dedicated db-level test file).
 *
 * Fixture (S6 Step 2): husband H(man, 1), wives A(vrouw, 2) and B(vrouw, 3)
 * with active confirmed rows, ex-wife X(4) with a dissolved row, unrelated
 * man M(5).
 */

// ── Router layer: wholesale db mock (cycle-router-access.test.ts style) ──
const dbMocks = vi.hoisted(() => ({
  setCoWivesVisible: vi.fn(),
  getCoWivesVisibility: vi.fn(),
  listCoWives: vi.fn(),
}));
vi.mock("../server/db", () => dbMocks);

import { linksRouter } from "../server/routers";

function ctxFor(id: number, gender: string | undefined) {
  return {
    req: {} as any,
    res: {} as any,
    user: { id, name: "User", language: "nl", profileData: gender === undefined ? {} : { parentProfile: { gender } } } as any,
  };
}
const call = (id: number, gender: string | undefined) => linksRouter.createCaller(ctxFor(id, gender));

describe("links.setCoWivesVisible / coWivesVisibility / coWives — router gating", () => {
  beforeEach(() => vi.clearAllMocks());

  it("setCoWivesVisible: FORBIDDEN unless the caller resolves to man", async () => {
    await expect(call(2, "vrouw").setCoWivesVisible({ visible: true })).rejects.toThrow(/FORBIDDEN|not allowed/i);
    expect(dbMocks.setCoWivesVisible).not.toHaveBeenCalled();
  });

  it("setCoWivesVisible: a man's toggle reaches db with his id and the value", async () => {
    dbMocks.setCoWivesVisible.mockResolvedValue(2);
    const r = await call(1, "man").setCoWivesVisible({ visible: true });
    expect(r).toEqual({ visible: true });
    expect(dbMocks.setCoWivesVisible).toHaveBeenCalledWith(1, true);
  });

  it("coWivesVisibility: a woman gets {visible:false} without a db read (men only)", async () => {
    const r = await call(2, "vrouw").coWivesVisibility();
    expect(r).toEqual({ visible: false });
    expect(dbMocks.getCoWivesVisibility).not.toHaveBeenCalled();
  });

  it("coWivesVisibility: a man reads his own db value", async () => {
    dbMocks.getCoWivesVisibility.mockResolvedValue(true);
    const r = await call(1, "man").coWivesVisibility();
    expect(r).toEqual({ visible: true });
    expect(dbMocks.getCoWivesVisibility).toHaveBeenCalledWith(1);
  });

  it("coWives: a man (H) gets [] without a db read (women only)", async () => {
    const r = await call(1, "man").coWives();
    expect(r).toEqual([]);
    expect(dbMocks.listCoWives).not.toHaveBeenCalled();
  });

  it("coWives: a woman gets her db result", async () => {
    dbMocks.listCoWives.mockResolvedValue([{ id: 3, name: "B" }]);
    const r = await call(2, "vrouw").coWives();
    expect(r).toEqual([{ id: 3, name: "B" }]);
    expect(dbMocks.listCoWives).toHaveBeenCalledWith(2);
  });
});

// ── db.ts layer: real implementation, fake mysql2 driver ──
// getDb() only calls the (mocked) drizzle() factory when DATABASE_URL is
// set, and caches the result for the lifetime of this module — same
// convention as tests/co-parents-shared-children-count.test.ts.
process.env.DATABASE_URL = "mysql://cowife-visibility-test-only/db";

const partnershipDb = vi.hoisted(() => ({
  rows: [] as any[],
  // Per-call override queue (same purpose as tests/partner-profile-access.test.ts's
  // partnershipDb.queue): listCoWives issues several DIFFERENT selects (her own
  // row, the husband's other wives, the users names) that a single shared `rows`
  // snapshot can't tell apart.
  queue: undefined as any[] | undefined,
  update: vi.fn(async (): Promise<any> => [{ affectedRows: 1 }]),
  lastSetFields: undefined as any,
}));
vi.mock("drizzle-orm/mysql2", () => ({
  drizzle: () => ({
    select: () => ({
      from: () => ({
        where: () => {
          const resolveRows = () =>
            partnershipDb.queue && partnershipDb.queue.length > 0 ? partnershipDb.queue.shift() : partnershipDb.rows;
          const result: any = { limit: async () => resolveRows() };
          result.then = (resolve: any) => resolve(resolveRows());
          return result;
        },
      }),
    }),
    update: () => ({
      set: (fields: any) => {
        partnershipDb.lastSetFields = fields;
        return { where: () => partnershipDb.update() };
      },
    }),
  }),
}));

describe("db.setCoWivesVisible / getCoWivesVisibility / listCoWives (real server/db.ts)", () => {
  beforeEach(() => {
    partnershipDb.rows = [];
    partnershipDb.queue = undefined;
    partnershipDb.update.mockClear();
    partnershipDb.lastSetFields = undefined;
  });

  it("setCoWivesVisible counts and flags only the husband's active+confirmed rows (X's dissolved row excluded by construction)", async () => {
    partnershipDb.rows = [
      { id: 10, userId1: 1, userId2: 2, status: "active", confirmed: true, coWivesVisible: false },
      { id: 11, userId1: 1, userId2: 3, status: "active", confirmed: true, coWivesVisible: false },
    ];
    const real = await vi.importActual<typeof import("../server/db")>("../server/db");
    const n = await real.setCoWivesVisible(1, true);
    expect(n).toBe(2);
    expect(partnershipDb.lastSetFields).toEqual({ coWivesVisible: true });
  });

  it("getCoWivesVisibility is true only when EVERY active confirmed row is flagged", async () => {
    // Shaped as { v } to match getCoWivesVisibility's own
    // `.select({ v: partnerships.coWivesVisible })` projection — this fake
    // driver returns fixture rows verbatim rather than actually projecting.
    const real = await vi.importActual<typeof import("../server/db")>("../server/db");
    partnershipDb.rows = [{ v: true }, { v: true }];
    expect(await real.getCoWivesVisibility(1)).toBe(true);

    partnershipDb.rows = [{ v: true }, { v: false }];
    expect(await real.getCoWivesVisibility(1)).toBe(false);
  });

  it("getCoWivesVisibility is false when there is no active confirmed partnership at all", async () => {
    const real = await vi.importActual<typeof import("../server/db")>("../server/db");
    partnershipDb.rows = [];
    expect(await real.getCoWivesVisibility(1)).toBe(false);
  });

  it("listCoWives: enabled → wife A sees B by id+name+canChat, and the payload has exactly those three keys", async () => {
    const real = await vi.importActual<typeof import("../server/db")>("../server/db");
    partnershipDb.queue = [
      [{ id: 10, userId1: 1, userId2: 2, status: "active", confirmed: true, coWivesVisible: true }], // A's own row (full row — no projection)
      [
        // Shaped as { u1, u2, v } to match listCoWives's own
        // `.select({ u1, u2, v })` projection (see the note on the prior test).
        { u1: 1, u2: 2, v: true },
        { u1: 1, u2: 3, v: true },
      ], // H's other active+confirmed rows
      [{ id: 3, name: "B" }], // users names
      [{ v: true }], // getCoWivesCanChat(husbandId) — added alongside coWivesCanChat
    ];
    const forA = await real.listCoWives(2);
    expect(forA).toEqual([{ id: 3, name: "B", canChat: true }]);
    expect(Object.keys(forA[0]).sort()).toEqual(["canChat", "id", "name"]);
  });

  it("listCoWives: disabled on her own row → []", async () => {
    const real = await vi.importActual<typeof import("../server/db")>("../server/db");
    partnershipDb.queue = [[{ id: 10, userId1: 1, userId2: 2, status: "active", confirmed: true, coWivesVisible: false }]];
    expect(await real.listCoWives(2)).toEqual([]);
  });

  it("listCoWives: a co-wife whose OWN row isn't flagged is excluded even though the caller's is on (e.g. she was just added and he hasn't re-toggled)", async () => {
    const real = await vi.importActual<typeof import("../server/db")>("../server/db");
    partnershipDb.queue = [
      [{ id: 10, userId1: 1, userId2: 2, status: "active", confirmed: true, coWivesVisible: true }],
      [
        { u1: 1, u2: 2, v: true },
        { u1: 1, u2: 3, v: false },
      ],
    ];
    expect(await real.listCoWives(2)).toEqual([]);
  });

  it("listCoWives: a dissolved partnership is never listed", async () => {
    const real = await vi.importActual<typeof import("../server/db")>("../server/db");
    partnershipDb.queue = [[]]; // X's dissolved row never matches the active+confirmed WHERE
    expect(await real.listCoWives(4)).toEqual([]);
  });

  it("listCoWives: a man has no wife-side row → []", async () => {
    const real = await vi.importActual<typeof import("../server/db")>("../server/db");
    partnershipDb.queue = [[]];
    expect(await real.listCoWives(1)).toEqual([]);
  });
});
