import { useState, useEffect, useMemo } from "react";
import { Text, View, ScrollView, Pressable, Platform } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useI18n } from "@/lib/i18n";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { cachePrayerTimesForWidget, cacheHijriForWidget } from "@/widgets/widgetSync";
import {
  PRAYER_LOCATION_KEY,
  PRAYER_METHOD_KEY,
  CALC_METHODS,
  calculatePrayerTimes,
  getCurrentMinutesInTimezone,
  getNextPrayer,
  getIslamicDate,
  COUNTRIES,
  getCityAR,
  getCountryAR,
  type SavedPrayerLocation,
  type CalcMethod,
  type PrayerTimesResult,
} from "@/lib/prayer-data";

const PRAYER_NAMES = {
  fajr: { nl: "Fajr", en: "Fajr", ar: "الفجر" },
  sunrise: { nl: "Shurooq", en: "Sunrise", ar: "الشروق" },
  dhuhr: { nl: "Dhuhr", en: "Dhuhr", ar: "الظهر" },
  asr: { nl: "Asr", en: "Asr", ar: "العصر" },
  maghrib: { nl: "Maghrib", en: "Maghrib", ar: "المغرب" },
  isha: { nl: "Isha", en: "Isha", ar: "العشاء" },
};

const PRAYER_ICONS: Record<string, string> = {
  fajr: "🌅",
  sunrise: "☀️",
  dhuhr: "🌤️",
  asr: "🌇",
  maghrib: "🌆",
  isha: "🌙",
};

