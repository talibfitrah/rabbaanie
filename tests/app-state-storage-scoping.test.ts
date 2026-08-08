import { describe, expect, it, vi, beforeEach } from "vitest";

const mockStorage: Record<string, string> = {};
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn((key: string) => Promise.resolve(mockStorage[key] ?? null)),
    setItem: vi.fn((key: string, value: string) => {
      mockStorage[key] = value;
      return Promise.resolve();
    }),
    removeItem: vi.fn((key: string) => {
      delete mockStorage[key];
      return Promise.resolve();
    }),
  },
}));

import { loadAppState, saveAppState, defaultAppState } from "../lib/store";

describe("per-account app state storage", () => {
  beforeEach(() => {
    Object.keys(mockStorage).forEach((k) => delete mockStorage[k]);
  });

  it("saves and loads under a key scoped to the user id", async () => {
    const state = { ...defaultAppState, onboardingCompleted: true };
    await saveAppState(state, 42);
    expect(mockStorage["opvoedadvies_app_state_42"]).toBeDefined();
    expect(mockStorage["opvoedadvies_app_state"]).toBeUndefined();

    const loaded = await loadAppState(42);
    expect(loaded.onboardingCompleted).toBe(true);
  });

  it("a second account never reads the first account's scoped key", async () => {
    await saveAppState({ ...defaultAppState, onboardingCompleted: true }, 1);
    const loadedForOtherUser = await loadAppState(2);
    expect(loadedForOtherUser.onboardingCompleted).toBe(false);
  });

  it("migrates legacy unscoped data to the first account that hydrates after the upgrade, then deletes it", async () => {
    mockStorage["opvoedadvies_app_state"] = JSON.stringify({ ...defaultAppState, onboardingCompleted: true });

    const loaded = await loadAppState(7, { migrateLegacy: true });
    expect(loaded.onboardingCompleted).toBe(true);
    expect(mockStorage["opvoedadvies_app_state_7"]).toBeDefined();
    expect(mockStorage["opvoedadvies_app_state"]).toBeUndefined();
  });

  it("does not migrate legacy data to a second account once the legacy key is already gone", async () => {
    mockStorage["opvoedadvies_app_state"] = JSON.stringify({ ...defaultAppState, onboardingCompleted: true });
    await loadAppState(7, { migrateLegacy: true }); // first account adopts and clears the legacy key

    const loadedForSecondUser = await loadAppState(8);
    expect(loadedForSecondUser.onboardingCompleted).toBe(false);
  });

  it("falls back to the unscoped key when userId is null", async () => {
    await saveAppState({ ...defaultAppState, onboardingCompleted: true }, null);
    expect(mockStorage["opvoedadvies_app_state"]).toBeDefined();
    const loaded = await loadAppState(null);
    expect(loaded.onboardingCompleted).toBe(true);
  });

  it("a login-time read (no migrateLegacy option) never adopts legacy data, even if present", async () => {
    mockStorage["opvoedadvies_app_state"] = JSON.stringify({ ...defaultAppState, onboardingCompleted: true });

    const loaded = await loadAppState(9);
    expect(loaded.onboardingCompleted).toBe(false);
    expect(mockStorage["opvoedadvies_app_state_9"]).toBeUndefined();
    expect(mockStorage["opvoedadvies_app_state"]).toBeDefined();
  });

  // Pre-upgrade accounts' stored JSON predates the permissionsSetupCompleted
  // field entirely (it didn't exist in AppState yet), not merely "false" —
  // simulate that exactly, since JSON.stringify(defaultAppState) would
  // already include the field and mask the migration path being tested.
  function oldShapeStateJson(): string {
    const old: any = { ...defaultAppState };
    delete old.permissionsSetupCompleted;
    return JSON.stringify(old);
  }

  it("adopts the pre-AppState @permissions_setup_completed key into an existing account's state, then deletes it", async () => {
    mockStorage["opvoedadvies_app_state_10"] = oldShapeStateJson();
    mockStorage["@permissions_setup_completed"] = "true";

    const loaded = await loadAppState(10, { migrateLegacy: true });
    expect(loaded.permissionsSetupCompleted).toBe(true);
    expect(mockStorage["@permissions_setup_completed"]).toBeUndefined();
  });

  it("does not adopt @permissions_setup_completed on a login-time read (no migrateLegacy)", async () => {
    mockStorage["opvoedadvies_app_state_11"] = oldShapeStateJson();
    mockStorage["@permissions_setup_completed"] = "true";

    const loaded = await loadAppState(11);
    expect(loaded.permissionsSetupCompleted).toBe(false);
    expect(mockStorage["@permissions_setup_completed"]).toBeDefined();
  });

  it("never overrides an already-present permissionsSetupCompleted value with the legacy key", async () => {
    mockStorage["opvoedadvies_app_state_12"] = JSON.stringify({ ...defaultAppState, permissionsSetupCompleted: false });
    mockStorage["@permissions_setup_completed"] = "true";

    const loaded = await loadAppState(12, { migrateLegacy: true });
    expect(loaded.permissionsSetupCompleted).toBe(false);
  });

  it("persists the adopted permissionsSetupCompleted value, not just this call's return value", async () => {
    mockStorage["opvoedadvies_app_state_13"] = oldShapeStateJson();
    mockStorage["@permissions_setup_completed"] = "true";

    const first = await loadAppState(13, { migrateLegacy: true });
    expect(first.permissionsSetupCompleted).toBe(true);

    // The legacy key is already gone — a second load must see the adopted
    // value from the per-account blob itself, not silently lose it.
    const second = await loadAppState(13, { migrateLegacy: true });
    expect(second.permissionsSetupCompleted).toBe(true);
  });

  it("adopts both the unscoped legacy blob and the pre-AppState permissions flag in one first hydrate", async () => {
    const old: any = { ...defaultAppState };
    delete old.permissionsSetupCompleted;
    mockStorage["opvoedadvies_app_state"] = JSON.stringify(old);
    mockStorage["@permissions_setup_completed"] = "true";

    const loaded = await loadAppState(20, { migrateLegacy: true });
    expect(loaded.permissionsSetupCompleted).toBe(true);
    expect(mockStorage["opvoedadvies_app_state_20"]).toBeDefined();
    expect(mockStorage["opvoedadvies_app_state"]).toBeUndefined();
    expect(mockStorage["@permissions_setup_completed"]).toBeUndefined();
  });
});
