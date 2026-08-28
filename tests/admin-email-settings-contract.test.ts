import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { emailSettingsFromRow, isEmailSettingsRow, type EmailSettingsInput } from "../app/admin/email-settings";

// app/admin/email.tsx edits the production `email_settings` row through
// admin.getEmailSettings / admin.updateEmailSettings. Those two procedures do
// NOT share a shape, and getting that wrong silently wipes copy the website
// owns, so the mapping between them is pinned here.
//
// Evidence (production repo talibfitrah/rabbaanie-api, branch master):
//   * getEmailSettings returns the RAW Postgres row —
//     `SELECT * FROM email_settings WHERE id = 1` cast straight to
//     EmailSettingsRow (server/article-email.ts:274-281, type at :26-38).
//     Every column is snake_case. The production web dashboard reads it that
//     way (server/web-dashboard.ts:2617-2632).
//   * updateEmailSettings takes camelCase and requires all 15 fields
//     (server/routers.ts:1617-1624); each one is written unconditionally by
//     the UPDATE (server/article-email.ts:283-306). A field the client omits
//     fails zod; a field the client sends blank overwrites the stored copy.
//
// Fixture values are the real seeded row from the production installer
// create-email-tables.cjs:45-60, so "the form loaded blank" fails loudly.
const PRODUCTION_ROW = {
  id: 1,
  auto_send_on_publish: true,
  auto_send_weekly: true,
  audience: "all_users",
  subject_ar: "مقال جديد: {title}",
  subject_nl: "Nieuw artikel: {title}",
  subject_en: "New article: {title}",
  intro_ar: "بسم الله الرحمن الرحيم.",
  intro_nl: "Bismillaah.",
  intro_en: "Bismillaah, a new article is available.",
  closing_ar: "فريق ربّانيّ",
  closing_nl: "Het Rabbaanie-team",
  closing_en: "The Rabbaanie team",
  app_url: "https://www.rabbaanie.com/app",
  site_url: "https://www.rabbaanie.com/",
  subscribe_url: "https://www.rabbaanie.com/subscribe",
  last_digest_sent_at: "2026-08-20T17:00:00.000Z",
  updated_at: "2026-08-20T17:00:00.000Z",
};

/** column -> mutation field, from server/article-email.ts:283-306's UPDATE. */
const COLUMN_TO_FIELD: Record<string, keyof EmailSettingsInput> = {
  auto_send_on_publish: "autoSendOnPublish",
  auto_send_weekly: "autoSendWeekly",
  audience: "audience",
  subject_ar: "subjectAr", subject_nl: "subjectNl", subject_en: "subjectEn",
  intro_ar: "introAr", intro_nl: "introNl", intro_en: "introEn",
  closing_ar: "closingAr", closing_nl: "closingNl", closing_en: "closingEn",
  app_url: "appUrl", site_url: "siteUrl", subscribe_url: "subscribeUrl",
};

describe("emailSettingsFromRow — reads the raw snake_case row the API returns", () => {
  it("carries every stored column through instead of leaving the field blank", () => {
    const form = emailSettingsFromRow(PRODUCTION_ROW);
    for (const [column, field] of Object.entries(COLUMN_TO_FIELD)) {
      expect(form[field], `${column} -> ${field}`).toBe((PRODUCTION_ROW as any)[column]);
    }
  });

  it("round-trips auto_send_on_publish rather than hardcoding it", () => {
    // The app has no control for this flag; saving must not silently clear it.
    expect(emailSettingsFromRow({ ...PRODUCTION_ROW, auto_send_on_publish: true }).autoSendOnPublish).toBe(true);
    expect(emailSettingsFromRow({ ...PRODUCTION_ROW, auto_send_on_publish: false }).autoSendOnPublish).toBe(false);
  });

  it("round-trips auto_send_weekly, which gates the VM's Sunday mass-mail cron", () => {
    // scripts/weekly-digest.ts:12-18 returns early unless auto_send_weekly.
    expect(emailSettingsFromRow({ ...PRODUCTION_ROW, auto_send_weekly: true }).autoSendWeekly).toBe(true);
    expect(emailSettingsFromRow({ ...PRODUCTION_ROW, auto_send_weekly: false }).autoSendWeekly).toBe(false);
  });
});

