import { describe, expect, it } from "vitest";
import {
  calculateAgeInWeeks,
  getYearKey,
  getWeekInYear,
  pruneEmptyPlaceholderChildren,
  childIdFrom,
  defaultAppState,
  type AppState,
  type ChildProfile,
} from "../lib/store";

describe("calculateAgeInWeeks", () => {
  it("should calculate age correctly for a 2-year-old", () => {
    const twoYearsAgo = new Date();
    twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
    const result = calculateAgeInWeeks(twoYearsAgo.toISOString());
    expect(result.years).toBe(2);
    expect(result.totalWeeks).toBeGreaterThanOrEqual(104);
    expect(result.totalWeeks).toBeLessThan(106);
  });

  it("should calculate age correctly for a newborn", () => {
    const today = new Date();
    const result = calculateAgeInWeeks(today.toISOString());
    expect(result.years).toBe(0);
    expect(result.months).toBe(0);
    expect(result.totalWeeks).toBe(0);
  });

  it("should calculate age correctly for a 5-year-old", () => {
    const fiveYearsAgo = new Date();
    fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5);
    const result = calculateAgeInWeeks(fiveYearsAgo.toISOString());
    expect(result.years).toBe(5);
    expect(result.totalWeeks).toBeGreaterThanOrEqual(260);
  });
});

describe("getYearKey", () => {
  it("should return Jaar -1 for negative years", () => {
    expect(getYearKey(-1)).toBe("Jaar -1");
  });

  it("should return Jaar -1 for very negative years (capped)", () => {
    expect(getYearKey(-5)).toBe("Jaar -1");
  });

  it("should return Jaar 0 for age 0", () => {
    expect(getYearKey(0)).toBe("Jaar 0");
  });

  it("should return Jaar 5 for age 5", () => {
    expect(getYearKey(5)).toBe("Jaar 5");
  });

  it("should cap at Jaar 18 for ages above 18", () => {
    expect(getYearKey(20)).toBe("Jaar 18");
  });
});

describe("getWeekInYear", () => {
  it("should return week 1 for the first week of a year", () => {
    expect(getWeekInYear(52, 1)).toBe(1); // First week of year 1
  });

  it("should return week 10 for the 10th week of year 0", () => {
    expect(getWeekInYear(9, 0)).toBe(10);
  });

  it("should return correct week within a year", () => {
    // 120 total weeks, 2 years = 104 weeks, so 120 - 104 + 1 = 17
    expect(getWeekInYear(120, 2)).toBe(17);
  });
});

// ============ pruneEmptyPlaceholderChildren ============
//
// Onboarding used to spawn N empty "Kind N"/"Child N"/"طفل N" children flagged
// laterInvullen:true, with no birthdate and profileCompleted:false. This prunes
// exactly those — but only when the child also has NO environment/issue/
// actionPlan of its own, and never a child a user deliberately named "Kind 1"
// (those carry laterInvullen:false).

function placeholderChild(overrides: Partial<ChildProfile> = {}): ChildProfile {
  return {
    id: "c1",
    name: "Kind 1",
    birthDate: "",
    gender: "",
    profileCompleted: false,
    laterInvullen: true,
    ...overrides,
  };
}

function stateWith(children: ChildProfile[], extra: Partial<AppState> = {}): AppState {
  return { ...defaultAppState, children, ...extra };
}

