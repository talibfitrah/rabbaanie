import { beforeEach, describe, expect, it, vi } from "vitest";

const storage = vi.hoisted(() => ({
  getItem: vi.fn(),
  setItem: vi.fn(),
}));

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: storage,
}));

import {
  canUseNotifications,
  classifyBirthDate,
  getGateRedirect,
  persistAgeGateStatus,
  readStoredAgeGateStatus,
} from "../lib/age-gate";

const TODAY = new Date(2026, 7, 2);

describe("neutral age gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("accepts an adult on their eighteenth birthday", () => {
    expect(classifyBirthDate({ day: 2, month: 8, year: 2008 }, TODAY)).toBe(
      "adult",
    );
  });

  it("classifies a user one day short of eighteen as a minor", () => {
    expect(classifyBirthDate({ day: 3, month: 8, year: 2008 }, TODAY)).toBe(
      "minor",
    );
  });

  it("rejects impossible and future dates", () => {
    expect(
      classifyBirthDate({ day: 31, month: 2, year: 2000 }, TODAY),
    ).toBeNull();
    expect(
      classifyBirthDate({ day: 3, month: 8, year: 2026 }, TODAY),
    ).toBeNull();
  });

  it("stores only the coarse age category", async () => {
    storage.setItem.mockResolvedValue(undefined);

    await persistAgeGateStatus("adult");

    expect(storage.setItem).toHaveBeenCalledWith(
      "@rabbaanie_age_gate_status",
      "adult",
    );
  });

  it.each(["adult", "minor"] as const)(
    "restores the persisted %s category",
    async (status) => {
      storage.getItem.mockResolvedValue(status);
      await expect(readStoredAgeGateStatus()).resolves.toBe(status);
    },
  );

  it("fails closed for missing or malformed stored state", async () => {
    storage.getItem.mockResolvedValue("over-18");
    await expect(readStoredAgeGateStatus()).resolves.toBeNull();
  });

  it("keeps unknown and minor users on the age-check route", () => {
    expect(
      getGateRedirect({
        status: null,
        isAuthenticated: false,
        segment: "login",
        childMonitoringEnabled: false,
      }),
    ).toBe("/age-check");
    expect(
      getGateRedirect({
        status: "minor",
        isAuthenticated: true,
        segment: "(tabs)",
        childMonitoringEnabled: false,
      }),
    ).toBe("/age-check");
    expect(
      getGateRedirect({
        status: "minor",
        isAuthenticated: false,
        segment: "age-check",
        childMonitoringEnabled: false,
      }),
    ).toBeNull();
  });

  it("routes adults through authentication and blocks Play monitoring deep links", () => {
    expect(
      getGateRedirect({
        status: "adult",
        isAuthenticated: false,
        segment: "(tabs)",
        childMonitoringEnabled: false,
      }),
    ).toBe("/login");
    expect(
      getGateRedirect({
        status: "adult",
        isAuthenticated: true,
        segment: "login",
        childMonitoringEnabled: false,
      }),
    ).toBe("/(tabs)");
    expect(
      getGateRedirect({
        status: "adult",
        isAuthenticated: true,
        segment: "child-account",
        childMonitoringEnabled: false,
      }),
    ).toBe("/(tabs)");
    expect(
      getGateRedirect({
        status: "adult",
        isAuthenticated: true,
        segment: "child-account",
        childMonitoringEnabled: true,
      }),
    ).toBeNull();
  });

  it("lets a signed-out adult reach sign-up, but still age-checks them first", () => {
    // Without "register" in the auth group this returns "/login", which makes
    // the sign-up screen unreachable — the only way into the app for a new user.
    expect(
      getGateRedirect({
        status: "adult",
        isAuthenticated: false,
        segment: "register",
        childMonitoringEnabled: false,
      }),
    ).toBeNull();
    // A minor (or an unclassified visitor) is still sent to the age check.
    expect(
      getGateRedirect({
        status: "minor",
        isAuthenticated: false,
        segment: "register",
        childMonitoringEnabled: false,
      }),
    ).toBe("/age-check");
    expect(
      getGateRedirect({
        status: null,
        isAuthenticated: false,
        segment: "register",
        childMonitoringEnabled: false,
      }),
    ).toBe("/age-check");
  });

  it("reaches the support screen whether signed in or signed out", () => {
    // Signed-out: the login screen's "need help signing in?" link. Without
    // its own carve-out this returns "/login", bouncing the tap straight
    // back to the screen it was tapped from.
    expect(
      getGateRedirect({
        status: "adult",
        isAuthenticated: false,
        segment: "support",
        childMonitoringEnabled: false,
      }),
    ).toBeNull();
    // Signed-in: Settings' "Contact the technical team" row (the flow this
    // screen was built for). If "support" were folded into inAuthGroup
    // instead of getting its own check, it would inherit that group's
    // isAuthenticated-bounce-to-"/(tabs)" rule and break this existing path
    // for every signed-in user.
    expect(
      getGateRedirect({
        status: "adult",
        isAuthenticated: true,
        segment: "support",
        childMonitoringEnabled: false,
      }),
    ).toBeNull();
    // A minor (or an unclassified visitor) is still sent to the age check.
    expect(
      getGateRedirect({
        status: "minor",
        isAuthenticated: false,
        segment: "support",
        childMonitoringEnabled: false,
      }),
    ).toBe("/age-check");
    expect(
      getGateRedirect({
        status: null,
        isAuthenticated: false,
        segment: "support",
        childMonitoringEnabled: false,
      }),
    ).toBe("/age-check");
  });

  it("enables notifications only after both the adult gate and authentication", () => {
    expect(canUseNotifications(null, true)).toBe(false);
    expect(canUseNotifications("minor", true)).toBe(false);
    expect(canUseNotifications("adult", false)).toBe(false);
    expect(canUseNotifications("adult", true)).toBe(true);
  });
});
