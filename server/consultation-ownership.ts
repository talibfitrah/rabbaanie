/**
 * Who may open, change or delete a stored consultation.
 *
 * A leaf module on purpose: the rule is the security boundary for
 * parentAiConsultations, and keeping it importable means it can be tested as
 * behaviour instead of by grepping ai-chat.ts for an expression — which is how
 * the previous guard was checked, and why replacing it with a stronger one
 * broke the test.
 *
 * dbId is a sequential primary key, so without a rule here any caller could
 * walk it and read, overwrite or delete every family's consultation.
 */
export type ConsultationOwnerRow = {
  parentId?: number | null;
  deviceId?: string | null;
};

export function ownsConsultation(
  row: ConsultationOwnerRow | null | undefined,
  ownerId: number,
  deviceId: string,
): boolean {
  if (!row) return false;
  // The account owns it once there is one. deviceId is asserted by the client,
  // so honouring it for an owned row would mean learning a device id is enough
  // to read or delete someone else's consultation.
  if ((row.parentId ?? 0) > 0) return row.parentId === ownerId;
  // Rows created by parentAiConsultRouter.create carry a NULL deviceId; without
  // this a caller sending no device id at all would match them.
  return !!row.deviceId && row.deviceId === deviceId;
}
