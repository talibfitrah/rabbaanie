import { beforeEach, describe, it, expect, vi } from "vitest";

// Router-level tests for admin.listSchedules/createSchedule/updateSchedule/
// deleteSchedule — same db-mock + adminCaller pattern as
// tests/broadcast-send-category.test.ts, kept in its own file for the same
// reason that file gives for not sharing fixtures: self-contained, own mock,
// own describe.
const dbMocks = vi.hoisted(() => ({
  listBroadcastSchedules: vi.fn(),
  createBroadcastSchedule: vi.fn(),
  updateBroadcastSchedule: vi.fn(),
  deleteBroadcastSchedule: vi.fn(),
}));
vi.mock("../server/db", () => dbMocks);
vi.mock("../server/totp", () => ({ has2FA: vi.fn().mockResolvedValue(true) }));

import { appRouter } from "../server/routers";

function adminCaller() {
  return appRouter.createCaller({
    req: {} as any,
    res: {} as any,
    user: {
      id: 7,
      name: "Admin",
      role: "admin",
      twoFactorVerifiedAt: Date.now(),
      language: "nl",
      profileData: {},
    } as any,
  });
}

describe("admin.listSchedules / createSchedule / updateSchedule / deleteSchedule", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("listSchedules returns db.listBroadcastSchedules() verbatim", async () => {
    const rows = [{ id: 1, category: "incompletePersonal", daysOfWeek: "0,1,2,3,4,5,6", sendHour: 9, active: false, lastSentAt: null, createdBy: 7, createdAt: new Date() }];
    dbMocks.listBroadcastSchedules.mockResolvedValue(rows);

    const result = await adminCaller().admin.listSchedules();

    expect(result).toBe(rows);
  });

  it("createSchedule stamps createdBy from the caller and defaults active to false", async () => {
    dbMocks.createBroadcastSchedule.mockResolvedValue(undefined);

    const result = await adminCaller().admin.createSchedule({ category: "incompleteAnalytical", daysOfWeek: "1,3,5", sendHour: 14 });

    expect(dbMocks.createBroadcastSchedule).toHaveBeenCalledWith({
      category: "incompleteAnalytical",
      daysOfWeek: "1,3,5",
      sendHour: 14,
      active: false,
      createdBy: 7,
    });
    expect(result).toEqual({ success: true });
  });

  it("createSchedule rejects a category outside the four known ones", async () => {
    await expect(
      adminCaller().admin.createSchedule({ category: "bogus" as any, daysOfWeek: "0,1,2,3,4,5,6", sendHour: 9 }),
    ).rejects.toThrow();
  });

  it("createSchedule rejects an empty daysOfWeek", async () => {
    await expect(
      adminCaller().admin.createSchedule({ category: "incompletePersonal", daysOfWeek: "", sendHour: 9 }),
    ).rejects.toThrow();
  });

  it("createSchedule rejects a daysOfWeek entry outside 0-6", async () => {
    await expect(
      adminCaller().admin.createSchedule({ category: "incompletePersonal", daysOfWeek: "0,7", sendHour: 9 }),
    ).rejects.toThrow();
  });

  it("createSchedule rejects sendHour outside 0-23", async () => {
    await expect(
      adminCaller().admin.createSchedule({ category: "incompletePersonal", daysOfWeek: "0", sendHour: 24 }),
    ).rejects.toThrow();
  });

  it("updateSchedule forwards id and patch, returning db's actually-matched flag", async () => {
    dbMocks.updateBroadcastSchedule.mockResolvedValue(true);

    const result = await adminCaller().admin.updateSchedule({ id: 5, active: true });

    expect(dbMocks.updateBroadcastSchedule).toHaveBeenCalledWith({ id: 5, active: true });
    expect(result).toEqual({ success: true });
  });

  it("updateSchedule rejects a payload with none of daysOfWeek, sendHour, or active", async () => {
    await expect(adminCaller().admin.updateSchedule({ id: 5 })).rejects.toThrow();
  });

  it("deleteSchedule forwards the id and surfaces false when nothing was deleted", async () => {
    dbMocks.deleteBroadcastSchedule.mockResolvedValue(false);

    const result = await adminCaller().admin.deleteSchedule({ id: 9 });

    expect(dbMocks.deleteBroadcastSchedule).toHaveBeenCalledWith(9);
    expect(result).toEqual({ success: false });
  });
});
