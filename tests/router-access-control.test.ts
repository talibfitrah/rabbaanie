import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  getFamilyMembership: vi.fn(),
  getFamilyById: vi.fn(),
  getFamilyMemberById: vi.fn(),
  getChildById: vi.fn(),
  getConfirmedParentChildLink: vi.fn(),
  getMessageById: vi.fn(),
  getSpecialistAssignmentById: vi.fn(),
  hasActiveSpecialistAssignment: vi.fn(),
  getTreatmentPlanById: vi.fn(),
  getParentChildLinkById: vi.fn(),
  areConfirmedCoParents: vi.fn(),
  isAvailableSpecialist: vi.fn(),
  hasActiveSpecialistParentRelationship: vi.fn(),
}));

vi.mock("../server/db", () => db);

import {
  assertChildAccess,
  assertConfirmedCoParent,
  assertFamilyAccess,
  assertMayConfirmLink,
  assertMessageReadAccess,
  assertTreatmentPlanWrite,
  getTreatmentPlanAccess,
} from "../server/access-control";

const user = { id: 10 };

describe("object-level router authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.getFamilyMembership.mockResolvedValue(undefined);
    db.getConfirmedParentChildLink.mockResolvedValue(undefined);
  });

  it("denies a guessed family ID to a non-member", async () => {
    await expect(assertFamilyAccess(user, 999)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("denies a pending child link until another parent confirms it", async () => {
    db.getChildById.mockResolvedValue({ id: 22, familyId: 7 });

    await expect(assertChildAccess(user, 22)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });

    db.getConfirmedParentChildLink.mockResolvedValue({
      id: 44,
      parentId: user.id,
      childId: 22,
      confirmed: true,
      canEdit: true,
    });
    await expect(assertChildAccess(user, 22)).resolves.toMatchObject({
      child: { id: 22 },
      link: { confirmed: true },
    });
  });

  it("does not let a requester confirm their own child-link request", async () => {
    db.getParentChildLinkById.mockResolvedValue({
      id: 44,
      parentId: user.id,
      childId: 22,
      confirmed: false,
    });
    await expect(assertMayConfirmLink(user, 44)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("allows only the recipient or a family member to mark messages read", async () => {
    db.getMessageById.mockResolvedValue({
      id: 50,
      familyId: 0,
      senderId: 11,
      recipientId: 12,
    });
    await expect(assertMessageReadAccess(user, 50)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });

    db.getMessageById.mockResolvedValue({
      id: 51,
      familyId: 7,
      senderId: 11,
      recipientId: null,
    });
    db.getFamilyMembership.mockResolvedValue({
      userId: user.id,
      familyId: 7,
      accepted: true,
      permissions: { canMessage: true },
    });
    await expect(assertMessageReadAccess(user, 51)).resolves.toMatchObject({
      id: 51,
    });
  });

  it("keeps private treatment-plan writes with the assigned specialist", async () => {
    db.getTreatmentPlanById.mockResolvedValue({
      id: 80,
      specialistId: 40,
      familyId: 7,
      childId: 22,
    });
    db.getChildById.mockResolvedValue({ id: 22, familyId: 7 });
    db.getFamilyMembership.mockResolvedValue({
      userId: user.id,
      familyId: 7,
      accepted: true,
      permissions: {},
    });

    await expect(getTreatmentPlanAccess(user, 80)).resolves.toEqual({
      plan: expect.objectContaining({ id: 80 }),
      specialist: false,
    });
    await expect(assertTreatmentPlanWrite(user, 80)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });

    await expect(
      assertTreatmentPlanWrite({ id: 40 }, 80),
    ).resolves.toMatchObject({
      id: 80,
    });
  });

  it("does not allow direct messaging before co-parent confirmation", async () => {
    db.areConfirmedCoParents.mockResolvedValue(false);
    await expect(assertConfirmedCoParent(user, 11)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });

    db.areConfirmedCoParents.mockResolvedValue(true);
    await expect(assertConfirmedCoParent(user, 11)).resolves.toBeUndefined();
  });

  it("keeps partner requests pending until the recipient confirms", async () => {
    const routers = await import("node:fs").then((fs) =>
      fs.readFileSync("server/routers.ts", "utf8"),
    );
    const dbSource = await import("node:fs").then((fs) =>
      fs.readFileSync("server/db.ts", "utf8"),
    );
    expect(routers).toContain("No data is shared until you confirm");
    expect(routers).toContain("confirmPartnershipRequest");
    expect(dbSource).toContain('status: confirmed ? "active" : "pending"');
    expect(dbSource).toContain("eq(partnerships.confirmed, true)");
  });
});
