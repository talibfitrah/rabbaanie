/**
 * Roznama prayer-anchored "program" (Daa3iyah 3180): a RECURRING daily/weekly
 * routine, distinct from the one-off CalendarEvents (lib/calendar-events.ts).
 * Each item is anchored either to a prayer (so it shifts with that prayer
 * every day — the anchor time is looked up fresh per date via
 * lib/prayer-data.ts's calculatePrayerTimes) or to a fixed clock time, and
 * recurs on a set of weekdays.
 *
 * This module is the pure core + its own storage. All I/O stays here or in
 * the UI (app/roznama.tsx); resolveItemMinutes/itemRecursOn/programForDay take
 * prayer times as a plain argument and do no I/O themselves.
 *
 * DEFERRED (not built here): reminders/notifications for a program item —
 * recurring + prayer-relative re-scheduling (shifts with the prayer every
 * day, like lib/event-reminders.ts does for one-off CalendarEvents) is its
 * own unit; drag-to-reschedule; templates/presets.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { PrayerTimesResult } from "./prayer-data";
import type { CalendarEntryType } from "./calendar-events";

// ============ TYPES ============

export type ProgramAnchor = "fajr" | "sunrise" | "dhuhr" | "asr" | "maghrib" | "isha" | "fixed";

export interface ProgramItem {
  id: string;
  title: string;
  anchor: ProgramAnchor; // a prayer (relative) OR "fixed" (clock time)
  offsetMinutes: number; // prayer anchor: minutes AFTER it (negative = before). fixed: minutes from 00:00
  durationMinutes?: number; // optional block length
  days: number[]; // weekdays 0(Sun)-6(Sat) it recurs on; [] or length 7 = every day
  note?: string;
  color?: string;
  type?: CalendarEntryType; // same "event" | "task" | "worship" set as CalendarEvent
}

const ANCHORS: readonly ProgramAnchor[] = ["fajr", "sunrise", "dhuhr", "asr", "maghrib", "isha", "fixed"];

// ============ STORAGE (mirrors lib/calendar-events.ts; separate key/model) ============

const PROGRAM_ITEMS_KEY = "@program_items";

/** Serializes every mutator's read-modify-write — see lib/calendar-events.ts's
 * identical `serialize` for why a single module-wide lock is enough here. */
let chain: Promise<unknown> = Promise.resolve();
function serialize<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.then(() => {}, () => {});
  return run;
}

function isValidProgramItem(p: any): p is ProgramItem {
  return (
    p &&
    typeof p.id === "string" &&
    typeof p.title === "string" &&
    ANCHORS.includes(p.anchor) &&
    typeof p.offsetMinutes === "number" &&
    Array.isArray(p.days)
  );
}

/** Read used by mutators — a genuine AsyncStorage I/O error PROPAGATES (see
 * calendar-events.ts's readStrict); malformed/missing data still tolerates to []. */
async function readStrict(): Promise<ProgramItem[]> {
  const raw = await AsyncStorage.getItem(PROGRAM_ITEMS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidProgramItem);
  } catch {
    return [];
  }
}

/** Display-path read: also tolerant of a transient AsyncStorage I/O error. */
export async function loadProgramItems(): Promise<ProgramItem[]> {
  try {
    return await readStrict();
  } catch {
    return [];
  }
}

export async function saveProgramItems(list: ProgramItem[]): Promise<void> {
  await AsyncStorage.setItem(PROGRAM_ITEMS_KEY, JSON.stringify(list));
}

function generateProgramId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export async function addProgramItem(data: Omit<ProgramItem, "id">): Promise<ProgramItem> {
  return serialize(async () => {
    const list = await readStrict();
    const item: ProgramItem = { ...data, id: generateProgramId() };
    await saveProgramItems([...list, item]);
    return item;
  });
}

export async function updateProgramItem(
  id: string,
  patch: Partial<Omit<ProgramItem, "id">>
): Promise<ProgramItem | null> {
  return serialize(async () => {
    const list = await readStrict();
    let updated: ProgramItem | null = null;
    const next = list.map((p) => {
      if (p.id !== id) return p;
      updated = { ...p, ...patch };
      return updated;
    });
    if (updated) await saveProgramItems(next);
    return updated;
  });
}

export async function deleteProgramItem(id: string): Promise<void> {
  return serialize(async () => {
    const list = await readStrict();
    await saveProgramItems(list.filter((p) => p.id !== id));
  });
}

export async function getProgramItemById(id: string): Promise<ProgramItem | null> {
  const list = await loadProgramItems();
  return list.find((p) => p.id === id) ?? null;
}

// ============ PURE RESOLVE LOGIC (no I/O) ============

const HHMM_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

function parseHHMM(hhmm: string): number | null {
  const m = HHMM_RE.exec(hhmm);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/**
 * Minutes-from-midnight an item lands at on a day with the given prayer
 * times. "fixed" uses offsetMinutes directly; any prayer anchor looks up
 * `times[anchor]` and adds offsetMinutes (negative = before). Returns null
 * only when the anchor's "HH:MM" is malformed — the caller drops it.
 *
 * RAW, unclamped (P2-154): can be <0 (before dawn) or >=1440 (after midnight)
 * — e.g. "Isha + 120" past midnight. Clamping used to pile every such item at
 * 23:59; programForDay instead sorts by this raw value and wraps it for
 * display, so late/early items land in their correct relative order instead
 * of stacking.
 */
export function resolveItemMinutes(item: ProgramItem, times: PrayerTimesResult): number | null {
  if (item.anchor === "fixed") return item.offsetMinutes;
  const anchorMinutes = parseHHMM(times[item.anchor]);
  if (anchorMinutes === null) return null;
  return anchorMinutes + item.offsetMinutes;
}

/** [] or all 7 weekdays listed both mean "every day" — the latter falls out
 * of `.includes` on its own; `.length === 0` is the only case needing it. */
export function itemRecursOn(item: ProgramItem, weekday: number): boolean {
  return item.days.length === 0 || item.days.includes(weekday);
}

export interface ResolvedProgramItem {
  item: ProgramItem;
  minutes: number; // RAW (unwrapped) minutes-from-midnight -- what sorting uses
  hour: number; // WRAPPED clock hour (0-23) -- what display uses
  minute: number; // WRAPPED clock minute (0-59) -- what display uses
  dayOffset: number; // -1 before dawn, +1 after midnight, 0 same day
}

/** The items that recur on `weekday`, resolved against `times` and sorted
 * morning -> evening (before-dawn items first, after-midnight items last, by
 * raw minutes). Items that don't recur today or whose anchor time is
 * malformed (resolveItemMinutes -> null) are dropped. */
export function programForDay(
  items: ProgramItem[],
  weekday: number,
  times: PrayerTimesResult
): ResolvedProgramItem[] {
  const out: ResolvedProgramItem[] = [];
  for (const item of items) {
    if (!itemRecursOn(item, weekday)) continue;
    const minutes = resolveItemMinutes(item, times);
    if (minutes === null) continue;
    const wrapped = ((minutes % 1440) + 1440) % 1440;
    out.push({
      item,
      minutes,
      hour: Math.floor(wrapped / 60),
      minute: wrapped % 60,
      dayOffset: Math.floor(minutes / 1440),
    });
  }
  return out.sort((a, b) => a.minutes - b.minutes);
}
