import { useState, useEffect, useCallback } from "react";
import { View, Text, FlatList, Pressable, StyleSheet, ActivityIndicator, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useI18n } from "@/lib/i18n";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { ScreenContainer } from "@/components/screen-container";
import { getApiBaseUrl } from "@/constants/oauth";
import { ADHKAR_CATEGORIES } from "@/lib/adhkar-data";

import { authedFetch } from "@/lib/authed-fetch";
type Lang = "nl" | "en" | "ar";

function tx(lang: Lang, nl: string, en: string, ar: string): string {
  if (lang === "en") return en;
  if (lang === "ar") return ar;
  return nl;
}

// Adhkar categories with icons
const ADHKAR_SECTIONS = [
  { id: "morning", icon: "wb-sunny", colorBg: "#FFF8E1", colorIcon: "#F59E0B", colorText: "#92400E" },
  { id: "evening", icon: "nights-stay", colorBg: "#EDE7F6", colorIcon: "#5E35B1", colorText: "#4A148C" },
  { id: "sleep", icon: "bedtime", colorBg: "#E3F2FD", colorIcon: "#1565C0", colorText: "#0D47A1" },
  { id: "waking", icon: "alarm", colorBg: "#E8F5E9", colorIcon: "#2E7D32", colorText: "#1B5E20" },
  { id: "after_every_prayer", icon: "mosque", colorBg: "#E0F2F1", colorIcon: "#00695C", colorText: "#004D40" },
  { id: "night_prayer", icon: "nightlight-round", colorBg: "#F3E5F5", colorIcon: "#6A1B9A", colorText: "#4A148C" },
  { id: "food", icon: "restaurant", colorBg: "#FFF3E0", colorIcon: "#E65100", colorText: "#BF360C" },
  { id: "travel", icon: "flight", colorBg: "#E1F5FE", colorIcon: "#0277BD", colorText: "#01579B" },
  { id: "distress", icon: "healing", colorBg: "#FCE4EC", colorIcon: "#AD1457", colorText: "#880E4F" },
  { id: "general_dhikr", icon: "auto-awesome", colorBg: "#F1F8E9", colorIcon: "#558B2F", colorText: "#33691E" },
];

function getSectionTitle(id: string, lang: Lang): string {
  const titles: Record<string, { nl: string; en: string; ar: string }> = {
    morning: { nl: "Ochtendadhkaar", en: "Morning Adhkaar", ar: "أذكار الصباح" },
    evening: { nl: "Avondadhkaar", en: "Evening Adhkaar", ar: "أذكار المساء" },
    sleep: { nl: "Slaap-adhkaar", en: "Sleep Adhkaar", ar: "أذكار النوم" },
    waking: { nl: "Ontwaken-adhkaar", en: "Waking Adhkaar", ar: "أذكار الاستيقاظ" },
    after_every_prayer: { nl: "Na elk gebed", en: "After Every Prayer", ar: "بعد كل صلاة" },
    night_prayer: { nl: "Nachtgebed", en: "Night Prayer", ar: "قيام الليل" },
    food: { nl: "Eten & drinken", en: "Food & Drink", ar: "الطعام والشراب" },
    travel: { nl: "Reizen", en: "Travel", ar: "السفر" },
    distress: { nl: "Nood & verdriet", en: "Distress & Grief", ar: "الكرب والهم" },
    general_dhikr: { nl: "Algemene dhikr", en: "General Dhikr", ar: "أذكار عامة" },
  };
  return titles[id]?.[lang] || id;
}

