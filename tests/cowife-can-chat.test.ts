import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Parity copy of tests/cowife-visibility.test.ts's structure and fake-driver
 * technique, extended to cover coWivesCanChat: a husband-gated switch that
 * lets his active+confirmed wives direct-message EACH OTHER (mirrors
 * coWivesVisible byte-for-byte on a new column), plus the combined
 * assertCanDirectMessage gate that OR's the existing co-parent check with
 * the new co-wife check on sendDirectMessage/directMessages.
 *
 * sendDirectMessage/directMessages live under `linksRouter` (appRouter.links
 * -> server/routers.ts:4298), not a `messages` namespace — verified via
 * appRouter's own router({ links: linksRouter, ... }) wiring.
 *
 * Spec: server-only husband-gated co-wife direct messaging (2026-09-04).
 */

// ── Router layer: wholesale db mock (cowife-visibility.test.ts style) ──
const dbMocks = vi.hoisted(() => ({
  setCoWivesCanChat: vi.fn(),
  getCoWivesCanChat: vi.fn(),
  areConfirmedCoParents: vi.fn(),
  areCoWivesAllowedToChat: vi.fn(),
  getConfirmedParentChildLink: vi.fn(),
  sendMessage: vi.fn(),
  sendLocalizedPush: vi.fn(async () => {}),
  getDirectMessages: vi.fn(),
}));
vi.mock("../server/db", () => dbMocks);

import { linksRouter } from "../server/routers";

function ctxFor(id: number, gender: string | undefined) {
  return {
    req: {} as any,
    res: {} as any,
    user: {
      id,
      name: "User",
      language: "nl",
      profileData: gender === undefined ? {} : { parentProfile: { gender } },
    } as any,
  };
}
const call = (id: number, gender: string | undefined) => linksRouter.createCaller(ctxFor(id, gender));

describe("links.setCoWivesCanChat / coWivesCanChat — router gating", () => {
  beforeEach(() => vi.clearAllMocks());

  it("setCoWivesCanChat: FORBIDDEN unless the caller resolves to man", async () => {
    await expect(call(2, "vrouw").setCoWivesCanChat({ canChat: true })).rejects.toThrow(/FORBIDDEN|not allowed/i);
    expect(dbMocks.setCoWivesCanChat).not.toHaveBeenCalled();
  });

  it("setCoWivesCanChat: a man's toggle reaches db with his id and the value", async () => {
    dbMocks.setCoWivesCanChat.mockResolvedValue(2);
    const r = await call(1, "man").setCoWivesCanChat({ canChat: true });
    expect(r).toEqual({ canChat: true });
    expect(dbMocks.setCoWivesCanChat).toHaveBeenCalledWith(1, true);
  });

  it("coWivesCanChat: a woman gets {canChat:false} without a db read (men only)", async () => {
    const r = await call(2, "vrouw").coWivesCanChat();
    expect(r).toEqual({ canChat: false });
    expect(dbMocks.getCoWivesCanChat).not.toHaveBeenCalled();
  });

  it("coWivesCanChat: a man reads his own db value", async () => {
    dbMocks.getCoWivesCanChat.mockResolvedValue(true);
    const r = await call(1, "man").coWivesCanChat();
    expect(r).toEqual({ canChat: true });
    expect(dbMocks.getCoWivesCanChat).toHaveBeenCalledWith(1);
  });
});

