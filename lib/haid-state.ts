import AsyncStorage from "@react-native-async-storage/async-storage";
import { addDays, classify, DEFAULT_SETTINGS, excusedState, isoToday, predict, type CycleDay, type CycleSettings, type ExcusedState, type Flow } from "./haid";

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

/**
 * C8: what to persist as the excused flag after an upsertDay call that may
 * have been a no-op. `written:false` (ifAbsent:true, today's row already
 * existed) means nothing changed on the server — it must never be read as
 * "she is excused". The caller refetches getMine only in that case and
 * passes it here as `fresh`; returns null when nothing should be written
 * (today genuinely isn't excused, or the tracker turned out to be disabled).
 */
export function deriveExcusedAfterWrite(
  written: boolean,
  fresh: { enabled: boolean; settings: CycleSettings | null; days: { date: string; flow: string; color?: string | null; ghusl?: boolean }[] } | null,
  today: string = isoToday(),
): ExcusedState | null {
  if (written) return { excused: true, until: today };
  if (!fresh?.enabled) return null;
  const days: CycleDay[] = fresh.days.map((d) => ({ date: d.date, flow: d.flow as Flow, color: d.color as CycleDay["color"], ghusl: d.ghusl }));
  const settings: CycleSettings = { ...DEFAULT_SETTINGS, ...(fresh.settings ?? {}), enabled: true };
  const classified = classify(days, settings, addDays(today, -60), today);
  const state = excusedState(classified, predict(days, settings, today), today);
  return state.excused ? state : null;
}
