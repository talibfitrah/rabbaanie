import { beforeEach, describe, it, expect, vi } from "vitest";

// ─── db.getLinkedSpouseUserIds — real server/db.ts, driver mocked ─────────
// Same vi.importActual + mocked drizzle-orm/mysql2 pattern as
// tests/partner-profile-access.test.ts's "db.createPartnership" block,
// kept self-contained here (own mock, own describe) so this file never
// writes to that shared, already-green test file.
const linkedSpouseDb = vi.hoisted(() => ({
  rows: [] as { userId1: number; userId2: number }[],
}));
vi.mock("drizzle-orm/mysql2", () => ({
  drizzle: () => ({
    select: () => ({
      from: () => ({
        where: async () => linkedSpouseDb.rows,
      }),
    }),
  }),
}));

describe("db.getLinkedSpouseUserIds", () => {
  it("dedups both sides of each partnership into one array, insertion order", async () => {
    process.env.DATABASE_URL = "mysql://broadcast-category-test/db";
    linkedSpouseDb.rows = [
      { userId1: 1, userId2: 2 },
      { userId1: 3, userId2: 1 }, // 1 repeats — must not duplicate
      { userId1: 5, userId2: 6 },
    ];
    const real = await vi.importActual<typeof import("../server/db")>("../server/db");

    const ids = await real.getLinkedSpouseUserIds();

    expect(ids).toEqual([1, 2, 3, 5, 6]);
  });

  it("returns an empty array when no partnership rows exist", async () => {
    process.env.DATABASE_URL = "mysql://broadcast-category-test/db";
    linkedSpouseDb.rows = [];
    const real = await vi.importActual<typeof import("../server/db")>("../server/db");

    expect(await real.getLinkedSpouseUserIds()).toEqual([]);
  });
});

// ─── admin.sendBroadcast / admin.broadcastAudience — router-level ──────────
// server/db is fully mocked (same pattern as tests/co-parent-notifications.test.ts),
// so these exercise the real router wiring, not the real SQL. adminProcedure
// also requires has2FA (server/totp.ts, imported directly by
// server/_core/trpc.ts — not through server/db, hence its own mock) plus a
// fresh twoFactorVerifiedAt on the caller's user.
const dbMocks = vi.hoisted(() => ({
  getAllUsers: vi.fn(),
  getLinkedSpouseUserIds: vi.fn(),
  broadcastPushNotification: vi.fn(),
  broadcastLocalizedPush: vi.fn(),
}));
vi.mock("../server/db", () => dbMocks);
vi.mock("../server/totp", () => ({ has2FA: vi.fn().mockResolvedValue(true) }));

import { appRouter } from "../server/routers";
import {
  analyticalProfileTemplate,
  personalProfileTemplate,
  childProfileTemplate,
  spouseNotLinkedTemplate,
} from "../server/broadcast-templates";

function adminCaller() {
  return appRouter.createCaller({
    req: {} as any,
    res: {} as any,
    user: {
      id: 1,
      name: "Admin",
      role: "admin",
      twoFactorVerifiedAt: Date.now(),
      language: "nl",
      profileData: {},
    } as any,
  });
}

// Minimal AudienceUser-shaped fixture, local to this file since
// tests/broadcast-audience.test.ts (which has its own near-identical
// helper) belongs to another agent and is off-limits here.
function mkUser(
  id: number,
  overrides: {
    name?: string;
    parentProfile?: Record<string, unknown>;
    children?: Array<{ id: string; name: string; profileCompleted: boolean }>;
    parentProfileCompleted?: boolean;
  } = {},
) {
  return {
    id,
    name: overrides.name ?? `User ${id}`,
    deletedAt: null,
    profileData: {
      parentProfile: {
        firstName: "A", lastName: "B", birthDate: "1990-01-01",
        country: "Nederland", city: "Amsterdam", street: "Kerkstraat", houseNumber: "1",
        phoneNumber: "+31612345678", gender: "man", maritalStatus: "getrouwd",
        ...overrides.parentProfile,
      },
      children: overrides.children ?? [{ id: "c1", name: "Kid", profileCompleted: true }],
      parentProfileCompleted: overrides.parentProfileCompleted ?? true,
    },
  };
}

