import { useState, useEffect, useCallback, useMemo } from "react";
import { View, Text, ScrollView, Pressable, ActivityIndicator, StyleSheet, LayoutAnimation, Platform, UIManager } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useColors } from "@/hooks/use-colors";
import { useAppState } from "@/lib/app-context";
import { calculateAgeInWeeks, getYearKey, getWeekInYear } from "@/lib/store";
import { DateTimeHeader } from "@/components/date-time-header";
import { useI18n } from "@/lib/i18n";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useWeeklyData } from "@/hooks/use-weekly-data";
import { recordGoalCompleted, scheduleGoalsIncompleteReminder } from "@/lib/notifications";

const PROGRESS_KEY = "@weekly_progress_v2";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type Lang = "nl" | "en" | "ar";

function tx(lang: Lang, nl: string, en: string, ar: string): string {
  return lang === "ar" ? ar : lang === "en" ? en : nl;
}

// Helper to detect Arabic text - used to force RTL rendering even when app language is Dutch/English
function isArabicText(text: string | undefined | null): boolean {
  if (!text) return false;
  return /[\u0600-\u06FF]/.test(text);
}

// Get text alignment and writing direction based on content (not app language)
function getArabicTextStyle(text: string | undefined | null, isRTL: boolean) {
  const forceRTL = isArabicText(text) || isRTL;
  // Arabic is right-aligned and RTL (text starts at the right edge).
  return { textAlign: forceRTL ? "left" as const : "left" as const, writingDirection: forceRTL ? "rtl" as const : "ltr" as const };
}

// New data types matching the tarbiya JSON format
interface TarbiyaGoal {
  num: number;
  stage: string; // "التزكية (القلب)" | "التصفية (العقل)" | "التربية (الجوارح واللسان)"
  type: string;  // e.g. "1. التربية العقدية"
  goal: string;
  goal_nl?: string;
  goal_en?: string;
  source: string;
  method: string;
  method_nl?: string;
  method_en?: string;
  steps: string;
  steps_nl?: string;
  steps_en?: string;
}

interface Foundation {
  id?: string;
  title?: string;
  type?: string; // "آية" | "حديث"
  text?: string;
  content?: {
    text?: string;
    verse?: string;
    verse_ref?: string;
    hadith?: string;
    source?: string;
  };
}

interface Activity {
  id?: string;
  title: string;
  description?: string;
  content?: {
    goal?: string;
    steps?: string;
    tools?: string;
    source?: string;
  };
}

interface TarbiyaWeek {
  week: number;
  goals_count: number;
  goals: TarbiyaGoal[];
  foundations: Foundation[];
  activities: Activity[];
}

interface TarbiyaYear {
  year: number;
  name: string;
  total_weeks: number;
  characteristics: string;
  characteristics_nl?: string;
  characteristics_en?: string;
  distribution: string;
  weeks: TarbiyaWeek[];
}

// Stage categories
const STAGES = {
  heart: "التزكية (القلب)",
  mind: "التصفية (العقل)",
  limbs: "التربية (الجوارح واللسان)",
} as const;

// Goal type translations
const TYPE_TRANSLATIONS: Record<string, { nl: string; en: string }> = {
  "1. التربية العقدية": { nl: "1. Geloofsleer", en: "1. Creed Education" },
  "2. تربية العبادات": { nl: "2. Aanbidding", en: "2. Worship Education" },
  "3. التربية الاجتماعية": { nl: "3. Sociale opvoeding", en: "3. Social Education" },
  "4. التربية السلوكية": { nl: "4. Gedragsopvoeding", en: "4. Behavioral Education" },
  "5. التربية الوجدانية": { nl: "5. Emotionele opvoeding", en: "5. Emotional Education" },
  "6. التربية البدنية": { nl: "6. Lichamelijke opvoeding", en: "6. Physical Education" },
  "7. التربية العقلية": { nl: "7. Intellectuele opvoeding", en: "7. Intellectual Education" },
  "8. التربية الصحية": { nl: "8. Gezondheidsopvoeding", en: "8. Health Education" },
  "9. التربية الجنسية": { nl: "9. Seksuele opvoeding", en: "9. Sexual Education" },
  "10. التربية المالية": { nl: "10. Financi\u00eble opvoeding", en: "10. Financial Education" },
  "11. التربية الإعلامية": { nl: "11. Media-opvoeding", en: "11. Media Education" },
  "12. تربية حل المشاكل ومفادات المشاكل": { nl: "12. Probleemoplossing", en: "12. Problem Solving" },
  "13. تربية الوقت": { nl: "13. Tijdmanagement", en: "13. Time Management" },
  "14. تربية الاستدلال العقلي": { nl: "14. Logisch redeneren", en: "14. Logical Reasoning" },
};

function getTypeText(type: string, lang: Lang): string {
  if (lang === "ar") return type;
  const tr = TYPE_TRANSLATIONS[type];
  if (tr) return lang === "nl" ? tr.nl : tr.en;
  return type;
}

function getStageInfo(stage: string, lang: Lang) {
  if (stage.includes("التزكية") || stage.includes("القلب")) {
    return { key: "heart", icon: "💚", label: tx(lang, "Tazkiyah — Hart", "Tazkiyah — Heart", "تزكية القلب"), color: "#065F46", bgColor: "#D1FAE5" };
  }
  if (stage.includes("التصفية") || stage.includes("العقل")) {
    return { key: "mind", icon: "🧠", label: tx(lang, "Tasfiyah — Geest", "Tasfiyah — Mind", "تصفية العقل"), color: "#1B4332", bgColor: "#A7F3D0" };
  }
  return { key: "limbs", icon: "🤲", label: tx(lang, "Tarbiyah — Gedrag", "Tarbiyah — Actions", "تربية الجوارح"), color: "#14532D", bgColor: "#86EFAC" };
}

