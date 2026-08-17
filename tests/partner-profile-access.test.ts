import { beforeEach, describe, expect, it, vi } from "vitest";

// Same hoisted-mock pattern as tests/daily-diagnostic.test.ts.
const dbMocks = vi.hoisted(() => ({
  getPartnerOfUser: vi.fn(),
  getUserById: vi.fn(),
  updateUserProfile: vi.fn(),
  getUserFunctions: vi.fn(),
  addUserFunction: vi.fn(),
  requestPartnerProfileAccess: vi.fn(),
  grantPartnerProfileAccess: vi.fn(),
  revokePartnerProfileAccess: vi.fn(),
  revokeProfileAccessGrantsForUser: vi.fn(),
  sendMessage: vi.fn(),
  sendLocalizedPush: vi.fn(),
  getUserLanguage: vi.fn(),
  tx: (lang: string, nl: string, en: string, ar: string) =>
    lang === "ar" ? ar : lang === "en" ? en : nl,
}));

vi.mock("../server/db", () => dbMocks);

// For the db.createPartnership tests near the bottom of this file: that fix
// lives inside server/db.ts's own implementation, which the dbMocks module
// mock above replaces wholesale — so those tests import the REAL db.ts via
// vi.importActual instead. It only needs the DB driver stubbed (rows to
// return, and a spy on update/insert), not server/db.ts's own logic.
const partnershipDb = vi.hoisted(() => ({
  rows: [] as any[],
  // Optional per-call override queue (round-8 P3 fix tests): when set and
  // non-empty, each select() call consumes the next entry instead of the
  // shared `rows` snapshot — needed for getPartnerOfUser's shared-children
  // fallback, which issues several DIFFERENT selects (myLinks, otherLinks,
  // the partner user row, createPartnership's own existing-row check) that
  // this mock otherwise can't tell apart. Left undefined, every other test
  // in this file keeps reading `rows` exactly as before.
  queue: undefined as any[] | undefined,
  // insertId optional in the type (not just the default value): round-8 P3
  // fix tests override this to resolve [{}], simulating a Postgres insert
  // with no .returning() — insertId() is documented to return undefined
  // for exactly that shape.
  insert: vi.fn(async (): Promise<{ insertId?: number }[]> => [{ insertId: 999 }]),
  update: vi.fn(async () => [{ affectedRows: 1 }]),
  // Captured by db.updateUserProfile's tests below (real db.ts, not the
  // dbMocks module mock) — the fields passed to .set(), so those tests can
  // assert on exactly what would have been written.
  lastSetFields: undefined as any,
}));
vi.mock("drizzle-orm/mysql2", () => ({
  drizzle: () => ({
    select: () => ({
      from: () => ({
        where: () => {
          const resolveRows = () =>
            partnershipDb.queue && partnershipDb.queue.length > 0
              ? partnershipDb.queue.shift()
              : partnershipDb.rows;
          // Real drizzle is awaitable either chained (`.where(...).limit(n)`,
          // used everywhere else in db.ts) or directly (getPartnerOfUser's
          // myLinks/otherLinks selects, which never call .limit()) — a plain
          // object here isn't thenable, so the latter used to resolve to the
          // object itself rather than an array. Support both.
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
    insert: () => ({ values: () => partnershipDb.insert() }),
  }),
}));

import { linksRouter, profileRouter } from "../server/routers";
import { translateProfileValue } from "../lib/profile-labels";

function ctxFor(id: number, gender: string | undefined, name = "User") {
  return {
    req: {} as any,
    res: {} as any,
    user: {
      id,
      name,
      language: "nl",
      profileData: gender === undefined ? {} : { parentProfile: { gender } },
    } as any,
  };
}

function partnerRow(
  overrides: Partial<{
    id: number;
    name: string;
    gender: string | undefined;
    columnGender: string | null;
    partnershipId: number;
    // Defaults to true (an active+confirmed partnership) so every
    // pre-existing test, which never cares about this distinction, is
    // unaffected — round-6 tests override it to reproduce a partnership
    // that's still pending (e.g. reached via the shared-children legacy
    // fallback, which can return an existing unconfirmed invite).
    partnershipConfirmed: boolean;
    requestedAt: Date | null;
    grantedAt: Date | null;
    extraData: Record<string, unknown>;
  }> = {},
) {
  const {
    id = 2,
    name = "Partner",
    gender,
    // Mirrors real db.getPartnerOfUser: this is the users.gender COLUMN,
    // independent of the JSON parentProfile.gender copy below. Defaults to
    // matching `gender` so every pre-existing test (which never cares about
    // the distinction) is unaffected; round-3 tests override it to reproduce
    // a legacy row where the column is set but the JSON copy is not.
    columnGender = gender ?? null,
    partnershipId = 55,
    partnershipConfirmed = true,
    requestedAt = null,
    grantedAt = null,
    extraData = {},
  } = overrides;
  return {
    id,
    name,
    gender: columnGender,
    profileData:
      gender === undefined
        ? { ...extraData }
        : {
            parentProfile: {
              gender,
              feelingAboutPartner: "Blij en dankbaar",
              psychologistDetails: "Bezoekt maandelijks",
            },
            ...extraData,
          },
    partnershipId,
    partnershipConfirmed,
    profileAccessRequestedAt: requestedAt,
    profileAccessGrantedAt: grantedAt,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  dbMocks.sendMessage.mockResolvedValue(1);
  dbMocks.sendLocalizedPush.mockResolvedValue(true);
  dbMocks.getUserLanguage.mockResolvedValue("nl");
});

describe("links.getPartnerProfile gender gating", () => {
  it("husband (man) viewing wife (vrouw) gets the full profile, including private fields", async () => {
    dbMocks.getPartnerOfUser.mockResolvedValue(partnerRow({ gender: "vrouw" }));
    const result: any = await linksRouter
      .createCaller(ctxFor(1, "man"))
      .getPartnerProfile();
    expect(result.access).toBe("full");
    expect(result.parentProfile.feelingAboutPartner).toBe("Blij en dankbaar");
    expect(result.parentProfile.psychologistDetails).toBe("Bezoekt maandelijks");
  });

  it("wife (vrouw) viewing husband (man) with no grant gets a restricted, key-limited payload", async () => {
    dbMocks.getPartnerOfUser.mockResolvedValue(partnerRow({ gender: "man" }));
    const result: any = await linksRouter
      .createCaller(ctxFor(2, "vrouw"))
      .getPartnerProfile();
    expect(result.access).toBe("restricted");
    expect(result.canRequest).toBe(true);
    expect(result.requestPending).toBe(false);
    expect(result).not.toHaveProperty("parentProfile");
    expect(result).not.toHaveProperty("dailyCheckins");
    expect(result).not.toHaveProperty("issues");
    expect(Object.keys(result).sort()).toEqual(
      [
        "access",
        "canRequest",
        "gender",
        "id",
        "name",
        "needsGender",
        "needsMyGender",
        "needsPartnerGender",
        "requestPending",
      ].sort(),
    );
  });

  it("wife viewing husband after a grant gets the full payload", async () => {
    dbMocks.getPartnerOfUser.mockResolvedValue(
      partnerRow({ gender: "man", grantedAt: new Date("2026-01-01") }),
    );
    const result: any = await linksRouter
      .createCaller(ctxFor(2, "vrouw"))
      .getPartnerProfile();
    expect(result.access).toBe("full");
    expect(result.parentProfile.feelingAboutPartner).toBe("Blij en dankbaar");
  });

  it("wife viewing husband after a revoke is restricted again", async () => {
    dbMocks.getPartnerOfUser.mockResolvedValue(
      partnerRow({ gender: "man", grantedAt: null, requestedAt: new Date("2026-01-01") }),
    );
    const result: any = await linksRouter
      .createCaller(ctxFor(2, "vrouw"))
      .getPartnerProfile();
    expect(result.access).toBe("restricted");
    expect(result.requestPending).toBe(true);
    expect(result.canRequest).toBe(false);
    expect(result).not.toHaveProperty("parentProfile");
  });

  // Fail-closed: never infer a missing/ambiguous gender into access.
  async function assertFailClosed(
    callerGender: string | undefined,
    partnerGender: string | undefined,
  ) {
    dbMocks.getPartnerOfUser.mockResolvedValue(partnerRow({ gender: partnerGender }));
    const result: any = await linksRouter
      .createCaller(ctxFor(1, callerGender))
      .getPartnerProfile();
    expect(result.access).toBe("restricted");
    expect(result.needsGender).toBe(true);
    expect(result).not.toHaveProperty("parentProfile");
    expect(result).not.toHaveProperty("dailyCheckins");
    expect(result).not.toHaveProperty("issues");
  }

  it("fail-closed: both genders missing", async () => {
    await assertFailClosed(undefined, undefined);
  });

  it("fail-closed: caller gender is an empty string", async () => {
    await assertFailClosed("", "man");
  });

  it("fail-closed: partner gender is an empty string", async () => {
    await assertFailClosed("vrouw", "");
  });

  it("fail-closed: both genders are 'man'", async () => {
    await assertFailClosed("man", "man");
  });

  it("fail-closed: both genders are 'vrouw'", async () => {
    await assertFailClosed("vrouw", "vrouw");
  });
});

describe("links.getPartnerProfile — canRequest requires a confirmed partnership (round-6 P2 fix)", () => {
  // db.getPartnerOfUser's shared-children legacy fallback can return a
  // partner whose partnershipId points at a still-PENDING invite (see
  // server/db.ts's createPartnership: it never auto-promotes an existing
  // pending row). db.requestPartnerProfileAccess's WHERE clause requires
  // status='active' AND confirmed=true, so tapping "request access" on
  // that partnershipId always fails with FORBIDDEN — a dead end the UI
  // shouldn't have offered in the first place.
  it("wife eligible in every other way still gets canRequest=false when the underlying partnership is only pending", async () => {
    dbMocks.getPartnerOfUser.mockResolvedValue(
      partnerRow({ gender: "man", partnershipConfirmed: false }),
    );
    const result: any = await linksRouter
      .createCaller(ctxFor(2, "vrouw"))
      .getPartnerProfile();
    expect(result.access).toBe("restricted");
    expect(result.canRequest).toBe(false);
  });

  it("wife eligible in every other way still gets canRequest=true once the partnership is confirmed (unaffected)", async () => {
    dbMocks.getPartnerOfUser.mockResolvedValue(
      partnerRow({ gender: "man", partnershipConfirmed: true }),
    );
    const result: any = await linksRouter
      .createCaller(ctxFor(2, "vrouw"))
      .getPartnerProfile();
    expect(result.access).toBe("restricted");
    expect(result.canRequest).toBe(true);
  });
});

describe("links.getPartnerProfile / syncWithPartner — full access requires a CONFIRMED partnership, not just gender+grant (round-8 P1 fix)", () => {
  // getPartnerOfUser's shared-children legacy fallback can return a partner
  // whose partnership is still PENDING (createPartnership never auto-
  // promotes an existing pending row — see its own comment). Until now,
  // hasFullPartnerAccess only looked at gender+grant, so a husband — who
  // unconditionally passes the gender check reading his wife — got the
  // FULL payload (parentProfile, children, issues, dailyCheckins, ...)
  // before she had ever confirmed his invite. That breaks
  // linkPartnerByPublicId's own promise to her: "No data is shared until
  // you confirm." Decision: an unconfirmed partnership falls back to the
  // same RESTRICTED shape used for "partner exists but no grant yet" —
  // not null — because the inviter already knows they sent the invite (no
  // security is gained by hiding it from them), restricted already omits
  // every private field, and canRequest/needsGender etc. remain meaningful
  // diagnostics for both sides while they wait on confirmation.
  it("husband viewing wife gets the restricted payload, not full, while the partnership is unconfirmed", async () => {
    dbMocks.getPartnerOfUser.mockResolvedValue(
      partnerRow({ gender: "vrouw", partnershipConfirmed: false }),
    );
    const result: any = await linksRouter
      .createCaller(ctxFor(1, "man"))
      .getPartnerProfile();
    expect(result.access).toBe("restricted");
    expect(result).not.toHaveProperty("parentProfile");
    expect(result).not.toHaveProperty("children");
    expect(result).not.toHaveProperty("issues");
    expect(result).not.toHaveProperty("dailyCheckins");
    expect(result).not.toHaveProperty("actionPlans");
  });

  it("husband viewing wife still gets the full payload once the partnership is confirmed (unaffected)", async () => {
    dbMocks.getPartnerOfUser.mockResolvedValue(
      partnerRow({ gender: "vrouw", partnershipConfirmed: true }),
    );
    const result: any = await linksRouter
      .createCaller(ctxFor(1, "man"))
      .getPartnerProfile();
    expect(result.access).toBe("full");
    expect(result.parentProfile.feelingAboutPartner).toBe("Blij en dankbaar");
  });

  it("wife viewing husband with an active grant still gets the restricted payload while unconfirmed", async () => {
    dbMocks.getPartnerOfUser.mockResolvedValue(
      partnerRow({
        gender: "man",
        grantedAt: new Date("2026-01-01"),
        partnershipConfirmed: false,
      }),
    );
    const result: any = await linksRouter
      .createCaller(ctxFor(2, "vrouw"))
      .getPartnerProfile();
    expect(result.access).toBe("restricted");
    expect(result).not.toHaveProperty("parentProfile");
  });

  it("syncWithPartner: husband syncing with wife does not merge her data while the partnership is unconfirmed", async () => {
    dbMocks.getPartnerOfUser.mockResolvedValue(
      partnerRow({
        gender: "vrouw",
        partnershipConfirmed: false,
        extraData: { children: [{ id: "c1", name: "Kid", birthDate: "2020-01-01" }] },
      }),
    );
    dbMocks.getUserById.mockResolvedValue({ profileData: { children: [] } });
    const result: any = await linksRouter.createCaller(ctxFor(1, "man")).syncWithPartner();
    expect(result.success).toBe(false);
    expect(result).not.toHaveProperty("merged");
    expect(dbMocks.updateUserProfile).not.toHaveBeenCalled();
  });

  it("syncWithPartner: husband syncing with wife still merges normally once the partnership is confirmed (unaffected)", async () => {
    dbMocks.getPartnerOfUser.mockResolvedValue(
      partnerRow({
        gender: "vrouw",
        partnershipConfirmed: true,
        extraData: { children: [{ id: "c1", name: "Kid", birthDate: "2020-01-01" }] },
      }),
    );
    dbMocks.getUserById.mockResolvedValue({ profileData: { children: [] } });
    const result: any = await linksRouter.createCaller(ctxFor(1, "man")).syncWithPartner();
    expect(result.success).toBe(true);
    expect(result.merged.children).toBe(1);
    expect(dbMocks.updateUserProfile).toHaveBeenCalled();
  });
});

describe("links access-control 'operation failed' errors are trilingual, matching the gender-check errors already in the same mutations (round-6 P3 fix)", () => {
  it("requestPartnerProfileAccess: FORBIDDEN message includes nl/en/ar", async () => {
    dbMocks.getPartnerOfUser.mockResolvedValue(
      partnerRow({ gender: "man", id: 9, partnershipId: 3 }),
    );
    dbMocks.requestPartnerProfileAccess.mockResolvedValue(false);
    await expect(
      linksRouter.createCaller(ctxFor(2, "vrouw")).requestPartnerProfileAccess(),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message:
        "Verzoek kon niet worden verstuurd / Request could not be sent / تعذر إرسال الطلب",
    });
  });

  it("grantPartnerProfileAccess: FORBIDDEN message includes nl/en/ar", async () => {
    dbMocks.getPartnerOfUser.mockResolvedValue(
      partnerRow({ gender: "vrouw", partnershipId: 77 }),
    );
    dbMocks.grantPartnerProfileAccess.mockResolvedValue(false);
    await expect(
      linksRouter.createCaller(ctxFor(1, "man")).grantPartnerProfileAccess(),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Kon geen toegang verlenen / Could not grant access / تعذر منح الوصول",
    });
  });

  it("revokePartnerProfileAccess: FORBIDDEN message includes nl/en/ar", async () => {
    dbMocks.getPartnerOfUser.mockResolvedValue(
      partnerRow({ gender: "vrouw", partnershipId: 12 }),
    );
    dbMocks.revokePartnerProfileAccess.mockResolvedValue(false);
    await expect(
      linksRouter.createCaller(ctxFor(1, "man")).revokePartnerProfileAccess(),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Kon toegang niet intrekken / Could not revoke access / تعذر سحب الوصول",
    });
  });
});

describe("links.getPartnerProfile — incoming request signal (Gap 1)", () => {
  it("husband sees incomingRequestPending=true when his wife has an outstanding request", async () => {
    dbMocks.getPartnerOfUser.mockResolvedValue(
      partnerRow({ gender: "vrouw", requestedAt: new Date("2026-01-01"), grantedAt: null }),
    );
    const result: any = await linksRouter.createCaller(ctxFor(1, "man")).getPartnerProfile();
    expect(result.access).toBe("full");
    expect(result.incomingRequestPending).toBe(true);
    expect(result.grantedToPartner).toBe(false);
  });

  it("husband sees incomingRequestPending=false when there is no outstanding request", async () => {
    dbMocks.getPartnerOfUser.mockResolvedValue(partnerRow({ gender: "vrouw" }));
    const result: any = await linksRouter.createCaller(ctxFor(1, "man")).getPartnerProfile();
    expect(result.access).toBe("full");
    expect(result.incomingRequestPending).toBe(false);
  });

  it("husband sees grantedToPartner=true once he has granted his wife access", async () => {
    dbMocks.getPartnerOfUser.mockResolvedValue(
      partnerRow({ gender: "vrouw", grantedAt: new Date("2026-01-01") }),
    );
    const result: any = await linksRouter.createCaller(ctxFor(1, "man")).getPartnerProfile();
    expect(result.access).toBe("full");
    expect(result.grantedToPartner).toBe(true);
    expect(result.incomingRequestPending).toBe(false);
  });
});

describe("links.getPartnerProfile — needsMyGender / needsPartnerGender split", () => {
  it("only the caller's gender is missing: needsMyGender true, needsPartnerGender false", async () => {
    dbMocks.getPartnerOfUser.mockResolvedValue(partnerRow({ gender: "man" }));
    const result: any = await linksRouter
      .createCaller(ctxFor(1, undefined))
      .getPartnerProfile();
    expect(result.access).toBe("restricted");
    expect(result.needsMyGender).toBe(true);
    expect(result.needsPartnerGender).toBe(false);
  });

  it("only the partner's gender is missing: needsPartnerGender true, needsMyGender false", async () => {
    dbMocks.getPartnerOfUser.mockResolvedValue(partnerRow({ gender: undefined }));
    const result: any = await linksRouter
      .createCaller(ctxFor(1, "man"))
      .getPartnerProfile();
    expect(result.access).toBe("restricted");
    expect(result.needsMyGender).toBe(false);
    expect(result.needsPartnerGender).toBe(true);
  });

  it("both genders set the same: neither individual flag fires, but needsGender still does", async () => {
    dbMocks.getPartnerOfUser.mockResolvedValue(partnerRow({ gender: "man" }));
    const result: any = await linksRouter
      .createCaller(ctxFor(1, "man"))
      .getPartnerProfile();
    expect(result.needsMyGender).toBe(false);
    expect(result.needsPartnerGender).toBe(false);
    expect(result.needsGender).toBe(true);
  });
});

describe("links.getPartnerProfile — incoming request stays answerable even if her gender is unset (trap fix)", () => {
  it("husband still sees incomingRequestPending when the wife's gender is currently unset", async () => {
    dbMocks.getPartnerOfUser.mockResolvedValue(
      partnerRow({ gender: undefined, requestedAt: new Date("2026-01-01"), grantedAt: null }),
    );
    const result: any = await linksRouter
      .createCaller(ctxFor(1, "man"))
      .getPartnerProfile();
    // Her gender being unset means this can't be a "full" (private-fields)
    // response, but the request/grant workflow signals must still surface.
    expect(result.access).toBe("restricted");
    expect(result.incomingRequestPending).toBe(true);
  });
});

describe("Gap 2 regression: revoke/decline must clear the pending-request timestamp too", () => {
  // Stateful double of the `partnerships` row's two nullable columns, wired
  // to the same db.ts entry points the router calls. This file wholesale-
  // mocks ../server/db (see vi.mock above), so this proves the ROUTER
  // correctly reads/threads both timestamp fields end to end — it does not
  // exercise server/db.ts's real .set(...) call, which has no automated
  // coverage in this file and was instead verified by manual trace.
  function wireStatefulPartnershipMock(gender: "man" | "vrouw") {
    const row = { requestedAt: null as Date | null, grantedAt: null as Date | null };
    dbMocks.requestPartnerProfileAccess.mockImplementation(async () => {
      row.requestedAt = new Date();
      return true;
    });
    dbMocks.grantPartnerProfileAccess.mockImplementation(async () => {
      row.grantedAt = new Date();
      return true;
    });
    dbMocks.revokePartnerProfileAccess.mockImplementation(async () => {
      // Mirrors server/db.ts revokePartnerProfileAccess's .set(...) call.
      row.grantedAt = null;
      row.requestedAt = null;
      return true;
    });
    dbMocks.getPartnerOfUser.mockImplementation(async () =>
      partnerRow({ gender, id: 9, partnershipId: 55, requestedAt: row.requestedAt, grantedAt: row.grantedAt }),
    );
    return row;
  }

  it("request -> grant -> revoke leaves her able to request again", async () => {
    wireStatefulPartnershipMock("man");
    const wife = linksRouter.createCaller(ctxFor(2, "vrouw"));
    const husband = linksRouter.createCaller(ctxFor(1, "man"));

    await wife.requestPartnerProfileAccess();
    await husband.grantPartnerProfileAccess();
    await husband.revokePartnerProfileAccess();

    const result: any = await wife.getPartnerProfile();
    expect(result.canRequest).toBe(true);
    expect(result.requestPending).toBe(false);
  });

  it("decline (revoke without ever granting) also leaves her able to request again", async () => {
    wireStatefulPartnershipMock("man");
    const wife = linksRouter.createCaller(ctxFor(2, "vrouw"));
    const husband = linksRouter.createCaller(ctxFor(1, "man"));

    await wife.requestPartnerProfileAccess();
    await husband.revokePartnerProfileAccess(); // decline: never granted first

    const result: any = await wife.getPartnerProfile();
    expect(result.canRequest).toBe(true);
    expect(result.requestPending).toBe(false);
  });
});

describe("links.syncWithPartner enforces the same gender/grant gate as getPartnerProfile (Finding 1)", () => {
  it("husband syncing with his wife (full access) merges normally", async () => {
    dbMocks.getPartnerOfUser.mockResolvedValue(
      partnerRow({
        gender: "vrouw",
        extraData: { children: [{ id: "c1", name: "Kid", birthDate: "2020-01-01" }] },
      }),
    );
    dbMocks.getUserById.mockResolvedValue({ profileData: { children: [] } });
    const result: any = await linksRouter.createCaller(ctxFor(1, "man")).syncWithPartner();
    expect(result.success).toBe(true);
    expect(result.merged.children).toBe(1);
    expect(dbMocks.updateUserProfile).toHaveBeenCalled();
  });

  it("wife syncing WITHOUT a grant: no merge, no partner data returned, nothing persisted", async () => {
    dbMocks.getPartnerOfUser.mockResolvedValue(
      partnerRow({
        gender: "man",
        extraData: { children: [{ id: "h1", name: "HisKid", birthDate: "2019-01-01" }] },
      }),
    );
    dbMocks.getUserById.mockResolvedValue({ profileData: { children: [] } });
    const result: any = await linksRouter.createCaller(ctxFor(2, "vrouw")).syncWithPartner();
    expect(result.success).toBe(false);
    expect(result).not.toHaveProperty("partnerData");
    expect(result).not.toHaveProperty("merged");
    expect(dbMocks.updateUserProfile).not.toHaveBeenCalled();
  });

  it("wife syncing AFTER a grant merges normally", async () => {
    dbMocks.getPartnerOfUser.mockResolvedValue(
      partnerRow({
        gender: "man",
        grantedAt: new Date("2026-01-01"),
        extraData: { children: [{ id: "h1", name: "HisKid", birthDate: "2019-01-01" }] },
      }),
    );
    dbMocks.getUserById.mockResolvedValue({ profileData: { children: [] } });
    const result: any = await linksRouter.createCaller(ctxFor(2, "vrouw")).syncWithPartner();
    expect(result.success).toBe(true);
    expect(result.merged.children).toBe(1);
    expect(dbMocks.updateUserProfile).toHaveBeenCalled();
  });
});

describe("links.getPartnerProfile / syncWithPartner — gender falls back to the users.gender column when the JSON copy is missing (round-3 fix)", () => {
  it("getPartnerProfile: husband still gets full access when the wife's gender is on the column but her JSON copy is missing", async () => {
    dbMocks.getPartnerOfUser.mockResolvedValue(
      partnerRow({ gender: undefined, columnGender: "vrouw" }),
    );
    const result: any = await linksRouter
      .createCaller(ctxFor(1, "man"))
      .getPartnerProfile();
    expect(result.access).toBe("full");
  });

  it("syncWithPartner: husband's sync is not blocked when the wife's gender is on the column but her JSON copy is missing", async () => {
    dbMocks.getPartnerOfUser.mockResolvedValue(
      partnerRow({
        gender: undefined,
        columnGender: "vrouw",
        extraData: { children: [{ id: "c1", name: "Kid", birthDate: "2020-01-01" }] },
      }),
    );
    dbMocks.getUserById.mockResolvedValue({ profileData: { children: [] } });
    const result: any = await linksRouter.createCaller(ctxFor(1, "man")).syncWithPartner();
    expect(result.success).toBe(true);
    expect(result.merged.children).toBe(1);
  });

  it("syncWithPartner: husband's OWN sync is not blocked when HIS gender is on the column but his own JSON copy is missing", async () => {
    dbMocks.getPartnerOfUser.mockResolvedValue(
      partnerRow({
        gender: "vrouw",
        extraData: { children: [{ id: "c1", name: "Kid", birthDate: "2020-01-01" }] },
      }),
    );
    dbMocks.getUserById.mockResolvedValue({ profileData: { children: [] } });
    const ctx = {
      req: {} as any,
      res: {} as any,
      user: { id: 1, name: "Husband", language: "nl", gender: "man", profileData: {} } as any,
    };
    const result: any = await linksRouter.createCaller(ctx).syncWithPartner();
    expect(result.success).toBe(true);
    expect(result.merged.children).toBe(1);
  });
});

describe("translateProfileValue (lib/profile-labels)", () => {
  it("maps a known key to the label in the given language", () => {
    expect(translateProfileValue("altijd_5", "nl")).toBe("Altijd alle 5");
    expect(translateProfileValue("altijd_5", "en")).toBe("Always all 5");
    expect(translateProfileValue("altijd_5", "ar")).toBe("دائمًا الخمس");
  });

  it("maps each part of a comma-joined value and joins them readably", () => {
    const result = translateProfileValue("geleerden_direct,boeken", "en");
    expect(result).toContain("Directly from scholars");
    expect(result).toContain("Books");
  });

  it("falls back to the raw key for an unknown value instead of throwing", () => {
    expect(translateProfileValue("goed_sterk", "en")).toBe("goed_sterk");
  });

  it("returns a placeholder for empty input instead of throwing", () => {
    expect(translateProfileValue(undefined, "nl")).toBe("-");
    expect(translateProfileValue("", "en")).toBe("-");
  });
});

describe("links.grantPartnerProfileAccess / revokePartnerProfileAccess authorization", () => {
  it("only the husband can grant; a wife calling grant must not succeed", async () => {
    dbMocks.getPartnerOfUser.mockResolvedValue(partnerRow({ gender: "man" }));
    await expect(
      linksRouter.createCaller(ctxFor(2, "vrouw")).grantPartnerProfileAccess(),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(dbMocks.grantPartnerProfileAccess).not.toHaveBeenCalled();
  });

  it("the husband can grant", async () => {
    dbMocks.getPartnerOfUser.mockResolvedValue(
      partnerRow({ gender: "vrouw", partnershipId: 77 }),
    );
    dbMocks.grantPartnerProfileAccess.mockResolvedValue(true);
    const result = await linksRouter.createCaller(ctxFor(1, "man")).grantPartnerProfileAccess();
    expect(result).toEqual({ success: true });
    expect(dbMocks.grantPartnerProfileAccess).toHaveBeenCalledWith(77, 1);
  });

  it("granting notifies the wife (parity with requestPartnerProfileAccess's notification)", async () => {
    dbMocks.getPartnerOfUser.mockResolvedValue(
      partnerRow({ gender: "vrouw", id: 8, partnershipId: 77 }),
    );
    dbMocks.grantPartnerProfileAccess.mockResolvedValue(true);
    await linksRouter.createCaller(ctxFor(1, "man")).grantPartnerProfileAccess();
    expect(dbMocks.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ recipientId: 8, senderId: 1 }),
    );
    expect(dbMocks.sendLocalizedPush).toHaveBeenCalled();
  });

  it("the husband can revoke", async () => {
    dbMocks.getPartnerOfUser.mockResolvedValue(
      partnerRow({ gender: "vrouw", partnershipId: 12 }),
    );
    dbMocks.revokePartnerProfileAccess.mockResolvedValue(true);
    const result = await linksRouter.createCaller(ctxFor(1, "man")).revokePartnerProfileAccess();
    expect(result).toEqual({ success: true });
    expect(dbMocks.revokePartnerProfileAccess).toHaveBeenCalledWith(12, 1);
  });

  it("a wife calling revoke must not succeed", async () => {
    dbMocks.getPartnerOfUser.mockResolvedValue(partnerRow({ gender: "man" }));
    await expect(
      linksRouter.createCaller(ctxFor(2, "vrouw")).revokePartnerProfileAccess(),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(dbMocks.revokePartnerProfileAccess).not.toHaveBeenCalled();
  });
});

describe("links.requestPartnerProfileAccess authorization + notification", () => {
  it("the wife can request, and the husband is notified (message + push)", async () => {
    dbMocks.getPartnerOfUser.mockResolvedValue(
      partnerRow({ gender: "man", id: 9, partnershipId: 3 }),
    );
    dbMocks.requestPartnerProfileAccess.mockResolvedValue(true);
    const result = await linksRouter
      .createCaller(ctxFor(2, "vrouw"))
      .requestPartnerProfileAccess();
    expect(result).toEqual({ success: true });
    expect(dbMocks.requestPartnerProfileAccess).toHaveBeenCalledWith(3, 2);
    expect(dbMocks.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ recipientId: 9, senderId: 2 }),
    );
    expect(dbMocks.sendLocalizedPush).toHaveBeenCalledWith(
      9,
      expect.any(String),
      expect.any(String),
      expect.any(String),
      expect.any(String),
      expect.any(String),
      expect.any(String),
      expect.anything(),
    );
  });

  it("a husband calling request must not succeed", async () => {
    dbMocks.getPartnerOfUser.mockResolvedValue(partnerRow({ gender: "vrouw" }));
    await expect(
      linksRouter.createCaller(ctxFor(1, "man")).requestPartnerProfileAccess(),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(dbMocks.requestPartnerProfileAccess).not.toHaveBeenCalled();
  });

  it("repeat request while one is already pending is idempotent: no re-stamp, no re-notify", async () => {
    // An unanswered request already exists (requestedAt set, not yet
    // granted) — every extra tap of the button used to re-send the husband
    // a push + in-app message. "Unanswered" is bounded by the existing
    // grant/revoke state machine, so no separate time window is needed.
    dbMocks.getPartnerOfUser.mockResolvedValue(
      partnerRow({ gender: "man", id: 9, partnershipId: 3, requestedAt: new Date("2026-01-01") }),
    );
    const result = await linksRouter
      .createCaller(ctxFor(2, "vrouw"))
      .requestPartnerProfileAccess();
    expect(result).toEqual({ success: true });
    expect(dbMocks.requestPartnerProfileAccess).not.toHaveBeenCalled();
    expect(dbMocks.sendMessage).not.toHaveBeenCalled();
    expect(dbMocks.sendLocalizedPush).not.toHaveBeenCalled();
  });

  it("repeat request after access has already been granted is idempotent: no re-stamp, no re-notify (round-5 fix)", async () => {
    // grantPartnerProfileAccess never clears requestedAt, so once granted
    // both timestamps are set simultaneously. The pre-existing guard only
    // checked "requestedAt && !grantedAt", so a wife who already has access
    // could still fire a fresh request here and re-notify the husband with
    // an access-request message he already answered.
    dbMocks.getPartnerOfUser.mockResolvedValue(
      partnerRow({
        gender: "man",
        id: 9,
        partnershipId: 3,
        requestedAt: new Date("2026-01-01"),
        grantedAt: new Date("2026-01-02"),
      }),
    );
    const result = await linksRouter
      .createCaller(ctxFor(2, "vrouw"))
      .requestPartnerProfileAccess();
    expect(result).toEqual({ success: true });
    expect(dbMocks.requestPartnerProfileAccess).not.toHaveBeenCalled();
    expect(dbMocks.sendMessage).not.toHaveBeenCalled();
    expect(dbMocks.sendLocalizedPush).not.toHaveBeenCalled();
  });

  it("repeat request after a proactive grant (husband granted before she ever requested) is also idempotent", async () => {
    // grantPartnerProfileAccess has no precondition that a request exists
    // first, so grantedAt can be set while requestedAt is still null — the
    // guard must check grantedAt directly, not infer it from requestedAt.
    dbMocks.getPartnerOfUser.mockResolvedValue(
      partnerRow({ gender: "man", id: 9, partnershipId: 3, requestedAt: null, grantedAt: new Date("2026-01-02") }),
    );
    const result = await linksRouter
      .createCaller(ctxFor(2, "vrouw"))
      .requestPartnerProfileAccess();
    expect(result).toEqual({ success: true });
    expect(dbMocks.requestPartnerProfileAccess).not.toHaveBeenCalled();
    expect(dbMocks.sendMessage).not.toHaveBeenCalled();
  });

  it("a request that loses a concurrent race at the DB layer still reports success once access is confirmed pending/granted (round-7 P3 fix)", async () => {
    // Simulates two near-simultaneous calls: this call's own pre-check (the
    // FIRST getPartnerOfUser fetch below) saw no pending request — stale by
    // the time its write actually ran, because a concurrent call landed
    // first. db.requestPartnerProfileAccess's WHERE clause is conditional
    // on both timestamps being unset, so exactly one caller's write can
    // succeed; the loser must re-check post-update state rather than
    // report a bare FORBIDDEN for what is really an idempotent no-op.
    let call = 0;
    dbMocks.getPartnerOfUser.mockImplementation(async () => {
      call++;
      return partnerRow({
        gender: "man",
        id: 9,
        partnershipId: 3,
        requestedAt: call > 1 ? new Date("2026-01-01") : null,
      });
    });
    dbMocks.requestPartnerProfileAccess.mockResolvedValue(false);

    const result = await linksRouter
      .createCaller(ctxFor(2, "vrouw"))
      .requestPartnerProfileAccess();

    expect(result).toEqual({ success: true });
    expect(call).toBe(2); // pre-check, then the post-failure re-fetch
  });
});

describe("links.requestPartnerProfileAccess / grantPartnerProfileAccess / revokePartnerProfileAccess — gender falls back to the users.gender column when the JSON copy is missing (round-4 fix)", () => {
  // Same gap as the round-3 fix for getPartnerProfile/syncWithPartner
  // (see resolveGender): these three mutations read
  // profileData.parentProfile.gender directly instead of going through
  // resolveGender, so a caller whose gender lives only on the users.gender
  // COLUMN (JSON copy never backfilled) gets wrongly refused here even
  // though the UI gate (getPartnerProfile) already resolved them as
  // eligible — a dead-end button.
  it("grantPartnerProfileAccess: husband succeeds when his gender is on the column but his JSON copy is missing", async () => {
    dbMocks.getPartnerOfUser.mockResolvedValue(
      partnerRow({ gender: "vrouw", partnershipId: 77 }),
    );
    dbMocks.grantPartnerProfileAccess.mockResolvedValue(true);
    const ctx = {
      req: {} as any,
      res: {} as any,
      user: { id: 1, name: "Husband", language: "nl", gender: "man", profileData: {} } as any,
    };
    const result = await linksRouter.createCaller(ctx).grantPartnerProfileAccess();
    expect(result).toEqual({ success: true });
    expect(dbMocks.grantPartnerProfileAccess).toHaveBeenCalledWith(77, 1);
  });

  it("revokePartnerProfileAccess: husband succeeds when his gender is on the column but his JSON copy is missing", async () => {
    dbMocks.getPartnerOfUser.mockResolvedValue(
      partnerRow({ gender: "vrouw", partnershipId: 12 }),
    );
    dbMocks.revokePartnerProfileAccess.mockResolvedValue(true);
    const ctx = {
      req: {} as any,
      res: {} as any,
      user: { id: 1, name: "Husband", language: "nl", gender: "man", profileData: {} } as any,
    };
    const result = await linksRouter.createCaller(ctx).revokePartnerProfileAccess();
    expect(result).toEqual({ success: true });
    expect(dbMocks.revokePartnerProfileAccess).toHaveBeenCalledWith(12, 1);
  });

  it("requestPartnerProfileAccess: wife succeeds when her gender is on the column but her JSON copy is missing", async () => {
    dbMocks.getPartnerOfUser.mockResolvedValue(
      partnerRow({ gender: "man", id: 9, partnershipId: 3 }),
    );
    dbMocks.requestPartnerProfileAccess.mockResolvedValue(true);
    const ctx = {
      req: {} as any,
      res: {} as any,
      user: { id: 2, name: "Wife", language: "nl", gender: "vrouw", profileData: {} } as any,
    };
    const result = await linksRouter.createCaller(ctx).requestPartnerProfileAccess();
    expect(result).toEqual({ success: true });
    expect(dbMocks.requestPartnerProfileAccess).toHaveBeenCalledWith(3, 2);
  });
});

// Stateful double of one users row (profileData JSON + the dedicated
// `gender` column), wired to db.getUserById / db.updateUserProfile. Mirrors
// real server/db.ts updateUserProfile exactly: the gender COLUMN is only
// ever WRITTEN when parentProfile.gender is truthy, never cleared — that
// asymmetry is exactly what the wipe-then-set bypass (and its fix) hinges
// on, so a mock that clears the column on every call would hide both the
// bug and the fix.
function wireStatefulUserRow(row: { id: number; gender: string | null; profileData: any }) {
  dbMocks.getUserById.mockImplementation(async (id: number) => (id === row.id ? row : undefined));
  dbMocks.updateUserProfile.mockImplementation(async (id: number, profileData: any) => {
    if (id !== row.id) return;
    row.profileData = profileData;
    const g = (profileData as any)?.parentProfile?.gender;
    if (g) row.gender = g;
  });
  return row;
}

describe("SECURITY: a gender change revokes every profile-access grant it's party to, so self-granting via a temporary flip cannot succeed (round-7 redesign)", () => {
  it("4-step exploit (save man -> grant -> save vrouw -> read) must not yield the husband's full profile", async () => {
    const husband = {
      id: 9,
      name: "Husband",
      profileData: {
        parentProfile: {
          gender: "man",
          feelingAboutPartner: "Blij en dankbaar",
          psychologistDetails: "Bezoekt maandelijks",
        },
      },
    };
    const wife = wireStatefulUserRow({
      id: 2,
      gender: "vrouw",
      profileData: { parentProfile: { gender: "vrouw" } },
    });
    const partnership = { id: 55, requestedAt: null as Date | null, grantedAt: null as Date | null };

    dbMocks.getPartnerOfUser.mockImplementation(async (id: number) =>
      id === wife.id
        ? {
            id: husband.id,
            name: husband.name,
            profileData: husband.profileData,
            partnershipId: partnership.id,
            profileAccessRequestedAt: partnership.requestedAt,
            profileAccessGrantedAt: partnership.grantedAt,
          }
        : null,
    );
    dbMocks.grantPartnerProfileAccess.mockImplementation(async () => {
      partnership.grantedAt = new Date();
      return true;
    });
    // The mechanism under test: profile.save must call this whenever the
    // caller's gender actually changes. Wired to actually clear the
    // partnership here (not left as a no-op stub) so this test can tell
    // "revocation happened" apart from "revocation was never triggered".
    dbMocks.revokeProfileAccessGrantsForUser.mockImplementation(async () => {
      partnership.grantedAt = null;
      partnership.requestedAt = null;
    });

    // ctx.user must re-read the wife's CURRENT row on every call, exactly as
    // the real per-request DB re-fetch in server/_core/sdk.ts does — a
    // static ctx snapshot would hide both the exploit and the fix.
    const wifeCtx = () => ({
      req: {} as any,
      res: {} as any,
      user: { id: wife.id, name: "Wife", language: "nl", gender: wife.gender, profileData: wife.profileData } as any,
    });

    // Step 1: spoof gender to "man" (now a real, allowed change).
    await profileRouter
      .createCaller(wifeCtx())
      .save({ profileData: { parentProfile: { gender: "man" } } });
    // Step 2: self-grant.
    await linksRouter
      .createCaller(wifeCtx())
      .grantPartnerProfileAccess()
      .catch(() => {});
    // Step 3: flip back — this is the step that must destroy the grant
    // step 2 just created.
    await profileRouter
      .createCaller(wifeCtx())
      .save({ profileData: { parentProfile: { gender: "vrouw" } } });
    // Step 4: read the partner profile.
    const result: any = await linksRouter.createCaller(wifeCtx()).getPartnerProfile();

    expect(wife.profileData.parentProfile.gender).toBe("vrouw");
    expect(partnership.grantedAt).toBeNull();
    expect(result.access).not.toBe("full");
    expect(result).not.toHaveProperty("parentProfile");
    expect(result).not.toHaveProperty("issues");
  });

  it("a gender change alone (no exploit attempt) revokes an existing grant and notifies the partner", async () => {
    // Non-adversarial case: the husband legitimately granted his wife
    // access, then later corrects a mistaken gender entry on his OWN
    // profile. He's a party to the partnership too, so his change must
    // also revoke it — the exploit only closes if revocation is symmetric.
    const husband = wireStatefulUserRow({
      id: 1,
      gender: "man",
      profileData: { parentProfile: { gender: "man" } },
    });
    const partnership = { requestedAt: null as Date | null, grantedAt: new Date("2026-01-01") as Date | null };
    dbMocks.getPartnerOfUser.mockImplementation(async () => ({
      id: 2,
      name: "Wife",
      profileData: {},
      partnershipId: 55,
      profileAccessRequestedAt: partnership.requestedAt,
      profileAccessGrantedAt: partnership.grantedAt,
    }));
    dbMocks.revokeProfileAccessGrantsForUser.mockImplementation(async () => {
      partnership.grantedAt = null;
      partnership.requestedAt = null;
    });

    const ctx = {
      req: {} as any,
      res: {} as any,
      user: { id: husband.id, name: "Husband", language: "nl", gender: husband.gender, profileData: husband.profileData } as any,
    };
    await profileRouter.createCaller(ctx).save({ profileData: { parentProfile: { gender: "vrouw" } } });

    expect(dbMocks.revokeProfileAccessGrantsForUser).toHaveBeenCalledWith(1);
    expect(partnership.grantedAt).toBeNull();
    expect(dbMocks.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientId: 2,
        content: expect.stringContaining("toegang tot het profiel is ingetrokken"),
      }),
    );
  });

  it("a same-value re-save (no actual gender change) does not revoke anything — the debounced background sync must not fire this on every tick", async () => {
    const wife = wireStatefulUserRow({
      id: 2,
      gender: "vrouw",
      profileData: { parentProfile: { gender: "vrouw" } },
    });
    const ctx = {
      req: {} as any,
      res: {} as any,
      user: { id: wife.id, name: "Wife", language: "nl", gender: wife.gender, profileData: wife.profileData } as any,
    };
    await profileRouter.createCaller(ctx).save({ profileData: { parentProfile: { gender: "vrouw" } } });
    expect(dbMocks.revokeProfileAccessGrantsForUser).not.toHaveBeenCalled();
  });

  it("a legacy row whose gender lives only in the JSON copy still revokes on a change", async () => {
    // Pre-migration-0012 rows can carry users.gender NULL with
    // profileData.parentProfile.gender set — resolveGender's own doc names the
    // case, and every authorization here (getPartnerProfile, syncWithPartner,
    // request/grantPartnerProfileAccess) resolves through it, so those rows CAN
    // hold and grant access. The revocation protecting those same
    // authorizations was anchored on the column alone, so for exactly these
    // rows a gender flip was invisible to it: grant as "man", save "vrouw",
    // keep the grant. Column stays the preferred anchor (the JSON copy is
    // erasable by save({profileData:{}})); the JSON is consulted only when the
    // column has nothing to say.
    const husband = wireStatefulUserRow({
      id: 1,
      gender: null,
      profileData: { parentProfile: { gender: "man" } },
    });
    const partnership = {
      requestedAt: null as Date | null,
      grantedAt: new Date("2026-01-01") as Date | null,
    };
    dbMocks.getPartnerOfUser.mockImplementation(async () => ({
      id: 2,
      name: "Wife",
      profileData: {},
      partnershipId: 55,
      profileAccessRequestedAt: partnership.requestedAt,
      profileAccessGrantedAt: partnership.grantedAt,
    }));
    dbMocks.revokeProfileAccessGrantsForUser.mockImplementation(async () => {
      partnership.grantedAt = null;
      partnership.requestedAt = null;
    });

    const ctx = {
      req: {} as any,
      res: {} as any,
      user: {
        id: husband.id,
        name: "Husband",
        language: "nl",
        gender: husband.gender,
        profileData: husband.profileData,
      } as any,
    };
    await profileRouter
      .createCaller(ctx)
      .save({ profileData: { parentProfile: { gender: "vrouw" } } });

    expect(dbMocks.revokeProfileAccessGrantsForUser).toHaveBeenCalledWith(1);
    expect(partnership.grantedAt).toBeNull();
  });

  it("wipe-then-set: an empty-object save doesn't corrupt the gender anchor, and a genuine follow-up change still takes effect", async () => {
    // Round-6 finding: the anchor lived only in the JSON copy, and
    // updateUserProfile fully REPLACES that column on every save, so
    // save({profileData:{}}) erased it. Re-stamping from the users.gender
    // COLUMN on every save (see routers.ts) still protects the anchor
    // itself — that part is unrelated to the round-7 redesign. What DOES
    // change: the follow-up gender change is no longer rejected, it takes
    // effect (and would revoke any grant, covered by the tests above).
    const wife = wireStatefulUserRow({
      id: 2,
      gender: "vrouw",
      profileData: { parentProfile: { gender: "vrouw" } },
    });
    const ctx = () => ({
      req: {} as any,
      res: {} as any,
      user: { id: wife.id, name: "Wife", language: "nl", gender: wife.gender, profileData: wife.profileData } as any,
    });

    await profileRouter.createCaller(ctx()).save({ profileData: {} });
    expect(wife.gender).toBe("vrouw");

    await profileRouter.createCaller(ctx()).save({ profileData: { parentProfile: { gender: "man" } } });
    expect(wife.gender).toBe("man");
    expect(wife.profileData.parentProfile.gender).toBe("man");
  });
});

