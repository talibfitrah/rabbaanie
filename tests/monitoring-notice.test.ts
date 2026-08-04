import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("expo-notifications", () => ({
  getPermissionsAsync: vi.fn(),
  setNotificationChannelAsync: vi.fn().mockResolvedValue(null),
  scheduleNotificationAsync: vi.fn().mockResolvedValue("monitoring-active"),
  dismissNotificationAsync: vi.fn().mockResolvedValue(undefined),
  cancelScheduledNotificationAsync: vi.fn().mockResolvedValue(undefined),
  AndroidImportance: { LOW: 2 },
  AndroidNotificationPriority: { LOW: "low" },
  AndroidNotificationVisibility: { PUBLIC: 1 },
}));

vi.mock("react-native", () => ({
  Platform: { OS: "android" },
}));

import * as Notifications from "expo-notifications";
import {
  runNoticeGatedCollection,
  showMonitoringNotice,
} from "../lib/monitoring-notice";

describe("monitoring notice", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fails closed when notification permission is unavailable", async () => {
    vi.mocked(Notifications.getPermissionsAsync).mockResolvedValue({
      status: "denied",
    } as Awaited<ReturnType<typeof Notifications.getPermissionsAsync>>);

    await expect(showMonitoringNotice("en")).resolves.toBe(false);
    expect(Notifications.setNotificationChannelAsync).not.toHaveBeenCalled();
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it("returns true only after the persistent notice is scheduled", async () => {
    vi.mocked(Notifications.getPermissionsAsync).mockResolvedValue({
      status: "granted",
    } as Awaited<ReturnType<typeof Notifications.getPermissionsAsync>>);

    await expect(showMonitoringNotice("en")).resolves.toBe(true);
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        identifier: "monitoring-active",
        content: expect.objectContaining({ sticky: true, autoDismiss: false }),
        trigger: { channelId: "monitoring-status" },
      }),
    );
  });

  it("fails closed when Android cannot post the notice", async () => {
    vi.mocked(Notifications.getPermissionsAsync).mockResolvedValue({
      status: "granted",
    } as Awaited<ReturnType<typeof Notifications.getPermissionsAsync>>);
    vi.mocked(Notifications.scheduleNotificationAsync).mockRejectedValueOnce(
      new Error("blocked"),
    );

    await expect(showMonitoringNotice("nl")).resolves.toBe(false);
  });

  it("does not collect when the persistent notice cannot be shown", async () => {
    vi.mocked(Notifications.getPermissionsAsync).mockResolvedValue({
      status: "denied",
    } as Awaited<ReturnType<typeof Notifications.getPermissionsAsync>>);
    const collect = vi.fn();

    await expect(
      runNoticeGatedCollection({ language: "en", collect }),
    ).resolves.toBe(false);
    expect(collect).not.toHaveBeenCalled();
  });

  it("removes the notice after a one-time collection", async () => {
    vi.mocked(Notifications.getPermissionsAsync).mockResolvedValue({
      status: "granted",
    } as Awaited<ReturnType<typeof Notifications.getPermissionsAsync>>);
    const collect = vi.fn().mockResolvedValue(undefined);

    await expect(
      runNoticeGatedCollection({ language: "en", collect }),
    ).resolves.toBe(true);
    expect(collect).toHaveBeenCalledOnce();
    expect(Notifications.dismissNotificationAsync).toHaveBeenCalledWith(
      "monitoring-active",
    );
  });

  it("cancels before collection and removes a notice posted during unmount", async () => {
    vi.mocked(Notifications.getPermissionsAsync).mockResolvedValue({
      status: "granted",
    } as Awaited<ReturnType<typeof Notifications.getPermissionsAsync>>);
    let cancelled = false;
    vi.mocked(Notifications.scheduleNotificationAsync).mockImplementationOnce(
      async () => {
        cancelled = true;
        return "monitoring-active";
      },
    );
    const collect = vi.fn();

    await expect(
      runNoticeGatedCollection({
        language: "en",
        collect,
        isCancelled: () => cancelled,
      }),
    ).resolves.toBe(false);
    expect(collect).not.toHaveBeenCalled();
    expect(Notifications.dismissNotificationAsync).toHaveBeenCalledWith(
      "monitoring-active",
    );
  });
});
