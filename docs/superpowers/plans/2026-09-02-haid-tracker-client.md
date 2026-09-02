# Haid tracker — CLIENT implementation plan (rabbaanie, Expo)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A private women's حيض/استحاضة/نفاس tracker: pure rules engine, tracker screen, «أنا حائض» on the prayer popup, paused prayer reminders with a daily purity check and ghusl reminder, the husband's read-only status, and the daily-review hook.

**Architecture:** `lib/haid.ts` is a pure engine over raw day rows fetched from `trpc.cycle.*` (server plan). Screens and glue never re-implement a rule; they call the engine and map its enums to trilingual text in `lib/haid-text.ts`. Notification suppression reads a tiny account-keyed AsyncStorage flag written after every data sync.

**Tech Stack:** Expo / React Native, expo-router, tRPC + react-query, AsyncStorage, expo-notifications, vitest.

**Spec:** `docs/superpowers/specs/2026-09-02-haid-tracker-design.md` — §2 is the binding fiqh contract; every engine test names the decision it proves.

## Global Constraints

- Branch `feat/haid-tracker` (exists, from `main` `535b1e6`). Commit after every task; do not push (the main session pushes).
- Baselines you must not regress: `npx tsc --noEmit` clean; `npx vitest run` = 1757 passed / 26 failed — the 26 are pre-existing environment failures (files: api-base-url, concepts, data-enrichment, fitrah-prayer-home, iman-notifications, phase9-features, quran-screen, session15-features). Any NEW failing test is yours.
- Gender values are Dutch `"man"` / `"vrouw"`. Women-only UI is gated on `gender === "vrouw"` (unset gender defaults to man elsewhere — never gate on `!== "man"`).
- Dates are `YYYY-MM-DD` strings everywhere; no `Date` objects cross module boundaries except into `getIslamicDate`.
- UI strings: inline `tx(lang, nl, en, ar)` as in `app/qasm.tsx`; Arabic is فصحى; nl/en use `Qur'aan`, `Soennah`, `Allaah` spellings.
- Engine and text modules must have zero React/RN imports.
- No paid model calls, no deploys, no APK builds, no pushes — the main session ships.

---

### Task C1: Engine core — runs, statuses, ghusl-due

**Files:**
- Create: `lib/haid.ts`
- Test: `lib/haid.test.ts`

**Interfaces (Produces — every later task uses these exact names):**
```ts
export type Flow = "blood" | "spotting" | "dry";
export type BloodColor = "black" | "red";
export interface CycleDay { date: string; flow: Flow; color?: BloodColor | null; ghusl?: boolean; note?: string | null }
export interface CycleSettings { enabled: boolean; habitLength?: number | null; cycleLength?: number | null; pregnantSince?: string | null; birthDate?: string | null; miscarriageDate?: string | null; gestationDays?: number | null; contraception: boolean; ghuslReminder: boolean }
export type DayStatus = "haid" | "nifas" | "istihada" | "tuhr_pending_ghusl" | "tuhr";
export type Advisory = "see_doctor" | "bleeding_in_pregnancy";
export interface ClassifiedDay { date: string; status: DayStatus; runDay?: number; ghuslDue: boolean; advisories: Advisory[] }
export interface BloodRun { start: string; end: string; dates: string[] }
export function addDays(iso: string, n: number): string
export function diffDays(a: string, b: string): number   // b − a
export function isoToday(): string                        // device-local date
export function bloodRuns(days: CycleDay[]): BloodRun[]
export function learnHabit(days: CycleDay[], settings: CycleSettings, before?: string): number | undefined
export function learnCycleLength(days: CycleDay[], settings: CycleSettings, before?: string): number | undefined
export function classify(days: CycleDay[], settings: CycleSettings, from: string, to: string): ClassifiedDay[]
export const DEFAULT_SETTINGS: CycleSettings
```

- [ ] **Step 1: Write the failing tests `lib/haid.test.ts`** (part 1 — this file grows in C2):

```ts
import { describe, it, expect } from "vitest";
import { addDays, diffDays, bloodRuns, classify, learnHabit, learnCycleLength, DEFAULT_SETTINGS, type CycleDay, type CycleSettings } from "./haid";

const S = (p: Partial<CycleSettings> = {}): CycleSettings => ({ ...DEFAULT_SETTINGS, enabled: true, ...p });
const blood = (dates: string[], color?: "black" | "red"): CycleDay[] => dates.map((date) => ({ date, flow: "blood", color }));
const span = (from: string, n: number) => Array.from({ length: n }, (_, i) => addDays(from, i));
const statusOf = (out: ReturnType<typeof classify>, date: string) => out.find((d) => d.date === date)!;

describe("date helpers", () => {
  it("addDays/diffDays cross month ends", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(diffDays("2026-02-01", "2026-03-01")).toBe(28);
  });
});

describe("bloodRuns — decision 4 (one non-blood day inside a run is absorbed)", () => {
  it("joins blood days separated by ONE clean day, splits on two", () => {
    const days = blood(["2026-09-01", "2026-09-02", "2026-09-04", "2026-09-08", "2026-09-09"]);
    const runs = bloodRuns(days);
    expect(runs.map((r) => [r.start, r.end])).toEqual([["2026-09-01", "2026-09-04"], ["2026-09-08", "2026-09-09"]]);
    expect(runs[0].dates).toHaveLength(4); // 1,2,3(absorbed),4
  });
});

describe("classify — haid by habit (decisions 1, 2)", () => {
  it("habit 7: days 1-7 haid, day 8+ istihada, no cap on input (day 20 still classified)", () => {
    const out = classify(blood(span("2026-09-01", 20)), S({ habitLength: 7 }), "2026-09-01", "2026-09-20");
    expect(statusOf(out, "2026-09-07").status).toBe("haid");
    expect(statusOf(out, "2026-09-08").status).toBe("istihada");
    expect(statusOf(out, "2026-09-20").status).toBe("istihada");
  });
  it("advisory see_doctor only from day 16 (decision 1: advisory, never a rule)", () => {
    const out = classify(blood(span("2026-09-01", 17)), S({ habitLength: 7 }), "2026-09-01", "2026-09-17");
    expect(statusOf(out, "2026-09-15").advisories).not.toContain("see_doctor");
    expect(statusOf(out, "2026-09-16").advisories).toContain("see_doctor");
  });
  it("habit beats colour: red days inside the habit are still haid (decision 2-أ)", () => {
    const days = [...blood(span("2026-09-01", 3), "black"), ...blood(span("2026-09-04", 2), "red")];
    const out = classify(days, S({ habitLength: 7 }), "2026-09-01", "2026-09-05");
    expect(statusOf(out, "2026-09-05").status).toBe("haid");
  });
  it("no habit: colour discriminates (black haid, red istihada)", () => {
    const days = [...blood(span("2026-09-01", 3), "black"), ...blood(span("2026-09-04", 2), "red")];
    const out = classify(days, S(), "2026-09-01", "2026-09-05");
    expect(statusOf(out, "2026-09-03").status).toBe("haid");
    expect(statusOf(out, "2026-09-05").status).toBe("istihada");
  });
  it("no habit, no colour: first 7 days haid, then istihada (غالب النساء)", () => {
    const out = classify(blood(span("2026-09-01", 10)), S(), "2026-09-01", "2026-09-10");
    expect(statusOf(out, "2026-09-07").status).toBe("haid");
    expect(statusOf(out, "2026-09-08").status).toBe("istihada");
  });
});

describe("classify — spotting and purity (decisions 3, 4)", () => {
  it("spotting is never haid, even right after blood; it ends the run with ghusl due", () => {
    const days: CycleDay[] = [...blood(span("2026-09-01", 5)), { date: "2026-09-06", flow: "spotting" }];
    const out = classify(days, S({ habitLength: 7 }), "2026-09-01", "2026-09-07");
    expect(statusOf(out, "2026-09-06").status).toBe("tuhr_pending_ghusl");
    expect(statusOf(out, "2026-09-06").ghuslDue).toBe(true);
    expect(statusOf(out, "2026-09-07").status).toBe("tuhr_pending_ghusl");
  });
  it("a single dry day between blood days stays haid; ghusl clears the pending state", () => {
    const days: CycleDay[] = [...blood(["2026-09-01", "2026-09-02"]), { date: "2026-09-03", flow: "dry" }, ...blood(["2026-09-04", "2026-09-05"]), { date: "2026-09-06", flow: "dry", ghusl: true }];
    const out = classify(days, S({ habitLength: 7 }), "2026-09-01", "2026-09-08");
    expect(statusOf(out, "2026-09-03").status).toBe("haid");
    expect(statusOf(out, "2026-09-06").status).toBe("tuhr");
    expect(statusOf(out, "2026-09-06").ghuslDue).toBe(false);
    expect(statusOf(out, "2026-09-08").status).toBe("tuhr");
  });
  it("istihada days after the habit carry ghuslDue until a ghusl is logged", () => {
    const days: CycleDay[] = [...blood(span("2026-09-01", 9)), { date: "2026-09-10", flow: "blood", ghusl: true }];
    const out = classify(days, S({ habitLength: 7 }), "2026-09-01", "2026-09-10");
    expect(statusOf(out, "2026-09-08")).toMatchObject({ status: "istihada", ghuslDue: true });
    expect(statusOf(out, "2026-09-10")).toMatchObject({ status: "istihada", ghuslDue: false });
  });
});

describe("classify — pregnancy and nifas (decisions 10, 11)", () => {
  it("pregnant: every blood day is istihada with the pregnancy advisory", () => {
    const out = classify(blood(span("2026-09-01", 3)), S({ pregnantSince: "2026-06-01" }), "2026-09-01", "2026-09-03");
    expect(statusOf(out, "2026-09-02")).toMatchObject({ status: "istihada" });
    expect(statusOf(out, "2026-09-02").advisories).toContain("bleeding_in_pregnancy");
  });
  it("nifas: birth day to day 40 is nifas; day 41 of the same run is istihada", () => {
    const out = classify(blood(span("2026-09-01", 42)), S({ pregnantSince: "2026-01-01", birthDate: "2026-09-01" }), "2026-09-01", "2026-10-12");
    expect(statusOf(out, "2026-09-01").status).toBe("nifas");
    expect(statusOf(out, "2026-10-10").status).toBe("nifas"); // day 40
    expect(statusOf(out, "2026-10-11").status).toBe("istihada"); // day 41
  });
  it("labour blood up to 3 days before the birth is nifas (decision 10-أ)", () => {
    const out = classify(blood(span("2026-08-29", 6)), S({ pregnantSince: "2026-01-01", birthDate: "2026-09-01" }), "2026-08-28", "2026-09-03");
    expect(statusOf(out, "2026-08-29").status).toBe("nifas");
    expect(statusOf(out, "2026-08-28").status).toBe("tuhr");
  });
  it("purity before day 40 → ghusl due, then tuhr; blood returning before 40 is nifas again", () => {
    const days: CycleDay[] = [...blood(span("2026-09-01", 10)), { date: "2026-09-11", flow: "dry", ghusl: true }, ...blood(["2026-09-20"])];
    const out = classify(days, S({ pregnantSince: "2026-01-01", birthDate: "2026-09-01" }), "2026-09-01", "2026-09-21");
    expect(statusOf(out, "2026-09-11").status).toBe("tuhr");
    expect(statusOf(out, "2026-09-20").status).toBe("nifas");
  });
  it("miscarriage at ≥120 days is nifas; below 120 days it is istihada (decision 10: 120)", () => {
    const yes = classify(blood(span("2026-09-01", 3)), S({ pregnantSince: "2026-04-01", miscarriageDate: "2026-09-01", gestationDays: 120 }), "2026-09-01", "2026-09-03");
    const no = classify(blood(span("2026-09-01", 3)), S({ pregnantSince: "2026-06-01", miscarriageDate: "2026-09-01", gestationDays: 90 }), "2026-09-01", "2026-09-03");
    expect(statusOf(yes, "2026-09-02").status).toBe("nifas");
    expect(statusOf(no, "2026-09-02").status).toBe("istihada");
  });
});

describe("classify — contraception (decision 12)", () => {
  it("with contraception, bleeding far from the expected start is istihada; bleeding at the expected start is haid", () => {
    const history = [...blood(span("2026-06-01", 5)), ...blood(span("2026-06-29", 5)), ...blood(span("2026-07-27", 5))];
    const onTime = classify([...history, ...blood(span("2026-08-24", 3))], S({ contraception: true, habitLength: 5 }), "2026-08-24", "2026-08-26");
    const offTime = classify([...history, ...blood(span("2026-08-12", 3))], S({ contraception: true, habitLength: 5 }), "2026-08-12", "2026-08-14");
    expect(statusOf(onTime, "2026-08-25").status).toBe("haid");
    expect(statusOf(offTime, "2026-08-13").status).toBe("istihada");
  });
});

describe("learning", () => {
  it("habit = median of the last three UNCAPPED run lengths; cycle = median of start intervals", () => {
    const days = [...blood(span("2026-05-01", 6)), ...blood(span("2026-05-29", 8)), ...blood(span("2026-06-26", 7)), ...blood(span("2026-07-24", 9))];
    expect(learnHabit(days, S())).toBe(8);
    expect(learnCycleLength(days, S())).toBe(28);
    expect(learnHabit(days, S(), "2026-05-20")).toBe(6);
    expect(learnHabit([], S())).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run → FAIL** — `npx vitest run lib/haid.test.ts` → "Failed to resolve import ./haid".

- [ ] **Step 3: Create `lib/haid.ts`:**

```ts
/**
 * Pure rules engine for the women's حيض / استحاضة / نفاس tracker.
 * No I/O, no React. Dates are "YYYY-MM-DD". The rules encode the 16 decisions in
 * docs/superpowers/specs/2026-09-02-haid-tracker-design.md §2 — change a rule
 * only with a decision number.
 */
