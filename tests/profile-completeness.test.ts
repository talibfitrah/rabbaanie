import { describe, expect, it } from "vitest";
import { isProfileComplete, getFirstIncompleteOnboardingStep, defaultParentProfile } from "../lib/store";

describe("getFirstIncompleteOnboardingStep / isProfileComplete", () => {
  it("resumes at basic when a required basic field is missing", () => {
    expect(getFirstIncompleteOnboardingStep({ parentProfile: defaultParentProfile, children: [] })).toBe("basic");
  });

  it("resumes at gender when basic fields are present but gender/maritalStatus are not", () => {
    const parentProfile = {
      ...defaultParentProfile,
      firstName: "A", lastName: "B", birthDate: "1990-01-01",
      streetHouseNumber: "Kerkstraat 1", phoneNumber: "+31612345678",
    };
    expect(getFirstIncompleteOnboardingStep({ parentProfile, children: [] })).toBe("gender");
  });

  it("resumes at children when basic and gender fields are present but no children were submitted", () => {
    const parentProfile = {
      ...defaultParentProfile,
      firstName: "A", lastName: "B", birthDate: "1990-01-01",
      streetHouseNumber: "Kerkstraat 1", phoneNumber: "+31612345678",
      gender: "man", maritalStatus: "getrouwd",
    };
    expect(getFirstIncompleteOnboardingStep({ parentProfile, children: [] })).toBe("children");
    expect(isProfileComplete({ parentProfile, children: [] })).toBe(false);
  });

  it("is complete once a child (or a later-invullen placeholder) exists", () => {
    const parentProfile = {
      ...defaultParentProfile,
      firstName: "A", lastName: "B", birthDate: "1990-01-01",
      streetHouseNumber: "Kerkstraat 1", phoneNumber: "+31612345678",
      gender: "man", maritalStatus: "getrouwd",
    };
    const children = [{ id: "1", name: "Kind 1", birthDate: "", gender: "" as const, profileCompleted: false, laterInvullen: true }];
    expect(getFirstIncompleteOnboardingStep({ parentProfile, children })).toBe(null);
    expect(isProfileComplete({ parentProfile, children })).toBe(true);
  });

  it("is complete when the user explicitly declared they have no children", () => {
    // A newly-married, childless user: basic + gender done, zero children, but
    // they answered "I have no children" at the onboarding gate. Without the
    // hasNoChildren flag they would be stuck forever (children.length === 0
    // always read as incomplete → bounced back into onboarding on every launch).
    const parentProfile = {
      ...defaultParentProfile,
      firstName: "A", lastName: "B", birthDate: "1990-01-01",
      streetHouseNumber: "Kerkstraat 1", phoneNumber: "+31612345678",
      gender: "man", maritalStatus: "getrouwd",
      hasNoChildren: true,
    };
    expect(getFirstIncompleteOnboardingStep({ parentProfile, children: [] })).toBe(null);
    expect(isProfileComplete({ parentProfile, children: [] })).toBe(true);
  });

  it("still resumes at children when hasNoChildren is unset or false and no children exist", () => {
    const base = {
      ...defaultParentProfile,
      firstName: "A", lastName: "B", birthDate: "1990-01-01",
      streetHouseNumber: "Kerkstraat 1", phoneNumber: "+31612345678",
      gender: "man", maritalStatus: "getrouwd",
    };
    expect(getFirstIncompleteOnboardingStep({ parentProfile: base, children: [] })).toBe("children");
    expect(getFirstIncompleteOnboardingStep({ parentProfile: { ...base, hasNoChildren: false }, children: [] })).toBe("children");
  });

  it("tolerates a wholly missing parentProfile or children without throwing", () => {
    expect(() => isProfileComplete({})).not.toThrow();
    expect(isProfileComplete({})).toBe(false);
  });
});
