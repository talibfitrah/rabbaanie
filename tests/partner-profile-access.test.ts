import { beforeEach, describe, expect, it, vi } from "vitest";

// Same hoisted-mock pattern as tests/daily-diagnostic.test.ts.
const dbMocks = vi.hoisted(() => ({
  getPartnerOfUser: vi.fn(),
  getPartnersOfUser: vi.fn(),
  dissolvePartnership: vi.fn(),
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
  // item 4 (profile.save child auto-link) mocks only — see that describe
  // block below for why these five are needed and the others aren't.
  getLinkedChildren: vi.fn(),
  getUserFamilies: vi.fn(),
  addChild: vi.fn(),
  generateChildPublicId: vi.fn(),
  linkParentToChild: vi.fn(),
  // confirmLink's partnership branch — see the "second wife" describe below.
  getPendingLinksFromSender: vi.fn(),
  confirmParentChildLink: vi.fn(),
  getPendingPartnershipFromSender: vi.fn(),
  confirmPartnershipRequest: vi.fn(),
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
  // In server/db.ts the two accessors are ONE query: getPartnerOfUser is
  // literally getPartnersOfUser(id)[0]. Mocking the module wholesale severs
  // that, so a test setting only getPartnerOfUser would leave getPartnersOfUser
  // returning undefined — and any code consulting the list (syncWithPartner's
  // ambiguity refusal) would see something that cannot occur in production.
  // Derive one from the other so "I mocked a single partner" means exactly
  // that on both. Tests that set getPartnersOfUser explicitly override this.
  dbMocks.getPartnersOfUser.mockImplementation(async () => {
    const primary = await dbMocks.getPartnerOfUser();
    return primary ? [primary] : [];
  });
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
    dbMocks.getPartnersOfUser.mockResolvedValue([
      partnerRow({ gender: "vrouw", partnershipId: 77 }),
    ]);
    dbMocks.grantPartnerProfileAccess.mockResolvedValue(false);
    await expect(
      linksRouter.createCaller(ctxFor(1, "man")).grantPartnerProfileAccess(),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Kon geen toegang verlenen / Could not grant access / تعذر منح الوصول",
    });
  });

  it("revokePartnerProfileAccess: FORBIDDEN message includes nl/en/ar", async () => {
    dbMocks.getPartnersOfUser.mockResolvedValue([
      partnerRow({ gender: "vrouw", partnershipId: 12 }),
    ]);
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

// ============================================================
// Multi-wife (polygyny) foundation — client contract endpoints
// ============================================================

describe("links.listPartners (item 1 + client contract)", () => {
  it("maps every active, confirmed partnership to the client contract shape", async () => {
    dbMocks.getPartnersOfUser.mockResolvedValue([
      partnerRow({ id: 2, name: "Wife One", gender: "vrouw", partnershipId: 55 }),
      partnerRow({ id: 3, name: "Wife Two", gender: "vrouw", partnershipId: 56 }),
    ]);
    const result = await linksRouter.createCaller(ctxFor(1, "man")).listPartners();
    expect(result).toEqual([
      { id: 2, name: "Wife One", gender: "vrouw", partnershipId: 55, confirmed: true },
      { id: 3, name: "Wife Two", gender: "vrouw", partnershipId: 56, confirmed: true },
    ]);
  });

  it("returns an empty array, not null, when the caller has no partner", async () => {
    dbMocks.getPartnersOfUser.mockResolvedValue([]);
    const result = await linksRouter.createCaller(ctxFor(1, "vrouw")).listPartners();
    expect(result).toEqual([]);
  });

  it("surfaces a still-pending partnership as confirmed: false rather than hiding it", async () => {
    dbMocks.getPartnersOfUser.mockResolvedValue([
      partnerRow({ id: 9, partnershipConfirmed: false }),
    ]);
    const result: any = await linksRouter.createCaller(ctxFor(1, "man")).listPartners();
    expect(result[0].confirmed).toBe(false);
  });
});

describe("links.getPartnerProfile — optional partnerId (item 1 + client contract)", () => {
  it("omitted partnerId behaves exactly as before: the sole/primary partner via getPartnerOfUser", async () => {
    dbMocks.getPartnerOfUser.mockResolvedValue(partnerRow({ gender: "vrouw" }));
    const result: any = await linksRouter.createCaller(ctxFor(1, "man")).getPartnerProfile();
    expect(result.access).toBe("full");
    expect(dbMocks.getPartnersOfUser).not.toHaveBeenCalled();
  });

  it("an explicit partnerId matching one of the caller's own partners returns THAT partner's payload", async () => {
    dbMocks.getPartnersOfUser.mockResolvedValue([
      partnerRow({ id: 2, name: "Wife One", gender: "vrouw", partnershipId: 55 }),
      partnerRow({ id: 3, name: "Wife Two", gender: "vrouw", partnershipId: 56 }),
    ]);
    const result: any = await linksRouter
      .createCaller(ctxFor(1, "man"))
      .getPartnerProfile({ partnerId: 3 });
    expect(result.id).toBe(3);
    expect(result.name).toBe("Wife Two");
    expect(result.access).toBe("full");
  });

  it("an explicit partnerId that is NOT one of the caller's own partners returns null (fails closed)", async () => {
    dbMocks.getPartnersOfUser.mockResolvedValue([
      partnerRow({ id: 2, gender: "vrouw", partnershipId: 55 }),
    ]);
    const result = await linksRouter
      .createCaller(ctxFor(1, "man"))
      .getPartnerProfile({ partnerId: 999 });
    expect(result).toBeNull();
  });
});

describe("links.dissolvePartner (item 2 — per-partnership dissolve)", () => {
  it("dissolves the given partnership when the caller is a party of it", async () => {
    dbMocks.dissolvePartnership.mockResolvedValue(true);
    const result = await linksRouter
      .createCaller(ctxFor(1, "man"))
      .dissolvePartner({ partnershipId: 55 });
    expect(result).toEqual({ success: true });
    expect(dbMocks.dissolvePartnership).toHaveBeenCalledWith(55, 1);
  });

  it("throws rather than reporting success when the caller is not a party of that partnership", async () => {
    dbMocks.dissolvePartnership.mockResolvedValue(false);
    await expect(
      linksRouter.createCaller(ctxFor(1, "man")).dissolvePartner({ partnershipId: 999 }),
    ).rejects.toThrow();
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
    dbMocks.getPartnersOfUser.mockResolvedValue([
      partnerRow({ gender: "vrouw", partnershipId: 77 }),
    ]);
    dbMocks.grantPartnerProfileAccess.mockResolvedValue(true);
    const result = await linksRouter.createCaller(ctxFor(1, "man")).grantPartnerProfileAccess();
    expect(result).toEqual({ success: true });
    expect(dbMocks.grantPartnerProfileAccess).toHaveBeenCalledWith(77, 1);
  });

  it("granting notifies the wife (parity with requestPartnerProfileAccess's notification)", async () => {
    dbMocks.getPartnersOfUser.mockResolvedValue([
      partnerRow({ gender: "vrouw", id: 8, partnershipId: 77 }),
    ]);
    dbMocks.grantPartnerProfileAccess.mockResolvedValue(true);
    await linksRouter.createCaller(ctxFor(1, "man")).grantPartnerProfileAccess();
    expect(dbMocks.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ recipientId: 8, senderId: 1 }),
    );
    expect(dbMocks.sendLocalizedPush).toHaveBeenCalled();
  });

  it("the husband can revoke", async () => {
    dbMocks.getPartnersOfUser.mockResolvedValue([
      partnerRow({ gender: "vrouw", partnershipId: 12 }),
    ]);
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

// ============================================================
// P0 (round-9): grantPartnerProfileAccess/revokePartnerProfileAccess used to
// resolve the target via the single-partner db.getPartnerOfUser, which
// returns whichever partnership its own unordered query happens to return
// first (see getPartnerOfUser's doc comment in server/db.ts). With
// polygyny, a husband granting/revoking his SECOND wife's access actually
// acted on his FIRST wife's row instead — access handed to (or pulled from)
// the wrong person. Fixed by resolving an explicit partnerId ONLY from the
// caller's own db.getPartnersOfUser list (never a raw id), reusing
// getPartnerProfile's existing resolution pattern.
// ============================================================
describe("links.grantPartnerProfileAccess / revokePartnerProfileAccess — target the SELECTED partnership, not always the primary (round-9 P0 fix)", () => {
  function twoWives() {
    return [
      partnerRow({ id: 2, name: "Wife One", gender: "vrouw", partnershipId: 55 }),
      partnerRow({ id: 3, name: "Wife Two", gender: "vrouw", partnershipId: 56 }),
    ];
  }

  it("grant with an explicit partnerId targets ONLY that wife's partnership", async () => {
    dbMocks.getPartnersOfUser.mockResolvedValue(twoWives());
    dbMocks.grantPartnerProfileAccess.mockResolvedValue(true);
    const result = await linksRouter
      .createCaller(ctxFor(1, "man"))
      .grantPartnerProfileAccess({ partnerId: 3 });
    expect(result).toEqual({ success: true });
    expect(dbMocks.grantPartnerProfileAccess).toHaveBeenCalledWith(56, 1);
    expect(dbMocks.grantPartnerProfileAccess).not.toHaveBeenCalledWith(55, 1);
  });

  it("revoke with an explicit partnerId targets ONLY that wife's partnership", async () => {
    dbMocks.getPartnersOfUser.mockResolvedValue(twoWives());
    dbMocks.revokePartnerProfileAccess.mockResolvedValue(true);
    const result = await linksRouter
      .createCaller(ctxFor(1, "man"))
      .revokePartnerProfileAccess({ partnerId: 3 });
    expect(result).toEqual({ success: true });
    expect(dbMocks.revokePartnerProfileAccess).toHaveBeenCalledWith(56, 1);
    expect(dbMocks.revokePartnerProfileAccess).not.toHaveBeenCalledWith(55, 1);
  });

  it("grant with NO partnerId and 2+ partners throws instead of silently picking one", async () => {
    dbMocks.getPartnersOfUser.mockResolvedValue(twoWives());
    await expect(
      linksRouter.createCaller(ctxFor(1, "man")).grantPartnerProfileAccess(),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(dbMocks.grantPartnerProfileAccess).not.toHaveBeenCalled();
  });

  it("revoke with NO partnerId and 2+ partners throws instead of silently picking one", async () => {
    dbMocks.getPartnersOfUser.mockResolvedValue(twoWives());
    await expect(
      linksRouter.createCaller(ctxFor(1, "man")).revokePartnerProfileAccess(),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(dbMocks.revokePartnerProfileAccess).not.toHaveBeenCalled();
  });

  it("grant with a partnerId that is NOT one of the caller's own partners fails closed (never trust a raw id)", async () => {
    dbMocks.getPartnersOfUser.mockResolvedValue([
      partnerRow({ id: 2, gender: "vrouw", partnershipId: 55 }),
    ]);
    await expect(
      linksRouter.createCaller(ctxFor(1, "man")).grantPartnerProfileAccess({ partnerId: 999 }),
    ).rejects.toThrow();
    expect(dbMocks.grantPartnerProfileAccess).not.toHaveBeenCalled();
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
    dbMocks.getPartnersOfUser.mockResolvedValue([
      partnerRow({ gender: "vrouw", partnershipId: 77 }),
    ]);
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
    dbMocks.getPartnersOfUser.mockResolvedValue([
      partnerRow({ gender: "vrouw", partnershipId: 12 }),
    ]);
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

    const husbandAsPartnerRecord = () => ({
      id: husband.id,
      name: husband.name,
      profileData: husband.profileData,
      partnershipId: partnership.id,
      profileAccessRequestedAt: partnership.requestedAt,
      profileAccessGrantedAt: partnership.grantedAt,
    });
    dbMocks.getPartnerOfUser.mockImplementation(async (id: number) =>
      id === wife.id ? husbandAsPartnerRecord() : null,
    );
    // profile.save's notify block reads db.getPartnersOfUser, not
    // db.getPartnerOfUser (round-9 P2 fix) — mocked explicitly so this
    // test doesn't depend on another test's leftover mock value.
    dbMocks.getPartnersOfUser.mockImplementation(async (id: number) =>
      id === wife.id ? [husbandAsPartnerRecord()] : [],
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
    const wifePartner = () => ({
      id: 2,
      name: "Wife",
      profileData: {},
      partnershipId: 55,
      profileAccessRequestedAt: partnership.requestedAt,
      profileAccessGrantedAt: partnership.grantedAt,
    });
    dbMocks.getPartnerOfUser.mockImplementation(async () => wifePartner());
    // profile.save's notify block reads db.getPartnersOfUser (round-9 P2
    // fix: it must notify every affected partner, not just the primary) —
    // mocked explicitly rather than relying on another test's leftover
    // mock value (vi.clearAllMocks() clears call history, not
    // implementations, so an unmocked call here would silently pick up
    // whatever an earlier test left behind).
    dbMocks.getPartnersOfUser.mockImplementation(async () => [wifePartner()]);
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

  it("a husband with TWO wives: a gender change revokes and notifies BOTH, not just the primary (round-9 P2 fix)", async () => {
    // db.revokeProfileAccessGrantsForUser is global — it clears EVERY
    // partnership the caller is a party to, not just one — so with
    // polygyny a husband's gender change silently revoked both wives'
    // access while only ever notifying the primary one.
    const husband = wireStatefulUserRow({
      id: 1,
      gender: "man",
      profileData: { parentProfile: { gender: "man" } },
    });
    dbMocks.getPartnersOfUser.mockResolvedValue([
      partnerRow({ id: 2, name: "Wife One", gender: "vrouw", partnershipId: 55, grantedAt: new Date("2026-01-01") }),
      partnerRow({ id: 3, name: "Wife Two", gender: "vrouw", partnershipId: 56, grantedAt: new Date("2026-01-02") }),
    ]);
    dbMocks.revokeProfileAccessGrantsForUser.mockResolvedValue(undefined);

    const ctx = {
      req: {} as any,
      res: {} as any,
      user: { id: husband.id, name: "Husband", language: "nl", gender: husband.gender, profileData: husband.profileData } as any,
    };
    await profileRouter.createCaller(ctx).save({ profileData: { parentProfile: { gender: "vrouw" } } });

    expect(dbMocks.revokeProfileAccessGrantsForUser).toHaveBeenCalledWith(1);
    expect(dbMocks.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientId: 2,
        content: expect.stringContaining("toegang tot het profiel is ingetrokken"),
      }),
    );
    expect(dbMocks.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientId: 3,
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

  it("a legacy row re-saving the SAME gender is not a change — no revoke, and the JSON anchor survives", async () => {
    // The merge case: the revocation compares against resolveGender's result,
    // not the raw column. On a legacy NULL-column row the two only diverge
    // here — a no-op re-save of "man" reads as "man" !== null against the
    // column and would revoke a grant the couple set up deliberately. The
    // same divergence decides the re-stamp: falling back to the column would
    // write null and drop the anchor the block exists to protect.
    const husband = wireStatefulUserRow({
      id: 1,
      gender: null,
      profileData: { parentProfile: { gender: "man" } },
    });
    dbMocks.getPartnerOfUser.mockImplementation(async () => ({
      id: 2,
      name: "Wife",
      profileData: {},
      partnershipId: 55,
      profileAccessRequestedAt: null,
      profileAccessGrantedAt: new Date("2026-01-01"),
    }));

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
      .save({ profileData: { parentProfile: { gender: "man" } } });

    expect(dbMocks.revokeProfileAccessGrantsForUser).not.toHaveBeenCalled();
    expect(husband.profileData.parentProfile.gender).toBe("man");
  });

  it("a non-object profileData save cannot erase a legacy JSON-only gender anchor", async () => {
    // profileData is z.any(), so null reaches updateUserProfile, which
    // REPLACES the column wholesale. On a legacy row (users.gender NULL,
    // gender only in the JSON) that erased the anchor from both places at
    // once; the NEXT save then read as a first-ever gender, so no revocation
    // fired and the grant issued while she was "man" survived the flip back.
    const husband = wireStatefulUserRow({
      id: 1,
      gender: null,
      profileData: { parentProfile: { gender: "man" } },
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
    await profileRouter.createCaller(ctx).save({ profileData: null });

    // The anchor survived the wipe...
    expect(husband.profileData?.parentProfile?.gender).toBe("man");
    // ...so the flip that follows is still seen as a change and revokes.
    await profileRouter
      .createCaller(ctx)
      .save({ profileData: { parentProfile: { gender: "vrouw" } } });
    expect(dbMocks.revokeProfileAccessGrantsForUser).toHaveBeenCalledWith(1);
  });

  it("a FIRST-EVER gender save is validated too — garbage never reaches the authoritative column", async () => {
    // The known-gender check used to sit inside `if (oldGender && ...)`, so a
    // user with no gender anywhere skipped it entirely and updateUserProfile
    // stamped whatever arrived into users.gender. A cached "male" then locks
    // the account out for good: hasFullPartnerAccess branches only on
    // man/vrouw, setMyGender refuses because a gender is now on record, and
    // the gender buttons never render because needsMyGender is !myGender.
    const fresh = wireStatefulUserRow({ id: 1, gender: null, profileData: {} });
    const ctx = {
      req: {} as any,
      res: {} as any,
      user: { id: fresh.id, name: "New", language: "nl", gender: null, profileData: {} } as any,
    };
    await profileRouter
      .createCaller(ctx)
      .save({ profileData: { parentProfile: { gender: "male" } } });

    // The invariant is that nothing unknown is retained anywhere, not which
    // particular empty value represents "no gender" (resolveGender yields "").
    expect(fresh.gender).toBeNull();
    expect(fresh.profileData.parentProfile?.gender).toBeFalsy();

    // A valid first-ever gender still lands normally.
    await profileRouter
      .createCaller(ctx)
      .save({ profileData: { parentProfile: { gender: "man" } } });
    expect(fresh.gender).toBe("man");
  });

  it("garbage arriving on a legacy NULL-column row re-stamps the resolved gender, so revocation stays alive afterwards", async () => {
    // Where the two guards meet. Falling back to the raw column here writes
    // null into the blob, and the anchor is then gone from BOTH places: the
    // next save's `if (oldGender && ...)` sees nothing, and this user's
    // revocation is dead permanently — silently, on a save they never made
    // deliberately.
    const husband = wireStatefulUserRow({
      id: 1,
      gender: null,
      profileData: { parentProfile: { gender: "man" } },
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
      .save({ profileData: { parentProfile: { gender: "unknown" } } });

    expect(dbMocks.revokeProfileAccessGrantsForUser).not.toHaveBeenCalled();
    expect(husband.profileData.parentProfile.gender).toBe("man");

    // The anchor survived, so a genuine flip afterwards still revokes.
    await profileRouter
      .createCaller(ctx)
      .save({ profileData: { parentProfile: { gender: "vrouw" } } });
    expect(dbMocks.revokeProfileAccessGrantsForUser).toHaveBeenCalledWith(1);
  });

  it("a stale/garbage gender value (not 'man' or 'vrouw') is not a known value — no revoke, no column corruption (round-9 P2 fix)", async () => {
    // profileData is z.any(): a debounced full-blob resync from AsyncStorage
    // carries whatever the client's local cache happens to hold, not
    // necessarily a deliberate choice. Only the same two values setMyGender's
    // own zod enum accepts count as a genuine change.
    const husband = wireStatefulUserRow({
      id: 1,
      gender: "man",
      profileData: { parentProfile: { gender: "man" } },
    });
    const ctx = {
      req: {} as any,
      res: {} as any,
      user: { id: husband.id, name: "Husband", language: "nl", gender: husband.gender, profileData: husband.profileData } as any,
    };
    const result: any = await profileRouter
      .createCaller(ctx)
      .save({ profileData: { parentProfile: { gender: "unknown" } } });

    expect(dbMocks.revokeProfileAccessGrantsForUser).not.toHaveBeenCalled();
    expect(husband.gender).toBe("man");
    expect(husband.profileData.parentProfile.gender).toBe("man");
    expect(result.gender).toBe("man");
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

// ============================================================
// VULNERABILITY (item 4): profile.save auto-linked a NEW child to
// db.getPartnerOfUser's result with canEdit:true and NO partnershipConfirmed
// check — a mistyped/never-accepted public ID handed a stranger write access
// to a real child. Fixed by requiring partner.partnershipConfirmed before
// the auto-link. server/routers.ts's own self-link (parentId: ctx.user.id)
// a few lines above is unaffected — a user always controls a child they
// just created themselves — so these tests only cover the partner branch.
//
// round-10 P1 fix: db.getPartnerOfUser returns "whichever partnership the
// unordered query happens to return first" (its own doc comment) — with
// polygyny, a man can have 2+ confirmed wives, and `child` carries no field
// saying which one is this child's mother. Auto-linking is a WRITE grant
// (canEdit: true), so guessing is not an option. profile.save now reads
// db.getPartnersOfUser and only auto-links when exactly one CONFIRMED
// partner exists — bit-for-bit the old behavior for 0 or 1 confirmed
// partners, fails closed (no auto-link, no silent grant) for 2+.
// ============================================================
describe("profile.save: auto-linking a NEW child to the caller's partner requires a CONFIRMED partnership (item 4 — write privilege escalation fix)", () => {
  const ctx = {
    req: {} as any,
    res: {} as any,
    user: { id: 1, name: "Me", language: "nl", profileData: {} } as any,
  };
  const inputWithNewChild = {
    profileData: {
      children: [{ id: "local-1", name: "Kid", birthDate: "2020-01-01" }],
    },
  } as any;

  beforeEach(() => {
    dbMocks.getLinkedChildren.mockResolvedValue([]);
    dbMocks.getUserFamilies.mockResolvedValue([{ id: 1 }]);
    dbMocks.addChild.mockResolvedValue(42);
    dbMocks.generateChildPublicId.mockResolvedValue("C_42");
    dbMocks.linkParentToChild.mockResolvedValue(undefined);
    // vi.clearAllMocks() (global beforeEach) clears call history, not
    // implementations — reset explicitly so no test in this block can
    // silently inherit another test's getPartnerOfUser value depending on
    // run order (the round-10 P1 test below false-passed against unfixed
    // code without this — it inherited a leftover mock value instead of
    // exercising its own logic).
    dbMocks.getPartnerOfUser.mockResolvedValue(null);
  });

  it("does NOT grant an unconfirmed 'partner' edit rights on the new child", async () => {
    dbMocks.getPartnersOfUser.mockResolvedValue([
      partnerRow({ id: 99, partnershipConfirmed: false }),
    ]);
    await profileRouter.createCaller(ctx).save(inputWithNewChild);
    expect(dbMocks.linkParentToChild).not.toHaveBeenCalledWith(
      expect.objectContaining({ parentId: 99 }),
    );
    // The caller's own self-link must still go through.
    expect(dbMocks.linkParentToChild).toHaveBeenCalledWith(
      expect.objectContaining({ parentId: 1, childId: 42 }),
    );
  });

  it("still grants a genuinely CONFIRMED partner edit rights on the new child", async () => {
    dbMocks.getPartnersOfUser.mockResolvedValue([
      partnerRow({ id: 99, partnershipConfirmed: true }),
    ]);
    await profileRouter.createCaller(ctx).save(inputWithNewChild);
    expect(dbMocks.linkParentToChild).toHaveBeenCalledWith(
      expect.objectContaining({ parentId: 99, childId: 42, canEdit: true }),
    );
  });

  it("round-10 P1: does NOT auto-link ANY wife when the caller has 2+ CONFIRMED partners — which one is this child's mother can't be derived, so picking one (even the 'first') is a write-privilege escalation", async () => {
    dbMocks.getPartnersOfUser.mockResolvedValue([
      partnerRow({ id: 99, name: "Wife A", partnershipConfirmed: true }),
      partnerRow({ id: 98, name: "Wife B", partnershipConfirmed: true }),
    ]);
    // Mirrors what db.getPartnerOfUser's own doc comment says it does —
    // "whichever partnership the unordered query happens to return first"
    // (Wife A here). The fix must ignore this primary accessor entirely for
    // this write grant, not merely get lucky on which wife it names.
    dbMocks.getPartnerOfUser.mockResolvedValue(
      partnerRow({ id: 99, name: "Wife A", partnershipConfirmed: true }),
    );
    await profileRouter.createCaller(ctx).save(inputWithNewChild);
    expect(dbMocks.linkParentToChild).not.toHaveBeenCalledWith(
      expect.objectContaining({ parentId: 99 }),
    );
    expect(dbMocks.linkParentToChild).not.toHaveBeenCalledWith(
      expect.objectContaining({ parentId: 98 }),
    );
    // The caller's own self-link must still go through — only the
    // ambiguous PARTNER auto-link is skipped.
    expect(dbMocks.linkParentToChild).toHaveBeenCalledWith(
      expect.objectContaining({ parentId: 1, childId: 42 }),
    );
  });

  it("round-10 P1: a 2nd, still-PENDING partnership does not block auto-linking the one partner who IS confirmed — only 2+ CONFIRMED partners is ambiguous", async () => {
    dbMocks.getPartnersOfUser.mockResolvedValue([
      partnerRow({ id: 99, partnershipConfirmed: true }),
      partnerRow({ id: 97, partnershipConfirmed: false }),
    ]);
    await profileRouter.createCaller(ctx).save(inputWithNewChild);
    expect(dbMocks.linkParentToChild).toHaveBeenCalledWith(
      expect.objectContaining({ parentId: 99, childId: 42, canEdit: true }),
    );
    expect(dbMocks.linkParentToChild).not.toHaveBeenCalledWith(
      expect.objectContaining({ parentId: 97 }),
    );
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

describe("db.getPartnerOfUser: shared-children fallback and insertId() finding no id (round-8 P3; recovery added round-10 P2)", () => {
  beforeEach(() => {
    process.env.DATABASE_URL = "mysql://round8-test-only/db";
    partnershipDb.insert.mockClear();
    partnershipDb.queue = undefined;
    // Item 3's new one-husband-constraint checks inside createPartnership
    // run AFTER this test's 5-entry queue is exhausted, so they fall back to
    // the shared `.rows` snapshot — reset it explicitly rather than relying
    // on whatever the previous describe block's last test happened to leave
    // it as (both of those checks read as "not vrouw" against an empty
    // array either way, so this is a hermeticity fix, not a behavior one).
    partnershipDb.rows = [];
  });

  it("round-10 P2: recovers the partnership id via a natural-key re-select when insertId() finds none — production Postgres must not silently drop the co-parent link", async () => {
    // Same 5-select walk as the sibling test below, but `.rows` (what every
    // post-queue select falls back to: both womanAlreadyHasConfirmedHusband
    // gender checks AND createPartnership's new re-select) now holds the row
    // a real re-select would find on Postgres — proving the fallback
    // recovers a usable id instead of just failing closed.
    partnershipDb.queue = [
      [],
      [{ childId: 10, parentId: 1, confirmed: true }],
      [{ childId: 10, parentId: 2, confirmed: true }],
      [{ id: 2, name: "Partner", gender: "vrouw", profileData: {}, deletedAt: null }],
      // The prior-dissolution check this fallback now makes before
      // auto-creating: empty = never separated, so it proceeds as before.
      [],
      // createPartnership's own existing-row check. Explicit rather than
      // falling through to `.rows`, which this test loads with the row the
      // natural-key RE-SELECT must find — letting the existing-row check see
      // it instead would return early and never reach the insert at all.
      [],
    ];
    partnershipDb.rows = [{ id: 777 }];
    partnershipDb.insert.mockResolvedValueOnce([{}]); // no insertId field (Postgres shape)

    const real = await vi.importActual<typeof import("../server/db")>("../server/db");
    const result = await real.getPartnerOfUser(1);

    expect(result).not.toBeNull();
    expect(result?.id).toBe(2);
    expect(result?.partnershipId).toBe(777);
    // FALSE since this fallback stopped auto-confirming: sharing a child is
    // consent to co-parent, not consent to hand over a profile. This test's
    // subject is the id recovery above — the flag is derived from the row the
    // re-select returned, which carries no active/confirmed status here.
    expect(result?.partnershipConfirmed).toBe(false);
  });

  it("a DISSOLVED partnership is not resurrected by the shared-children fallback — separation survives a read", async () => {
    // dissolvePartner sets status='dissolved', but createPartnership's own
    // existing-row check only looks for pending/active, so the dissolved row
    // was invisible to it and this fallback inserted a fresh active+confirmed
    // one. listPartners refetches on mount, so ending a partnership that had
    // shared children was undone the moment either screen reloaded — the
    // separation could not be made to stick at all.
    partnershipDb.queue = [
      [], // path-1: no active+confirmed partnership (it was dissolved)
      [{ childId: 10, parentId: 1, confirmed: true }], // myLinks
      [{ childId: 10, parentId: 2, confirmed: true }], // otherLinks
      [{ id: 2, name: "Partner", gender: "vrouw", profileData: {}, deletedAt: null }],
      [{ id: 55 }], // the prior-dissolution check FINDS one
    ];

    const real = await vi.importActual<typeof import("../server/db")>("../server/db");
    const result = await real.getPartnerOfUser(1);

    expect(result).toBeNull();
    expect(partnershipDb.insert).not.toHaveBeenCalled();
  });

  it("still returns null (not a partnershipId: undefined object) in the genuinely exceptional case where the re-select ALSO finds no row", async () => {
    // Walks getPartnerOfUser's actual select sequence: (1) the
    // partnerships path-1 check [empty, forcing the fallback], (2)
    // myLinks, (3) otherLinks, (4) the partner user row, (5)
    // createPartnership's own existing-row check [empty, forcing its
    // insert branch] — then an INSERT whose result carries no insertId,
    // mirroring a Postgres INSERT with no .returning() (see insertId()'s
    // own doc comment). `.rows` stays empty (this block's beforeEach), so
    // the re-select this fallback now attempts finds nothing either — this
    // is the backstop for a true anomaly, not the routine Postgres case
    // (see the sibling test above for that).
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

// ============================================================
// Multi-wife (polygyny) foundation — db layer (item 1)
// ============================================================
describe("db.getPartnersOfUser / db.getPartnerOfUser (item 1 — multi-partner reads)", () => {
  beforeEach(() => {
    process.env.DATABASE_URL = "mysql://item1-test-only/db";
    partnershipDb.insert.mockClear();
    partnershipDb.queue = undefined;
    partnershipDb.rows = [];
  });

  it("getPartnersOfUser returns EVERY active, confirmed partnership — a man with two wives sees both", async () => {
    // Two partnership rows for user 1 (both wives); the per-row `users`
    // lookup is queued separately since the fake driver can't otherwise
    // tell two `.limit(1)` calls apart.
    partnershipDb.queue = [
      [
        { id: 55, userId1: 1, userId2: 2, status: "active", confirmed: true },
        { id: 56, userId1: 1, userId2: 3, status: "active", confirmed: true },
      ],
      [{ id: 2, name: "Wife One", gender: "vrouw", profileData: {}, deletedAt: null }],
      [{ id: 3, name: "Wife Two", gender: "vrouw", profileData: {}, deletedAt: null }],
    ];
    const real = await vi.importActual<typeof import("../server/db")>("../server/db");

    const result = await real.getPartnersOfUser(1);

    expect(result).toHaveLength(2);
    expect(result.map((p) => p.id)).toEqual([2, 3]);
    expect(result.map((p) => p.partnershipId)).toEqual([55, 56]);
    expect(result.every((p) => p.partnershipConfirmed)).toBe(true);
  });

  it("getPartnersOfUser returns [] (not null) when the user has no partnerships and no shared children", async () => {
    partnershipDb.queue = [[], []]; // partnerships branch-1, then myLinks
    const real = await vi.importActual<typeof import("../server/db")>("../server/db");

    const result = await real.getPartnersOfUser(1);

    expect(result).toEqual([]);
  });

  it("getPartnerOfUser (refactored to delegate to getPartnersOfUser) still returns a single object, not an array", async () => {
    partnershipDb.queue = [
      [{ id: 55, userId1: 1, userId2: 2, status: "active", confirmed: true }],
      [{ id: 2, name: "Wife One", gender: "vrouw", profileData: {}, deletedAt: null }],
    ];
    const real = await vi.importActual<typeof import("../server/db")>("../server/db");

    const result = await real.getPartnerOfUser(1);

    expect(result?.id).toBe(2);
    expect(Array.isArray(result)).toBe(false);
  });

  it("getPartnerOfUser returns null when getPartnersOfUser finds nothing (no regression from the array refactor)", async () => {
    partnershipDb.queue = [[], []];
    const real = await vi.importActual<typeof import("../server/db")>("../server/db");

    const result = await real.getPartnerOfUser(1);

    expect(result).toBeNull();
  });
});

// ============================================================
// Multi-wife (polygyny) foundation — one-husband-at-a-time constraint
// (item 3), enforced where partnerships are created/confirmed.
// ============================================================
describe("one woman, at most one active confirmed husband — enforced in db.ts, not the UI (item 3)", () => {
  beforeEach(() => {
    process.env.DATABASE_URL = "mysql://item3-test-only/db";
    partnershipDb.insert.mockClear();
    partnershipDb.update.mockClear();
    partnershipDb.queue = undefined;
    partnershipDb.rows = [];
  });

  it("confirmPartnershipRequest: refuses to confirm a second husband for a woman who already has one", async () => {
    // Partnership 77 (pending) is between user 1 (man) and user 2 (vrouw).
    // User 2 already has a DIFFERENT active+confirmed partnership on record.
    partnershipDb.queue = [
      [{ id: 77, userId1: 1, userId2: 2, status: "pending", confirmed: false, initiatedBy: 1 }], // getPartnershipById
      [{ gender: "vrouw" }], // recipient (user 2) gender
      [{ id: 50 }], // recipient already has a confirmed partnership elsewhere
    ];
    const real = await vi.importActual<typeof import("../server/db")>("../server/db");

    const result = await real.confirmPartnershipRequest(77, 2);

    expect(result).toBe(false);
    expect(partnershipDb.update).not.toHaveBeenCalled();
  });

  it("confirmPartnershipRequest: still allows a man to confirm a SECOND wife (polygyny)", async () => {
    // Partnership 88 (pending) is between user 1 (man, already has wife 1
    // confirmed elsewhere) and user 3 (vrouw, marrying for the first time).
    partnershipDb.queue = [
      [{ id: 88, userId1: 1, userId2: 3, status: "pending", confirmed: false, initiatedBy: 1 }], // getPartnershipById
      [{ gender: "vrouw" }], // recipient (user 3) gender
      [], // recipient has no other confirmed partnership
      [{ gender: "man" }], // other party (user 1) gender — not vrouw, no further check needed
    ];
    const real = await vi.importActual<typeof import("../server/db")>("../server/db");

    const result = await real.confirmPartnershipRequest(88, 3);

    expect(result).toBe(true);
    expect(partnershipDb.update).toHaveBeenCalled();
  });

  it("createPartnership(confirmed: true): the legacy shared-children fallback also refuses a second confirmed husband", async () => {
    partnershipDb.queue = [
      [], // createPartnership's own existing-row-for-this-pair check
      [{ gender: "vrouw" }], // userId1 (the woman) gender
      [{ id: 40 }], // she already has a confirmed partnership elsewhere
    ];
    const real = await vi.importActual<typeof import("../server/db")>("../server/db");

    const result = await real.createPartnership(5, 6, 5, true);

    expect(result).toBeNull();
    expect(partnershipDb.insert).not.toHaveBeenCalled();
  });

  it("createPartnership(confirmed: false) — an ordinary pending invite — is never blocked by this constraint", async () => {
    partnershipDb.queue = [[]]; // existing-row-for-this-pair check only; confirmed=false skips the new guard entirely
    const real = await vi.importActual<typeof import("../server/db")>("../server/db");

    const result: any = await real.createPartnership(5, 6, 5, false);

    expect(result.status).toBe("pending");
    expect(partnershipDb.insert).toHaveBeenCalled();
  });
});

// ============================================================
// Multi-wife (polygyny) foundation — per-partnership dissolve (item 2)
// ============================================================
describe("db.dissolvePartnership(partnershipId, userId) — targets ONE partnership, not every partnership of a user (item 2)", () => {
  beforeEach(() => {
    process.env.DATABASE_URL = "mysql://item2-test-only/db";
    partnershipDb.update.mockClear();
    partnershipDb.queue = undefined;
  });

  it("succeeds (affectedRows) when the caller is a party of that active partnership", async () => {
    partnershipDb.update.mockResolvedValueOnce([{ affectedRows: 1 }]);
    const real = await vi.importActual<typeof import("../server/db")>("../server/db");

    const result = await real.dissolvePartnership(55, 1);

    expect(result).toBe(true);
    expect(partnershipDb.update).toHaveBeenCalled();
  });

  it("fails when the caller is not a party of that partnership (WHERE clause finds nothing to update)", async () => {
    partnershipDb.update.mockResolvedValueOnce([{ affectedRows: 0 }]);
    const real = await vi.importActual<typeof import("../server/db")>("../server/db");

    const result = await real.dissolvePartnership(55, 999);

    expect(result).toBe(false);
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

describe("confirmLink: a second wife must not inherit the first wife's children", () => {
  beforeEach(() => {
    dbMocks.getPendingLinksFromSender.mockResolvedValue([]);
    dbMocks.confirmParentChildLink.mockResolvedValue(undefined);
    dbMocks.getPendingPartnershipFromSender.mockResolvedValue({ id: 55 });
    dbMocks.confirmPartnershipRequest.mockResolvedValue(true);
    dbMocks.linkParentToChild.mockClear();
    dbMocks.linkParentToChild.mockResolvedValue(undefined);
  });

  it("shares only the husband's OWN children, not ones he holds via another partner", async () => {
    // H (id 1) is linked to child 100 as a parent in his own right, and to
    // child 200 only through his FIRST wife (relationship "partner" — the
    // link this same block writes). W2 (id 3) now confirms his invitation.
    // Forwarding 200 would give her canEdit over the first wife's child:
    // read, update, delete and observations, per access-control.ts, with the
    // first wife never consenting to or being told of any of it.
    dbMocks.getLinkedChildren.mockImplementation(async (parentId: number) =>
      parentId === 1
        ? [
            { id: 100, link: { relationship: "parent" } },
            { id: 200, link: { relationship: "partner" } },
          ]
        : [],
    );

    await linksRouter
      .createCaller(ctxFor(3, "vrouw", "Second wife"))
      .confirmLink({ senderId: 1 });

    const sharedChildIds = dbMocks.linkParentToChild.mock.calls
      .filter((c: any[]) => c[0].parentId === 3)
      .map((c: any[]) => c[0].childId);
    expect(sharedChildIds).toContain(100);
    expect(sharedChildIds).not.toContain(200);
  });
});

describe("syncWithPartner refuses to guess which wife when there are several", () => {
  it("no partnerId + 2 confirmed partners = refused, nothing merged", async () => {
    // Only family.tsx has a selector to pass an id. The Home tab, the Messages
    // tab and app-context's silent auto-sync have none, and defaulting merged
    // whichever partnership came back first — writing wife #1's household into
    // his own profile, which wife #2 then reads once he grants her access.
    dbMocks.getPartnersOfUser.mockResolvedValue([
      partnerRow({ id: 2, gender: "vrouw", partnershipId: 55 }),
      partnerRow({ id: 3, gender: "vrouw", partnershipId: 56 }),
    ]);
    // Everything else set up so the sync WOULD succeed. Without this the call
    // bails at "No data to sync" and the test passes with the guard removed —
    // it did exactly that once, which is why the message is asserted below
    // rather than just `success === false`.
    dbMocks.getUserById.mockResolvedValue({
      id: 1,
      profileData: { parentProfile: { gender: "man" } },
    });
    const result: any = await linksRouter
      .createCaller(ctxFor(1, "man"))
      .syncWithPartner();

    expect(result.success).toBe(false);
    expect(result.message).toMatch(/multiple partners/i);
    expect(dbMocks.updateUserProfile).not.toHaveBeenCalled();
  });

  it("naming the partner explicitly still syncs, and a single-partner user is unaffected", async () => {
    dbMocks.getPartnersOfUser.mockResolvedValue([
      partnerRow({ id: 2, gender: "vrouw", partnershipId: 55 }),
      partnerRow({ id: 3, gender: "vrouw", partnershipId: 56 }),
    ]);
    dbMocks.getUserById.mockResolvedValue({
      id: 1,
      profileData: { parentProfile: { gender: "man" } },
    });
    const named: any = await linksRouter
      .createCaller(ctxFor(1, "man"))
      .syncWithPartner({ partnerId: 3 });
    expect(named.success).toBe(true);

    vi.clearAllMocks();
    dbMocks.getUserLanguage.mockResolvedValue("nl");
    dbMocks.getPartnersOfUser.mockResolvedValue([
      partnerRow({ id: 2, gender: "vrouw", partnershipId: 55 }),
    ]);
    dbMocks.getUserById.mockResolvedValue({
      id: 1,
      profileData: { parentProfile: { gender: "man" } },
    });
    const solo: any = await linksRouter
      .createCaller(ctxFor(1, "man"))
      .syncWithPartner();
    expect(solo.success).toBe(true);
  });
});

describe("the shared-children fallback must not manufacture consent", () => {
  beforeEach(() => {
    process.env.DATABASE_URL = "mysql://consent-test-only/db";
    partnershipDb.insert.mockClear();
    partnershipDb.queue = undefined;
    partnershipDb.rows = [];
  });

  it("auto-creates the partnership as PENDING, so a shared child alone does not unlock the full profile", async () => {
    // `confirmed` is what hasFullPartnerAccess reads as "both people agreed".
    // Auto-confirming here let a man who merely opened the spouse-profile
    // screen, while sharing one confirmed CHILD link with a woman, receive her
    // entire profile — psychologist notes included — with no partnership
    // either of them ever accepted.
    partnershipDb.queue = [
      [], // no active+confirmed partnership -> fallback
      [{ childId: 10, parentId: 1, confirmed: true }], // myLinks
      [{ childId: 10, parentId: 2, confirmed: true }], // otherLinks
      [{ id: 2, name: "CoParent", gender: "vrouw", profileData: {}, deletedAt: null }],
      [], // prior-dissolution check: none
      [], // createPartnership's existing-row check: none -> insert
    ];
    partnershipDb.rows = [{ id: 777, status: "pending", confirmed: false }];

    const real = await vi.importActual<typeof import("../server/db")>("../server/db");
    const result = await real.getPartnerOfUser(1);

    expect(result).not.toBeNull();
    expect(result?.partnershipConfirmed).toBe(false);
  });
});
