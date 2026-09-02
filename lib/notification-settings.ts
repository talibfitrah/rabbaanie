/**
 * Unified Notification Settings Store
 * All notification preferences in one place, persisted with AsyncStorage
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { HAID_NOTIFICATION_TYPES } from "./haid-state";
import type { Language } from "./i18n";

// ============ STORAGE KEY ============
export const UNIFIED_NOTIF_PREFS_KEY = "@unified_notification_prefs";

// ============ TYPES ============

/** Display mode for each notification type */
export type NotifDisplayMode = "normal" | "popup" | "both" | "off";

export interface NotifDisplayModes {
  prayer: NotifDisplayMode;
  adhkar: NotifDisplayMode;
  iman: NotifDisplayMode;
  tarbiya: NotifDisplayMode;
  iqamah: NotifDisplayMode;
  weekly: NotifDisplayMode;
  night: NotifDisplayMode;
  reminders: NotifDisplayMode;
}

export interface PrayerNotifSettings {
  enabled: boolean;
  fajr: boolean;
  sunrise: boolean;
  dhuhr: boolean;
  asr: boolean;
  maghrib: boolean;
  isha: boolean;
  minutesBefore: number;
}

export interface AdhkarNotifSettings {
  morningEnabled: boolean;
  eveningEnabled: boolean;
  postPrayerEnabled: boolean;
  sleepEnabled: boolean;
  wakingEnabled: boolean;
}

export interface ImanNotifSettings {
  istighfarEnabled: boolean;
  istighfarHour: number;
  istighfarMinute: number;
  muraqabaEnabled: boolean;
  muraqabaHour: number;
  muraqabaMinute: number;
  ikhlasBeforePrayer: boolean;
  khushooReminder: boolean;
  ikhlasInWork: boolean;
}

export interface TarbiyaNotifSettings {
  dailyMomentEnabled: boolean;
  dailyMomentHour: number;
  dailyMomentMinute: number;
  dailyGoalAfterFajr: boolean;
  duaForChildren: boolean;
  duaForChildrenHour: number;
  duaForChildrenMinute: number;
  treatmentFollowUp: boolean;
  spouseMoment: boolean;
  spouseMomentHour: number;
  spouseMomentMinute: number;
}

export interface WeeklyNotifSettings {
  weeklyReportFriday: boolean;
  weeklyReportHour: number;
  weeklyReportMinute: number;
  hourOfAcceptanceFriday: boolean;
  salatOnProphetFriday: boolean;
}

export interface FastingNotifSettings {
  mondayThursday: boolean;
  whiteDays: boolean;
  ashura: boolean;
  arafah: boolean;
  dhulHijjah: boolean;
}

export interface NightNotifSettings {
  lastThirdEnabled: boolean;
  qiyamReminder: boolean;
}

export interface NetworkNotifSettings {
  syncComplete: boolean;
  partnerActivity: boolean;
  newMessage: boolean;
}

export interface UnifiedNotifPrefs {
  // Master toggle - cannot be disabled for popup notifications
  masterEnabled: boolean;
  displayModes: NotifDisplayModes;
  prayer: PrayerNotifSettings;
  adhkar: AdhkarNotifSettings;
  iman: ImanNotifSettings;
  tarbiya: TarbiyaNotifSettings;
  weekly: WeeklyNotifSettings;
  fasting: FastingNotifSettings;
  night: NightNotifSettings;
  network: NetworkNotifSettings;
}

// ============ DEFAULTS ============

export const DEFAULT_UNIFIED_NOTIF_PREFS: UnifiedNotifPrefs = {
  masterEnabled: true,
  displayModes: {
    prayer: "both",
    adhkar: "normal",
    iman: "popup",
    tarbiya: "normal",
    iqamah: "normal",
    weekly: "normal",
    night: "both",
    reminders: "normal",
  },
  prayer: {
    enabled: true,
    fajr: true,
    sunrise: false,
    dhuhr: true,
    asr: true,
    maghrib: true,
    isha: true,
    minutesBefore: 5,
  },
  adhkar: {
    morningEnabled: true,
    eveningEnabled: true,
    postPrayerEnabled: true,
    sleepEnabled: true,
    wakingEnabled: false,
  },
  iman: {
    istighfarEnabled: true,
    istighfarHour: 13,
    istighfarMinute: 0,
    muraqabaEnabled: true,
    muraqabaHour: 10,
    muraqabaMinute: 0,
    ikhlasBeforePrayer: true,
    khushooReminder: true,
    ikhlasInWork: true,
  },
  tarbiya: {
    dailyMomentEnabled: true,
    dailyMomentHour: 20,
    dailyMomentMinute: 0,
    dailyGoalAfterFajr: true,
    duaForChildren: true,
    duaForChildrenHour: 22,
    duaForChildrenMinute: 0,
    treatmentFollowUp: true,
    spouseMoment: true,
    spouseMomentHour: 21,
    spouseMomentMinute: 30,
  },
  weekly: {
    weeklyReportFriday: true,
    weeklyReportHour: 18,
    weeklyReportMinute: 0,
    hourOfAcceptanceFriday: true,
    salatOnProphetFriday: true,
  },
  fasting: {
    mondayThursday: true,
    whiteDays: true,
    ashura: true,
    arafah: true,
    dhulHijjah: true,
  },
  night: {
    lastThirdEnabled: true,
    qiyamReminder: true,
  },
  network: {
    syncComplete: true,
    partnerActivity: true,
    newMessage: true,
  },
};