describe("profile.save reports the effective gender after a save (round-3 fix; updated for the round-7 redesign)", () => {
  it("gender change: the response reports the NEW value now that changes are allowed", async () => {
    const wife = wireStatefulUserRow({
      id: 2,
      gender: "vrouw",
      profileData: { parentProfile: { gender: "vrouw" } },
    });
    const ctx = {
      req: {} as any,
      res: {} as any,
      user: { id: wife.id, name: "Wife", language: "nl", gender: wife.gender, profileData: wife.profileData } as any,
    };
    const result: any = await profileRouter
      .createCaller(ctx)
      .save({ profileData: { parentProfile: { gender: "man" } } });
    expect(result.gender).toBe("man");
    expect(wife.profileData.parentProfile.gender).toBe("man");
  });

  it("first-time set: the response reports the newly-set gender", async () => {
    const user = wireStatefulUserRow({ id: 4, gender: null, profileData: {} });
    const ctx = {
      req: {} as any,
      res: {} as any,
      user: { id: user.id, name: "New User", language: "nl", gender: null, profileData: {} } as any,
    };
    const result: any = await profileRouter
      .createCaller(ctx)
      .save({ profileData: { parentProfile: { gender: "man" } } });
    expect(result.gender).toBe("man");
  });
});

describe("links.setMyGender writes parentProfile.gender, not just userFunctions", () => {
  it("first-time set: persists gender into parentProfile and still assigns the auto-function", async () => {
    dbMocks.getUserFunctions.mockResolvedValue([]);
    const ctx = {
      req: {} as any,
      res: {} as any,
      user: { id: 1, name: "User", language: "nl", profileData: {} } as any,
    };
    const result = await linksRouter.createCaller(ctx).setMyGender({ gender: "man" });
    expect(result).toEqual({ function: "vader" });
    expect(dbMocks.addUserFunction).toHaveBeenCalledWith(1, "vader");
    expect(dbMocks.updateUserProfile).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        parentProfile: expect.objectContaining({ gender: "man" }),
      }),
      { markOnboardingComplete: false },
    );
  });

  it("does not silently complete onboarding as a side effect (round-5 fix): the remediation screen only fixes gender", async () => {
    // db.updateUserProfile forces onboardingCompleted=true unconditionally
    // by default (it's also called from profile.save, the real end-of-
    // onboarding save). setMyGender is a narrow remediation action reachable
    // long after onboarding from app/spouse-profile.tsx — it must opt out,
    // not piggyback on that default. See the dedicated db.updateUserProfile
    // tests near the bottom of this file for proof the flag is honored.
    dbMocks.getUserFunctions.mockResolvedValue([]);
    const ctx = {
      req: {} as any,
      res: {} as any,
      user: { id: 1, name: "User", language: "nl", profileData: {} } as any,
    };
    await linksRouter.createCaller(ctx).setMyGender({ gender: "man" });
    expect(dbMocks.updateUserProfile).toHaveBeenCalledWith(
      1,
      expect.anything(),
      { markOnboardingComplete: false },
    );
  });

  it("already-set gender is immutable even if the JSON copy was wiped: repairs the JSON copy from the column instead of no-opping forever", async () => {
    // Anchored on ctx.user.gender (the column), not profileData. This test
    // used to assert `updateUserProfile` was NOT called here — that was
    // pinning a bug, not a guard: with the column set but the JSON copy
    // wiped, the old `if (!ctx.user.gender)` guard is false, so the
    // mutation silently did nothing. getPartnerProfile reads gender from
    // the JSON copy, so needsMyGender stayed true forever and the
    // man/vrouw buttons never stopped reappearing — an unbreakable loop.
    // The invariant is: the JSON copy gets repaired FROM the column (the
    // source of truth), and the tapped value ("man") must NOT win — that
    // would flip a real "vrouw" to "man", exactly what immutability exists
    // to prevent.
    dbMocks.getUserFunctions.mockResolvedValue([]);
    const ctx = {
      req: {} as any,
      res: {} as any,
      user: { id: 1, name: "User", language: "nl", gender: "vrouw", profileData: {} } as any,
    };
    await linksRouter.createCaller(ctx).setMyGender({ gender: "man" });
    expect(dbMocks.updateUserProfile).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        parentProfile: expect.objectContaining({ gender: "vrouw" }),
      }),
      { markOnboardingComplete: false },
    );
  });

  it("a rejected flip must not also add the role for the rejected gender (round-4 fix)", async () => {
    // autoFunc used to be computed from input.gender BEFORE the immutability
    // guard resolved the effective (retained) gender. So a "vrouw" -> "man"
    // flip that the guard correctly refuses still added the "vader" role,
    // even though the gender that actually got persisted stayed "vrouw".
    dbMocks.getUserFunctions.mockResolvedValue([]);
    const ctx = {
      req: {} as any,
      res: {} as any,
      user: { id: 1, name: "User", language: "nl", gender: "vrouw", profileData: {} } as any,
    };
    const result = await linksRouter.createCaller(ctx).setMyGender({ gender: "man" });
    expect(result).toEqual({ function: "moeder" });
    expect(dbMocks.addUserFunction).toHaveBeenCalledWith(1, "moeder");
    expect(dbMocks.addUserFunction).not.toHaveBeenCalledWith(1, "vader");
  });

  it("legacy row (JSON set, column never backfilled): backfills the column without letting the tapped value overwrite the real gender", async () => {
    // The gender column was added later (migration 0012); any user who set
    // their gender before that shipped has a truthy JSON copy but a null
    // column. The old guard read ONLY the column, so this state slipped
    // through as if it were a first-time set — a live immutability bypass
    // for exactly the population the column-anchor was meant to protect.
    dbMocks.getUserFunctions.mockResolvedValue([]);
    const ctx = {
      req: {} as any,
      res: {} as any,
      user: {
        id: 1,
        name: "User",
        language: "nl",
        gender: undefined,
        profileData: { parentProfile: { gender: "vrouw" } },
      } as any,
    };
    await linksRouter.createCaller(ctx).setMyGender({ gender: "man" });
    expect(dbMocks.updateUserProfile).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        parentProfile: expect.objectContaining({ gender: "vrouw" }),
      }),
      { markOnboardingComplete: false },
    );
  });
});