describe("links.sendDirectMessage / directMessages — combined co-parent OR co-wife gate", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sendDirectMessage: a co-parent pair still works (existing behavior unchanged)", async () => {
    dbMocks.areConfirmedCoParents.mockResolvedValue(true);
    dbMocks.sendMessage.mockResolvedValue(101);
    const r = await call(1, "man").sendDirectMessage({ recipientId: 2, content: "hi" });
    expect(r).toEqual({ id: 101 });
    expect(dbMocks.areCoWivesAllowedToChat).not.toHaveBeenCalled();
    expect(dbMocks.sendMessage).toHaveBeenCalled();
  });

  it("sendDirectMessage: co-wife pair allowed when canChat ON (no childId)", async () => {
    dbMocks.areConfirmedCoParents.mockResolvedValue(false);
    dbMocks.areCoWivesAllowedToChat.mockResolvedValue(true);
    dbMocks.sendMessage.mockResolvedValue(102);
    const r = await call(2, "vrouw").sendDirectMessage({ recipientId: 3, content: "hi co-wife" });
    expect(r).toEqual({ id: 102 });
    expect(dbMocks.sendMessage).toHaveBeenCalled();
  });

  it("sendDirectMessage: FORBIDDEN when neither co-parent nor co-wife-chat-allowed (covers switch OFF and a stranger)", async () => {
    dbMocks.areConfirmedCoParents.mockResolvedValue(false);
    dbMocks.areCoWivesAllowedToChat.mockResolvedValue(false);
    await expect(call(2, "vrouw").sendDirectMessage({ recipientId: 3, content: "hi" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(dbMocks.sendMessage).not.toHaveBeenCalled();
  });

  it("sendDirectMessage: co-wife pair (not co-parent) carrying a childId is FORBIDDEN — co-wives share no child", async () => {
    dbMocks.areConfirmedCoParents.mockResolvedValue(false);
    dbMocks.areCoWivesAllowedToChat.mockResolvedValue(true);
    await expect(
      call(2, "vrouw").sendDirectMessage({ recipientId: 3, content: "hi", childId: 99 }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(dbMocks.sendMessage).not.toHaveBeenCalled();
  });

  it("directMessages: co-wife pair allowed when canChat ON", async () => {
    dbMocks.areConfirmedCoParents.mockResolvedValue(false);
    dbMocks.areCoWivesAllowedToChat.mockResolvedValue(true);
    dbMocks.getDirectMessages.mockResolvedValue([{ id: 1 }]);
    const r = await call(2, "vrouw").directMessages({ otherParentId: 3 });
    expect(r).toEqual([{ id: 1 }]);
  });

  it("directMessages: FORBIDDEN when neither gate passes", async () => {
    dbMocks.areConfirmedCoParents.mockResolvedValue(false);
    dbMocks.areCoWivesAllowedToChat.mockResolvedValue(false);
    await expect(call(2, "vrouw").directMessages({ otherParentId: 3 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(dbMocks.getDirectMessages).not.toHaveBeenCalled();
  });

  it("directMessages: a co-parent pair still works", async () => {
    dbMocks.areConfirmedCoParents.mockResolvedValue(true);
    dbMocks.getDirectMessages.mockResolvedValue([{ id: 2 }]);
    const r = await call(1, "man").directMessages({ otherParentId: 2 });
    expect(r).toEqual([{ id: 2 }]);
    expect(dbMocks.areCoWivesAllowedToChat).not.toHaveBeenCalled();
  });
});

// ── access-control.ts layer: assertCanDirectMessage (real code, db mocked wholesale, router-access-control.test.ts style) ──
describe("assertCanDirectMessage (server/access-control.ts)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("passes via co-parent without needing the co-wife check", async () => {
    const { assertCanDirectMessage } = await import("../server/access-control");
    dbMocks.areConfirmedCoParents.mockResolvedValue(true);
    await expect(assertCanDirectMessage({ id: 1 }, 2)).resolves.toEqual({ viaCoParent: true });
    expect(dbMocks.areCoWivesAllowedToChat).not.toHaveBeenCalled();
  });

  it("falls back to the co-wife check when the pair are not co-parents", async () => {
    const { assertCanDirectMessage } = await import("../server/access-control");
    dbMocks.areConfirmedCoParents.mockResolvedValue(false);
    dbMocks.areCoWivesAllowedToChat.mockResolvedValue(true);
    await expect(assertCanDirectMessage({ id: 2 }, 3)).resolves.toEqual({ viaCoParent: false });
  });

  it("throws FORBIDDEN when neither gate passes (a stranger)", async () => {
    const { assertCanDirectMessage } = await import("../server/access-control");
    dbMocks.areConfirmedCoParents.mockResolvedValue(false);
    dbMocks.areCoWivesAllowedToChat.mockResolvedValue(false);
    await expect(assertCanDirectMessage({ id: 2 }, 99)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

// ── db.ts layer: real implementation, fake mysql2 driver (cowife-visibility.test.ts style) ──
process.env.DATABASE_URL = "mysql://cowife-can-chat-test-only/db";

const partnershipDb = vi.hoisted(() => ({
  rows: [] as any[],
  // FIFO per-call override queue — areCoWivesAllowedToChat/listCoWives each
  // issue several DIFFERENT selects that a single shared `rows` snapshot
  // can't tell apart (same purpose as cowife-visibility.test.ts's queue).
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

describe("db.setCoWivesCanChat / getCoWivesCanChat (real server/db.ts)", () => {
  beforeEach(() => {
    partnershipDb.rows = [];
    partnershipDb.queue = undefined;
    partnershipDb.update.mockClear();
    partnershipDb.lastSetFields = undefined;
  });

  it("setCoWivesCanChat counts and flags only the husband's active+confirmed rows", async () => {
    partnershipDb.rows = [
      { id: 10, userId1: 1, userId2: 2, status: "active", confirmed: true, coWivesCanChat: false },
      { id: 11, userId1: 1, userId2: 3, status: "active", confirmed: true, coWivesCanChat: false },
    ];
    const real = await vi.importActual<typeof import("../server/db")>("../server/db");
    const n = await real.setCoWivesCanChat(1, true);
    expect(n).toBe(2);
    expect(partnershipDb.lastSetFields).toEqual({ coWivesCanChat: true });
  });

  it("getCoWivesCanChat is true only when EVERY active confirmed row is flagged", async () => {
    const real = await vi.importActual<typeof import("../server/db")>("../server/db");
    partnershipDb.rows = [{ v: true }, { v: true }];
    expect(await real.getCoWivesCanChat(1)).toBe(true);

    partnershipDb.rows = [{ v: true }, { v: false }];
    expect(await real.getCoWivesCanChat(1)).toBe(false);
  });

  it("getCoWivesCanChat is false when there is no active confirmed partnership at all", async () => {
    const real = await vi.importActual<typeof import("../server/db")>("../server/db");
    partnershipDb.rows = [];
    expect(await real.getCoWivesCanChat(1)).toBe(false);
  });
});

describe("db.areCoWivesAllowedToChat (real server/db.ts)", () => {
  beforeEach(() => {
    partnershipDb.rows = [];
    partnershipDb.queue = undefined;
  });

  it("true: both are confirmed wives of the same husband and his canChat is ON", async () => {
    const real = await vi.importActual<typeof import("../server/db")>("../server/db");
    partnershipDb.queue = [
      [{ u1: 1, u2: 2 }], // A(2)'s own row -> other party 1
      [{ u1: 1, u2: 3 }], // B(3)'s own row -> other party 1
      [{ v: true }], // getCoWivesCanChat(1)
    ];
    expect(await real.areCoWivesAllowedToChat(2, 3)).toBe(true);
  });

  it("false: same husband but his canChat switch is OFF", async () => {
    const real = await vi.importActual<typeof import("../server/db")>("../server/db");
    partnershipDb.queue = [
      [{ u1: 1, u2: 2 }],
      [{ u1: 1, u2: 3 }],
      [{ v: false }],
    ];
    expect(await real.areCoWivesAllowedToChat(2, 3)).toBe(false);
  });

  it("false: different husbands (not co-wives)", async () => {
    const real = await vi.importActual<typeof import("../server/db")>("../server/db");
    partnershipDb.queue = [
      [{ u1: 1, u2: 2 }], // A(2)'s husband is 1
      [{ u1: 5, u2: 6 }], // B(6)'s husband is 5
    ];
    expect(await real.areCoWivesAllowedToChat(2, 6)).toBe(false);
  });

  it("false: a man passed as one side (his own row resolves to a wife, never the real common husband)", async () => {
    const real = await vi.importActual<typeof import("../server/db")>("../server/db");
    // A = husband 1 himself; his own row's "other party" is wife 2, not a husband.
    partnershipDb.queue = [
      [{ u1: 1, u2: 2 }], // "husband" resolved for A(1) -> 2 (his wife)
      [{ u1: 1, u2: 3 }], // "husband" resolved for B(3) -> 1 (her real husband)
    ];
    expect(await real.areCoWivesAllowedToChat(1, 3)).toBe(false);
  });

  it("false: A === B", async () => {
    const real = await vi.importActual<typeof import("../server/db")>("../server/db");
    expect(await real.areCoWivesAllowedToChat(2, 2)).toBe(false);
  });

  it("false: unlinked / dissolved / unconfirmed (no active confirmed row at all)", async () => {
    const real = await vi.importActual<typeof import("../server/db")>("../server/db");
    partnershipDb.queue = [[]]; // A has no active+confirmed row
    expect(await real.areCoWivesAllowedToChat(2, 3)).toBe(false);
  });
});

describe("db.listCoWives — canChat field added to each row", () => {
  beforeEach(() => {
    partnershipDb.rows = [];
    partnershipDb.queue = undefined;
  });

  it("includes canChat = getCoWivesCanChat(husbandId) alongside id/name", async () => {
    const real = await vi.importActual<typeof import("../server/db")>("../server/db");
    partnershipDb.queue = [
      [{ id: 10, userId1: 1, userId2: 2, status: "active", confirmed: true, coWivesVisible: true }], // A's own row
      [
        { u1: 1, u2: 2, v: true },
        { u1: 1, u2: 3, v: true },
      ], // H's other active+confirmed rows (coWivesVisible)
      [{ id: 3, name: "B" }], // users names
      [{ v: true }], // getCoWivesCanChat(1)
    ];
    const forA = await real.listCoWives(2);
    expect(forA).toEqual([{ id: 3, name: "B", canChat: true }]);
  });

  it("canChat is false alongside a visible-but-not-chat-enabled co-wife list", async () => {
    const real = await vi.importActual<typeof import("../server/db")>("../server/db");
    partnershipDb.queue = [
      [{ id: 10, userId1: 1, userId2: 2, status: "active", confirmed: true, coWivesVisible: true }],
      [
        { u1: 1, u2: 2, v: true },
        { u1: 1, u2: 3, v: true },
      ],
      [{ id: 3, name: "B" }],
      [{ v: false }], // getCoWivesCanChat(1)
    ];
    const forA = await real.listCoWives(2);
    expect(forA).toEqual([{ id: 3, name: "B", canChat: false }]);
  });
});