describe("admin.sendBroadcast / admin.broadcastAudience", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMocks.getLinkedSpouseUserIds.mockResolvedValue([]);
    dbMocks.broadcastLocalizedPush.mockResolvedValue({ sent: 1, failed: 0 });
    dbMocks.broadcastPushNotification.mockResolvedValue({ sent: 1, failed: 0 });
  });

  describe("no category: byte-for-byte unchanged", () => {
    it("still calls broadcastPushNotification with subject/message/target/userIds, and never touches the new spouse-link lookup", async () => {
      const nl = mkUser(1, { parentProfile: { country: "Nederland" } });
      const be = mkUser(2, { parentProfile: { country: "Belgium" } });
      dbMocks.getAllUsers.mockResolvedValue([nl, be]);

      const result = await adminCaller().admin.sendBroadcast({
        subject: "S", message: "M", target: "parents",
        audience: { countries: ["Nederland"] },
      });

      expect(dbMocks.broadcastPushNotification).toHaveBeenCalledWith(
        "S", "M", { type: "admin_broadcast", target: "parents" }, [1],
      );
      expect(dbMocks.broadcastLocalizedPush).not.toHaveBeenCalled();
      expect(dbMocks.getLinkedSpouseUserIds).not.toHaveBeenCalled();
      expect(result).toEqual({ success: true, sent: 1, target: "parents" });
    });

    it("omitting audience still omits userIds entirely (undefined, not [])", async () => {
      await adminCaller().admin.sendBroadcast({ subject: "S", message: "M" });
      expect(dbMocks.broadcastPushNotification).toHaveBeenCalledWith(
        "S", "M", { type: "admin_broadcast", target: "all" }, undefined,
      );
      expect(dbMocks.getAllUsers).not.toHaveBeenCalled();
    });

    it("still rejects an empty subject/message when no category is given", async () => {
      await expect(
        adminCaller().admin.sendBroadcast({ subject: "", message: "" }),
      ).rejects.toThrow();
    });

    it("rejects a payload with neither category nor subject/message", async () => {
      await expect(adminCaller().admin.sendBroadcast({})).rejects.toThrow();
    });
  });

  describe("category: incompleteAnalytical / incompletePersonal — one shared call", () => {
    it("incompleteAnalytical sends analyticalProfileTemplate() to every matched user in one call", async () => {
      const notDone = mkUser(1, { parentProfileCompleted: false });
      const done = mkUser(2, { parentProfileCompleted: true });
      dbMocks.getAllUsers.mockResolvedValue([notDone, done]);

      const result = await adminCaller().admin.sendBroadcast({ category: "incompleteAnalytical" });

      const t = analyticalProfileTemplate();
      expect(dbMocks.broadcastLocalizedPush).toHaveBeenCalledTimes(1);
      expect(dbMocks.broadcastLocalizedPush).toHaveBeenCalledWith(
        t.title.nl, t.title.en, t.title.ar, t.body.nl, t.body.en, t.body.ar,
        { type: "admin_broadcast", category: "incompleteAnalytical" }, [1],
      );
      expect(result).toEqual({ success: true, sent: 1, target: "all" });
    });

    it("incompletePersonal sends personalProfileTemplate() to every matched user in one call", async () => {
      const incomplete = mkUser(1, { parentProfile: { phoneNumber: "" } });
      dbMocks.getAllUsers.mockResolvedValue([incomplete]);

      await adminCaller().admin.sendBroadcast({ category: "incompletePersonal" });

      const t = personalProfileTemplate();
      expect(dbMocks.broadcastLocalizedPush).toHaveBeenCalledWith(
        t.title.nl, t.title.en, t.title.ar, t.body.nl, t.body.en, t.body.ar,
        { type: "admin_broadcast", category: "incompletePersonal" }, [1],
      );
    });
  });

  describe("category: incompleteChildren — one call per recipient, naming THEIR OWN child", () => {
    it("names each recipient's own child, never another recipient's", async () => {
      const userA = mkUser(10, { children: [{ id: "c1", name: "Yusuf", profileCompleted: false }] });
      const userB = mkUser(20, { children: [{ id: "c2", name: "Maryam", profileCompleted: false }] });
      const complete = mkUser(30); // control: fully complete, must receive nothing
      dbMocks.getAllUsers.mockResolvedValue([userA, userB, complete]);

      const result = await adminCaller().admin.sendBroadcast({ category: "incompleteChildren" });

      expect(dbMocks.broadcastLocalizedPush).toHaveBeenCalledTimes(2);
      const tA = childProfileTemplate(["Yusuf"]);
      const tB = childProfileTemplate(["Maryam"]);
      expect(dbMocks.broadcastLocalizedPush).toHaveBeenCalledWith(
        tA.title.nl, tA.title.en, tA.title.ar, tA.body.nl, tA.body.en, tA.body.ar,
        { type: "admin_broadcast", category: "incompleteChildren" }, [10],
      );
      expect(dbMocks.broadcastLocalizedPush).toHaveBeenCalledWith(
        tB.title.nl, tB.title.en, tB.title.ar, tB.body.nl, tB.body.en, tB.body.ar,
        { type: "admin_broadcast", category: "incompleteChildren" }, [20],
      );
      // Absence: user 30 (complete) never appears in any call's recipient list.
      const allRecipientIds = dbMocks.broadcastLocalizedPush.mock.calls.flatMap((c: any[]) => c[7]);
      expect(allRecipientIds).not.toContain(30);
      expect(result).toEqual({ success: true, sent: 2, target: "all" });
    });

    it("reaches nobody, and sends nothing, when no user has an incomplete child", async () => {
      dbMocks.getAllUsers.mockResolvedValue([mkUser(1), mkUser(2)]);

      const result = await adminCaller().admin.sendBroadcast({ category: "incompleteChildren" });

      expect(dbMocks.broadcastLocalizedPush).not.toHaveBeenCalled();
      expect(result).toEqual({ success: true, sent: 0, target: "all" });
    });
  });

  describe("category: notLinkedSpouse — two calls, split by gender", () => {
    it("sends the man-wording call and vrouw-wording call to the right recipients, excluding unmarried/linked/unknown-gender users", async () => {
      const man1 = mkUser(40, { parentProfile: { gender: "man" } });
      const man2 = mkUser(41, { parentProfile: { gender: "man" } });
      const woman1 = mkUser(50, { parentProfile: { gender: "vrouw" } });
      const single = mkUser(60, { parentProfile: { maritalStatus: "alleenstaand", gender: "man" } });
      const alreadyLinked = mkUser(70, { parentProfile: { gender: "man" } });
      const unknownGender = mkUser(80, { parentProfile: { gender: "other" } });
      dbMocks.getAllUsers.mockResolvedValue([man1, man2, woman1, single, alreadyLinked, unknownGender]);
      dbMocks.getLinkedSpouseUserIds.mockResolvedValue([70]);

      const result = await adminCaller().admin.sendBroadcast({ category: "notLinkedSpouse" });

      expect(dbMocks.broadcastLocalizedPush).toHaveBeenCalledTimes(2);
      const manT = spouseNotLinkedTemplate("man");
      const womanT = spouseNotLinkedTemplate("vrouw");
      expect(dbMocks.broadcastLocalizedPush).toHaveBeenCalledWith(
        manT.title.nl, manT.title.en, manT.title.ar, manT.body.nl, manT.body.en, manT.body.ar,
        { type: "admin_broadcast", category: "notLinkedSpouse" }, [40, 41],
      );
      expect(dbMocks.broadcastLocalizedPush).toHaveBeenCalledWith(
        womanT.title.nl, womanT.title.en, womanT.title.ar, womanT.body.nl, womanT.body.en, womanT.body.ar,
        { type: "admin_broadcast", category: "notLinkedSpouse" }, [50],
      );
      const allRecipientIds = dbMocks.broadcastLocalizedPush.mock.calls.flatMap((c: any[]) => c[7]);
      expect(allRecipientIds.sort((a: number, b: number) => a - b)).toEqual([40, 41, 50]);
      expect(result).toEqual({ success: true, sent: 2, target: "all" });
    });
  });

  describe("broadcastAudience preview: notLinkedSpouse wiring", () => {
    it("attaches db.getLinkedSpouseUserIds() before filtering, so the preview count matches who sendBroadcast would reach", async () => {
      const unlinked = mkUser(1, { parentProfile: { gender: "man" } });
      const linked = mkUser(2, { parentProfile: { gender: "vrouw" } });
      dbMocks.getAllUsers.mockResolvedValue([unlinked, linked]);
      dbMocks.getLinkedSpouseUserIds.mockResolvedValue([2]);

      const preview = await adminCaller().admin.broadcastAudience({ notLinkedSpouse: true });

      expect(preview.count).toBe(1);
      expect(preview.recipients.map((r: any) => r.id)).toEqual([1]);
    });
  });
});
