import React, { useState, useEffect, useMemo, useCallback } from "react";
import { View, Text, ScrollView, ActivityIndicator, Pressable, LayoutAnimation, Platform, UIManager, StyleSheet } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppState } from "@/lib/app-context";
import { calculateAgeInWeeks, getYearKey, getWeekInYear, type DailyCheckin } from "@/lib/store";
import { useI18n } from "@/lib/i18n";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { PRAYER_LOCATION_KEY, PRAYER_METHOD_KEY, CALC_METHODS, calculatePrayerTimes, getNextPrayer, getCurrentMinutesInTimezone, getIslamicDate, getCityAR, type SavedPrayerLocation, type CalcMethod, type PrayerTimesResult } from "@/lib/prayer-data";
import { loadNotificationPrefs, type NotificationPrefs } from "@/lib/notifications";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import Svg, { Path, Circle, Rect } from "react-native-svg";
import { useMultipleYearData } from "@/hooks/use-weekly-data";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/hooks/use-auth";
import { checkNightAppOpen, QIYAM_HADITH, QIYAM_INSTRUCTIONS } from "@/lib/islamic-reminders";
import { SyncToast } from "@/components/sync-toast";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type Lang = "nl" | "en" | "ar";

function tx(lang: Lang, nl: string, en: string, ar: string): string {
  if (lang === "en") return en;
  if (lang === "ar") return ar;
  return nl;
}

// ============ HIJRI CONVERSION ============
function gregorianToHijri(gDate: Date): { year: number; month: number; day: number; monthName: string; monthNameAR: string } {
  const d = gDate.getDate();
  const m = gDate.getMonth() + 1;
  const y = gDate.getFullYear();
  const jd = Math.floor((1461 * (y + 4800 + Math.floor((m - 14) / 12))) / 4) +
    Math.floor((367 * (m - 2 - 12 * Math.floor((m - 14) / 12))) / 12) -
    Math.floor((3 * Math.floor((y + 4900 + Math.floor((m - 14) / 12)) / 100)) / 4) + d - 32075;
  const l = (jd - 2) - 1948440 + 10632;
  const n = Math.floor((l - 1) / 10631);
  const lRem = l - 10631 * n + 354;
  const j = Math.floor((10985 - lRem) / 5316) * Math.floor((50 * lRem) / 17719) +
    Math.floor(lRem / 5670) * Math.floor((43 * lRem) / 15238);
  const lFinal = lRem - Math.floor((30 - j) / 15) * Math.floor((17719 * j) / 50) -
    Math.floor(j / 16) * Math.floor((15238 * j) / 43) + 29;
  const hMonth = Math.floor((24 * lFinal) / 709);
  const hDay = lFinal - Math.floor((709 * hMonth) / 24);
  const hYear = 30 * n + j - 30;
  const hijriMonths = ["Muharram", "Safar", "Rabee' al-Awwal", "Rabee' ath-Thaani", "Jumaada al-Oola", "Jumaada ath-Thaaniya", "Rajab", "Sha'baan", "Ramadhaan", "Shawwaal", "Dhul-Qi'dah", "Dhul-Hijjah"];
  const hijriMonthsAR = ["المحرّم", "صفر", "ربيع الأول", "ربيع الثاني", "جمادى الأولى", "جمادى الثانية", "رجب", "شعبان", "رمضان", "شوال", "ذو القعدة", "ذو الحجة"];
  return { year: hYear, month: hMonth, day: hDay, monthName: hijriMonths[(hMonth - 1) % 12] || "Muharram", monthNameAR: hijriMonthsAR[(hMonth - 1) % 12] || "المحرّم" };
}

// ============ MOSQUE SVG ============
function MosqueSvg({ size = 28 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Path d="M50 10 C50 10 35 25 35 35 L35 70 L65 70 L65 35 C65 25 50 10 50 10Z" fill="#1B4332" />
      <Rect x="45" y="5" width="10" height="12" fill="#1B4332" rx="5" />
      <Circle cx="50" cy="5" r="3" fill="#C4A35A" />
      <Rect x="38" y="70" width="24" height="20" fill="#1B4332" />
      <Path d="M38 70 L50 60 L62 70Z" fill="#1B4332" />
      <Rect x="46" y="75" width="8" height="15" fill="#FFFFFF" rx="4" />
      <Rect x="25" y="45" width="8" height="45" fill="#1B4332" />
      <Rect x="67" y="45" width="8" height="45" fill="#1B4332" />
      <Circle cx="29" cy="42" r="5" fill="#C4A35A" />
      <Circle cx="71" cy="42" r="5" fill="#C4A35A" />
    </Svg>
  );
}

// ============ PROGRESS KEY ============
const PROGRESS_KEY = "@weekly_progress";