export type Flow = "blood" | "spotting" | "dry";
export type BloodColor = "black" | "red";
export interface CycleDay { date: string; flow: Flow; color?: BloodColor | null; ghusl?: boolean; note?: string | null }
export interface CycleSettings {
  enabled: boolean;
  habitLength?: number | null;
  cycleLength?: number | null;
  pregnantSince?: string | null;
  birthDate?: string | null;
  miscarriageDate?: string | null;
  gestationDays?: number | null;
  contraception: boolean;
  ghuslReminder: boolean;
}
export type DayStatus = "haid" | "nifas" | "istihada" | "tuhr_pending_ghusl" | "tuhr";
export type Advisory = "see_doctor" | "bleeding_in_pregnancy";
export interface ClassifiedDay { date: string; status: DayStatus; runDay?: number; ghuslDue: boolean; advisories: Advisory[] }
export interface BloodRun { start: string; end: string; dates: string[] }

export const DEFAULT_SETTINGS: CycleSettings = { enabled: false, contraception: false, ghuslReminder: true };
export const DEFAULT_HAID_DAYS = 7; // غالب النساء — no habit, no colour
export const NIFAS_MAX_DAYS = 40; // his book: أكثر النفاس أربعون
export const LABOUR_BLOOD_DAYS_BEFORE_BIRTH = 3; // decision 10-أ
export const MISCARRIAGE_NIFAS_MIN_GESTATION = 120; // decision 10
export const SEE_DOCTOR_AFTER_DAYS = 15; // decision 1-ب: advisory only
export const CONTRACEPTION_WINDOW_DAYS = 3; // decision 12
export const DEFAULT_CYCLE_LENGTH = 28;
export const LUTEAL_DAYS = 14;
export const FERTILE_BEFORE = 5;
export const FERTILE_AFTER = 1;

const DAY_MS = 86_400_000;
function parseUTC(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}
export function addDays(iso: string, n: number): string {
  const x = new Date(parseUTC(iso) + n * DAY_MS);
  return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, "0")}-${String(x.getUTCDate()).padStart(2, "0")}`;
}
export function diffDays(a: string, b: string): number {
  return Math.round((parseUTC(b) - parseUTC(a)) / DAY_MS);
}
export function isoToday(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
}

/** Maximal groups of blood days where at most ONE non-blood day separates neighbours (decision 4). */
export function bloodRuns(days: CycleDay[]): BloodRun[] {
  const dates = days.filter((d) => d.flow === "blood").map((d) => d.date).sort();
  const runs: BloodRun[] = [];
  for (const date of dates) {
    const cur = runs[runs.length - 1];
    if (cur && diffDays(cur.end, date) <= 2) cur.end = date;
    else runs.push({ start: date, end: date, dates: [] });
  }
  for (const r of runs) {
    r.dates = [];
    for (let d = r.start; d <= r.end; d = addDays(d, 1)) r.dates.push(d);
  }
  return runs;
}

function effectiveBirth(s: CycleSettings): string | null {
  if (s.birthDate) return s.birthDate;
  if (s.miscarriageDate && (s.gestationDays ?? 0) >= MISCARRIAGE_NIFAS_MIN_GESTATION) return s.miscarriageDate;
  return null;
}
function pregnancyEnd(s: CycleSettings): string | null {
  const ends = [s.birthDate, s.miscarriageDate].filter((x): x is string => !!x).sort();
  return ends.length ? ends[ends.length - 1] : null;
}
function isPregnant(s: CycleSettings, date: string): boolean {
  if (!s.pregnantSince || date < s.pregnantSince) return false;
  const end = pregnancyEnd(s);
  if (end && end >= s.pregnantSince && date >= end) return false;
  return true;
}
/** Nifas day number (1 = birth day; labour days ≤ 0) when `date` is inside the nifas window, else null. */
function nifasDayOf(s: CycleSettings, date: string): number | null {
  const b = effectiveBirth(s);
  if (!b) return null;
  const n = diffDays(b, date) + 1;
  return n >= 1 - LABOUR_BLOOD_DAYS_BEFORE_BIRTH && n <= NIFAS_MAX_DAYS ? n : null;
}
function isNormalRun(r: BloodRun, s: CycleSettings): boolean {
  return nifasDayOf(s, r.start) === null && !isPregnant(s, r.start);
}
function median(xs: number[]): number | undefined {
  if (!xs.length) return undefined;
  const a = [...xs].sort((p, q) => p - q);
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : Math.round((a[m - 1] + a[m]) / 2);
}

/** Median length of the last three complete normal runs (uncapped, so a genuinely longer habit is learned). */
export function learnHabit(days: CycleDay[], settings: CycleSettings, before?: string): number | undefined {
  const runs = bloodRuns(days).filter((r) => isNormalRun(r, settings) && (!before || r.end < before));
  return median(runs.slice(-3).map((r) => r.dates.length));
}
/** Median of the last ≤6 start-to-start intervals of normal runs. */
export function learnCycleLength(days: CycleDay[], settings: CycleSettings, before?: string): number | undefined {
  const starts = bloodRuns(days).filter((r) => isNormalRun(r, settings) && (!before || r.end < before)).slice(-7).map((r) => r.start);
  const gaps: number[] = [];
  for (let i = 1; i < starts.length; i++) gaps.push(diffDays(starts[i - 1], starts[i]));
  return median(gaps.slice(-6));
}

export function classify(days: CycleDay[], settings: CycleSettings, from: string, to: string): ClassifiedDay[] {
  const byDate = new Map(days.map((d) => [d.date, d] as const));
  const runs = bloodRuns(days);
  const runStatus = new Map<string, { status: DayStatus; runDay: number; advisories: Advisory[] }>();

  for (const run of runs) {
    const habit = settings.habitLength ?? learnHabit(days, settings, run.start);
    const cycleLen = settings.cycleLength ?? learnCycleLength(days, settings, run.start);
    const prev = runs.filter((r) => r.end < run.start && isNormalRun(r, settings)).pop();
    const startedInNifas = nifasDayOf(settings, run.start) !== null;
    let contraceptionIstihada = false;
    if (settings.contraception && cycleLen && prev) {
      const expected = addDays(prev.start, cycleLen);
      contraceptionIstihada = Math.abs(diffDays(expected, run.start)) > CONTRACEPTION_WINDOW_DAYS;
    }
    const hasColours = run.dates.some((d) => byDate.get(d)?.color);
    let haidCount = 0;
    run.dates.forEach((date, i) => {
      const runDay = i + 1;
      const advisories: Advisory[] = [];
      let status: DayStatus;
      if (isPregnant(settings, date)) {
        status = "istihada";
        advisories.push("bleeding_in_pregnancy");
      } else if (nifasDayOf(settings, date) !== null) status = "nifas";
      else if (startedInNifas) status = "istihada"; // continuation past day 40 (his book: يُنظر فيه → استحاضة absent a habit match)
      else if (contraceptionIstihada) status = "istihada";
      else if (habit) status = haidCount < habit ? "haid" : "istihada";
      else if (hasColours) status = byDate.get(date)?.color === "red" ? "istihada" : "haid";
      else status = haidCount < DEFAULT_HAID_DAYS ? "haid" : "istihada";
      if (status === "haid") haidCount++;
      if (runDay > SEE_DOCTOR_AFTER_DAYS) advisories.push("see_doctor");
      runStatus.set(date, { status, runDay, advisories });
    });
  }

  // Walk day by day from well before `from` so ghuslDue is correct at `from`.
  const earliest = days.length ? [...days].map((d) => d.date).sort()[0] : from;
  let cursor = earliest < from ? earliest : from;
  if (diffDays(cursor, from) > 400) cursor = addDays(from, -400);
  const out: ClassifiedDay[] = [];
  let ghuslDue = false;
  let insideExcused = false;
  for (let date = cursor; date <= to; date = addDays(date, 1)) {
    const entry = byDate.get(date);
    const rs = runStatus.get(date);
    let status: DayStatus = rs?.status ?? "tuhr";
    const excusedNow = status === "haid" || status === "nifas";
    if (excusedNow) {
      ghuslDue = false;
      insideExcused = true;
    } else if (insideExcused) {
      ghuslDue = true; // first day after haid/nifas: ghusl is owed
      insideExcused = false;
    }
    if (ghuslDue && entry?.ghusl) ghuslDue = false;
    if (!rs) status = ghuslDue ? "tuhr_pending_ghusl" : "tuhr";
    if (date >= from) out.push({ date, status, runDay: rs?.runDay, ghuslDue, advisories: rs?.advisories ?? [] });
  }
  return out;
}
```

- [ ] **Step 4: Run → PASS** — `npx vitest run lib/haid.test.ts`. If the contraception test fails on the "expected start" arithmetic, print `bloodRuns(history)` and check that the three history runs give cycle length 28 and expected start 2026-08-24.

- [ ] **Step 5: Commit** — `git add lib/haid.ts lib/haid.test.ts && git commit -m "feat(haid): pure rules engine — runs, haid/nifas/istihada, ghusl-due (decisions 1-4,10-12)"`

---

### Task C2: Engine — rulings, predictions, Ramadan, excused state

**Files:**
- Modify: `lib/haid.ts` (append)
- Test: `lib/haid.test.ts` (append)

