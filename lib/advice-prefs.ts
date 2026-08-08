import AsyncStorage from "@react-native-async-storage/async-storage";

// ============ STORAGE KEYS ============

const ADVICE_ANIMATION_KEY = "@advice_animation_enabled";
const ADVICE_FAVORITES_KEY = "@advice_favorites";
const DAILY_ADVICE_PREFS_KEY = "@daily_advice_prefs";
const LAST_ADVICE_TITLE_KEY = "@last_advice_title";
const WIDGET_NOTIFICATION_KEY = "@widget_notification_enabled";

// ============ TYPES ============

export interface FavoriteAdvice {
  id: string; // unique id: date + section index
  title: string;
  content: string;
  icon: string;
  date: string; // ISO date when saved
}

export interface DailyAdvicePrefs {
  enabled: boolean;
  hour: number; // 0-23
  minute: number; // 0-59
}

export const DEFAULT_DAILY_ADVICE_PREFS: DailyAdvicePrefs = {
  enabled: true,
  hour: 7,
  minute: 0,
};

// ============ ANIMATION PREFERENCE ============

export async function loadAnimationEnabled(): Promise<boolean> {
  try {
    const val = await AsyncStorage.getItem(ADVICE_ANIMATION_KEY);
    if (val === null) return true; // default: enabled
    return val === "true";
  } catch {
    return true;
  }
}

export async function saveAnimationEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(ADVICE_ANIMATION_KEY, String(enabled));
}

// ============ FAVORITES ============

export async function loadFavorites(): Promise<FavoriteAdvice[]> {
  try {
    const raw = await AsyncStorage.getItem(ADVICE_FAVORITES_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return [];
}

export async function saveFavorites(favorites: FavoriteAdvice[]): Promise<void> {
  await AsyncStorage.setItem(ADVICE_FAVORITES_KEY, JSON.stringify(favorites));
}

export async function addFavorite(fav: FavoriteAdvice): Promise<FavoriteAdvice[]> {
  const current = await loadFavorites();
  // Prevent duplicates
  if (current.some((f) => f.id === fav.id)) return current;
  const updated = [fav, ...current]; // newest first
  await saveFavorites(updated);
  return updated;
}

export async function removeFavorite(id: string): Promise<FavoriteAdvice[]> {
  const current = await loadFavorites();
  const updated = current.filter((f) => f.id !== id);
  await saveFavorites(updated);
  return updated;
}

export async function isFavorite(id: string): Promise<boolean> {
  const current = await loadFavorites();
  return current.some((f) => f.id === id);
}

// ============ DAILY ADVICE NOTIFICATION PREFS ============

export async function loadDailyAdvicePrefs(): Promise<DailyAdvicePrefs> {
  try {
    const raw = await AsyncStorage.getItem(DAILY_ADVICE_PREFS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_DAILY_ADVICE_PREFS, ...parsed };
    }
  } catch {}
  return { ...DEFAULT_DAILY_ADVICE_PREFS };
}

export async function saveDailyAdvicePrefs(prefs: DailyAdvicePrefs): Promise<void> {
  await AsyncStorage.setItem(DAILY_ADVICE_PREFS_KEY, JSON.stringify(prefs));
}

// ============ LAST ADVICE TITLE (for notification content) ============

export async function saveLastAdviceTitle(title: string): Promise<void> {
  await AsyncStorage.setItem(LAST_ADVICE_TITLE_KEY, title);
}

export async function loadLastAdviceTitle(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(LAST_ADVICE_TITLE_KEY);
  } catch {
    return null;
  }
}

// ============ WIDGET (STICKY NOTIFICATION) ============

export async function loadWidgetEnabled(): Promise<boolean> {
  try {
    const val = await AsyncStorage.getItem(WIDGET_NOTIFICATION_KEY);
    if (val === null) return true; // default: enabled
    return val === "true";
  } catch {
    return true;
  }
}

export async function saveWidgetEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(WIDGET_NOTIFICATION_KEY, String(enabled));
}