// ============ MAIN SCREEN ============
export default function AlgemeenScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { state, loading, saveDailyCheckin, rehydrateFromServer } = useAppState();
  const { t, language, isRTL, languageSelected } = useI18n();
  const lang = language as Lang;
  const [currentTime, setCurrentTime] = useState(new Date());
  const [prayerLocation, setPrayerLocation] = useState<SavedPrayerLocation | null>(null);
  const [prayerMethod, setPrayerMethod] = useState<CalcMethod>(CALC_METHODS[0]);
  const [completedGoals, setCompletedGoals] = useState<string[]>([]);
  // Daily check-in state
  const todayDateStr = currentTime.toISOString().slice(0, 10);
  const todayCheckin = state.dailyCheckins?.find((c) => c.date === todayDateStr);
  const [checkinPrayer, setCheckinPrayer] = useState(todayCheckin?.prayer || "");
  const [checkinMood, setCheckinMood] = useState(todayCheckin?.mood || "");
  const [checkinSaved, setCheckinSaved] = useState(!!todayCheckin);
  const [checkinDismissed, setCheckinDismissed] = useState(!!todayCheckin);
  const [checkinShowConfirm, setCheckinShowConfirm] = useState(false);
  const [childrenExpanded, setChildrenExpanded] = useState(false);
  const [quickActionsExpanded, setQuickActionsExpanded] = useState(true);
  const { isAuthenticated } = useAuth();
  const coParentsQuery = trpc.links.coParents.useQuery(undefined, { enabled: isAuthenticated, refetchOnMount: "always", staleTime: 0 });
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const syncMutation = trpc.links.syncWithPartner.useMutation();
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [toastType, setToastType] = useState<"success" | "info" | "error">("success");
  const [showQiyamReminder, setShowQiyamReminder] = useState(false);

  // Auto-refetch partner data when authentication state changes
  useEffect(() => {
    if (isAuthenticated) {
      coParentsQuery.refetch();
    }
  }, [isAuthenticated]);

  // Sync from store when loaded
  useEffect(() => {
    if (todayCheckin) {
      setCheckinPrayer(todayCheckin.prayer);
      setCheckinMood(todayCheckin.mood);
      setCheckinSaved(true);
      setCheckinDismissed(true);
    }
  }, [todayCheckin?.prayer, todayCheckin?.mood]);

  const handleCheckinAnswer = (type: "prayer" | "mood", value: string) => {
    if (type === "prayer") setCheckinPrayer(value);
    if (type === "mood") setCheckinMood(value);
  };

  const showToast = (msg: string, type: "success" | "info" | "error" = "success") => {
    setToastMessage(msg);
    setToastType(type);
    setToastVisible(true);
  };

  const handleSync = async () => {
    if (syncing || !isAuthenticated) return;
    setSyncing(true);
    setSyncResult(null);
    try {
      const result = await syncMutation.mutateAsync();
      if (result.success) {
        const m = result.merged;
        const total = (m?.children || 0) + (m?.environments || 0) + (m?.issues || 0) + (m?.actionPlans || 0);
        // Refresh local state from server to include merged data
        await rehydrateFromServer();
        // Save detailed sync report
        try {
          const report = { timestamp: new Date().toISOString(), merged: m, total };
          const existing = await AsyncStorage.getItem("sync_reports");
          const reports = existing ? JSON.parse(existing) : [];
          reports.unshift(report);
          await AsyncStorage.setItem("sync_reports", JSON.stringify(reports.slice(0, 50)));
        } catch {}
        if (total > 0) {
          // Build detailed toast message
          const parts: string[] = [];
          if (m?.children) parts.push(lang === "ar" ? `${m.children} طفل` : lang === "en" ? `${m.children} child(ren)` : `${m.children} kind(eren)`);
          if (m?.environments) parts.push(lang === "ar" ? `${m.environments} بيئة` : lang === "en" ? `${m.environments} environment(s)` : `${m.environments} omgeving(en)`);
          if (m?.issues) parts.push(lang === "ar" ? `${m.issues} مشكلة` : lang === "en" ? `${m.issues} issue(s)` : `${m.issues} probleem/problemen`);
          if (m?.actionPlans) parts.push(lang === "ar" ? `${m.actionPlans} خطة علاج` : lang === "en" ? `${m.actionPlans} plan(s)` : `${m.actionPlans} actieplan(nen)`);
          const detail = parts.join(" + ");
          const msg = lang === "ar" ? `تمت المزامنة: ${detail}` : lang === "en" ? `Synced: ${detail}` : `Gesynchroniseerd: ${detail}`;
          showToast(msg, "success");
          setSyncResult(msg);
        } else {
          const msg = tx(lang, "Alles is up-to-date", "Everything is up-to-date", "كل شيء محدّث");
          showToast(msg, "info");
          setSyncResult(msg);
        }
      } else {
        const msg = tx(lang, "Geen partner gekoppeld", "No partner linked", "لا يوجد شريك مرتبط");
        showToast(msg, "error");
        setSyncResult(msg);
      }
    } catch {
      const msg = tx(lang, "Synchronisatie mislukt", "Sync failed", "فشلت المزامنة");
      showToast(msg, "error");
      setSyncResult(msg);
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncResult(null), 4000);
    }
  };

  const handleCheckinSubmit = async () => {
    if (!checkinPrayer || !checkinMood) return;
    const checkin: DailyCheckin = {
      date: todayDateStr,
      prayer: checkinPrayer,
      mood: checkinMood,
      timestamp: new Date().toISOString(),
    };
    await saveDailyCheckin(checkin);
    setCheckinSaved(true);
    setCheckinShowConfirm(true);
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setTimeout(() => {
      setCheckinDismissed(true);
      setCheckinShowConfirm(false);
    }, 2000);
  };

  const reloadPrayerData = useCallback(() => {
    Promise.all([
      AsyncStorage.getItem(PRAYER_LOCATION_KEY),
      AsyncStorage.getItem(PRAYER_METHOD_KEY),
      AsyncStorage.getItem(PROGRESS_KEY),
    ]).then(([locVal, methodVal, progressVal]) => {
      if (locVal) { try { setPrayerLocation(JSON.parse(locVal)); } catch (_) {} }
      if (methodVal) {
        const found = CALC_METHODS.find(m => m.id === methodVal);
        if (found) setPrayerMethod(found);
      }
      if (progressVal) { try { setCompletedGoals(JSON.parse(progressVal)); } catch (_) {} }
    });
  }, []);

  // Re-read on every focus (not just cold start), so a location set on the
  // Settings or Qibla screen updates the home screen's prayer times immediately.
  useFocusEffect(reloadPrayerData);

  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 30000);
    return () => clearInterval(interval);
  }, []);

  // Smart night detection - show qiyam reminder if app opened at night
  useEffect(() => {
    if (Platform.OS === "web") return;
    checkNightAppOpen(lang).then((result) => {
      if (result && result.shouldShow) {
        setShowQiyamReminder(true);
      }
    }).catch(() => {});
  }, []);

  const prayerTimes = useMemo((): PrayerTimesResult | null => {
    if (!prayerLocation) return null;
    return calculatePrayerTimes(currentTime, prayerLocation.lat, prayerLocation.lng, prayerMethod, prayerLocation.tz);
  }, [prayerLocation, currentTime.toDateString(), prayerMethod]);

  const nextPrayer = useMemo(() => {
    if (!prayerTimes || !prayerLocation) return null;
    return getNextPrayer(prayerTimes, currentTime, prayerLocation.tz);
  }, [prayerTimes, currentTime, prayerLocation]);

  const prayerCountdown = useMemo(() => {
    if (!prayerTimes || !nextPrayer || !prayerLocation) return null;
    const timeStr = prayerTimes[nextPrayer as keyof PrayerTimesResult];
    const [hh, mm] = timeStr.split(":").map(Number);
    const curMin = getCurrentMinutesInTimezone(currentTime, prayerLocation.tz);
    let diff = (hh * 60 + mm) - curMin;
    if (diff <= 0) diff += 1440;
    return `${String(Math.floor(diff / 60)).padStart(2, "0")}:${String(diff % 60).padStart(2, "0")}`;
  }, [prayerTimes, nextPrayer, currentTime, prayerLocation]);

  const PRAYER_NAMES: Record<string, { nl: string; en: string; ar: string }> = {
    fajr: { nl: "Fajr", en: "Fajr", ar: "الفجر" },
    sunrise: { nl: "Shurooq", en: "Sunrise", ar: "الشروق" },
    dhuhr: { nl: "Dhuhr", en: "Dhuhr", ar: "الظهر" },
    asr: { nl: "Asr", en: "Asr", ar: "العصر" },
    maghrib: { nl: "Maghrib", en: "Maghrib", ar: "المغرب" },
    isha: { nl: "Isha", en: "Isha", ar: "العشاء" },
  };

  const hijri = useMemo(() => {
    const maghrib = prayerTimes?.maghrib || null;
    const tz = prayerLocation?.tz;
    return getIslamicDate(currentTime, maghrib, tz);
  }, [currentTime.toDateString(), prayerTimes, prayerLocation]);

  const daysAr = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
  const daysEn = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const daysNl = ["Zondag", "Maandag", "Dinsdag", "Woensdag", "Donderdag", "Vrijdag", "Zaterdag"];
  const dayName = lang === "ar" ? daysAr[currentTime.getDay()] : lang === "en" ? daysEn[currentTime.getDay()] : daysNl[currentTime.getDay()];
  const hijriDateStr = `${dayName} ${hijri.day} ${lang === "ar" ? hijri.monthNameAR : hijri.monthName} ${hijri.year}`;
  const monthsAr = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
  const monthsEn = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const monthsNl = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];
  const gregMonth = lang === "ar" ? monthsAr[currentTime.getMonth()] : lang === "en" ? monthsEn[currentTime.getMonth()] : monthsNl[currentTime.getMonth()];
  const gregorianDateStr = `${currentTime.getDate()} ${gregMonth} ${currentTime.getFullYear()}`;
  const cityName = prayerLocation?.city || state.locationSettings?.city || "";
  const displayCity = lang === "ar" ? getCityAR(cityName) : cityName;

  // Compute year keys needed for all children
  const childYearKeys = useMemo(() => {
    return state.children.map((child) => {
      const age = child.birthDate ? calculateAgeInWeeks(child.birthDate) : null;
      return age ? getYearKey(age.years) : "Jaar 0";
    });
  }, [state.children]);
  // Fetch year data from server (lazy, cached)
  const yearDataMap = useMultipleYearData(childYearKeys);
  // Weekly progress per child
  const childProgress = useMemo(() => {
    // Sort children by age (oldest first)
    const sortedChildren = [...state.children].sort((a, b) => {
      if (!a.birthDate && !b.birthDate) return 0;
      if (!a.birthDate) return 1;
      if (!b.birthDate) return -1;
      return new Date(a.birthDate).getTime() - new Date(b.birthDate).getTime();
    });
    return sortedChildren.map((child) => {
      const age = child.birthDate ? calculateAgeInWeeks(child.birthDate) : null;
      const yearKey = age ? getYearKey(age.years) : "Jaar 0";
      const weekInYear = age ? getWeekInYear(age.totalWeeks, age.years) : 1;
      const yearInfo = yearDataMap[yearKey];
      const availableWeeks = yearInfo?.weeks || [];
      const weekIdx = availableWeeks.findIndex((w: any) => w.week === weekInYear);
      const activeWeek = weekIdx >= 0 ? availableWeeks[weekIdx] : availableWeeks[0];

      let totalGoals = 0;
      let completedCount = 0;
      if (activeWeek) {
        const categories = ["tasfiyah", "tazkiyah", "tarbiyah"];
        categories.forEach(cat => {
          const goals = activeWeek[cat] || [];
          totalGoals += goals.length;
          goals.forEach((_: any, idx: number) => {
            const id = `${child.id}_${yearKey}_w${weekInYear}_${cat}_${idx}`;
            if (completedGoals.includes(id)) completedCount++;
          });
        });
      }

      // Get today's tip for this child
      let todayTip = "";
      if (age) {
        if (age.years < 2) todayTip = tx(lang, "Veel huid-op-huid contact en liefde tonen", "Lots of skin-to-skin contact and showing love", "أكثر من التلامس والحنان");
        else if (age.years < 4) todayTip = tx(lang, "Speel bewust — leer via spel", "Play intentionally — learn through play", "العب بوعي — علّم من خلال اللعب");
        else if (age.years < 7) todayTip = tx(lang, "Verhalen van Profeten vertellen", "Tell stories of the Prophets", "اقصص قصص الأنبياء");
        else if (age.years < 10) todayTip = tx(lang, "Gebed aanleren — 7 jaar = begin", "Teach prayer — 7 years = start", "علّمه الصلاة — ٧ سنوات = البداية");
        else if (age.years < 13) todayTip = tx(lang, "Puberteit voorbereiden — islamitisch", "Prepare for puberty — Islamic", "التحضير للبلوغ — منظور إسلامي");
        else todayTip = tx(lang, "Behandel als volwassene — respect", "Treat as adult — respect", "عامله كراشد — احترام وحوار");
      }

      return {
        child,
        age,
        yearKey,
        weekInYear,
        totalGoals,
        completedCount,
        progressPercent: totalGoals > 0 ? Math.round((completedCount / totalGoals) * 100) : 0,
        todayTip,
      };
    });
  }, [state.children, completedGoals, lang]);

  // Today's main tip
  const todayMainTip = useMemo(() => {
    const dow = currentTime.getDay();
    if (dow === 5) return tx(lang, "Vandaag is Jumu'ah — lees Soerah al-Kahf en stuur salawaat", "Today is Jumu'ah — read Surah al-Kahf and send salawaat", "اليوم جمعة — اقرأ سورة الكهف وأكثر من الصلاة على النبي ﷺ");
    if (dow === 1) return tx(lang, "Maandag — soennah vasten aanbevolen", "Monday — fasting recommended", "اليوم الاثنين — صيام مستحب");
    if (dow === 4) return tx(lang, "Donderdag — soennah vasten aanbevolen", "Thursday — fasting recommended", "اليوم الخميس — صيام مستحب");
    return tx(lang, "Vergeet ochtend- en avondadhkaar niet", "Don't forget morning and evening adhkaar", "لا تنسَ أذكار الصباح والمساء");
  }, [currentTime.getDay(), lang]);

  if (loading) {
    return <View style={s.loadingWrap}><ActivityIndicator size="large" color="#1B4332" /></View>;
  }

  if (!state.onboardingCompleted) {
    // If language not yet selected, go to language selection first
    if (!languageSelected) {
      setTimeout(() => router.replace("/language-select"), 0);
    } else {
      setTimeout(() => router.replace("/onboarding"), 0);
    }
    return <View style={s.loadingWrap}><ActivityIndicator size="large" color="#1B4332" /></View>;
  }

  // Gate: mandatory basic info must be filled
  const hasAddress = !!(state.parentProfile.streetHouseNumber || state.parentProfile.address);
  const basicInfoComplete = !!(state.parentProfile.firstName && state.parentProfile.lastName && state.parentProfile.birthDate && hasAddress && state.parentProfile.gender && state.parentProfile.phoneNumber);
  if (!basicInfoComplete) {
    setTimeout(() => router.replace("/onboarding"), 0);
    return <View style={s.loadingWrap}><ActivityIndicator size="large" color="#1B4332" /></View>;
  }

  // Permissions setup is now optional - accessible from Settings

  return (
    
    <>
    <ScrollView style={s.scroll} contentContainerStyle={{ paddingBottom: insets.bottom + 100 }} showsVerticalScrollIndicator={false}>

      {/* ═══════════ HEADER ═══════════ */}
      <View style={[s.header, { paddingTop: insets.top + 12 }]}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Pressable onPress={() => router.push("/(tabs)/settings")} style={({ pressed }) => [s.settingsBtn, pressed && { opacity: 0.5 }]}>
            <MaterialIcons name="settings" size={22} color="#6B7B72" />
          </Pressable>
          {isAuthenticated && (
            <Pressable onPress={handleSync} style={({ pressed }) => [s.settingsBtn, pressed && { opacity: 0.5 }]}>
              {syncing ? <ActivityIndicator size={18} color="#1B4332" /> : <MaterialIcons name="sync" size={22} color="#1B4332" />}
            </Pressable>
          )}
          <Pressable onPress={() => router.push("/child-account/login" as any)} style={({ pressed }) => [s.settingsBtn, { backgroundColor: "#E3F2FD" }, pressed && { opacity: 0.5 }]}>
            <MaterialIcons name="child-care" size={22} color="#1565C0" />
          </Pressable>
        </View>
        <Text style={s.headerTitle}>تربية <Text style={s.headerTitleEn}>Tarbiyah</Text></Text>
      </View>
      {syncResult && (
        <View style={{ backgroundColor: "#E8F5E9", paddingHorizontal: 16, paddingVertical: 8, marginHorizontal: 16, borderRadius: 8, marginBottom: 8 }}>
          <Text style={{ color: "#1B4332", fontSize: 13, textAlign: "center", fontWeight: "500" }}>{syncResult}</Text>
        </View>
      )}

      {/* ═══════════ QIYAM NIGHT BANNER ═══════════ */}
      {showQiyamReminder && (
        <Pressable
          onPress={() => { setShowQiyamReminder(false); router.push("/qiyam" as any); }}
          style={({ pressed }) => [s.qiyamBanner, pressed && { opacity: 0.9 }]}
        >
          <View style={s.qiyamBannerInner}>
            <MaterialIcons name="nightlight-round" size={28} color="#C4A35A" />
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={s.qiyamTitle}>
                {tx(lang, "Nachtgebed - Sta op en bid!", "Night Prayer - Rise and pray!", "قيام الليل - قم فصلِّ!")}
              </Text>
              <Text style={s.qiyamSubtitle} numberOfLines={2}>
                {tx(lang,
                  "Wie 's nachts wakker wordt en Allaah gedenkt, wordt verhoord.",
                  "Whoever wakes at night and remembers Allaah, will be answered.",
                  "من تعارَّ من الليل فذكر الله استُجيب له"
                )}
              </Text>
            </View>
            <MaterialIcons name="chevron-right" size={24} color="#C4A35A" />
          </View>
          <Pressable
            onPress={() => setShowQiyamReminder(false)}
            style={({ pressed }) => [s.qiyamDismiss, pressed && { opacity: 0.5 }]}
          >
            <MaterialIcons name="close" size={18} color="#8BA4B8" />
          </Pressable>
        </Pressable>
      )}

      {/* ═══════════ DATE PILL ═══════════ */}
      <View style={s.datePill}>
        <MaterialIcons name="event" size={14} color="#1B4332" />
        <Text style={s.dateText}>{hijriDateStr}</Text>
        {displayCity ? (
          <>
            <Text style={s.dateSep}>•</Text>
            <Text style={s.dateText}>{displayCity}</Text>
            <MaterialIcons name="place" size={14} color="#1B4332" />
          </>
        ) : null}
      </View>
      <Text style={s.gregorianDate}>{gregorianDateStr}</Text>

      {/* ═══════════ PRAYER CARD (always visible) ═══════════ */}
      {nextPrayer && prayerCountdown && prayerTimes ? (
        <Pressable onPress={() => router.push("/(tabs)/prayer-times")} style={({ pressed }) => [s.prayerCard, pressed && { opacity: 0.95 }]}>
          <View style={s.prayerCardInner}>
            <View style={s.prayerLeft}>
              <MosqueSvg size={26} />
              <Text style={s.prayerLabel}>{tx(lang, "Volgende", "Next", "القادمة")}</Text>
            </View>
            <View style={s.prayerCenter}>
              <Text style={s.prayerName}>{PRAYER_NAMES[nextPrayer]?.[lang] || nextPrayer}</Text>
              <Text style={s.prayerTime}>{prayerTimes[nextPrayer as keyof PrayerTimesResult]}</Text>
            </View>
            <View style={s.prayerRight}>
              <Text style={s.countdownLabel}>{tx(lang, "Resterend", "Remaining", "متبقي")}</Text>
              <Text style={s.countdownText}>{prayerCountdown}</Text>
            </View>
          </View>
          {/* Adhkar quick buttons */}
          <View style={s.adhkarRow}>
            <Pressable
              onPress={() => router.push({ pathname: "/details/adhkar", params: { type: currentTime.getHours() < 15 ? "morning" : "evening" } })}
              style={({ pressed }) => [s.adhkarChip, { backgroundColor: currentTime.getHours() < 15 ? "#FFF8E1" : "#EDE7F6" }, pressed && { opacity: 0.7 }]}
            >
              <MaterialIcons name={currentTime.getHours() < 15 ? "wb-sunny" : "nights-stay"} size={14} color={currentTime.getHours() < 15 ? "#F59E0B" : "#5E35B1"} />
              <Text style={[s.adhkarText, { color: currentTime.getHours() < 15 ? "#92400E" : "#4A148C" }]}>
                {currentTime.getHours() < 15 ? tx(lang, "Ochtendadhkaar", "Morning adhkaar", "أذكار الصباح") : tx(lang, "Avondadhkaar", "Evening adhkaar", "أذكار المساء")}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => router.push({ pathname: "/details/adhkar", params: { type: "post-prayer", prayer: nextPrayer } })}
              style={({ pressed }) => [s.adhkarChip, { backgroundColor: "#E8F5E9" }, pressed && { opacity: 0.7 }]}
            >
              <MaterialIcons name="mosque" size={14} color="#1B4332" />
              <Text style={[s.adhkarText, { color: "#1B4332" }]}>{tx(lang, "Na gebed", "After prayer", "بعد الصلاة")}</Text>
            </Pressable>
          </View>
        </Pressable>
      ) : (
        <Pressable onPress={() => router.push("/(tabs)/settings")} style={({ pressed }) => [s.prayerCard, pressed && { opacity: 0.95 }]}>
          <View style={s.prayerCardInner}>
            <MosqueSvg size={26} />
            <Text style={s.noPrayerText}>{tx(lang, "Stel uw locatie in voor gebedstijden", "Set your location for prayer times", "حدد موقعك لعرض مواقيت الصلاة")}</Text>
            <MaterialIcons name="chevron-right" size={20} color="#9CA3AF" />
          </View>
        </Pressable>
      )}

      {/* ═══════════ TODAY'S TIP + DAILY CHECK-IN (MERGED) ═══════════ */}
      {!checkinDismissed ? (
        <View style={s.checkinSection}>
          {/* Today's tip inside check-in */}
          <View style={s.tipBanner}>
            <MaterialIcons name="lightbulb" size={18} color="#C4A35A" />
            <Text style={s.tipBannerText}>{todayMainTip}</Text>
          </View>
          {/* Confirmation banner */}
          {checkinShowConfirm && (
            <View style={s.checkinConfirmBanner}>
              <MaterialIcons name="check-circle" size={20} color="#1B4332" />
              <Text style={s.checkinConfirmText}>
                {tx(lang, "Barak Allaahu fiek voor het antwoord", "Barak Allaahu feek for your answer", "بارك الله فيك على الإجابة")}
              </Text>
            </View>
          )}

          {/* Prayer question */}
          <View style={s.checkinCard}>
            <Text style={s.checkinTitle}>
              {tx(lang, "Hoe was uw gebed vandaag?", "How was your prayer today?", "كيف كانت صلاتك اليوم؟")}
            </Text>
            <View style={s.checkinOptions}>
              {[
                { value: "alle_5_op_tijd", label: tx(lang, "Alle 5 op tijd", "All 5 on time", "الخمس في وقتها") },
                { value: "sommige_gemist", label: tx(lang, "Sommige gemist", "Some missed", "بعضها فاتني") },
                { value: "fajr_gemist", label: tx(lang, "Fajr gemist", "Fajr missed", "فاتتني الفجر") },
                { value: "werk_eraan", label: tx(lang, "Ik werk eraan", "I'm working on it", "أعمل على ذلك") },
              ].map((opt) => (
                <Pressable
                  key={opt.value}
                  onPress={() => handleCheckinAnswer("prayer", opt.value)}
                  style={({ pressed }) => [
                    s.checkinOption,
                    checkinPrayer === opt.value && s.checkinOptionSelected,
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <View style={[s.checkinRadio, checkinPrayer === opt.value && s.checkinRadioSelected]}>
                    {checkinPrayer === opt.value && <MaterialIcons name="check" size={12} color="#FFFFFF" />}
                  </View>
                  <Text style={[s.checkinOptionText, checkinPrayer === opt.value && s.checkinOptionTextSelected]}>
                    {opt.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* Mood question */}
          <View style={s.checkinCard}>
            <Text style={s.checkinTitle}>
              {tx(lang, "Hoe voelt u zich vandaag?", "How do you feel today?", "كيف تشعر اليوم؟")}
            </Text>
            <View style={s.checkinOptions}>
              {[
                { value: "energiek", label: tx(lang, "Energiek", "Energetic", "نشيط") },
                { value: "rustig", label: tx(lang, "Rustig", "Calm", "هادئ") },
                { value: "moe", label: tx(lang, "Moe", "Tired", "متعب") },
                { value: "gestrest", label: tx(lang, "Gestrest", "Stressed", "متوتر") },
              ].map((opt) => (
                <Pressable
                  key={opt.value}
                  onPress={() => handleCheckinAnswer("mood", opt.value)}
                  style={({ pressed }) => [
                    s.checkinOption,
                    checkinMood === opt.value && s.checkinOptionSelected,
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <View style={[s.checkinRadio, checkinMood === opt.value && s.checkinRadioSelected]}>
                    {checkinMood === opt.value && <MaterialIcons name="check" size={12} color="#FFFFFF" />}
                  </View>
                  <Text style={[s.checkinOptionText, checkinMood === opt.value && s.checkinOptionTextSelected]}>
                    {opt.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* Submit button - only active when both questions answered */}
          <Pressable
            onPress={handleCheckinSubmit}
            disabled={!checkinPrayer || !checkinMood}
            style={({ pressed }) => [
              s.checkinSubmitBtn,
              (!checkinPrayer || !checkinMood) && s.checkinSubmitBtnDisabled,
              pressed && checkinPrayer && checkinMood && { opacity: 0.8, transform: [{ scale: 0.97 }] },
            ]}
          >
            <MaterialIcons name="check-circle" size={18} color={checkinPrayer && checkinMood ? "#FFFFFF" : "#9CA3AF"} />
            <Text style={[s.checkinSubmitText, (!checkinPrayer || !checkinMood) && s.checkinSubmitTextDisabled]}>
              {tx(lang, "Beantwoord", "Submit", "إرسال")}
            </Text>
          </Pressable>
        </View>
      ) : (
        /* Collapsed summary after answering - merged with tip */
        <View style={s.checkinSection}>
          <View style={s.tipBanner}>
            <MaterialIcons name="lightbulb" size={18} color="#C4A35A" />
            <Text style={s.tipBannerText}>{todayMainTip}</Text>
          </View>
          <View style={s.checkinDismissedCard}>
            <MaterialIcons name="check-circle" size={18} color="#1B4332" />
            <Text style={s.checkinDismissedText}>
              {tx(lang, "Dagelijkse check-in voltooid", "Daily check-in completed", "تم إكمال المراجعة اليومية")}
            </Text>
          </View>
        </View>
      )}

      {/* ═══════════ PARTNER SECTION ═══════════ */}
      {isAuthenticated && (coParentsQuery.data ?? []).length > 0 && (
        <>
          <View style={s.sectionHeader}>
            <View style={s.sectionLine} />
            <Text style={s.sectionTitle}>{tx(lang, "Partner", "Spouse", "الزوجة")}</Text>
          </View>
          {(coParentsQuery.data ?? []).map((cp: any) => (
            <Pressable
              key={cp.id}
              onPress={() => router.push("/(tabs)/messages" as any)}
              style={({ pressed }) => [{
                backgroundColor: "#F0FDF4",
                borderRadius: 14,
                padding: 12,
                marginHorizontal: 12,
                marginBottom: 10,
                borderWidth: 1.5,
                borderColor: "#BBF7D0",
                opacity: pressed ? 0.85 : 1,
              }]}
            >
              <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 10 }}>
                <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: "#DCFCE7", alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ fontSize: 18 }}>{state.parentProfile.gender === "man" ? "🧕" : "🧔"}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: "#1B4332", fontSize: 13, fontWeight: "700" }}>{cp.name || (cp.gender === "vrouw" ? tx(lang, "Moeder", "Mother", "الأم") : tx(lang, "Vader", "Father", "الأب"))}</Text>
                  <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 5, marginTop: 2 }}>
                    <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: "#22C55E" }} />
                    <Text style={{ color: "#6B7280", fontSize: 10 }}>{tx(lang, "Verbonden", "Connected", "متصل/ة")}</Text>
                  </View>
                </View>
                <Pressable
                  onPress={() => router.push("/spouse-profile" as any)}
                  style={({ pressed }) => [{ padding: 4, opacity: pressed ? 0.6 : 1 }]}
                >
                  <MaterialIcons name="person" size={18} color="#1B4332" />
                </Pressable>
                <Pressable
                  onPress={() => router.push("/(tabs)/messages" as any)}
                  style={({ pressed }) => [{ padding: 4, opacity: pressed ? 0.6 : 1 }]}
                >
                  <MaterialIcons name="chat-bubble-outline" size={18} color="#1B4332" />
                </Pressable>
              </View>
            </Pressable>
          ))}
        </>
      )}

      {/* ═══════════ CHILDREN SECTION ═══════════ */}
      <>
        <Pressable onPress={() => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setChildrenExpanded(!childrenExpanded); }} style={({ pressed }) => [pressed && { opacity: 0.8 }]}>
          <View style={s.sectionHeader}>
            <View style={s.sectionLine} />
            <Text style={s.sectionTitle}>{tx(lang, "Uw kinderen", "Your Children", "أبناؤك")}</Text>
            {state.children.length > 0 && (
              <View style={[s.sectionBadge, { backgroundColor: "#FFF3E0" }]}>
                <Text style={[s.sectionBadgeText, { color: "#E65100" }]}>{state.children.length}</Text>
              </View>
            )}
            <MaterialIcons name={childrenExpanded ? "keyboard-arrow-up" : "keyboard-arrow-down"} size={22} color="#666" style={{ marginLeft: 8 }} />
          </View>
        </Pressable>

        {childrenExpanded && (<View style={s.childrenGrid}>
        {childProgress.map(({ child, age, yearKey, weekInYear, totalGoals, completedCount, progressPercent, todayTip }) => (
          <Pressable
            key={child.id}
            onPress={() => router.push(`/child/${child.id}`)}
            style={({ pressed }) => [s.childCard, pressed && { transform: [{ scale: 0.98 }] }]}
          >
            {/* Child header */}
            <View style={s.childHeader}>
              <View style={[s.childAvatar, { backgroundColor: child.gender === "meisje" ? "#FCE4EC" : "#E3F2FD" }]}>
                <MaterialIcons name={child.gender === "meisje" ? "face-3" : "face-6"} size={24} color={child.gender === "meisje" ? "#E91E63" : "#1565C0"} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.childName} numberOfLines={1}>{(() => { const n = child.name; const m = n.match(/^(Kind|Child|طفل)\s*(\d+)$/i); if (m) { return lang === "ar" ? `طفل ${m[2]}` : lang === "en" ? `Child ${m[2]}` : `Kind ${m[2]}`; } return n; })()}</Text>
                <Text style={s.childAge}>
                  {age ? `${age.years} ${tx(lang, "jaar", "years", "سنة")}` : tx(lang, "Leeftijd onbekend", "Age unknown", "العمر غير معروف")}
                </Text>
              </View>
            </View>

            {/* Weekly progress bar */}
            <View style={s.progressSection}>
              <View style={s.progressRow}>
                <Text style={s.progressLabel}>{tx(lang, "Weekvoortgang", "Weekly progress", "تقدم الأسبوع")}</Text>
                <Text style={s.progressValue}>{completedCount}/{totalGoals}</Text>
              </View>
              <View style={s.progressBarBg}>
                <View style={[s.progressBarFill, { width: `${progressPercent}%`, backgroundColor: progressPercent >= 70 ? "#22C55E" : progressPercent >= 30 ? "#F59E0B" : "#EF4444" }]} />
              </View>
            </View>

            {/* Today's tip for this child */}
            {todayTip ? (
              <View style={s.childTipRow}>
                <MaterialIcons name="tips-and-updates" size={12} color="#C4A35A" />
                <Text style={s.childTipText} numberOfLines={2}>{todayTip}</Text>
              </View>
            ) : null}

            {/* Quick action: go to weekly plan */}
            <Pressable
              onPress={() => router.push("/(tabs)/weekly")}
              style={({ pressed }) => [s.childActionBtn, pressed && { opacity: 0.7 }]}
            >
              <MaterialIcons name="checklist" size={12} color="#1B4332" />
              <Text style={s.childActionText}>{tx(lang, "خطة الأسبوع", "Week plan", "خطة الأسبوع")}</Text>
            </Pressable>
          </Pressable>
        ))}
        {/* Add child button - last item */}
        <Pressable
          onPress={() => router.push("/onboarding/add-child" as any)}
          style={({ pressed }) => [s.childCard, { borderStyle: "dashed" as any, borderWidth: 1.5, borderColor: "#1B433250", alignItems: "center", justifyContent: "center", minHeight: 100 }, pressed && { opacity: 0.7 }]}
        >
          <MaterialIcons name="add-circle-outline" size={32} color="#1B4332" />
          <Text style={{ color: "#1B4332", fontSize: 12, fontWeight: "600", marginTop: 6 }}>{tx(lang, "Kind toevoegen", "Add child", "إضافة طفل")}</Text>
        </Pressable>
        </View>)}
      </>

      {/* ═══════════ QUICK ACTIONS GRID ═══════════ */}
      <Pressable onPress={() => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setQuickActionsExpanded(!quickActionsExpanded); }} style={({ pressed }) => [pressed && { opacity: 0.8 }]}>
        <View style={s.sectionHeader}>
          <View style={[s.sectionLine, { backgroundColor: "#1565C030" }]} />
          <Text style={[s.sectionTitle, { color: "#1565C0" }]}>{tx(lang, "Snelle acties", "Quick Actions", "إجراءات سريعة")}</Text>
          <MaterialIcons name={quickActionsExpanded ? "keyboard-arrow-up" : "keyboard-arrow-down"} size={22} color="#1565C0" style={{ marginLeft: 8 }} />
        </View>
      </Pressable>

      {quickActionsExpanded && (
      <View style={s.actionsGrid}>
        <Pressable onPress={() => router.push("/(tabs)/weekly")} style={({ pressed }) => [s.actionCard, pressed && { transform: [{ scale: 0.96 }] }]}>
          <View style={[s.actionIcon, { backgroundColor: "#E8F5E9" }]}>
            <MaterialIcons name="checklist" size={24} color="#1B4332" />
          </View>
          <Text style={s.actionLabel}>{tx(lang, "Weekplan", "Week Plan", "الأسبوعي")}</Text>
        </Pressable>

        <Pressable onPress={() => router.push("/(tabs)/fitrah")} style={({ pressed }) => [s.actionCard, pressed && { transform: [{ scale: 0.96 }] }]}>
          <View style={[s.actionIcon, { backgroundColor: "#FFF3E0" }]}>
            <MaterialIcons name="auto-awesome" size={24} color="#E65100" />
          </View>
          <Text style={s.actionLabel}>{tx(lang, "Fitrah", "Fitrah", "الفطرة")}</Text>
        </Pressable>

        <Pressable onPress={() => router.push("/(tabs)/prayer-times")} style={({ pressed }) => [s.actionCard, pressed && { transform: [{ scale: 0.96 }] }]}>
          <View style={[s.actionIcon, { backgroundColor: "#E3F2FD" }]}>
            <MaterialIcons name="schedule" size={24} color="#1565C0" />
          </View>
          <Text style={s.actionLabel}>{tx(lang, "Gebedstijden", "Prayer Times", "الصلاة")}</Text>
        </Pressable>

        <Pressable onPress={() => router.push("/(tabs)/dhikri")} style={({ pressed }) => [s.actionCard, pressed && { transform: [{ scale: 0.96 }] }]}>
          <View style={[s.actionIcon, { backgroundColor: "#E8F5EC" }]}>
            <MaterialIcons name="menu-book" size={24} color="#1B4332" />
          </View>
          <Text style={s.actionLabel}>{tx(lang, "Mijn Dhikr", "My Dhikr", "ذِكري")}</Text>
        </Pressable>

        <Pressable onPress={() => router.push("/(tabs)/family")} style={({ pressed }) => [s.actionCard, pressed && { transform: [{ scale: 0.96 }] }]}>
          <View style={[s.actionIcon, { backgroundColor: "#FCE4EC" }]}>
            <MaterialIcons name="family-restroom" size={24} color="#C2185B" />
          </View>
          <Text style={s.actionLabel}>{tx(lang, "Gezin", "Family", "العائلة")}</Text>
        </Pressable>

        <Pressable onPress={() => router.push("/(tabs)/treatments")} style={({ pressed }) => [s.actionCard, pressed && { transform: [{ scale: 0.96 }] }]}>
          <View style={[s.actionIcon, { backgroundColor: "#E8EAF6" }]}>
            <MaterialIcons name="healing" size={24} color="#283593" />
          </View>
          <Text style={s.actionLabel}>{tx(lang, "Behandeling", "Treatment", "العلاجات")}</Text>
        </Pressable>

        <Pressable onPress={() => router.push("/ai-chat")} style={({ pressed }) => [s.actionCard, pressed && { transform: [{ scale: 0.96 }] }]}>
          <View style={[s.actionIcon, { backgroundColor: "#E0F7FA" }]}>
            <MaterialIcons name="chat" size={24} color="#00695C" />
          </View>
          <Text style={s.actionLabel}>{tx(lang, "AI Adviseur", "AI Advisor", "المستشار")}</Text>
        </Pressable>

        <Pressable onPress={() => router.push("/(tabs)/mosques")} style={({ pressed }) => [s.actionCard, pressed && { transform: [{ scale: 0.96 }] }]}>
          <View style={[s.actionIcon, { backgroundColor: "#E8F5E9" }]}>
            <MaterialIcons name="mosque" size={24} color="#1B4332" />
          </View>
          <Text style={s.actionLabel}>{tx(lang, "Moskeeën", "Mosques", "المساجد")}</Text>
        </Pressable>

        <Pressable onPress={() => router.push("/library" as any)} style={({ pressed }) => [s.actionCard, pressed && { transform: [{ scale: 0.96 }] }]}>
          <View style={[s.actionIcon, { backgroundColor: "#FFF3E0" }]}>
            <MaterialIcons name="menu-book" size={24} color="#E65100" />
          </View>
          <Text style={s.actionLabel}>{tx(lang, "Bibliotheek", "Library", "المكتبة")}</Text>
        </Pressable>

        <Pressable onPress={() => router.push("/details/tips-today" as any)} style={({ pressed }) => [s.actionCard, pressed && { transform: [{ scale: 0.96 }] }]}>
          <View style={[s.actionIcon, { backgroundColor: "#F0FDF4" }]}>
            <MaterialIcons name="lightbulb" size={24} color="#059669" />
          </View>
          <Text style={s.actionLabel}>{tx(lang, "Dagtips", "Daily Tips", "نصائح يومية")}</Text>
        </Pressable>

        <Pressable onPress={() => router.push("/emotion-path" as any)} style={({ pressed }) => [s.actionCard, pressed && { transform: [{ scale: 0.96 }] }]}>
          <View style={[s.actionIcon, { backgroundColor: "#F3E5F5" }]}>
            <MaterialIcons name="favorite" size={24} color="#7B1FA2" />
          </View>
          <Text style={s.actionLabel}>{tx(lang, "Emotiepad", "Emotion Path", "ضبط النفس")}</Text>
        </Pressable>
      </View>
      )}

      {/* ═══════════ PERSONAL ADVICE CARD ═══════════ */}
      <Pressable onPress={() => router.push("/(tabs)/personal-advice" as any)} style={({ pressed }) => [s.adviceCard, pressed && { opacity: 0.9 }]}>
        <View style={s.adviceHeader}>
          <MaterialIcons name="psychology" size={20} color="#7B1FA2" />
          <Text style={s.adviceTitle}>{tx(lang, "Persoonlijk advies", "Personal Advice", "نصيحة شخصية")}</Text>
          <MaterialIcons name="chevron-right" size={18} color="#9CA3AF" />
        </View>
        <Text style={s.adviceSubtitle}>{tx(lang, "Op basis van uw situatie en gezin", "Based on your situation and family", "بناءً على أحوالك وأسرتك")}</Text>
      </Pressable>

      <View style={{ height: 20 }} />
    </ScrollView>
    <SyncToast
      visible={toastVisible}
      message={toastMessage}
      type={toastType}
      onHide={() => setToastVisible(false)}
    />
    </>
    
  );
}

