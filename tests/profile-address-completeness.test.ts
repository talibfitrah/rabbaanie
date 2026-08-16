import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isProfileComplete, getFirstIncompleteOnboardingStep, defaultParentProfile } from "../lib/store";

describe("the onboarding city field", () => {
  // Source-level for the same reason tests/play-store-compliance.test.ts is:
  // mounting the screen needs native modules. Asserted as a regex so a
  // reformat cannot silently drop the guard.
  const screen = readFileSync(join(__dirname, "..", "app/onboarding/index.tsx"), "utf8");

  it("falls back to a free-text city only when the country is set but unknown", () => {
    // COUNTRIES[""] is undefined, so an unguarded !COUNTRIES[country] put every
    // brand-new user in the free-text box; picking a country afterwards runs
    // setCity("") and threw away whatever they had typed.
    expect(screen).toMatch(/country\s*&&\s*!COUNTRIES\[country\]/);
  });

  it("keeps the 'choose a country first' state reachable", () => {
    // Presence, not just absence: it is the only thing that explains to a new
    // user why the city picker does nothing yet. The bug above made it dead.
    expect(screen).toContain("Kies eerst een land");
  });
});

// lib/store.ts only imports @react-native-async-storage/async-storage (no
// "react-native" import), and that module has no side effects at import
// time, so no mock is needed here — tests/profile-completeness.test.ts
// already imports the same module unmocked.

const children = [
  { id: "1", name: "Kind 1", birthDate: "", gender: "" as const, profileCompleted: false, laterInvullen: true },
];

// A profile filled entirely through the new discrete address fields — what
// the updated onboarding screen now writes. No legacy combined fields at all,
// so these tests exercise the new fields in isolation.
const discreteProfile = {
  ...defaultParentProfile,
  firstName: "A",
  lastName: "B",
  birthDate: "1990-01-01",
  phoneNumber: "+31612345678",
  gender: "man",
  maritalStatus: "getrouwd",
  country: "Nederland",
  city: "Amsterdam",
  street: "Kerkstraat",
  houseNumber: "12",
  postalCode: "1012 AB",
};

describe("address fields in getFirstIncompleteOnboardingStep / isProfileComplete", () => {
  it("is complete with country, city, street, house number and postal code all filled in", () => {
    expect(getFirstIncompleteOnboardingStep({ parentProfile: discreteProfile, children })).toBe(null);
    expect(isProfileComplete({ parentProfile: discreteProfile, children })).toBe(true);
  });

  it("is incomplete at basic when country is missing", () => {
    const parentProfile = { ...discreteProfile, country: "" };
    expect(getFirstIncompleteOnboardingStep({ parentProfile, children })).toBe("basic");
  });

  it("is incomplete at basic when city is missing", () => {
    const parentProfile = { ...discreteProfile, city: "" };
    expect(getFirstIncompleteOnboardingStep({ parentProfile, children })).toBe("basic");
  });

  it("is incomplete at basic when street is missing", () => {
    const parentProfile = { ...discreteProfile, street: "" };
    expect(getFirstIncompleteOnboardingStep({ parentProfile, children })).toBe("basic");
  });

  it("is incomplete at basic when house number is missing", () => {
    const parentProfile = { ...discreteProfile, houseNumber: "" };
    expect(getFirstIncompleteOnboardingStep({ parentProfile, children })).toBe("basic");
  });

  it("stays complete when only postal code is missing — postal code must never be required", () => {
    const parentProfile = { ...discreteProfile, postalCode: "" };
    expect(getFirstIncompleteOnboardingStep({ parentProfile, children })).toBe(null);
    expect(isProfileComplete({ parentProfile, children })).toBe(true);
  });

  // Backward-compat decision: a profile from before these discrete fields
  // existed satisfies the address requirement through the old combined
  // streetHouseNumber/postalCodeCity fields instead — the exact same
  // condition the gate used before this change, kept as an alternate branch
  // rather than tightened, so nobody who already onboarded is newly sent
  // back through onboarding for data the form never asked them for.
  it("treats a legacy profile whose address lives only in the old combined fields as complete", () => {
    const legacyProfile = {
      ...defaultParentProfile,
      firstName: "A",
      lastName: "B",
      birthDate: "1990-01-01",
      phoneNumber: "+31612345678",
      gender: "man",
      maritalStatus: "getrouwd",
      country: "Nederland",
      streetHouseNumber: "Kerkstraat 12",
      postalCodeCity: "1012 AB Amsterdam",
      // No discrete city/street/houseNumber/postalCode — this predates those fields.
    };
    expect(getFirstIncompleteOnboardingStep({ parentProfile: legacyProfile, children })).toBe(null);
    expect(isProfileComplete({ parentProfile: legacyProfile, children })).toBe(true);
  });
});

describe("whitespace is not an address", () => {
  // Found by the adversarial pass: " " in every discrete field satisfied the
  // gate. Not reachable through the form, which trims before saving, but the
  // gate is the thing other writers rely on.
  const base = { firstName: "A", lastName: "B", birthDate: "1990-01-01", phoneNumber: "06", gender: "male", maritalStatus: "married" };

  it("rejects discrete fields holding only spaces", () => {
    expect(
      getFirstIncompleteOnboardingStep({
        parentProfile: { ...base, country: " ", city: " ", street: " ", houseNumber: " " } as any,
        children: [{ id: "c1" } as any],
      }),
    ).toBe("basic");
  });

  it("still accepts a legacy profile whose combined field is only spaces", () => {
    // Deliberately NOT trimmed: this passed before, so trimming it would lock
    // out an existing user — the exact failure the legacy branch guards.
    expect(
      getFirstIncompleteOnboardingStep({
        parentProfile: { ...base, streetHouseNumber: " " } as any,
        children: [{ id: "c1" } as any],
      }),
    ).toBe(null);
  });
});
