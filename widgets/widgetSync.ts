import { Platform } from "react-native";
import { requestWidgetUpdate } from "react-native-android-widget";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  PRAYER_WIDGET_NAME,
  DHIKR_WIDGET_NAME,
  GOAL_WIDGET_NAME,
  HIJRI_WIDGET_NAME,
  COMBINED_WIDGET_NAME,
} from "./constants";
import { buildPrayerWidgetTree } from "./PrayerWidget";
import { buildDhikrWidgetTree } from "./DhikrWidget";
import { buildGoalWidgetTree } from "./GoalWidget";
import { buildHijriWidgetTree } from "./HijriWidget";
import { buildCombinedWidgetTree } from "./CombinedWidget";
import { getDhikrForTime, getDhikrForTimeAsync } from "./dhikr-data";
import { getWidgetPrayerData, getWidgetHijriData, getWidgetGoalData, getWidgetTarbiyaTip } from "./widgetDataProvider";
import { loadWidgetSettings, DEFAULT_WIDGET_SETTINGS } from "@/lib/widget-settings";
import type { FullWidgetSettings } from "@/lib/widget-settings";

async function getSettings(): Promise<FullWidgetSettings> {
  try {
    return await loadWidgetSettings();
  } catch {
    return DEFAULT_WIDGET_SETTINGS;
  }
}

/**
 * Refresh all widgets with latest data.
 */
export async function refreshAllWidgets(): Promise<void> {
  if (Platform.OS !== "android") return;

  const settings = await getSettings();
  const { appearance, content } = settings;

  try {
    // Get user language for widget
    let widgetLang = "ar";
    try {
      const savedLang = await AsyncStorage.getItem("@app_language");
      if (savedLang) widgetLang = savedLang;
    } catch {}

    // Prayer Widget
    const prayerData = await getWidgetPrayerData();
    await requestWidgetUpdate({
      widgetName: PRAYER_WIDGET_NAME,
      renderWidget: () =>
        buildPrayerWidgetTree({
          ...prayerData,
          appearance,
          content,
          lang: widgetLang,
        }),
    }).catch(() => {});

    // Dhikr Widget - time-aware
    const dhikrData = await getDhikrForTimeAsync();
    const dhikrTip = getWidgetTarbiyaTip(widgetLang);
    await requestWidgetUpdate({
      widgetName: DHIKR_WIDGET_NAME,
      renderWidget: () =>
        buildDhikrWidgetTree({
          dhikrText: dhikrData.dhikr.text,
          source: dhikrData.dhikr.source,
          reward: dhikrData.dhikr.reward,
          tarbiyaTip: dhikrTip,
          contextLabel: dhikrData.contextLabel,
          nextPrayerAr: prayerData.nextPrayerAr,
          nextPrayerTime: prayerData.nextPrayerTime,
          countdown: prayerData.countdown,
          hijriDate: prayerData.hijriDate,
          appearance,
          content,
        }),
    }).catch(() => {});

    // Goal Widget
    const goalData = await getWidgetGoalData();
    const tarbiyaTip = getWidgetTarbiyaTip(widgetLang);
    await requestWidgetUpdate({
      widgetName: GOAL_WIDGET_NAME,
      renderWidget: () =>
        buildGoalWidgetTree({
          goalText: goalData.goalText,
          childName: goalData.childName,
          category: goalData.category,
          dayName: goalData.dayName,
          progressText: goalData.progressText,
          tarbiyaTip,
          nextPrayerAr: prayerData.nextPrayerAr,
          nextPrayerTime: prayerData.nextPrayerTime,
          countdown: prayerData.countdown,
          hijriDate: prayerData.hijriDate,
          appearance,
          content,
          lang: widgetLang,
        }),
    }).catch(() => {});

    // Hijri Widget
    const hijriData = await getWidgetHijriData();
    await requestWidgetUpdate({
      widgetName: HIJRI_WIDGET_NAME,
      renderWidget: () =>
        buildHijriWidgetTree({
          ...hijriData,
          tarbiyaTip: hijriData.event ? undefined : tarbiyaTip,
          nextPrayerAr: prayerData.nextPrayerAr,
          nextPrayerTime: prayerData.nextPrayerTime,
          countdown: prayerData.countdown,
          appearance,
          content,
          lang: widgetLang,
        }),
    }).catch(() => {});

    // Combined Widget
    await requestWidgetUpdate({
      widgetName: COMBINED_WIDGET_NAME,
      renderWidget: () =>
        buildCombinedWidgetTree({
          nextPrayerAr: prayerData.nextPrayerAr,
          nextPrayerTime: prayerData.nextPrayerTime,
          countdown: prayerData.countdown,
      dhikrText: dhikrData.dhikr.text,
      goalText: goalData.goalText,
          hijriDate: hijriData.hijriDate,
          event: hijriData.event,
          appearance,
          content,
        }),
    }).catch(() => {});
  } catch {
    // Widget not on screen or native module not available
  }
}

/**
 * Refresh only the prayer widget (call after prayer time changes)
 */
export async function refreshPrayerWidget(): Promise<void> {
  if (Platform.OS !== "android") return;
  try {
    const settings = await getSettings();
    const prayerData = await getWidgetPrayerData();
    let widgetLang2 = "ar";
    try {
      const savedLang = await AsyncStorage.getItem("@app_language");
      if (savedLang) widgetLang2 = savedLang;
    } catch {}
    await requestWidgetUpdate({
      widgetName: PRAYER_WIDGET_NAME,
      renderWidget: () =>
        buildPrayerWidgetTree({
          ...prayerData,
          appearance: settings.appearance,
          content: settings.content,
          lang: widgetLang2,
        }),
    });
  } catch {}
}

/**
 * Cache daily goal for widget access
 */
export async function cacheGoalForWidget(text: string, childName?: string, category?: string): Promise<void> {
  try {
    await AsyncStorage.setItem(
      "@widget_daily_goal",
      JSON.stringify({ text, childName, category: category || "تربية" })
    );
    if (Platform.OS === "android") {
      const settings = await getSettings();
      const goalData = await getWidgetGoalData();
      let wLang = "ar";
      try { const sl = await AsyncStorage.getItem("@app_language"); if (sl) wLang = sl; } catch {}
      await requestWidgetUpdate({
        widgetName: GOAL_WIDGET_NAME,
        renderWidget: () =>
          buildGoalWidgetTree({
            goalText: text,
            childName: childName,
            category: category || "تربية",
            dayName: goalData.dayName,
            appearance: settings.appearance,
            content: settings.content,
            lang: wLang,
          }),
      }).catch(() => {});
    }
  } catch {}
}

/**
 * Cache Hijri date and event for widget
 */
export async function cacheHijriForWidget(hijriDate: string, event?: string): Promise<void> {
  try {
    await AsyncStorage.setItem("@hijri_date_cache", hijriDate);
    if (event) {
      await AsyncStorage.setItem("@hijri_event_cache", event);
    } else {
      await AsyncStorage.removeItem("@hijri_event_cache");
    }
  } catch {}
}

/**
 * Cache prayer times for widget
 */
export async function cachePrayerTimesForWidget(times: Record<string, string>): Promise<void> {
  try {
    await AsyncStorage.setItem("@cached_prayer_times", JSON.stringify(times));
    await refreshPrayerWidget();
  } catch {}
}
