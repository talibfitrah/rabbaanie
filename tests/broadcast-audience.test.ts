import { describe, it, expect } from "vitest";
import {
  matchesAudience,
  selectAudience,
  incompleteChildNames,
  type AudienceUser,
} from "../server/broadcast-audience";
import { isProfileComplete } from "../lib/store";

// Base: passes the personal gate (lib/store.ts's isProfileComplete), has
// finished the full analytical wizard (parentProfileCompleted), and its one
// child's own profile is complete too. Every test below starts here and
// overrides only the field it means to break.
function user(id: number, overrides: {
  name?: string;
  deletedAt?: Date | string | null;
  parentProfile?: Record<string, unknown>;
  children?: Array<{ id: string; name: string; profileCompleted: boolean }>;
  parentProfileCompleted?: boolean;
  profileDataOverride?: unknown; // when set, bypasses the defaults entirely
} = {}): AudienceUser {
  if ("profileDataOverride" in overrides) {
    return { id, name: overrides.name ?? `User ${id}`, deletedAt: overrides.deletedAt ?? null, profileData: overrides.profileDataOverride };
  }
  return {
    id,
    name: overrides.name ?? `User ${id}`,
    deletedAt: overrides.deletedAt ?? null,
    profileData: {
      parentProfile: {
        firstName: "A", lastName: "B", birthDate: "1990-01-01",
        country: "Nederland", city: "Amsterdam", street: "Kerkstraat", houseNumber: "1",
        phoneNumber: "+31612345678", gender: "man", maritalStatus: "getrouwd",
        ...overrides.parentProfile,
      },
      children: overrides.children ?? [{ id: "c1", name: "Yusuf", profileCompleted: true }],
      parentProfileCompleted: overrides.parentProfileCompleted ?? true,
    },
  };
}

describe("matchesAudience — no filter", () => {
  it("matches every active user when the filter is empty", () => {
    expect(matchesAudience(user(1), {})).toBe(true);
    expect(matchesAudience(user(2, { parentProfileCompleted: false }), {})).toBe(true);
  });

  it("excludes soft-deleted users regardless of filter", () => {
    const deleted = user(1, { deletedAt: new Date() });
    expect(matchesAudience(deleted, {})).toBe(false);
    expect(matchesAudience(deleted, { incompletePersonal: true })).toBe(false);
  });
});

describe("country filter", () => {
  const nl = user(1, { parentProfile: { country: "Nederland" } });
  const be = user(2, { parentProfile: { country: "Belgium" } });
  const ma = user(3, { parentProfile: { country: "Morocco" } });

  it("a single country matches only users in that country", () => {
    expect(matchesAudience(nl, { countries: ["Nederland"] })).toBe(true);
    expect(matchesAudience(be, { countries: ["Nederland"] })).toBe(false);
  });

  it("multiple countries match any of them", () => {
    const filter = { countries: ["Nederland", "Morocco"] };
    expect(matchesAudience(nl, filter)).toBe(true);
    expect(matchesAudience(ma, filter)).toBe(true);
    expect(matchesAudience(be, filter)).toBe(false);
  });

  it("an empty/omitted countries list means all countries", () => {
    expect(matchesAudience(nl, { countries: [] })).toBe(true);
    expect(matchesAudience(be, {})).toBe(true);
  });
});

describe("city filter", () => {
  const ams = user(1, { parentProfile: { country: "Nederland", city: "Amsterdam" } });
  const rot = user(2, { parentProfile: { country: "Nederland", city: "Rotterdam" } });

  it("a city matches only users in that city", () => {
    expect(matchesAudience(ams, { cities: ["Amsterdam"] })).toBe(true);
    expect(matchesAudience(rot, { cities: ["Amsterdam"] })).toBe(false);
  });

  it("city is scoped by combining with the country filter (AND, not OR)", () => {
    const filter = { countries: ["Nederland"], cities: ["Amsterdam"] };
    expect(matchesAudience(ams, filter)).toBe(true);
    // Right city, but the country side of the same filter must also hold.
    const amsBelgium = user(3, { parentProfile: { country: "Belgium", city: "Amsterdam" } });
    expect(matchesAudience(amsBelgium, filter)).toBe(false);
  });

  it("an empty/omitted cities list means all cities", () => {
    expect(matchesAudience(ams, { cities: [] })).toBe(true);
    expect(matchesAudience(rot, {})).toBe(true);
  });
});

