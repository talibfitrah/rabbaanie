import { registerWidgetTaskHandler } from "react-native-android-widget";
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
import { getDhikrForTimeAsync, getDhikrIndex, saveDhikrIndex, getTipIndex, saveTipIndex, getPersonalTips } from "./dhikr-data";
import { getWidgetPrayerData, getWidgetHijriData, getWidgetGoalData, getWidgetTarbiyaTip, TARBIYA_TIPS, TARBIYA_TIPS_I18N } from "./widgetDataProvider";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { loadWidgetSettings, saveWidgetSettings, DEFAULT_WIDGET_SETTINGS } from "@/lib/widget-settings";
import type { FullWidgetSettings } from "@/lib/widget-settings";

registerWidgetTaskHandler(async ({ widgetInfo, widgetAction, clickAction, renderWidget }) => {
  if (widgetAction === "WIDGET_DELETED") return;

  // clickAction contains the actual action string when user taps a widget element
  // widgetAction is always "WIDGET_CLICK" for user interactions
  const action = clickAction || widgetAction as string;

  // Extract widget dimensions for responsive layout
  const widgetWidth = widgetInfo.width || 0;
  const widgetHeight = widgetInfo.height || 0;

  // ============ HANDLE NAVIGATION ACTIONS ============

  // Handle dhikr navigation (independent)
  if (action === "NEXT_DHIKR") {
    const currentIdx = await getDhikrIndex();
    await saveDhikrIndex(currentIdx + 1);
  } else if (action === "PREV_DHIKR") {
    const currentIdx = await getDhikrIndex();
    await saveDhikrIndex(currentIdx - 1);
  }

  // Handle tip navigation (independent)
  if (action === "NEXT_TIP") {
    const currentIdx = await getTipIndex();
    await saveTipIndex(currentIdx + 1);
  } else if (action === "PREV_TIP") {
    const currentIdx = await getTipIndex();
    await saveTipIndex(currentIdx - 1);
  }

  // Handle prayer view toggle (switch between next prayer only / all prayers)
  if (action === "TOGGLE_PRAYER_VIEW") {
    try {
      const currentSettings = await loadWidgetSettings();
      const newShowAll = !currentSettings.content.prayerShowAll;
      const updatedSettings: FullWidgetSettings = {
        ...currentSettings,
        content: { ...currentSettings.content, prayerShowAll: newShowAll },
      };
      await saveWidgetSettings(updatedSettings);
    } catch (e) {
      console.warn("Toggle prayer view error:", e);
    }
  }

  // Handle refresh actions: recalculate prayer times from stored location
  if (action === "REFRESH_WIDGET" || action === "REFRESH_DHIKR") {
    try {
      const locRaw = await AsyncStorage.getItem("@prayer_location");
      if (locRaw) {
        const loc = JSON.parse(locRaw);
        const methodRaw = await AsyncStorage.getItem("@prayer_method");
        const { calculatePrayerTimes, getIslamicDate, CALC_METHODS } = await import("@/lib/prayer-data");
        const method = CALC_METHODS.find((m: any) => m.id === methodRaw) || CALC_METHODS[0];
        const now = new Date();
        const times = calculatePrayerTimes(now, loc.lat, loc.lng, method, loc.tz);
        if (times) {
          await AsyncStorage.setItem("@cached_prayer_times", JSON.stringify({
            fajr: times.fajr, sunrise: times.sunrise, dhuhr: times.dhuhr,
            asr: times.asr, maghrib: times.maghrib, isha: times.isha,
          }));
          const hijri = getIslamicDate(now, times.maghrib, loc.tz);
          await AsyncStorage.setItem("@hijri_date_cache", `${hijri.day} ${hijri.monthName} ${hijri.year}`);
        }
      }
    } catch (e) {
      console.warn("Widget refresh error:", e);
    }
  }

  // ============ LOAD SETTINGS ============

  let settings: FullWidgetSettings;
  try {
    settings = await loadWidgetSettings();
  } catch {
    settings = DEFAULT_WIDGET_SETTINGS;
  }

  const { appearance, content } = settings;
  const widgetName = widgetInfo.widgetName;

  // ============ GET CURRENT TIP ============
  async function getWidgetLang(): Promise<string> {
    try {
      const lang = await AsyncStorage.getItem("@app_language");
      return lang || "ar";
    } catch { return "ar"; }
  }

  async function getCurrentTip(): Promise<string> {
    const tipIdx = await getTipIndex();
    const lang = await getWidgetLang();
    // Try personal tips first
    const personalTips = await getPersonalTips();
    if (personalTips.length > 0) {
      const safeIdx = ((tipIdx % personalTips.length) + personalTips.length) % personalTips.length;
      return personalTips[safeIdx];
    }
    // Fallback to generic tarbiya tips with language support
    const safeIdx = ((tipIdx % TARBIYA_TIPS_I18N.length) + TARBIYA_TIPS_I18N.length) % TARBIYA_TIPS_I18N.length;
    const tip = TARBIYA_TIPS_I18N[safeIdx];
    if (lang === "nl") return tip.nl;
    if (lang === "en") return tip.en;
    return tip.ar;
  }

  async function getTipTotal(): Promise<number> {
    const personalTips = await getPersonalTips();
    return personalTips.length > 0 ? personalTips.length : TARBIYA_TIPS.length;
  }

  // ============ RENDER WIDGETS ============

  try {
    if (widgetName === PRAYER_WIDGET_NAME) {
      let prayerData;
      try {
        prayerData = await getWidgetPrayerData();
      } catch {
        // Fallback: show empty prayer data instead of error
        prayerData = {
          prayers: [
            { name: "fajr", nameAr: "\u0627\u0644\u0641\u062c\u0631", time: "--:--", isNext: false },
            { name: "dhuhr", nameAr: "\u0627\u0644\u0638\u0647\u0631", time: "--:--", isNext: false },
            { name: "asr", nameAr: "\u0627\u0644\u0639\u0635\u0631", time: "--:--", isNext: false },
            { name: "maghrib", nameAr: "\u0627\u0644\u0645\u063a\u0631\u0628", time: "--:--", isNext: false },
            { name: "isha", nameAr: "\u0627\u0644\u0639\u0634\u0627\u0621", time: "--:--", isNext: true },
          ],
          sunrise: "--:--",
          nextPrayer: "fajr",
          nextPrayerAr: "\u0627\u0644\u0641\u062c\u0631",
          nextPrayerTime: "--:--",
          countdown: "",
          hijriDate: "",
          city: "",
        };
      }
      let widgetLang = "ar";
      try {
        const savedLang = await AsyncStorage.getItem("@app_language");
        if (savedLang) widgetLang = savedLang;
      } catch {}
      renderWidget(
        buildPrayerWidgetTree({
          ...prayerData,
          appearance,
          content,
          widgetWidth,
          widgetHeight,
          lang: widgetLang,
        })
      );
    } else if (widgetName === DHIKR_WIDGET_NAME) {
      const dhikrData = await getDhikrForTimeAsync();
      const prayerData = await getWidgetPrayerData();
      const currentTip = await getCurrentTip();
      const tipTotal = await getTipTotal();
      const tipIdx = await getTipIndex();
      const safeTipIdx = ((tipIdx % tipTotal) + tipTotal) % tipTotal;

      renderWidget(
        buildDhikrWidgetTree({
          dhikrText: dhikrData.dhikr.text,
          source: dhikrData.dhikr.source,
          reward: dhikrData.dhikr.reward,
          tarbiyaTip: currentTip,
          contextLabel: dhikrData.contextLabel,
          dhikrIndex: dhikrData.index,
          dhikrTotal: dhikrData.total,
          tipIndex: safeTipIdx,
          tipTotal,
          nextPrayerAr: prayerData.nextPrayerAr,
          nextPrayerTime: prayerData.nextPrayerTime,
          countdown: prayerData.countdown,
          hijriDate: prayerData.hijriDate,
          appearance,
          content,
          widgetWidth,
          widgetHeight,
        })
      );
    } else if (widgetName === GOAL_WIDGET_NAME) {
      const goalData = await getWidgetGoalData();
      const prayerData = await getWidgetPrayerData();
      const currentTip = await getCurrentTip();
      const tipTotal = await getTipTotal();
      const tipIdx = await getTipIndex();
      const safeTipIdx = ((tipIdx % tipTotal) + tipTotal) % tipTotal;

      const widgetLang = await getWidgetLang();
      renderWidget(
        buildGoalWidgetTree({
          goalText: goalData.goalText,
          childName: goalData.childName,
          category: goalData.category,
          dayName: goalData.dayName,
          progressText: goalData.progressText,
          tarbiyaTip: currentTip,
          tipIndex: safeTipIdx,
          tipTotal,
          nextPrayerAr: prayerData.nextPrayerAr,
          nextPrayerTime: prayerData.nextPrayerTime,
          countdown: prayerData.countdown,
          hijriDate: prayerData.hijriDate,
          appearance,
          content,
          widgetWidth,
          widgetHeight,
          lang: widgetLang,
        })
      );
    } else if (widgetName === HIJRI_WIDGET_NAME) {
      const hijriData = await getWidgetHijriData();
      const prayerData = await getWidgetPrayerData();
      const currentTip = await getCurrentTip();
      let hijriLang = "ar";
      try {
        const sl = await AsyncStorage.getItem("@app_language");
        if (sl) hijriLang = sl;
      } catch {}
      renderWidget(
        buildHijriWidgetTree({
          ...hijriData,
          tarbiyaTip: hijriData.event ? undefined : currentTip,
          nextPrayerAr: prayerData.nextPrayerAr,
          nextPrayerTime: prayerData.nextPrayerTime,
          countdown: prayerData.countdown,
          appearance,
          content,
          widgetWidth,
          widgetHeight,
          lang: hijriLang,
        })
      );
    } else if (widgetName === COMBINED_WIDGET_NAME) {
      const prayerData = await getWidgetPrayerData();
      const hijriData = await getWidgetHijriData();
      const goalData = await getWidgetGoalData();
      const dhikrData = await getDhikrForTimeAsync();
      const currentTip = await getCurrentTip();
      const tipTotal = await getTipTotal();
      const tipIdx = await getTipIndex();
      const safeTipIdx = ((tipIdx % tipTotal) + tipTotal) % tipTotal;

      renderWidget(
        buildCombinedWidgetTree({
          nextPrayerAr: prayerData.nextPrayerAr,
          nextPrayerTime: prayerData.nextPrayerTime,
          countdown: prayerData.countdown,
          dhikrText: dhikrData.dhikr.text,
          dhikrIndex: dhikrData.index,
          dhikrTotal: dhikrData.total,
          goalText: currentTip,
          tipIndex: safeTipIdx,
          tipTotal,
          hijriDate: hijriData.hijriDate,
          event: hijriData.event,
          appearance,
          content,
          widgetWidth,
          widgetHeight,
        })
      );
    }
  } catch (error) {
    const { FlexWidget, TextWidget } = require("react-native-android-widget");
    let errorLang = "ar";
    try {
      const sl = await AsyncStorage.getItem("@app_language");
      if (sl) errorLang = sl;
    } catch {}
    const errorMsg = errorLang === "nl" ? "Open de app om gegevens bij te werken" : errorLang === "en" ? "Open the app to update data" : "افتح التطبيق لتحديث البيانات";
    renderWidget(
      <FlexWidget
        style={{
          width: "match_parent",
          height: "match_parent",
          backgroundColor: appearance.backgroundColor,
          padding: 16,
          justifyContent: "center",
          alignItems: "center",
          borderRadius: appearance.cornerStyle === "rounded" ? 16 : 4,
        }}
        clickAction="OPEN_APP"
      >
        <TextWidget
          text={errorMsg}
          style={{ fontSize: 13, color: appearance.textColor, textAlign: "center" }}
        />
      </FlexWidget>
    );
  }
});
