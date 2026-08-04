import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/use-colors";
import { useI18n } from "@/lib/i18n";
import { useAppState } from "@/lib/app-context";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useState, useEffect, useMemo, useCallback } from "react";
import Constants from "expo-constants";
import { getApiBaseUrl as getSharedApiBaseUrl } from "@/constants/oauth";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from "react-native-reanimated";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  loadAnimationEnabled,
  loadFavorites,
  addFavorite,
  removeFavorite,
  saveLastAdviceTitle,
  type FavoriteAdvice,
} from "@/lib/advice-prefs";
import {
  scheduleDailyAdviceNotification,
  showAdviceWidget,
} from "@/lib/daily-advice-notification";
import { ReportAiContent } from "@/components/report-ai-content";

type Lang = "nl" | "en" | "ar";

function tx(lang: Lang, nl: string, en: string, ar: string): string {
  if (lang === "en") return en;
  if (lang === "ar") return ar;
  return nl;
}

function getApiBaseUrl(): string {
  return getSharedApiBaseUrl();
}

function gregorianToHijri(gDate: Date): {
  year: number;
  month: number;
  day: number;
} {
  const d = gDate.getDate();
  const m = gDate.getMonth() + 1;
  const y = gDate.getFullYear();
  const jd =
    Math.floor((1461 * (y + 4800 + Math.floor((m - 14) / 12))) / 4) +
    Math.floor((367 * (m - 2 - 12 * Math.floor((m - 14) / 12))) / 12) -
    Math.floor(
      (3 * Math.floor((y + 4900 + Math.floor((m - 14) / 12)) / 100)) / 4,
    ) +
    d -
    32075;
  const l = jd - 2 - 1948440 + 10632;
  const n = Math.floor((l - 1) / 10631);
  const lRem = l - 10631 * n + 354;
  const j =
    Math.floor((10985 - lRem) / 5316) * Math.floor((50 * lRem) / 17719) +
    Math.floor(lRem / 5670) * Math.floor((43 * lRem) / 15238);
  const lFinal =
    lRem -
    Math.floor((30 - j) / 15) * Math.floor((17719 * j) / 50) -
    Math.floor(j / 16) * Math.floor((15238 * j) / 43) +
    29;
  const hMonth = Math.floor((24 * lFinal) / 709);
  const hDay = lFinal - Math.floor((709 * hMonth) / 24);
  const hYear = 30 * n + j - 30;
  return { year: hYear, month: hMonth, day: hDay };
}

function calculateExactAge(birthDate: string, lang: Lang): string {
  const birth = new Date(birthDate);
  const now = new Date();
  let years = now.getFullYear() - birth.getFullYear();
  let months = now.getMonth() - birth.getMonth();
  if (months < 0 || (months === 0 && now.getDate() < birth.getDate())) {
    years--;
    months += 12;
  }
  if (now.getDate() < birth.getDate()) {
    months--;
  }
  if (years === 0) {
    return `${months} ${tx(lang, "maanden", "months", "شهر")}`;
  }
  if (months === 0) {
    return `${years} ${tx(lang, "jaar", "years", "سنة")}`;
  }
  return `${years} ${tx(lang, "jaar", "years", "سنة")} ${tx(lang, "en", "and", "و")} ${months} ${tx(lang, "maanden", "months", "شهر")}`;
}

function cleanAIText(text: string): string {
  return text
    .replace(/\*\*/g, "")
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

function renderFormattedText(text: string, colors: any, isRTL: boolean) {
  const lines = text.split("\n");
  const elements: any[] = [];
  let key = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      elements.push(<View key={key++} style={{ height: 8 }} />);
      continue;
    }
    if (trimmed.startsWith("##") || trimmed.startsWith("**")) {
      const headerText = trimmed
        .replace(/^##\s*/, "")
        .replace(/^\*\*/, "")
        .replace(/\*\*$/, "");
      elements.push(
        <Text
          key={key++}
          style={{
            fontSize: 15,
            fontWeight: "700",
            color: colors.foreground,
            marginTop: 12,
            marginBottom: 4,
            textAlign: isRTL ? "right" : "left",
          }}
        >
          {headerText}
        </Text>,
      );
    } else if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      const bulletText = trimmed.replace(/^[-*]\s*/, "").replace(/\*\*/g, "");
      elements.push(
        <View
          key={key++}
          style={{
            flexDirection: isRTL ? "row-reverse" : "row",
            alignItems: "flex-start",
            gap: 8,
            marginBottom: 4,
            paddingHorizontal: 4,
          }}
        >
          <View
            style={{
              width: 5,
              height: 5,
              borderRadius: 3,
              backgroundColor: colors.primary,
              marginTop: 7,
            }}
          />
          <Text
            style={{
              flex: 1,
              fontSize: 13,
              color: colors.foreground,
              lineHeight: 21,
              textAlign: isRTL ? "right" : "left",
            }}
          >
            {bulletText}
          </Text>
        </View>,
      );
    } else if (/^\d+[.)]\s/.test(trimmed)) {
      const numText = trimmed.replace(/^\d+[.)]\s*/, "").replace(/\*\*/g, "");
      const num = trimmed.match(/^(\d+)/)?.[1] || "";
      elements.push(
        <View
          key={key++}
          style={{
            flexDirection: isRTL ? "row-reverse" : "row",
            alignItems: "flex-start",
            gap: 8,
            marginBottom: 4,
            paddingHorizontal: 4,
          }}
        >
          <Text
            style={{
              fontSize: 13,
              fontWeight: "600",
              color: colors.primary,
              minWidth: 18,
            }}
          >
            {num}.
          </Text>
          <Text
            style={{
              flex: 1,
              fontSize: 13,
              color: colors.foreground,
              lineHeight: 21,
              textAlign: isRTL ? "right" : "left",
            }}
          >
            {numText}
          </Text>
        </View>,
      );
    } else {
      const cleanText = trimmed.replace(/\*\*/g, "");
      elements.push(
        <Text
          key={key++}
          style={{
            fontSize: 13,
            color: colors.foreground,
            lineHeight: 21,
            textAlign: isRTL ? "right" : "left",
            marginBottom: 4,
          }}
        >
          {cleanText}
        </Text>,
      );
    }
  }
  return elements;
}