describe("incompletePersonal", () => {
  it("matches a user missing a required personal-gate field", () => {
    const noPhone = user(1, { parentProfile: { phoneNumber: "" } });
    expect(matchesAudience(noPhone, { incompletePersonal: true })).toBe(true);
  });

  it("matches a user with no children submitted", () => {
    const noKids = user(1, { children: [] });
    expect(matchesAudience(noKids, { incompletePersonal: true })).toBe(true);
  });

  it("does not match a user whose personal gate is satisfied", () => {
    expect(matchesAudience(user(1), { incompletePersonal: true })).toBe(false);
  });

  it("agrees with lib/store.ts's isProfileComplete on the same fixtures (regression guard against drift)", () => {
    const complete = user(1);
    const incomplete = user(2, { parentProfile: { firstName: "" } });
    const pd = (u: AudienceUser) => (u.profileData as any);
    expect(matchesAudience(complete, { incompletePersonal: true })).toBe(
      !isProfileComplete({ parentProfile: pd(complete).parentProfile, children: pd(complete).children }),
    );
    expect(matchesAudience(incomplete, { incompletePersonal: true })).toBe(
      !isProfileComplete({ parentProfile: pd(incomplete).parentProfile, children: pd(incomplete).children }),
    );
  });
});

describe("incompleteAnalytical", () => {
  it("matches a user who has not finished the full parent-profile wizard", () => {
    const notDone = user(1, { parentProfileCompleted: false });
    expect(matchesAudience(notDone, { incompleteAnalytical: true })).toBe(true);
  });

  it("does not match a user who finished it", () => {
    expect(matchesAudience(user(1), { incompleteAnalytical: true })).toBe(false);
  });
});

describe("incompleteChildren", () => {
  it("matches a user with at least one incomplete child profile", () => {
    const u = user(1, { children: [{ id: "c1", name: "Yusuf", profileCompleted: false }] });
    expect(matchesAudience(u, { incompleteChildren: true })).toBe(true);
  });

  it("does not match when every child's profile is complete", () => {
    expect(matchesAudience(user(1), { incompleteChildren: true })).toBe(false);
  });

  it("does not match a user with zero children (that is incompletePersonal's job, not this filter's)", () => {
    const noKids = user(1, { children: [] });
    expect(matchesAudience(noKids, { incompleteChildren: true })).toBe(false);
  });

  it("incompleteChildNames lists only the incomplete children, by name", () => {
    const u = user(1, {
      children: [
        { id: "c1", name: "Yusuf", profileCompleted: false },
        { id: "c2", name: "Maryam", profileCompleted: true },
        { id: "c3", name: "Ibrahim", profileCompleted: false },
      ],
    });
    expect(incompleteChildNames(u)).toEqual(["Yusuf", "Ibrahim"]);
  });

  it("incompleteChildNames is empty when nothing is incomplete", () => {
    expect(incompleteChildNames(user(1))).toEqual([]);
  });
});

describe("combinations", () => {
  it("ANDs country with an incompleteness flag", () => {
    const nlIncomplete = user(1, { parentProfile: { country: "Nederland", phoneNumber: "" } });
    const nlComplete = user(2, { parentProfile: { country: "Nederland" } });
    const beIncomplete = user(3, { parentProfile: { country: "Belgium", phoneNumber: "" } });
    const filter = { countries: ["Nederland"], incompletePersonal: true };
    expect(matchesAudience(nlIncomplete, filter)).toBe(true);
    expect(matchesAudience(nlComplete, filter)).toBe(false);
    expect(matchesAudience(beIncomplete, filter)).toBe(false);
  });

  it("ANDs all three incompleteness flags together when combined", () => {
    const failsAllThree = user(1, {
      parentProfile: { phoneNumber: "" },
      parentProfileCompleted: false,
      children: [{ id: "c1", name: "Yusuf", profileCompleted: false }],
    });
    const failsOnlyTwo = user(2, {
      parentProfile: { phoneNumber: "" },
      parentProfileCompleted: false,
      // children profile is complete, so incompleteChildren does not hold
    });
    const filter = { incompletePersonal: true, incompleteAnalytical: true, incompleteChildren: true };
    expect(matchesAudience(failsAllThree, filter)).toBe(true);
    expect(matchesAudience(failsOnlyTwo, filter)).toBe(false);
  });

  it("tolerates a user with no profileData at all without throwing", () => {
    const bare: AudienceUser = { id: 9, name: "Bare", profileDataOverride: undefined } as any;
    expect(() => matchesAudience(bare, { incompletePersonal: true })).not.toThrow();
    expect(matchesAudience(bare, { incompletePersonal: true })).toBe(true);
  });
});

describe("selectAudience — the count is the recipients", () => {
  it("returns exactly the matching subset, so count and recipients come from one query", () => {
    const users = [
      user(1, { parentProfile: { country: "Nederland" } }),
      user(2, { parentProfile: { country: "Belgium" } }),
      user(3, { parentProfile: { country: "Nederland" }, parentProfileCompleted: false }),
      user(4, { parentProfile: { country: "Nederland" }, deletedAt: new Date() }),
    ];
    const filter = { countries: ["Nederland"] };
    const selected = selectAudience(users, filter);
    expect(selected.map((u) => u.id)).toEqual([1, 3]); // NL, active; #2 wrong country, #4 deleted
    expect(selected.length).toBe(users.filter((u) => matchesAudience(u, filter)).length);
  });
});
