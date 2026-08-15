/**
 * The per-child advisor produces a plan and stores it as a local issue. The
 * consultation behind that plan is archived separately, so it shows up in
 * المحادثات السابقة and is counted in the owner report.
 *
 * The live diagnosis and the retroactive backfill both build their archive entry
 * from here: it has to look the same either way, or the same consultation shows
 * up twice in the parent's history.
 */
export type ArchivableIssue = {
  id: string;
  description: string;
  treatmentPlan?: string;
  analyticalQA?: { question: string; answer: string }[];
};

/**
 * Where an issue's archive row id is remembered, so re-diagnosing it updates
 * that row instead of appending a second one. The caller does the remembering.
 */
export function consultationArchiveKey(issueId: string): string {
  return `@issue_consultation_${issueId}`;
}

/** The archive row's title, and so the only thing that identifies it later. */
export function consultationTitle(description: string): string {
  return description.slice(0, 50);
}

/**
 * The row this consultation already occupies, if it has one.
 *
 * The archive key is written only once the server has answered, so a dropped
 * response leaves a row with no device-side record of its id — and the next
 * attempt would archive the same consultation again. Matching it back means the
 * existing row is updated instead of duplicated.
 *
 * The title is only the opening of what the parent wrote and a general advisor
 * chat about the same child is stored the same way, so the transcript length has
 * to agree too before a row is claimed as this consultation's.
 */
export function findArchivedRow(
  rows: { dbId: number; title: string; childName: string; messageCount: number }[],
  childName: string,
  title: string,
  messageCount: number,
): number | null {
  const row = rows.find(
    (r) =>
      r.childName === childName &&
      r.title === title &&
      r.messageCount === messageCount,
  );
  return row ? row.dbId : null;
}

/** Replays the consultation as the chat it effectively was. */
export function consultationMessages(
  issue: ArchivableIssue,
): { role: string; content: string }[] {
  return [
    { role: "user", content: issue.description },
    ...(issue.analyticalQA ?? []).flatMap((qa) => [
      { role: "assistant", content: qa.question },
      { role: "user", content: qa.answer },
    ]),
    { role: "assistant", content: issue.treatmentPlan ?? "" },
  ];
}