describe("db.updateUserProfile: markOnboardingComplete opt-out (setMyGender's remediation path, round-5 fix)", () => {
  beforeEach(() => {
    partnershipDb.update.mockClear();
    partnershipDb.lastSetFields = undefined;
    process.env.DATABASE_URL = "mysql://round3-test-only/db";
  });

  it("still marks onboarding complete by default — profile.save and syncWithPartner rely on this and must stay unaffected", async () => {
    const real = await vi.importActual<typeof import("../server/db")>("../server/db");
    await real.updateUserProfile(1, { parentProfile: { gender: "man" } });
    expect(partnershipDb.lastSetFields.onboardingCompleted).toBe(true);
  });

  it("does not touch onboardingCompleted when markOnboardingComplete is false", async () => {
    const real = await vi.importActual<typeof import("../server/db")>("../server/db");
    await real.updateUserProfile(1, { parentProfile: { gender: "man" } }, { markOnboardingComplete: false });
    expect(partnershipDb.lastSetFields).not.toHaveProperty("onboardingCompleted");
  });
});

describe("db.createPartnership never auto-confirms a pending invite via the shared-children fallback (round-3 fix)", () => {
  beforeEach(() => {
    partnershipDb.rows = [];
    partnershipDb.insert.mockClear();
    partnershipDb.update.mockClear();
    process.env.DATABASE_URL = "mysql://round3-test-only/db";
  });

  it("returns an existing pending invite unchanged instead of promoting it to active/confirmed", async () => {
    // Mirrors linkPartnerByPublicId having created a real, live invite
    // (confirmed=false, status=pending) from user 1 to user 2. User 1 (the
    // inviter) later triggers getPartnerOfUser's shared-children legacy
    // fallback, which calls createPartnership(1, 2, 1, true) — this must
    // not silently accept the invite on user 2's behalf.
    partnershipDb.rows = [
      { id: 55, userId1: 1, userId2: 2, status: "pending", confirmed: false, initiatedBy: 1 },
    ];
    const real = await vi.importActual<typeof import("../server/db")>("../server/db");

    const result = await real.createPartnership(1, 2, 1, true);

    expect(result).toEqual(partnershipDb.rows[0]);
    expect(partnershipDb.update).not.toHaveBeenCalled();
  });

  it("still creates a fresh active+confirmed row when no partnership exists yet (legacy shared-children fallback, unaffected)", async () => {
    partnershipDb.rows = [];
    const real = await vi.importActual<typeof import("../server/db")>("../server/db");

    const result: any = await real.createPartnership(3, 4, 3, true);

    expect(result.status).toBe("active");
    expect(result.confirmed).toBe(true);
    expect(result.id).toBe(999); // matches partnershipDb.insert's mock: [{ insertId: 999 }]
    expect(partnershipDb.insert).toHaveBeenCalled();
  });
});