// ============ STYLES ============
const s = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: "#FFFFFF" },
  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#FFFFFF" },

  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingBottom: 10 },
  headerTitle: { fontSize: 24, fontWeight: "800", color: "#1B4332" },
  headerTitleEn: { fontSize: 24, fontWeight: "300", color: "#1B4332" },
  settingsBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#F5F7F6", alignItems: "center", justifyContent: "center" },

  datePill: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, marginHorizontal: 40, paddingVertical: 8, paddingHorizontal: 14, backgroundColor: "#F0F7F2", borderRadius: 20, marginBottom: 2 },
  dateText: { fontSize: 11, color: "#1B4332", fontWeight: "600" },
  dateSep: { color: "#9CA3AF", marginHorizontal: 2 },
  gregorianDate: { fontSize: 11, color: "#9CA3AF", textAlign: "center", marginTop: 4, marginBottom: 12 },

  // Prayer card
  prayerCard: { marginHorizontal: 16, marginBottom: 12, backgroundColor: "#FFFFFF", borderRadius: 16, borderWidth: 1.5, borderColor: "#1B433220", padding: 12, shadowColor: "#1B4332", shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  prayerCardInner: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  prayerLeft: { alignItems: "center", gap: 2 },
  prayerLabel: { fontSize: 9, color: "#6B7B72", fontWeight: "500" },
  prayerCenter: { alignItems: "center" },
  prayerName: { fontSize: 18, fontWeight: "800", color: "#1B4332" },
  prayerTime: { fontSize: 12, color: "#6B7B72", fontWeight: "600" },
  prayerRight: { alignItems: "center" },
  countdownLabel: { fontSize: 9, color: "#6B7B72", fontWeight: "500" },
  countdownText: { fontSize: 22, fontWeight: "800", color: "#1B4332", letterSpacing: -1 },
  noPrayerText: { flex: 1, fontSize: 13, color: "#6B7B72", textAlign: "center", marginHorizontal: 12 },
  adhkarRow: { flexDirection: "row", gap: 6, marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: "#E8ECE9" },
  adhkarChip: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, paddingVertical: 6, borderRadius: 8 },
  adhkarText: { fontSize: 11, fontWeight: "700" },

  // Tip banner
  tipBanner: { flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: 16, marginBottom: 16, paddingVertical: 10, paddingHorizontal: 14, backgroundColor: "#FFFBF0", borderRadius: 12, borderWidth: 1, borderColor: "#C4A35A30" },
  tipBannerText: { flex: 1, fontSize: 12, color: "#78350F", fontWeight: "600" },

  // Daily check-in
  checkinSection: { marginHorizontal: 16, marginBottom: 16 },
  checkinConfirmBanner: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#E8F5E9", borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14, marginBottom: 12, borderWidth: 1, borderColor: "#1B433230" },
  checkinConfirmText: { flex: 1, fontSize: 13, fontWeight: "700", color: "#1B4332" },
  checkinCard: { backgroundColor: "#FFFFFF", borderRadius: 14, borderWidth: 1.5, borderColor: "#E8ECE9", padding: 14, marginBottom: 10, shadowColor: "#000", shadowOpacity: 0.03, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  checkinTitle: { fontSize: 14, fontWeight: "700", color: "#1B4332", textAlign: "center", marginBottom: 10 },
  checkinOptions: { gap: 0, borderRadius: 10, borderWidth: 1, borderColor: "#E8ECE9", overflow: "hidden" as const },
  checkinOption: { flexDirection: "row" as const, alignItems: "center" as const, gap: 10, paddingVertical: 12, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: "#E8ECE9", backgroundColor: "#FFFFFF" },
  checkinOptionSelected: { backgroundColor: "#E8F5E9" },
  checkinRadio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: "#CBD5E1", alignItems: "center" as const, justifyContent: "center" as const },
  checkinRadioSelected: { backgroundColor: "#1B4332", borderColor: "#1B4332" },
  checkinOptionText: { fontSize: 14, fontWeight: "500", color: "#374151" },
  checkinOptionTextSelected: { fontWeight: "700", color: "#1B4332" },
  checkinAnswered: { flexDirection: "row" as const, alignItems: "center" as const, gap: 4, marginTop: 8, justifyContent: "center" as const },
  checkinAnsweredText: { fontSize: 11, color: "#1B4332", fontWeight: "600" },
  checkinSubmitBtn: { flexDirection: "row" as const, alignItems: "center" as const, justifyContent: "center" as const, gap: 8, backgroundColor: "#1B4332", borderRadius: 12, paddingVertical: 14, marginTop: 4 },
  checkinSubmitBtnDisabled: { backgroundColor: "#E8ECE9" },
  checkinSubmitText: { fontSize: 15, fontWeight: "700", color: "#FFFFFF" },
  checkinSubmitTextDisabled: { color: "#9CA3AF" },
  checkinDismissedCard: { flexDirection: "row" as const, alignItems: "center" as const, gap: 10, backgroundColor: "#E8F5E9", borderRadius: 12, paddingVertical: 14, paddingHorizontal: 16, borderWidth: 1, borderColor: "#1B433220" },
  checkinDismissedText: { fontSize: 14, fontWeight: "600", color: "#1B4332" },

  // Section headers
  sectionHeader: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, marginBottom: 12, gap: 8 },
  sectionLine: { flex: 1, height: 1.5, backgroundColor: "#E6510030" },
  sectionTitle: { fontSize: 16, fontWeight: "800", color: "#E65100" },
  sectionBadge: { width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  sectionBadgeText: { fontSize: 12, fontWeight: "800" },

  // Child cards
  childrenGrid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 12, gap: 8 },
  childCard: { width: "48%", flexGrow: 0, marginBottom: 8, backgroundColor: "#FFFFFF", borderRadius: 14, borderWidth: 1.5, borderColor: "#E8ECE9", padding: 10, shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  childHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  childAvatar: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  childName: { fontSize: 13, fontWeight: "700", color: "#1F2937" },
  childAge: { fontSize: 10, color: "#6B7B72", marginTop: 1 },
  progressSection: { marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: "#F3F4F6" },
  progressRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  progressLabel: { fontSize: 11, color: "#6B7B72", fontWeight: "600" },
  progressValue: { fontSize: 11, color: "#1B4332", fontWeight: "700" },
  progressBarBg: { height: 6, backgroundColor: "#F3F4F6", borderRadius: 3, overflow: "hidden" },
  progressBarFill: { height: 6, borderRadius: 3 },
  childTipRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: "#F3F4F6" },
  childTipText: { flex: 1, fontSize: 12, color: "#78350F", fontWeight: "500" },
  childActionBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 10, paddingVertical: 8, backgroundColor: "#F0F7F2", borderRadius: 8 },
  childActionText: { fontSize: 12, color: "#1B4332", fontWeight: "700" },

  // Quick actions grid
  actionsGrid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 12, marginBottom: 16, gap: 8 },
  actionCard: { width: "30%", flexGrow: 1, alignItems: "center", paddingVertical: 14, backgroundColor: "#FFFFFF", borderRadius: 14, borderWidth: 1, borderColor: "#E8ECE9", shadowColor: "#000", shadowOpacity: 0.03, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  actionIcon: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center", marginBottom: 6 },
  actionLabel: { fontSize: 11, fontWeight: "700", color: "#374151", textAlign: "center" },

  // Advice card
  adviceCard: { marginHorizontal: 16, marginBottom: 16, backgroundColor: "#FDFAFF", borderRadius: 14, borderWidth: 1, borderColor: "#E8D5F5", padding: 14 },
  adviceHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  adviceTitle: { flex: 1, fontSize: 14, fontWeight: "700", color: "#7B1FA2" },
  adviceSubtitle: { fontSize: 12, color: "#6B7B72", marginTop: 6 },
  // Qiyam night banner
  qiyamBanner: { marginHorizontal: 16, marginBottom: 12, backgroundColor: "#0D1B2A", borderRadius: 14, padding: 14, borderWidth: 1, borderColor: "#C4A35A40", position: "relative" },
  qiyamBannerInner: { flexDirection: "row", alignItems: "center", gap: 12 },
  qiyamTitle: { fontSize: 15, fontWeight: "700", color: "#C4A35A" },
  qiyamSubtitle: { fontSize: 12, color: "#8BA4B8", lineHeight: 18 },
  qiyamDismiss: { position: "absolute", top: 6, left: 6, width: 24, height: 24, borderRadius: 12, backgroundColor: "#1B283880", alignItems: "center", justifyContent: "center" },
});
