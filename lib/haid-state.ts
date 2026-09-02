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
