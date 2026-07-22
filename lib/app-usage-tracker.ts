/**
 * App Usage Tracker for Android
 * 
 * This module provides functionality to track which apps the child uses
 * and for how long. On Android, it uses the UsageStatsManager API via
 * a native module (modules/usage-stats). On iOS, this is not possible 
 * due to Apple restrictions.
 * 
 * Features:
 * 1. Tracks time spent IN our app (which screens, how long)
 * 2. On Android (native build), uses UsageStatsManager for external apps
 * 3. Syncs usage data to the server for parent monitoring
 * 4. Categorizes apps (social, games, education, islamic, etc.)
 */

import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

// Import native module (safe - returns fallbacks on web/iOS)
import * as UsageStatsNative from "../modules/usage-stats/src";

const APP_USAGE_KEY = "child_app_usage_sessions";
const EXTERNAL_USAGE_KEY = "child_external_app_usage";
const PERMISSION_STATUS_KEY = "usage_stats_permission_status";
const LAST_SYNC_KEY = "usage_stats_last_sync";

export interface AppUsageEntry {
  appName: string;
  packageName: string;
  durationMinutes: number;
  lastUsed: string; // ISO date
  category: "social" | "games" | "education" | "media" | "browser" | "islamic" | "news" | "productivity" | "other";
}

export interface InAppUsageEntry {
  screen: string;
  durationSeconds: number;
  timestamp: string;
}

export interface ExternalAppUsage {
  packageName: string;
  appName: string;
  usageSeconds: number;
  openCount: number;
  category: string;
  isSystemApp: boolean;
  date: string;
}

// ============================================================
// IN-APP SCREEN TRACKING
// ============================================================

let currentScreen: string | null = null;
let screenStartTime: number | null = null;
let inAppSessions: InAppUsageEntry[] = [];

export function startScreenTracking(screenName: string) {
  if (currentScreen && screenStartTime) {
    const duration = Math.floor((Date.now() - screenStartTime) / 1000);
    if (duration > 2) {
      inAppSessions.push({
        screen: currentScreen,
        durationSeconds: duration,
        timestamp: new Date().toISOString(),
      });
    }
  }
  currentScreen = screenName;
  screenStartTime = Date.now();
}

export function endScreenTracking() {
  if (currentScreen && screenStartTime) {
    const duration = Math.floor((Date.now() - screenStartTime) / 1000);
    if (duration > 2) {
      inAppSessions.push({
        screen: currentScreen,
        durationSeconds: duration,
        timestamp: new Date().toISOString(),
      });
    }
  }
  currentScreen = null;
  screenStartTime = null;
}

export function getInAppSessions(): InAppUsageEntry[] {
  return [...inAppSessions];
}

export function clearInAppSessions() {
  inAppSessions = [];
}

// Save sessions to AsyncStorage for persistence
export async function saveSessionsLocally() {
  try {
    const existing = await AsyncStorage.getItem(APP_USAGE_KEY);
    const sessions = existing ? JSON.parse(existing) : [];
    sessions.push(...inAppSessions);
    // Keep only last 7 days
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const filtered = sessions.filter((s: InAppUsageEntry) => new Date(s.timestamp).getTime() > sevenDaysAgo);
    await AsyncStorage.setItem(APP_USAGE_KEY, JSON.stringify(filtered));
    inAppSessions = [];
  } catch (e) {
    console.error("Failed to save app usage sessions:", e);
  }
}