**Interfaces (Produces):**
```ts
export type PermittedKey = "quran_recitation" | "touching_mushaf" | "staying_in_mosque" | "dhikr_dua";
export type NoteKey = "kaffarah_info" | "istihada_wudu_per_prayer_may_combine" | "istihada_intercourse_caution" | "prayer_of_this_time_due_after_ghusl" | "qadaa_prayer_if_missed_at_onset" | "fasting_qadaa_required";
export interface Rulings { prayer: "excused" | "due_after_ghusl" | "obligatory"; fasting: "forbidden_qadaa" | "allowed"; intercourse: "forbidden" | "after_ghusl" | "permitted" | "permitted_with_note"; ghusl: "due" | "none"; permitted: PermittedKey[]; notes: NoteKey[] }
export function rulingsFor(day: Pick<ClassifiedDay, "status" | "ghuslDue">): Rulings
export interface Prediction { habit?: number; cycleLength: number; nextStart?: string; ovulation?: string; fertile?: [string, string]; expectedPurity?: string }
export function predict(days: CycleDay[], settings: CycleSettings, today: string): Prediction
export function ramadanQadaaDays(classified: ClassifiedDay[], hijriOf: (date: string) => { month: number; year: number }): { year: number; days: number } | null
export function isExcusedToday(classified: ClassifiedDay[], today: string): boolean
export interface ExcusedState { excused: boolean; until?: string }
export function excusedState(classified: ClassifiedDay[], prediction: Prediction, today: string): ExcusedState
```

- [ ] **Step 1: Append failing tests:**

```ts
import { rulingsFor, predict, ramadanQadaaDays, isExcusedToday, excusedState } from "./haid";

describe("rulingsFor (decisions 5, 6, 7, 8, 9; his book on ghusl)", () => {
  it("haid/nifas: prayer excused, fasting forbidden with qadaa, intercourse forbidden, all three disputed acts permitted, kaffarah only as info", () => {
    for (const status of ["haid", "nifas"] as const) {
      const r = rulingsFor({ status, ghuslDue: false });
      expect(r).toMatchObject({ prayer: "excused", fasting: "forbidden_qadaa", intercourse: "forbidden", ghusl: "none" });
      expect(r.permitted).toEqual(expect.arrayContaining(["quran_recitation", "touching_mushaf", "staying_in_mosque"]));
      expect(r.notes).toContain("kaffarah_info");
      expect(r.notes).toContain("qadaa_prayer_if_missed_at_onset");
    }
  });
  it("istihada: prays with wudu per prayer (may combine), fasts, intercourse permitted with a note", () => {
    const r = rulingsFor({ status: "istihada", ghuslDue: false });
    expect(r).toMatchObject({ prayer: "obligatory", fasting: "allowed", intercourse: "permitted_with_note", ghusl: "none" });
    expect(r.notes).toContain("istihada_wudu_per_prayer_may_combine");
  });
  it("purity before ghusl: prayer due after ghusl, fasting allowed, intercourse only after ghusl", () => {
    expect(rulingsFor({ status: "tuhr_pending_ghusl", ghuslDue: true })).toMatchObject({ prayer: "due_after_ghusl", fasting: "allowed", intercourse: "after_ghusl", ghusl: "due" });
    expect(rulingsFor({ status: "istihada", ghuslDue: true })).toMatchObject({ prayer: "due_after_ghusl", intercourse: "after_ghusl", ghusl: "due" });
  });
  it("tuhr: everything normal", () => {
    expect(rulingsFor({ status: "tuhr", ghuslDue: false })).toMatchObject({ prayer: "obligatory", fasting: "allowed", intercourse: "permitted", ghusl: "none" });
  });
});

describe("predict", () => {
  const history = [...blood(span("2026-06-01", 5)), ...blood(span("2026-06-29", 5)), ...blood(span("2026-07-27", 5))];
  it("next start, ovulation −14, fertile window −5…+1, rolled forward past today", () => {
    const p = predict(history, S(), "2026-08-30");
    expect(p.cycleLength).toBe(28);
    expect(p.nextStart).toBe("2026-09-21");
    expect(p.ovulation).toBe("2026-09-07");
    expect(p.fertile).toEqual(["2026-09-02", "2026-09-08"]);
  });
  it("expected purity during a run = start + habit; during nifas = birth + 40", () => {
    const p = predict([...history, ...blood(span("2026-08-24", 3))], S(), "2026-08-26");
    expect(p.expectedPurity).toBe("2026-08-29");
    const n = predict(blood(span("2026-09-01", 5)), S({ pregnantSince: "2026-01-01", birthDate: "2026-09-01" }), "2026-09-05");
    expect(n.expectedPurity).toBe("2026-10-11");
  });
  it("no predictions while pregnant; defaults to 28 with no history", () => {
    expect(predict(history, S({ pregnantSince: "2026-08-01" }), "2026-08-30").nextStart).toBeUndefined();
    expect(predict([], S(), "2026-08-30")).toMatchObject({ cycleLength: 28 });
  });
});

describe("ramadan + excused state (decision 14)", () => {
  it("counts haid/nifas days in Ramadan of the latest year only", () => {
    const cls = classify(blood(span("2026-03-01", 5)), S({ habitLength: 5 }), "2026-03-01", "2026-03-10");
    const hijriOf = (d: string) => ({ month: d <= "2026-03-03" ? 9 : 10, year: 1447 });
    expect(ramadanQadaaDays(cls, hijriOf)).toEqual({ year: 1447, days: 3 });
    expect(ramadanQadaaDays(cls, () => ({ month: 1, year: 1447 }))).toBeNull();
  });
  it("excusedState: until = day before expected purity, at least today", () => {
    const days = blood(span("2026-09-01", 2));
    const cls = classify(days, S({ habitLength: 7 }), "2026-08-01", "2026-09-02");
    expect(isExcusedToday(cls, "2026-09-02")).toBe(true);
    expect(excusedState(cls, predict(days, S({ habitLength: 7 }), "2026-09-02"), "2026-09-02")).toEqual({ excused: true, until: "2026-09-07" });
    expect(excusedState(cls, predict(days, S(), "2026-09-02"), "2026-08-15")).toEqual({ excused: false });
  });
});
```

- [ ] **Step 2: Run → FAIL** (`rulingsFor` not exported).

- [ ] **Step 3: Append to `lib/haid.ts`:**

```ts
export type PermittedKey = "quran_recitation" | "touching_mushaf" | "staying_in_mosque" | "dhikr_dua";
export type NoteKey =
  | "kaffarah_info"
  | "istihada_wudu_per_prayer_may_combine"
  | "istihada_intercourse_caution"
  | "prayer_of_this_time_due_after_ghusl"
  | "qadaa_prayer_if_missed_at_onset"
  | "fasting_qadaa_required";
export interface Rulings {
  prayer: "excused" | "due_after_ghusl" | "obligatory";
  fasting: "forbidden_qadaa" | "allowed";
  intercourse: "forbidden" | "after_ghusl" | "permitted" | "permitted_with_note";
  ghusl: "due" | "none";
  permitted: PermittedKey[];
  notes: NoteKey[];
}

export function rulingsFor(day: Pick<ClassifiedDay, "status" | "ghuslDue">): Rulings {
  switch (day.status) {
    case "haid":
    case "nifas":
      return {
        prayer: "excused", fasting: "forbidden_qadaa", intercourse: "forbidden", ghusl: "none",
        permitted: ["quran_recitation", "touching_mushaf", "staying_in_mosque", "dhikr_dua"], // decision 5: الكل مباح
        notes: ["fasting_qadaa_required", "qadaa_prayer_if_missed_at_onset", "kaffarah_info"], // decisions 7, 6-ب
      };
    case "istihada":
      return day.ghuslDue
        ? { prayer: "due_after_ghusl", fasting: "allowed", intercourse: "after_ghusl", ghusl: "due", permitted: [],
            notes: ["prayer_of_this_time_due_after_ghusl", "istihada_wudu_per_prayer_may_combine", "istihada_intercourse_caution"] }
        : { prayer: "obligatory", fasting: "allowed", intercourse: "permitted_with_note", ghusl: "none", permitted: [],
            notes: ["istihada_wudu_per_prayer_may_combine", "istihada_intercourse_caution"] }; // decisions 8, 9-ب
    case "tuhr_pending_ghusl":
      return { prayer: "due_after_ghusl", fasting: "allowed", intercourse: "after_ghusl", ghusl: "due", permitted: [], notes: ["prayer_of_this_time_due_after_ghusl"] }; // his book: فإذا طهرت واغتسلت حلّ
    case "tuhr":
      return { prayer: "obligatory", fasting: "allowed", intercourse: "permitted", ghusl: "none", permitted: [], notes: [] };
  }
}

export interface Prediction { habit?: number; cycleLength: number; nextStart?: string; ovulation?: string; fertile?: [string, string]; expectedPurity?: string }

export function predict(days: CycleDay[], settings: CycleSettings, today: string): Prediction {
  const runs = bloodRuns(days);
  const habit = settings.habitLength ?? learnHabit(days, settings);
  const cycleLength = settings.cycleLength ?? learnCycleLength(days, settings) ?? DEFAULT_CYCLE_LENGTH;
  const p: Prediction = { habit, cycleLength };
  const current = runs.find((r) => r.start <= today && diffDays(r.end, today) <= 1);
  if (current) {
    if (nifasDayOf(settings, current.start) !== null) p.expectedPurity = addDays(effectiveBirth(settings)!, NIFAS_MAX_DAYS);
    else if (habit) p.expectedPurity = addDays(current.start, habit);
  }
  if (isPregnant(settings, today)) return p;
  const normal = runs.filter((r) => isNormalRun(r, settings));
  const last = normal[normal.length - 1];
  if (last) {
    let next = addDays(last.start, cycleLength);
    while (next < today) next = addDays(next, cycleLength);
    p.nextStart = next;
    p.ovulation = addDays(next, -LUTEAL_DAYS);
    p.fertile = [addDays(p.ovulation, -FERTILE_BEFORE), addDays(p.ovulation, FERTILE_AFTER)];
  }
  return p;
}

export function ramadanQadaaDays(classified: ClassifiedDay[], hijriOf: (date: string) => { month: number; year: number }): { year: number; days: number } | null {
  const perYear = new Map<number, number>();
  for (const d of classified) {
    if (d.status !== "haid" && d.status !== "nifas") continue;
    const h = hijriOf(d.date);
    if (h.month === 9) perYear.set(h.year, (perYear.get(h.year) ?? 0) + 1);
  }
  if (!perYear.size) return null;
  const year = Math.max(...perYear.keys());
  return { year, days: perYear.get(year)! };
}

export function isExcusedToday(classified: ClassifiedDay[], today: string): boolean {
  const d = classified.find((c) => c.date === today);
  return !!d && (d.status === "haid" || d.status === "nifas");
}

export interface ExcusedState { excused: boolean; until?: string }
/** Persisted for popup suppression + notification pause; `until` is the last expected excused day. */
export function excusedState(classified: ClassifiedDay[], prediction: Prediction, today: string): ExcusedState {
  if (!isExcusedToday(classified, today)) return { excused: false };
  const until = prediction.expectedPurity && prediction.expectedPurity > today ? addDays(prediction.expectedPurity, -1) : today;
  return { excused: true, until };
}
```

- [ ] **Step 4: Run → PASS** — `npx vitest run lib/haid.test.ts` (all tests).

- [ ] **Step 5: Commit** — `git add lib/haid.ts lib/haid.test.ts && git commit -m "feat(haid): rulings, predictions, Ramadan qadaa count, excused state (decisions 5-9,14,16)"`

---

### Task C3: Parity copy of the server surface in THIS repo (typing for `trpc.cycle.*`)

**Files:**
- Modify: `drizzle/schema.ts` (append MySQL-flavoured tables), `server/db.ts` (append), `server/routers.ts` (register), `server/daily-diagnostic.ts` (excused option)
- Create: `server/cycle.ts`
- Test: `tests/cycle-router-access.test.ts`, `tests/daily-diagnostic-excused-option.test.ts`

