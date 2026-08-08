import { describe, expect, it } from "vitest";
import { resolvePendingRedirect, type PendingRedirectInput } from "../lib/app-gate";

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
