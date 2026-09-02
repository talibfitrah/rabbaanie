# Haid tracker — SERVER implementation plan (rabbaanie-api)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Store a woman's cycle days + settings on the production server and expose them to her and to her confirmed husband only, plus a women-only «معذورة اليوم» answer on the daily review's prayer question.

**Architecture:** Two Postgres tables (`cycle_days`, `cycle_settings`), dialect-agnostic db functions (select-then-insert/update, no `onConflict`), one tRPC router `cycle` in a new `server/cycle.ts`, one option added to the daily-diagnostic prayer question bank for gender `vrouw`. No fiqh logic on the server — classification runs in the client engine.

**Tech Stack:** Node, tRPC, Drizzle pg-core (`node-postgres`), zod, vitest.

**Spec:** `docs/superpowers/specs/2026-09-02-haid-tracker-design.md` (in the client repo `~/Development/rabbaanie`; copy it next to you if useful).

## Global Constraints

- Work ONLY in the mirror `/home/msa/Development/rabbaanie-api` on a new branch `feat/haid-tracker` from `master` (`fd65461`). Never touch the VM, never rsync, never deploy, never restart pm2 — the main session does that.
- Baselines you must not regress: `npm run typecheck` = **48** pre-existing errors (none in files you create); `npx vitest run` = 884 passed, 11 files fail to load only because `@apple/app-store-server-library` is not installed locally.
- Gender values are Dutch `"man"` / `"vrouw"`. A female-only check is `=== "vrouw"`, never `!== "man"`.
- Access must NOT depend on `hasFullPartnerAccess` (decision 15). It MUST depend on an active confirmed partnership (`getPartnersOfUser`) — dissolved partnerships must be refused (INV-4), and a wife must never read another wife or her husband (INV-1).
- Never log row contents. No owner/admin endpoint.
- Commit after every task with a conventional message; do not push (the main session pushes).

---

### Task S1: Schema + migration SQL

**Files:**
- Modify: `drizzle/schema.ts` (append at end)
- Create: `drizzle/postgres-cycle.sql`

**Interfaces:**
- Produces: `cycleDays`, `cycleSettings` Drizzle tables; row types `CycleDayRow`, `CycleSettingsRow`.