export default function WeeklyScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { state, loading } = useAppState();
  const { t, language } = useI18n();
  const lang: Lang = language as Lang;
  const isRTL = lang === "ar";

  const [selectedChildIdx, setSelectedChildIdx] = useState(0);
  const [weekOverride, setWeekOverride] = useState<number | null>(null);
  const [completedGoals, setCompletedGoals] = useState<string[]>([]);
  const [yearDataLocal, setYearDataLocal] = useState<TarbiyaYear | null>(null);

  // Section expand states
  const [heartOpen, setHeartOpen] = useState(false);
  const [mindOpen, setMindOpen] = useState(false);
  const [limbsOpen, setLimbsOpen] = useState(false);
  const [foundationsOpen, setFoundationsOpen] = useState(false);
  const [activitiesOpen, setActivitiesOpen] = useState(false);

  // Sort children by age (oldest first)
  const sortedChildren = useMemo(() => {
    return [...state.children].sort((a, b) => {
      if (!a.birthDate && !b.birthDate) return 0;
      if (!a.birthDate) return 1;
      if (!b.birthDate) return -1;
      return new Date(a.birthDate).getTime() - new Date(b.birthDate).getTime();
    });
  }, [state.children]);

  // Derive active child and age info (before hooks that depend on them)
  const activeChild = (!loading && state.onboardingCompleted && sortedChildren.length > 0)
    ? (sortedChildren[selectedChildIdx] || sortedChildren[0])
    : null;

  let yearNum = 0;
  let currentWeekInYear = 1;
  let hasValidAge = false;

  if (activeChild?.birthDate) {
    const childAge = calculateAgeInWeeks(activeChild.birthDate);
    if (childAge && !isNaN(childAge.years) && !isNaN(childAge.totalWeeks)) {
      yearNum = Math.max(-1, Math.min(18, childAge.years));
      currentWeekInYear = Math.max(1, Math.min(52, getWeekInYear(childAge.totalWeeks, childAge.years)));
      hasValidAge = true;
    }
  }

  // Load year data from server API (avoids Metro dynamic import issue)
  const yearKey = getYearKey(yearNum);
  const { yearData: serverYearData, loading: dataLoading } = useWeeklyData(yearKey);

  // Load progress
  useEffect(() => {
    AsyncStorage.getItem(PROGRESS_KEY).then((data) => {
      if (data) setCompletedGoals(JSON.parse(data));
    });
  }, []);

  const toggleGoalComplete = useCallback((goalId: string) => {
    setCompletedGoals((prev) => {
      const next = prev.includes(goalId) ? prev.filter((g) => g !== goalId) : [...prev, goalId];
      AsyncStorage.setItem(PROGRESS_KEY, JSON.stringify(next));
      // Cache progress for widget
      AsyncStorage.setItem("@widget_goal_progress", JSON.stringify({
        completed: next.length,
        total: activeWeek?.goals_count || 16,
      }));
      // If goal was just completed (not uncompleted), record it and reschedule reminder
      if (!prev.includes(goalId)) {
        recordGoalCompleted().then(() => {
          // Get language from AsyncStorage and reschedule
          AsyncStorage.getItem("@app_language").then((lang) => {
            const l = (lang === "ar" || lang === "en" || lang === "nl") ? lang : "nl";
            scheduleGoalsIncompleteReminder(l);
          });
        });
      }
      return next;
    });
  }, []);

  // Map server response to local TarbiyaYear format
  useEffect(() => {
    if (serverYearData) {
      const mappedWeeks: TarbiyaWeek[] = (serverYearData.weeks || []).map((w: any) => {
        const goals: TarbiyaGoal[] = [];
        let num = 1;
        for (const g of (w.tazkiyah || [])) {
          goals.push({ ...g, num: g.num || num++, stage: "التزكية (القلب)" });
        }
        for (const g of (w.tasfiyah || [])) {
          goals.push({ ...g, num: g.num || num++, stage: "التصفية (العقل)" });
        }
        for (const g of (w.tarbiyah || [])) {
          goals.push({ ...g, num: g.num || num++, stage: "التربية (الجوارح واللسان)" });
        }
        return {
          week: w.week,
          goals_count: goals.length,
          goals,
          foundations: w.foundations || [],
          activities: w.activities || [],
        };
      });
      setYearDataLocal({
        year: yearNum,
        name: serverYearData.name || `السنة ${yearNum}`,
        total_weeks: mappedWeeks.length || 52,
        characteristics: serverYearData.characteristics || "",
        characteristics_nl: serverYearData.characteristics_nl || "",
        characteristics_en: serverYearData.characteristics_en || "",
        distribution: serverYearData.distribution || "",
        weeks: mappedWeeks,
      });
    } else if (!dataLoading) {
      setYearDataLocal(null);
    }
  }, [serverYearData, dataLoading, yearNum]);

  const yearData = yearDataLocal;

  // Week navigation
  const displayWeek = weekOverride !== null ? weekOverride : currentWeekInYear;
  const maxWeek = yearData?.total_weeks || 52;
  const activeWeek = yearData?.weeks?.find((w) => w.week === displayWeek) || yearData?.weeks?.[0];

  // Group goals by stage, then split parent/child within each stage
  const groupedGoals = useMemo(() => {
    if (!activeWeek?.goals) return { heart: [], mind: [], limbs: [] };
    const heart: TarbiyaGoal[] = [];
    const mind: TarbiyaGoal[] = [];
    const limbs: TarbiyaGoal[] = [];
    for (const g of activeWeek.goals) {
      if (g.stage.includes("التزكية") || g.stage.includes("القلب")) heart.push(g);
      else if (g.stage.includes("التصفية") || g.stage.includes("العقل")) mind.push(g);
      else limbs.push(g);
    }
    return { heart, mind, limbs };
  }, [activeWeek]);

  // Classify goals as parent-targeted or child-targeted based on content
  const isParentGoal = useCallback((goal: TarbiyaGoal): boolean => {
    const text = (goal.goal + " " + (goal.method || "")).toLowerCase();
    const parentKeywords = /الوالد|الأب|الأم|والد|parent|ouder|vader|moeder|أنت.*مع|ساعد.*طفل|علّم.*طفل|ذكّر.*طفل|شجّع|help.*kind|leer.*kind|teach.*child|encourage/i;
    return parentKeywords.test(text);
  }, []);

  // Cache goals for notification service
  useEffect(() => {
    if (activeWeek?.goals && activeWeek.goals.length > 0) {
      const allGoals = activeWeek.goals.map((g) => ({ title: g.goal, explanation: g.method || "" }));
      import("@/lib/weekly-goals-notification").then(({ cacheWeeklyGoalsForNotification }) => {
        cacheWeeklyGoalsForNotification(allGoals);
      });
      // Cache today's goal for home screen widget
      const dayIndex = new Date().getDay();
      const todayGoal = activeWeek.goals[dayIndex % activeWeek.goals.length];
      if (todayGoal) {
        import("@/widgets/widgetSync").then(({ cacheGoalForWidget }) => {
          cacheGoalForWidget(todayGoal.goal, undefined, todayGoal.type || "\u062A\u0631\u0628\u064A\u0629");
        });
      }
    }
  }, [activeWeek]);

  // === EARLY RETURNS (after all hooks) ===
  if (loading) {
    return (
      <View style={[s.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!state.onboardingCompleted) {
    setTimeout(() => router.replace("/onboarding"), 0);
    return (
      <View style={[s.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (sortedChildren.length === 0) {
    return (
      <View style={[s.center, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <Text style={{ color: colors.muted, fontSize: 16 }}>{t("weekly.no_children")}</Text>
      </View>
    );
  }

  // At this point activeChild is guaranteed non-null
  const child = activeChild!;

  const canGoPrev = displayWeek > 1;
  const canGoNext = displayWeek < maxWeek;
  const goToPrevWeek = () => { if (canGoPrev) setWeekOverride(displayWeek - 1); };
  const goToNextWeek = () => { if (canGoNext) setWeekOverride(displayWeek + 1); };
  const goToCurrentWeek = () => setWeekOverride(null);

  // Goal ID for progress tracking
  const getGoalId = (goalNum: number) => `${child.id}_y${yearNum}_w${displayWeek}_g${goalNum}`;

  // Count completed
  const countCompleted = (goals: TarbiyaGoal[]) =>
    goals.filter((g) => completedGoals.includes(getGoalId(g.num))).length;

  const totalGoals = (activeWeek?.goals_count || 0);
  const totalCompleted = activeWeek?.goals?.filter((g) => completedGoals.includes(getGoalId(g.num))).length || 0;
  const overallPct = totalGoals > 0 ? Math.round((totalCompleted / totalGoals) * 100) : 0;

  const toggle = (setter: React.Dispatch<React.SetStateAction<boolean>>) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setter((v) => !v);
  };

  const yearLabel = (() => {
    const name = yearData?.name || `السنة ${yearNum}`;
    if (lang === "ar") return name;
    // Extract year number from Arabic name like "السنة 3 (ثلاث سنوات)"
    const match = name.match(/(-?\d+)/);
    const y = match ? parseInt(match[1]) : yearNum;
    if (y < 0) return lang === "nl" ? `Prenataal (${Math.abs(y)} jaar voor geboorte)` : `Prenatal (${Math.abs(y)} year before birth)`;
    if (y === 0) return lang === "nl" ? "Geboortejaar" : "Birth year";
    return lang === "nl" ? `Jaar ${y} (${y} jaar)` : `Year ${y} (${y} years old)`;
  })();

  return (
    
    <View style={[s.container, { backgroundColor: colors.background }]}>
      <View style={{ paddingTop: insets.top }}>
        <DateTimeHeader />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 100, paddingHorizontal: 16 }}>
        {/* Title */}
        <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
          <Text style={[s.title, { color: colors.foreground, textAlign: "left", writingDirection: "rtl", marginBottom: 0 }]}>
            {t("weekly.title")}
          </Text>
          <Pressable
            onPress={() => router.push("/library" as any)}
            style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 4, paddingHorizontal: 8, borderRadius: 8, backgroundColor: colors.primary + "12", opacity: pressed ? 0.7 : 1 }]}
          >
            <Text style={{ fontSize: 11, color: colors.primary, fontWeight: "600" }}>
              {tx(lang, "Bibliotheek", "Library", "المكتبة")}
            </Text>
          </Pressable>
        </View>

        {/* Child selector */}
        {sortedChildren.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
            {sortedChildren.map((child, idx) => (
              <Pressable
                key={child.id}
                onPress={() => { setSelectedChildIdx(idx); setWeekOverride(null); }}
                style={[s.childPill, {
                  backgroundColor: idx === selectedChildIdx ? colors.primary : colors.surface,
                  borderColor: idx === selectedChildIdx ? colors.primary : colors.border,
                }]}
              >
                <Text style={{ color: idx === selectedChildIdx ? "#fff" : colors.foreground, fontSize: 14, fontWeight: "600" }}>
                  {child.name}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        )}

        {/* Child info card */}
        <View style={[s.infoCard, { backgroundColor: colors.primary + "08", borderColor: colors.primary + "30" }]}>
          <View style={[s.infoRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
            <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 8 }}>
              <Text style={{ color: colors.foreground, fontSize: 15, fontWeight: "700" }}>
                👶 {child.name}
              </Text>
              <Pressable
                onPress={() => router.push(`/child-profile/${child.id}` as any)}
                style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1, backgroundColor: colors.success + "15", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }]}
              >
                <Text style={{ color: colors.success, fontSize: 10, fontWeight: "600" }}>{tx(lang, "Profiel", "Profile", "ملف")}</Text>
              </Pressable>
              <Pressable
                onPress={() => router.push(`/child-account/parent-monitor?childId=${child.id}&childName=${encodeURIComponent(child.name || '')}` as any)}
                style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1, backgroundColor: "#8B5CF6" + "15", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }]}
              >
                <Text style={{ color: "#8B5CF6", fontSize: 10, fontWeight: "600" }}>{tx(lang, "Monitoren", "Monitor", "متابعة")}</Text>
              </Pressable>
            </View>
            <Text style={{ color: colors.primary, fontSize: 12, fontWeight: "600" }}>
              {yearLabel}
            </Text>
          </View>
          {/* Characteristics */}
          {yearData?.characteristics && (
            <Text style={{ color: colors.muted, fontSize: 11, marginTop: 6, textAlign: "left", writingDirection: "rtl", lineHeight: 16 }} numberOfLines={2}>
              {lang === "nl" && yearData.characteristics_nl ? yearData.characteristics_nl : lang === "en" && yearData.characteristics_en ? yearData.characteristics_en : yearData.characteristics}
            </Text>
          )}
          <View style={[s.progressBar, { backgroundColor: colors.border, marginTop: 8 }]}>
            <View style={[s.progressFill, { backgroundColor: colors.primary, width: `${Math.min((displayWeek / maxWeek) * 100, 100)}%` }]} />
          </View>
          {!hasValidAge && (
            <Pressable onPress={() => router.push(`/child/${child.id}`)} style={{ marginTop: 8 }}>
              <Text style={{ color: colors.primary, fontSize: 12, fontWeight: "600", textDecorationLine: "underline" }}>
                {tx(lang, "Geboortedatum invullen voor nauwkeurig advies", "Fill in birthdate for accurate advice", "أدخل تاريخ الميلاد للحصول على نصائح دقيقة")}
              </Text>
            </Pressable>
          )}
        </View>

        {/* Week Navigation + Progress in ONE card */}
        <View style={[s.progressCard, { backgroundColor: overallPct === 100 ? "#F0FDF4" : colors.surface, borderColor: overallPct === 100 ? "#22C55E" : colors.border }]}>
          {/* Week nav row */}
          <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", marginBottom: 10 }}>
            <Pressable onPress={goToPrevWeek} style={({ pressed }) => [s.weekNavBtn, { opacity: canGoPrev ? (pressed ? 0.6 : 1) : 0.3 }]} disabled={!canGoPrev}>
              <MaterialIcons name={isRTL ? "chevron-right" : "chevron-left"} size={24} color={colors.primary} />
            </Pressable>
            <Pressable onPress={goToCurrentWeek} style={s.weekNavCenter}>
              <Text style={{ color: colors.foreground, fontSize: 15, fontWeight: "700" }}>
                {tx(lang, "Week", "Week", "الأسبوع")} {displayWeek}/{maxWeek}
              </Text>
              {weekOverride !== null && weekOverride !== currentWeekInYear && (
                <Text style={{ color: colors.primary, fontSize: 11, marginTop: 2 }}>
                  {tx(lang, "← Terug naar huidige week", "← Back to current week", "→ العودة للأسبوع الحالي")}
                </Text>
              )}
            </Pressable>
            <Pressable onPress={goToNextWeek} style={({ pressed }) => [s.weekNavBtn, { opacity: canGoNext ? (pressed ? 0.6 : 1) : 0.3 }]} disabled={!canGoNext}>
              <MaterialIcons name={isRTL ? "chevron-left" : "chevron-right"} size={24} color={colors.primary} />
            </Pressable>
          </View>
          {/* Progress bar */}
          <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", marginBottom: 6 }}>
            <Text style={{ fontSize: 14, fontWeight: "800", color: colors.foreground, flex: 1, textAlign: "left", writingDirection: "rtl" }}>
              {overallPct === 100 ? "✅ " : "📊 "}
              {tx(lang, "Weekvoortgang", "Weekly Progress", "تقدم الأسبوع")}
            </Text>
            <Text style={{ fontSize: 18, fontWeight: "900", color: overallPct === 100 ? "#22C55E" : colors.primary }}>
              {overallPct}%
            </Text>
          </View>
          <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.border, overflow: "hidden" }}>
            <View style={{ height: 8, borderRadius: 4, backgroundColor: overallPct === 100 ? "#22C55E" : colors.primary, width: `${overallPct}%` }} />
          </View>
          <Text style={{ color: colors.muted, fontSize: 12, marginTop: 6, textAlign: "left", writingDirection: "rtl" }}>
            {totalCompleted}/{totalGoals} {tx(lang, "doelen behaald", "goals achieved", "أهداف مُنجزة")}
          </Text>
        </View>

        {dataLoading ? (
          <View style={{ alignItems: "center", paddingVertical: 40 }}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={{ color: colors.muted, marginTop: 12, fontSize: 14 }}>
              {tx(lang, "Weekadvies laden...", "Loading weekly advice...", "جاري تحميل النصائح الأسبوعية...")}
            </Text>
          </View>
        ) : activeWeek ? (
          <>

            {/* ===== MIND (TASFIYAH) — التصفية أولاً ===== */}
            {groupedGoals.mind.length > 0 && (
              <SectionAccordion
                title={tx(lang, "Tasfiyah — Zuivering van de geest", "Tasfiyah — Purifying the mind", "التصفية (العقل)")}
                icon="🧠"
                color="#1B4332"
                bgColor="#A7F3D0"
                goals={groupedGoals.mind}
                expanded={mindOpen}
                onToggle={() => toggle(setMindOpen)}
                completedGoals={completedGoals}
                onToggleGoal={toggleGoalComplete}
                getGoalId={getGoalId}
                colors={colors}
                isRTL={isRTL}
                lang={lang}
                classifyParent={isParentGoal}
              />
            )}

            {/* ===== HEART (TAZKIYAH) — التزكية ثانياً ===== */}
            {groupedGoals.heart.length > 0 && (
              <SectionAccordion
                title={tx(lang, "Tazkiyah — Zuivering van het hart", "Tazkiyah — Purifying the heart", "التزكية (القلب)")}
                icon="💚"
                color="#065F46"
                bgColor="#D1FAE5"
                goals={groupedGoals.heart}
                expanded={heartOpen}
                onToggle={() => toggle(setHeartOpen)}
                completedGoals={completedGoals}
                onToggleGoal={toggleGoalComplete}
                getGoalId={getGoalId}
                colors={colors}
                isRTL={isRTL}
                lang={lang}
                classifyParent={isParentGoal}
              />
            )}

            {/* ===== LIMBS (TARBIYAH) — التربية ثالثاً ===== */}
            {groupedGoals.limbs.length > 0 && (
              <SectionAccordion
                title={tx(lang, "Tarbiyah — Opvoeding in daden", "Tarbiyah — Education in actions", "التربية (الجوارح واللسان)")}
                icon="🤲"
                color="#14532D"
                bgColor="#86EFAC"
                goals={groupedGoals.limbs}
                expanded={limbsOpen}
                onToggle={() => toggle(setLimbsOpen)}
                completedGoals={completedGoals}
                onToggleGoal={toggleGoalComplete}
                getGoalId={getGoalId}
                colors={colors}
                isRTL={isRTL}
                lang={lang}
                classifyParent={isParentGoal}
              />
            )}

            {/* ===== ENVIRONMENT ADVICE (moved here - Fix 4) ===== */}
            <EnvironmentAdviceSection
              childId={child.id}
              childName={child.name}
              environments={state.environments}
              colors={colors}
              isRTL={isRTL}
              lang={lang}
              router={router}
            />

            {/* ===== FOUNDATIONS (AYAH + HADITH) - Fix 2: render actual nested data ===== */}
            {activeWeek.foundations && activeWeek.foundations.length > 0 && (
              <View style={{ marginTop: 16 }}>
                <Pressable
                  onPress={() => toggle(setFoundationsOpen)}
                  style={({ pressed }) => [s.sectionHeader, { backgroundColor: "#FEF3C7", borderColor: "#FDE68A", opacity: pressed ? 0.9 : 1 }]}
                >
                  <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center" }}>
                    <Text style={{ fontSize: 22 }}>📜</Text>
                    <Text style={{ flex: 1, fontSize: 15, fontWeight: "700", color: "#92400E", marginHorizontal: 10, textAlign: "left", writingDirection: "rtl" }}>
                      {tx(lang, "Bronnen — Qur'aan & Hadieth", "Sources — Qur'aan & Hadieth", "المنطلقات — آية وحديث")}
                    </Text>
                    <MaterialIcons name={foundationsOpen ? "expand-less" : "expand-more"} size={22} color="#92400E" />
                  </View>
                </Pressable>
                {foundationsOpen && (
                  <View style={{ backgroundColor: "#FFFBEB", borderRadius: 12, padding: 14, borderWidth: 1, borderColor: "#FDE68A", borderTopWidth: 0, borderTopLeftRadius: 0, borderTopRightRadius: 0, marginTop: -2 }}>
                    {activeWeek.foundations.map((f: any, idx: number) => {
                      const rawTitle = f.title ? f.title.replace(/\s*\(المعرّف:.*?\)/, '') : '';
                      const rawText = f.content?.text || f.text || '';
                      // Use translated version if available (non-Arabic language)
                      const title = (lang !== 'ar' && f.titleTr) ? f.titleTr : rawTitle;
                      const text = (lang !== 'ar' && f.textTr) ? f.textTr : rawText;
                      const verse = f.content?.verse || '';
                      const verseRef = f.content?.verse_ref || '';
                      const hadith = f.content?.hadith || '';
                      const source = f.content?.source || '';
                      // Translations for verse/hadith (available when lang !== 'ar')
                      const verseTr = f.verseTr || '';
                      const hadithTr = f.hadithTr || '';
                      return (
                        <View key={idx} style={{ marginBottom: idx < activeWeek.foundations.length - 1 ? 14 : 0, paddingBottom: idx < activeWeek.foundations.length - 1 ? 14 : 0, borderBottomWidth: idx < activeWeek.foundations.length - 1 ? 1 : 0, borderBottomColor: "#FDE68A" }}>
                          {title ? (
                            <Text style={{ color: "#92400E", fontSize: 13, fontWeight: "700", marginBottom: 6, ...getArabicTextStyle(title, isRTL) }}>
                              📜 {title}
                            </Text>
                          ) : null}
                          {text ? (
                            <Text style={{ color: "#451A03", fontSize: 13, lineHeight: 22, marginBottom: 6, ...getArabicTextStyle(text, isRTL) }}>
                              {text}
                            </Text>
                          ) : null}
                          {verse ? (
                            <View style={{ backgroundColor: "#FEF3C7", borderRadius: 8, padding: 10, marginBottom: 6, borderRightWidth: 3, borderRightColor: "#D97706" }}>
                              <Text style={{ color: "#92400E", fontSize: 10, fontWeight: "700", marginBottom: 4, textAlign: "left", writingDirection: "rtl" }}>{lang === 'ar' ? '📖 آية' : '📖 Aayah (Qur\'aan)'}</Text>
                              <Text style={{ color: "#451A03", fontSize: 14, lineHeight: 24, textAlign: "left", writingDirection: "rtl", fontWeight: "600" }}>
                                {verse}
                              </Text>
                              {verseRef ? <Text style={{ color: "#92400E", fontSize: 11, marginTop: 4, textAlign: "left", writingDirection: "rtl" }}>({verseRef})</Text> : null}
                              {verseTr && lang !== 'ar' ? (
                                <View style={{ marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: "#FDE68A" }}>
                                  <Text style={{ color: "#92400E", fontSize: 10, fontWeight: "600", marginBottom: 2 }}>{lang === 'nl' ? 'Vertaling:' : 'Translation:'}</Text>
                                  <Text style={{ color: "#451A03", fontSize: 13, lineHeight: 20, fontStyle: "italic" }}>
                                    {verseTr}
                                  </Text>
                                </View>
                              ) : null}
                            </View>
                          ) : null}
                          {hadith ? (
                            <View style={{ backgroundColor: "#ECFDF5", borderRadius: 8, padding: 10, marginBottom: 4, borderRightWidth: 3, borderRightColor: "#059669" }}>
                              <Text style={{ color: "#065F46", fontSize: 10, fontWeight: "700", marginBottom: 4, textAlign: "left", writingDirection: "rtl" }}>{lang === 'ar' ? '📿 حديث' : '📿 Hadieth'}</Text>
                              <Text style={{ color: "#064E3B", fontSize: 13, lineHeight: 22, textAlign: "left", writingDirection: "rtl", fontStyle: "italic" }}>
                                {hadith}
                              </Text>
                              {source ? <Text style={{ color: "#065F46", fontSize: 11, marginTop: 4, textAlign: "left", writingDirection: "rtl" }}>({source})</Text> : null}
                              {hadithTr && lang !== 'ar' ? (
                                <View style={{ marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: "#A7F3D0" }}>
                                  <Text style={{ color: "#065F46", fontSize: 10, fontWeight: "600", marginBottom: 2 }}>{lang === 'nl' ? 'Vertaling:' : 'Translation:'}</Text>
                                  <Text style={{ color: "#064E3B", fontSize: 13, lineHeight: 20 }}>
                                    {hadithTr}
                                  </Text>
                                </View>
                              ) : null}
                            </View>
                          ) : null}
                        </View>
                      );
                    })}
                  </View>
                )}
              </View>
            )}

            {/* ===== ACTIVITIES - Fix 3: strip W-codes, tap to expand ===== */}
            {activeWeek.activities && activeWeek.activities.length > 0 && (
              <View style={{ marginTop: 12 }}>
                <Pressable
                  onPress={() => toggle(setActivitiesOpen)}
                  style={({ pressed }) => [s.sectionHeader, { backgroundColor: "#EDE9FE", borderColor: "#C4B5FD", opacity: pressed ? 0.9 : 1 }]}
                >
                  <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center" }}>
                    <Text style={{ fontSize: 22 }}>🎯</Text>
                    <Text style={{ flex: 1, fontSize: 15, fontWeight: "700", color: "#5B21B6", marginHorizontal: 10, textAlign: "left", writingDirection: "rtl" }}>
                      {tx(lang, "Activiteiten", "Activities", "الأنشطة العملية")}
                    </Text>
                    <MaterialIcons name={activitiesOpen ? "expand-less" : "expand-more"} size={22} color="#5B21B6" />
                  </View>
                </Pressable>
                {activitiesOpen && (
                  <View style={{ backgroundColor: "#F5F3FF", borderRadius: 12, padding: 14, borderWidth: 1, borderColor: "#C4B5FD", borderTopWidth: 0, borderTopLeftRadius: 0, borderTopRightRadius: 0, marginTop: -2 }}>
                    {activeWeek.activities.map((a: any, idx: number) => (
                      <ActivityItem key={idx} activity={a} isRTL={isRTL} lang={lang} colors={colors} isLast={idx === activeWeek.activities.length - 1} />
                    ))}
                  </View>
                )}
              </View>
            )}
            {/* ===== ADVISOR PLANS ===== */}
            <AdvisorPlansSection
              childId={child.id}
              childName={child.name}
              colors={colors}
              isRTL={isRTL}
              lang={lang}
            />
          </>
        ) : (
          <View style={[s.emptyState, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={{ fontSize: 40, marginBottom: 12 }}>📅</Text>
            <Text style={{ color: colors.foreground, fontSize: 15, fontWeight: "600", textAlign: "center" }}>
              {tx(lang, "Geen weekadvies beschikbaar", "No weekly advice available", "لا توجد نصائح أسبوعية متاحة")}
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
    
  );
}

// ============================================================
// ACTIVITY ITEM - Tappable activity with expandable details (Fix 3)
// ============================================================
function ActivityItem({ activity, isRTL, lang, colors, isLast }: {
  activity: any; isRTL: boolean; lang: Lang; colors: any; isLast: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  // Strip W-codes like "(المعرّف: W004)" from title
  const rawTitle = (activity.title || '').replace(/\s*\(المعرّف:.*?\)/, '').trim();
  const rawGoal = activity.content?.goal || activity.description || '';
  const rawSteps = activity.content?.steps || '';
  const rawTools = activity.content?.tools || '';
  const source = activity.content?.source || '';
  // Use translated version if available (non-Arabic language)
  const cleanTitle = (lang !== 'ar' && activity.titleTr) ? activity.titleTr : rawTitle;
  const goal = (lang !== 'ar' && activity.goalTr) ? activity.goalTr : rawGoal;
  const steps = (lang !== 'ar' && activity.stepsTr) ? activity.stepsTr : rawSteps;
  const tools = (lang !== 'ar' && activity.toolsTr) ? activity.toolsTr : rawTools;

  return (
    <View style={{ marginBottom: isLast ? 0 : 10 }}>
      <Pressable
        onPress={() => {
          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          setExpanded(!expanded);
        }}
        style={({ pressed }) => [{
          flexDirection: isArabicText(cleanTitle) || isRTL ? "row-reverse" : "row",
          alignItems: "center",
          backgroundColor: expanded ? "#EDE9FE" : "transparent",
          borderRadius: 8,
          padding: expanded ? 10 : 4,
          opacity: pressed ? 0.7 : 1,
        }]}
      >
        <Text style={{ flex: 1, color: "#5B21B6", fontSize: 13, fontWeight: "700", ...getArabicTextStyle(cleanTitle, isRTL) }}>
          {cleanTitle}
        </Text>
        <MaterialIcons name={expanded ? "expand-less" : "expand-more"} size={18} color="#5B21B6" />
      </Pressable>
      {expanded && (
        <View style={{ marginTop: 8, paddingHorizontal: 8 }}>
          {goal ? (
            <View style={{ marginBottom: 8, backgroundColor: "#EDE9FE", borderRadius: 8, padding: 10 }}>
              <Text style={{ color: "#5B21B6", fontSize: 11, fontWeight: "700", marginBottom: 4, ...getArabicTextStyle(goal, isRTL) }}>
                🎯 {tx(lang, "Doel", "Goal", "الهدف")}
              </Text>
              <Text style={{ color: "#4C1D95", fontSize: 13, lineHeight: 20, ...getArabicTextStyle(goal, isRTL) }}>
                {goal}
              </Text>
            </View>
          ) : null}
          {steps ? (
            <View style={{ marginBottom: 8, backgroundColor: "#F5F3FF", borderRadius: 8, padding: 10, borderLeftWidth: isArabicText(steps) || isRTL ? 0 : 3, borderLeftColor: "#7C3AED", borderRightWidth: isArabicText(steps) || isRTL ? 3 : 0, borderRightColor: "#7C3AED" }}>
              <Text style={{ color: "#5B21B6", fontSize: 11, fontWeight: "700", marginBottom: 4, ...getArabicTextStyle(steps, isRTL) }}>
                🛠 {tx(lang, "Stappen", "Steps", "الخطوات")}
              </Text>
              <Text style={{ color: "#4C1D95", fontSize: 12, lineHeight: 20, ...getArabicTextStyle(steps, isRTL) }}>
                {steps}
              </Text>
            </View>
          ) : null}
          {tools ? (
            <View style={{ marginBottom: 8, backgroundColor: "#FEFCE8", borderRadius: 8, padding: 10 }}>
              <Text style={{ color: "#92400E", fontSize: 11, fontWeight: "700", marginBottom: 4, ...getArabicTextStyle(tools, isRTL) }}>
                🧰 {tx(lang, "Hulpmiddelen", "Tools", "الأدوات")}
              </Text>
              <Text style={{ color: "#78350F", fontSize: 12, lineHeight: 18, ...getArabicTextStyle(tools, isRTL) }}>
                {tools}
              </Text>
            </View>
          ) : null}
          {source ? (
            <View style={{ backgroundColor: "#F0FDF4", borderRadius: 8, padding: 10 }}>
              <Text style={{ color: "#065F46", fontSize: 11, fontWeight: "700", marginBottom: 4, ...getArabicTextStyle(source, isRTL) }}>
                📚 {tx(lang, "Bron", "Source", "المصدر")}
              </Text>
              <Text style={{ color: "#064E3B", fontSize: 12, lineHeight: 18, fontStyle: "italic", ...getArabicTextStyle(source, isRTL) }}>
                {source}
              </Text>
            </View>
          ) : null}
        </View>
      )}
    </View>
  );
}

// ============================================================
// SECTION ACCORDION - Groups goals by stage
// ============================================================
function SectionAccordion({ title, icon, color, bgColor, goals, expanded, onToggle, completedGoals, onToggleGoal, getGoalId, colors, isRTL, lang, classifyParent }: {
  title: string; icon: string; color: string; bgColor: string;
  goals: TarbiyaGoal[]; expanded: boolean; onToggle: () => void;
  completedGoals: string[]; onToggleGoal: (id: string) => void;
  getGoalId: (num: number) => string;
  colors: any; isRTL: boolean; lang: Lang;
  classifyParent?: (goal: TarbiyaGoal) => boolean;
}) {
  const completed = goals.filter((g) => completedGoals.includes(getGoalId(g.num))).length;
  const progress = goals.length > 0 ? Math.round((completed / goals.length) * 100) : 0;
  const allDone = completed === goals.length && goals.length > 0;

  // Split goals into parent and child sub-groups
  const parentGoals = classifyParent ? goals.filter(g => classifyParent(g)) : [];
  const childGoals = classifyParent ? goals.filter(g => !classifyParent(g)) : goals;
  const hasParentChild = classifyParent && parentGoals.length > 0 && childGoals.length > 0;

  return (
    <View style={{ marginTop: 12 }}>
      <Pressable
        onPress={onToggle}
        style={({ pressed }) => [s.sectionHeader, { backgroundColor: bgColor, borderColor: color + "40", opacity: pressed ? 0.9 : 1 }]}
      >
        <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center" }}>
          <Text style={{ fontSize: 22 }}>{icon}</Text>
          <View style={{ flex: 1, marginHorizontal: 10 }}>
            <Text style={{ fontSize: 14, fontWeight: "700", color, textAlign: "left", writingDirection: "rtl" }}>
              {title}
            </Text>
            {/* Mini progress */}
            <View style={{ height: 4, borderRadius: 2, backgroundColor: color + "20", marginTop: 4, overflow: "hidden" }}>
              <View style={{ height: 4, borderRadius: 2, backgroundColor: allDone ? "#22C55E" : color, width: `${progress}%` }} />
            </View>
          </View>
          <View style={{ backgroundColor: allDone ? "#22C55E20" : color + "20", borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 }}>
            <Text style={{ color: allDone ? "#22C55E" : color, fontSize: 11, fontWeight: "800" }}>
              {completed}/{goals.length}
            </Text>
          </View>
          <MaterialIcons name={expanded ? "expand-less" : "expand-more"} size={22} color={color} style={{ marginLeft: 4 }} />
        </View>
      </Pressable>

      {expanded && (
        <View style={{ backgroundColor: bgColor + "40", borderRadius: 12, padding: 8, borderWidth: 1, borderColor: color + "20", borderTopWidth: 0, borderTopLeftRadius: 0, borderTopRightRadius: 0, marginTop: -2 }}>
          {hasParentChild ? (
            <>
              {/* Parent sub-section */}
              <View style={{ marginBottom: 8 }}>
                <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 6, paddingHorizontal: 8, paddingVertical: 6, backgroundColor: color + "10", borderRadius: 8, marginBottom: 4 }}>
                  <Text style={{ fontSize: 14 }}>👨</Text>
                  <Text style={{ color, fontSize: 12, fontWeight: "800", textAlign: "left", writingDirection: "rtl" }}>
                    {tx(lang, "Voor de ouder", "For the parent", "للوالد/ة")}
                  </Text>
                  <View style={{ backgroundColor: color + "20", borderRadius: 8, paddingHorizontal: 5, paddingVertical: 1, marginLeft: isRTL ? 0 : "auto", marginRight: isRTL ? "auto" : 0 }}>
                    <Text style={{ color, fontSize: 10, fontWeight: "700" }}>{parentGoals.length}</Text>
                  </View>
                </View>
                {parentGoals.map((goal) => (
                  <GoalCard
                    key={goal.num}
                    goal={goal}
                    color={color}
                    colors={colors}
                    isRTL={isRTL}
                    lang={lang}
                    isCompleted={completedGoals.includes(getGoalId(goal.num))}
                    onToggleComplete={() => onToggleGoal(getGoalId(goal.num))}
                  />
                ))}
              </View>
              {/* Child sub-section */}
              <View>
                <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 6, paddingHorizontal: 8, paddingVertical: 6, backgroundColor: color + "10", borderRadius: 8, marginBottom: 4 }}>
                  <Text style={{ fontSize: 14 }}>👶</Text>
                  <Text style={{ color, fontSize: 12, fontWeight: "800", textAlign: "left", writingDirection: "rtl" }}>
                    {tx(lang, "Voor het kind", "For the child", "للطفل")}
                  </Text>
                  <View style={{ backgroundColor: color + "20", borderRadius: 8, paddingHorizontal: 5, paddingVertical: 1, marginLeft: isRTL ? 0 : "auto", marginRight: isRTL ? "auto" : 0 }}>
                    <Text style={{ color, fontSize: 10, fontWeight: "700" }}>{childGoals.length}</Text>
                  </View>
                </View>
                {childGoals.map((goal) => (
                  <GoalCard
                    key={goal.num}
                    goal={goal}
                    color={color}
                    colors={colors}
                    isRTL={isRTL}
                    lang={lang}
                    isCompleted={completedGoals.includes(getGoalId(goal.num))}
                    onToggleComplete={() => onToggleGoal(getGoalId(goal.num))}
                  />
                ))}
              </View>
            </>
          ) : (
            goals.map((goal) => (
              <GoalCard
                key={goal.num}
                goal={goal}
                color={color}
                colors={colors}
                isRTL={isRTL}
                lang={lang}
                isCompleted={completedGoals.includes(getGoalId(goal.num))}
                onToggleComplete={() => onToggleGoal(getGoalId(goal.num))}
              />
            ))
          )}
        </View>
      )}
    </View>
  );
}

