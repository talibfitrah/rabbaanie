import * as BackgroundFetch from "expo-background-fetch";
import * as TaskManager from "expo-task-manager";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

const WIDGET_UPDATE_TASK = "WIDGET_BACKGROUND_UPDATE";

/**
 * Define the background task that refreshes widget data.
 * This runs periodically even when the app is closed.
 */
TaskManager.defineTask(WIDGET_UPDATE_TASK, async () => {
  try {
    // 1. Recalculate prayer times from stored location
    const locRaw = await AsyncStorage.getItem("@prayer_location");
    if (locRaw) {
      const loc = JSON.parse(locRaw);
      const methodRaw = await AsyncStorage.getItem("@prayer_method");
      const { calculatePrayerTimes, getIslamicDate, CALC_METHODS } = require("@/lib/prayer-data");
      const method = CALC_METHODS.find((m: any) => m.id === methodRaw) || CALC_METHODS[0];
      const now = new Date();
      const times = calculatePrayerTimes(now, loc.lat, loc.lng, method, loc.tz);
      if (times) {
        await AsyncStorage.setItem(
          "@cached_prayer_times",
          JSON.stringify({
            fajr: times.fajr,
            sunrise: times.sunrise,
            dhuhr: times.dhuhr,
            asr: times.asr,
            maghrib: times.maghrib,
            isha: times.isha,
          })
        );
        const hijri = getIslamicDate(now, times.maghrib, loc.tz);
        await AsyncStorage.setItem(
          "@hijri_date_cache",
          `${hijri.day} ${hijri.monthName} ${hijri.year}`
        );
      }
    }

    // 2. Refresh all widgets with updated data
    if (Platform.OS === "android") {
      const { refreshAllWidgets } = require("@/widgets/widgetSync");
      await refreshAllWidgets();
    }

    return BackgroundFetch.BackgroundFetchResult.NewData;
  } catch (error) {
    console.warn("[WidgetBGTask] Error:", error);
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

/**
 * Register or update the widget background fetch task with the specified interval.
 * @param intervalMinutes - Update interval in minutes (15, 30, 45, 60, 120)
 */
export async function registerWidgetBackgroundTask(intervalMinutes: number = 30): Promise<void> {
  if (Platform.OS !== "android") return;

  try {
    // Unregister existing task first
    const isRegistered = await TaskManager.isTaskRegisteredAsync(WIDGET_UPDATE_TASK);
    if (isRegistered) {
      await BackgroundFetch.unregisterTaskAsync(WIDGET_UPDATE_TASK);
    }

    // Register with new interval
    await BackgroundFetch.registerTaskAsync(WIDGET_UPDATE_TASK, {
      minimumInterval: intervalMinutes * 60, // Convert to seconds
      stopOnTerminate: false,
      startOnBoot: true,
    });

    // Save the interval setting
    await AsyncStorage.setItem("@widget_update_interval", String(intervalMinutes));

    console.log(`[WidgetBGTask] Registered with interval: ${intervalMinutes} min`);
  } catch (error) {
    console.warn("[WidgetBGTask] Registration failed:", error);
  }
}

/**
 * Unregister the widget background task.
 */
export async function unregisterWidgetBackgroundTask(): Promise<void> {
  if (Platform.OS !== "android") return;

  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(WIDGET_UPDATE_TASK);
    if (isRegistered) {
      await BackgroundFetch.unregisterTaskAsync(WIDGET_UPDATE_TASK);
    }
  } catch (error) {
    console.warn("[WidgetBGTask] Unregister failed:", error);
  }
}

/**
 * Get the current background task status.
 */
export async function getWidgetBackgroundStatus(): Promise<{
  isRegistered: boolean;
  intervalMinutes: number;
}> {
  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(WIDGET_UPDATE_TASK);
    const intervalRaw = await AsyncStorage.getItem("@widget_update_interval");
    const intervalMinutes = intervalRaw ? parseInt(intervalRaw, 10) : 30;
    return { isRegistered, intervalMinutes };
  } catch {
    return { isRegistered: false, intervalMinutes: 30 };
  }
}

/**
 * Trigger widget refresh at adhan time.
 * Called from notification scheduler when a prayer time arrives.
 * This updates all widgets immediately with fresh data including
 * time-appropriate dhikr.
 */
export async function refreshWidgetsOnAdhan(): Promise<void> {
  if (Platform.OS !== "android") return;

  try {
    // Check if updateOnAdhan is enabled
    const settingsRaw = await AsyncStorage.getItem("@widget_settings_v2");
    if (settingsRaw) {
      const settings = JSON.parse(settingsRaw);
      if (settings.timing && settings.timing.updateOnAdhan === false) {
        return; // User disabled adhan-triggered updates
      }
    }

    // Recalculate and refresh
    const locRaw = await AsyncStorage.getItem("@prayer_location");
    if (locRaw) {
      const loc = JSON.parse(locRaw);
      const methodRaw = await AsyncStorage.getItem("@prayer_method");
      const { calculatePrayerTimes, getIslamicDate, CALC_METHODS } = require("@/lib/prayer-data");
      const method = CALC_METHODS.find((m: any) => m.id === methodRaw) || CALC_METHODS[0];
      const now = new Date();
      const times = calculatePrayerTimes(now, loc.lat, loc.lng, method, loc.tz);
      if (times) {
        await AsyncStorage.setItem(
          "@cached_prayer_times",
          JSON.stringify({
            fajr: times.fajr, sunrise: times.sunrise, dhuhr: times.dhuhr,
            asr: times.asr, maghrib: times.maghrib, isha: times.isha,
          })
        );
        const hijri = getIslamicDate(now, times.maghrib, loc.tz);
        await AsyncStorage.setItem("@hijri_date_cache", `${hijri.day} ${hijri.monthName} ${hijri.year}`);
      }
    }

    // Refresh all widgets
    const { refreshAllWidgets } = require("@/widgets/widgetSync");
    await refreshAllWidgets();
    console.log("[WidgetBGTask] Refreshed on adhan");
  } catch (error) {
    console.warn("[WidgetBGTask] Adhan refresh error:", error);
  }
}