- [ ] **Step 1: Append the tables to `drizzle/schema.ts`** (check the file's existing imports — add `date`, `primaryKey` if missing; `pgTable`, `integer`, `text`, `boolean`, `timestamp` are already used there):

```ts
// ---- women's cycle tracker (haid/istihada/nifas) — spec 2026-09-02 ----
export const cycleDays = pgTable(
  "cycle_days",
  {
    userId: integer("user_id").notNull(),
    date: date("date", { mode: "string" }).notNull(), // YYYY-MM-DD
    flow: text("flow").notNull(), // 'blood' | 'spotting' | 'dry'
    color: text("color"), // 'black' | 'red' | null
    ghusl: boolean("ghusl").notNull().default(false),
    note: text("note"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.userId, t.date] }) }),
);
export type CycleDayRow = typeof cycleDays.$inferSelect;

export const cycleSettings = pgTable("cycle_settings", {
  userId: integer("user_id").primaryKey(),
  enabled: boolean("enabled").notNull().default(false),
  consentAt: timestamp("consent_at", { withTimezone: true }),
  habitLength: integer("habit_length"),
  cycleLength: integer("cycle_length"),
  pregnantSince: date("pregnant_since", { mode: "string" }),
  birthDate: date("birth_date", { mode: "string" }),
  miscarriageDate: date("miscarriage_date", { mode: "string" }),
  gestationDays: integer("gestation_days"),
  contraception: boolean("contraception").notNull().default(false),
  ghuslReminder: boolean("ghusl_reminder").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
export type CycleSettingsRow = typeof cycleSettings.$inferSelect;
```

- [ ] **Step 2: Write `drizzle/postgres-cycle.sql`** (hand-applied on the VM with `psql -f`; must be idempotent). Confirm the users table is `users(id)` by grepping `drizzle/schema.ts` for `pgTable("users"` first.

```sql
-- Women's cycle tracker — apply BEFORE deploying the cycle router. Idempotent.
CREATE TABLE IF NOT EXISTS cycle_days (
  user_id     integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date        date    NOT NULL,
  flow        text    NOT NULL CHECK (flow IN ('blood','spotting','dry')),
  color       text    CHECK (color IN ('black','red')),
  ghusl       boolean NOT NULL DEFAULT false,
  note        text,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, date)
);
CREATE TABLE IF NOT EXISTS cycle_settings (
  user_id          integer PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  enabled          boolean NOT NULL DEFAULT false,
  consent_at       timestamptz,
  habit_length     integer,
  cycle_length     integer,
  pregnant_since   date,
  birth_date       date,
  miscarriage_date date,
  gestation_days   integer,
  contraception    boolean NOT NULL DEFAULT false,
  ghusl_reminder   boolean NOT NULL DEFAULT true,
  updated_at       timestamptz NOT NULL DEFAULT now()
);
```

- [ ] **Step 3: Typecheck** — Run: `npm run -s typecheck 2>&1 | grep -c 'error TS'` → Expected: `48` (unchanged).

- [ ] **Step 4: Commit** — `git add drizzle/schema.ts drizzle/postgres-cycle.sql && git commit -m "feat(cycle): cycle_days + cycle_settings tables and migration"`

---

### Task S2: db functions (dialect-agnostic)

**Files:**
- Modify: `server/db.ts` (append at end)
- Test: `tests/cycle-db.test.ts`

**Interfaces:**
- Consumes: `cycleDays`, `cycleSettings` from `../drizzle/schema`.
- Produces:
  - `getCycleSettings(userId: number): Promise<CycleSettingsRow | null>`
  - `saveCycleSettings(userId: number, patch: CycleSettingsPatch): Promise<CycleSettingsRow>` — stamps `consentAt` the first time `enabled` becomes true.
  - `listCycleDays(userId: number, sinceDate: string): Promise<CycleDayRow[]>` (ascending by date)
  - `upsertCycleDay(userId: number, day: CycleDayInput): Promise<void>`
  - `deleteCycleDay(userId: number, date: string): Promise<void>`
  - `deleteAllCycleDays(userId: number): Promise<void>`
  - `type CycleDayInput = { date: string; flow: "blood"|"spotting"|"dry"; color?: "black"|"red"|null; ghusl?: boolean; note?: string|null }`
  - `type CycleSettingsPatch = Partial<Pick<CycleSettingsRow, "enabled"|"habitLength"|"cycleLength"|"pregnantSince"|"birthDate"|"miscarriageDate"|"gestationDays"|"contraception"|"ghuslReminder">>`

- [ ] **Step 1: Write the failing test `tests/cycle-db.test.ts`.** Look at how an existing db test mocks the Drizzle client (e.g. `tests/get-mothers-of-children.test.ts`) and use the same mock style. Minimal shape:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const rows: { settings: any[]; days: any[] } = { settings: [], days: [] };
vi.mock("../server/db-client", () => ({ /* adapt to the file that exports `db` in this repo */ }));
// If db is created inside server/db.ts itself, mock the pg driver like the sibling tests do instead.

import * as db from "../server/db";

describe("cycle db", () => {
  beforeEach(() => { rows.settings = []; rows.days = []; });
  it("saveCycleSettings stamps consentAt only when enabled first becomes true", async () => {
    const a = await db.saveCycleSettings(7, { enabled: true });
    expect(a.consentAt).toBeTruthy();
    const b = await db.saveCycleSettings(7, { habitLength: 6 });
    expect(b.consentAt).toEqual(a.consentAt);
  });
  it("upsertCycleDay updates an existing (userId,date) instead of duplicating", async () => {
    await db.upsertCycleDay(7, { date: "2026-09-01", flow: "blood" });
    await db.upsertCycleDay(7, { date: "2026-09-01", flow: "dry", ghusl: true });
    const days = await db.listCycleDays(7, "2026-01-01");
    expect(days).toHaveLength(1);
    expect(days[0].flow).toBe("dry");
    expect(days[0].ghusl).toBe(true);
  });
  it("deleteAllCycleDays removes only that user's rows", async () => {
    await db.upsertCycleDay(7, { date: "2026-09-01", flow: "blood" });
    await db.upsertCycleDay(8, { date: "2026-09-01", flow: "blood" });
    await db.deleteAllCycleDays(7);
    expect(await db.listCycleDays(7, "2026-01-01")).toHaveLength(0);
    expect(await db.listCycleDays(8, "2026-01-01")).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run it to verify it fails** — Run: `npx vitest run tests/cycle-db.test.ts` → Expected: FAIL (`saveCycleSettings is not a function`).

- [ ] **Step 3: Append the implementation to `server/db.ts`** (uses the repo's existing `db` handle and `eq`/`and`/`gte`/`asc` imports — add any missing import at the top):

```ts
// ---- women's cycle tracker ----
import { cycleDays, cycleSettings, type CycleDayRow, type CycleSettingsRow } from "../drizzle/schema";

export type CycleDayInput = { date: string; flow: "blood" | "spotting" | "dry"; color?: "black" | "red" | null; ghusl?: boolean; note?: string | null };
export type CycleSettingsPatch = Partial<Pick<CycleSettingsRow, "enabled" | "habitLength" | "cycleLength" | "pregnantSince" | "birthDate" | "miscarriageDate" | "gestationDays" | "contraception" | "ghuslReminder">>;

export async function getCycleSettings(userId: number): Promise<CycleSettingsRow | null> {
  const rows = await db.select().from(cycleSettings).where(eq(cycleSettings.userId, userId)).limit(1);
  return rows[0] ?? null;
}

export async function saveCycleSettings(userId: number, patch: CycleSettingsPatch): Promise<CycleSettingsRow> {
  const existing = await getCycleSettings(userId);
  const becomesEnabled = patch.enabled === true && !(existing?.enabled) ;
  const consentAt = existing?.consentAt ?? (becomesEnabled ? new Date() : null);
  const values = { ...patch, consentAt, updatedAt: new Date() };
  if (existing) {
    await db.update(cycleSettings).set(values).where(eq(cycleSettings.userId, userId));
  } else {
    await db.insert(cycleSettings).values({ userId, contraception: false, ghuslReminder: true, enabled: false, ...values });
  }
  return (await getCycleSettings(userId))!;
}

export async function listCycleDays(userId: number, sinceDate: string): Promise<CycleDayRow[]> {
  return db.select().from(cycleDays)
    .where(and(eq(cycleDays.userId, userId), gte(cycleDays.date, sinceDate)))
    .orderBy(asc(cycleDays.date));
}

export async function upsertCycleDay(userId: number, day: CycleDayInput): Promise<void> {
  const values = { flow: day.flow, color: day.color ?? null, ghusl: day.ghusl ?? false, note: day.note ?? null, updatedAt: new Date() };
  const existing = await db.select({ userId: cycleDays.userId }).from(cycleDays)
    .where(and(eq(cycleDays.userId, userId), eq(cycleDays.date, day.date))).limit(1);
  if (existing.length) {
    await db.update(cycleDays).set(values).where(and(eq(cycleDays.userId, userId), eq(cycleDays.date, day.date)));
  } else {
    await db.insert(cycleDays).values({ userId, date: day.date, ...values });
  }
}

export async function deleteCycleDay(userId: number, date: string): Promise<void> {
  await db.delete(cycleDays).where(and(eq(cycleDays.userId, userId), eq(cycleDays.date, date)));
}

export async function deleteAllCycleDays(userId: number): Promise<void> {
  await db.delete(cycleDays).where(eq(cycleDays.userId, userId));
}
```

- [ ] **Step 4: Run the test to verify it passes** — Run: `npx vitest run tests/cycle-db.test.ts` → Expected: PASS (3 tests).

- [ ] **Step 5: Typecheck + commit** — `npm run -s typecheck 2>&1 | grep -c 'error TS'` → `48`; `git add server/db.ts tests/cycle-db.test.ts && git commit -m "feat(cycle): dialect-agnostic db functions for cycle days and settings"`

---

### Task S3: `cycle` router with the husband gate

**Files:**
- Create: `server/cycle.ts`
- Modify: `server/routers.ts` (import + register `cycle: cycleRouter` in `appRouter` next to `dailyDiagnostic`)
- Test: `tests/cycle-router-access.test.ts`

**Interfaces:**
- Consumes: Task S2 functions; `getPartnersOfUser(userId)` from `server/db.ts` (returns partner records with `userId` and `partnershipConfirmed`; read its type at `server/db.ts:3246` and use the exact field names); `protectedProcedure`, `router` from `./_core/trpc`; the gender resolver pattern copied from `server/daily-diagnostic.ts:572-580` (users column first, then `profileData.parentProfile.gender`).
- Produces: `cycleRouter` with `getMine`, `upsertDay`, `deleteDay`, `saveSettings`, `disable`, `getPartner`. Output shape of `getMine`/`getPartner`: `{ enabled: boolean; settings: CycleSettingsRow | null; days: CycleDayRow[] }`.

- [ ] **Step 1: Write the failing test `tests/cycle-router-access.test.ts`.** Copy the procedure-calling harness from `tests/polygamy-privacy-and-cap.test.ts` (how it builds `ctx` and calls the router). Cases:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const genders: Record<number, string> = { 1: "man", 2: "vrouw", 3: "vrouw", 4: "man" };
const partners: Record<number, Array<{ userId: number; partnershipConfirmed: boolean }>> = {
  1: [{ userId: 2, partnershipConfirmed: true }, { userId: 3, partnershipConfirmed: true }], // husband of 2 and 3
  4: [],                                                                                    // ex-husband: dissolved → not listed
};
vi.mock("../server/db", async (orig) => {
  const real = await orig<typeof import("../server/db")>();
  return {
    ...real,
    getPartnersOfUser: vi.fn(async (id: number) => partners[id] ?? []),
    getUserById: vi.fn(async (id: number) => ({ id, gender: genders[id] })),   // adapt to the real name used by the gender resolver
    getCycleSettings: vi.fn(async (id: number) => ({ userId: id, enabled: true } as any)),
    listCycleDays: vi.fn(async () => [{ userId: 2, date: "2026-09-01", flow: "blood", color: null, ghusl: false, note: null }] as any),
    upsertCycleDay: vi.fn(async () => {}),
    deleteAllCycleDays: vi.fn(async () => {}),
    saveCycleSettings: vi.fn(async (id: number, p: any) => ({ userId: id, ...p } as any)),
  };
});
import { cycleRouter } from "../server/cycle";
const call = (userId: number) => cycleRouter.createCaller({ user: { id: userId } } as any);

describe("cycle router access", () => {
  it("husband reads his wife's data (no profile-access grant needed)", async () => {
    const r = await call(1).getPartner({ partnerId: 2 });
    expect(r.enabled).toBe(true);
    expect(r.days).toHaveLength(1);
  });
  it("a wife cannot read her co-wife", async () => {
    await expect(call(2).getPartner({ partnerId: 3 })).rejects.toThrow(/FORBIDDEN|not allowed/i);
  });
  it("a wife cannot read her husband", async () => {
    await expect(call(2).getPartner({ partnerId: 1 })).rejects.toThrow(/FORBIDDEN|not allowed/i);
  });
  it("an ex-husband (dissolved partnership) is refused", async () => {
    await expect(call(4).getPartner({ partnerId: 2 })).rejects.toThrow(/FORBIDDEN|not allowed/i);
  });
  it("a man cannot write cycle days", async () => {
    await expect(call(1).upsertDay({ date: "2026-09-01", flow: "blood" })).rejects.toThrow(/FORBIDDEN|women/i);
  });
  it("a woman can write and read her own days", async () => {
    await expect(call(2).upsertDay({ date: "2026-09-01", flow: "blood" })).resolves.toBeUndefined();
    const mine = await call(2).getMine();
    expect(mine.enabled).toBe(true);
  });
  it("disable deletes her rows", async () => {
    const db = await import("../server/db");
    await call(2).disable();
    expect(db.deleteAllCycleDays).toHaveBeenCalledWith(2);
    expect(db.saveCycleSettings).toHaveBeenCalledWith(2, { enabled: false });
  });
});
```

- [ ] **Step 2: Run it to verify it fails** — `npx vitest run tests/cycle-router-access.test.ts` → FAIL (cannot find `../server/cycle`).

- [ ] **Step 3: Create `server/cycle.ts`:**

```ts
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "./_core/trpc";
import * as db from "./db";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");
const flowEnum = z.enum(["blood", "spotting", "dry"]);
const colorEnum = z.enum(["black", "red"]);
const DAYS_BACK = 400;

function sinceDate(): string {
  const d = new Date(Date.now() - DAYS_BACK * 86_400_000);
  return d.toISOString().slice(0, 10);
}

/** Column-first gender, then the profileData blob — same rule as daily-diagnostic.ts. */
async function genderOf(userId: number): Promise<"man" | "vrouw" | ""> {
  // COPY the body of the resolver at server/daily-diagnostic.ts:572-580 here (do not import it: import cycle).
  throw new Error("replace with the copied resolver");
}

async function assertWoman(userId: number): Promise<void> {
  if ((await genderOf(userId)) !== "vrouw") throw new TRPCError({ code: "FORBIDDEN", message: "cycle data is for women" });
}

async function load(userId: number) {
  const settings = await db.getCycleSettings(userId);
  const enabled = !!settings?.enabled;
  const days = enabled ? await db.listCycleDays(userId, sinceDate()) : [];
  return { enabled, settings, days };
}

const settingsPatch = z.object({
  enabled: z.boolean().optional(),
  habitLength: z.number().int().min(1).max(60).nullable().optional(),
  cycleLength: z.number().int().min(10).max(120).nullable().optional(),
  pregnantSince: isoDate.nullable().optional(),
  birthDate: isoDate.nullable().optional(),
  miscarriageDate: isoDate.nullable().optional(),
  gestationDays: z.number().int().min(0).max(320).nullable().optional(),
  contraception: z.boolean().optional(),
  ghuslReminder: z.boolean().optional(),
});

export const cycleRouter = router({
  getMine: protectedProcedure.query(async ({ ctx }) => {
    await assertWoman(ctx.user.id);
    return load(ctx.user.id);
  }),

  upsertDay: protectedProcedure
    .input(z.object({ date: isoDate, flow: flowEnum, color: colorEnum.nullable().optional(), ghusl: z.boolean().optional(), note: z.string().max(200).nullable().optional() }))
    .mutation(async ({ ctx, input }) => {
      await assertWoman(ctx.user.id);
      await db.upsertCycleDay(ctx.user.id, input);
    }),

  deleteDay: protectedProcedure.input(z.object({ date: isoDate })).mutation(async ({ ctx, input }) => {
    await assertWoman(ctx.user.id);
    await db.deleteCycleDay(ctx.user.id, input.date);
  }),

  saveSettings: protectedProcedure.input(settingsPatch).mutation(async ({ ctx, input }) => {
    await assertWoman(ctx.user.id);
    return db.saveCycleSettings(ctx.user.id, input);
  }),

  disable: protectedProcedure.mutation(async ({ ctx }) => {
    await assertWoman(ctx.user.id);
    await db.deleteAllCycleDays(ctx.user.id);
    await db.saveCycleSettings(ctx.user.id, { enabled: false });
  }),

  /** Decision 15: a confirmed ACTIVE husband sees everything; nobody else sees anything. */
  getPartner: protectedProcedure.input(z.object({ partnerId: z.number().int().positive() })).query(async ({ ctx, input }) => {
    const me = ctx.user.id;
    if (input.partnerId === me) throw new TRPCError({ code: "FORBIDDEN", message: "not allowed" });
    if ((await genderOf(me)) !== "man") throw new TRPCError({ code: "FORBIDDEN", message: "not allowed" });
    if ((await genderOf(input.partnerId)) !== "vrouw") throw new TRPCError({ code: "FORBIDDEN", message: "not allowed" });
    const partners = await db.getPartnersOfUser(me);
    const active = partners.some((p) => p.userId === input.partnerId && p.partnershipConfirmed);
    if (!active) throw new TRPCError({ code: "FORBIDDEN", message: "not allowed" });
    return load(input.partnerId);
  }),
});
```

Then in `server/routers.ts`: `import { cycleRouter } from "./cycle";` and add `cycle: cycleRouter,` beside `dailyDiagnostic: dailyDiagnosticRouter,` (line ~4246).

- [ ] **Step 4: Run the tests** — `npx vitest run tests/cycle-router-access.test.ts` → PASS (7 tests). Fix the gender-resolver mock name to whatever db function the copied resolver actually calls.

- [ ] **Step 5: Typecheck + full suite + commit** — `npm run -s typecheck 2>&1 | grep -c 'error TS'` → `48`; `npx vitest run 2>&1 | tail -4` → 884 + your new tests passed, same 11 pre-existing load failures; `git add server/cycle.ts server/routers.ts tests/cycle-router-access.test.ts && git commit -m "feat(cycle): router — own read/write, husband read via active partnership"`

---

### Task S4: «معذورة اليوم» option on the daily review's prayer question (women only)

**Files:**
- Modify: `server/daily-diagnostic.ts:83-102` (types) and `:149-195` (prayer variants) and the builder at `:321-329`
- Test: `tests/daily-diagnostic-excused-option.test.ts`

**Interfaces:**
- Produces: option objects may carry `kind?: "excused"`. Clients detect the excused answer by `kind`, never by label.

- [ ] **Step 1: Failing test:**

```ts
import { describe, it, expect } from "vitest";
import { buildQuestionsForToday } from "../server/daily-diagnostic"; // export it if it is not exported yet

describe("daily review prayer question — excused option", () => {
  it("offers a 4th neutral 'excused' option to women on every variant", () => {
    for (const date of ["2026-09-01", "2026-09-02", "2026-09-03"]) {
      const qs = buildQuestionsForToday(date, "vrouw", "ar", false);
      const prayer = qs.find((q) => q.category === "prayer")!;
      const excused = prayer.options.filter((o) => o.kind === "excused");
      expect(excused).toHaveLength(1);
      expect(excused[0].tone).toBe("neutral");
      expect(prayer.options).toHaveLength(4);
    }
  });
  it("never offers it to men", () => {
    for (const date of ["2026-09-01", "2026-09-02", "2026-09-03"]) {
      const prayer = buildQuestionsForToday(date, "man", "ar", false).find((q) => q.category === "prayer")!;
      expect(prayer.options.some((o) => o.kind === "excused")).toBe(false);
      expect(prayer.options).toHaveLength(3);
    }
  });
});
```
Adapt the `buildQuestionsForToday` parameter list to its real signature (read `:321-329`).

- [ ] **Step 2: Run → FAIL** (`kind` undefined / 3 options).

- [ ] **Step 3: Implement.** In the option type add `kind?: "excused"`. Where the prayer question for the day is built (after variant selection), append for `gender === "vrouw"`:

```ts
const EXCUSED_OPTION = (lang: Lang) => ({
  label: tOf(lang)("Vandaag uitgezonderd (menstruatie of kraamtijd)", "Excused today (menses or postpartum)", "معذورة اليوم (حائض أو نفساء)"),
  tone: "neutral" as const,
  kind: "excused" as const,
});
// ... after building `prayerQuestion`:
if (gender === "vrouw") prayerQuestion.options = [...prayerQuestion.options, EXCUSED_OPTION(lang)];
```
Use the file's real `tOf(lang)` helper signature (`:136-138`). The submit validator (`:634-640`) compares `label` + `tone` against the issued options, so nothing changes there; confirm by reading it.

- [ ] **Step 4: Run → PASS; run the whole suite** (no regressions in existing daily-diagnostic tests).

- [ ] **Step 5: Commit** — `git add server/daily-diagnostic.ts tests/daily-diagnostic-excused-option.test.ts && git commit -m "feat(daily-diagnostic): women get an 'excused today' prayer answer (decision 13)"`

---

### Task S5: Final gate (no deploy)

- [ ] `npm run -s typecheck 2>&1 | grep -c 'error TS'` → `48`
- [ ] `npx vitest run 2>&1 | tail -4` → all new tests pass; only the 11 pre-existing `@apple/app-store-server-library` load failures remain
- [ ] `npm run build` → exit 0 (esbuild bundle builds; do NOT copy `dist` anywhere)
- [ ] `git log --oneline master..HEAD` shows S1–S4 commits. Report the exact outputs of the three commands above. Do not push, do not deploy.
