import { TRPCError } from "@trpc/server";

import * as db from "./db";

export type AccessUser = { id: number };

type FamilyPermission =
  | "canEditChildren"
  | "canViewAdvice"
  | "canMessage"
  | "canManageGoals";

function forbidden(message: string): never {
  throw new TRPCError({ code: "FORBIDDEN", message });
}

function parsePermissions(value: unknown): Record<string, unknown> {
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

export async function assertFamilyAccess(user: AccessUser, familyId: number) {
  const membership = await db.getFamilyMembership(user.id, familyId);
  if (!membership) forbidden("Geen toegang tot dit gezin");
  return membership;
}

export async function assertFamilyPermission(
  user: AccessUser,
  familyId: number,
  permission: FamilyPermission,
) {
  const membership = await assertFamilyAccess(user, familyId);
  if (parsePermissions(membership.permissions)[permission] === false) {
    forbidden("Onvoldoende gezinsrechten");
  }
  return membership;
}

export async function assertFamilyOwner(user: AccessUser, familyId: number) {
  const family = await db.getFamilyById(familyId);
  if (!family) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Gezin niet gevonden" });
  }
  if (family.createdBy !== user.id)
    forbidden("Alleen de gezinsbeheerder kan dit wijzigen");
  return family;
}

export async function assertChildAccess(user: AccessUser, childId: number) {
  const child = await db.getChildById(childId);
  if (!child) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Kind niet gevonden" });
  }
  const membership = await db.getFamilyMembership(user.id, child.familyId);
  if (membership) return { child, membership, link: null };
  const link = await db.getConfirmedParentChildLink(user.id, childId);
  if (link) return { child, membership: null, link };
  return forbidden("Geen toegang tot dit kind");
}

export async function assertChildWriteAccess(
  user: AccessUser,
  childId: number,
) {
  const access = await assertChildAccess(user, childId);
  if (access.membership) {
    if (
      parsePermissions(access.membership.permissions).canEditChildren === false
    ) {
      forbidden("Geen schrijfrechten voor dit kind");
    }
  } else if (!access.link?.canEdit) {
    forbidden("Geen schrijfrechten voor dit kind");
  }
  return access;
}

export async function assertChildInFamily(
  user: AccessUser,
  childId: number,
  familyId: number,
  write = false,
) {
  const access = write
    ? await assertChildWriteAccess(user, childId)
    : await assertChildAccess(user, childId);
  if (access.child.familyId !== familyId)
    forbidden("Kind hoort niet bij dit gezin");
  return access;
}

export async function assertFamilyRecipient(
  user: AccessUser,
  familyId: number,
  recipientId: number,
) {
  await assertFamilyPermission(user, familyId, "canMessage");
  if (!(await db.getFamilyMembership(recipientId, familyId))) {
    forbidden("Ontvanger hoort niet bij dit gezin");
  }
}

export async function assertConfirmedCoParent(
  user: AccessUser,
  otherUserId: number,
) {
  if (!(await db.areConfirmedCoParents(user.id, otherUserId))) {
    forbidden("Alleen bevestigde co-ouders kunnen berichten uitwisselen");
  }
}

export async function assertAvailableSpecialist(userId: number) {
  if (!(await db.isAvailableSpecialist(userId))) {
    forbidden("Specialist is niet beschikbaar");
  }
}

export async function assertSpecialistParentRelationship(
  specialist: AccessUser,
  parentId: number,
) {
  if (
    !(await db.hasActiveSpecialistParentRelationship(specialist.id, parentId))
  ) {
    forbidden("Geen actieve begeleiding voor deze ouder");
  }
}

export async function assertMessageReadAccess(
  user: AccessUser,
  messageId: number,
) {
  const message = await db.getMessageById(messageId);
  if (!message) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Bericht niet gevonden",
    });
  }
  if (message.recipientId === user.id) return message;
  if (message.recipientId === null && message.familyId > 0) {
    await assertFamilyPermission(user, message.familyId, "canMessage");
    return message;
  }
  return forbidden("Geen toegang tot dit bericht");
}

export async function assertSpecialistAssignmentOwner(
  user: AccessUser,
  assignmentId: number,
) {
  const assignment = await db.getSpecialistAssignmentById(assignmentId);
  if (!assignment) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Toewijzing niet gevonden",
    });
  }
  if (assignment.specialistId !== user.id)
    forbidden("Geen toegang tot deze toewijzing");
  return assignment;
}

export async function assertActiveSpecialistFamily(
  user: AccessUser,
  familyId: number,
) {
  if (!(await db.hasActiveSpecialistAssignment(user.id, familyId))) {
    forbidden("Geen actieve toewijzing voor dit gezin");
  }
}

export async function getTreatmentPlanAccess(
  user: AccessUser,
  treatmentPlanId: number,
) {
  const plan = await db.getTreatmentPlanById(treatmentPlanId);
  if (!plan) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Behandelplan niet gevonden",
    });
  }
  if (plan.specialistId === user.id) return { plan, specialist: true };
  await assertChildInFamily(user, plan.childId, plan.familyId);
  return { plan, specialist: false };
}

export async function assertTreatmentPlanWrite(
  user: AccessUser,
  treatmentPlanId: number,
) {
  const access = await getTreatmentPlanAccess(user, treatmentPlanId);
  if (!access.specialist)
    forbidden("Alleen de toegewezen specialist kan dit wijzigen");
  return access.plan;
}

export async function assertMayConfirmLink(user: AccessUser, linkId: number) {
  const link = await db.getParentChildLinkById(linkId);
  if (!link || link.confirmed) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Koppelverzoek niet gevonden",
    });
  }
  if (link.parentId === user.id)
    forbidden("U kunt uw eigen verzoek niet bevestigen");
  await assertChildAccess(user, link.childId);
  return link;
}

export async function assertMayRemoveLink(user: AccessUser, linkId: number) {
  const link = await db.getParentChildLinkById(linkId);
  if (!link) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Koppeling niet gevonden",
    });
  }
  if (link.parentId !== user.id) await assertChildAccess(user, link.childId);
  return link;
}