describe("insertId (mirrors affectedRows' dual-shape reading, round-7 P2 fix)", () => {
  it("reads mysql2's array-wrapped ResultSetHeader shape", async () => {
    const real = await vi.importActual<typeof import("../server/db")>("../server/db");
    expect(real.insertId([{ insertId: 42 }])).toBe(42);
  });

  it("reads mysql2's shape when the caller already destructured [result] at the await", async () => {
    const real = await vi.importActual<typeof import("../server/db")>("../server/db");
    expect(real.insertId({ insertId: 42 })).toBe(42);
  });

  it("returns undefined, not 0, when neither mysql2 shape has an id (e.g. a Postgres result with no .returning())", async () => {
    const real = await vi.importActual<typeof import("../server/db")>("../server/db");
    expect(real.insertId({ rowCount: 1, rows: [] })).toBeUndefined();
    expect(real.insertId(undefined)).toBeUndefined();
  });
});

describe("db.getPartnerOfUser: shared-children fallback fails closed when insertId() finds no id (round-8 P3 fix)", () => {
  beforeEach(() => {
    process.env.DATABASE_URL = "mysql://round8-test-only/db";
    partnershipDb.insert.mockClear();
    partnershipDb.queue = undefined;
  });

  it("returns null instead of a partner object with partnershipId: undefined (e.g. a Postgres insert with no .returning())", async () => {
    // Walks getPartnerOfUser's actual select sequence: (1) the
    // partnerships path-1 check [empty, forcing the fallback], (2)
    // myLinks, (3) otherLinks, (4) the partner user row, (5)
    // createPartnership's own existing-row check [empty, forcing its
    // insert branch] — then an INSERT whose result carries no insertId,
    // mirroring a Postgres INSERT with no .returning() (see insertId()'s
    // own doc comment).
    partnershipDb.queue = [
      [],
      [{ childId: 10, parentId: 1, confirmed: true }],
      [{ childId: 10, parentId: 2, confirmed: true }],
      [{ id: 2, name: "Partner", gender: "vrouw", profileData: {}, deletedAt: null }],
      [],
    ];
    partnershipDb.insert.mockResolvedValueOnce([{}]); // no insertId field

    const real = await vi.importActual<typeof import("../server/db")>("../server/db");
    const result = await real.getPartnerOfUser(1);

    expect(result).toBeNull();
  });
});

