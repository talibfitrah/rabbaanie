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
  const qualifyingMiscarriage = (s.gestationDays ?? 0) >= MISCARRIAGE_NIFAS_MIN_GESTATION ? s.miscarriageDate : null;
  const ends = [s.birthDate, qualifyingMiscarriage].filter((x): x is string => !!x).sort();
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
      if (nifasDayOf(settings, date) !== null) status = "nifas"; // decision 10-أ: labour blood wins over "still pregnant"
      else if (isPregnant(settings, date)) {
        status = "istihada";
        advisories.push("bleeding_in_pregnancy");
      } else if (startedInNifas) status = "istihada"; // continuation past day 40 (his book: يُنظر فيه → استحاضة absent a habit match)
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