describe("emailSettingsFromRow — the result is a complete updateEmailSettings input", () => {
  // Exactly the keys server/routers.ts:1617-1624 requires. A missing key is
  // rejected by zod (the save can never succeed); an extra key is a field the
  // server does not persist, so the UI would lie about having saved it.
  const REQUIRED_FIELDS = [
    "autoSendOnPublish", "autoSendWeekly", "audience",
    "subjectAr", "subjectNl", "subjectEn",
    "introAr", "introNl", "introEn",
    "closingAr", "closingNl", "closingEn",
    "appUrl", "siteUrl", "subscribeUrl",
  ];

  it("produces exactly the fields the mutation's zod schema requires", () => {
    expect(Object.keys(emailSettingsFromRow(PRODUCTION_ROW)).sort()).toEqual([...REQUIRED_FIELDS].sort());
  });

  it("types every field the way zod does: booleans boolean, the rest strings", () => {
    const form = emailSettingsFromRow(PRODUCTION_ROW);
    for (const field of REQUIRED_FIELDS) {
      const expected = field === "autoSendOnPublish" || field === "autoSendWeekly" ? "boolean" : "string";
      expect(typeof (form as any)[field], field).toBe(expected);
    }
  });

  it("turns NULL columns into empty strings, since zod rejects null", () => {
    // subject_*/intro_*/closing_*/app_url/... are all nullable TEXT
    // (create-email-tables.cjs:12-40, EmailSettingsRow at article-email.ts:26-38).
    const nulled = Object.fromEntries(Object.keys(PRODUCTION_ROW).map((k) => [k, null]));
    const form = emailSettingsFromRow(nulled);
    for (const field of REQUIRED_FIELDS) {
      const expected = field === "autoSendOnPublish" || field === "autoSendWeekly" ? false : "";
      expect((form as any)[field], field).toBe(expected);
    }
  });
});

// Every field of the mutation is written unconditionally
// (article-email.ts:283-306), so whatever this form holds when "Save settings"
// is pressed REPLACES the production row. `str()` maps any absent key to "" and
// `!!` maps one to false, so a row that is not the expected snake_case shape —
// renamed columns, a camelCase response, an empty object — loads as a complete,
// valid-looking, entirely blank form. Saving it would wipe the intro/closing
// copy the website owns and set auto_send_weekly = false, silently stopping the
// VM's Sunday mass-mail cron (scripts/weekly-digest.ts:12-18). Nothing about
// that is visible on screen. So the row is checked before it becomes a form.
describe("isEmailSettingsRow — a row that cannot be round-tripped must not become a form", () => {
  it("accepts the production row", () => {
    expect(isEmailSettingsRow(PRODUCTION_ROW)).toBe(true);
  });

  // Presence half: the columns are nullable TEXT, so an all-NULL row is a
  // legitimate un-filled row and must still load — a guard that rejected it
  // would lock the admin out of the screen that fills it in.
  it("accepts a row whose nullable columns are all NULL", () => {
    const nulled = Object.fromEntries(Object.keys(PRODUCTION_ROW).map((k) => [k, null]));
    expect(isEmailSettingsRow(nulled)).toBe(true);
  });

  it("rejects a camelCase response, which would otherwise map to a blank form", () => {
    const camel = Object.fromEntries(
      Object.entries(COLUMN_TO_FIELD).map(([, field]) => [field, "value"]),
    );
    expect(isEmailSettingsRow(camel)).toBe(false);
    // ...which is exactly what makes it dangerous: it maps without complaint.
    expect(emailSettingsFromRow(camel).introAr).toBe("");
    expect(emailSettingsFromRow(camel).autoSendWeekly).toBe(false);
  });

  it("rejects a row missing even one column the mapping reads", () => {
    for (const column of Object.keys(COLUMN_TO_FIELD)) {
      const { [column]: _dropped, ...rest } = PRODUCTION_ROW as any;
      expect(isEmailSettingsRow(rest), column).toBe(false);
    }
  });

  it("rejects non-rows instead of throwing", () => {
    for (const v of [null, undefined, {}, [], "row", 7]) {
      expect(isEmailSettingsRow(v as any)).toBe(false);
    }
  });
});

// The predicate only protects anything if the screen actually gates on it.
// Anchored on the identifiers, not on formatting.
describe("app/admin/email.tsx gates the form on the row check", () => {
  const SCREEN = readFileSync(join(__dirname, "..", "app", "admin", "email.tsx"), "utf8");

  it("imports isEmailSettingsRow and consults it before setting form state", () => {
    expect(SCREEN).toMatch(/isEmailSettingsRow/);
    const guardAt = SCREEN.indexOf("isEmailSettingsRow(settingsQuery.data)");
    expect(guardAt).toBeGreaterThan(-1);
  });

  it("tells the admin the settings could not be loaded rather than showing a blank form", () => {
    expect(SCREEN).toMatch(/settingsQuery\.isError\s*\|\|\s*\w+/);
  });
});
