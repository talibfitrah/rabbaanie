import { useState, useEffect, useCallback } from "react";
import { View, Text, Pressable, ScrollView, ActivityIndicator, LayoutAnimation, Platform, UIManager, StyleSheet } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useColors } from "@/hooks/use-colors";
import { useAppState } from "@/lib/app-context";
import { useI18n } from "@/lib/i18n";
import { calculateAgeInWeeks, getYearKey, getWeekInYear } from "@/lib/store";
import { getApiBaseUrl } from "@/constants/oauth";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type Lang = "nl" | "en" | "ar";

function tx(lang: Lang, nl: string, en: string, ar: string): string {
  return lang === "ar" ? ar : lang === "en" ? en : nl;
}

function cleanWeekplanText(text: string, lang?: string): string {
  let cleaned = text
    .replace(/\*\*/g, "")
    .replace(/^\s*\*\s*/, "")
    .trim();
  // Only replace Latin Islamic terms with Arabic when language is Arabic
  if (lang === "ar" || !lang) {
    cleaned = cleaned
      .replace(/\bAllaah\b/gi, "الله")
      .replace(/\bMaashaa'llaah\b/gi, "ما شاء الله")
      .replace(/\bBismillaah\b/gi, "بسم الله")
      .replace(/\bSubhaanAllaah\b/gi, "سبحان الله")
      .replace(/\bIn shaa' Allaah\b/gi, "إن شاء الله")
      .replace(/\bAstaghfirullaah\b/gi, "أستغفر الله")
      .replace(/3Abd-ur-Ra'oof/gi, "عبد الرؤوف")
      .replace(/3Abdullaah/gi, "عبد الله")
      .replace(/3Abd/g, "عبد");
  }
  return cleaned;
}

interface PlanCard {
  title: string;
  icon: string;
  content: string[];
}

interface PlanGroup {
  type: "parent" | "child";
  icon: string;
  title: string;
  color: string;
  bgColor: string;
  borderColor: string;
  cards: PlanCard[];
}

// Map keywords to icons for card titles
function getCardIcon(title: string): string {
  const lower = title.toLowerCase();
  if (lower.includes("صلا") || lower.includes("prayer") || lower.includes("gebed") || lower.includes("salaat")) return "🕌";
  if (lower.includes("قرآن") || lower.includes("quran") || lower.includes("koran") || lower.includes("تلاو")) return "📖";
  if (lower.includes("ذكر") || lower.includes("dhikr") || lower.includes("أذكار")) return "📿";
  if (lower.includes("عقيد") || lower.includes("aqeedah") || lower.includes("geloof") || lower.includes("إيمان")) return "🌟";
  if (lower.includes("سلوك") || lower.includes("behavior") || lower.includes("gedrag") || lower.includes("أخلاق") || lower.includes("خلق")) return "💪";
  if (lower.includes("اجتماع") || lower.includes("social") || lower.includes("sociaal") || lower.includes("معامل")) return "🤝";
  if (lower.includes("عبادا") || lower.includes("worship") || lower.includes("ibadah") || lower.includes("ibaadah")) return "🤲";
  if (lower.includes("تصفي") || lower.includes("tasfiy") || lower.includes("عقل") || lower.includes("mind")) return "🧠";
  if (lower.includes("تزكي") || lower.includes("tazkiy") || lower.includes("قلب") || lower.includes("heart") || lower.includes("hart")) return "💚";
  if (lower.includes("لسان") || lower.includes("كلام") || lower.includes("tongue") || lower.includes("speech") || lower.includes("taal")) return "🗣️";
  if (lower.includes("جوارح") || lower.includes("سلوك الوالد") || lower.includes("limbs") || lower.includes("actions")) return "💪";
  if (lower.includes("تربي") || lower.includes("tarbiy") || lower.includes("education") || lower.includes("opvoed")) return "📚";
  if (lower.includes("جدول") || lower.includes("schedule") || lower.includes("schema") || lower.includes("يوم")) return "📅";
  if (lower.includes("مبدأ") || lower.includes("مبادئ") || lower.includes("mindset") || lower.includes("principe")) return "💡";
  if (lower.includes("علم") || lower.includes("knowledge") || lower.includes("kennis") || lower.includes("تعلم")) return "📚";
  if (lower.includes("لعب") || lower.includes("play") || lower.includes("spel") || lower.includes("نشاط") || lower.includes("activit")) return "🎯";
  if (lower.includes("نوم") || lower.includes("sleep") || lower.includes("slaap")) return "🌙";
  if (lower.includes("طعام") || lower.includes("food") || lower.includes("eten") || lower.includes("أكل") || lower.includes("غذا")) return "🍽️";
  if (lower.includes("شريك") || lower.includes("partner") || lower.includes("زوج")) return "💑";
  if (lower.includes("نصيح") || lower.includes("advie") || lower.includes("advice") || lower.includes("توصي")) return "📋";
  if (lower.includes("هدف") || lower.includes("goal") || lower.includes("doel")) return "🎯";
  if (lower.includes("تحدي") || lower.includes("challeng") || lower.includes("uitdag")) return "⚡";
  if (lower.includes("غضب") || lower.includes("anger") || lower.includes("boos")) return "🔥";
  if (lower.includes("صبر") || lower.includes("patience") || lower.includes("geduld")) return "🌿";
  return "📌";
}

/**
 * Parse the raw LLM plan text into structured groups (parent + child)
 * with cards inside each group
 */
function parsePlanIntoGroups(rawText: string, lang: Lang, childName: string): PlanGroup[] {
  if (!rawText) return [];

  const lines = rawText.split("\n");
  const groups: PlanGroup[] = [];
  
  let currentGroupType: "parent" | "child" | null = null;
  let currentCardTitle = "";
  let currentCardContent: string[] = [];
  let parentCards: PlanCard[] = [];
  let childCards: PlanCard[] = [];

  // Patterns to detect parent vs child sections (new 2-division structure)
  const parentPatterns = [
    /القسم الأول/i, /الوالد مع نفسه/i,
    /نصيحة للوالد/i, /نصائح للوالد/i, /أولاً.*الوالد/i,
    /ADVIES VOOR DE OUDER/i, /ADVICE FOR THE PARENT/i,
    /مبادئ.*للوالد/i, /MINDSETS/i, /تحسين.*الصلة/i,
    /^\s*#?\s*\d+[\.\)]\s*نصيحة/i,
    /للأب/i, /للوالدين/i, /دور الأب/i, /دور الوالد/i,
    /مهام الأب/i, /واجبات الأب/i, /إرشادات للأب/i,
    /VOOR DE VADER/i, /FOR THE FATHER/i, /PARENT TASKS/i,
    /الجدول اليومي/i, /DAGSCHEMA/i, /DAILY SCHEDULE/i,
    // New structure: parent self-improvement sub-sections
    /التصفية.*\(عقل الوالد\)/i,
    /التزكية.*\(قلب الوالد\)/i,
    /تربية اللسان.*\(كلام الوالد\)/i,
    /تربية الجوارح.*\(سلوك الوالد\)/i,
  ];
  const childPatterns = [
    /القسم الثاني/i, /الوالد مع ولده/i,
    /تصفية.*الطفل/i, /تزكية.*الطفل/i, /تربية.*الطفل/i,
    /TASFIYA KIND/i, /TASFIYA CHILD/i, /TAZKIYA KIND/i, /TAZKIYA CHILD/i,
    /TARBIYA KIND/i, /TARBIYA CHILD/i,
    /أهداف.*الطفل/i, /خطة.*الطفل/i, /أنشطة.*الطفل/i,
    /DOELEN VOOR/i, /GOALS FOR/i,
    /تصفية.*الابن/i, /تزكية.*الابن/i, /تربية.*الابن/i,
    /أهداف محددة لهذا/i, /أهداف محددة/i,
    /للطفل/i, /للابن/i, /أنشطة الطفل/i,
    // New structure: child sub-sections
    /التصفية لـ/i, /التزكية لـ/i, /تربية اللسان لـ/i, /تربية الجوارح لـ/i,
    /\(تشكيل عقله\)/i, /\(تشكيل قلبه\)/i, /\(تشكيل كلامه\)/i, /\(تشكيل سلوكه\)/i,
    new RegExp(`تصفية.*${childName}`, 'i'),
    new RegExp(`تزكية.*${childName}`, 'i'),
    new RegExp(`تربية.*${childName}`, 'i'),
    new RegExp(`أهداف.*${childName}`, 'i'),
    new RegExp(`خطة.*${childName}`, 'i'),
    new RegExp(`التصفية لـ\s*${childName}`, 'i'),
    new RegExp(`التزكية لـ\s*${childName}`, 'i'),
    new RegExp(`تربية اللسان لـ\s*${childName}`, 'i'),
    new RegExp(`تربية الجوارح لـ\s*${childName}`, 'i'),
  ];
  // Sub-section patterns (cards within a group)
  const subSectionPattern = /^(?:\d+[\.\)]\s*|#{1,3}\s*|\*\s*)(.*)/;

  function saveCurrentCard() {
    if (currentCardTitle && currentCardContent.length > 0) {
      const card: PlanCard = {
        title: currentCardTitle,
        icon: getCardIcon(currentCardTitle),
        content: currentCardContent,
      };
      if (currentGroupType === "child") {
        childCards.push(card);
      } else {
        parentCards.push(card);
      }
    }
    currentCardTitle = "";
    currentCardContent = [];
  }

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed === "--" || trimmed === "---") continue;

    // Check if this is a parent section header
    const isParentHeader = parentPatterns.some(p => p.test(trimmed));
    const isChildHeader = childPatterns.some(p => p.test(trimmed));

    if (isParentHeader) {
      saveCurrentCard();
      currentGroupType = "parent";
      // Use the header text as a card title if it's descriptive
      const cleanTitle = trimmed.replace(/^\d+[\.\)]\s*/, "").replace(/^#+\s*/, "").replace(/^\*+\s*/, "").trim();
      if (cleanTitle.length > 3) {
        currentCardTitle = cleanTitle;
      }
      continue;
    }

    if (isChildHeader) {
      saveCurrentCard();
      currentGroupType = "child";
      const cleanTitle = trimmed.replace(/^\d+[\.\)]\s*/, "").replace(/^#+\s*/, "").replace(/^\*+\s*/, "").trim();
      if (cleanTitle.length > 3) {
        currentCardTitle = cleanTitle;
      }
      continue;
    }

    // Check if this line is a sub-section title (numbered or heading)
    const isSubTitle = /^(?:\d+[\.\)]\s+|#{1,3}\s+)/.test(trimmed) && trimmed.length < 100;
    if (isSubTitle && currentGroupType) {
      saveCurrentCard();
      currentCardTitle = trimmed.replace(/^\d+[\.\)]\s*/, "").replace(/^#+\s*/, "").replace(/^\*+\s*/, "").trim();
      continue;
    }

    // Content line - clean it up
    if (currentGroupType) {
      let cleaned = trimmed
        .replace(/^[-•●◆▪]\s*/, "")
        .replace(/^[a-z]\)\s*/i, "")
        .replace(/\*\*([^*]+)\*\*/g, "$1") // Remove ** bold
        .replace(/\*([^*]+)\*/g, "$1") // Remove * italic
        .replace(/^#{1,3}\s*/, "")
        .trim();
      
      if (cleaned) {
        // If no card title yet, use first meaningful line as title
        if (!currentCardTitle && cleaned.length > 5 && cleaned.length < 80) {
          currentCardTitle = cleaned;
        } else {
          currentCardContent.push(cleaned);
        }
      }
    } else {
      // Before any group is detected - assign to parent by default
      currentGroupType = "parent";
      let cleaned = trimmed
        .replace(/^[-•●◆▪]\s*/, "")
        .replace(/\*\*([^*]+)\*\*/g, "$1")
        .replace(/\*([^*]+)\*/g, "$1")
        .replace(/^#{1,3}\s*/, "")
        .trim();
      if (cleaned) {
        if (!currentCardTitle && cleaned.length > 5 && cleaned.length < 80) {
          currentCardTitle = cleaned;
        } else {
          currentCardContent.push(cleaned);
        }
      }
    }
  }

  // Save last card
  saveCurrentCard();

  // Build groups
  if (parentCards.length > 0) {
    groups.push({
      type: "parent",
      icon: "🧑‍🏫",
      title: tx(lang, "De ouder met zichzelf", "The parent with themselves", "الوالد مع نفسه"),
      color: "#166534",
      bgColor: "#F0FDF4",
      borderColor: "#BBF7D0",
      cards: parentCards,
    });
  }

  if (childCards.length > 0) {
    groups.push({
      type: "child",
      icon: "👶",
      title: tx(lang, `De ouder met ${childName}`, `The parent with ${childName}`, `الوالد مع ${childName}`),
      color: "#1E40AF",
      bgColor: "#EFF6FF",
      borderColor: "#BFDBFE",
      cards: childCards,
    });
  }

  // If no groups were created, try to split by paragraphs into parent/child
  if (groups.length === 0 && rawText.trim()) {
    const allLines = rawText.split("\n")
      .map(l => l.trim())
      .filter(l => l && l !== "--" && l !== "---")
      .map(l => l.replace(/\*\*([^*]+)\*\*/g, "$1").replace(/\*([^*]+)\*/g, "$1").replace(/^[-•●◆▪]\s*/, "").trim())
      .filter(l => l);
    
    // Try to split: first half for parent, second half for child
    const midPoint = Math.ceil(allLines.length * 0.6);
    const parentLines = allLines.slice(0, midPoint);
    const childLines = allLines.slice(midPoint);
    
    if (parentLines.length > 0) {
      groups.push({
        type: "parent",
        icon: "🧑‍🏫",
        title: tx(lang, "Advies voor de Ouder", "Advice for the Parent", "نصائح للوالد"),
        color: "#166534",
        bgColor: "#F0FDF4",
        borderColor: "#BBF7D0",
        cards: [{
          title: tx(lang, "Ouder taken", "Parent Tasks", "مهام الوالد"),
          icon: "📋",
          content: parentLines,
        }],
      });
    }
    if (childLines.length > 0) {
      groups.push({
        type: "child",
        icon: "👶",
        title: tx(lang, `Doelen voor ${childName}`, `Goals for ${childName}`, `أهداف ${childName}`),
        color: "#1E40AF",
        bgColor: "#EFF6FF",
        borderColor: "#BFDBFE",
        cards: [{
          title: tx(lang, `Doelen ${childName}`, `Goals ${childName}`, `أهداف ${childName}`),
          icon: "🎯",
          content: childLines,
        }],
      });
    }
  }

  return groups;
}

// Cache key for week plan
function getWeekPlanCacheKey(childId: string, lang: string, weekInYear: number | null, yearKey: string | null): string {
  return `weekplan_${childId}_${lang}_${yearKey}_w${weekInYear}`;
}

export default function WeekplanScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { language } = useI18n();
  const { state } = useAppState();
  const lang: Lang = language as Lang;
  const isRTL = lang === "ar";

  const child = state.children.find((c) => c.id === id);
  const env = state.environments.find((e) => e.childId === id);

  const [weekPlan, setWeekPlan] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedCards, setExpandedCards] = useState<Record<string, boolean>>({});

  const age = child?.birthDate ? calculateAgeInWeeks(child.birthDate) : null;
  const yearKey = age ? getYearKey(age.years) : null;
  const weekInYear = age ? getWeekInYear(age.totalWeeks, age.years) : null;
  const isAgeCapped = age ? age.years > 12 : false;
  const actualAge = age?.years || 0;

  const cacheKey = child ? getWeekPlanCacheKey(child.id, lang, weekInYear, yearKey) : "";

  const toggleCard = useCallback((key: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedCards(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  // Load cached plan or fetch new one
  useEffect(() => {
    if (!child || !age) {
      setLoading(false);
      return;
    }

    loadPlan();
  }, [child?.id, language]);

  async function loadPlan() {
    try {
      // Try loading from cache first
      const cached = await AsyncStorage.getItem(cacheKey);
      if (cached) {
        const { plan, timestamp } = JSON.parse(cached);
        // Cache is valid for 7 days (one week)
        const daysSince = (Date.now() - timestamp) / (1000 * 60 * 60 * 24);
        if (daysSince < 7 && plan) {
          setWeekPlan(plan);
          // Auto-expand first card of each group
          setExpandedCards({ "parent-0": true, "child-0": true });
          setLoading(false);
          return;
        }
      }
    } catch (e) {}

    // Fetch from server
    await fetchWeekPlan();
  }

  async function fetchWeekPlan() {
    if (!child || !age) return;
    try {
      const apiUrl = getApiBaseUrl();
      const response = await fetch(`${apiUrl}/api/advice/weekplan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          childName: child.name,
          childAge: tx(lang, `${age.years} jaar en ${age.months} maanden`, `${age.years} years and ${age.months} months`, `${age.years} سنة و${age.months} أشهر`),
          childGender: child.gender || tx(lang, "onbekend", "unknown", "غير معروف"),
          yearKey: yearKey || tx(lang, "onbekend", "unknown", "غير معروف"),
          weekInYear: weekInYear || 1,
          language,
          environment: env || null,
          parentProfile: state.parentProfile,
          recentIssues: state.issues
            .filter(i => i.childId === child.id && !i.resolved)
            .slice(-5)
            .map(i => ({ description: i.description, treatmentPlan: i.treatmentPlan || "", childId: i.childId })),
        }),
      });
      const result = await response.json();
      if (result.plan) {
        setWeekPlan(result.plan);
        // Save to cache
        await AsyncStorage.setItem(cacheKey, JSON.stringify({ plan: result.plan, timestamp: Date.now() }));
        // Auto-expand first card of each group
        setExpandedCards({ "parent-0": true, "child-0": true });
      }
    } catch {
      // If fetch fails, try to use any cached version
      try {
        const cached = await AsyncStorage.getItem(cacheKey);
        if (cached) {
          const { plan } = JSON.parse(cached);
          if (plan) setWeekPlan(plan);
        } else {
          setWeekPlan(tx(lang,
            "Er is een fout opgetreden bij het laden van het weekplan.",
            "An error occurred while loading the week plan.",
            "حدث خطأ أثناء تحميل الخطة الأسبوعية."
          ));
        }
      } catch { }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  async function handleRefresh() {
    setRefreshing(true);
    // Clear cache and fetch new
    try { await AsyncStorage.removeItem(cacheKey); } catch {}
    await fetchWeekPlan();
  }

  if (!child) {
    return (
      <View style={[s.center, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.muted }}>{tx(lang, "Kind niet gevonden", "Child not found", "لم يُعثَر على بيانات الطفل")}</Text>
      </View>
    );
  }

  const groups = weekPlan ? parsePlanIntoGroups(weekPlan, lang, child.name) : [];

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{
        paddingTop: insets.top + 16,
        paddingBottom: insets.bottom + 40,
        paddingHorizontal: 16,
      }}
    >
      {/* Back button */}
      <Pressable
        onPress={() => router.back()}
        style={({ pressed }) => [s.backBtn, { flexDirection: isRTL ? "row-reverse" : "row", opacity: pressed ? 0.7 : 1 }]}
      >
        <MaterialIcons name={isRTL ? "arrow-forward" : "arrow-back"} size={20} color={colors.primary} />
        <Text style={{ color: colors.primary, fontSize: 15, fontWeight: "600", marginLeft: isRTL ? 0 : 6, marginRight: isRTL ? 6 : 0 }}>
          {tx(lang, "Terug", "Back", "رجوع")}
        </Text>
      </Pressable>

      {/* Header */}
      <View style={s.header}>
        <Text style={[s.title, { color: colors.foreground, textAlign: isRTL ? "right" : "left" }]}>
          {tx(lang, `Weekplan — ${child.name}`, `Week Plan — ${child.name}`, `الخطة الأسبوعية — ${child.name}`)}
        </Text>
        {age && (
          <Text style={{ color: colors.muted, fontSize: 14, marginTop: 4, textAlign: isRTL ? "right" : "left" }}>
            {tx(lang, `${yearKey} — Week ${weekInYear}`, `${yearKey ? yearKey.replace('Jaar', 'Year') : ''} — Week ${weekInYear}`, `السنة ${yearKey ? yearKey.replace('Jaar ', '') : ''} — الأسبوع ${weekInYear}`)}
          </Text>
        )}

      </View>

      {/* Refresh button */}
      {!loading && weekPlan && (
        <Pressable
          onPress={handleRefresh}
          disabled={refreshing}
          style={({ pressed }) => [{
            backgroundColor: colors.primary,
            borderRadius: 12,
            paddingVertical: 12,
            alignItems: "center",
            marginBottom: 16,
            opacity: pressed ? 0.85 : refreshing ? 0.6 : 1,
          }]}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            {refreshing && <ActivityIndicator size="small" color="#fff" />}
            <Text style={{ color: "#fff", fontSize: 14, fontWeight: "700" }}>
              {refreshing
                ? tx(lang, "Vernieuwen...", "Refreshing...", "جارٍ التحديث...")
                : tx(lang, "Vernieuw weekplan", "Refresh week plan", "تحديث الخطة")}
            </Text>
          </View>
        </Pressable>
      )}

      {/* Loading */}
      {loading ? (
        <View style={s.loadingBox}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={{ color: colors.muted, marginTop: 12, fontSize: 14, textAlign: "center" }}>
            {tx(lang, "Weekplan wordt gegenereerd...", "Generating week plan...", "جارٍ إعداد الخطة الأسبوعية...")}
          </Text>
        </View>
      ) : groups.length > 0 ? (
        <>
          {groups.map((group, gIdx) => (
            <View key={`group-${gIdx}`} style={s.groupContainer}>
              {/* Group Header */}
              <View style={[s.groupHeader, { backgroundColor: group.bgColor, borderColor: group.borderColor }]}>
                <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 10, flex: 1 }}>
                  <Text style={{ fontSize: 22 }}>{group.icon}</Text>
                  <Text style={[s.groupTitle, { color: group.color, textAlign: isRTL ? "right" : "left" }]}>
                    {group.title}
                  </Text>
                </View>
              </View>

              {/* Cards */}
              {group.cards.map((card, cIdx) => {
                const cardKey = `${group.type}-${cIdx}`;
                const isExpanded = expandedCards[cardKey] ?? false;
                return (
                  <CardAccordion
                    key={cardKey}
                    card={card}
                    isExpanded={isExpanded}
                    onToggle={() => toggleCard(cardKey)}
                    groupColor={group.color}
                    colors={colors}
                    isRTL={isRTL}
                    lang={lang}
                  />
                );
              })}
            </View>
          ))}
        </>
      ) : weekPlan ? (
        // Fallback: show raw text if parsing failed
        <View style={[s.rawTextBox, { borderColor: colors.border, backgroundColor: colors.surface }]}>
          <Text style={{ color: colors.foreground, fontSize: 14, lineHeight: 22, textAlign: isRTL ? "right" : "left", writingDirection: isRTL ? "rtl" : "ltr" }}>
            {weekPlan.replace(/\*\*([^*]+)\*\*/g, "$1").replace(/\*([^*]+)\*/g, "$1")}
          </Text>
        </View>
      ) : (
        <View style={s.loadingBox}>
          <Text style={{ color: colors.muted }}>
            {tx(lang, "Vul eerst de geboortedatum in.", "First fill in the birth date.", "أدخل تاريخ الميلاد أولاً.")}
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

// Accordion Card component
function CardAccordion({ card, isExpanded, onToggle, groupColor, colors, isRTL, lang }: {
  card: PlanCard;
  isExpanded: boolean;
  onToggle: () => void;
  groupColor: string;
  colors: any;
  isRTL: boolean;
  lang: string;
}) {
  return (
    <View style={[s.cardContainer, { borderColor: groupColor + "25" }]}>
      <Pressable
        onPress={onToggle}
        style={({ pressed }) => [s.cardHeader, {
          backgroundColor: groupColor + "06",
          opacity: pressed ? 0.8 : 1,
        }]}
      >
        <View style={[s.cardHeaderRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
          <Text style={{ fontSize: 18 }}>{card.icon}</Text>
          <Text style={[s.cardTitle, {
            color: groupColor,
            textAlign: isRTL ? "right" : "left",
            flex: 1,
            marginLeft: isRTL ? 0 : 10,
            marginRight: isRTL ? 10 : 0,
          }]}>
            {cleanWeekplanText(card.title, lang)}
          </Text>
          <View style={[s.expandIcon, { backgroundColor: groupColor + "12" }]}>
            <MaterialIcons name={isExpanded ? "expand-less" : "expand-more"} size={20} color={groupColor} />
          </View>
        </View>
      </Pressable>

      {isExpanded && (
        <View style={[s.cardBody, { borderTopColor: groupColor + "15" }]}>
          {card.content.map((item, idx) => (
            <View key={idx} style={[s.itemRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
              <View style={[s.itemBullet, { backgroundColor: groupColor + "40" }]} />
              <Text style={[s.itemText, {
                color: colors.foreground,
                textAlign: isRTL ? "right" : "left",
                writingDirection: isRTL ? "rtl" : "ltr",
              }]}>
                {cleanWeekplanText(item, lang)}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  backBtn: { alignItems: "center", marginBottom: 16 },
  header: { marginBottom: 20 },
  title: { fontSize: 22, fontWeight: "800" },
  warningBox: { borderRadius: 12, padding: 12, marginTop: 8, borderWidth: 1 },
  loadingBox: { alignItems: "center", paddingVertical: 40 },
  groupContainer: { marginBottom: 20 },
  groupHeader: { flexDirection: "row", alignItems: "center", padding: 14, borderRadius: 14, borderWidth: 1, marginBottom: 8 },
  groupTitle: { fontSize: 16, fontWeight: "700", flex: 1 },
  cardContainer: { marginBottom: 8, borderRadius: 12, borderWidth: 1, overflow: "hidden" },
  cardHeader: { padding: 14 },
  cardHeaderRow: { alignItems: "center" },
  cardTitle: { fontSize: 14, fontWeight: "700" },
  expandIcon: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  cardBody: { padding: 14, paddingTop: 10, borderTopWidth: 1 },
  itemRow: { marginBottom: 10, alignItems: "flex-start" },
  itemBullet: { width: 6, height: 6, borderRadius: 3, marginTop: 7, marginHorizontal: 8 },
  itemText: { flex: 1, fontSize: 13, lineHeight: 21 },
  rawTextBox: { borderRadius: 16, padding: 20, borderWidth: 1 },
});