// ============================================================
// GOAL CARD - Individual goal with expandable details
// ============================================================
function GoalCard({ goal, color, colors, isRTL, lang, isCompleted, onToggleComplete }: {
  goal: TarbiyaGoal; color: string; colors: any; isRTL: boolean; lang: Lang;
  isCompleted: boolean; onToggleComplete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const goalText = (lang === "nl" && goal.goal_nl) ? goal.goal_nl : (lang === "en" && goal.goal_en) ? goal.goal_en : (goal.goal || "");
  const methodText = (lang === "nl" && goal.method_nl) ? goal.method_nl : (lang === "en" && goal.method_en) ? goal.method_en : (goal.method || "");
  const stepsText = (lang === "nl" && goal.steps_nl) ? goal.steps_nl : (lang === "en" && goal.steps_en) ? goal.steps_en : (goal.steps || "");
  const displayText = goalText;

  return (
    <Pressable
      onPress={() => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setExpanded(!expanded);
      }}
      style={({ pressed }) => [s.goalCard, {
        backgroundColor: isCompleted ? colors.surface : colors.background,
        borderColor: expanded ? color + "40" : isCompleted ? color + "30" : colors.border,
        borderLeftColor: isRTL ? undefined : color,
        borderLeftWidth: isRTL ? 0 : 3,
        borderRightColor: isRTL ? color : undefined,
        borderRightWidth: isRTL ? 3 : 0,
        opacity: pressed ? 0.9 : 1,
      }]}
    >
      <View style={[s.goalRow, { flexDirection: isArabicText(goalText) || isRTL ? "row-reverse" : "row" }]}>
        {/* Checkbox */}
        <Pressable
          onPress={(e) => { e.stopPropagation?.(); onToggleComplete(); }}
          style={({ pressed }) => [s.checkbox, {
            backgroundColor: isCompleted ? color : "transparent",
            borderColor: isCompleted ? color : colors.muted + "60",
            opacity: pressed ? 0.7 : 1,
          }]}
        >
          {isCompleted && <MaterialIcons name="check" size={14} color="#fff" />}
        </Pressable>

        <View style={{ flex: 1, marginLeft: isRTL ? 0 : 10, marginRight: isRTL ? 10 : 0 }}>
          {/* Goal type badge */}
          <Text style={{ color: color, fontSize: 10, fontWeight: "700", marginBottom: 3, ...getArabicTextStyle(getTypeText(goal.type, lang), isRTL) }}>
            {getTypeText(goal.type, lang)}
          </Text>
          {/* Goal text */}
          <Text style={[s.goalText, {
            color: isCompleted ? colors.muted : colors.foreground,
            ...getArabicTextStyle(goalText, isRTL),
            textDecorationLine: isCompleted ? "line-through" : "none",
            opacity: isCompleted ? 0.7 : 1,
          }]} numberOfLines={expanded ? undefined : 3}>
            {goalText}
          </Text>
        </View>

        <MaterialIcons name={expanded ? "expand-less" : "expand-more"} size={16} color={colors.muted} />
      </View>

      {expanded && (
        <View style={[s.explanation, { borderTopColor: colors.border }]}>
          {/* Method */}
          {methodText ? (
            <View style={{ marginBottom: 10, backgroundColor: color + "08", borderRadius: 8, padding: 10 }}>
              <Text style={{ color, fontSize: 12, fontWeight: "700", marginBottom: 4, ...getArabicTextStyle(methodText, isRTL) }}>
                {tx(lang, "📋 Methode:", "📋 Method:", "📋 الوسيلة:")}
              </Text>
              <Text style={{ color: colors.foreground, fontSize: 13, lineHeight: 20, fontWeight: "500", ...getArabicTextStyle(methodText, isRTL) }}>
                {methodText}
              </Text>
            </View>
          ) : null}

          {/* Steps */}
          {stepsText ? (
            <View style={{ marginBottom: 10, backgroundColor: color + "05", borderRadius: 8, padding: 10 }}>
              <Text style={{ color, fontSize: 12, fontWeight: "700", marginBottom: 4, ...getArabicTextStyle(stepsText, isRTL) }}>
                {tx(lang, "🛠 Praktische stappen:", "🛠 Practical steps:", "🛠 الخطوات العملية:")}
              </Text>
              <Text style={{ color: colors.foreground, fontSize: 13, lineHeight: 22, ...getArabicTextStyle(stepsText, isRTL) }}>
                {stepsText}
              </Text>
            </View>
          ) : null}

          {/* Source */}
          {goal.source ? (
            <View style={{ marginTop: 4, backgroundColor: color + "10", borderRadius: 8, padding: 10, borderLeftWidth: isArabicText(goal.source) || isRTL ? 0 : 3, borderLeftColor: color, borderRightWidth: isArabicText(goal.source) || isRTL ? 3 : 0, borderRightColor: color }}>
              <Text style={{ color, fontSize: 11, fontWeight: "700", marginBottom: 3, ...getArabicTextStyle(goal.source, isRTL) }}>
                {tx(lang, "📜 Bron:", "📜 Source:", "📜 المصدر:")}
              </Text>
              <Text style={{ color: colors.foreground, fontSize: 12, lineHeight: 19, fontStyle: "italic", ...getArabicTextStyle(goal.source, isRTL) }}>
                {goal.source}
              </Text>
            </View>
          ) : null}
        </View>
      )}
    </Pressable>
  );
}