// ============ PERSISTENCE ============

export async function loadUnifiedNotifPrefs(): Promise<UnifiedNotifPrefs> {
  try {
    const raw = await AsyncStorage.getItem(UNIFIED_NOTIF_PREFS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return deepMerge(DEFAULT_UNIFIED_NOTIF_PREFS, parsed);
    }
  } catch {}
  return { ...DEFAULT_UNIFIED_NOTIF_PREFS };
}

export async function saveUnifiedNotifPrefs(prefs: UnifiedNotifPrefs): Promise<void> {
  await AsyncStorage.setItem(UNIFIED_NOTIF_PREFS_KEY, JSON.stringify(prefs));
}

// ============ SYNC SETTINGS ============

export const SYNC_SETTINGS_KEY = "@sync_settings";

export interface SyncSettings {
  syncFrequency: "15min" | "30min" | "1hr" | "manual";
  syncChildren: boolean;
  syncIssues: boolean;
  syncActionPlans: boolean;
  syncEnvironments: boolean;
  syncWeeklyProgress: boolean;
}

export const DEFAULT_SYNC_SETTINGS: SyncSettings = {
  syncFrequency: "30min",
  syncChildren: true,
  syncIssues: true,
  syncActionPlans: true,
  syncEnvironments: true,
  syncWeeklyProgress: true,
};

export async function loadSyncSettings(): Promise<SyncSettings> {
  try {
    const raw = await AsyncStorage.getItem(SYNC_SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_SYNC_SETTINGS, ...parsed };
    }
  } catch {}
  return { ...DEFAULT_SYNC_SETTINGS };
}

export async function saveSyncSettings(settings: SyncSettings): Promise<void> {
  await AsyncStorage.setItem(SYNC_SETTINGS_KEY, JSON.stringify(settings));
}

// ============ HELPERS ============

function deepMerge<T extends Record<string, any>>(defaults: T, overrides: Partial<T>): T {
  const result = { ...defaults };
  for (const key in overrides) {
    if (
      overrides[key] !== undefined &&
      typeof overrides[key] === "object" &&
      !Array.isArray(overrides[key]) &&
      overrides[key] !== null &&
      typeof defaults[key] === "object" &&
      !Array.isArray(defaults[key]) &&
      defaults[key] !== null
    ) {
      (result as any)[key] = deepMerge(defaults[key] as any, overrides[key] as any);
    } else if (overrides[key] !== undefined) {
      (result as any)[key] = overrides[key];
    }
  }
  return result;
}

// ============ NOTIFICATION RULING LABELS ============

export const RULING_COLORS: Record<string, string> = {
  "واجب": "#DC2626",
  "سنة مؤكدة": "#059669",
  "مستحب": "#0891B2",
};

// The ruling travels as one of the Arabic literals above; badges label it in
// the UI language. Unknown values render as-is.
const RULING_LABELS: Record<string, Record<Language, string>> = {
  "واجب": { nl: "Verplicht", en: "Obligatory", ar: "واجب" },
  "سنة مؤكدة": { nl: "Bevestigde sunnah", en: "Confirmed sunnah", ar: "سنة مؤكدة" },
  "مستحب": { nl: "Aanbevolen", en: "Recommended", ar: "مستحب" },
};
export function rulingLabel(ruling: string, language: Language): string {
  return RULING_LABELS[ruling]?.[language] ?? ruling;
}

export const RULING_BG_COLORS: Record<string, string> = {
  "واجب": "#FEF2F2",
  "سنة مؤكدة": "#ECFDF5",
  "مستحب": "#ECFEFF",
};

// ============ POPUP DECISION ============

const CATEGORY_KEYWORDS: [keyof NotifDisplayModes, string[]][] = [
  ["prayer", ["prayer", "adhan"]],
  ["adhkar", ["adhkaar", "adhkar", "morning", "evening"]],
  ["iman", ["muraqaba", "ikhlas", "khushoo", "istighfar", "iman", "faith", "friday"]],
  ["tarbiya", ["tarbiya", "dua_children", "spouse", "daily_goal"]],
  ["iqamah", ["iqamah"]],
  ["weekly", ["weekly", "goals"]],
  ["night", ["qiyam", "night", "last_third"]],
  ["reminders", ["reminder", "advice", "inactivity"]],
];

function categoryForType(type: string): keyof NotifDisplayModes | null {
  if (type === HAID_NOTIFICATION_TYPES.purityCheck || type === HAID_NOTIFICATION_TYPES.ghuslReminder) {
    return "reminders";
  }
  for (const [category, keywords] of CATEGORY_KEYWORDS) {
    if (keywords.some((kw) => type.includes(kw))) return category;
  }
  return null;
}

/**
 * Whether a received notification should show the in-app centre popup.
 * The test notification (type: "test_reminder") always forces a popup so the
 * "Test notification" button stays a reliable proof it works, regardless of
 * whatever display mode the user picked for the "reminders" category.
 */
export function resolveShouldShowPopup(
  // showPopup is intentionally not read here — every notification producer
  // still sets it (pre-existing, ~30 call sites), but the only forced-popup
  // case is the test notification itself, matched by type below.
  data: { type?: string } | null | undefined,
  displayModes: NotifDisplayModes,
  excused = false,
): boolean {
  if (!data) return false;
  if (data.type === "test_reminder") return true;

  const category = categoryForType(data.type || "");
  if (excused && category === "prayer") return false;
  if (!category) return false;

  const mode = displayModes[category];
  return mode === "popup" || mode === "both";
}
