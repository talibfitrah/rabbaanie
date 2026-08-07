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

    const loaded = await loadAppState(7);
    expect(loaded.onboardingCompleted).toBe(true);
    expect(mockStorage["opvoedadvies_app_state_7"]).toBeDefined();
    expect(mockStorage["opvoedadvies_app_state"]).toBeUndefined();
  });

  it("does not migrate legacy data to a second account once the legacy key is already gone", async () => {
    mockStorage["opvoedadvies_app_state"] = JSON.stringify({ ...defaultAppState, onboardingCompleted: true });
    await loadAppState(7); // first account adopts and clears the legacy key

    const loadedForSecondUser = await loadAppState(8);
    expect(loadedForSecondUser.onboardingCompleted).toBe(false);
  });

  it("falls back to the unscoped key when userId is null", async () => {
    await saveAppState({ ...defaultAppState, onboardingCompleted: true }, null);
    expect(mockStorage["opvoedadvies_app_state"]).toBeDefined();
    const loaded = await loadAppState(null);
    expect(loaded.onboardingCompleted).toBe(true);
  });
});