describe("pruneEmptyPlaceholderChildren", () => {
  it("removes a Dutch placeholder ('Kind N', no birthdate, incomplete)", () => {
    const { state, removedCount } = pruneEmptyPlaceholderChildren(stateWith([placeholderChild()]));
    expect(removedCount).toBe(1);
    expect(state.children).toHaveLength(0);
  });

  it("removes an English placeholder ('Child N')", () => {
    const { removedCount } = pruneEmptyPlaceholderChildren(stateWith([placeholderChild({ name: "Child 2" })]));
    expect(removedCount).toBe(1);
  });

  it("removes an Arabic placeholder ('طفل N')", () => {
    const { removedCount } = pruneEmptyPlaceholderChildren(stateWith([placeholderChild({ name: "طفل 3" })]));
    expect(removedCount).toBe(1);
  });

  it("removes a child with a blank/whitespace-only name (no birthdate, incomplete)", () => {
    const { removedCount } = pruneEmptyPlaceholderChildren(stateWith([placeholderChild({ name: "   " })]));
    expect(removedCount).toBe(1);
  });

  it("keeps a placeholder-named child that HAS a birthdate — real users have these", () => {
    const { state, removedCount } = pruneEmptyPlaceholderChildren(
      stateWith([placeholderChild({ birthDate: "2015-06-01" })])
    );
    expect(removedCount).toBe(0);
    expect(state.children).toHaveLength(1);
  });

  it("keeps a real-named child with no birthdate", () => {
    const { removedCount } = pruneEmptyPlaceholderChildren(
      stateWith([placeholderChild({ name: "Umar", birthDate: "" })])
    );
    expect(removedCount).toBe(0);
  });

  it("keeps a placeholder-shaped child marked profileCompleted:true", () => {
    const { removedCount } = pruneEmptyPlaceholderChildren(
      stateWith([placeholderChild({ profileCompleted: true })])
    );
    expect(removedCount).toBe(0);
  });

  it("keeps a placeholder-named child marked laterInvullen:false — a real child the user typed 'Kind 1' for (else: prune → re-onboard → prune loop)", () => {
    const { removedCount } = pruneEmptyPlaceholderChildren(
      stateWith([placeholderChild({ laterInvullen: false })])
    );
    expect(removedCount).toBe(0);
  });

  it("keeps a placeholder-shaped child that already carries an environment / issue / actionPlan (partial 'fill later' work)", () => {
    const withEnv = pruneEmptyPlaceholderChildren(
      stateWith([placeholderChild({ id: "e1" })], { environments: [{ childId: "e1", completed: false } as any] })
    );
    expect(withEnv.removedCount).toBe(0);

    const withIssue = pruneEmptyPlaceholderChildren(
      stateWith([placeholderChild({ id: "i1" })], {
        issues: [{ id: "x", childId: "i1", description: "d", treatmentPlan: "", createdAt: "", resolved: false } as any],
      })
    );
    expect(withIssue.removedCount).toBe(0);

    const withPlan = pruneEmptyPlaceholderChildren(
      stateWith([placeholderChild({ id: "p1" })], {
        actionPlans: [{ id: "ap", childId: "p1", content: "", phases: [], savedAt: "", startDate: "", language: "nl", completedSteps: [] } as any],
      })
    );
    expect(withPlan.removedCount).toBe(0);
  });

  it("prunes the placeholder but keeps a real sibling and all of the sibling's data", () => {
    const state: AppState = {
      ...defaultAppState,
      children: [placeholderChild({ id: "placeholder1" }), placeholderChild({ id: "real1", name: "Umar", profileCompleted: true })],
      environments: [{ childId: "real1", completed: true } as any],
      issues: [{ id: "i2", childId: "real1", description: "y", treatmentPlan: "", createdAt: "", resolved: false } as any],
      actionPlans: [{ id: "p2", childId: "real1", content: "", phases: [], savedAt: "", startDate: "", language: "nl", completedSteps: [] } as any],
    };

    const { state: result, removedCount } = pruneEmptyPlaceholderChildren(state);

    expect(removedCount).toBe(1);
    expect(result.children.map((c) => c.id)).toEqual(["real1"]);
    expect(result.environments.map((e: any) => e.childId)).toEqual(["real1"]);
    expect(result.issues.map((i) => i.childId)).toEqual(["real1"]);
    expect(result.actionPlans.map((p) => p.id)).toEqual(["p2"]);
  });

  it("leaves dailyCheckins untouched — they are per-day, not linked to any child", () => {
    const checkin = { date: "2026-08-01", prayer: "alle_5_op_tijd", mood: "rustig", timestamp: "2026-08-01T00:00:00.000Z" };
    const { state } = pruneEmptyPlaceholderChildren(stateWith([placeholderChild()], { dailyCheckins: [checkin] }));
    expect(state.dailyCheckins).toEqual([checkin]);
  });

  it("is a true no-op when there is nothing to prune: same state reference, removedCount 0", () => {
    const input = stateWith([placeholderChild({ name: "Umar", profileCompleted: true })]);
    const { state, removedCount } = pruneEmptyPlaceholderChildren(input);
    expect(removedCount).toBe(0);
    expect(state).toBe(input);
  });

  it("does not mutate the input state's children array", () => {
    const original = [placeholderChild({ id: "c1" }), placeholderChild({ id: "c2", name: "Umar", profileCompleted: true })];
    const input = stateWith(original);
    pruneEmptyPlaceholderChildren(input);
    expect(original).toHaveLength(2);
  });

  it("degrades (no throw) when a corrupted cache serialized environments/issues/actionPlans as null", () => {
    const state = { ...defaultAppState, children: [placeholderChild()], environments: null as any, issues: null as any, actionPlans: null as any } as AppState;
    expect(() => pruneEmptyPlaceholderChildren(state)).not.toThrow();
    expect(pruneEmptyPlaceholderChildren(state).removedCount).toBe(1);
  });

  it("no-ops (no throw) when children itself is not an array", () => {
    const state = { ...defaultAppState, children: null as any } as AppState;
    const { state: result, removedCount } = pruneEmptyPlaceholderChildren(state);
    expect(removedCount).toBe(0);
    expect(result).toBe(state);
  });
});