// All context categories grouped
const ALL_CONTEXTS: Record<string, string[]> = {
  time: ["morning", "evening", "sleep", "waking", "pre_fajr", "fajr_period", "duha_work", "dhuhr_time", "asr_time", "maghrib_isha", "night_prayer", "sleep_cycle", "witr", "monthly", "yearly"],
  prayer: ["adhan", "after_every_prayer", "after_fajr", "after_maghrib", "inside_prayer", "special_prayers", "friday", "istikharah", "eclipse", "khutbah", "arafah"],
  place: ["home", "market", "toilet", "graveyard", "entering_town", "mosque", "travel_route"],
  state: ["anger", "distress", "difficulty", "joy", "gratitude", "poverty", "debt", "enemy_fear", "waswas", "evil_eye", "pain_ruqyah", "sick_visit", "night_fright", "drought", "epidemic", "floods", "weather", "stings", "animal_sounds", "hidden_shirk", "omens", "seeing_afflicted", "sin_majlis", "menses", "loan_repay", "love_in_allah"],
  life: ["marriage", "newborn", "food", "clothing", "sneezing", "travel", "death_funeral", "first_fruits", "slaughter", "new_moon"],
  worship: ["hajj", "fasting", "zakat", "quran_duas", "recitation", "wudu", "comprehensive", "daily_rules", "etiquette", "general_dhikr", "sahabah_duas"],
};

interface AdhkarItem {
  id: number;
  context_code: string;
  category: string;
  text_ar: string;
  text_nl: string;
  text_en: string;
  how_to_apply_ar: string;
  how_to_apply_nl: string;
  how_to_apply_en: string;
  reward_ar: string;
  reward_nl: string;
  reward_en: string;
  repetitions: number;
  translit_nl?: string;
}

// Build a lookup map from local adhkar-data for translit
function getTranslitForContext(contextCode: string, sortIndex: number): string | undefined {
  const category = ADHKAR_CATEGORIES.find(c => c.id === contextCode);
  if (!category) return undefined;
  const dhikr = category.adhkar[sortIndex];
  return dhikr?.translit || undefined;
}

type TabMode = "adhkar" | "quran" | "all_categories";