// ============================================================
// ENVIRONMENT ADVICE SECTION (preserved from previous version)
// ============================================================
function EnvironmentAdviceSection({ childId, childName, environments, colors, isRTL, lang, router }: {
  childId: string; childName: string; environments: any[]; colors: any; isRTL: boolean; lang: Lang; router: any;
}) {
  const env = environments.find((e: any) => e.childId === childId);
  
  // Check for incomplete fields in environment
  const envFields = ['neighborhood', 'friends', 'mediaUse', 'badThinking', 'badSpeaking', 'badDoing', 'prayerStatus', 'quranConnection'];
  const filledFields = env ? envFields.filter(f => env[f] && env[f].length > 3) : [];
  const missingCount = envFields.length - filledFields.length;
  const isIncomplete = !env || missingCount > 0;
  
  if (!env || missingCount > 4) {
    return (
      <Pressable
        onPress={() => router.push(`/child/environment?id=${childId}`)}
        style={({ pressed }) => [{ marginTop: 16, borderRadius: 14, padding: 16, backgroundColor: "#FEF3C7", borderWidth: 1, borderColor: "#FDE68A", opacity: pressed ? 0.8 : 1 }]}
      >
        <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 10 }}>
          <Text style={{ fontSize: 28 }}>⚠️</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ color: "#92400E", fontSize: 14, fontWeight: "700", textAlign: "left", writingDirection: "rtl" }}>
              {tx(lang, "Omgevingsanalyse invullen", "Fill in environment analysis", "أكمل تحليل بيئة الطفل")}
            </Text>
            <Text style={{ color: "#78350F", fontSize: 12, marginTop: 4, textAlign: "left", writingDirection: "rtl" }}>
              {tx(lang, `Nog ${missingCount || envFields.length} velden niet ingevuld — vul ze in voor persoonlijk advies`, `${missingCount || envFields.length} fields still empty — fill them for personalized advice`, `${missingCount || envFields.length} حقول لم تُملأ بعد — أكملها للحصول على نصائح مخصصة`)}
            </Text>
            <Text style={{ color: "#B45309", fontSize: 11, marginTop: 6, fontWeight: "600", textAlign: "left", writingDirection: "rtl" }}>
              {tx(lang, "📅 Wekelijkse herinnering: vul dit in!", "📅 Weekly reminder: fill this in!", "📅 تذكير أسبوعي: أكمل هذا التحليل!")}
            </Text>
          </View>
          <MaterialIcons name={isRTL ? "chevron-left" : "chevron-right"} size={22} color="#B45309" />
        </View>
      </Pressable>
    );
  }

  const adviceItems = generateEnvironmentAdvice(env, lang);
  if (adviceItems.length === 0) return null;

  return (
    <View style={{ marginTop: 16 }}>
      <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <Text style={{ fontSize: 22 }}>💡</Text>
        <Text style={{ color: colors.foreground, fontSize: 15, fontWeight: "700", textAlign: "left", writingDirection: "rtl" }}>
          {tx(lang, `Persoonlijk advies voor ${childName}`, `Personalized advice for ${childName}`, `نصائح خاصة بـ${childName}`)}
        </Text>
      </View>
      {adviceItems.map((advice, idx) => (
        <View key={idx} style={{ borderRadius: 12, padding: 14, marginBottom: 8, backgroundColor: advice.bgColor + "15", borderWidth: 1, borderColor: advice.bgColor + "40" }}>
          <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "flex-start", gap: 8 }}>
            <Text style={{ fontSize: 18 }}>{advice.icon}</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.foreground, fontSize: 13, fontWeight: "700", textAlign: "left", writingDirection: "rtl", marginBottom: 4 }}>{advice.title}</Text>
              <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 18, textAlign: "left", writingDirection: "rtl" }}>{advice.text}</Text>
            </View>
          </View>
        </View>
      ))}
    </View>
  );
}