// Get locally stored sessions
export async function getStoredSessions(): Promise<InAppUsageEntry[]> {
  try {
    const data = await AsyncStorage.getItem(APP_USAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

// ============================================================
// EXTERNAL APP USAGE (Android Native Module)
// ============================================================

/**
 * Check if the native UsageStats module is available (Android APK only)
 */
export function isNativeModuleAvailable(): boolean {
  return UsageStatsNative.isAvailable();
}

/**
 * Check if UsageStats permission is granted
 */
export function isUsageStatsPermissionGranted(): boolean {
  if (Platform.OS !== "android") return false;
  return UsageStatsNative.isPermissionGranted();
}

/**
 * Request UsageStats permission - opens system settings
 */
export function requestUsageStatsPermission(): boolean {
  if (Platform.OS !== "android") return false;
  return UsageStatsNative.openPermissionSettings();
}

/**
 * Get external app usage data for a specific day
 * @param daysAgo - 0 for today, 1 for yesterday
 */
export async function getExternalAppUsage(daysAgo: number = 0): Promise<ExternalAppUsage[]> {
  if (Platform.OS !== "android") return [];
  if (!UsageStatsNative.isPermissionGranted()) return [];

  try {
    const data = await UsageStatsNative.getDailyUsage(daysAgo);
    const date = new Date();
    date.setDate(date.getDate() - daysAgo);
    const dateStr = date.toISOString().split("T")[0];

    return data.map((item) => ({
      ...item,
      date: dateStr,
    }));
  } catch {
    return [];
  }
}

/**
 * Get total screen time for a specific day (in seconds)
 */
export async function getTotalScreenTime(daysAgo: number = 0): Promise<number> {
  if (Platform.OS !== "android") return 0;
  return UsageStatsNative.getTotalScreenTime(daysAgo);
}

/**
 * Fetch and store external app usage locally
 */
export async function fetchAndStoreExternalUsage(): Promise<ExternalAppUsage[]> {
  const usage = await getExternalAppUsage(0);
  if (usage.length > 0) {
    try {
      const existing = await AsyncStorage.getItem(EXTERNAL_USAGE_KEY);
      const stored: ExternalAppUsage[] = existing ? JSON.parse(existing) : [];
      // Replace today's data
      const today = new Date().toISOString().split("T")[0];
      const filtered = stored.filter((s) => s.date !== today);
      filtered.push(...usage);
      // Keep only last 7 days
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const dateStr = sevenDaysAgo.toISOString().split("T")[0];
      const final = filtered.filter((s) => s.date >= dateStr);
      await AsyncStorage.setItem(EXTERNAL_USAGE_KEY, JSON.stringify(final));
    } catch (e) {
      console.error("Failed to store external usage:", e);
    }
  }
  return usage;
}

/**
 * Get stored external usage data
 */
export async function getStoredExternalUsage(date?: string): Promise<ExternalAppUsage[]> {
  try {
    const data = await AsyncStorage.getItem(EXTERNAL_USAGE_KEY);
    if (!data) return [];
    const all: ExternalAppUsage[] = JSON.parse(data);
    if (date) return all.filter((s) => s.date === date);
    return all;
  } catch {
    return [];
  }
}

// ============================================================
// SYNC TO SERVER
// ============================================================

/**
 * Sync all usage data (in-app + external) to the server
 */
export async function syncUsageToServer(childAccountId: number, apiBaseUrl: string) {
  try {
    // Gather in-app sessions
    const sessions = await getStoredSessions();
    const screenTotals: Record<string, number> = {};
    for (const s of sessions) {
      screenTotals[s.screen] = (screenTotals[s.screen] || 0) + s.durationSeconds;
    }

    // Gather external app usage
    const externalUsage = await getStoredExternalUsage(new Date().toISOString().split("T")[0]);

    // Combine into unified format
    const today = new Date().toISOString().split("T")[0];
    const allApps = [
      // In-app screens
      ...Object.entries(screenTotals).map(([screen, seconds]) => ({
        packageName: "space.manus.opvoedadvies",
        appName: `Rabbaani - ${screen}`,
        usageSeconds: seconds,
        category: categorizeScreen(screen),
        openCount: 0,
      })),
      // External apps
      ...externalUsage.map((app) => ({
        packageName: app.packageName,
        appName: app.appName,
        usageSeconds: app.usageSeconds,
        category: app.category,
        openCount: app.openCount,
      })),
    ];

    if (allApps.length === 0) return;

    // The actual sync will happen via tRPC in the app
    // Store last sync time
    await AsyncStorage.setItem(LAST_SYNC_KEY, new Date().toISOString());
    
    // Clear synced in-app data
    await AsyncStorage.removeItem(APP_USAGE_KEY);

    return { date: today, apps: allApps, childAccountId };
  } catch (e) {
    console.error("Failed to sync usage to server:", e);
    return null;
  }
}

/**
 * Get last sync time
 */
export async function getLastSyncTime(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(LAST_SYNC_KEY);
  } catch {
    return null;
  }
}

// ============================================================
// HELPERS
// ============================================================

function categorizeScreen(screen: string): string {
  if (screen.includes("dhikr") || screen.includes("quran") || screen.includes("adhkar")) return "islamic";
  if (screen.includes("task") || screen.includes("week")) return "tasks";
  if (screen.includes("chat") || screen.includes("message")) return "communication";
  if (screen.includes("ai") || screen.includes("ask")) return "learning";
  return "other";
}

/**
 * Get category display info (icon + color + label)
 */
export function getCategoryInfo(category: string, language: string = "ar"): { icon: string; color: string; label: string } {
  const labels: Record<string, Record<string, string>> = {
    social: { ar: "تواصل اجتماعي", nl: "Sociale media", en: "Social media" },
    games: { ar: "ألعاب", nl: "Games", en: "Games" },
    media: { ar: "فيديو/وسائط", nl: "Video/media", en: "Video/media" },
    browser: { ar: "متصفح", nl: "Browser", en: "Browser" },
    islamic: { ar: "إسلامي", nl: "Islamitisch", en: "Islamic" },
    education: { ar: "تعليمي", nl: "Educatief", en: "Educational" },
    news: { ar: "أخبار", nl: "Nieuws", en: "News" },
    productivity: { ar: "إنتاجية", nl: "Productiviteit", en: "Productivity" },
    communication: { ar: "تواصل", nl: "Communicatie", en: "Communication" },
    tasks: { ar: "مهام", nl: "Taken", en: "Tasks" },
    learning: { ar: "تعلم", nl: "Leren", en: "Learning" },
    other: { ar: "أخرى", nl: "Overig", en: "Other" },
  };

  const icons: Record<string, string> = {
    social: "👥",
    games: "🎮",
    media: "📺",
    browser: "🌐",
    islamic: "🕌",
    education: "📚",
    news: "📰",
    productivity: "💼",
    communication: "💬",
    tasks: "✅",
    learning: "🧠",
    other: "📱",
  };

  const colors: Record<string, string> = {
    social: "#E91E63",
    games: "#FF5722",
    media: "#9C27B0",
    browser: "#2196F3",
    islamic: "#4CAF50",
    education: "#00BCD4",
    news: "#607D8B",
    productivity: "#795548",
    communication: "#3F51B5",
    tasks: "#8BC34A",
    learning: "#FF9800",
    other: "#9E9E9E",
  };

  return {
    icon: icons[category] || "📱",
    color: colors[category] || "#9E9E9E",
    label: labels[category]?.[language] || labels[category]?.ar || category,
  };
}

/**
 * Format seconds to human-readable duration
 */
export function formatDuration(seconds: number, language: string = "ar"): string {
  if (seconds < 60) {
    return language === "ar" ? `${seconds} ث` : language === "nl" ? `${seconds}s` : `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return language === "ar" ? `${minutes} د` : language === "nl" ? `${minutes} min` : `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMin = minutes % 60;
  if (language === "ar") {
    return remainingMin > 0 ? `${hours} س ${remainingMin} د` : `${hours} س`;
  }
  return remainingMin > 0 ? `${hours}h ${remainingMin}m` : `${hours}h`;
}