export default function DhikriScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t, language, isRTL } = useI18n();
  const lang = language as Lang;
  const [tabMode, setTabMode] = useState<TabMode>("adhkar");
  const [selectedContext, setSelectedContext] = useState<string | null>(null);
  const [adhkarList, setAdhkarList] = useState<AdhkarItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  // Determine current time-based adhkar
  const currentHour = new Date().getHours();
  const currentTimeContext = currentHour >= 4 && currentHour < 12 ? "morning" : currentHour >= 12 && currentHour < 17 ? "afternoon" : "evening";

  const fetchAdhkar = useCallback(async (context: string) => {
    setLoading(true);
    try {
      const baseUrl = getApiBaseUrl();
      const response = await authedFetch(`/api/adhkar?context=${context}`);
      if (response.ok) {
        const data = await response.json();
        setAdhkarList(data);
        // Cache adhkar for widget (time-aware)
        if (data.length > 0) {
          try {
            const { cacheDhikrForWidget, mapDbContextToWidgetContext } = require("@/widgets/dhikr-data");
            const widgetItems = data.slice(0, 15).map((item: AdhkarItem) => ({
              text: item.text_ar || item.text_nl,
              source: item.category || "",
              reward: item.reward_ar || item.reward_nl || "",
              context: context,
            }));
            const widgetContext = mapDbContextToWidgetContext(context);
            cacheDhikrForWidget(widgetItems, widgetContext);
          } catch {}
        }
      }
    } catch (err) {
      console.log("Error fetching adhkar:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedContext) {
      fetchAdhkar(selectedContext);
    }
  }, [selectedContext, fetchAdhkar]);

  const getTextForLang = (item: AdhkarItem, field: "text" | "how_to_apply" | "reward") => {
    if (field === "text") {
      // Always show Arabic text first, then translation
      return { ar: item.text_ar, translated: lang === "ar" ? "" : lang === "nl" ? item.text_nl : item.text_en };
    }
    if (field === "how_to_apply") {
      return { ar: item.how_to_apply_ar, translated: lang === "ar" ? "" : lang === "nl" ? item.how_to_apply_nl : item.how_to_apply_en };
    }
    return { ar: item.reward_ar, translated: lang === "ar" ? "" : lang === "nl" ? item.reward_nl : item.reward_en };
  };

  const renderAdhkarItem = ({ item, index }: { item: AdhkarItem; index: number }) => {
    const isExpanded = expandedId === item.id;
    const textData = getTextForLang(item, "text");
    const howData = getTextForLang(item, "how_to_apply");
    const rewardData = getTextForLang(item, "reward");
    const showTranslit = lang !== "ar";
    // Get translit from local data (matched by context + sort order)
    const translit = item.translit_nl || getTranslitForContext(selectedContext || "", index);

    return (
      <Pressable
        onPress={() => setExpandedId(isExpanded ? null : item.id)}
        style={({ pressed }) => [styles.adhkarCard, pressed && { opacity: 0.95 }]}
      >
        {/* Arabic text always shown */}
        <Text style={styles.adhkarArabic}>{textData.ar}</Text>

        {/* Transliteration - shown for NL/EN */}
        {showTranslit && translit ? (
          <Text style={styles.translitText}>{translit}</Text>
        ) : null}
        
        {/* Translation */}
        {textData.translated ? (
          <Text style={styles.adhkarTranslation}>{textData.translated}</Text>
        ) : null}

        {/* Repetitions badge */}
        {item.repetitions > 1 && (
          <View style={[styles.repBadge, isRTL ? { right: 8 } : { left: 8 }]}>
            <Text style={styles.repText}>{item.repetitions}x</Text>
          </View>
        )}

        {/* Expanded details */}
        {isExpanded && (
          <View style={styles.expandedSection}>
            {howData.ar ? (
              <View style={styles.detailBlock}>
                <Text style={styles.detailLabel}>
                  {tx(lang, "Hoe toe te passen", "How to apply", "كيفية التطبيق")}
                </Text>
                <Text style={styles.detailTextAr}>{howData.ar}</Text>
                {howData.translated ? <Text style={styles.detailTextTr}>{howData.translated}</Text> : null}
              </View>
            ) : null}
            {rewardData.ar ? (
              <View style={styles.detailBlock}>
                <Text style={styles.detailLabel}>
                  {tx(lang, "Beloning & verdienste", "Reward & merit", "الفضل والأجر")}
                </Text>
                <Text style={styles.detailTextAr}>{rewardData.ar}</Text>
                {rewardData.translated ? <Text style={styles.detailTextTr}>{rewardData.translated}</Text> : null}
              </View>
            ) : null}
          </View>
        )}
      </Pressable>
    );
  };

  // Main sections view
  const renderSectionsGrid = () => (
    <ScrollView contentContainerStyle={styles.sectionsContainer} showsVerticalScrollIndicator={false}>
      {/* Qur'aan access - FIRST */}
      <Pressable
        onPress={() => router.push("/(tabs)/concepts")}
        style={({ pressed }) => [styles.quranCard, { flexDirection: isRTL ? "row-reverse" : "row" }, pressed && { opacity: 0.9 }]}
      >
        <MaterialIcons name="auto-stories" size={32} color="#1B4332" />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.quranCardTitle}>
            {tx(lang, "Qur'aan Kariem", "Noble Qur'aan", "القرآن الكريم")}
          </Text>
          <Text style={styles.quranCardSubtitle}>
            {tx(lang, "Lees en luister naar de Qur'aan", "Read and listen to the Qur'aan", "اقرأ واستمع للقرآن الكريم")}
          </Text>
        </View>
        <MaterialIcons name="chevron-right" size={24} color="#9CA3AF" />
      </Pressable>

      {/* Quick access - time-based */}
      <Text style={styles.sectionGroupTitle}>
        {tx(lang, "Adhkaar van nu", "Current Adhkaar", "أذكار الوقت الحالي")}
      </Text>
      <View style={[styles.quickAccessRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
        {ADHKAR_SECTIONS.slice(0, 4).map((sec) => (
          <Pressable
            key={sec.id}
            onPress={() => setSelectedContext(sec.id)}
            style={({ pressed }) => [styles.sectionCard, { backgroundColor: sec.colorBg }, pressed && { opacity: 0.8 }]}
          >
            <MaterialIcons name={sec.icon as any} size={28} color={sec.colorIcon} />
            <Text style={[styles.sectionCardText, { color: sec.colorText }]} numberOfLines={2}>
              {getSectionTitle(sec.id, lang)}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Prayer-related */}
      <Text style={styles.sectionGroupTitle}>
        {tx(lang, "Gebed & aanbidding", "Prayer & Worship", "الصلاة والعبادة")}
      </Text>
      <View style={[styles.quickAccessRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
        {ADHKAR_SECTIONS.slice(4, 8).map((sec) => (
          <Pressable
            key={sec.id}
            onPress={() => setSelectedContext(sec.id)}
            style={({ pressed }) => [styles.sectionCard, { backgroundColor: sec.colorBg }, pressed && { opacity: 0.8 }]}
          >
            <MaterialIcons name={sec.icon as any} size={28} color={sec.colorIcon} />
            <Text style={[styles.sectionCardText, { color: sec.colorText }]} numberOfLines={2}>
              {getSectionTitle(sec.id, lang)}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* States & situations */}
      <Text style={styles.sectionGroupTitle}>
        {tx(lang, "Situaties & toestanden", "Situations & States", "الأحوال والمواقف")}
      </Text>
      <View style={[styles.quickAccessRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
        {ADHKAR_SECTIONS.slice(8).map((sec) => (
          <Pressable
            key={sec.id}
            onPress={() => setSelectedContext(sec.id)}
            style={({ pressed }) => [styles.sectionCard, { backgroundColor: sec.colorBg }, pressed && { opacity: 0.8 }]}
          >
            <MaterialIcons name={sec.icon as any} size={28} color={sec.colorIcon} />
            <Text style={[styles.sectionCardText, { color: sec.colorText }]} numberOfLines={2}>
              {getSectionTitle(sec.id, lang)}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* All categories button */}
      <Pressable
        onPress={() => setTabMode("all_categories")}
        style={({ pressed }) => [styles.allCategoriesBtn, { flexDirection: isRTL ? "row-reverse" : "row" }, pressed && { opacity: 0.8 }]}
      >
        <MaterialIcons name="apps" size={20} color="#1B4332" />
        <Text style={styles.allCategoriesBtnText}>
          {tx(lang, "Alle 80 categorieën bekijken", "View all 80 categories", "عرض جميع الـ 80 فئة")}
        </Text>
        <MaterialIcons name="chevron-right" size={20} color="#1B4332" />
      </Pressable>

    </ScrollView>
  );

  // All categories view
  const renderAllCategories = () => {
    const categoryNames: Record<string, { nl: string; en: string; ar: string }> = {
      time: { nl: "Tijdstippen", en: "Times", ar: "الأوقات" },
      prayer: { nl: "Gebed", en: "Prayer", ar: "الصلاة" },
      place: { nl: "Plaatsen", en: "Places", ar: "الأماكن" },
      state: { nl: "Toestanden", en: "States", ar: "الأحوال" },
      life: { nl: "Levensgebeurtenissen", en: "Life Events", ar: "أحداث الحياة" },
      worship: { nl: "Aanbidding", en: "Worship", ar: "العبادات" },
    };

    const contextNames: Record<string, { nl: string; en: string; ar: string }> = {
      morning: { nl: "Ochtend", en: "Morning", ar: "الصباح" },
      evening: { nl: "Avond", en: "Evening", ar: "المساء" },
      sleep: { nl: "Slaap", en: "Sleep", ar: "النوم" },
      waking: { nl: "Ontwaken", en: "Waking", ar: "الاستيقاظ" },
      pre_fajr: { nl: "Voor Fajr", en: "Before Fajr", ar: "قبل الفجر" },
      fajr_period: { nl: "Fajr-periode", en: "Fajr Period", ar: "فترة الفجر" },
      duha_work: { nl: "Duhaa & werk", en: "Duhaa & Work", ar: "الضحى والعمل" },
      dhuhr_time: { nl: "Dhuhr-tijd", en: "Dhuhr Time", ar: "وقت الظهر" },
      asr_time: { nl: "Asr-tijd", en: "Asr Time", ar: "وقت العصر" },
      maghrib_isha: { nl: "Maghrib & Ishaa", en: "Maghrib & Ishaa", ar: "المغرب والعشاء" },
      night_prayer: { nl: "Nachtgebed", en: "Night Prayer", ar: "قيام الليل" },
      sleep_cycle: { nl: "Slaapcyclus", en: "Sleep Cycle", ar: "دورة النوم" },
      witr: { nl: "Witr", en: "Witr", ar: "الوتر" },
      adhan: { nl: "Adhaan", en: "Adhaan", ar: "الأذان" },
      after_every_prayer: { nl: "Na elk gebed", en: "After Every Prayer", ar: "بعد كل صلاة" },
      after_fajr: { nl: "Na Fajr", en: "After Fajr", ar: "بعد الفجر" },
      after_maghrib: { nl: "Na Maghrib", en: "After Maghrib", ar: "بعد المغرب" },
      inside_prayer: { nl: "In het gebed", en: "Inside Prayer", ar: "داخل الصلاة" },
      special_prayers: { nl: "Speciale gebeden", en: "Special Prayers", ar: "صلوات خاصة" },
      friday: { nl: "Vrijdag", en: "Friday", ar: "الجمعة" },
      istikharah: { nl: "Istikhaara", en: "Istikhaara", ar: "الاستخارة" },
      home: { nl: "Thuis", en: "Home", ar: "البيت" },
      market: { nl: "Markt", en: "Market", ar: "السوق" },
      toilet: { nl: "Toilet", en: "Toilet", ar: "الخلاء" },
      graveyard: { nl: "Begraafplaats", en: "Graveyard", ar: "المقبرة" },
      entering_town: { nl: "Stad betreden", en: "Entering Town", ar: "دخول البلد" },
      mosque: { nl: "Moskee", en: "Mosque", ar: "المسجد" },
      anger: { nl: "Woede", en: "Anger", ar: "الغضب" },
      distress: { nl: "Nood", en: "Distress", ar: "الكرب" },
      difficulty: { nl: "Moeilijkheid", en: "Difficulty", ar: "الصعوبة" },
      joy: { nl: "Vreugde", en: "Joy", ar: "الفرح" },
      gratitude: { nl: "Dankbaarheid", en: "Gratitude", ar: "الشكر" },
      poverty: { nl: "Armoede", en: "Poverty", ar: "الفقر" },
      debt: { nl: "Schuld", en: "Debt", ar: "الدَّين" },
      enemy_fear: { nl: "Angst voor vijand", en: "Fear of Enemy", ar: "الخوف من العدو" },
      waswas: { nl: "Waswas", en: "Waswas", ar: "الوسوسة" },
      evil_eye: { nl: "Boze oog", en: "Evil Eye", ar: "العين" },
      pain_ruqyah: { nl: "Pijn & ruqyah", en: "Pain & Ruqyah", ar: "الألم والرقية" },
      sick_visit: { nl: "Ziekenbezoek", en: "Visiting the Sick", ar: "عيادة المريض" },
      night_fright: { nl: "Nachtelijke angst", en: "Night Fright", ar: "الفزع الليلي" },
      marriage: { nl: "Huwelijk", en: "Marriage", ar: "الزواج" },
      newborn: { nl: "Pasgeborene", en: "Newborn", ar: "المولود" },
      food: { nl: "Eten", en: "Food", ar: "الطعام" },
      clothing: { nl: "Kleding", en: "Clothing", ar: "اللباس" },
      sneezing: { nl: "Niezen", en: "Sneezing", ar: "العطاس" },
      travel: { nl: "Reizen", en: "Travel", ar: "السفر" },
      death_funeral: { nl: "Dood & begrafenis", en: "Death & Funeral", ar: "الموت والجنازة" },
      hajj: { nl: "Hadj", en: "Hajj", ar: "الحج" },
      fasting: { nl: "Vasten", en: "Fasting", ar: "الصيام" },
      zakat: { nl: "Zakaat", en: "Zakaat", ar: "الزكاة" },
      quran_duas: { nl: "Qur'aan-smeekbeden", en: "Qur'aanic Du'aas", ar: "أدعية قرآنية" },
      recitation: { nl: "Recitatie", en: "Recitation", ar: "التلاوة" },
      wudu: { nl: "Woedoe", en: "Wudhoo", ar: "الوضوء" },
      monthly: { nl: "Maandelijks", en: "Monthly", ar: "شهري" },
      yearly: { nl: "Jaarlijks", en: "Yearly", ar: "سنوي" },
      eclipse: { nl: "Eclips", en: "Eclipse", ar: "الكسوف والخسوف" },
      khutbah: { nl: "Khutbah", en: "Khutbah", ar: "الخطبة" },
      arafah: { nl: "Arafah", en: "Arafah", ar: "عرفة" },
      travel_route: { nl: "Onderweg", en: "On the Road", ar: "في الطريق" },
      drought: { nl: "Droogte", en: "Drought", ar: "الجفاف والقحط" },
      epidemic: { nl: "Epidemie", en: "Epidemic", ar: "الوباء" },
      floods: { nl: "Overstromingen", en: "Floods", ar: "السيول" },
      weather: { nl: "Weer", en: "Weather", ar: "الطقس" },
      stings: { nl: "Steken", en: "Stings", ar: "اللدغات" },
      animal_sounds: { nl: "Dierengeluiden", en: "Animal Sounds", ar: "أصوات الحيوانات" },
      hidden_shirk: { nl: "Verborgen shirk", en: "Hidden Shirk", ar: "الشرك الخفي" },
      omens: { nl: "Voortekenen", en: "Omens", ar: "الطيرة" },
      seeing_afflicted: { nl: "Bij zien van beproefde", en: "Seeing the Afflicted", ar: "رؤية المبتلى" },
      sin_majlis: { nl: "Zonde in bijeenkomst", en: "Sin in Gathering", ar: "كفارة المجلس" },
      menses: { nl: "Menstruatie", en: "Menses", ar: "الحيض" },
      loan_repay: { nl: "Lening terugbetalen", en: "Loan Repayment", ar: "سداد الدين" },
      love_in_allah: { nl: "Liefde in Allah", en: "Love in Allaah", ar: "الحب في الله" },
      first_fruits: { nl: "Eerste vruchten", en: "First Fruits", ar: "باكورة الثمار" },
      slaughter: { nl: "Slachten", en: "Slaughter", ar: "الذبح" },
      new_moon: { nl: "Nieuwe maan", en: "New Moon", ar: "رؤية الهلال" },
      comprehensive: { nl: "Uitgebreide smeekbeden", en: "Comprehensive Du'aas", ar: "أدعية جامعة" },
      daily_rules: { nl: "Dagelijkse regels", en: "Daily Rules", ar: "آداب يومية" },
      etiquette: { nl: "Etiquette", en: "Etiquette", ar: "آداب" },
      general_dhikr: { nl: "Algemene dhikr", en: "General Dhikr", ar: "أذكار عامة" },
      sahabah_duas: { nl: "Smeekbeden van Sahaabah", en: "Sahaabah Du'aas", ar: "أدعية الصحابة" },
    };

    return (
      <ScrollView contentContainerStyle={styles.sectionsContainer} showsVerticalScrollIndicator={false}>
        <Pressable onPress={() => setTabMode("adhkar")} style={({ pressed }) => [styles.backBtn, { flexDirection: isRTL ? "row-reverse" : "row" }, pressed && { opacity: 0.7 }]}>
          <MaterialIcons name={isRTL ? "chevron-right" : "chevron-left"} size={24} color="#1B4332" />
          <Text style={styles.backBtnText}>{tx(lang, "Terug", "Back", "رجوع")}</Text>
        </Pressable>

        {Object.entries(ALL_CONTEXTS).map(([catKey, contexts]) => (
          <View key={catKey} style={styles.categoryGroup}>
            <Text style={styles.categoryGroupTitle}>
              {categoryNames[catKey]?.[lang] || catKey}
            </Text>
            <View style={[styles.contextGrid, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
              {contexts.map((ctx) => (
                <Pressable
                  key={ctx}
                  onPress={() => { setSelectedContext(ctx); setTabMode("adhkar"); }}
                  style={({ pressed }) => [styles.contextChip, pressed && { opacity: 0.7 }]}
                >
                  <Text style={styles.contextChipText}>
                    {contextNames[ctx]?.[lang] || ctx}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        ))}
      </ScrollView>
    );
  };

  // Adhkar list view
  const renderAdhkarList = () => (
    <View style={{ flex: 1 }}>
      <Pressable onPress={() => { setSelectedContext(null); setAdhkarList([]); }} style={({ pressed }) => [styles.backBtn, { flexDirection: isRTL ? "row-reverse" : "row" }, pressed && { opacity: 0.7 }]}>
        <MaterialIcons name={isRTL ? "chevron-right" : "chevron-left"} size={24} color="#1B4332" />
        <Text style={styles.backBtnText}>{tx(lang, "Terug", "Back", "رجوع")}</Text>
      </Pressable>
      <Text style={styles.listTitle}>
        {getSectionTitle(selectedContext || "", lang)}
      </Text>
      {loading ? (
        <ActivityIndicator size="large" color="#1B4332" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={adhkarList}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderAdhkarItem}
          contentContainerStyle={{ paddingBottom: 100, paddingHorizontal: 16 }}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );

  return (
    <ScreenContainer>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t("tab.dhikri")}</Text>
        <Text style={styles.headerSubtitle}>
          {tx(lang, "Qur'aan & Adhkaar van dag en nacht", "Qur'aan & Adhkaar of day and night", "القرآن وأذكار اليوم والليلة")}
        </Text>
      </View>

      {/* Content */}
      {selectedContext ? renderAdhkarList() : tabMode === "all_categories" ? renderAllCategories() : renderSectionsGrid()}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8E5",
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: "#1B4332",
  },
  headerSubtitle: {
    fontSize: 13,
    color: "#6B7280",
    marginTop: 2,
  },
  sectionsContainer: {
    padding: 16,
    paddingBottom: 100,
  },
  sectionGroupTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1B4332",
    marginTop: 16,
    marginBottom: 10,
  },
  quickAccessRow: {
    flexWrap: "wrap",
    gap: 10,
  },
  sectionCard: {
    width: "47%",
    borderRadius: 14,
    padding: 16,
    alignItems: "center",
    gap: 8,
    minHeight: 90,
    justifyContent: "center",
  },
  sectionCardText: {
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center",
  },
  allCategoriesBtn: {
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 20,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#1B4332",
    backgroundColor: "#F0FDF4",
  },
  allCategoriesBtnText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1B4332",
  },
  quranCard: {
    alignItems: "center",
    gap: 14,
    marginTop: 20,
    padding: 18,
    borderRadius: 16,
    backgroundColor: "#F0FDF4",
    borderWidth: 1,
    borderColor: "#D1FAE5",
  },
  quranCardTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1B4332",
  },
  quranCardSubtitle: {
    fontSize: 12,
    color: "#6B7280",
  },
  // Adhkar list styles
  backBtn: {
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 4,
  },
  backBtnText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#1B4332",
  },
  listTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1B4332",
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  adhkarCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  adhkarArabic: {
    fontSize: 18,
    lineHeight: 30,
    color: "#1B4332",
    textAlign: "right",
    fontFamily: "System",
  },
  translitText: {
    fontSize: 13,
    color: "#4B5563",
    lineHeight: 22,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
    textAlign: "left",
    writingDirection: "ltr",
    fontStyle: "italic",
  },
  adhkarTranslation: {
    fontSize: 13,
    lineHeight: 20,
    color: "#6B7280",
    marginTop: 8,
  },
  repBadge: {
    position: "absolute",
    top: 8,
    backgroundColor: "#DBEAFE",
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  repText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#1D4ED8",
  },
  expandedSection: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
  },
  detailBlock: {
    marginBottom: 10,
  },
  detailLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#C4A35A",
    textTransform: "uppercase",
    marginBottom: 4,
  },
  detailTextAr: {
    fontSize: 14,
    lineHeight: 22,
    color: "#374151",
    textAlign: "right",
  },
  detailTextTr: {
    fontSize: 12,
    lineHeight: 18,
    color: "#6B7280",
    marginTop: 4,
  },
  // All categories
  categoryGroup: {
    marginBottom: 20,
  },
  categoryGroupTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1B4332",
    marginBottom: 10,
  },
  contextGrid: {
    flexWrap: "wrap",
    gap: 8,
  },
  contextChip: {
    backgroundColor: "#F0FDF4",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "#D1FAE5",
  },
  contextChipText: {
    fontSize: 13,
    fontWeight: "500",
    color: "#1B4332",
  },
});