**Interfaces:** identical to the server plan (`docs/superpowers/plans/2026-09-02-haid-tracker-server.md` Tasks S2–S4) — the client imports `AppRouter` from `@/server/routers`, so the router must exist here with the same procedure names and shapes: `cycle.getMine`, `cycle.upsertDay`, `cycle.deleteDay`, `cycle.saveSettings`, `cycle.disable`, `cycle.getPartner`; diagnostic options carry `kind?: "excused"`.

- [ ] **Step 1: Tables** — append to `drizzle/schema.ts` using this repo's mysql-core imports (`mysqlTable`, `int`, `varchar`, `boolean`, `date`, `timestamp`, `primaryKey`):

```ts
export const cycleDays = mysqlTable(
  "cycle_days",
  {
    userId: int("user_id").notNull(),
    date: date("date", { mode: "string" }).notNull(),
    flow: varchar("flow", { length: 16 }).notNull(),
    color: varchar("color", { length: 16 }),
    ghusl: boolean("ghusl").notNull().default(false),
    note: varchar("note", { length: 200 }),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.userId, t.date] }) }),
);
export type CycleDayRow = typeof cycleDays.$inferSelect;
export const cycleSettings = mysqlTable("cycle_settings", {
  userId: int("user_id").primaryKey(),
  enabled: boolean("enabled").notNull().default(false),
  consentAt: timestamp("consent_at"),
  habitLength: int("habit_length"),
  cycleLength: int("cycle_length"),
  pregnantSince: date("pregnant_since", { mode: "string" }),
  birthDate: date("birth_date", { mode: "string" }),
  miscarriageDate: date("miscarriage_date", { mode: "string" }),
  gestationDays: int("gestation_days"),
  contraception: boolean("contraception").notNull().default(false),
  ghuslReminder: boolean("ghusl_reminder").notNull().default(true),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
export type CycleSettingsRow = typeof cycleSettings.$inferSelect;
```

- [ ] **Step 2: db functions, router, daily-diagnostic option** — copy the exact code of server-plan Tasks S2 Step 3, S3 Step 3 and S4 Step 3 into `server/db.ts`, `server/cycle.ts`, `server/routers.ts` (`cycle: cycleRouter`) and `server/daily-diagnostic.ts`. The gender resolver body comes from THIS repo's `server/daily-diagnostic.ts:572-580`. The code is dialect-agnostic by design (select-then-update/insert, no `onConflict`).

- [ ] **Step 3: Tests** — copy server-plan S3 Step 1 and S4 Step 1 test files, adapted to this repo's router test harness (see `tests/router-access-control.test.ts` for how procedures are invoked and db is mocked). Run: `npx vitest run tests/cycle-router-access.test.ts tests/daily-diagnostic-excused-option.test.ts` → PASS.

- [ ] **Step 4: tsc** — `npx tsc --noEmit` → clean. Also confirm the client type exists: `grep -n "cycle: cycleRouter" server/routers.ts`.

- [ ] **Step 5: Commit** — `git add drizzle/schema.ts server/db.ts server/cycle.ts server/routers.ts server/daily-diagnostic.ts tests/cycle-router-access.test.ts tests/daily-diagnostic-excused-option.test.ts && git commit -m "feat(cycle): parity server surface for trpc.cycle.* typing + excused daily-review option"`

---

### Task C4: Excused flag + popup suppression + logout wipe

**Files:**
- Create: `lib/haid-state.ts`
- Modify: `lib/notification-settings.ts:309-324` (`resolveShouldShowPopup`), `lib/auth-context.tsx:133` (wipe), `app/_layout.tsx` (pass the flag at the popup decision; tap routing for the two new types)
- Test: `tests/haid-state.test.ts`, extend the existing `resolveShouldShowPopup` test file (grep `resolveShouldShowPopup` under `tests/`).

**Interfaces (Produces):**
```ts
// lib/haid-state.ts
export function haidExcusedKey(userId: number): string            // `@haid_excused_${userId}`
export function readExcusedState(userId: number): Promise<ExcusedState>   // {excused:false} on any error/missing; expired `until` → {excused:false}
export function writeExcusedState(userId: number, state: ExcusedState): Promise<void>
export function clearExcusedState(userId: number): Promise<void>
export const HAID_NOTIFICATION_TYPES = { purityCheck: "haid_purity_check", ghuslReminder: "haid_ghusl_reminder" } as const
// lib/notification-settings.ts
export function resolveShouldShowPopup(data, displayModes, excused?: boolean): boolean  // excused && category === "prayer" → false
```

- [ ] **Step 1: Failing tests `tests/haid-state.test.ts`:**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
const store = new Map<string, string>();
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn(async (k: string) => store.get(k) ?? null),
    setItem: vi.fn(async (k: string, v: string) => { store.set(k, v); }),
    removeItem: vi.fn(async (k: string) => { store.delete(k); }),
  },
}));
import { haidExcusedKey, readExcusedState, writeExcusedState, clearExcusedState } from "../lib/haid-state";

describe("haid excused flag", () => {
  beforeEach(() => store.clear());
  it("is account-keyed and round-trips", async () => {
    expect(haidExcusedKey(5)).toBe("@haid_excused_5");
    await writeExcusedState(5, { excused: true, until: "2999-01-01" });
    expect(await readExcusedState(5)).toEqual({ excused: true, until: "2999-01-01" });
    expect(await readExcusedState(6)).toEqual({ excused: false });
  });
  it("an expired `until` reads as not excused; clear removes it", async () => {
    await writeExcusedState(5, { excused: true, until: "2000-01-01" });
    expect(await readExcusedState(5)).toEqual({ excused: false });
    await writeExcusedState(5, { excused: true, until: "2999-01-01" });
    await clearExcusedState(5);
    expect(store.has("@haid_excused_5")).toBe(false);
  });
});
```
And in the popup test file:
```ts
it("an excused woman gets no prayer popup, but other categories still show", () => {
  const modes = { prayer: "popup", reminders: "popup", adhkaar: "popup" } as any; // use the real NotifDisplayModes shape from the file
  expect(resolveShouldShowPopup({ type: "prayer" }, modes, true)).toBe(false);
  expect(resolveShouldShowPopup({ type: "prayer" }, modes, false)).toBe(true);
  expect(resolveShouldShowPopup({ type: "test_reminder" }, modes, true)).toBe(true);
});
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement `lib/haid-state.ts`:**

```ts
import AsyncStorage from "@react-native-async-storage/async-storage";
import { isoToday, type ExcusedState } from "./haid";

/** Single source of truth for the key — shared with auth-context's logout wipe (same rule as qasmStorageKey). */
export function haidExcusedKey(userId: number): string {
  return `@haid_excused_${userId}`;
}
export const HAID_NOTIFICATION_TYPES = { purityCheck: "haid_purity_check", ghuslReminder: "haid_ghusl_reminder" } as const;

export async function readExcusedState(userId: number): Promise<ExcusedState> {
  try {
    const raw = await AsyncStorage.getItem(haidExcusedKey(userId));
    if (!raw) return { excused: false };
    const parsed = JSON.parse(raw) as ExcusedState;
    if (parsed?.excused !== true) return { excused: false };
    if (parsed.until && parsed.until < isoToday()) return { excused: false };
    return { excused: true, until: parsed.until };
  } catch {
    return { excused: false };
  }
}
export async function writeExcusedState(userId: number, state: ExcusedState): Promise<void> {
  await AsyncStorage.setItem(haidExcusedKey(userId), JSON.stringify(state));
}
export async function clearExcusedState(userId: number): Promise<void> {
  await AsyncStorage.removeItem(haidExcusedKey(userId));
}
```
`resolveShouldShowPopup`: add a third parameter `excused = false`; after the `test_reminder` early return add `if (excused && category === "prayer") return false;` (place it after `category` is computed). In `app/_layout.tsx`, where the received-notification listener calls `resolveShouldShowPopup(...)` (≈ line 530-541), read the flag first: `const st = user?.id ? await readExcusedState(user.id) : { excused: false }` (the listener callback becomes async) and pass `st.excused`. In the tap listener (≈ line 572), before the generic popup: `if (data.type === HAID_NOTIFICATION_TYPES.purityCheck || data.type === HAID_NOTIFICATION_TYPES.ghuslReminder) { setTimeout(() => router.push("/haid?purityCheck=1" as any), 800); return; }` (mirror how `partner_link` taps are routed to messages in the same handler). In `lib/auth-context.tsx` beside the qasm wipe: `await clearExcusedState(loggedOutUser.id);`.

- [ ] **Step 4: Run → PASS**; `npx tsc --noEmit` clean.

- [ ] **Step 5: Commit** — `git add lib/haid-state.ts tests/haid-state.test.ts lib/notification-settings.ts lib/auth-context.tsx app/_layout.tsx tests/<popup-test-file> && git commit -m "feat(haid): account-keyed excused flag, prayer-popup suppression, tap routing, logout wipe"`

---

### Task C5: Notifications — pause prayers, daily purity check, ghusl reminder (decisions 14, 16)

**Files:**
- Create: `lib/haid-notifications.ts`
- Modify: `lib/notifications.ts` (`scheduleAllNotifications(language, skipPrayersUntil?)` + the inner scheduler skips prayer notifications for dates ≤ `skipPrayersUntil`; adhkaar untouched), `lib/notification-settings.ts` (map the two new types to the `reminders` category in `categoryForType`)
- Test: `tests/haid-notifications.test.ts`

**Interfaces (Produces):**
```ts
export interface HaidSyncInput { userId: number; days: CycleDay[]; settings: CycleSettings; language: "nl" | "en" | "ar"; today?: string }
export function syncHaidNotifications(input: HaidSyncInput): Promise<ExcusedState>
// lib/notifications.ts
export function scheduleAllNotifications(language?: "nl"|"en"|"ar", skipPrayersUntil?: string): Promise<number>
```

- [ ] **Step 1: Failing test `tests/haid-notifications.test.ts`** — mock `expo-notifications` (`scheduleNotificationAsync`, `getAllScheduledNotificationsAsync` → [], `cancelScheduledNotificationAsync`), mock `../lib/notifications` `scheduleAllNotifications` with `vi.fn(async () => 0)`, mock AsyncStorage like C4:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
const scheduled: any[] = [];
vi.mock("expo-notifications", () => ({
  scheduleNotificationAsync: vi.fn(async (req: any) => { scheduled.push(req); return `id${scheduled.length}`; }),
  getAllScheduledNotificationsAsync: vi.fn(async () => []),
  cancelScheduledNotificationAsync: vi.fn(async () => {}),
  SchedulableTriggerInputTypes: { DATE: "date" },
}));
const scheduleAll = vi.fn(async () => 0);
vi.mock("../lib/notifications", () => ({ scheduleAllNotifications: (...a: any[]) => scheduleAll(...a) }));
const store = new Map<string, string>();
vi.mock("@react-native-async-storage/async-storage", () => ({ default: {
  getItem: vi.fn(async (k: string) => store.get(k) ?? null), setItem: vi.fn(async (k: string, v: string) => { store.set(k, v); }), removeItem: vi.fn(async (k: string) => { store.delete(k); }) } }));
import { syncHaidNotifications } from "../lib/haid-notifications";
import { addDays } from "../lib/haid";

