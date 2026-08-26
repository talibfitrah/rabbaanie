import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn().mockResolvedValue(null),
    setItem: vi.fn().mockResolvedValue(undefined),
  },
}));

import {
  loadDailyCheckinPrefs,
  saveDailyCheckinPrefs,
  DEFAULT_DAILY_CHECKIN_PREFS,
} from "../lib/daily-checkin-prefs";
import AsyncStorage from "@react-native-async-storage/async-storage";

describe("daily-checkin-prefs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (AsyncStorage.getItem as any).mockResolvedValue(null);
  });

  it("defaults to enabled when nothing is stored", async () => {
    expect(await loadDailyCheckinPrefs()).toEqual(DEFAULT_DAILY_CHECKIN_PREFS);
  });

  it("saves then loads back the same prefs (round trip)", async () => {
    let stored: string | null = null;
    (AsyncStorage.setItem as any).mockImplementation((_key: string, value: string) => {
      stored = value;
      return Promise.resolve();
    });
    (AsyncStorage.getItem as any).mockImplementation(() => Promise.resolve(stored));

    await saveDailyCheckinPrefs({ enabled: false });
    expect(await loadDailyCheckinPrefs()).toEqual({ enabled: false });
  });

  it("loads a stored {enabled:false} as disabled", async () => {
    (AsyncStorage.getItem as any).mockResolvedValue(JSON.stringify({ enabled: false }));
    expect(await loadDailyCheckinPrefs()).toEqual({ enabled: false });
  });
});