describe("db.revokePartnerProfileAccess: an idempotent no-op still succeeds (round-8 P3 fix)", () => {
  beforeEach(() => {
    process.env.DATABASE_URL = "mysql://round8-test-only/db";
    partnershipDb.update.mockClear();
    partnershipDb.queue = undefined;
  });

  it("returns true when there is nothing to revoke (already-null columns), instead of reporting FORBIDDEN", async () => {
    // A row that exists, belongs to granterId, and is active+confirmed —
    // but the UPDATE's own affectedRows can't be trusted to reveal that:
    // this file's driver import is mysql2, whose default affected-rows
    // semantics count only rows actually CHANGED (see affectedRows()'s own
    // porting-hazard comment), so re-setting already-null columns to null
    // reads as affectedRows=0 — indistinguishable, at that point, from "no
    // such authorized row". Declining a request that was never granted, or
    // re-revoking an already-revoked grant, is a legitimate idempotent
    // no-op this mutation is meant to handle (see its own doc comment
    // above), not a race to reject.
    partnershipDb.rows = [{ id: 55, userId1: 1, userId2: 2, status: "active", confirmed: true }];
    partnershipDb.update.mockResolvedValueOnce([{ affectedRows: 0 }]); // nothing actually changed

    const real = await vi.importActual<typeof import("../server/db")>("../server/db");
    const result = await real.revokePartnerProfileAccess(55, 1);

    expect(result).toBe(true);
  });

  it("still reports failure for a genuinely unauthorized partnershipId", async () => {
    partnershipDb.rows = []; // no row matches this id+granterId+active+confirmed
    const real = await vi.importActual<typeof import("../server/db")>("../server/db");
    const result = await real.revokePartnerProfileAccess(999, 1);
    expect(result).toBe(false);
  });
});