function getTimeAwarePrefix(lang: Lang): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return tx(lang, "vandaag", "today", "اليوم");
  if (hour >= 12 && hour < 17)
    return tx(lang, "vanmiddag", "this afternoon", "هذا المساء");
  if (hour >= 17)
    return tx(
      lang,
      "morgen in shaa Allaah",
      "tomorrow in shaa Allaah",
      "غداً إن شاء الله",
    );
  return tx(
    lang,
    "morgen in shaa Allaah",
    "tomorrow in shaa Allaah",
    "غداً إن شاء الله",
  );
}

// Collapsible section with basic open/close (no animation)
function CollapsibleSection({
  title,
  icon,
  iconColor,
  children,
  defaultOpen = false,
}: {
  title: string;
  icon: string;
  iconColor: string;
  children: any;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const colors = useColors();

  return (
    <View
      style={{
        marginBottom: 12,
        backgroundColor: colors.surface,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: colors.border,
        overflow: "hidden",
      }}
    >
      <Pressable
        onPress={() => setOpen(!open)}
        style={({ pressed }) => [
          {
            flexDirection: "row",
            alignItems: "center",
            padding: 14,
            gap: 10,
            opacity: pressed ? 0.7 : 1,
          },
        ]}
      >
        <MaterialIcons name={icon as any} size={20} color={iconColor} />
        <Text
          style={{
            flex: 1,
            fontSize: 14,
            fontWeight: "600",
            color: colors.foreground,
          }}
        >
          {title}
        </Text>
        <MaterialIcons
          name={open ? "expand-less" : "expand-more"}
          size={22}
          color={colors.muted}
        />
      </Pressable>
      {open && (
        <View
          style={{
            paddingHorizontal: 14,
            paddingBottom: 14,
            borderTopWidth: 1,
            borderTopColor: colors.border,
          }}
        >
          {children}
        </View>
      )}
    </View>
  );
}

// Animated collapsible advice section card with favorite button
function AdviceSection({
  title,
  icon,
  iconColor,
  content,
  isRTL,
  colors,
  defaultOpen = false,
  animationEnabled,
  sectionId,
  isFav,
  onToggleFavorite,
}: {
  title: string;
  icon: string;
  iconColor: string;
  content: string;
  isRTL: boolean;
  colors: any;
  defaultOpen?: boolean;
  animationEnabled: boolean;
  sectionId: string;
  isFav: boolean;
  onToggleFavorite: (
    id: string,
    title: string,
    content: string,
    icon: string,
  ) => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const animHeight = useSharedValue(defaultOpen ? 1 : 0);
  const animOpacity = useSharedValue(defaultOpen ? 1 : 0);

  const toggleOpen = useCallback(() => {
    const newOpen = !open;
    setOpen(newOpen);
    if (animationEnabled) {
      animHeight.value = withTiming(newOpen ? 1 : 0, {
        duration: 250,
        easing: Easing.bezier(0.4, 0, 0.2, 1),
      });
      animOpacity.value = withTiming(newOpen ? 1 : 0, { duration: 200 });
    } else {
      animHeight.value = newOpen ? 1 : 0;
      animOpacity.value = newOpen ? 1 : 0;
    }
  }, [open, animationEnabled]);

  const contentAnimStyle = useAnimatedStyle(() => ({
    opacity: animOpacity.value,
    maxHeight: animHeight.value === 0 ? 0 : 2000,
    overflow: "hidden" as const,
  }));

  const bgColor = `${iconColor}08`;
  const borderColor = `${iconColor}25`;

  return (
    <View
      style={[
        styles.sectionCard,
        {
          borderColor: open ? borderColor : colors.border,
          backgroundColor: open ? bgColor : colors.surface,
        },
      ]}
    >
      <View
        style={{
          flexDirection: isRTL ? "row-reverse" : "row",
          alignItems: "center",
        }}
      >
        <Pressable
          onPress={toggleOpen}
          style={({ pressed }) => [
            {
              flex: 1,
              flexDirection: isRTL ? "row-reverse" : "row",
              alignItems: "center",
              padding: 16,
              gap: 12,
              opacity: pressed ? 0.7 : 1,
            },
          ]}
        >
          <View
            style={[styles.iconCircle, { backgroundColor: `${iconColor}15` }]}
          >
            <MaterialIcons name={icon as any} size={22} color={iconColor} />
          </View>
          <Text
            style={{
              flex: 1,
              fontSize: 15,
              fontWeight: "700",
              color: colors.foreground,
              textAlign: isRTL ? "right" : "left",
              lineHeight: 22,
            }}
          >
            {title}
          </Text>
          <MaterialIcons
            name={open ? "keyboard-arrow-up" : "keyboard-arrow-down"}
            size={24}
            color={colors.muted}
          />
        </Pressable>
        {/* Favorite button */}
        <Pressable
          onPress={() => onToggleFavorite(sectionId, title, content, icon)}
          style={({ pressed }) => [
            {
              paddingRight: 14,
              paddingVertical: 16,
              opacity: pressed ? 0.5 : 1,
            },
          ]}
        >
          <MaterialIcons
            name={isFav ? "favorite" : "favorite-border"}
            size={20}
            color={isFav ? "#E53935" : colors.muted}
          />
        </Pressable>
      </View>
      {open && (
        <Animated.View
          style={[
            {
              paddingHorizontal: 16,
              paddingBottom: 16,
              borderTopWidth: 1,
              borderTopColor: borderColor,
            },
            animationEnabled ? contentAnimStyle : undefined,
          ]}
        >
          <View style={{ marginTop: 12 }}>
            {renderFormattedText(cleanAIText(content), colors, isRTL)}
          </View>
        </Animated.View>
      )}
    </View>
  );
}

export default function PersonalAdviceScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const { language, isRTL } = useI18n();
  const lang = language as Lang;
  const { state } = useAppState();

  const [llmAdvice, setLlmAdvice] = useState<string | null>(null);
  const [llmSections, setLlmSections] = useState<Array<{
    title: string;
    icon: string;
    content: string;
  }> | null>(null);
  const [llmLoading, setLlmLoading] = useState(false);
  const [animationEnabled, setAnimationEnabled] = useState(true);
  const [favorites, setFavorites] = useState<FavoriteAdvice[]>([]);
  const [showFavorites, setShowFavorites] = useState(false);

  // Load preferences on mount
  useEffect(() => {
    loadAnimationEnabled().then(setAnimationEnabled);
    loadFavorites().then(setFavorites);
  }, []);

  // Save last advice title for notification when sections load
  useEffect(() => {
    if (llmSections && llmSections.length > 0) {
      saveLastAdviceTitle(llmSections[0].title);
      // Reschedule daily notification with new title
      scheduleDailyAdviceNotification(language as "nl" | "en" | "ar");
      // Update widget if enabled
      showAdviceWidget(language as "nl" | "en" | "ar");
    }
  }, [llmSections, language]);

  const handleToggleFavorite = useCallback(
    async (id: string, title: string, content: string, icon: string) => {
      const isFav = favorites.some((f) => f.id === id);
      if (isFav) {
        const updated = await removeFavorite(id);
        setFavorites(updated);
      } else {
        const fav: FavoriteAdvice = {
          id,
          title,
          content,
          icon,
          date: new Date().toISOString().slice(0, 10),
        };
        const updated = await addFavorite(fav);
        setFavorites(updated);
      }
    },
    [favorites],
  );

  // Generate local advice with child names and time-awareness
  const localAdvice = useMemo(() => {
    const advice: string[] = [];
    const pp = state.parentProfile;
    if (!pp) return advice;

    const timePrefix = getTimeAwarePrefix(lang);

    if (pp.prayer === "altijd_5") {
      advice.push(
        tx(
          lang,
          "Mashaa'Allaah! Werk nu aan khushoo' in uw gebed",
          "Mashaa'Allaah! Now work on khushoo' in your prayer",
          "ما شاء الله! اعمل الآن على الخشوع في صلاتك",
        ),
      );
    } else if (pp.prayer === "meestal_4" || pp.prayer === "soms_3") {
      advice.push(
        tx(
          lang,
          `Probeer ${timePrefix} alle 5 gebeden op tijd te verrichten`,
          `Try to pray all 5 prayers on time ${timePrefix}`,
          `حاول ${timePrefix} أن تصلي الخمس في وقتها`,
        ),
      );
    } else if (pp.prayer) {
      advice.push(
        tx(
          lang,
          "Begin met het vestigen van de 5 dagelijkse gebeden",
          "Start by establishing the 5 daily prayers",
          "ابدأ بتثبيت الصلوات الخمس",
        ),
      );
    }

    if (pp.fajr === "zelden_op_tijd" || pp.fajr === "nooit") {
      advice.push(
        tx(
          lang,
          "Slaap vroeg vanavond om Fajr te halen",
          "Sleep early tonight to catch Fajr",
          "نم مبكرًا الليلة لتدرك الفجر",
        ),
      );
    }

    if (state.children && state.children.length > 0) {
      const now = new Date();
      const youngChildren = state.children.filter((c: any) => {
        if (!c.birthDate) return false;
        const age =
          (now.getTime() - new Date(c.birthDate).getTime()) /
          (365.25 * 24 * 60 * 60 * 1000);
        return age < 7;
      });
      const olderChildren = state.children.filter((c: any) => {
        if (!c.birthDate) return false;
        const age =
          (now.getTime() - new Date(c.birthDate).getTime()) /
          (365.25 * 24 * 60 * 60 * 1000);
        return age >= 7;
      });
      if (youngChildren.length > 0) {
        const names = youngChildren
          .map((c: any) => c.name)
          .filter(Boolean)
          .join(", ");
        if (names) {
          advice.push(
            tx(
              lang,
              `Speel ${timePrefix} bewust 15 min met ${names}`,
              `Play intentionally 15 min with ${names} ${timePrefix}`,
              `العب ${timePrefix} ١٥ دقيقة بوعي مع ${names}`,
            ),
          );
        } else {
          advice.push(
            tx(
              lang,
              `Speel ${timePrefix} bewust 15 min met uw kleintjes`,
              `Play intentionally 15 min with your little ones ${timePrefix}`,
              `العب ${timePrefix} ١٥ دقيقة بوعي مع صغارك`,
            ),
          );
        }
      }
      if (olderChildren.length > 0) {
        const names = olderChildren
          .map((c: any) => c.name)
          .filter(Boolean)
          .join(", ");
        if (names) {
          advice.push(
            tx(
              lang,
              `Vraag ${names} over hun dag — luister actief`,
              `Ask ${names} about their day — listen actively`,
              `اسأل ${names} عن يومهم — استمع بانتباه`,
            ),
          );
        } else {
          advice.push(
            tx(
              lang,
              "Vraag uw oudere kinderen over hun dag — luister actief",
              "Ask your older children about their day — listen actively",
              "اسأل أبناءك الكبار عن يومهم — استمع بانتباه",
            ),
          );
        }
      }
    }

    if (state.environments && state.environments.length > 0) {
      const hasScreenIssue = state.environments.some(
        (e: any) =>
          e.mediaUse === "te_veel" || e.mediaUse === "ongecontroleerd",
      );
      if (hasScreenIssue) {
        advice.push(
          tx(
            lang,
            `Beperk schermtijd ${timePrefix} — doe iets samen buiten`,
            `Limit screen time ${timePrefix} — do something together outside`,
            `قلّل وقت الشاشة ${timePrefix} — افعلوا شيئاً معاً في الخارج`,
          ),
        );
      }
      const hasSleepIssue = state.environments.some(
        (e: any) =>
          e.sleepQuality === "slecht" || e.sleepQuality === "onregelmatig",
      );
      if (hasSleepIssue) {
        advice.push(
          tx(
            lang,
            "Werk aan een vast slaapritme voor uw kinderen",
            "Work on a consistent sleep schedule for your children",
            "اعمل على نظام نوم ثابت لأطفالك",
          ),
        );
      }
    }

    if (pp.maritalStatus === "getrouwd") {
      advice.push(
        tx(
          lang,
          `Zeg ${timePrefix} iets liefs tegen uw partner`,
          `Say something kind to your partner ${timePrefix}`,
          `قل كلمة طيبة لشريكك ${timePrefix}`,
        ),
      );
    }

    // Daily check-in based advice
    const todayDate = new Date().toISOString().slice(0, 10);
    const todayCheckin = state.dailyCheckins?.find(
      (c: any) => c.date === todayDate,
    );
    if (todayCheckin) {
      if (todayCheckin.prayer === "fajr_gemist") {
        advice.push(
          tx(
            lang,
            `Slaap vanavond vroeger — stel een alarm in voor Fajr`,
            `Sleep earlier tonight — set an alarm for Fajr`,
            `نم مبكرًا الليلة — اضبط منبهًا للفجر`,
          ),
        );
      } else if (todayCheckin.prayer === "sommige_gemist") {
        advice.push(
          tx(
            lang,
            `Stel herinneringen in voor de gebeden die u mist`,
            `Set reminders for the prayers you miss`,
            `اضبط تذكيرات للصلوات التي تفوتك`,
          ),
        );
      } else if (todayCheckin.prayer === "werk_eraan") {
        advice.push(
          tx(
            lang,
            `Begin met de gebeden die u al doet en voeg er één toe`,
            `Start with the prayers you already do and add one more`,
            `ابدأ بالصلوات التي تؤديها وأضف واحدة`,
          ),
        );
      } else if (todayCheckin.prayer === "alle_5_op_tijd") {
        advice.push(
          tx(
            lang,
            `Mashaa'Allaah! Werk nu aan extra nawaafil`,
            `Mashaa'Allaah! Now work on extra nawaafil`,
            `ما شاء الله! اعمل الآن على النوافل`,
          ),
        );
      }
      if (todayCheckin.mood === "moe") {
        advice.push(
          tx(
            lang,
            `U bent moe — neem een korte pauze en maak adhkaar`,
            `You're tired — take a short break and make adhkaar`,
            `أنت متعب — خذ استراحة قصيرة واذكر الله`,
          ),
        );
      } else if (todayCheckin.mood === "gestrest") {
        advice.push(
          tx(
            lang,
            `Bij stress: "Laa hawla wa laa quwwata illaa billaah"`,
            `When stressed: "Laa hawla wa laa quwwata illaa billaah"`,
            `عند التوتر: "لا حول ولا قوة إلا بالله"`,
          ),
        );
      } else if (todayCheckin.mood === "energiek") {
        advice.push(
          tx(
            lang,
            `Gebruik uw energie voor extra 'ibaadah en tijd met kinderen`,
            `Use your energy for extra 'ibaadah and time with children`,
            `استغل نشاطك في عبادة إضافية ووقت مع الأطفال`,
          ),
        );
      }
    }

    if (advice.length === 0) {
      advice.push(
        tx(
          lang,
          `Maak ${timePrefix} du'aa voor uw gezin`,
          `Make du'aa for your family ${timePrefix}`,
          `ادعُ لعائلتك ${timePrefix}`,
        ),
      );
      advice.push(
        tx(
          lang,
          "Lees minstens 1 pagina Qur'aan",
          "Read at least 1 page of Qur'aan",
          "اقرأ صفحة واحدة على الأقل من القرآن",
        ),
      );
    }

    return advice;
  }, [
    state.parentProfile,
    state.children,
    state.environments,
    state.dailyCheckins,
    lang,
  ]);

  // Children summary with exact ages
  const childrenSummary = useMemo(() => {
    if (!state.children || state.children.length === 0) return null;
    return state.children.map((c: any) => ({
      name: c.name || tx(lang, "Kind", "Child", "طفل"),
      age: c.birthDate
        ? calculateExactAge(c.birthDate, lang)
        : tx(lang, "leeftijd onbekend", "age unknown", "العمر غير معروف"),
      gender: c.gender,
    }));
  }, [state.children, lang]);

  // Fetch LLM-based advice
  useEffect(() => {
    if (state.parentProfileCompleted) loadCachedOrFetch();
  }, [language]);

  async function loadCachedOrFetch() {
    const cacheKey = `personal_advice_cache_${language}`;
    try {
      const cached = await AsyncStorage.getItem(cacheKey);
      if (cached) {
        const { advice, sections, date } = JSON.parse(cached);
        // Use cache if from today
        const today = new Date().toISOString().slice(0, 10);
        if (date === today) {
          if (sections) setLlmSections(sections);
          else setLlmAdvice(advice);
          setLlmLoading(false);
          return;
        }
      }
    } catch (e) {
      /* ignore cache errors */
    }
    fetchAdvice();
  }

  async function fetchAdvice() {
    setLlmLoading(true);
    try {
      const baseUrl = getApiBaseUrl();
      const now = new Date();
      const hijri = gregorianToHijri(now);
      const month = now.getMonth();
      const hour = now.getHours();
      const season =
        lang === "ar"
          ? month >= 2 && month <= 4
            ? "ربيع"
            : month >= 5 && month <= 7
              ? "صيف"
              : month >= 8 && month <= 10
                ? "خريف"
                : "شتاء"
          : lang === "en"
            ? month >= 2 && month <= 4
              ? "Spring"
              : month >= 5 && month <= 7
                ? "Summer"
                : month >= 8 && month <= 10
                  ? "Autumn"
                  : "Winter"
            : month >= 2 && month <= 4
              ? "Lente"
              : month >= 5 && month <= 7
                ? "Zomer"
                : month >= 8 && month <= 10
                  ? "Herfst"
                  : "Winter";
      const response = await fetch(`${baseUrl}/api/advice/general`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parentProfile: state.parentProfile,
          childrenCount: state.children.length,
          childrenAges: state.children.map((c) => {
            if (!c.birthDate)
              return tx(lang, "onbekend", "unknown", "غير معروف");
            return `${c.name}: ${calculateExactAge(c.birthDate, lang)}`;
          }),
          season,
          timeOfDay:
            hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening",
          location:
            state.locationSettings?.city ||
            (state.parentProfile as any)?.city ||
            "Nederland",
          language,
          hijriMonth: hijri.month,
          hijriDay: hijri.day,
          dayOfWeek: now.getDay(),
          dailyCheckin:
            state.dailyCheckins?.find(
              (c) => c.date === now.toISOString().slice(0, 10),
            ) || null,
          recentCheckins: (state.dailyCheckins || []).slice(-7),
          childrenEnvironments: state.children.map((c) => ({
            childName: c.name,
            education: (c as any).education || "",
            friends: (c as any).friends || "",
            media: (c as any).media || "",
            goodQualities: (c as any).goodQualities || "",
            badQualities: (c as any).badQualities || "",
            hobbies: (c as any).hobbies || "",
            habits: (c as any).habits || "",
            healthNotes: (c as any).healthNotes || "",
            spiritualLevel: (c as any).spiritualLevel || "",
            behaviorNotes: (c as any).behaviorNotes || "",
            socialSkills: (c as any).socialSkills || "",
          })),
        }),
      });
      const data = await response.json();
      setLlmAdvice(data.advice || null);
      const cacheKey = `personal_advice_cache_${language}`;
      const today = new Date().toISOString().slice(0, 10);
      if (data.sections && Array.isArray(data.sections)) {
        setLlmSections(data.sections);
        await AsyncStorage.setItem(
          cacheKey,
          JSON.stringify({
            sections: data.sections,
            advice: null,
            date: today,
          }),
        );
      } else {
        setLlmSections(null);
        if (data.advice) {
          await AsyncStorage.setItem(
            cacheKey,
            JSON.stringify({
              sections: null,
              advice: data.advice,
              date: today,
            }),
          );
          const title = data.advice
            .split("\n")[0]
            .replace(/^[#*\-\s]+/, "")
            .slice(0, 80);
          saveLastAdviceTitle(title);
          scheduleDailyAdviceNotification(language as "nl" | "en" | "ar");
          showAdviceWidget(language as "nl" | "en" | "ar");
        }
      }
    } catch (e) {
      console.error("[PersonalAdvice] fetchAdvice error:", e);
      setLlmAdvice(
        tx(
          lang,
          "Er is een fout opgetreden. Controleer uw internetverbinding en probeer het opnieuw.",
          "An error occurred. Check your internet connection and try again.",
          "حدث خطأ في الاتصال. تحقق من اتصالك بالإنترنت وأعد المحاولة.",
        ),
      );
    } finally {
      setLlmLoading(false);
    }
  }

  // Favorites view
  if (showFavorites) {
    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.background }}
        contentContainerStyle={{
          paddingTop: insets.top + 16,
          paddingBottom: insets.bottom + 40,
          paddingHorizontal: 20,
        }}
      >
        <Pressable
          onPress={() => setShowFavorites(false)}
          style={{ marginBottom: 16 }}
        >
          <Text style={{ color: colors.primary, fontSize: 14 }}>
            {tx(lang, "\u2190 Terug", "\u2190 Back", "\u2190 رجوع")}
          </Text>
        </Pressable>

        <View
          style={{
            flexDirection: isRTL ? "row-reverse" : "row",
            alignItems: "center",
            gap: 10,
            marginBottom: 16,
          }}
        >
          <MaterialIcons name="favorite" size={26} color="#E53935" />
          <Text
            style={{
              fontSize: 20,
              fontWeight: "700",
              color: colors.foreground,
            }}
          >
            {tx(
              lang,
              "Opgeslagen adviezen",
              "Saved Advice",
              "النصائح المحفوظة",
            )}
          </Text>
          <View style={[styles.badge, { backgroundColor: "#E53935" }]}>
            <Text style={{ color: "#fff", fontSize: 11, fontWeight: "700" }}>
              {favorites.length}
            </Text>
          </View>
        </View>

        {favorites.length === 0 ? (
          <View style={{ paddingVertical: 40, alignItems: "center", gap: 12 }}>
            <MaterialIcons
              name="favorite-border"
              size={40}
              color={colors.muted}
            />
            <Text
              style={{ fontSize: 14, color: colors.muted, textAlign: "center" }}
            >
              {tx(
                lang,
                "Nog geen favorieten opgeslagen.\nTik op het hartje bij een advies-sectie.",
                "No favorites saved yet.\nTap the heart icon on an advice section.",
                "لا توجد مفضلات محفوظة بعد.\nاضغط على أيقونة القلب عند قسم النصيحة.",
              )}
            </Text>
          </View>
        ) : (
          <View style={{ gap: 10 }}>
            {favorites.map((fav) => {
              const iconMap: Record<string, string> = {
                mosque: "mosque",
                star: "star",
                shield: "shield",
                family: "family-restroom",
                book: "menu-book",
                heart: "favorite",
              };
              const colorMap: Record<string, string> = {
                mosque: "#1B5E20",
                star: "#F57F17",
                shield: "#B71C1C",
                family: "#1565C0",
                book: "#4A148C",
                heart: "#C62828",
              };
              const iconName = iconMap[fav.icon] || "auto-awesome";
              const iconColor = colorMap[fav.icon] || "#7B1FA2";
              return (
                <View
                  key={fav.id}
                  style={[
                    styles.sectionCard,
                    {
                      borderColor: colors.border,
                      backgroundColor: colors.surface,
                    },
                  ]}
                >
                  <View
                    style={{
                      flexDirection: isRTL ? "row-reverse" : "row",
                      alignItems: "center",
                      padding: 14,
                      gap: 10,
                    }}
                  >
                    <View
                      style={[
                        styles.iconCircle,
                        { backgroundColor: `${iconColor}15` },
                      ]}
                    >
                      <MaterialIcons
                        name={iconName as any}
                        size={20}
                        color={iconColor}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{
                          fontSize: 14,
                          fontWeight: "700",
                          color: colors.foreground,
                          textAlign: isRTL ? "right" : "left",
                        }}
                      >
                        {fav.title}
                      </Text>
                      <Text
                        style={{
                          fontSize: 11,
                          color: colors.muted,
                          marginTop: 2,
                          textAlign: isRTL ? "right" : "left",
                        }}
                      >
                        {fav.date}
                      </Text>
                    </View>
                    <Pressable
                      onPress={async () => {
                        const updated = await removeFavorite(fav.id);
                        setFavorites(updated);
                      }}
                      style={({ pressed }) => [
                        { opacity: pressed ? 0.5 : 1, padding: 6 },
                      ]}
                    >
                      <MaterialIcons
                        name="delete-outline"
                        size={20}
                        color={colors.error}
                      />
                    </Pressable>
                  </View>
                  <View
                    style={{
                      paddingHorizontal: 14,
                      paddingBottom: 14,
                      borderTopWidth: 1,
                      borderTopColor: colors.border,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 13,
                        color: colors.foreground,
                        lineHeight: 22,
                        textAlign: isRTL ? "right" : "left",
                        marginTop: 8,
                      }}
                    >
                      {fav.content.length > 200
                        ? fav.content.slice(0, 200) + "..."
                        : fav.content}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{
        paddingTop: insets.top + 16,
        paddingBottom: insets.bottom + 40,
        paddingHorizontal: 20,
      }}
    >
      <Pressable onPress={() => router.back()} style={{ marginBottom: 16 }}>
        <Text style={{ color: colors.primary, fontSize: 14 }}>
          {tx(lang, "\u2190 Terug", "\u2190 Back", "\u2190 رجوع")}
        </Text>
      </Pressable>

      <View
        style={{
          flexDirection: isRTL ? "row-reverse" : "row",
          alignItems: "center",
          gap: 10,
          marginBottom: 12,
        }}
      >
        <MaterialIcons name="auto-awesome" size={28} color="#7B1FA2" />
        <Text
          style={{
            fontSize: 22,
            fontWeight: "700",
            color: colors.foreground,
            flex: 1,
          }}
        >
          {tx(lang, "Persoonlijk advies", "Personal Advice", "نصيحة شخصية")}
        </Text>
        {/* Favorites button */}
        <Pressable
          onPress={() => setShowFavorites(true)}
          style={({ pressed }) => [
            {
              opacity: pressed ? 0.6 : 1,
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
              backgroundColor: "#E5393520",
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: 16,
            },
          ]}
        >
          <MaterialIcons name="favorite" size={16} color="#E53935" />
          {favorites.length > 0 && (
            <Text style={{ fontSize: 12, fontWeight: "700", color: "#E53935" }}>
              {favorites.length}
            </Text>
          )}
        </Pressable>
      </View>

      <Text
        style={{
          fontSize: 13,
          color: colors.muted,
          lineHeight: 22,
          textAlign: isRTL ? "right" : "left",
          marginBottom: 8,
        }}
      >
        {tx(
          lang,
          "Op basis van uw profiel, omgeving en gezinssituatie:",
          "Based on your profile, environment and family situation:",
          "بناءً على ملفك الشخصي وبيئتك وأحوال عائلتك:",
        )}
      </Text>

      {/* Children summary with exact ages */}
      {childrenSummary && childrenSummary.length > 0 && (
        <View
          style={{
            backgroundColor: "#E3F2FD",
            borderRadius: 10,
            padding: 12,
            marginBottom: 16,
            borderWidth: 1,
            borderColor: "#90CAF920",
          }}
        >
          <Text
            style={{
              fontSize: 12,
              fontWeight: "600",
              color: "#1565C0",
              marginBottom: 6,
              textAlign: isRTL ? "right" : "left",
            }}
          >
            {tx(lang, "Uw kinderen", "Your children", "أطفالك")}
          </Text>
          {childrenSummary.map((child, i) => (
            <View
              key={i}
              style={{
                flexDirection: isRTL ? "row-reverse" : "row",
                alignItems: "center",
                gap: 6,
                marginBottom: 3,
              }}
            >
              <MaterialIcons
                name={child.gender === "meisje" ? "girl" : "boy"}
                size={16}
                color="#1565C0"
              />
              <Text style={{ fontSize: 12, color: "#1565C0" }}>
                {child.name} — {child.age}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* Quick tips - always visible */}
      <CollapsibleSection
        title={tx(lang, "Snelle tips", "Quick tips", "نصائح سريعة")}
        icon="lightbulb"
        iconColor="#F59E0B"
        defaultOpen={true}
      >
        {localAdvice.map((adv, i) => (
          <View
            key={i}
            style={{
              flexDirection: isRTL ? "row-reverse" : "row",
              alignItems: "flex-start",
              gap: 8,
              marginTop: 8,
            }}
          >
            <View
              style={{
                width: 6,
                height: 6,
                borderRadius: 3,
                backgroundColor: "#F59E0B",
                marginTop: 6,
              }}
            />
            <Text
              style={{
                flex: 1,
                fontSize: 13,
                color: colors.foreground,
                lineHeight: 20,
                textAlign: isRTL ? "right" : "left",
              }}
            >
              {cleanAIText(adv)}
            </Text>
          </View>
        ))}
      </CollapsibleSection>

      {/* Refresh button */}
      <View
        style={{
          flexDirection: "row",
          justifyContent: "flex-end",
          marginBottom: 12,
        }}
      >
        <Pressable
          onPress={fetchAdvice}
          style={({ pressed }) => [
            {
              opacity: pressed ? 0.6 : 1,
              padding: 8,
              flexDirection: isRTL ? "row-reverse" : "row",
              alignItems: "center",
              gap: 6,
              backgroundColor: colors.surface,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: colors.border,
            },
          ]}
        >
          <MaterialIcons name="refresh" size={16} color={colors.primary} />
          <Text
            style={{ fontSize: 12, color: colors.primary, fontWeight: "500" }}
          >
            {tx(lang, "Vernieuwen", "Refresh", "تحديث")}
          </Text>
        </Pressable>
      </View>

      {/* AI Advice - Structured Sections */}
      {llmLoading ? (
        <View style={{ paddingVertical: 40, alignItems: "center", gap: 12 }}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text
            style={{ fontSize: 13, color: colors.muted, textAlign: "center" }}
          >
            {tx(
              lang,
              "Uw persoonlijk advies wordt opgesteld...",
              "Preparing your personal advice...",
              "جارٍ إعداد نصيحتك الشخصية...",
            )}
          </Text>
        </View>
      ) : llmSections && llmSections.length > 0 ? (
        <View style={{ gap: 10 }}>
          {llmSections.map((section, idx) => {
            const iconMap: Record<string, string> = {
              mosque: "mosque",
              star: "star",
              shield: "shield",
              family: "family-restroom",
              book: "menu-book",
              heart: "favorite",
            };
            const colorMap: Record<string, string> = {
              mosque: "#1B5E20",
              star: "#F57F17",
              shield: "#B71C1C",
              family: "#1565C0",
              book: "#4A148C",
              heart: "#C62828",
            };
            const iconName = iconMap[section.icon] || "auto-awesome";
            const iconColor = colorMap[section.icon] || "#7B1FA2";
            const sectionId = `${new Date().toISOString().slice(0, 10)}_${idx}`;
            const isFav = favorites.some((f) => f.id === sectionId);
            return (
              <AdviceSection
                key={idx}
                title={cleanAIText(section.title)}
                icon={iconName}
                iconColor={iconColor}
                content={cleanAIText(section.content)}
                isRTL={isRTL}
                colors={colors}
                defaultOpen={idx === 0}
                animationEnabled={animationEnabled}
                sectionId={sectionId}
                isFav={isFav}
                onToggleFavorite={handleToggleFavorite}
              />
            );
          })}
          <ReportAiContent
            content={llmSections
              .map((section) => `${section.title}\n${section.content}`)
              .join("\n\n")}
            surface="personal-advice-details-sections"
          />
        </View>
      ) : llmAdvice ? (
        <CollapsibleSection
          title={tx(
            lang,
            "Uitgebreid advies",
            "Detailed advice",
            "نصيحة مفصّلة",
          )}
          icon="auto-awesome"
          iconColor="#7B1FA2"
          defaultOpen={true}
        >
          <View>{renderFormattedText(llmAdvice, colors, isRTL)}</View>
          <ReportAiContent
            content={llmAdvice}
            surface="personal-advice-details"
          />
        </CollapsibleSection>
      ) : (
        <View style={{ paddingVertical: 30, alignItems: "center", gap: 8 }}>
          <MaterialIcons name="auto-awesome" size={32} color={colors.muted} />
          <Text
            style={{ fontSize: 13, color: colors.muted, textAlign: "center" }}
          >
            {tx(
              lang,
              "Tik op vernieuwen voor persoonlijk advies op basis van uw profiel.",
              "Tap refresh for personal advice based on your profile.",
              "اضغط على التحديث للحصول على نصيحة شخصية بناءً على ملفك.",
            )}
          </Text>
        </View>
      )}

      {/* Follow-up buttons */}
      <View style={{ marginTop: 8, gap: 10 }}>
        <Pressable
          onPress={() => router.push("/ai-chat")}
          style={({ pressed }) => [
            {
              flexDirection: isRTL ? "row-reverse" : "row",
              alignItems: "center",
              gap: 10,
              backgroundColor: "#E8F5E9",
              borderRadius: 12,
              padding: 14,
              borderWidth: 1,
              borderColor: "#4CAF5030",
              opacity: pressed ? 0.7 : 1,
            },
          ]}
        >
          <MaterialIcons name="chat" size={22} color="#2E7D32" />
          <View style={{ flex: 1 }}>
            <Text
              style={{
                fontSize: 14,
                fontWeight: "600",
                color: "#2E7D32",
                textAlign: isRTL ? "right" : "left",
              }}
            >
              {tx(
                lang,
                "Stel een vervolgvraag",
                "Ask a follow-up question",
                "اطرح سؤالاً إضافياً",
              )}
            </Text>
            <Text
              style={{
                fontSize: 11,
                color: "#4CAF50",
                textAlign: isRTL ? "right" : "left",
              }}
            >
              {tx(
                lang,
                "Chat met de AI-adviseur over dit advies",
                "Chat with the AI advisor about this advice",
                "تحدث مع المستشار الذكي حول هذه النصيحة",
              )}
            </Text>
          </View>
          <MaterialIcons
            name={isRTL ? "chevron-left" : "chevron-right"}
            size={20}
            color="#2E7D32"
          />
        </Pressable>

        <Pressable
          onPress={() => {
            router.push("/find-specialist");
          }}
          style={({ pressed }) => [
            {
              flexDirection: isRTL ? "row-reverse" : "row",
              alignItems: "center",
              gap: 10,
              backgroundColor: "#FFF3E0",
              borderRadius: 12,
              padding: 14,
              borderWidth: 1,
              borderColor: "#FF980030",
              opacity: pressed ? 0.7 : 1,
            },
          ]}
        >
          <MaterialIcons name="person-search" size={22} color="#E65100" />
          <View style={{ flex: 1 }}>
            <Text
              style={{
                fontSize: 14,
                fontWeight: "600",
                color: "#E65100",
                textAlign: isRTL ? "right" : "left",
              }}
            >
              {tx(
                lang,
                "Vraag aan een specialist",
                "Ask a specialist",
                "اسأل متخصصاً",
              )}
            </Text>
            <Text
              style={{
                fontSize: 11,
                color: "#FF9800",
                textAlign: isRTL ? "right" : "left",
              }}
            >
              {tx(
                lang,
                "Neem contact op met een persoon van kennis",
                "Contact a person of knowledge",
                "تواصل مع أهل العلم",
              )}
            </Text>
          </View>
          <MaterialIcons
            name={isRTL ? "chevron-left" : "chevron-right"}
            size={20}
            color="#E65100"
          />
        </Pressable>
      </View>

      {/* Encourage profile completion if not done */}
      {!state.parentProfileCompleted && (
        <Pressable
          onPress={() => router.push("/onboarding/parent-profile")}
          style={({ pressed }) => [
            {
              marginTop: 16,
              backgroundColor: "#FCE4EC",
              borderRadius: 12,
              padding: 14,
              borderWidth: 1,
              borderColor: "#F4433630",
              opacity: pressed ? 0.7 : 1,
            },
          ]}
        >
          <Text
            style={{
              fontSize: 13,
              fontWeight: "600",
              color: "#C62828",
              textAlign: isRTL ? "right" : "left",
            }}
          >
            {tx(
              lang,
              "Vul uw profiel in voor beter advies",
              "Complete your profile for better advice",
              "أكمل ملفك الشخصي للحصول على نصائح أفضل",
            )}
          </Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  sectionCard: {
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1.5,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
  },
});
