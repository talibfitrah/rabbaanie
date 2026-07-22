/**
 * UsageStats Native Module - TypeScript Interface
 * 
 * Provides access to Android's UsageStatsManager API for monitoring
 * which apps the child uses and for how long.
 * 
 * On iOS and Web, all functions return safe fallback values.
 */

import { Platform } from "react-native";

// Try to import the native module; returns null on platforms without it
let NativeUsageStats: any = null;

if (Platform.OS === "android") {
  try {
    // In production build, this will resolve to the native module
    NativeUsageStats = require("expo-modules-core").requireNativeModule("UsageStats");
  } catch {
    // Module not available (web preview or iOS)
    NativeUsageStats = null;
  }
}

export interface AppUsageData {
  packageName: string;
  appName: string;
  usageSeconds: number;
  openCount: number;
  category: "social" | "games" | "media" | "browser" | "islamic" | "education" | "news" | "productivity" | "other";
  isSystemApp: boolean;
}

/**
 * Check if UsageStats permission is granted
 */
export function isPermissionGranted(): boolean {
  if (!NativeUsageStats) return false;
  try {
    return NativeUsageStats.isPermissionGranted();
  } catch {
    return false;
  }
}

/**
 * Open the system settings for Usage Access permission
 */
export function openPermissionSettings(): boolean {
  if (!NativeUsageStats) return false;
  try {
    return NativeUsageStats.openPermissionSettings();
  } catch {
    return false;
  }
}

/**
 * Get app usage data for a specific day
 * @param daysAgo - 0 for today, 1 for yesterday, etc.
 */
export async function getDailyUsage(daysAgo: number = 0): Promise<AppUsageData[]> {
  if (!NativeUsageStats) return [];
  try {
    return await NativeUsageStats.getDailyUsage(daysAgo);
  } catch {
    return [];
  }
}

/**
 * Get total screen time for a specific day (in seconds)
 * @param daysAgo - 0 for today, 1 for yesterday, etc.
 */
export async function getTotalScreenTime(daysAgo: number = 0): Promise<number> {
  if (!NativeUsageStats) return 0;
  try {
    return await NativeUsageStats.getTotalScreenTime(daysAgo);
  } catch {
    return 0;
  }
}

/**
 * Check if the native module is available (Android only, production build)
 */
export function isAvailable(): boolean {
  return NativeUsageStats !== null && Platform.OS === "android";
}
