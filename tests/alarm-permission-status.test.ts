import { describe, expect, it } from "vitest";
import { mapExactAlarmPermissionStatus } from "../lib/alarm-permission-status";

/**
 * Values match @notifee/react-native's AndroidNotificationSetting enum
 * (NOT_SUPPORTED = -1, DISABLED = 0, ENABLED = 1) — getting ENABLED/DISABLED
 * backwards here would silently tell the user the opposite of the truth
 * about whether hands-free iqamah silence can fire.
 */
describe("mapExactAlarmPermissionStatus", () => {
  it("maps ENABLED (1) to granted", () => {
    expect(mapExactAlarmPermissionStatus(1)).toBe("granted");
  });

  it("maps DISABLED (0) to denied", () => {
    expect(mapExactAlarmPermissionStatus(0)).toBe("denied");
  });

  it("maps NOT_SUPPORTED (-1) to unavailable", () => {
    expect(mapExactAlarmPermissionStatus(-1)).toBe("unavailable");
  });

  it("maps a missing value to unavailable rather than throwing", () => {
    expect(mapExactAlarmPermissionStatus(undefined)).toBe("unavailable");
  });
});
