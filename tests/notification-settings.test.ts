import { describe, it, expect } from "vitest";
import {
  resolveShouldShowPopup,
  DEFAULT_UNIFIED_NOTIF_PREFS,
  type NotifDisplayModes,
} from "../lib/notification-settings";

const modes = (overrides: Partial<NotifDisplayModes>): NotifDisplayModes => ({
  ...DEFAULT_UNIFIED_NOTIF_PREFS.displayModes,
  ...overrides,
});

describe("resolveShouldShowPopup", () => {
  it("shows popup when the category's mode is 'both'", () => {
    const data = { type: "prayer_fajr" };
    expect(resolveShouldShowPopup(data, modes({ prayer: "both" }))).toBe(true);
  });

  it("shows popup when the category's mode is 'popup'", () => {
    const data = { type: "adhkaar_morning" };
    expect(resolveShouldShowPopup(data, modes({ adhkar: "popup" }))).toBe(true);
  });

  it("hides popup when the category's mode is 'normal'", () => {
    const data = { type: "prayer_fajr" };
    expect(resolveShouldShowPopup(data, modes({ prayer: "normal" }))).toBe(false);
  });

  it("hides popup when the category's mode is 'off'", () => {
    const data = { type: "prayer_fajr" };
    expect(resolveShouldShowPopup(data, modes({ prayer: "off" }))).toBe(false);
  });

  it("hides popup when type matches no known category", () => {
    const data = { type: "totally_unknown_type" };
    expect(resolveShouldShowPopup(data, modes({}))).toBe(false);
  });

  it("respects the iqamah category's mode instead of forcing popup", () => {
    // iqamah_silence/restore notifications set showPopup:true in their data
    // payload, but must still respect the user's iqamah display-mode choice.
    const data = { type: "iqamah_silence", showPopup: true };
    expect(resolveShouldShowPopup(data, modes({ iqamah: "off" }))).toBe(false);
  });

  it("always shows the test notification regardless of the reminders mode", () => {
    const data = { type: "test_reminder", showPopup: true };
    expect(resolveShouldShowPopup(data, modes({ reminders: "off" }))).toBe(true);
  });

  it("still shows the test notification when reminders mode already allows it", () => {
    const data = { type: "test_reminder", showPopup: true };
    expect(resolveShouldShowPopup(data, modes({ reminders: "popup" }))).toBe(true);
  });

  it("returns false for missing data", () => {
    expect(resolveShouldShowPopup(null, modes({}))).toBe(false);
    expect(resolveShouldShowPopup(undefined, modes({}))).toBe(false);
  });
});
