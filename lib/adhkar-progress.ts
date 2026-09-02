import AsyncStorage from "@react-native-async-storage/async-storage";
import { isoToday } from "./haid";
import { ADHKAR_CATEGORIES } from "./adhkar-data";

const KEY = "@adhkar_progress";
// Recurs five times a day like the post-prayer route, so its counts never persist.
const RECURRING = new Set(
  ADHKAR_CATEGORIES.find((c) => c.id === "after_every_prayer")?.adhkar.map((d) => d.id) ?? [],
);

/** Checked counts survive closing the modal, but only for the local day they were made on. */
export async function loadAdhkarProgress(): Promise<Record<string, number>> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as { day?: string; counts?: Record<string, number> };
    return parsed.day === isoToday() && parsed.counts ? parsed.counts : {};
  } catch {
    return {};
  }
}
export async function saveAdhkarProgress(counts: Record<string, number>): Promise<void> {
  const kept = Object.fromEntries(Object.entries(counts).filter(([id]) => !RECURRING.has(id)));
  await AsyncStorage.setItem(KEY, JSON.stringify({ day: isoToday(), counts: kept }));
}
