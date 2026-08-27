// Shape translation between the two halves of the production email-digest
// admin API, split out of app/admin/email.tsx so it has zero react-native /
// expo-router imports and can be unit-tested directly
// (tests/admin-email-settings-contract.test.ts) -- same reason
// app/admin/broadcast-send.ts exists: importing a screen pulls in
// react-native's Alert submodule, whose Flow syntax vitest cannot parse.
//
// The two halves do NOT agree, which is the whole point of this file
// (evidence: talibfitrah/rabbaanie-api @ master):
//   read  admin.getEmailSettings -> the raw Postgres row, snake_case
//         (server/article-email.ts:274-281, type at :26-38)
//   write admin.updateEmailSettings <- camelCase, all 15 fields required
//         (server/routers.ts:1617-1624)
// Every field is written unconditionally by that UPDATE
// (server/article-email.ts:283-306), so a blank sent here overwrites the
// stored copy the website's dashboard manages.

/** Exactly the input server/routers.ts:1617-1624 requires -- no more, no
 *  less, so the screen's form state cannot drift from the mutation. */
export type EmailSettingsInput = {
  /** No control on this screen: read from the row and sent back unchanged.
   *  The website dashboard owns it (server/web-dashboard.ts:726, 2618). */
  autoSendOnPublish: boolean;
  autoSendWeekly: boolean;
  /** Stored but never applied -- mode:'all' mails every user regardless
   *  (server/article-email.ts:339-348). The screen shows it read-only. */
  audience: string;
  subjectAr: string; subjectNl: string; subjectEn: string;
  introAr: string; introNl: string; introEn: string;
  closingAr: string; closingNl: string; closingEn: string;
  appUrl: string; siteUrl: string; subscribeUrl: string;
};

/** Nullable TEXT columns must reach the mutation as strings: zod's
 *  z.string() rejects null (create-email-tables.cjs:12-40). */
const str = (v: unknown) => (v == null ? "" : String(v));

/** Exactly the columns emailSettingsFromRow reads below. Kept in step with it
 *  by tests/admin-email-settings-contract.test.ts, which derives the same list
 *  from the UPDATE in article-email.ts:283-306 and drops one at a time. */
const ROW_COLUMNS = [
  "auto_send_on_publish", "auto_send_weekly", "audience",
  "subject_ar", "subject_nl", "subject_en",
  "intro_ar", "intro_nl", "intro_en",
  "closing_ar", "closing_nl", "closing_en",
  "app_url", "site_url", "subscribe_url",
] as const;

/**
 * True when `row` is the snake_case row this module can round-trip faithfully.
 *
 * This is a trust boundary, not a formality: `str()` turns an absent key into
 * "" and `!!` turns one into false, so a row of any OTHER shape maps to a
 * complete, valid-looking, entirely BLANK form with nothing on screen to say
 * so. updateEmailSettings writes all 15 fields unconditionally
 * (article-email.ts:283-306), so saving that form would replace the intro /
 * closing copy the website owns and set auto_send_weekly = false, silently
 * stopping the VM's Sunday mass-mail cron (scripts/weekly-digest.ts:12-18).
 * A NULL value is fine — those columns are nullable and an unfilled row is
 * legitimate. It is a missing KEY that means "this is not that row".
 */
export function isEmailSettingsRow(row: unknown): boolean {
  if (typeof row !== "object" || row === null || Array.isArray(row)) return false;
  return ROW_COLUMNS.every((c) => c in row);
}

export function emailSettingsFromRow(row: any): EmailSettingsInput {
  return {
    autoSendOnPublish: !!row.auto_send_on_publish,
    autoSendWeekly: !!row.auto_send_weekly,
    audience: str(row.audience),
    subjectAr: str(row.subject_ar), subjectNl: str(row.subject_nl), subjectEn: str(row.subject_en),
    introAr: str(row.intro_ar), introNl: str(row.intro_nl), introEn: str(row.intro_en),
    closingAr: str(row.closing_ar), closingNl: str(row.closing_nl), closingEn: str(row.closing_en),
    appUrl: str(row.app_url), siteUrl: str(row.site_url), subscribeUrl: str(row.subscribe_url),
  };
}