interface AdviceItem { icon: string; title: string; text: string; bgColor: string; }

function generateEnvironmentAdvice(env: any, lang: Lang): AdviceItem[] {
  const advice: AdviceItem[] = [];
  if (env.neighborhood && env.neighborhood.length > 5) {
    if (/سلب|خطر|مشكل|سيئ|ضار|مخدرات|عنف|bad|danger|probleem|slecht|drugs|geweld/i.test(env.neighborhood)) {
      advice.push({ icon: "🏘️", title: tx(lang, "Buurtinvloed beperken", "Limit neighborhood influence", "الحد من تأثير الحي"), text: tx(lang, "Beperk onbegeleide buitentijd. Zoek veilige alternatieven zoals moskee-activiteiten.", "Limit unsupervised outdoor time. Find safe alternatives like mosque activities.", "قلل من الوقت غير المراقب خارج المنزل. ابحث عن بدائل آمنة كأنشطة المسجد."), bgColor: "#F59E0B" });
    }
  }
  if (env.friends && env.friends.length > 5) {
    if (/سلب|سيئ|ضار|bad|slecht|negatief/i.test(env.friends)) {
      advice.push({ icon: "👥", title: tx(lang, "Vriendenkring begeleiden", "Guide friend circle", "توجيه دائرة الأصدقاء"), text: tx(lang, "Help je kind betere vrienden te vinden via de moskee.", "Help your child find better friends through the mosque.", "ساعد طفلك في إيجاد أصدقاء أفضل عبر المسجد."), bgColor: "#EF4444" });
    }
  }
  if (env.mediaUse && env.mediaUse.length > 5) {
    if (/كثير|مفرط|إدمان|veel|excessief|verslaafd|excessive|addicted/i.test(env.mediaUse)) {
      advice.push({ icon: "📱", title: tx(lang, "Schermtijd beperken", "Limit screen time", "تقليل وقت الشاشة"), text: tx(lang, "Stel duidelijke regels voor schermtijd.", "Set clear rules for screen time.", "ضع قواعد واضحة لوقت الشاشة."), bgColor: "#8B5CF6" });
    }
  }
  if (env.badThinking && env.badThinking.length > 5) {
    advice.push({ icon: "🧠", title: tx(lang, "Denkpatronen verbeteren", "Improve thinking patterns", "تحسين أنماط التفكير"), text: tx(lang, "Werk aan het corrigeren van negatieve denkpatronen.", "Work on correcting negative thinking patterns.", "اعمل على تصحيح أنماط التفكير السلبية."), bgColor: "#0EA5E9" });
  }
  if (env.badSpeaking && env.badSpeaking.length > 5) {
    advice.push({ icon: "🗣️", title: tx(lang, "Spreekgedrag verbeteren", "Improve speech behavior", "تحسين أسلوب الكلام"), text: tx(lang, "Corrigeer ongewenst taalgebruik met zachtheid.", "Correct unwanted language use with gentleness.", "صحح الكلام غير المرغوب بلطف."), bgColor: "#10B981" });
  }
  if (env.badDoing && env.badDoing.length > 5) {
    advice.push({ icon: "⚡", title: tx(lang, "Gedrag bijsturen", "Correct behavior", "تعديل السلوك"), text: tx(lang, "Gebruik positieve bekrachtiging naast correctie.", "Use positive reinforcement alongside correction.", "استخدم التعزيز الإيجابي مع التصحيح."), bgColor: "#F97316" });
  }
  if (env.prayerStatus && /niet|لا|no|soms|أحيانا/i.test(env.prayerStatus)) {
    advice.push({ icon: "🕌", title: tx(lang, "Gebed stimuleren", "Encourage prayer", "تشجيع الصلاة"), text: tx(lang, "Bid samen als gezin. Maak het gebed aantrekkelijk.", "Pray together as a family. Make prayer attractive.", "صلوا معاً كعائلة. اجعل الصلاة محببة."), bgColor: "#059669" });
  }
  if (env.quranConnection && /zwak|ضعيف|weak|weinig|قليل|geen|لا/i.test(env.quranConnection)) {
    advice.push({ icon: "📖", title: tx(lang, "Qur'aan-band versterken", "Strengthen Qur'aan connection", "تقوية الصلة بالقرآن"), text: tx(lang, "Luister dagelijks samen naar Qur'aan.", "Listen to Qur'aan together daily.", "استمعوا للقرآن يومياً معاً."), bgColor: "#0D9488" });
  }
  return advice.slice(0, 4);
}