export default function PrayerTimesScreen() {
  const colors = useColors();
  const { t, language, isRTL } = useI18n();
  const router = useRouter();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [savedLocation, setSavedLocation] = useState<SavedPrayerLocation | null>(null);
  const [selectedMethod, setSelectedMethod] = useState<CalcMethod>(CALC_METHODS[0]);
  const [loaded, setLoaded] = useState(false);

  // Load saved location + method
  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem(PRAYER_LOCATION_KEY),
      AsyncStorage.getItem(PRAYER_METHOD_KEY),
    ]).then(([locVal, methodVal]) => {
      if (locVal) {
        try { setSavedLocation(JSON.parse(locVal)); } catch (_) {}
      }
      if (methodVal) {
        const found = CALC_METHODS.find(m => m.id === methodVal);
        if (found) setSelectedMethod(found);
      }
      setLoaded(true);
    });
  }, []);

  // Re-load when screen is focused (in case settings changed)
  useEffect(() => {
    const interval = setInterval(() => {
      Promise.all([
        AsyncStorage.getItem(PRAYER_LOCATION_KEY),
        AsyncStorage.getItem(PRAYER_METHOD_KEY),
      ]).then(([locVal, methodVal]) => {
        if (locVal) {
          try { setSavedLocation(JSON.parse(locVal)); } catch (_) {}
        }
        if (methodVal) {
          const found = CALC_METHODS.find(m => m.id === methodVal);
          if (found) setSelectedMethod(found);
        }
      });
    }, 5000); // Check every 5 seconds for updates from settings
    return () => clearInterval(interval);
  }, []);

  // Update time every minute
  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(interval);
  }, []);

  const prayerTimes = useMemo((): PrayerTimesResult | null => {
    if (!savedLocation) return null;
    return calculatePrayerTimes(currentTime, savedLocation.lat, savedLocation.lng, selectedMethod, savedLocation.tz);
  }, [savedLocation, currentTime.toDateString(), selectedMethod]);

  const nextPrayer = useMemo(() => {
    if (!prayerTimes || !savedLocation) return null;
    return getNextPrayer(prayerTimes, currentTime, savedLocation.tz);
  }, [prayerTimes, currentTime, savedLocation]);

  const islamicDate = useMemo(() => {
    return getIslamicDate(currentTime, prayerTimes?.maghrib || null, savedLocation?.tz);
  }, [currentTime, prayerTimes?.maghrib, savedLocation?.tz]);

  const countdown = useMemo(() => {
    if (!prayerTimes || !nextPrayer || !savedLocation) return null;
    const [hh, mm] = prayerTimes[nextPrayer as keyof PrayerTimesResult].split(":").map(Number);
    const curMin = getCurrentMinutesInTimezone(currentTime, savedLocation.tz);
    const diff = (hh * 60 + mm) - curMin;
    if (diff <= 0) return null;
    const hours = Math.floor(diff / 60);
    const mins = diff % 60;
    const h = language === "nl" ? "u" : "h";
    return hours > 0 ? `${hours}${h} ${mins}m` : `${mins} min`;
  }, [prayerTimes, nextPrayer, currentTime, savedLocation, language]);

  // Adhkaar active check
  const activeAdhkaar = useMemo(() => {
    if (!prayerTimes || !savedLocation) return null;
    const cur = getCurrentMinutesInTimezone(currentTime, savedLocation.tz);
    const [fH, fM] = prayerTimes.fajr.split(":").map(Number);
    const [sH, sM] = prayerTimes.sunrise.split(":").map(Number);
    const [aH, aM] = prayerTimes.asr.split(":").map(Number);
    const [mH, mM] = prayerTimes.maghrib.split(":").map(Number);
    if (cur >= fH * 60 + fM && cur < sH * 60 + sM) return "morning";
    if (cur >= aH * 60 + aM && cur < mH * 60 + mM) return "evening";
    return null;
  }, [prayerTimes, currentTime, savedLocation]);

  // Calculate additional times: morning adhkaar, evening adhkaar, half of the night
  const additionalTimes = useMemo(() => {
    if (!prayerTimes || !savedLocation) return null;
    const [fH, fM] = prayerTimes.fajr.split(":").map(Number);
    const [sH, sM] = prayerTimes.sunrise.split(":").map(Number);
    const [aH, aM] = prayerTimes.asr.split(":").map(Number);
    const [mH, mM] = prayerTimes.maghrib.split(":").map(Number);

    // Morning adhkaar time: from Fajr to Sunrise
    const morningStart = `${fH.toString().padStart(2, "0")}:${fM.toString().padStart(2, "0")}`;
    const morningEnd = `${sH.toString().padStart(2, "0")}:${sM.toString().padStart(2, "0")}`;

    // Evening adhkaar time: from Asr to Maghrib
    const eveningStart = `${aH.toString().padStart(2, "0")}:${aM.toString().padStart(2, "0")}`;
    const eveningEnd = `${mH.toString().padStart(2, "0")}:${mM.toString().padStart(2, "0")}`;

    // Half of the night: midpoint between Maghrib and next Fajr
    // Maghrib in minutes from midnight
    const maghribMin = mH * 60 + mM;
    // Fajr next day in minutes (add 24h if fajr < maghrib)
    const fajrMin = fH * 60 + fM;
    const fajrNextDay = fajrMin < maghribMin ? fajrMin + 24 * 60 : fajrMin;
    // Midpoint
    const halfNightMin = Math.round((maghribMin + fajrNextDay) / 2);
    const halfNightH = Math.floor(halfNightMin / 60) % 24;
    const halfNightM = halfNightMin % 60;
    const halfNight = `${halfNightH.toString().padStart(2, "0")}:${halfNightM.toString().padStart(2, "0")}`;

    // Last third of the night: Maghrib + (2/3 of night duration) to Fajr
    const nightDuration = fajrNextDay - maghribMin;
    const lastThirdStart = maghribMin + Math.round((2 * nightDuration) / 3);
    const lastThirdH = Math.floor(lastThirdStart / 60) % 24;
    const lastThirdM = lastThirdStart % 60;
    const lastThird = `${lastThirdH.toString().padStart(2, "0")}:${lastThirdM.toString().padStart(2, "0")}`;

    return { morningStart, morningEnd, eveningStart, eveningEnd, halfNight, lastThird };
  }, [prayerTimes, savedLocation]);

  // === WIDGET SYNC: cache prayer times + hijri date for home screen widgets ===
  useEffect(() => {
    if (!prayerTimes || Platform.OS !== "android") return;
    cachePrayerTimesForWidget({
      fajr: prayerTimes.fajr,
      sunrise: prayerTimes.sunrise,
      dhuhr: prayerTimes.dhuhr,
      asr: prayerTimes.asr,
      maghrib: prayerTimes.maghrib,
      isha: prayerTimes.isha,
    });
  }, [prayerTimes]);

  useEffect(() => {
    if (!islamicDate || Platform.OS !== "android") return;
    const hijriStr = `${islamicDate.day} ${islamicDate.monthName} ${islamicDate.year}`;
    cacheHijriForWidget(hijriStr);
  }, [islamicDate]);

  if (!loaded) return null;

  // ============ NO LOCATION SET ============
  if (!savedLocation) {
    return (
      <ScreenContainer className="px-4 pt-4">
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 20 }}>
          <Text style={{ fontSize: 48, marginBottom: 16 }}>🕌</Text>
          <Text style={{ fontSize: 22, fontWeight: "800", color: colors.foreground, textAlign: "center", marginBottom: 8 }}>
            {t("prayer.title")}
          </Text>
          <Text style={{ fontSize: 14, color: colors.muted, textAlign: "center", marginBottom: 24, lineHeight: 20 }}>
            {t("prayer.no_location")}
          </Text>
          <Pressable
            onPress={() => router.push("/(tabs)/settings")}
            style={({ pressed }) => [{
              backgroundColor: pressed ? colors.primary + "CC" : colors.primary,
              borderRadius: 12,
              paddingVertical: 16,
              paddingHorizontal: 32,
              width: "100%",
              alignItems: "center",
            }]}
          >
            <Text style={{ color: "#fff", fontSize: 16, fontWeight: "700" }}>{t("prayer.go_settings")}</Text>
          </Pressable>
        </View>
      </ScreenContainer>
    );
  }

  // ============ PRAYER TIMES DISPLAY ============
  return (
    
    <ScreenContainer className="px-4 pt-4">
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
        {/* Header */}
        <View style={{ marginBottom: 16 }}>
          <View style={{ flexDirection: isRTL ? "row-reverse" : "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={{ fontSize: 22, fontWeight: "800", color: colors.foreground }}>{t("prayer.title")}</Text>
            <Text style={{ fontSize: 12, color: colors.primary, fontWeight: "600" }}>
              {islamicDate.day} {language === "ar" ? islamicDate.monthNameAR : islamicDate.monthName} {islamicDate.year}
            </Text>
          </View>
          <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>
            {selectedMethod.nameAr} ({selectedMethod.fajrAngle}°)
          </Text>
        </View>

        {/* Location bar */}
        <Pressable
          onPress={() => router.push("/(tabs)/settings")}
          style={({ pressed }) => [{
            backgroundColor: pressed ? colors.primary + "20" : colors.primary + "10",
            borderRadius: 10,
            padding: 12,
            marginBottom: 8,
            flexDirection: isRTL ? "row-reverse" : "row",
            alignItems: "center",
            justifyContent: "space-between",
            borderWidth: 1,
            borderColor: colors.primary + "25",
          }]}
        >
          <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 8 }}>
            <Text style={{ fontSize: 16 }}>{COUNTRIES[savedLocation.country]?.flag || "📍"}</Text>
            <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }}>
              {language === "ar" ? getCityAR(savedLocation.city) : savedLocation.city}, {language === "ar" ? getCountryAR(savedLocation.country) : savedLocation.country}
            </Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text style={{ fontSize: 12, color: colors.primary, fontWeight: "600" }}>{t("prayer.change_location")}</Text>
            <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: colors.primary + "20", alignItems: "center", justifyContent: "center" }}>
              <Text style={{ fontSize: 12 }}>↻</Text>
            </View>
          </View>
        </Pressable>

        {/* Countdown */}
        {countdown && nextPrayer && (
          <View style={{ backgroundColor: colors.primary + "10", borderRadius: 10, padding: 12, marginBottom: 16, alignItems: "center" }}>
            <Text style={{ fontSize: 14, color: colors.primary, fontWeight: "700" }}>
              {PRAYER_NAMES[nextPrayer as keyof typeof PRAYER_NAMES]?.[language] || nextPrayer} {t("prayer.next_in")} {countdown}
            </Text>
          </View>
        )}

        {/* Qibla Compass Button */}
        <Pressable
          onPress={() => router.push("/qibla" as any)}
          style={({ pressed }) => [{
            backgroundColor: pressed ? "#C4A35A20" : "#C4A35A10",
            borderRadius: 14,
            padding: 14,
            marginBottom: 16,
            flexDirection: isRTL ? "row-reverse" : "row",
            alignItems: "center",
            justifyContent: "space-between",
            borderWidth: 1.5,
            borderColor: "#C4A35A40",
          }]}
        >
          <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 10 }}>
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: "#C4A35A20", alignItems: "center", justifyContent: "center" }}>
              <Text style={{ fontSize: 22 }}>🧭</Text>
            </View>
            <View>
              <Text style={{ fontSize: 15, fontWeight: "700", color: "#C4A35A" }}>
                {language === "ar" ? "اتجاه القبلة" : language === "nl" ? "Qibla Richting" : "Qibla Direction"}
              </Text>
              <Text style={{ fontSize: 11, color: colors.muted }}>
                {language === "ar" ? "بوصلة تفاعلية نحو الكعبة" : language === "nl" ? "Interactief kompas naar de Kaaba" : "Interactive compass to the Kaaba"}
              </Text>
            </View>
          </View>
          <Text style={{ fontSize: 18, color: "#C4A35A" }}>{isRTL ? "←" : "→"}</Text>
        </Pressable>

        {/* Adhkaar reminder */}
        {activeAdhkaar && (
          <View style={{
            backgroundColor: activeAdhkaar === "morning" ? "#F59E0B15" : "#8B5CF615",
            borderRadius: 10,
            padding: 12,
            marginBottom: 16,
            flexDirection: isRTL ? "row-reverse" : "row",
            alignItems: "center",
            justifyContent: "space-between",
            borderWidth: 1,
            borderColor: activeAdhkaar === "morning" ? "#F59E0B30" : "#8B5CF630",
          }}>
            <Text style={{ fontSize: 14, fontWeight: "600", color: activeAdhkaar === "morning" ? "#F59E0B" : "#8B5CF6" }}>
              {activeAdhkaar === "morning" ? `🌅 ${t("prayer.morning_adhkaar")}` : `🌆 ${t("prayer.evening_adhkaar")}`}
            </Text>
            <View style={{ backgroundColor: activeAdhkaar === "morning" ? "#F59E0B" : "#8B5CF6", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 }}>
              <Text style={{ color: "#fff", fontSize: 10, fontWeight: "700" }}>{t("prayer.now")}</Text>
            </View>
          </View>
        )}

        {/* Prayer times */}
        {prayerTimes && (
          <View style={{ gap: 8 }}>
            {(["fajr", "sunrise", "dhuhr", "asr", "maghrib", "isha"] as const).map((key) => {
              const isNext = nextPrayer === key;
              return (
                <View
                  key={key}
                  style={{
                    backgroundColor: isNext ? colors.primary + "15" : colors.surface,
                    borderRadius: 14,
                    padding: 14,
                    flexDirection: isRTL ? "row-reverse" : "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    borderWidth: isNext ? 1.5 : 1,
                    borderColor: isNext ? colors.primary + "50" : colors.border,
                  }}
                >
                  <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 10 }}>
                    <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: isNext ? colors.primary + "20" : colors.background, alignItems: "center", justifyContent: "center" }}>
                      <Text style={{ fontSize: 18 }}>{PRAYER_ICONS[key]}</Text>
                    </View>
                    <View>
                      <Text style={{ fontSize: 15, fontWeight: isNext ? "700" : "600", color: isNext ? colors.primary : colors.foreground }}>
                        {PRAYER_NAMES[key][language]}
                      </Text>
                      <Text style={{ fontSize: 11, color: colors.muted }}>{PRAYER_NAMES[key].ar}</Text>
                    </View>
                  </View>
                  <Text style={{ fontSize: 18, fontWeight: isNext ? "800" : "600", color: isNext ? colors.primary : colors.foreground, fontVariant: ["tabular-nums"] }}>
                    {prayerTimes[key]}
                  </Text>
                </View>
              );
            })}
          </View>
        )}

        {/* Additional Times Section */}
        {additionalTimes && (
          <View style={{ marginTop: 20 }}>
            <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground, marginBottom: 10, textAlign: isRTL ? "right" : "left" }}>
              {t("prayer.additional_times")}
            </Text>
            <View style={{ gap: 8 }}>
              {/* Morning Adhkaar */}
              <View style={{ backgroundColor: "#F59E0B10", borderRadius: 14, padding: 14, flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1, borderColor: "#F59E0B25" }}>
                <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 10 }}>
                  <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: "#F59E0B15", alignItems: "center", justifyContent: "center" }}>
                    <Text style={{ fontSize: 18 }}>🌅</Text>
                  </View>
                  <View>
                    <Text style={{ fontSize: 14, fontWeight: "600", color: "#F59E0B" }}>
                      {t("prayer.morning_adhkaar_time")}
                    </Text>
                    <Text style={{ fontSize: 11, color: colors.muted }}>
                      {t("prayer.from_fajr_to_sunrise")}
                    </Text>
                  </View>
                </View>
                <Text style={{ fontSize: 14, fontWeight: "700", color: "#F59E0B", fontVariant: ["tabular-nums"] }}>
                  {additionalTimes.morningStart} - {additionalTimes.morningEnd}
                </Text>
              </View>

              {/* Evening Adhkaar */}
              <View style={{ backgroundColor: "#8B5CF610", borderRadius: 14, padding: 14, flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1, borderColor: "#8B5CF625" }}>
                <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 10 }}>
                  <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: "#8B5CF615", alignItems: "center", justifyContent: "center" }}>
                    <Text style={{ fontSize: 18 }}>🌆</Text>
                  </View>
                  <View>
                    <Text style={{ fontSize: 14, fontWeight: "600", color: "#8B5CF6" }}>
                      {t("prayer.evening_adhkaar_time")}
                    </Text>
                    <Text style={{ fontSize: 11, color: colors.muted }}>
                      {t("prayer.from_asr_to_maghrib")}
                    </Text>
                  </View>
                </View>
                <Text style={{ fontSize: 14, fontWeight: "700", color: "#8B5CF6", fontVariant: ["tabular-nums"] }}>
                  {additionalTimes.eveningStart} - {additionalTimes.eveningEnd}
                </Text>
              </View>

              {/* Half of the Night */}
              <View style={{ backgroundColor: "#1E293B10", borderRadius: 14, padding: 14, flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1, borderColor: "#1E293B25" }}>
                <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 10 }}>
                  <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: "#1E293B15", alignItems: "center", justifyContent: "center" }}>
                    <Text style={{ fontSize: 18 }}>🌙</Text>
                  </View>
                  <View>
                    <Text style={{ fontSize: 14, fontWeight: "600", color: "#1E293B" }}>
                      {t("prayer.half_night")}
                    </Text>
                    <Text style={{ fontSize: 11, color: colors.muted }}>
                      {t("prayer.between_maghrib_fajr")}
                    </Text>
                  </View>
                </View>
                <Text style={{ fontSize: 18, fontWeight: "800", color: "#1E293B", fontVariant: ["tabular-nums"] }}>
                  {additionalTimes.halfNight}
                </Text>
              </View>

              {/* Last Third of the Night */}
              <View style={{ backgroundColor: "#4F46E510", borderRadius: 14, padding: 14, flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1, borderColor: "#4F46E525" }}>
                <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 10 }}>
                  <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: "#4F46E515", alignItems: "center", justifyContent: "center" }}>
                    <Text style={{ fontSize: 18 }}>🤲</Text>
                  </View>
                  <View>
                    <Text style={{ fontSize: 14, fontWeight: "600", color: "#4F46E5" }}>
                      {t("prayer.last_third_night")}
                    </Text>
                    <Text style={{ fontSize: 11, color: colors.muted }}>
                      {t("prayer.last_third_desc")}
                    </Text>
                  </View>
                </View>
                <Text style={{ fontSize: 18, fontWeight: "800", color: "#4F46E5", fontVariant: ["tabular-nums"] }}>
                  {additionalTimes.lastThird}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Method info */}
        <View style={{ marginTop: 20, padding: 12, backgroundColor: colors.surface, borderRadius: 10, borderWidth: 1, borderColor: colors.border }}>
          <Text style={{ fontSize: 11, color: colors.muted, textAlign: "center" }}>
            {t("prayer.method")}: {selectedMethod.name} — Fajr: {selectedMethod.fajrAngle}° | Isha: {selectedMethod.ishaMinutes ? `${selectedMethod.ishaMinutes}m` : `${selectedMethod.ishaAngle}°`} | Asr: {selectedMethod.asrFactor === 1 ? "Shafi'i" : "Hanafi"}
          </Text>
        </View>
      </ScrollView>
    </ScreenContainer>
    
  );
}