describe("syncHaidNotifications", () => {
  beforeEach(() => { scheduled.length = 0; scheduleAll.mockClear(); store.clear(); });
  const today = "2026-09-02";
  const days = [{ date: "2026-09-01", flow: "blood" as const }, { date: today, flow: "blood" as const }];
  const settings = { enabled: true, habitLength: 7, contraception: false, ghuslReminder: true };
  it("excused: pauses prayers until the last excused day, schedules one purity check per excused day and one ghusl reminder", async () => {
    const st = await syncHaidNotifications({ userId: 5, days, settings, language: "ar", today });
    expect(st).toEqual({ excused: true, until: "2026-09-07" });
    expect(scheduleAll).toHaveBeenCalledWith("ar", "2026-09-07");
    const checks = scheduled.filter((r) => r.content.data.type === "haid_purity_check");
    expect(checks).toHaveLength(6); // 02..07 inclusive
    expect(scheduled.filter((r) => r.content.data.type === "haid_ghusl_reminder")).toHaveLength(1);
    expect(store.get("@haid_excused_5")).toContain('"excused":true');
  });
  it("not excused: clears the flag, restores prayers, schedules nothing", async () => {
    const st = await syncHaidNotifications({ userId: 5, days: [], settings, language: "nl", today });
    expect(st).toEqual({ excused: false });
    expect(scheduleAll).toHaveBeenCalledWith("nl", undefined);
    expect(scheduled).toHaveLength(0);
  });
  it("ghusl reminder respects the setting (decision 16 is optional)", async () => {
    await syncHaidNotifications({ userId: 5, days, settings: { ...settings, ghuslReminder: false }, language: "ar", today });
    expect(scheduled.filter((r) => r.content.data.type === "haid_ghusl_reminder")).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement `lib/haid-notifications.ts`:**

```ts
import * as Notifications from "expo-notifications";
import { addDays, classify, excusedState, predict, type CycleDay, type CycleSettings, type ExcusedState, isoToday } from "./haid";
import { HAID_NOTIFICATION_TYPES, writeExcusedState, clearExcusedState } from "./haid-state";
import { scheduleAllNotifications } from "./notifications";

type Lang = "nl" | "en" | "ar";
const tx = (l: Lang, nl: string, en: string, ar: string) => (l === "ar" ? ar : l === "en" ? en : nl);
const OWN_TYPES: string[] = [HAID_NOTIFICATION_TYPES.purityCheck, HAID_NOTIFICATION_TYPES.ghuslReminder];
const HOUR = 8; // local morning

export interface HaidSyncInput { userId: number; days: CycleDay[]; settings: CycleSettings; language: Lang; today?: string }

async function cancelOwn(): Promise<void> {
  const all = await Notifications.getAllScheduledNotificationsAsync();
  for (const n of all) {
    const t = (n.content?.data as any)?.type;
    if (OWN_TYPES.includes(t)) await Notifications.cancelScheduledNotificationAsync(n.identifier);
  }
}
function at(date: string, hour: number): Date {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d, hour, 0, 0);
}

/** Recomputes today's excused state from the raw data, persists the flag, pauses/restores prayers, (re)schedules the purity check + ghusl reminder. */
export async function syncHaidNotifications({ userId, days, settings, language, today = isoToday() }: HaidSyncInput): Promise<ExcusedState> {
  const classified = classify(days, settings, addDays(today, -60), today);
  const prediction = predict(days, settings, today);
  const state = excusedState(classified, prediction, today);
  await cancelOwn();
  if (!state.excused) {
    await clearExcusedState(userId);
    await scheduleAllNotifications(language, undefined);
    return state;
  }
  await writeExcusedState(userId, state);
  await scheduleAllNotifications(language, state.until); // decision 14-أ
  for (let d = today; d <= (state.until ?? today); d = addDays(d, 1)) {
    const when = at(d, HOUR);
    if (when.getTime() <= Date.now()) continue;
    await Notifications.scheduleNotificationAsync({
      content: {
        title: tx(language, "Bent u weer rein?", "Have you become pure?", "هل طهرتِ؟"),
        body: tx(language, "Tik om uw dag bij te werken.", "Tap to update today.", "اضغطي لتحديث حال اليوم."),
        data: { type: HAID_NOTIFICATION_TYPES.purityCheck, url: "/haid?purityCheck=1" },
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: when },
    });
  }
  if (settings.ghuslReminder && prediction.expectedPurity) { // decision 16-أ
    const when = at(prediction.expectedPurity, HOUR);
    if (when.getTime() > Date.now()) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: tx(language, "Verwachte reinheid vandaag", "Expected purity today", "الطهر متوقَّع اليوم"),
          body: tx(language, "Ziet u reinheid? Verricht de ghusl en bid.", "If you see purity, perform ghusl and pray.", "إن رأيتِ الطهر فاغتسلي وصلّي."),
          data: { type: HAID_NOTIFICATION_TYPES.ghuslReminder, url: "/haid" },
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: when },
      });
    }
  }
  return state;
}
```
In `lib/notifications.ts`: change `scheduleAllNotifications(language = "nl", skipPrayersUntil?: string)` → `enqueue(() => scheduleAllNotificationsInner(language, skipPrayersUntil))`; inside the inner function, where each PRAYER notification for a given day is scheduled (the `scheduleNotificationAsync` calls near lines 552/582 with `type: PRAYER_TYPE`), wrap with `if (skipPrayersUntil && dayIso <= skipPrayersUntil) continue;` where `dayIso` is that iteration's `YYYY-MM-DD` (derive it from the same `Date` the loop already builds). Adhkaar scheduling stays. In `lib/notification-settings.ts` `categoryForType`, return `"reminders"` for the two `HAID_NOTIFICATION_TYPES` values. Check the trigger shape used elsewhere in `lib/notifications.ts` (`SchedulableTriggerInputTypes.DATE` vs a plain `{ date }`) and use the same one.

- [ ] **Step 4: Run → PASS**; `npx tsc --noEmit` clean; run the existing notification tests (`npx vitest run tests/notifications.test.ts tests/notification-schedule-overlap.test.ts`) → unchanged results.

- [ ] **Step 5: Commit** — `git add lib/haid-notifications.ts lib/notifications.ts lib/notification-settings.ts tests/haid-notifications.test.ts && git commit -m "feat(haid): pause prayer reminders while excused, daily purity check, ghusl reminder (decisions 14, 16)"`

---

### Task C6: Trilingual text table + tracker screen + family-tab entry

**Files:**
- Create: `lib/haid-text.ts`, `app/haid.tsx`
- Modify: `app/(tabs)/family.tsx` (women's entry card next to the men's قسم card at ~3350)
- Test: `tests/haid-text.test.ts`

**Interfaces (Produces):**
```ts
export function haidText(lang: "nl"|"en"|"ar"): { status: Record<DayStatus, string>; prayer: Record<Rulings["prayer"], string>; fasting: Record<Rulings["fasting"], string>; intercourse: Record<Rulings["intercourse"], string>; ghusl: Record<Rulings["ghusl"], string>; permitted: Record<PermittedKey, string>; notes: Record<NoteKey, string>; advisory: Record<Advisory, string>; flow: Record<Flow, string>; consent: string; fertileWarning: string }
```

- [ ] **Step 1: Failing test `tests/haid-text.test.ts`:**

```ts
import { describe, it, expect } from "vitest";
import { haidText } from "../lib/haid-text";
describe("haidText", () => {
  it("covers every engine enum in all three languages", () => {
    for (const lang of ["nl", "en", "ar"] as const) {
      const t = haidText(lang);
      for (const k of ["haid", "nifas", "istihada", "tuhr_pending_ghusl", "tuhr"]) expect(t.status[k as keyof typeof t.status]).toBeTruthy();
      for (const k of ["quran_recitation", "touching_mushaf", "staying_in_mosque", "dhikr_dua"]) expect(t.permitted[k as keyof typeof t.permitted]).toBeTruthy();
      for (const k of ["kaffarah_info", "istihada_wudu_per_prayer_may_combine", "istihada_intercourse_caution", "prayer_of_this_time_due_after_ghusl", "qadaa_prayer_if_missed_at_onset", "fasting_qadaa_required"]) expect(t.notes[k as keyof typeof t.notes]).toBeTruthy();
      expect(t.consent.length).toBeGreaterThan(20);
    }
  });
});
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Create `lib/haid-text.ts`** (Arabic فصحى; nl/en with the house transliterations):

```ts
import type { Advisory, DayStatus, Flow, NoteKey, PermittedKey, Rulings } from "./haid";
type Lang = "nl" | "en" | "ar";
const t = (l: Lang, nl: string, en: string, ar: string) => (l === "ar" ? ar : l === "en" ? en : nl);

export function haidText(l: Lang) {
  return {
    status: {
      haid: t(l, "Menstruatie (hayd)", "Menses (hayd)", "حيض"),
      nifas: t(l, "Kraambloeding (nifaas)", "Postpartum bleeding (nifaas)", "نفاس"),
      istihada: t(l, "Istihaadah (geen menstruatie)", "Istihaadah (not menses)", "استحاضة"),
      tuhr_pending_ghusl: t(l, "Rein — ghusl nog te doen", "Pure — ghusl still due", "طُهر — الغسل واجب"),
      tuhr: t(l, "Rein", "Pure", "طُهر"),
    } satisfies Record<DayStatus, string>,
    prayer: {
      excused: t(l, "Gebed: vrijgesteld, geen inhaal", "Prayer: excused, no make-up", "الصلاة: ساقطة بلا قضاء"),
      due_after_ghusl: t(l, "Gebed: verplicht na de ghusl", "Prayer: obligatory after ghusl", "الصلاة: واجبة بعد الغسل"),
      obligatory: t(l, "Gebed: verplicht", "Prayer: obligatory", "الصلاة: واجبة"),
    } satisfies Record<Rulings["prayer"], string>,
    fasting: {
      forbidden_qadaa: t(l, "Vasten: niet toegestaan, later inhalen", "Fasting: not allowed, make up later", "الصيام: لا يصحّ، ويُقضى"),
      allowed: t(l, "Vasten: toegestaan", "Fasting: allowed", "الصيام: جائز"),
    } satisfies Record<Rulings["fasting"], string>,
    intercourse: {
      forbidden: t(l, "Gemeenschap: niet toegestaan", "Intercourse: not permitted", "الجماع: لا يحلّ"),
      after_ghusl: t(l, "Gemeenschap: na de ghusl", "Intercourse: after ghusl", "الجماع: بعد الغسل"),
      permitted: t(l, "Gemeenschap: toegestaan", "Intercourse: permitted", "الجماع: يحلّ"),
      permitted_with_note: t(l, "Gemeenschap: toegestaan (zie opmerking)", "Intercourse: permitted (see note)", "الجماع: يحلّ (انظري التنبيه)"),
    } satisfies Record<Rulings["intercourse"], string>,
    ghusl: {
      due: t(l, "Ghusl: verplicht", "Ghusl: due", "الغسل: واجب"),
      none: t(l, "Ghusl: niet vereist", "Ghusl: not required", "الغسل: غير مطلوب"),
    } satisfies Record<Rulings["ghusl"], string>,
    permitted: {
      quran_recitation: t(l, "Qur'aan reciteren", "Reciting the Qur'aan", "قراءة القرآن"),
      touching_mushaf: t(l, "De mushaf aanraken", "Touching the mushaf", "مسّ المصحف"),
      staying_in_mosque: t(l, "In de moskee verblijven", "Staying in the mosque", "المكث في المسجد"),
      dhikr_dua: t(l, "Dhikr en du'aa", "Dhikr and du'aa", "الذكر والدعاء"),
    } satisfies Record<PermittedKey, string>,
    notes: {
      kaffarah_info: t(l, "Wie gemeenschap had tijdens de menstruatie: de overlevering noemt een sadaqah van een dinar of een halve dinar (Aboe Daawoed 264) — ter informatie.", "Intercourse during menses: the narration mentions a charity of a dinar or half a dinar (Abu Dawud 264) — for information.", "من جامع في الحيض: ورد في الحديث التصدق بدينار أو نصف دينار [أبو داود ٢٦٤] — للعلم لا للإلزام."),
      istihada_wudu_per_prayer_may_combine: t(l, "Woedoe' voor elk verplicht gebed; twee gebeden mogen met één woedoe' worden samengevoegd.", "Wudu' for each obligatory prayer; two prayers may be combined with one wudu'.", "الوضوء لكل فريضة، ويجوز الجمع بين صلاتين بوضوء واحد."),
      istihada_intercourse_caution: t(l, "Gemeenschap is toegestaan; houd rekening met het aanhoudende bloed.", "Intercourse is permitted; be mindful of the continuing bleeding.", "الجماع مباح مع مراعاة استمرار الدم."),
      prayer_of_this_time_due_after_ghusl: t(l, "Het gebed van dit tijdstip is verplicht na de ghusl (alleen dit gebed).", "The prayer of this time is due after ghusl (this prayer only).", "صلاة هذا الوقت واجبة بعد الغسل (هذه الصلاة وحدها)."),
      qadaa_prayer_if_missed_at_onset: t(l, "Had u het gebed van het tijdstip waarop het bloed begon nog niet verricht, haal het dan in na de reinheid.", "If you had not yet prayed the prayer of the time the bleeding began, make it up after purity.", "إن لم تكوني صلّيتِ صلاة الوقت الذي نزل فيه الدم فاقضيها بعد الطهر."),
      fasting_qadaa_required: t(l, "Gemiste vastendagen van Ramadaan worden later ingehaald.", "Missed Ramadaan fasts are made up later.", "أيام رمضان تُقضى بعد الطهر."),
    } satisfies Record<NoteKey, string>,
    advisory: {
      see_doctor: t(l, "Bloeding langer dan 15 dagen: raadpleeg een arts (medisch advies, geen oordeel).", "Bleeding beyond 15 days: see a doctor (medical advice, not a ruling).", "استمرار الدم أكثر من ١٥ يومًا: راجعي الطبيب (تنبيه طبي لا حكم)."),
      bleeding_in_pregnancy: t(l, "Bloedverlies tijdens zwangerschap: raadpleeg direct een arts.", "Bleeding during pregnancy: see a doctor promptly.", "نزول الدم أثناء الحمل: راجعي الطبيب فورًا."),
    } satisfies Record<Advisory, string>,
    flow: {
      blood: t(l, "Bloed", "Blood", "نزل الدم"),
      spotting: t(l, "Geel/bruin (safraa/kudrah)", "Yellow/brown (safra/kudra)", "صفرة أو كدرة"),
      dry: t(l, "Gestopt / droog", "Stopped / dry", "انقطع الدم"),
    } satisfies Record<Flow, string>,
    consent: t(l,
      "Uw aan uw account gekoppelde echtgenoot ziet al deze gegevens. Door in te schakelen geeft u daar toestemming voor; uitschakelen verwijdert de gegevens.",
      "The husband linked to your account sees all of this data. Enabling gives that permission; disabling deletes the data.",
      "زوجكِ المرتبط بحسابكِ يرى هذه البيانات كلها. بتفعيل الميزة تأذنين بذلك، وإيقافها يحذف البيانات."),
    fertileWarning: t(l, "Schatting op basis van eerdere cycli — niet betrouwbaar om zwangerschap te voorkomen.", "An estimate from previous cycles — not reliable for preventing pregnancy.", "تقدير مبني على الدورات السابقة، ولا يُعتمد عليه لمنع الحمل."),
  };
}
```

- [ ] **Step 4: Run → PASS; commit** — `git add lib/haid-text.ts tests/haid-text.test.ts && git commit -m "feat(haid): trilingual text table for engine enums"`

- [ ] **Step 5: Create `app/haid.tsx`** (women only; same hooks as `app/qasm.tsx`):

```tsx
import { useEffect, useMemo, useState } from "react";
import { View, Text, ScrollView, Pressable, ActivityIndicator, TextInput, Switch, Alert } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useColors } from "@/hooks/use-colors";
import { useI18n } from "@/lib/i18n";
import { useAppState } from "@/lib/app-context";
import { useAuth } from "@/hooks/use-auth";
import { trpc } from "@/lib/trpc";
import { getIslamicDate } from "@/lib/prayer-data";
import { addDays, classify, isoToday, predict, ramadanQadaaDays, rulingsFor, DEFAULT_SETTINGS, type CycleDay, type CycleSettings, type DayStatus, type Flow } from "@/lib/haid";
import { haidText } from "@/lib/haid-text";
import { syncHaidNotifications } from "@/lib/haid-notifications";

type Lang = "nl" | "en" | "ar";
const tx = (l: Lang, nl: string, en: string, ar: string) => (l === "ar" ? ar : l === "en" ? en : nl);
const STATUS_COLOR: Record<DayStatus, string> = { haid: "#DC2626", nifas: "#B45309", istihada: "#7C3AED", tuhr_pending_ghusl: "#0EA5E9", tuhr: "transparent" };

function monthGrid(monthStart: string): string[] {
  const [y, m] = monthStart.split("-").map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  return Array.from({ length: daysInMonth }, (_, i) => addDays(monthStart, i));
}

/**
 * Private women's tracker. Data lives on the server (trpc.cycle.*) so her
 * confirmed husband can read it (decision 15); every rule comes from lib/haid.ts.
 */
export default function HaidScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const { language, isRTL } = useI18n();
  const lang = language as Lang;
  const T = haidText(lang);
  const { state } = useAppState();
  const { user, isAuthenticated } = useAuth();
  const params = useLocalSearchParams<{ purityCheck?: string }>();
  const isWoman = state.parentProfile.gender === "vrouw";
  const utils = trpc.useUtils();

  useEffect(() => { if (isAuthenticated && !isWoman) router.replace("/(tabs)/family" as any); }, [isAuthenticated, isWoman, router]);

  const q = trpc.cycle.getMine.useQuery(undefined, { enabled: isAuthenticated && isWoman });
  const invalidate = () => utils.cycle.getMine.invalidate();
  const upsertDay = trpc.cycle.upsertDay.useMutation({ onSuccess: invalidate });
  const deleteDay = trpc.cycle.deleteDay.useMutation({ onSuccess: invalidate });
  const saveSettings = trpc.cycle.saveSettings.useMutation({ onSuccess: invalidate });
  const disable = trpc.cycle.disable.useMutation({ onSuccess: invalidate });

  const days: CycleDay[] = useMemo(() => (q.data?.days ?? []).map((d) => ({ date: d.date, flow: d.flow as Flow, color: d.color as CycleDay["color"], ghusl: d.ghusl, note: d.note })), [q.data]);
  const settings: CycleSettings = useMemo(() => ({ ...DEFAULT_SETTINGS, ...(q.data?.settings ?? {}), enabled: !!q.data?.enabled }), [q.data]);

  const today = isoToday();
  const [selected, setSelected] = useState(today);
  const [monthStart, setMonthStart] = useState(today.slice(0, 7) + "-01");
  const [showSettings, setShowSettings] = useState(false);

  const classified = useMemo(() => classify(days, settings, addDays(today, -400), addDays(today, 45)), [days, settings, today]);
  const byDate = useMemo(() => new Map(classified.map((c) => [c.date, c])), [classified]);
  const prediction = useMemo(() => predict(days, settings, today), [days, settings, today]);
  const todayCls = byDate.get(today)!;
  const selectedCls = byDate.get(selected) ?? todayCls;
  const rulings = rulingsFor(selectedCls);
  const ramadan = useMemo(() => ramadanQadaaDays(classified.filter((c) => c.date <= today), (d) => { const h = getIslamicDate(new Date(`${d}T12:00:00`), null); return { month: h.month, year: h.year }; }), [classified, today]);

  useEffect(() => {
    if (!q.data || !user?.id || !settings.enabled) return;
    syncHaidNotifications({ userId: user.id, days, settings, language: lang }).catch(() => {});
  }, [q.data, user?.id, settings, days, lang]);

  const log = (flow: Flow, extra: Partial<CycleDay> = {}) => upsertDay.mutate({ date: selected, flow, color: extra.color ?? null, ghusl: extra.ghusl ?? false });

  if (!isAuthenticated || !isWoman) return null;
  if (q.isLoading) return <View style={{ flex: 1, justifyContent: "center" }}><ActivityIndicator /></View>;

  const card = { backgroundColor: colors.surface, borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: colors.border } as const;
  const align = { textAlign: isRTL ? ("right" as const) : ("left" as const) };
  const label = (s: string) => <Text style={[{ color: colors.foreground, fontSize: 14, marginBottom: 4 }, align]}>{s}</Text>;

  if (!settings.enabled) {
    return (
      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: insets.top + 12 }} style={{ backgroundColor: colors.background }}>
        <Text style={[{ color: colors.foreground, fontSize: 20, fontWeight: "700", marginBottom: 12 }, align]}>{tx(lang, "Menstruatie en reinheid", "Menses and purity", "متابعة الحيض والطهر")}</Text>
        <View style={card}>{label(T.consent)}</View>
        <Pressable onPress={() => saveSettings.mutate({ enabled: true })} disabled={saveSettings.isPending} style={{ backgroundColor: colors.primary, padding: 14, borderRadius: 10, alignItems: "center" }}>
          <Text style={{ color: "#FFF", fontWeight: "700" }}>{tx(lang, "Inschakelen", "Enable", "تفعيل")}</Text>
        </Pressable>
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingTop: insets.top + 12, paddingBottom: 40 }} style={{ backgroundColor: colors.background }}>
      <View style={{ flexDirection: isRTL ? "row-reverse" : "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <Text style={{ color: colors.foreground, fontSize: 20, fontWeight: "700" }}>{tx(lang, "Menstruatie en reinheid", "Menses and purity", "متابعة الحيض والطهر")}</Text>
        <Pressable onPress={() => setShowSettings((v) => !v)} hitSlop={10}><MaterialIcons name="settings" size={22} color={colors.muted} /></Pressable>
      </View>

      {params.purityCheck === "1" && todayCls.status !== "tuhr" && (
        <View style={[card, { borderColor: colors.primary }]}>
          {label(tx(lang, "Bent u weer rein?", "Have you become pure?", "هل طهرتِ؟"))}
          <Pressable onPress={() => { setSelected(today); upsertDay.mutate({ date: today, flow: "dry" }); }} style={{ backgroundColor: colors.primary, padding: 10, borderRadius: 8, alignItems: "center" }}>
            <Text style={{ color: "#FFF", fontWeight: "700" }}>{tx(lang, "Ja, ik ben rein", "Yes, I am pure", "نعم، طهرتُ")}</Text>
          </Pressable>
        </View>
      )}

      {/* Today / selected day */}
      <View style={card}>
        <Text style={[{ color: STATUS_COLOR[selectedCls.status] === "transparent" ? colors.foreground : STATUS_COLOR[selectedCls.status], fontSize: 17, fontWeight: "700", marginBottom: 6 }, align]}>
          {selected === today ? tx(lang, "Vandaag", "Today", "اليوم") : selected} — {T.status[selectedCls.status]}{selectedCls.runDay ? ` (${tx(lang, "dag", "day", "اليوم")} ${selectedCls.runDay})` : ""}
        </Text>
        {label(T.prayer[rulings.prayer])}{label(T.fasting[rulings.fasting])}{label(T.intercourse[rulings.intercourse])}{label(T.ghusl[rulings.ghusl])}
        {rulings.permitted.length > 0 && label(tx(lang, "Toegestaan: ", "Permitted: ", "مباح: ") + rulings.permitted.map((k) => T.permitted[k]).join("، "))}
        {rulings.notes.map((n) => <Text key={n} style={[{ color: colors.muted, fontSize: 12, marginTop: 4 }, align]}>• {T.notes[n]}</Text>)}
        {selectedCls.advisories.map((a) => <Text key={a} style={[{ color: "#B45309", fontSize: 12, marginTop: 4 }, align]}>⚠ {T.advisory[a]}</Text>)}
      </View>

      {/* Quick log for the selected day */}
      <View style={card}>
        {label(tx(lang, "Registreren voor", "Log for", "تسجيل ليوم") + " " + selected)}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {(["blood", "spotting", "dry"] as Flow[]).map((f) => (
            <Pressable key={f} onPress={() => log(f)} style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12 }}>
              <Text style={{ color: colors.foreground }}>{T.flow[f]}</Text>
            </Pressable>
          ))}
          <Pressable onPress={() => log("blood", { color: "black" })} style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12 }}><Text style={{ color: colors.foreground }}>{tx(lang, "Bloed — zwart/dik", "Blood — black/thick", "دم أسود ثخين")}</Text></Pressable>
          <Pressable onPress={() => log("blood", { color: "red" })} style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12 }}><Text style={{ color: colors.foreground }}>{tx(lang, "Bloed — rood/dun", "Blood — red/thin", "دم أحمر رقيق")}</Text></Pressable>
          <Pressable onPress={() => log((byDate.get(selected) && days.find((d) => d.date === selected)?.flow) || "dry", { ghusl: true })} style={{ borderWidth: 1, borderColor: colors.primary, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12 }}><Text style={{ color: colors.primary }}>{tx(lang, "Ghusl gedaan", "Ghusl done", "اغتسلتُ")}</Text></Pressable>
          {days.some((d) => d.date === selected) && (
            <Pressable onPress={() => deleteDay.mutate({ date: selected })} style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12 }}><Text style={{ color: colors.muted }}>{tx(lang, "Wissen", "Clear", "مسح")}</Text></Pressable>
          )}
        </View>
      </View>

      {/* Month grid */}
      <View style={card}>
        <View style={{ flexDirection: isRTL ? "row-reverse" : "row", justifyContent: "space-between", marginBottom: 8 }}>
          <Pressable onPress={() => setMonthStart(addDays(monthStart, -1).slice(0, 7) + "-01")}><MaterialIcons name={isRTL ? "chevron-right" : "chevron-left"} size={22} color={colors.foreground} /></Pressable>
          <Text style={{ color: colors.foreground, fontWeight: "700" }}>{monthStart.slice(0, 7)}</Text>
          <Pressable onPress={() => setMonthStart(addDays(monthStart, 32).slice(0, 7) + "-01")}><MaterialIcons name={isRTL ? "chevron-left" : "chevron-right"} size={22} color={colors.foreground} /></Pressable>
        </View>
        <View style={{ flexDirection: isRTL ? "row-reverse" : "row", flexWrap: "wrap" }}>
          {monthGrid(monthStart).map((d) => {
            const c = byDate.get(d);
            const bg = c ? STATUS_COLOR[c.status] : "transparent";
            const isSel = d === selected;
            return (
              <Pressable key={d} onPress={() => setSelected(d)} style={{ width: "14.28%", aspectRatio: 1, alignItems: "center", justifyContent: "center" }}>
                <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: bg === "transparent" ? undefined : bg + "33", borderWidth: isSel ? 2 : d === today ? 1 : 0, borderColor: colors.primary, alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ color: colors.foreground, fontSize: 12 }}>{Number(d.slice(8))}</Text>
                  {d > today && prediction.fertile && d >= prediction.fertile[0] && d <= prediction.fertile[1] && <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: "#16A34A", position: "absolute", bottom: 3 }} />}
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Predictions */}
      <View style={card}>
        {label(tx(lang, "Verwachtingen", "Predictions", "التقديرات"))}
        {prediction.expectedPurity && label(tx(lang, "Verwachte reinheid: ", "Expected purity: ", "الطهر المتوقَّع: ") + prediction.expectedPurity)}
        {prediction.nextStart && label(tx(lang, "Volgende menstruatie: ", "Next period: ", "الحيضة القادمة: ") + prediction.nextStart)}
        {prediction.fertile && label(tx(lang, "Vruchtbare dagen: ", "Fertile days: ", "أيام الخصوبة: ") + `${prediction.fertile[0]} — ${prediction.fertile[1]}`)}
        <Text style={[{ color: colors.muted, fontSize: 12 }, align]}>⚠ {T.fertileWarning}</Text>
        {ramadan && label(tx(lang, "In te halen Ramadaan-dagen: ", "Ramadaan days to make up: ", "أيام قضاء رمضان: ") + `${ramadan.days} (${ramadan.year})`)}
        <Pressable onPress={() => router.push("/(tabs)/dhikri" as any)}><Text style={[{ color: colors.primary, marginTop: 6 }, align]}>{tx(lang, "Adhkaar voor de menstruerende vrouw →", "Adhkaar for the menstruating woman →", "أذكار الحائض والنفساء ←")}</Text></Pressable>
      </View>

      {showSettings && <SettingsCard settings={settings} lang={lang} colors={colors} align={align} onSave={(p) => saveSettings.mutate(p)} onDisable={() => Alert.alert(tx(lang, "Uitschakelen?", "Disable?", "إيقاف الميزة؟"), T.consent, [{ text: tx(lang, "Annuleren", "Cancel", "إلغاء") }, { text: tx(lang, "Uitschakelen en wissen", "Disable and delete", "إيقاف وحذف"), style: "destructive", onPress: () => disable.mutate() }])} />}
    </ScrollView>
  );
}

