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

interface BloodRunsOptions {
  /** Bounds the item E-2 extension below; omit for the unextended runs LEARNING uses. */
  today?: string;
  /** Last day the LAST run may be assumed to extend through, given its start date. */
  capOf?: (runStart: string) => string;
}

/**
 * Maximal groups of blood days where at most ONE non-blood day separates
 * neighbours (decision 4). With `opts.today`, the LAST run is also extended
 * (item E-2) through trailing days that have NO entry at all — she has not
 * logged today yet, so the bleeding is assumed to continue — up to
 * `min(opts.today, opts.capOf(start))`. An explicit entry (dry/spotting) on a
 * later date ends the extension right there. Only the last run can be
 * ambiguous this way: an earlier run's end is already bounded by the next
 * run's start. LEARNING (learnHabit, learnCycleLength) calls this with no
 * opts, so it only ever sees logged blood days.
 */
export function bloodRuns(days: CycleDay[], opts?: BloodRunsOptions): BloodRun[] {
  const dates = days.filter((d) => d.flow === "blood").map((d) => d.date).sort();
  const runs: BloodRun[] = [];
  for (const date of dates) {
    const cur = runs[runs.length - 1];
    if (cur && diffDays(cur.end, date) <= 2) cur.end = date;
    else runs.push({ start: date, end: date, dates: [] });
  }
  const last = runs[runs.length - 1];
  if (last && opts?.today) {
    const logged = new Set(days.map((d) => d.date));
    const cap = opts.capOf ? opts.capOf(last.start) : opts.today;
    const limit = cap < opts.today ? cap : opts.today;
    for (let d = addDays(last.end, 1); d <= limit && !logged.has(d); d = addDays(d, 1)) last.end = d;
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
  // Any birth or miscarriage ends the pregnancy; whether the bleeding after it is
  // nifas (≥120 days, decision 10) or دم فساد (below) is decided per run in classify.
  const ends = [s.birthDate, s.miscarriageDate].filter((x): x is string => !!x).sort();
  return ends.length ? ends[ends.length - 1] : null;
}
/** A run beginning around a sub-120-day miscarriage is دم فساد → istihada (decision 10), not haid. */
function startedAfterEarlyMiscarriage(s: CycleSettings, runStart: string): boolean {
  if (!s.miscarriageDate || (s.gestationDays ?? 0) >= MISCARRIAGE_NIFAS_MIN_GESTATION) return false;
  const n = diffDays(s.miscarriageDate, runStart);
  return Math.abs(n) <= LABOUR_BLOOD_DAYS_BEFORE_BIRTH; // the run that begins with the miscarriage itself
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
/** Item E-3: day 41+ of a nifas run is haid, but only within ±CONTRACEPTION_WINDOW_DAYS of a cycle-length multiple from the last normal period. */
function nearExpectedPeriod(lastNormalStart: string | undefined, cycleLength: number | undefined, date: string): boolean {
  if (!lastNormalStart || !cycleLength) return false;
  const cyclesElapsed = Math.round(diffDays(lastNormalStart, date) / cycleLength);
  const expected = addDays(lastNormalStart, cyclesElapsed * cycleLength);
  return Math.abs(diffDays(expected, date)) <= CONTRACEPTION_WINDOW_DAYS;
}
function median(xs: number[]): number | undefined {
  if (!xs.length) return undefined;
  const a = [...xs].sort((p, q) => p - q);
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : Math.round((a[m - 1] + a[m]) / 2);
}

/**
 * A run only counts for learning once we know it actually ended: some later entry is logged —
 * a subsequent blood run, or an explicit dry/spotting close. The chronologically last run, with
 * nothing at all logged after it, is still open (she may bleed again tomorrow) and is excluded —
 * otherwise a single day's log would be learned as the whole habit (bug 1).
 */
function isCompleteRun(run: BloodRun, days: CycleDay[]): boolean {
  return days.some((d) => d.date > run.end);
}

/** Median length of the last three complete normal runs (uncapped, so a genuinely longer habit is learned). */
export function learnHabit(days: CycleDay[], settings: CycleSettings, before?: string): number | undefined {
  const runs = bloodRuns(days).filter((r) => isNormalRun(r, settings) && isCompleteRun(r, days) && (!before || r.end < before));
  return median(runs.slice(-3).map((r) => r.dates.length));
}
const MIN_CYCLE_INTERVALS = 3; // spec: "median of the last 3-6 start-to-start intervals" — below 3 is too thin to trust
/** Median of the last ≤6 start-to-start intervals of normal runs; undefined below MIN_CYCLE_INTERVALS. */
export function learnCycleLength(days: CycleDay[], settings: CycleSettings, before?: string): number | undefined {
  const starts = bloodRuns(days).filter((r) => isNormalRun(r, settings) && isCompleteRun(r, days) && (!before || r.end < before)).slice(-7).map((r) => r.start);
  const gaps: number[] = [];
  for (let i = 1; i < starts.length; i++) gaps.push(diffDays(starts[i - 1], starts[i]));
  return gaps.length >= MIN_CYCLE_INTERVALS ? median(gaps) : undefined; // already ≤6: 7 starts (sliced above) give at most 6 gaps
}

/** The runs classify()/predict() see: the last one extended through unlogged days up to the habit (item E-2). */
function extendedRuns(days: CycleDay[], settings: CycleSettings, today: string): BloodRun[] {
  return bloodRuns(days, {
    today,
    capOf: (start) => {
      const nifasDay = nifasDayOf(settings, start);
      if (nifasDay !== null) { const birth = effectiveBirth(settings); if (birth) return addDays(birth, NIFAS_MAX_DAYS - 1); }
      const habit = settings.habitLength ?? learnHabit(days, settings, start) ?? DEFAULT_HAID_DAYS;
      return addDays(start, habit - 1);
    },
  });
}

export function classify(days: CycleDay[], settings: CycleSettings, from: string, to: string, today: string = to): ClassifiedDay[] {
  const byDate = new Map(days.map((d) => [d.date, d] as const));
  const runs = extendedRuns(days, settings, today);
  const runStatus = new Map<string, { status: DayStatus; runDay: number; advisories: Advisory[] }>();

  // Bug 6: the last run that is a genuine period — not nifas/pregnant, and (with contraception)
  // not itself an off-schedule breakthrough — tracked incrementally so a breakthrough run can
  // never become the anchor for the runs after it (it is never assigned here).
  let prevNormal: BloodRun | undefined;
  for (const run of runs) {
    const habit = settings.habitLength ?? learnHabit(days, settings, run.start);
    const cycleLen = settings.cycleLength ?? learnCycleLength(days, settings, run.start);
    // Bug 4: a run that only REACHES the birth/miscarriage partway through (blood logged from
    // before it) still belongs to that episode — test every day the run covers, not just its
    // start, or a day-41+ tail wrongly escapes the nifas-continuation rule (item E-3) entirely.
    const startedInNifas = run.dates.some((d) => nifasDayOf(settings, d) !== null);
    const earlyMiscarriageRun = run.dates.some((d) => startedAfterEarlyMiscarriage(settings, d));
    const isBaseNormal = isNormalRun(run, settings);
    let contraceptionIstihada = false;
    if (isBaseNormal && settings.contraception && cycleLen && prevNormal) {
      // Bug 6: roll the expected start by WHOLE cycle-length multiples from the last real period,
      // not one cycleLen hop — a skipped cycle (common on contraception) is not istihada.
      contraceptionIstihada = !nearExpectedPeriod(prevNormal.start, cycleLen, run.start);
    }
    const hasColours = run.dates.some((d) => byDate.get(d)?.color);
    // Calendar day within the CURRENT haid-quota stretch (decision 2 is calendar days, not a
    // blood-day tally): a spotting day still consumes a day of the habit (bug 3), but nifas /
    // pregnancy / early-miscarriage / contraception days belong to a different rule entirely and
    // reset the count, so a habit match right after nifas ends (item E-3) starts counting at 1.
    let habitDay = 0;
    run.dates.forEach((date, i) => {
      const runDay = i + 1;
      const advisories: Advisory[] = [];
      let status: DayStatus;
      if (byDate.get(date)?.flow === "spotting") { status = "tuhr_pending_ghusl"; habitDay++; } // decision 3: spotting is never haid/nifas, even absorbed mid-run (E-1)
      else if (nifasDayOf(settings, date) !== null) { status = "nifas"; habitDay = 0; } // decision 10-أ: labour blood wins over "still pregnant"
      else if (isPregnant(settings, date)) {
        status = "istihada";
        advisories.push("bleeding_in_pregnancy");
        habitDay = 0;
      } else if (startedInNifas && !nearExpectedPeriod(prevNormal?.start, cycleLen, date)) { status = "istihada"; habitDay = 0; } // continuation past day 40 (his book: يُنظر فيه → استحاضة absent a habit match); haid instead when it matches her expected period (item E-3)
      else if (earlyMiscarriageRun) { status = "istihada"; habitDay = 0; } // decision 10: no تخليق → دم فساد, later periods are haid again
      else if (contraceptionIstihada) { status = "istihada"; habitDay = 0; }
      else {
        habitDay++;
        if (habit) status = habitDay <= habit ? "haid" : "istihada";
        else if (hasColours) status = byDate.get(date)?.color === "red" ? "istihada" : "haid";
        else status = habitDay <= DEFAULT_HAID_DAYS ? "haid" : "istihada";
      }
      if (runDay > SEE_DOCTOR_AFTER_DAYS) advisories.push("see_doctor");
      runStatus.set(date, { status, runDay, advisories });
    });
    if (isBaseNormal && !contraceptionIstihada) prevNormal = run; // bug 6: a breakthrough run never anchors later runs
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

export interface Prediction { habit?: number; cycleLength: number; nextStart?: string; ovulation?: string; fertile?: [string, string]; expectedPurity?: string; lastStart?: string }

export function predict(days: CycleDay[], settings: CycleSettings, today: string): Prediction {
  const runs = extendedRuns(days, settings, today).filter((r) => r.start <= today); // bug 5: a future-dated log hasn't happened yet — ignore it entirely
  const habit = settings.habitLength ?? learnHabit(days, settings);
  const cycleLength = settings.cycleLength ?? learnCycleLength(days, settings) ?? DEFAULT_CYCLE_LENGTH;
  const p: Prediction = { habit, cycleLength };
  const current = runs.find((r) => today <= r.end); // bug 5: an already-ended run (today > end) is no longer "current"
  if (current) {
    if (nifasDayOf(settings, current.start) !== null) p.expectedPurity = addDays(effectiveBirth(settings)!, NIFAS_MAX_DAYS);
    else if (habit) p.expectedPurity = addDays(current.start, habit);
  }
  if (isPregnant(settings, today)) return p;
  // Bug 6: a contraception breakthrough (off-schedule) run must not anchor nextStart for the runs
  // after it — walk forward keeping only runs that are on-schedule relative to the last one kept.
  let lastNormalStart: string | undefined;
  const normal: BloodRun[] = [];
  for (const r of runs) {
    if (!isNormalRun(r, settings)) continue;
    if (settings.contraception && lastNormalStart && !nearExpectedPeriod(lastNormalStart, cycleLength, r.start)) continue; // breakthrough — skip, don't anchor
    normal.push(r);
    lastNormalStart = r.start;
  }
  const last = normal[normal.length - 1];
  if (last) {
    p.lastStart = last.start; // the ACTUAL last period start — cyclePhases anchors on this so a late period counts up (day 30) instead of resetting to day 2
    let next = addDays(last.start, cycleLength);
    while (next < today) next = addDays(next, cycleLength);
    p.nextStart = next;
    p.ovulation = addDays(next, -LUTEAL_DAYS);
    p.fertile = [addDays(p.ovulation, -FERTILE_BEFORE), addDays(p.ovulation, FERTILE_AFTER)];
  }
  return p;
}

// ── Medical/حساب zone below: descriptive cycle context (no فقه weight). ──────

export type CyclePhaseKey = "menses" | "follicular" | "fertile" | "luteal";
export interface CyclePhase { key: CyclePhaseKey; startDay: number; endDay: number; days: number; pct: number; from: string; to: string }
export interface CyclePhases { cycleStart: string; cycleLength: number; cycleDay: number; todayKey: CyclePhaseKey; phases: CyclePhase[]; personalized: boolean }

const clampInt = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), hi);

/**
 * Divides the CURRENT cycle into menses/follicular/fertile/luteal by proportion
 * (حساب لا حكم شرعي — purely descriptive, never used by classify/rulingsFor).
 * null while pregnant or in nifas (caller omits the breakdown then — a cycle
 * doesn't apply). Anchored on the ACTUAL last period start, so cycleDay counts
 * up through a late period (day 30) instead of resetting. With no logged history
 * it shows a generic template at today (personalized: false).
 */
export function cyclePhases(days: CycleDay[], settings: CycleSettings, today: string): CyclePhases | null {
  if (isPregnant(settings, today) || nifasDayOf(settings, today) !== null) return null;
  const p = predict(days, settings, today);
  const cycleLength = p.cycleLength;
  const habit = p.habit ?? DEFAULT_HAID_DAYS;
  // A period more than a full extra cycle overdue is no longer "late" — it's
  // amenorrhea, breastfeeding, or simply stopped logging. Past that, drop the real
  // anchor and show the generic template instead of "day 400 / 370 days late".
  const stale = p.lastStart != null && diffDays(p.lastStart, today) > 2 * cycleLength;
  const personalized = !!p.lastStart && !stale;
  const cycleStart = personalized ? p.lastStart! : today;
  // Ovulation/fertile derived from THIS cycle's start (not predict's fertile,
  // which is tied to the old nextStart) so the window always lands inside the
  // displayed cycle — identical to predict()'s formula in the normal case.
  const ov = addDays(cycleStart, cycleLength - LUTEAL_DAYS);
  const fertile: [string, string] = [addDays(ov, -FERTILE_BEFORE), addDays(ov, FERTILE_AFTER)];
  const idx = (date: string) => diffDays(cycleStart, date) + 1;
  // Cap menses at the cycle length: a manually-set habit longer than the cycle
  // (e.g. habit 30, cycle 28) must not spill past 100% or overlap fertile. The
  // cycleLength+1 upper bound lets fs land "past the end" so the later phases
  // collapse to empty (dropped below) instead of overlapping the full menses.
  const mensesEnd = clampInt(habit, 0, cycleLength);
  const fs = clampInt(idx(fertile[0]), mensesEnd + 1, cycleLength + 1);
  const fe = clampInt(idx(fertile[1]), fs, cycleLength);
  // Contiguous by construction — each range starts at the previous one's end+1 —
  // so they jointly span 1..cycleLength with no gap/overlap even after an empty
  // one (e.g. a short cycle collapsing follicular) is dropped below.
  const ranges: [CyclePhaseKey, number, number][] = [
    ["menses", 1, mensesEnd],
    ["follicular", mensesEnd + 1, fs - 1],
    ["fertile", fs, fe],
    ["luteal", fe + 1, cycleLength],
  ];
  const phases = ranges.filter(([, start, end]) => end >= start).map(([key, startDay, endDay]) => ({
    key, startDay, endDay, days: endDay - startDay + 1,
    pct: Math.round(((endDay - startDay + 1) / cycleLength) * 100),
    from: addDays(cycleStart, startDay - 1), to: addDays(cycleStart, endDay - 1),
  }));
  // Uncapped upper bound: past the cycle length means the period is LATE, so the
  // UI shows "day 30 / N days late" rather than snapping back to day 1. The marker
  // (and todayKey) cap at the last day so they stay on the bar.
  const cycleDay = Math.max(1, idx(today));
  const markerDay = Math.min(cycleDay, cycleLength);
  const todayKey = phases.find((ph) => markerDay >= ph.startDay && markerDay <= ph.endDay)!.key; // always found: see contiguity note above
  return { cycleStart, cycleLength, cycleDay, todayKey, phases, personalized };
}

/**
 * The next fertile window at/after `today`: predict()'s window rolled forward by
 * whole cycles until it has not already passed, plus whether today falls inside
 * it. This is what a countdown must use — predict().fertile alone is the window
 * before the NEXT period, which is in the PAST during the luteal phase, so a raw
 * `diffDays(today, fertile[0])` there goes negative and reads as "fertile now".
 */
export function upcomingFertile(prediction: Prediction, today: string): { start: string; end: string; active: boolean } | null {
  if (!prediction.fertile) return null;
  let [start, end] = prediction.fertile;
  while (today > end) { start = addDays(start, prediction.cycleLength); end = addDays(end, prediction.cycleLength); }
  return { start, end, active: today >= start && today <= end };
}

export interface CycleCountdowns { nextHaidDays: number | null; isLate: boolean; fertileDays: number | null }
/**
 * The overview countdowns, computed once so the screen and the family card can
 * never disagree. All null unless the cycle is `personalized` (a real recent
 * period). `nextHaidDays` is days to the next period (negative = late).
 * `fertileDays` is days to the next fertile window — suppressed while late (it
 * would point a cycle ahead and contradict "N days late") and while un-personalized
 * (stale/amenorrhea/no history), where predict()'s window is meaningless.
 */
export function cycleCountdowns(phases: CyclePhases | null, prediction: Prediction, today: string): CycleCountdowns {
  const nextHaidDays = phases?.personalized ? diffDays(today, addDays(phases.cycleStart, phases.cycleLength)) : null;
  const isLate = nextHaidDays != null && nextHaidDays < 0;
  const fert = phases?.personalized && !isLate ? upcomingFertile(prediction, today) : null;
  return { nextHaidDays, isLate, fertileDays: fert ? diffDays(today, fert.start) : null };
}

/**
 * True when `date`'s status is an ASSUMED continuation (item E-2): a haid/nifas/
 * istihada day with no logged entry, falling AFTER the last logged blood day. Used
 * for the assumed-day calendar mark (never a one-day gap merged inside a run).
 */
export function isAssumedBleedDay(status: DayStatus | undefined, date: string, days: CycleDay[]): boolean {
  if (status !== "haid" && status !== "nifas" && status !== "istihada") return false;
  if (days.some((d) => d.date === date)) return false;
  const lastBlood = days.filter((d) => d.flow === "blood").map((d) => d.date).sort().pop();
  return lastBlood != null && date > lastBlood;
}

export const OPEN_BLEED_GRACE_DAYS = 3; // days past the habit a bleed may still be "the same period" (late-noticed prolonged bleed)
/**
 * The last logged blood day when the run is still OPEN — she may be bleeding but
 * hasn't logged today: a blood day exists, nothing (dry/spotting) is logged after
 * it, and today is within `habit + OPEN_BLEED_GRACE_DAYS` of that day. Past that a
 * bleed today is a NEW period, not a forgotten log, so the caller offers "started"
 * instead of confirming — never a backfill across the pure interval of a short
 * cycle. While open it also suppresses "started", so a tap can't split the run.
 */
export function openBleedRun(days: CycleDay[], settings: CycleSettings, today: string): { lastBlood: string } | null {
  const lastBlood = days.filter((d) => d.flow === "blood").map((d) => d.date).sort().pop();
  if (!lastBlood || today <= lastBlood) return null;
  if (days.some((d) => d.date > lastBlood && (d.flow === "dry" || d.flow === "spotting"))) return null; // explicitly closed
  const habit = settings.habitLength ?? learnHabit(days, settings) ?? DEFAULT_HAID_DAYS;
  if (diffDays(lastBlood, today) > habit + OPEN_BLEED_GRACE_DAYS) return null;
  return { lastBlood };
}

/** Exact age in years (increments on the birthday, no /365.25 drift); null with no birthdate or a future one. */
export function ageYears(birthDate: string | null | undefined, today: string): number | null {
  if (!birthDate) return null;
  const [by, bm, bd] = birthDate.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  if ([by, bm, bd, ty, tm, td].some((n) => !Number.isFinite(n))) return null;
  let age = ty - by;
  if (tm < bm || (tm === bm && td < bd)) age -= 1; // birthday not yet reached this year
  return age < 0 ? null : age;
}

export type AgeBand = "teen" | "prime" | "declining" | "perimenopause";
/** Purely informational age context for the medical card — no فقه weight. */
export function ageBand(age: number | null): AgeBand | null {
  if (age == null) return null;
  if (age <= 19) return "teen";
  if (age <= 34) return "prime";
  if (age <= 44) return "declining";
  return "perimenopause";
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
