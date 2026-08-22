import AsyncStorage from "@react-native-async-storage/async-storage";

// ============ STORAGE KEYS ============

const DAILY_CHECKIN_PREFS_KEY = "@daily_checkin_prefs";

// ============ TYPES ============

export interface DailyCheckinPrefs {
  enabled: boolean;
}

export const DEFAULT_DAILY_CHECKIN_PREFS: DailyCheckinPrefs = {
  enabled: true,
};

// ============ DAILY CHECK-IN NOTIFICATION PREFS ============

export async function loadDailyCheckinPrefs(): Promise<DailyCheckinPrefs> {
  try {
    const raw = await AsyncStorage.getItem(DAILY_CHECKIN_PREFS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_DAILY_CHECKIN_PREFS, ...parsed };
    }
  } catch {}
  return { ...DEFAULT_DAILY_CHECKIN_PREFS };
}

export async function saveDailyCheckinPrefs(prefs: DailyCheckinPrefs): Promise<void> {
  await AsyncStorage.setItem(DAILY_CHECKIN_PREFS_KEY, JSON.stringify(prefs));
}