function SettingsCard({ settings, lang, colors, align, onSave, onDisable }: { settings: CycleSettings; lang: Lang; colors: ReturnType<typeof useColors>; align: { textAlign: "left" | "right" }; onSave: (p: Partial<CycleSettings>) => void; onDisable: () => void }) {
  const [habit, setHabit] = useState(settings.habitLength ? String(settings.habitLength) : "");
  const [cycle, setCycle] = useState(settings.cycleLength ? String(settings.cycleLength) : "");
  const [pregnant, setPregnant] = useState(settings.pregnantSince ?? "");
  const [birth, setBirth] = useState(settings.birthDate ?? "");
  const [misc, setMisc] = useState(settings.miscarriageDate ?? "");
  const [gest, setGest] = useState(settings.gestationDays ? String(settings.gestationDays) : "");
  const [contra, setContra] = useState(settings.contraception);
  const [ghuslRem, setGhuslRem] = useState(settings.ghuslReminder);
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  const num = (s: string) => (s.trim() === "" ? null : Number(s));
  const field = (labelText: string, value: string, set: (v: string) => void, placeholder: string) => (
    <View style={{ marginBottom: 8 }}>
      <Text style={[{ color: colors.muted, fontSize: 12 }, align]}>{labelText}</Text>
      <TextInput value={value} onChangeText={set} placeholder={placeholder} placeholderTextColor={colors.muted} style={[{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 8, color: colors.foreground }, align]} />
    </View>
  );
  const save = () => {
    for (const d of [pregnant, birth, misc]) if (d && !iso.test(d)) { Alert.alert(tx(lang, "Datum als JJJJ-MM-DD", "Date as YYYY-MM-DD", "التاريخ بصيغة سنة-شهر-يوم")); return; }
    onSave({ habitLength: num(habit), cycleLength: num(cycle), pregnantSince: pregnant || null, birthDate: birth || null, miscarriageDate: misc || null, gestationDays: num(gest), contraception: contra, ghuslReminder: ghuslRem });
  };
  return (
    <View style={{ backgroundColor: colors.surface, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: colors.border }}>
      {field(tx(lang, "Gewoonte (dagen menstruatie; leeg = automatisch)", "Habit (menses days; empty = learned)", "العادة (أيام الحيض؛ فارغ = تلقائي)"), habit, setHabit, "7")}
      {field(tx(lang, "Cycluslengte (dagen; leeg = automatisch)", "Cycle length (days; empty = learned)", "طول الدورة (أيام؛ فارغ = تلقائي)"), cycle, setCycle, "28")}
      {field(tx(lang, "Zwanger sinds", "Pregnant since", "حامل منذ"), pregnant, setPregnant, "YYYY-MM-DD")}
      {field(tx(lang, "Bevallingsdatum", "Birth date", "تاريخ الولادة"), birth, setBirth, "YYYY-MM-DD")}
      {field(tx(lang, "Miskraam op", "Miscarriage on", "تاريخ الإسقاط"), misc, setMisc, "YYYY-MM-DD")}
      {field(tx(lang, "Zwangerschapsduur bij miskraam (dagen)", "Gestation at miscarriage (days)", "عمر الحمل عند الإسقاط (أيام)"), gest, setGest, "120")}
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}><Text style={{ color: colors.foreground }}>{tx(lang, "Anticonceptie", "Contraception", "موانع الحمل")}</Text><Switch value={contra} onValueChange={setContra} /></View>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}><Text style={{ color: colors.foreground }}>{tx(lang, "Herinnering aan ghusl", "Ghusl reminder", "تذكير بالغسل")}</Text><Switch value={ghuslRem} onValueChange={setGhuslRem} /></View>
      <Pressable onPress={save} style={{ backgroundColor: colors.primary, padding: 12, borderRadius: 8, alignItems: "center", marginBottom: 8 }}><Text style={{ color: "#FFF", fontWeight: "700" }}>{tx(lang, "Opslaan", "Save", "حفظ")}</Text></Pressable>
      <Pressable onPress={onDisable} style={{ padding: 10, alignItems: "center" }}><Text style={{ color: "#DC2626" }}>{tx(lang, "Uitschakelen en gegevens wissen", "Disable and delete data", "إيقاف الميزة وحذف البيانات")}</Text></Pressable>
    </View>
  );
}
```
Read `hooks/use-colors.ts` for the real token names (`primary`, `surface`, `border`, `muted`, `foreground`, `background`) and adjust. Also register the route the way `app/qasm.tsx` is registered if the router needs it (expo-router file routing: `app/haid.tsx` → `/haid`, no registration).

- [ ] **Step 6: Family-tab entry** — in `app/(tabs)/family.tsx`, next to the men's قسم card (~line 3350, gated on men), add a women's card gated on `state.parentProfile.gender === "vrouw"`:

```tsx
{state.parentProfile.gender === "vrouw" && (
  <Pressable onPress={() => router.push("/haid" as any)} style={/* copy the qasm card style */}>
    <MaterialIcons name="favorite-border" size={22} color={colors.primary} />
    <Text style={/* copy */}>{tx(lang, "Menstruatie en reinheid", "Menses and purity", "متابعة الحيض والطهر")}</Text>
    <Text style={/* copy the subtitle style */}>{tx(lang, "Privé — alleen u en uw echtgenoot", "Private — only you and your husband", "خاص — لكِ ولزوجكِ فقط")}</Text>
  </Pressable>
)}
```

- [ ] **Step 7: `npx tsc --noEmit` clean; commit** — `git add app/haid.tsx 'app/(tabs)/family.tsx' && git commit -m "feat(haid): tracker screen (consent, today rulings, quick log, month grid, predictions, settings) + family-tab entry"`

---

### Task C7: «أنا حائض» on the prayer popup (decision 13-ب, popup half)

**Files:**
- Modify: `components/prayer-popup-modal.tsx` (buttons at `:113-146`)
- Test: `tests/prayer-popup-haid.test.ts`

- [ ] **Step 1: Failing test** — a source-level guard (this component's existing tests, if any, follow the same style; check `tests/` for `prayer-popup`):

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
describe("prayer popup — haid button", () => {
  const src = readFileSync("components/prayer-popup-modal.tsx", "utf8");
  it("renders «أنا حائض» only for women and logs today as blood", () => {
    expect(src).toContain('gender === "vrouw"');
    expect(src).toContain("أنا حائض");
    expect(src).toContain("trpc.cycle.upsertDay");
    expect(src).toContain("writeExcusedState");
  });
});
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement** — in `PrayerPopupModal`: import `useAppState` from `@/lib/app-context`, `useAuth` from `@/hooks/use-auth`, `trpc` from `@/lib/trpc`, `writeExcusedState` from `@/lib/haid-state`, `isoToday` from `@/lib/haid`. Inside the component:

```tsx
const { state } = useAppState();
const { user } = useAuth();
const isWoman = state.parentProfile.gender === "vrouw";
const utils = trpc.useUtils();
const markHaid = trpc.cycle.upsertDay.useMutation({ onSuccess: () => utils.cycle.getMine.invalidate() });
const handleHaid = () => {
  if (user?.id) writeExcusedState(user.id, { excused: true, until: isoToday() }).catch(() => {}); // suppress today immediately; the tracker sync extends it after the fetch
  markHaid.mutate({ date: isoToday(), flow: "blood" });
  if (followUpTimer.current) clearTimeout(followUpTimer.current); // use the component's real timer ref name
  onDismiss();
};
```
and render, in BOTH button groups (initial and follow-up), after the existing two buttons:
```tsx
{isWoman && (
  <Pressable onPress={handleHaid} style={({ pressed }) => [st.secondaryButton, pressed && { opacity: 0.85 }]}>
    <MaterialIcons name="favorite-border" size={18} color="#4B5563" />
    <Text style={st.secondaryButtonText}>أنا حائض</Text>
  </Pressable>
)}
```
Keep the button Arabic-only like its siblings (this modal is hardcoded Arabic).

- [ ] **Step 4: Run → PASS; `npx tsc --noEmit` clean.**
- [ ] **Step 5: Commit** — `git add components/prayer-popup-modal.tsx tests/prayer-popup-haid.test.ts && git commit -m "feat(haid): «أنا حائض» on the prayer popup logs today and silences it"`

---

### Task C8: Husband's read-only status in each wife's panel (decision 15)

**Files:**
- Create: `components/wife-cycle-status.tsx`
- Modify: `app/(tabs)/messages.tsx` — inside `WifePermissionsPanel` (defined at `:856`), render `<WifeCycleStatus wifeId={wife.id} expanded={expanded} />` under the permission toggles.
- Test: `tests/wife-cycle-status.test.ts`

- [ ] **Step 1: Failing source-guard test:**

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
describe("husband's wife-cycle status", () => {
  it("is mounted per wife inside WifePermissionsPanel and reads only trpc.cycle.getPartner", () => {
    const panel = readFileSync("app/(tabs)/messages.tsx", "utf8");
    expect(panel).toContain("<WifeCycleStatus");
    const comp = readFileSync("components/wife-cycle-status.tsx", "utf8");
    expect(comp).toContain("trpc.cycle.getPartner");
    expect(comp).not.toContain("trpc.cycle.getMine");
    expect(comp).toContain("classify(");
  });
});
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Create `components/wife-cycle-status.tsx`:**

```tsx
import { useMemo } from "react";
import { View, Text } from "react-native";
import { useColors } from "@/hooks/use-colors";
import { useI18n } from "@/lib/i18n";
import { trpc } from "@/lib/trpc";
import { addDays, classify, isoToday, predict, rulingsFor, DEFAULT_SETTINGS, type CycleDay, type CycleSettings, type Flow } from "@/lib/haid";
import { haidText } from "@/lib/haid-text";