// ============================================================
// ADVISOR PLANS SECTION (preserved from previous version)
// ============================================================
function AdvisorPlansSection({ childId, childName, colors, isRTL, lang }: {
  childId: string; childName: string; colors: any; isRTL: boolean; lang: Lang;
}) {
  const [plans, setPlans] = useState<any[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [expandedPhase, setExpandedPhase] = useState<string | null>(null);

  useEffect(() => { loadPlans(); }, [childId]);

  const loadPlans = async () => {
    try {
      const data = await AsyncStorage.getItem("@advisor_action_plans");
      if (data) {
        const allPlans = JSON.parse(data);
        const childPlans = allPlans.filter((p: any) => !p.childId || p.childId === childId);
        setPlans(childPlans.slice(-5));
      }
    } catch (e) { console.error("Error loading advisor plans:", e); }
  };

  const toggleStepComplete = async (planId: string, stepId: string) => {
    try {
      const data = await AsyncStorage.getItem("@advisor_action_plans");
      if (data) {
        const allPlans = JSON.parse(data);
        const planIdx = allPlans.findIndex((p: any) => p.id === planId);
        if (planIdx >= 0) {
          const plan = allPlans[planIdx];
          const completed = plan.completedSteps || [];
          plan.completedSteps = completed.includes(stepId) ? completed.filter((s: string) => s !== stepId) : [...completed, stepId];
          allPlans[planIdx] = plan;
          await AsyncStorage.setItem("@advisor_action_plans", JSON.stringify(allPlans));
          setPlans(prev => prev.map(p => p.id === planId ? { ...p, completedSteps: plan.completedSteps } : p));
        }
      }
    } catch (e) { console.error("Error toggling step:", e); }
  };

  const removePlan = async (planId: string) => {
    try {
      const data = await AsyncStorage.getItem("@advisor_action_plans");
      if (data) {
        const filtered = JSON.parse(data).filter((p: any) => p.id !== planId);
        await AsyncStorage.setItem("@advisor_action_plans", JSON.stringify(filtered));
        setPlans(prev => prev.filter(p => p.id !== planId));
      }
    } catch (e) { console.error("Error removing plan:", e); }
  };

  if (plans.length === 0) return null;

  return (
    <View style={{ marginTop: 16 }}>
      <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <Text style={{ fontSize: 22 }}>📋</Text>
        <Text style={{ color: colors.foreground, fontSize: 15, fontWeight: "700", textAlign: "left", writingDirection: "rtl" }}>
          {tx(lang, "Behandelplannen", "Treatment plans", "خطط العلاج")}
        </Text>
      </View>
      {plans.map((plan) => {
        const phases = plan.phases || [];
        const completedSteps = plan.completedSteps || [];
        const totalSteps = phases.reduce((acc: number, ph: any) => acc + (ph.steps?.length || 0), 0);
        const completedCount = completedSteps.length;
        const progress = totalSteps > 0 ? Math.round((completedCount / totalSteps) * 100) : 0;
        const isExpanded = expanded === plan.id;

        return (
          <View key={plan.id} style={{ borderRadius: 12, padding: 14, marginBottom: 10, backgroundColor: colors.primary + "06", borderWidth: 1, borderColor: progress === 100 ? colors.success + "50" : colors.primary + "25" }}>
            <Pressable onPress={() => setExpanded(isExpanded ? null : plan.id)} style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}>
              <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", justifyContent: "space-between" }}>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 6 }}>
                    <MaterialIcons name={progress === 100 ? "check-circle" : "lightbulb"} size={18} color={progress === 100 ? colors.success : colors.primary} />
                    <Text style={{ color: colors.foreground, fontSize: 13, fontWeight: "700", flex: 1, textAlign: "left", writingDirection: "rtl" }} numberOfLines={1}>
                      {plan.childName || tx(lang, "Actieplan", "Action plan", "خطة عملية")}
                    </Text>
                  </View>
                  <View style={{ marginTop: 6, flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 8 }}>
                    <View style={{ flex: 1, height: 6, backgroundColor: colors.border, borderRadius: 3, overflow: "hidden" }}>
                      <View style={{ height: 6, backgroundColor: progress === 100 ? colors.success : colors.primary, borderRadius: 3, width: `${progress}%` }} />
                    </View>
                    <Text style={{ color: colors.muted, fontSize: 10, fontWeight: "600" }}>{progress}%</Text>
                  </View>
                </View>
                <MaterialIcons name={isExpanded ? "expand-less" : "expand-more"} size={22} color={colors.muted} style={{ marginLeft: 8 }} />
              </View>
            </Pressable>

            {isExpanded && (
              <View style={{ marginTop: 12 }}>
                {phases.length > 0 ? phases.map((phase: any, phIdx: number) => {
                  const phaseKey = `${plan.id}_ph${phIdx}`;
                  const isPhaseExpanded = expandedPhase === phaseKey;
                  const phaseCompleted = (phase.steps || []).every((s: any) => completedSteps.includes(s.id));
                  return (
                    <View key={phIdx} style={{ marginBottom: 8 }}>
                      <Pressable
                        onPress={() => setExpandedPhase(isPhaseExpanded ? null : phaseKey)}
                        style={({ pressed }) => [{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", justifyContent: "space-between", backgroundColor: phaseCompleted ? colors.success + "10" : colors.surface, borderRadius: 8, padding: 10, opacity: pressed ? 0.7 : 1 }]}
                      >
                        <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 6 }}>
                          <MaterialIcons name={phaseCompleted ? "check-circle" : "schedule"} size={16} color={phaseCompleted ? colors.success : colors.primary} />
                          <Text style={{ color: colors.foreground, fontSize: 12, fontWeight: "700" }}>{phase.phase}</Text>
                        </View>
                        <MaterialIcons name={isPhaseExpanded ? "expand-less" : "expand-more"} size={18} color={colors.muted} />
                      </Pressable>
                      {isPhaseExpanded && (phase.steps || []).map((step: any, sIdx: number) => {
                        const isComplete = completedSteps.includes(step.id);
                        return (
                          <Pressable
                            key={step.id || sIdx}
                            onPress={() => toggleStepComplete(plan.id, step.id)}
                            style={({ pressed }) => [{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "flex-start", gap: 8, paddingVertical: 8, paddingHorizontal: 12, marginTop: 2, backgroundColor: isComplete ? colors.success + "08" : "transparent", borderRadius: 6, opacity: pressed ? 0.7 : 1 }]}
                          >
                            <MaterialIcons name={isComplete ? "check-box" : "check-box-outline-blank"} size={20} color={isComplete ? colors.success : colors.muted} />
                            <View style={{ flex: 1 }}>
                              <Text style={{ color: isComplete ? colors.muted : colors.foreground, fontSize: 12, lineHeight: 18, textAlign: "left", writingDirection: "rtl", textDecorationLine: isComplete ? "line-through" : "none" }}>
                                {step.text}
                              </Text>
                            </View>
                          </Pressable>
                        );
                      })}
                    </View>
                  );
                }) : (
                  <Text style={{ color: colors.foreground, fontSize: 12, lineHeight: 18, textAlign: "left", writingDirection: "rtl" }}>
                    {plan.content}
                  </Text>
                )}
                <View style={{ flexDirection: isRTL ? "row-reverse" : "row", justifyContent: "space-between", marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.border }}>
                  <Text style={{ color: colors.muted, fontSize: 10 }}>{new Date(plan.savedAt).toLocaleDateString()}</Text>
                  <Pressable onPress={() => removePlan(plan.id)} style={({ pressed }) => [{ opacity: pressed ? 0.5 : 1 }]}>
                    <Text style={{ color: colors.error, fontSize: 11, fontWeight: "600" }}>{tx(lang, "Verwijderen", "Remove", "حذف")}</Text>
                  </Pressable>
                </View>
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

// ============================================================
// STYLES
// ============================================================
const s = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 22, fontWeight: "800", marginBottom: 12, marginTop: 8 },
  childPill: { borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8, marginRight: 8, borderWidth: 1.5 },
  infoCard: { borderRadius: 12, padding: 12, marginBottom: 16, borderWidth: 1 },
  infoRow: { justifyContent: "space-between", alignItems: "center" },
  progressBar: { height: 5, borderRadius: 3, overflow: "hidden" },
  progressFill: { height: 5, borderRadius: 3 },
  progressCard: { borderRadius: 14, padding: 16, marginBottom: 16, borderWidth: 1.5 },
  sectionHeader: { borderRadius: 14, padding: 14, borderWidth: 1.5 },
  weekNav: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16, paddingVertical: 10, paddingHorizontal: 8, borderRadius: 12, borderWidth: 1 },
  weekNavBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  weekNavCenter: { alignItems: "center", flex: 1 },
  goalCard: { borderRadius: 10, padding: 12, marginBottom: 8, borderWidth: 1 },
  goalRow: { alignItems: "flex-start" },
  checkbox: { width: 22, height: 22, borderRadius: 4, borderWidth: 2, alignItems: "center", justifyContent: "center", marginTop: 1 },
  goalText: { fontSize: 13, lineHeight: 20 },
  explanation: { marginTop: 10, paddingTop: 10, borderTopWidth: 1 },
  emptyState: { borderRadius: 16, padding: 30, alignItems: "center", borderWidth: 1, marginTop: 20 },
});