describe("childIdFrom", () => {
  it("collapses internal whitespace so 'Ahmad Ali' and 'Ahmad  Ali' share one id (caught as a duplicate, not colliding after submit)", () => {
    expect(childIdFrom("Ahmad Ali", "")).toBe(childIdFrom("Ahmad  Ali", ""));
  });

  it("trims, lowercases, and encodes the birthdate (matches the add-child.tsx scheme)", () => {
    expect(childIdFrom("  Umar  ", "2017-05-27")).toBe("umar_20170527");
    expect(childIdFrom("Umar", "")).toBe("umar_unknown");
  });

  it("does not throw on a null/undefined name from a corrupted cache", () => {
    expect(() => childIdFrom(null as any, "")).not.toThrow();
    expect(childIdFrom(null as any, "")).toBe("_unknown");
  });
});

// The durable fix: onboarding must never again produce a child shaped like
// the ones pruneEmptyPlaceholderChildren removes, or a pruned user gets
// bounced back into onboarding, which recreates a placeholder, which gets
// pruned again on the next hydrate — an infinite loop. This builds children
// the same way the fixed onboarding flow does (real user-entered name,
// .trim()'d, birthdate optional, laterInvullen:false) and proves the REAL
// prune function removes none of them.
describe("onboarding-produced children survive pruneEmptyPlaceholderChildren (no re-creation loop)", () => {
  function onboardingChild(name: string, birthDate = ""): ChildProfile {
    // Build the id via the REAL shared helper (not a hand-mirrored copy) so a
    // future change to the scheme can't silently break the no-loop invariant.
    return {
      id: childIdFrom(name, birthDate),
      name: name.trim(),
      birthDate,
      gender: "",
      profileCompleted: false,
      laterInvullen: false,
      parentId: "parent",
    };
  }

  it("a child entered with just a name (no birthdate) is not removed", () => {
    const { state, removedCount } = pruneEmptyPlaceholderChildren(stateWith([onboardingChild("Ahmad")]));
    expect(removedCount).toBe(0);
    expect(state.children).toHaveLength(1);
  });

  it("a child entered with a name and a birthdate is not removed", () => {
    const { removedCount } = pruneEmptyPlaceholderChildren(stateWith([onboardingChild("Fatima", "2018-03-10")]));
    expect(removedCount).toBe(0);
  });

  it("multiple onboarding-entered children all survive", () => {
    const { state, removedCount } = pruneEmptyPlaceholderChildren(
      stateWith([onboardingChild("Ahmad"), onboardingChild("Umar", "2016-01-01"), onboardingChild("Khadija")])
    );
    expect(removedCount).toBe(0);
    expect(state.children).toHaveLength(3);
  });
});