type Lang = "nl" | "en" | "ar";
const tx = (l: Lang, nl: string, en: string, ar: string) => (l === "ar" ? ar : l === "en" ? en : nl);

/** Husband-side, per wife. Server gate: active confirmed partnership only (INV-1/INV-4). */
export function WifeCycleStatus({ wifeId, expanded }: { wifeId: number; expanded: boolean }) {
  const colors = useColors();
  const { language, isRTL } = useI18n();
  const lang = language as Lang;
  const T = haidText(lang);
  const q = trpc.cycle.getPartner.useQuery({ partnerId: wifeId }, { enabled: expanded, staleTime: 60_000 });
  const today = isoToday();
  const view = useMemo(() => {
    if (!q.data?.enabled) return null;
    const days: CycleDay[] = q.data.days.map((d) => ({ date: d.date, flow: d.flow as Flow, color: d.color as CycleDay["color"], ghusl: d.ghusl }));
    const settings: CycleSettings = { ...DEFAULT_SETTINGS, ...(q.data.settings ?? {}), enabled: true };
    const cls = classify(days, settings, addDays(today, -60), today);
    const t = cls[cls.length - 1];
    return { t, r: rulingsFor(t), p: predict(days, settings, today) };
  }, [q.data, today]);
  if (!expanded || !view) return null;
  const align = { textAlign: isRTL ? ("right" as const) : ("left" as const) };
  const line = (s: string) => <Text style={[{ color: colors.foreground, fontSize: 12, marginTop: 2 }, align]}>{s}</Text>;
  return (
    <View style={{ marginTop: 10, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }}>
      <Text style={[{ color: colors.foreground, fontWeight: "700", fontSize: 13 }, align]}>{tx(lang, "Haar toestand vandaag", "Her state today", "حالها اليوم")}: {T.status[view.t.status]}</Text>
      {line(T.intercourse[view.r.intercourse])}
      {view.p.expectedPurity && line(tx(lang, "Verwachte reinheid: ", "Expected purity: ", "الطهر المتوقَّع: ") + view.p.expectedPurity)}
      {view.p.nextStart && line(tx(lang, "Volgende menstruatie: ", "Next period: ", "الحيضة القادمة: ") + view.p.nextStart)}
      {view.p.fertile && line(tx(lang, "Vruchtbare dagen: ", "Fertile days: ", "أيام الخصوبة: ") + `${view.p.fertile[0]} — ${view.p.fertile[1]}`)}
    </View>
  );
}
```
Mount it in `WifePermissionsPanel` (read the panel's props to get the wife id and `expanded` variable names).

- [ ] **Step 4: Run → PASS; `npx tsc --noEmit` clean.**
- [ ] **Step 5: Commit** — `git add components/wife-cycle-status.tsx 'app/(tabs)/messages.tsx' tests/wife-cycle-status.test.ts && git commit -m "feat(haid): husband sees his wife's status in her panel (decision 15)"`

---

### Task C9: Daily review «معذورة اليوم» logs the day (decision 13-ب, card half)

**Files:**
- Modify: `components/daily-diagnostic-card.tsx` (submit handler at `:267-274`)
- Test: `tests/daily-diagnostic-excused-hook.test.ts`

- [ ] **Step 1: Failing source-guard test:**

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
it("submitting the excused prayer answer logs today as blood only when no entry exists", () => {
  const src = readFileSync("components/daily-diagnostic-card.tsx", "utf8");
  expect(src).toContain('kind === "excused"');
  expect(src).toContain("trpc.cycle.upsertDay");
  expect(src).toContain("trpc.cycle.getMine");
});
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement** — the card already knows `questions` and `selected`. Add:

```tsx
const isWoman = state.parentProfile.gender === "vrouw"; // useAppState() is available in this component tree; import it if the card lacks it
const mine = trpc.cycle.getMine.useQuery(undefined, { enabled: isWoman });
const logBlood = trpc.cycle.upsertDay.useMutation({ onSuccess: () => utils.cycle.getMine.invalidate() });
```
and in the submit `onPress`, before `submitMutation.mutate(...)`:
```tsx
const prayerQ = questions.find((q) => q.category === "prayer");
const chosen = prayerQ?.options.find((o) => o.label === selected.prayer?.label);
if (isWoman && chosen?.kind === "excused" && !mine.data?.days?.some((d) => d.date === date)) {
  logBlood.mutate({ date, flow: "blood" });
}
```
Adapt `selected.prayer` to the card's real selection shape (`selected[q.category]`).

- [ ] **Step 4: Run → PASS; `npx tsc --noEmit` clean.**
- [ ] **Step 5: Commit** — `git add components/daily-diagnostic-card.tsx tests/daily-diagnostic-excused-hook.test.ts && git commit -m "feat(haid): daily-review excused answer seeds the tracker"`

---

### Task C10: Integration gate

- [ ] `npx tsc --noEmit` → no output.
- [ ] `npx vitest run 2>&1 | tail -5` → failed count still 26 (the pre-existing env set) and the new tests all pass; paste the tail.
- [ ] `git log --oneline main..HEAD` lists C1–C9 commits (plus the spec/plan commits).
- [ ] Report literal outputs. Do not push, build, or deploy.

---

### Task C11: Co-wife visibility UI (spec `docs/superpowers/specs/2026-09-02-cowife-visibility-design.md`)

**Files:**
- Modify: `drizzle/schema.ts` (parity: `coWivesVisible` on `partnerships`), `server/db.ts` + `server/routers.ts` (parity copy of server-plan S6 Step 3, dialect-agnostic as written), `app/(tabs)/messages.tsx`
- Test: `tests/cowife-visibility-ui.test.ts` (source guard) + `tests/cowife-visibility.test.ts` (parity copy of S6 Step 2)

- [ ] **Step 1: Parity server surface** — copy S6 (schema column with `boolean("coWivesVisible").notNull().default(false)` in mysql-core, db functions, router procedures, tests). `npx tsc --noEmit` clean.

- [ ] **Step 2: Failing UI source-guard test:**
```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
describe("co-wife visibility UI", () => {
  const src = readFileSync("app/(tabs)/messages.tsx", "utf8");
  it("husband has the switch; wife has a names-only list with the co-wife badge", () => {
    expect(src).toContain("trpc.links.coWivesVisibility");
    expect(src).toContain("trpc.links.setCoWivesVisible");
    expect(src).toContain("trpc.links.coWives");
    expect(src).toContain("الأخت الشريكة");
    expect(src).toContain("السماح لزوجاتي بمعرفة بعضهن");
  });
});
```

- [ ] **Step 3: Implement in `app/(tabs)/messages.tsx`** (أسرتي section, next to the per-wife panels / partner cards):
```tsx
// husband: switch (render where knownToBeMan)
const coWivesVis = trpc.links.coWivesVisibility.useQuery(undefined, { enabled: isAuthenticated && knownToBeMan });
const setCoWivesVis = trpc.links.setCoWivesVisible.useMutation({ onSuccess: () => { utils.links.coWivesVisibility.invalidate(); utils.links.coWives.invalidate(); } });
// ...
{knownToBeMan && (
  <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 8 }}>
    <Text style={{ color: colors.foreground, flex: 1 }}>{tx(lang, "Mijn echtgenotes mogen elkaars naam zien", "Let my wives see each other's names", "السماح لزوجاتي بمعرفة بعضهن (بالاسم فقط)")}</Text>
    <Switch value={!!coWivesVis.data?.visible} disabled={setCoWivesVis.isPending} onValueChange={(v) => setCoWivesVis.mutate({ visible: v })} />
  </View>
)}
// wife: names-only list (render where the viewer is a woman)
const coWives = trpc.links.coWives.useQuery(undefined, { enabled: isAuthenticated && userGender === "vrouw" });
{userGender === "vrouw" && (coWives.data?.length ?? 0) > 0 && (
  <View style={{ marginTop: 12 }}>
    <Text style={/* section header style used for "Partner" */}>{tx(lang, "Mede-echtgenotes", "Co-wives", "الأخوات الشريكات")}</Text>
    {coWives.data!.map((w) => (
      <View key={w.id} style={/* partner card style */}>
        <Text style={/* name style */}>{w.name || tx(lang, "Mede-echtgenote", "Co-wife", "الأخت الشريكة")}</Text>
        <Text style={/* badge style */}>{tx(lang, "Mede-echtgenote", "Co-wife", "الأخت الشريكة")}</Text>
      </View>
    ))}
  </View>
)}
```
Import `Switch` from react-native if not already imported. No chat button, no navigation, no children under a co-wife.

- [ ] **Step 4: Run → PASS; `npx tsc --noEmit` clean; commit** `feat(links): co-wife names visible only when the husband allows it`.
