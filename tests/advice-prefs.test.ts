import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn().mockResolvedValue(null),
    setItem: vi.fn().mockResolvedValue(undefined),
  },
}));

import { loadWidgetEnabled, saveWidgetEnabled } from "../lib/advice-prefs";
import AsyncStorage from "@react-native-async-storage/async-storage";

describe("advice-prefs widget enabled", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("defaults to enabled when nothing is stored", async () => {
    (AsyncStorage.getItem as any).mockResolvedValue(null);
    expect(await loadWidgetEnabled()).toBe(true);
  });

  it("returns the stored value when present", async () => {
    (AsyncStorage.getItem as any).mockResolvedValue("false");
    expect(await loadWidgetEnabled()).toBe(false);
  });

  it("returns enabled on storage read failure", async () => {
    (AsyncStorage.getItem as any).mockRejectedValue(new Error("boom"));
    expect(await loadWidgetEnabled()).toBe(true);
  });

  it("persists the enabled flag", async () => {
    await saveWidgetEnabled(true);
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      "@widget_notification_enabled",
      "true",
    );
  });
});
