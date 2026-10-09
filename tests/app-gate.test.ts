import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { isSetupRoute, resolvePendingRedirect, type PendingRedirectInput } from "../lib/app-gate";
import { defaultAppState, isOnboardingDone } from "../lib/store";

const base: PendingRedirectInput = {
  gateRedirect: null,
  ageLoading: false,
  loading: false,
  timedOut: false,
  ageStatus: "adult",
  isAuthenticated: true,
  profileDone: true,
  permissionsSetupDone: true,
  inSetup: false,
  languageSelected: true,
};

describe("resolvePendingRedirect", () => {
  it("sends a profile-complete adult who hasn't done permissions setup to /permissions-setup", () => {
    expect(resolvePendingRedirect({ ...base, permissionsSetupDone: false })).toBe("/permissions-setup");
  });

  it("prefers onboarding over permissions setup when the profile itself is incomplete", () => {
    expect(resolvePendingRedirect({ ...base, profileDone: false, permissionsSetupDone: false })).toBe("/onboarding");
  });

  it("never redirects once both onboarding and permissions setup are done", () => {
    expect(resolvePendingRedirect(base)).toBeNull();
  });

  it("never redirects while already inside the setup flow, even if permissions setup is pending", () => {
    expect(resolvePendingRedirect({ ...base, permissionsSetupDone: false, inSetup: true })).toBeNull();
  });

  it("the age/auth gate always wins over onboarding or permissions setup", () => {
    expect(resolvePendingRedirect({ ...base, gateRedirect: "/login", isAuthenticated: false, profileDone: false })).toBe("/login");
  });

  it("does not redirect for a minor even if profile/permissions are incomplete", () => {
    expect(resolvePendingRedirect({ ...base, ageStatus: "minor", profileDone: false, permissionsSetupDone: false })).toBeNull();
  });

  it("does not redirect while auth is still loading (no flash before state resolves)", () => {
    expect(resolvePendingRedirect({ ...base, loading: true, timedOut: false, permissionsSetupDone: false })).toBeNull();
  });

  it("redirects once auth loading has timed out, even if still technically 'loading'", () => {
    expect(resolvePendingRedirect({ ...base, loading: true, timedOut: true, permissionsSetupDone: false })).toBe("/permissions-setup");
  });

  it("does not redirect an unauthenticated user to onboarding or permissions setup", () => {
    expect(resolvePendingRedirect({ ...base, isAuthenticated: false, profileDone: false, permissionsSetupDone: false })).toBeNull();
  });
});

describe("isSetupRoute", () => {
  it("exempts verify-email so a just-registered user reaches it instead of onboarding", () => {
    expect(isSetupRoute("verify-email")).toBe(true);
  });
  it("keeps the pre-existing setup routes exempt", () => {
    expect(isSetupRoute("onboarding")).toBe(true);
    expect(isSetupRoute("language-select")).toBe(true);
    expect(isSetupRoute("permissions-setup")).toBe(true);
  });
  it("does not exempt ordinary routes", () => {
    expect(isSetupRoute("(tabs)")).toBe(false);
    expect(isSetupRoute("login")).toBe(false);
    expect(isSetupRoute(undefined)).toBe(false);
  });
});

describe("onboarding redirect ownership (onboarding loop: gender → kinderen → back to gender)", () => {
  const complete = {
    parentProfile: {
      ...defaultAppState.parentProfile,
      firstName: "A", lastName: "B", birthDate: "1985-01-01", country: "Nederland", city: "Utrecht",
      street: "Straat", houseNumber: "1", phoneNumber: "0600000000", gender: "man", maritalStatus: "getrouwd",
    },
    children: [{ id: "c1", name: "Testkind", birthDate: "2019-10-12", gender: "jongen" as const, profileCompleted: false, laterInvullen: true }],
  };

  it("a completed user stays done while a field reads empty mid-sync", () => {
    const blankGender = { ...complete, parentProfile: { ...complete.parentProfile, gender: "" } };
    expect(isOnboardingDone({ ...blankGender, onboardingCompleted: true })).toBe(true);
  });

  it("a first-run user without a chosen language is sent to language-select first (it then continues to /onboarding)", () => {
    expect(resolvePendingRedirect({ ...base, profileDone: false, languageSelected: false })).toBe("/language-select");
    // …but never pulled out of a setup screen, and never once onboarding is done.
    expect(resolvePendingRedirect({ ...base, profileDone: false, languageSelected: false, inSetup: true })).toBeNull();
    expect(resolvePendingRedirect({ ...base, languageSelected: false })).toBeNull();
  });

  it("a new user with an incomplete profile is not done (AuthGate still onboards them)", () => {
    const fresh = { ...complete, parentProfile: { ...complete.parentProfile, gender: "" }, onboardingCompleted: false };
    expect(isOnboardingDone(fresh)).toBe(false);
    expect(resolvePendingRedirect({ ...base, profileDone: isOnboardingDone(fresh) })).toBe("/onboarding");
  });

  it("no tab screen routes to /onboarding itself — they stay mounted under it and re-render", () => {
    const tabsDir = path.join(__dirname, "..", "app", "(tabs)");
    // Any route literal that is exactly /onboarding or /language-select (push,
    // replace, href, Redirect…). settings.tsx keeps one: after "reset all data".
    const allowed: Record<string, number> = { "settings.tsx": 1 };
    const offenders = fs.readdirSync(tabsDir)
      .filter((f) => f.endsWith(".tsx"))
      .filter((f) => (fs.readFileSync(path.join(tabsDir, f), "utf8").match(/["'`]\/(onboarding|language-select)["'`]/g) ?? []).length > (allowed[f] ?? 0));
    expect(offenders).toEqual([]);
    // …and AuthGate does use the shared rule.
    expect(fs.readFileSync(path.join(__dirname, "..", "app", "_layout.tsx"), "utf8")).toContain("isOnboardingDone(");
  });
});
