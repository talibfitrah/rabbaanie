import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { View, Text, ScrollView, Pressable, FlatList, TextInput , KeyboardAvoidingView, Platform, ActivityIndicator } from "react-native";
import * as Application from "expo-application";
import { useRouter } from "expo-router";
import { useColors } from "@/hooks/use-colors";
import { useI18n } from "@/lib/i18n";
import { ScreenContainer } from "@/components/screen-container";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { trpc } from "@/lib/trpc";
import fitrahData from "@/data/fitrah_tasyeer.json";
import namesData from "@/data/names_of_allah.json";
import conceptsData from "@/assets/data/concepts.json";
import { getApiBaseUrl } from "@/constants/oauth";

import { authedFetch } from "@/lib/authed-fetch";
const FAVORITES_KEY = "fitrah_favorites";

type Lang = "nl" | "en" | "ar";
function tx(lang: Lang, nl: string, en: string, ar: string): string {
  if (lang === "en") return en;
  if (lang === "ar") return ar;
  return nl;
}

type ViewMode = "list" | "detail";
type SectionTab = "traits" | "hearts" | "names" | "concepts" | "misconceptions";

// Helper to get text from multilingual object or plain string
function getText(value: any, lang: Lang): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    // If it's an array, join the items (each might be a string or multilingual obj)
    return value.map((item: any) => getText(item, lang)).join("\n");
  }
  if (typeof value === "object") {
    // Try target language first, then Arabic fallback, then any available string value
    if (value[lang]) return String(value[lang]);
    if (value.ar) return String(value.ar);
    if (value.nl) return String(value.nl);
    if (value.en) return String(value.en);
    // If object has text/content/value field, try those
    if (value.text) return getText(value.text, lang);
    if (value.content) return getText(value.content, lang);
    if (value.value) return getText(value.value, lang);
    // Last resort: try to stringify meaningfully
    const keys = Object.keys(value);
    if (keys.length > 0) {
      const firstVal = value[keys[0]];
      if (typeof firstVal === "string") return firstVal;
    }
    return "";
  }
  return String(value);
}

// Helper to detect Arabic text - force RTL even when app language is Dutch/English
function isArabicText(text: string | undefined | null): boolean {
  if (!text) return false;
  return /[\u0600-\u06FF]/.test(text);
}

// Get text alignment and writing direction based on actual content
function getArabicTextStyle(text: string | undefined | null, isRTL: boolean) {
  const forceRTL = isArabicText(text) || isRTL;
  // Left-aligned per Daa3iyah (msg 437, 2026-07-28): he reversed msg 417 and wants
  // the whole Fitrah list — main items (أصول) and sub-details (فروع) — on the LEFT.
  return { textAlign: "left" as const, writingDirection: forceRTL ? "rtl" as const : "ltr" as const };
}

export default function FitrahScreen() {
  const colors = useColors();
  const router = useRouter();
  const { language, isRTL } = useI18n();
  const lang = language as Lang;
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [selectedGroupIndex, setSelectedGroupIndex] = useState(0);
  const [sectionTab, setSectionTab] = useState<SectionTab>("traits");
  // Per-section alignment (Daa3iyah): المفاهيم (concepts) right-aligned; all other
  // sections left. Only the active section renders, so this single value applies.
  const sectionAlign: "right" | "left" = sectionTab === "concepts" ? "right" : "left";
  const [expandedTrait, setExpandedTrait] = useState<number | null>(null);
  const [expandedAction, setExpandedAction] = useState<string | null>(null);
  const [expandedName, setExpandedName] = useState<string | null>(null);
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [favorites, setFavorites] = useState<string[]>([]);
  const [showFavorites, setShowFavorites] = useState(false);
  const [expandedConcept, setExpandedConcept] = useState<string | null>(null);

  // === Misconceptions state ===
  const [misconceptions, setMisconceptions] = useState<any[]>([]);
  const [misconceptionsLoading, setMisconceptionsLoading] = useState(false);
  const [expandedMisconception, setExpandedMisconception] = useState<number | null>(null);

  // === Translation state for Names of Allaah ===
  // Cache: key = "nameKey:lang", value = { meaning, explanation, reason, tasfiya[], tazkiya[], tarbiya[], tarbiya_jawarih[], examples[], evidence, targhib_tarhib, howToPresent }
  const [nameTranslations, setNameTranslations] = useState<Record<string, Record<string, string>>>({}); 
  const [translatingName, setTranslatingName] = useState<string | null>(null);
  const translateMutation = trpc.translate.translateTexts.useMutation();
  const translatingRef = useRef<Set<string>>(new Set());

  // Use a ref to track translations without causing stale closures
  const nameTranslationsRef = useRef<Record<string, Record<string, string>>>({});
  nameTranslationsRef.current = nameTranslations;

  // Translate a name's content when expanded and lang != ar
  const translateNameContent = useCallback(async (nameKey: string, item: any) => {
    if (lang === "ar") return;
    const cacheKey = `${nameKey}:${lang}`;
    if (nameTranslationsRef.current[cacheKey]) return;
    // Only block if currently translating THIS specific name
    if (translatingRef.current.has(cacheKey)) return;
    translatingRef.current.add(cacheKey);
    setTranslatingName(nameKey);

    // Collect all Arabic texts from this name item that need translation
    const texts: string[] = [];
    const keys: string[] = [];
    const preTranslated: Record<string, string> = {};

    const addText = (key: string, value: any) => {
      if (!value) return;
      // If value is a dict and already has the target language, use it directly
      if (typeof value === "object" && value[lang]) {
        preTranslated[key] = value[lang];
        return;
      }
      const t = typeof value === "string" ? value : (value.ar || value.nl || "");
      if (t) { texts.push(t); keys.push(key); }
    };

    addText("meaning", item.meaning);
    addText("explanation", item.explanation);
    addText("reason", item.reason);
    addText("evidence", item.evidence);
    addText("targhib_tarhib", item.targhib_tarhib);
    addText("howToPresent", item.howToPresent);
    // Arrays
    if (item.tasfiya) item.tasfiya.forEach((t: any, i: number) => addText(`tasfiya_${i}`, t));
    if (item.tazkiya) item.tazkiya.forEach((t: any, i: number) => addText(`tazkiya_${i}`, t));
    if (item.tarbiya) item.tarbiya.forEach((t: any, i: number) => addText(`tarbiya_${i}`, t));
    if (item.tarbiya_jawarih) item.tarbiya_jawarih.forEach((t: any, i: number) => addText(`tarbiya_jawarih_${i}`, t));
    if (item.examples) item.examples.forEach((e: any, i: number) => addText(`examples_${i}`, e));
    // station/method fields for heartStations
    addText("station", item.station);
    addText("method", item.method);

    // If all fields are pre-translated, use them directly without API call
    if (texts.length === 0) {
      if (Object.keys(preTranslated).length > 0) {
        setNameTranslations(prev => ({ ...prev, [cacheKey]: preTranslated }));
      }
      setTranslatingName(null);
      translatingRef.current.delete(cacheKey);
      return;
    }

    // Retry logic: attempt up to 2 times on failure
    const MAX_RETRIES = 2;
    let attempt = 0;
    let success = false;

    while (attempt < MAX_RETRIES && !success) {
      attempt++;
      try {
        // Batch in groups of 20 (API limit)
        const result: Record<string, string> = { ...preTranslated };
        for (let i = 0; i < texts.length; i += 20) {
          const batch = texts.slice(i, i + 20);
          const batchKeys = keys.slice(i, i + 20);
          const res = await translateMutation.mutateAsync({
            texts: batch,
            targetLang: lang as "nl" | "en",
            context: "Islamic parenting education - Names of Allaah",
            category: "names_of_allah",
          });
          res.translations.forEach((t: string, idx: number) => {
            result[batchKeys[idx]] = t;
          });
        }
        setNameTranslations(prev => ({ ...prev, [cacheKey]: result }));
        success = true;
      } catch (e) {
        console.warn(`Translation attempt ${attempt} failed for`, nameKey, e);
        if (attempt < MAX_RETRIES) {
          // Wait 1 second before retry
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    }

    setTranslatingName(null);
    translatingRef.current.delete(cacheKey);
  }, [lang, translateMutation]);

  // Helper to get translated text for a name field
  const getTranslatedText = useCallback((nameKey: string, fieldKey: string, originalValue: any): string => {
    if (lang === "ar") return getText(originalValue, lang);
    const cacheKey = `${nameKey}:${lang}`;
    const cached = nameTranslations[cacheKey];
    if (cached && cached[fieldKey]) return cached[fieldKey];
    return getText(originalValue, lang); // Fallback to original (Arabic)
  }, [lang, nameTranslations]);

  // Load favorites from AsyncStorage
  useEffect(() => {
    AsyncStorage.getItem(FAVORITES_KEY).then((data) => {
      if (data) setFavorites(JSON.parse(data));
    });
  }, []);

  const toggleFavorite = useCallback(async (id: string) => {
    setFavorites((prev) => {
      const next = prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id];
      AsyncStorage.setItem(FAVORITES_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const getFavoriteId = (type: string, groupIndex: number, item: any, idx?: number): string => {
    if (type === "trait") return `trait_${groupIndex}_${idx}`;
    if (type === "heart") return `heart_${groupIndex}_${item.id}`;
    if (type === "name") return `name_${groupIndex}_${item.name}`;
    if (type === "station") return `station_${groupIndex}_${getText(item.station, "ar")}`;
    return `${type}_${groupIndex}_${idx}`;
  };

  const fitrahGroups = fitrahData.ageGroups as any[];
  const namesGroups = namesData.ageGroups as any[];

  // Concepts data (excluding names_of_allah which is in the Names tab)
  const allConcepts = useMemo(() => {
    return (conceptsData as any[]).filter((c: any) => c.category !== "names_of_allah");
  }, []);

  function getConceptName(item: any, l: Lang): string {
    if (l === "ar") return item.nameAR;
    if (l === "en") return item.nameEN;
    return item.nameNL;
  }
  function getConceptDesc(item: any, l: Lang): string {
    if (l === "ar") return item.descriptionAR;
    if (l === "en") return item.descriptionEN;
    return item.descriptionNL;
  }
  function getConceptSource(item: any, l: Lang): string {
    if (l === "ar") return item.sourceAR;
    if (l === "en") return item.sourceEN;
    return item.sourceNL;
  }
  function getConceptScholar(item: any, l: Lang): string {
    if (l === "ar") return item.scholarAR;
    if (l === "en") return item.scholarEN;
    return item.scholarNL;
  }
  function getConceptCategoryLabel(cat: string, l: Lang): string {
    switch (cat) {
      case "quran": return tx(l, "Qur'aan", "Qur'aan", "القرآن");
      case "sunnah": return tx(l, "Sunnah", "Sunnah", "السنة");
      case "ibn_taymiyyah": return tx(l, "Ibn Taymiyyah", "Ibn Taymiyyah", "ابن تيمية");
      case "ibn_qayyim": return tx(l, "Ibn al-Qayyim", "Ibn al-Qayyim", "ابن القيم");
      case "mawsouah": return tx(l, "Mawsoe'ah", "Mawsu'ah", "الموسوعة");
      case "gezinskunde": return tx(l, "Gezinskunde", "Family Science", "علم الأسرة");
      default: return cat;
    }
  }
  function getConceptIcon(cat: string): string {
    switch (cat) {
      case "quran": return "\uD83D\uDCD6";
      case "sunnah": return "\u262A\uFE0F";
      case "ibn_taymiyyah": return "\uD83D\uDCDA";
      case "ibn_qayyim": return "\uD83D\uDCDC";
      case "mawsouah": return "\uD83D\uDCD7";
      case "gezinskunde": return "\uD83C\uDFE0";
      default: return "\uD83D\uDCD8";
    }
  }

  const currentFitrah = fitrahGroups[selectedGroupIndex];
  const currentNames = namesGroups[selectedGroupIndex];

  // Search: filter traits/heartActions/names across all groups
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return null;
    const q = searchQuery.toLowerCase().trim();
    const results: { type: string; groupIndex: number; item: any; matchField: string }[] = [];
    fitrahGroups.forEach((group, gi) => {
      group.fitrahTraits?.forEach((item: any) => {
        const traitText = getText(item.trait, lang).toLowerCase();
        const methodText = getText(item.method, lang).toLowerCase();
        if (traitText.includes(q) || methodText.includes(q)) {
          results.push({ type: "trait", groupIndex: gi, item, matchField: traitText.includes(q) ? "trait" : "method" });
        }
      });
      group.heartActions?.forEach((item: any) => {
        const titleText = getText(item.title, lang).toLowerCase();
        const descText = getText(item.description, lang).toLowerCase();
        const methodText = getText(item.method, lang).toLowerCase();
        if (titleText.includes(q) || descText.includes(q) || methodText.includes(q)) {
          results.push({ type: "heart", groupIndex: gi, item, matchField: "title" });
        }
      });
    });
    namesGroups.forEach((group, gi) => {
      group.names?.forEach((item: any) => {
        const nameText = (item.name || "").toLowerCase();
        const reasonText = getText(item.reason, lang).toLowerCase();
        if (nameText.includes(q) || reasonText.includes(q)) {
          results.push({ type: "name", groupIndex: gi, item, matchField: "name" });
        }
      });
      group.heartStations?.forEach((item: any) => {
        const stationText = getText(item.station, lang).toLowerCase();
        const descText = getText(item.description, lang).toLowerCase();
        if (stationText.includes(q) || descText.includes(q)) {
          results.push({ type: "station", groupIndex: gi, item, matchField: "station" });
        }
      });
    });
    // Search in concepts
    allConcepts.forEach((item: any) => {
      const nameText = getConceptName(item, lang).toLowerCase();
      const descText = getConceptDesc(item, lang).toLowerCase();
      if (nameText.includes(q) || descText.includes(q)) {
        results.push({ type: "concept", groupIndex: 0, item, matchField: "concept" });
      }
    });
    return results;
  }, [searchQuery, lang, allConcepts]);

  const selectGroup = (index: number) => {
    setSelectedGroupIndex(index);
    setViewMode("detail");
    setSectionTab("traits");
    setExpandedTrait(null);
    setExpandedAction(null);
    setExpandedName(null);
    setExpandedGroup(null);
  };

  const goBack = () => {
    setViewMode("list");
    setExpandedTrait(null);
    setExpandedAction(null);
    setExpandedName(null);
    setExpandedGroup(null);
  };

  // Count names for current group
  const getNamesCount = (group: any) => {
    if (group.names) return group.names.length;
    if (group.groups) return group.groups.reduce((sum: number, g: any) => sum + g.names.length, 0);
    if (group.heartStations) return group.heartStations.length;
    return 0;
  };

  const renderAgeGroupList = () => (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 40 }}>
      <View style={{ gap: 10 }}>
        {fitrahGroups.map((group, index) => (
          <Pressable
            key={group.id}
            onPress={() => selectGroup(index)}
            style={({ pressed }) => [{
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 14,
              padding: 16,
              opacity: pressed ? 0.85 : 1,
            }]}
          >
            <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 12 }}>
              <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: colors.primary + "12", alignItems: "center", justifyContent: "center" }}>
                <Text style={{ color: colors.primary, fontSize: 11, fontWeight: "800" }}>{group.id}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.foreground, fontSize: 16, fontWeight: "700", textAlign: sectionAlign, writingDirection: lang === "ar" ? "rtl" : "ltr" }}>{getText(group.title, lang)}</Text>
                <Text style={{ color: colors.primary, fontSize: 12, fontWeight: "600", marginTop: 2, textAlign: sectionAlign, writingDirection: lang === "ar" ? "rtl" : "ltr" }}>{getText(group.subtitle, lang)}</Text>
                <View style={{ flexDirection: isRTL ? "row-reverse" : "row", gap: 12, marginTop: 6 }}>
                  <Text style={{ color: colors.success, fontSize: 10, fontWeight: "600" }}>
                    {group.fitrahTraits.length} {tx(lang, "kenmerken", "traits", "خصلة")}
                  </Text>
                  <Text style={{ color: "#6A1B9A", fontSize: 10, fontWeight: "600" }}>
                    {group.heartActions.length} {tx(lang, "manazil", "manazil", "منزلة")}
                  </Text>
                  <Text style={{ color: "#E65100", fontSize: 10, fontWeight: "600" }}>
                    {getNamesCount(namesGroups[index])} {tx(lang, "namen", "names", "اسم")}
                  </Text>
                </View>
              </View>
              <Text style={{ color: colors.muted, fontSize: 18 }}>{isRTL ? "❮" : "❯"}</Text>
            </View>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );

  const renderSectionTabs = () => (
    <View style={{ flexDirection: isRTL ? "row-reverse" : "row", marginBottom: 12, gap: 4, flexWrap: "wrap" }}>
      {[
        { key: "traits" as SectionTab, label: tx(lang, "Kenmerken", "Traits", "خصال الفطرة"), color: colors.success, count: currentFitrah?.fitrahTraits?.length || 0 },
        { key: "hearts" as SectionTab, label: tx(lang, "Manazil", "Manazil", "منازل القلوب"), color: "#6A1B9A", count: currentFitrah?.heartActions?.length || 0 },
        { key: "names" as SectionTab, label: tx(lang, "Namen Allaah", "Names of Allaah", "أسماء الله"), color: "#E65100", count: getNamesCount(currentNames) },
        { key: "concepts" as SectionTab, label: tx(lang, "Begrippen", "Concepts", "المفاهيم"), color: "#1565C0", count: allConcepts.length },
        { key: "misconceptions" as SectionTab, label: tx(lang, "Shubuhaat", "Misconceptions", "الشبهات"), color: "#B71C1C", count: misconceptions.length },
      ].map((tab) => (
        <Pressable
          key={tab.key}
          onPress={() => { setSectionTab(tab.key); setExpandedTrait(null); setExpandedAction(null); setExpandedName(null); setExpandedGroup(null); setExpandedConcept(null); }}
          style={({ pressed }) => [{
            flex: 1,
            minWidth: "22%",
            paddingVertical: 8,
            borderRadius: 10,
            backgroundColor: sectionTab === tab.key ? tab.color + "15" : colors.surface,
            borderWidth: 1.5,
            borderColor: sectionTab === tab.key ? tab.color : colors.border,
            alignItems: "center",
            opacity: pressed ? 0.8 : 1,
          }]}
        >
          <Text style={{ color: sectionTab === tab.key ? tab.color : colors.muted, fontSize: 10, fontWeight: "700" }}>{tab.label}</Text>
          <Text style={{ color: sectionTab === tab.key ? tab.color : colors.muted, fontSize: 9, marginTop: 2 }}>{tab.count}</Text>
        </Pressable>
      ))}
    </View>
  );

  // Fold branch sub-points (إيجابيًّا:، أ. عقليًّا: ...) under their preceding root
  // trait, so they appear nested inside it instead of as separate top-level items.
  const nestedTraits = useMemo(() => {
    const BRANCH_RE = /^\s*([أبجده]\.\s|إيجابي|سلبي)/;
    const src: any[] = currentFitrah?.fitrahTraits || [];
    const out: { root: any; rootIdx: number; branches: { item: any; idx: number }[] }[] = [];
    src.forEach((item, idx) => {
      const ar = ((item?.trait?.ar) || "").trim();
      if (BRANCH_RE.test(ar) && out.length > 0) {
        out[out.length - 1].branches.push({ item, idx });
      } else {
        out.push({ root: item, rootIdx: idx, branches: [] });
      }
    });
    return out;
  }, [currentFitrah]);

  const renderTraits = () => (
    <View style={{ gap: 8 }}>
      {nestedTraits.map((group: any, gi: number) => {
        const item = group.root;
        const idx = group.rootIdx;
        return (
        <Pressable
          key={idx}
          onPress={() => setExpandedTrait(expandedTrait === idx ? null : idx)}
          style={({ pressed }) => [{
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: expandedTrait === idx ? colors.success + "60" : colors.border,
            borderRadius: 10,
            overflow: "hidden",
            opacity: pressed ? 0.9 : 1,
          }]}
        >
          <View style={{ padding: 12, flexDirection: isArabicText(getText(item.trait, lang)) || isRTL ? "row-reverse" : "row", alignItems: "center" }}>
            <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: colors.success + "15", alignItems: "center", justifyContent: "center", marginLeft: isArabicText(getText(item.trait, lang)) || isRTL ? 10 : 0, marginRight: isArabicText(getText(item.trait, lang)) || isRTL ? 0 : 10 }}>
              <Text style={{ color: colors.success, fontSize: 9, fontWeight: "800" }}>{gi + 1}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.foreground, fontSize: 13, fontWeight: "600", lineHeight: 20, ...getArabicTextStyle(getText(item.trait, lang), isRTL) }} numberOfLines={expandedTrait === idx ? undefined : 2}>
                {getText(item.trait, lang)}
              </Text>
            </View>
            <Pressable
              onPress={(e) => { e.stopPropagation?.(); toggleFavorite(getFavoriteId("trait", selectedGroupIndex, item, idx)); }}
              style={{ padding: 4, marginHorizontal: 4 }}
            >
              <Text style={{ fontSize: 14 }}>{favorites.includes(getFavoriteId("trait", selectedGroupIndex, item, idx)) ? "❤️" : "♡"}</Text>
            </Pressable>
            <Text style={{ color: colors.success, fontSize: 10 }}>{expandedTrait === idx ? "▲" : "▼"}</Text>
          </View>
          {expandedTrait === idx && (
            <View style={{ paddingHorizontal: 12, paddingBottom: 12, borderTopWidth: 0.5, borderTopColor: colors.border, paddingTop: 10 }}>
              {item.sub_phase ? (() => {
                const subPhaseText = getText(item.sub_phase, lang);
                return (
                <View style={{ backgroundColor: colors.primary + "10", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, marginBottom: 8, alignSelf: "flex-start" }}>
                  <Text style={{ color: colors.primary, fontSize: 10, fontWeight: "600", ...getArabicTextStyle(subPhaseText, isRTL) }}>{subPhaseText}</Text>
                </View>
                );
              })() : null}
              <Text style={{ color: colors.success, fontSize: 11, fontWeight: "700", marginBottom: 4, ...getArabicTextStyle(getText(item.method, lang), isRTL) }}>
                {tx(lang, "TASYEER (BEGELEIDING):", "TASYEER (GUIDANCE):", "التسيير:")}
              </Text>
              <Text style={{ color: colors.foreground, fontSize: 12, lineHeight: 20, ...getArabicTextStyle(getText(item.method, lang), isRTL) }}>{getText(item.method, lang)}</Text>
              {item.details && (() => {
                // Use translated details if available for current language
                const detailsLang = lang === "nl" ? item.details_nl : lang === "en" ? item.details_en : null;
                const getDetail = (key: string) => (detailsLang && detailsLang[key]) ? detailsLang[key] : item.details[key];
                return (
                <View style={{ marginTop: 10, gap: 6 }}>
                  {item.details.self_leadership ? (
                    <View>
                      <Text style={{ color: "#1565C0", fontSize: 10, fontWeight: "700", ...getArabicTextStyle(getDetail("self_leadership"), isRTL) }}>{tx(lang, "Zelfleiderschap:", "Self-leadership:", "قيادة النفس:")}</Text>
                      <Text style={{ color: colors.foreground, fontSize: 11, lineHeight: 18, ...getArabicTextStyle(getDetail("self_leadership"), isRTL) }}>{getDetail("self_leadership")}</Text>
                    </View>
                  ) : null}
                  {item.details.emotions ? (
                    <View>
                      <Text style={{ color: "#6A1B9A", fontSize: 10, fontWeight: "700", ...getArabicTextStyle(getDetail("emotions"), isRTL) }}>{tx(lang, "Emoties:", "Emotions:", "العواطف:")}</Text>
                      <Text style={{ color: colors.foreground, fontSize: 11, lineHeight: 18, ...getArabicTextStyle(getDetail("emotions"), isRTL) }}>{getDetail("emotions")}</Text>
                    </View>
                  ) : null}
                  {item.details.patience ? (
                    <View>
                      <Text style={{ color: "#E65100", fontSize: 10, fontWeight: "700", ...getArabicTextStyle(getDetail("patience"), isRTL) }}>{tx(lang, "Geduld:", "Patience:", "الصبر:")}</Text>
                      <Text style={{ color: colors.foreground, fontSize: 11, lineHeight: 18, ...getArabicTextStyle(getDetail("patience"), isRTL) }}>{getDetail("patience")}</Text>
                    </View>
                  ) : null}
                  {item.details.sincerity ? (
                    <View>
                      <Text style={{ color: "#2E7D32", fontSize: 10, fontWeight: "700", ...getArabicTextStyle(getDetail("sincerity"), isRTL) }}>{tx(lang, "Oprechtheid:", "Sincerity:", "الإخلاص:")}</Text>
                      <Text style={{ color: colors.foreground, fontSize: 11, lineHeight: 18, ...getArabicTextStyle(getDetail("sincerity"), isRTL) }}>{getDetail("sincerity")}</Text>
                    </View>
                  ) : null}
                  {item.details.love_fear ? (
                    <View>
                      <Text style={{ color: "#C62828", fontSize: 10, fontWeight: "700", ...getArabicTextStyle(getDetail("love_fear"), isRTL) }}>{tx(lang, "Liefde & vrees:", "Love & fear:", "المحبة والخوف:")}</Text>
                      <Text style={{ color: colors.foreground, fontSize: 11, lineHeight: 18, ...getArabicTextStyle(getDetail("love_fear"), isRTL) }}>{getDetail("love_fear")}</Text>
                    </View>
                  ) : null}
                  {item.details.time_management ? (
                    <View>
                      <Text style={{ color: "#00695C", fontSize: 10, fontWeight: "700", ...getArabicTextStyle(getDetail("time_management"), isRTL) }}>{tx(lang, "Tijdmanagement:", "Time management:", "ضبط الوقت:")}</Text>
                      <Text style={{ color: colors.foreground, fontSize: 11, lineHeight: 18, ...getArabicTextStyle(getDetail("time_management"), isRTL) }}>{getDetail("time_management")}</Text>
                    </View>
                  ) : null}
                </View>
                );
              })()}
              {group.branches && group.branches.map((b: any, bi: number) => {
                const btext = getText(b.item.trait, lang);
                const bmethod = getText(b.item.method, lang);
                return (
                  <View key={`br-${bi}`} style={{ marginTop: 10, paddingTop: 8, borderTopWidth: 0.5, borderTopColor: colors.border }}>
                    <Text style={{ color: colors.success, fontSize: 12, fontWeight: "700", marginBottom: 3, ...getArabicTextStyle(btext, isRTL) }}>{btext}</Text>
                    <Text style={{ color: colors.foreground, fontSize: 12, lineHeight: 20, ...getArabicTextStyle(bmethod, isRTL) }}>{bmethod}</Text>
                  </View>
                );
              })}
            </View>
          )}
        </Pressable>
        );
      })}
    </View>
  );

  const renderHearts = () => (
    <View style={{ gap: 8 }}>
      {currentFitrah?.heartActions.map((action: any) => (
        <Pressable
          key={action.id}
          onPress={() => setExpandedAction(expandedAction === action.id ? null : action.id)}
          style={({ pressed }) => [{
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: expandedAction === action.id ? "#6A1B9A50" : colors.border,
            borderRadius: 10,
            overflow: "hidden",
            opacity: pressed ? 0.9 : 1,
          }]}
        >
          <View style={{ padding: 12, flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", justifyContent: "space-between" }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: "#6A1B9A", fontSize: 14, fontWeight: "700", textAlign: sectionAlign, writingDirection: lang === "ar" ? "rtl" : "ltr" }}>{getText(action.title, lang)}</Text>
              <Text style={{ color: colors.muted, fontSize: 11, marginTop: 2, textAlign: sectionAlign, writingDirection: lang === "ar" ? "rtl" : "ltr" }} numberOfLines={expandedAction === action.id ? undefined : 1}>{getText(action.description, lang)}</Text>
            </View>
            <Pressable
              onPress={(e) => { e.stopPropagation?.(); toggleFavorite(getFavoriteId("heart", selectedGroupIndex, action)); }}
              style={{ padding: 4, marginHorizontal: 4 }}
            >
              <Text style={{ fontSize: 14 }}>{favorites.includes(getFavoriteId("heart", selectedGroupIndex, action)) ? "❤️" : "♡"}</Text>
            </Pressable>
            <Text style={{ color: "#6A1B9A", fontSize: 12 }}>{expandedAction === action.id ? "▲" : "▼"}</Text>
          </View>
          {expandedAction === action.id && (
            <View style={{ paddingHorizontal: 12, paddingBottom: 12, borderTopWidth: 0.5, borderTopColor: colors.border, paddingTop: 10 }}>
              {action.method ? (
                <View style={{ marginBottom: 8 }}>
                  <Text style={{ color: "#2E7D32", fontSize: 11, fontWeight: "700", marginBottom: 3, textAlign: sectionAlign, writingDirection: lang === "ar" ? "rtl" : "ltr" }}>
                    {tx(lang, "METHODE:", "METHOD:", "الطريقة:")}
                  </Text>
                  <Text style={{ color: colors.foreground, fontSize: 12, lineHeight: 20, textAlign: sectionAlign, writingDirection: lang === "ar" ? "rtl" : "ltr" }}>{getText(action.method, lang)}</Text>
                </View>
              ) : null}
              {action.daleel ? (
                <View style={{ backgroundColor: colors.background, borderRadius: 8, padding: 8 }}>
                  <Text style={{ color: colors.primary, fontSize: 11, fontWeight: "700", marginBottom: 3, textAlign: sectionAlign, writingDirection: lang === "ar" ? "rtl" : "ltr" }}>
                    {tx(lang, "BEWIJS:", "EVIDENCE:", "الدليل:")}
                  </Text>
                  <Text style={{ color: colors.primary, fontSize: 11, lineHeight: 20, fontStyle: "italic", textAlign: sectionAlign, writingDirection: lang === "ar" ? "rtl" : "ltr" }}>﴿ {getText(action.daleel, lang)} ﴾</Text>
                  {action.sources && action.sources.length > 0 && (
                    <View style={{ marginTop: 6, paddingTop: 6, borderTopWidth: 0.5, borderTopColor: colors.border }}>
                      <Text style={{ fontSize: 10, fontWeight: "600", color: colors.muted, marginBottom: 2, textAlign: sectionAlign, writingDirection: lang === "ar" ? "rtl" : "ltr" }}>
                        {tx(lang, "Bronvermelding:", "Source:", "التخريج:")}
                      </Text>
                      {action.sources.map((src: any, si: number) => (
                        <Text key={si} style={{ fontSize: 10, color: colors.muted, lineHeight: 16, textAlign: sectionAlign, writingDirection: lang === "ar" ? "rtl" : "ltr" }}>
                          {src.type === "quran" ? "📖 " : "📜 "}
                          {lang === "ar" ? src.ar : lang === "nl" ? src.nl : src.en}
                        </Text>
                      ))}
                    </View>
                  )}
                </View>
              ) : null}
            </View>
          )}
        </Pressable>
      ))}
    </View>
  );

  const renderNames = () => {
    // Names list (age 2-4, 4-6, 10-12)
    if (currentNames?.names && currentNames.names.length > 0) {
      return (
        <View style={{ gap: 8 }}>
          {currentNames.names.map((item: any) => {
            const isExpanded = expandedName === item.name;
            return (
              <Pressable
                key={item.name}
                onPress={() => {
                  const newExpanded = isExpanded ? null : item.name;
                  setExpandedName(newExpanded);
                  if (newExpanded && lang !== "ar") translateNameContent(item.name, item);
                }}
                style={({ pressed }) => [{
                  backgroundColor: colors.surface,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: isExpanded ? "#E65100" + "60" : colors.border,
                  overflow: "hidden",
                  opacity: pressed ? 0.85 : 1,
                }]}
              >
                <View style={{ padding: 14, flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", justifyContent: "space-between" }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 17, fontWeight: "700", color: "#E65100", textAlign: sectionAlign, writingDirection: lang === "ar" ? "rtl" : "ltr" }}>{item.name}</Text>
                    {item.reason && (
                      <Text style={{ fontSize: 11, color: colors.muted, marginTop: 3, textAlign: sectionAlign, writingDirection: lang === "ar" ? "rtl" : "ltr", lineHeight: 18 }}>{getTranslatedText(item.name, "reason", item.reason)}</Text>
                    )}
                  </View>
                  <Text style={{ fontSize: 12, color: colors.muted }}>{isExpanded ? "▲" : "▼"}</Text>
                </View>
                {isExpanded && (
                  <View style={{ paddingHorizontal: 14, paddingBottom: 14, borderTopWidth: 0.5, borderTopColor: colors.border, paddingTop: 12 }}>
                    {/* Loading indicator */}
                    {translatingName === item.name && lang !== "ar" && (
                      <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", marginBottom: 8, gap: 6 }}>
                        <ActivityIndicator size="small" color={colors.primary} />
                        <Text style={{ fontSize: 11, color: colors.muted }}>{tx(lang, "Vertalen...", "Translating...", "جاري الترجمة...")}</Text>
                      </View>
                    )}
                    {/* المعنى */}
                    {item.meaning && (
                      <View style={{ marginBottom: 10 }}>
                        <Text style={{ fontSize: 12, fontWeight: "700", color: colors.primary, marginBottom: 4, textAlign: sectionAlign, writingDirection: lang === "ar" ? "rtl" : "ltr" }}>
                          {tx(lang, "Betekenis:", "Meaning:", "المعنى:")}
                        </Text>
                        <Text style={{ fontSize: 12, color: colors.foreground, lineHeight: 22, textAlign: sectionAlign, writingDirection: lang === "ar" ? "rtl" : "ltr" }}>{getTranslatedText(item.name, "meaning", item.meaning)}</Text>
                      </View>
                    )}
                    {/* الشرح */}
                    {item.explanation && (
                      <View style={{ marginBottom: 10 }}>
                        <Text style={{ fontSize: 12, fontWeight: "700", color: "#455A64", marginBottom: 4, textAlign: sectionAlign, writingDirection: lang === "ar" ? "rtl" : "ltr" }}>
                          {tx(lang, "Uitleg:", "Explanation:", "الشرح:")}
                        </Text>
                        <Text style={{ fontSize: 12, color: colors.foreground, lineHeight: 22, textAlign: sectionAlign, writingDirection: lang === "ar" ? "rtl" : "ltr" }}>{getTranslatedText(item.name, "explanation", item.explanation)}</Text>
                      </View>
                    )}
                    {/* الأدلة */}
                    {item.evidence && (
                      <View style={{ marginBottom: 10, backgroundColor: colors.background, borderRadius: 8, padding: 10 }}>
                        <Text style={{ fontSize: 12, fontWeight: "700", color: colors.primary, marginBottom: 4, textAlign: sectionAlign, writingDirection: lang === "ar" ? "rtl" : "ltr" }}>
                          {tx(lang, "Bewijs:", "Evidence:", "الأدلة:")}
                        </Text>
                        <Text style={{ fontSize: 11, color: colors.primary, lineHeight: 20, fontStyle: "italic", textAlign: sectionAlign, writingDirection: lang === "ar" ? "rtl" : "ltr" }}>{getTranslatedText(item.name, "evidence", item.evidence)}</Text>
                      </View>
                    )}
                    {/* الترغيب والترهيب */}
                    {item.targhib_tarhib && (
                      <View style={{ marginBottom: 10 }}>
                        <Text style={{ fontSize: 12, fontWeight: "700", color: "#C62828", marginBottom: 4, textAlign: sectionAlign, writingDirection: lang === "ar" ? "rtl" : "ltr" }}>
                          {tx(lang, "Aanmoediging & waarschuwing:", "Encouragement & warning:", "الترغيب والترهيب:")}
                        </Text>
                        <Text style={{ fontSize: 12, color: colors.foreground, lineHeight: 22, textAlign: sectionAlign, writingDirection: lang === "ar" ? "rtl" : "ltr" }}>{getTranslatedText(item.name, "targhib_tarhib", item.targhib_tarhib)}</Text>
                      </View>
                    )}
                    {/* تصفية */}
                    {item.tasfiya && item.tasfiya.length > 0 && (
                      <View style={{ marginBottom: 10 }}>
                        <Text style={{ fontSize: 12, fontWeight: "700", color: "#2E7D32", marginBottom: 4, textAlign: sectionAlign, writingDirection: lang === "ar" ? "rtl" : "ltr" }}>
                          {tx(lang, "Tasfiya (wat planten we?):", "Tasfiya (what do we plant?):", "التصفية (ماذا نغرس؟):")}
                        </Text>
                        {item.tasfiya.map((t: any, i: number) => (
                          <Text key={i} style={{ fontSize: 12, color: colors.foreground, lineHeight: 22, textAlign: sectionAlign, writingDirection: lang === "ar" ? "rtl" : "ltr", paddingRight: isRTL ? 10 : 0, paddingLeft: isRTL ? 0 : 10 }}>
                            • {getTranslatedText(item.name, `tasfiya_${i}`, t)}
                          </Text>
                        ))}
                      </View>
                    )}
                    {/* تزكية */}
                    {item.tazkiya && item.tazkiya.length > 0 && (
                      <View style={{ marginBottom: 10 }}>
                        <Text style={{ fontSize: 12, fontWeight: "700", color: "#1565C0", marginBottom: 4, textAlign: sectionAlign, writingDirection: lang === "ar" ? "rtl" : "ltr" }}>
                          {tx(lang, "Tazkiya (wat groeit in het hart?):", "Tazkiya (what grows in the heart?):", "التزكية (ماذا ينمو في القلب؟):")}
                        </Text>
                        {item.tazkiya.map((t: any, i: number) => (
                          <Text key={i} style={{ fontSize: 12, color: colors.foreground, lineHeight: 22, textAlign: sectionAlign, writingDirection: lang === "ar" ? "rtl" : "ltr", paddingRight: isRTL ? 10 : 0, paddingLeft: isRTL ? 0 : 10 }}>
                            • {getTranslatedText(item.name, `tazkiya_${i}`, t)}
                          </Text>
                        ))}
                      </View>
                    )}
                    {/* تربية عملية */}
                    {item.tarbiya && item.tarbiya.length > 0 && (
                      <View style={{ marginBottom: 10 }}>
                        <Text style={{ fontSize: 12, fontWeight: "700", color: "#E65100", marginBottom: 4, textAlign: sectionAlign, writingDirection: lang === "ar" ? "rtl" : "ltr" }}>
                          {tx(lang, "Tarbiya (hoe passen we toe?):", "Tarbiya (how do we apply?):", "التربية العملية (كيف نطبّق؟):")}
                        </Text>
                        {item.tarbiya.map((t: any, i: number) => (
                          <Text key={i} style={{ fontSize: 12, color: colors.foreground, lineHeight: 22, textAlign: sectionAlign, writingDirection: lang === "ar" ? "rtl" : "ltr", paddingRight: isRTL ? 10 : 0, paddingLeft: isRTL ? 0 : 10 }}>
                            • {getTranslatedText(item.name, `tarbiya_${i}`, t)}
                          </Text>
                        ))}
                      </View>
                    )}
                    {/* تربية الجوارح */}
                    {item.tarbiya_jawarih && item.tarbiya_jawarih.length > 0 && (
                      <View style={{ marginBottom: 10 }}>
                        <Text style={{ fontSize: 12, fontWeight: "700", color: "#4E342E", marginBottom: 4, textAlign: sectionAlign, writingDirection: lang === "ar" ? "rtl" : "ltr" }}>
                          {tx(lang, "Opvoeding van de ledematen:", "Education of the limbs:", "تربية الجوارح:")}
                        </Text>
                        {item.tarbiya_jawarih.map((t: any, i: number) => (
                          <Text key={i} style={{ fontSize: 12, color: colors.foreground, lineHeight: 22, textAlign: sectionAlign, writingDirection: lang === "ar" ? "rtl" : "ltr", paddingRight: isRTL ? 10 : 0, paddingLeft: isRTL ? 0 : 10 }}>
                            • {getTranslatedText(item.name, `tarbiya_jawarih_${i}`, t)}
                          </Text>
                        ))}
                      </View>
                    )}
                    {/* أمثلة */}
                    {item.examples && item.examples.length > 0 && (
                      <View style={{ backgroundColor: colors.background, borderRadius: 8, padding: 10 }}>
                        <Text style={{ fontSize: 12, fontWeight: "700", color: "#6A1B9A", marginBottom: 4, textAlign: sectionAlign, writingDirection: lang === "ar" ? "rtl" : "ltr" }}>
                          {tx(lang, "Praktische voorbeelden:", "Practical examples:", "أمثلة تطبيقية:")}
                        </Text>
                        {item.examples.map((e: any, i: number) => (
                          <Text key={i} style={{ fontSize: 12, color: colors.foreground, lineHeight: 22, textAlign: sectionAlign, writingDirection: lang === "ar" ? "rtl" : "ltr", paddingRight: isRTL ? 10 : 0, paddingLeft: isRTL ? 0 : 10 }}>
                            ✦ {getTranslatedText(item.name, `examples_${i}`, e)}
                          </Text>
                        ))}
                      </View>
                    )}
                    {/* howToPresent */}
                    {item.howToPresent && (
                      <View style={{ marginTop: 8 }}>
                        <Text style={{ fontSize: 12, fontWeight: "700", color: "#E65100", marginBottom: 3, textAlign: sectionAlign, writingDirection: lang === "ar" ? "rtl" : "ltr" }}>
                          {tx(lang, "Presentatie:", "Presentation:", "طريقة التقديم:")}
                        </Text>
                        <Text style={{ fontSize: 12, color: colors.foreground, lineHeight: 20, textAlign: sectionAlign, writingDirection: lang === "ar" ? "rtl" : "ltr" }}>{getTranslatedText(item.name, "howToPresent", item.howToPresent)}</Text>
                      </View>
                    )}
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>
      );
    }
    // Groups (age 7-9)
    if (currentNames?.groups && currentNames.groups.length > 0) {
      return (
        <View style={{ gap: 8 }}>
          {currentNames.groups.map((group: any) => {
            const groupKey = getText(group.group, lang);
            const isExpanded = expandedGroup === groupKey;
            // Extract name strings from objects or strings
            const nameStrings = group.names.map((n: any) => typeof n === "string" ? n : n.name);
            return (
              <Pressable
                key={groupKey}
                onPress={() => setExpandedGroup(isExpanded ? null : groupKey)}
                style={({ pressed }) => [{
                  backgroundColor: colors.surface,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: isExpanded ? "#E65100" + "60" : colors.border,
                  overflow: "hidden",
                  opacity: pressed ? 0.85 : 1,
                }]}
              >
                <View style={{ padding: 14, flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", justifyContent: "space-between" }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: "700", color: "#E65100", textAlign: sectionAlign, writingDirection: lang === "ar" ? "rtl" : "ltr" }}>{getText(group.group, lang)}</Text>
                    <Text style={{ fontSize: 11, color: colors.muted, marginTop: 3, textAlign: sectionAlign, writingDirection: lang === "ar" ? "rtl" : "ltr" }}>
                      {nameStrings.join(" • ")}
                    </Text>
                  </View>
                  <Text style={{ fontSize: 12, color: colors.muted }}>{isExpanded ? "▲" : "▼"}</Text>
                </View>
                {isExpanded && (
                  <View style={{ paddingHorizontal: 14, paddingBottom: 14, borderTopWidth: 0.5, borderTopColor: colors.border, paddingTop: 10 }}>
                    {group.buildsOn && (
                      <Text style={{ fontSize: 11, color: colors.muted, textAlign: sectionAlign, writingDirection: lang === "ar" ? "rtl" : "ltr", marginBottom: 4 }}>
                        {tx(lang, "Bouwt voort op:", "Builds on:", "يبني على:")} {getText(group.buildsOn, lang)}
                      </Text>
                    )}
                    {group.preparesFor && (
                      <Text style={{ fontSize: 11, color: "#E65100", textAlign: sectionAlign, writingDirection: lang === "ar" ? "rtl" : "ltr", lineHeight: 18, marginBottom: 10 }}>
                        {tx(lang, "Bereidt voor op:", "Prepares for:", "يُهيّئ لـ:")} {getText(group.preparesFor, lang)}
                      </Text>
                    )}
                    {/* Individual names with details */}
                    {group.names.map((nameItem: any) => {
                      if (typeof nameItem === "string") return null;
                      const nameKey = nameItem.name;
                      const isNameExpanded = expandedName === groupKey + "_" + nameKey;
                      return (
                        <Pressable
                          key={nameKey}
                          onPress={() => {
                            const newKey = isNameExpanded ? null : groupKey + "_" + nameKey;
                            setExpandedName(newKey);
                            if (newKey && lang !== "ar") translateNameContent(groupKey + "_" + nameKey, nameItem);
                          }}
                          style={({ pressed }) => [{
                            backgroundColor: colors.background,
                            borderRadius: 10,
                            borderWidth: 1,
                            borderColor: isNameExpanded ? "#E65100" + "40" : colors.border,
                            marginBottom: 6,
                            overflow: "hidden",
                            opacity: pressed ? 0.9 : 1,
                          }]}
                        >
                          <View style={{ padding: 10, flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", justifyContent: "space-between" }}>
                            <Text style={{ fontSize: 15, fontWeight: "700", color: "#E65100", textAlign: sectionAlign, writingDirection: lang === "ar" ? "rtl" : "ltr" }}>{nameKey}</Text>
                            <Text style={{ fontSize: 10, color: colors.muted }}>{isNameExpanded ? "▲" : "▼"}</Text>
                          </View>
                          {isNameExpanded && (
                            <View style={{ paddingHorizontal: 10, paddingBottom: 12, borderTopWidth: 0.5, borderTopColor: colors.border, paddingTop: 8 }}>
                              {translatingName === (groupKey + "_" + nameKey) && lang !== "ar" && (
                                <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", marginBottom: 6, gap: 4 }}>
                                  <ActivityIndicator size="small" color={colors.primary} />
                                  <Text style={{ fontSize: 10, color: colors.muted }}>{tx(lang, "Vertalen...", "Translating...", "جاري الترجمة...")}</Text>
                                </View>
                              )}
                              {nameItem.tasfiya && nameItem.tasfiya.length > 0 && (
                                <View style={{ marginBottom: 8 }}>
                                  <Text style={{ fontSize: 11, fontWeight: "700", color: "#2E7D32", marginBottom: 3, textAlign: sectionAlign, writingDirection: lang === "ar" ? "rtl" : "ltr" }}>
                                    {tx(lang, "Tasfiya:", "Tasfiya:", "التصفية:")}
                                  </Text>
                                  {nameItem.tasfiya.map((t: any, i: number) => (
                                    <Text key={i} style={{ fontSize: 11, color: colors.foreground, lineHeight: 20, textAlign: sectionAlign, writingDirection: lang === "ar" ? "rtl" : "ltr", paddingRight: isRTL ? 8 : 0, paddingLeft: isRTL ? 0 : 8 }}>
                                      {"• "}{getTranslatedText(groupKey + "_" + nameKey, `tasfiya_${i}`, t)}
                                    </Text>
                                  ))}
                                </View>
                              )}
                              {nameItem.tazkiya && nameItem.tazkiya.length > 0 && (
                                <View style={{ marginBottom: 8 }}>
                                  <Text style={{ fontSize: 11, fontWeight: "700", color: "#1565C0", marginBottom: 3, textAlign: sectionAlign, writingDirection: lang === "ar" ? "rtl" : "ltr" }}>
                                    {tx(lang, "Tazkiya:", "Tazkiya:", "التزكية:")}
                                  </Text>
                                  {nameItem.tazkiya.map((t: any, i: number) => (
                                    <Text key={i} style={{ fontSize: 11, color: colors.foreground, lineHeight: 20, textAlign: sectionAlign, writingDirection: lang === "ar" ? "rtl" : "ltr", paddingRight: isRTL ? 8 : 0, paddingLeft: isRTL ? 0 : 8 }}>
                                      {"• "}{getTranslatedText(groupKey + "_" + nameKey, `tazkiya_${i}`, t)}
                                    </Text>
                                  ))}
                                </View>
                              )}
                              {nameItem.tarbiya && nameItem.tarbiya.length > 0 && (
                                <View style={{ marginBottom: 8 }}>
                                  <Text style={{ fontSize: 11, fontWeight: "700", color: "#E65100", marginBottom: 3, textAlign: sectionAlign, writingDirection: lang === "ar" ? "rtl" : "ltr" }}>
                                    {tx(lang, "Tarbiya:", "Tarbiya:", "التربية:")}
                                  </Text>
                                  {nameItem.tarbiya.map((t: any, i: number) => (
                                    <Text key={i} style={{ fontSize: 11, color: colors.foreground, lineHeight: 20, textAlign: sectionAlign, writingDirection: lang === "ar" ? "rtl" : "ltr", paddingRight: isRTL ? 8 : 0, paddingLeft: isRTL ? 0 : 8 }}>
                                      {"• "}{getTranslatedText(groupKey + "_" + nameKey, `tarbiya_${i}`, t)}
                                    </Text>
                                  ))}
                                </View>
                              )}
                              {nameItem.examples && nameItem.examples.length > 0 && (
                                <View style={{ backgroundColor: colors.surface, borderRadius: 8, padding: 8 }}>
                                  <Text style={{ fontSize: 11, fontWeight: "700", color: "#6A1B9A", marginBottom: 3, textAlign: sectionAlign, writingDirection: lang === "ar" ? "rtl" : "ltr" }}>
                                    {tx(lang, "Voorbeelden:", "Examples:", "أمثلة:")}
                                  </Text>
                                  {nameItem.examples.map((e: any, i: number) => (
                                    <Text key={i} style={{ fontSize: 11, color: colors.foreground, lineHeight: 20, textAlign: sectionAlign, writingDirection: lang === "ar" ? "rtl" : "ltr", paddingRight: isRTL ? 8 : 0, paddingLeft: isRTL ? 0 : 8 }}>
                                      {"✦ "}{getTranslatedText(groupKey + "_" + nameKey, `examples_${i}`, e)}
                                    </Text>
                                  ))}
                                </View>
                              )}
                            </View>
                          )}
                        </Pressable>
                      );
                    })}
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>
      );
    }
    // Heart stations (age 13-15, 15-18)
    if (currentNames?.heartStations && currentNames.heartStations.length > 0) {
      return (
        <View style={{ gap: 8 }}>
          {/* Practical example */}
          {currentNames.practicalExample && (
            <View style={{ backgroundColor: "#FFF8E1", borderRadius: 12, padding: 14, borderWidth: 1, borderColor: "#FFD54F", marginBottom: 4 }}>
              <Text style={{ fontSize: 14, fontWeight: "700", color: "#E65100", textAlign: sectionAlign, writingDirection: lang === "ar" ? "rtl" : "ltr", marginBottom: 6 }}>
                {tx(lang, "Praktisch voorbeeld:", "Practical example:", "مثال تطبيقي:")} {getText(currentNames.practicalExample.name, lang)}
              </Text>
              {currentNames.practicalExample.ageSpecific?.tasfiya && (
                <View style={{ marginBottom: 6 }}>
                  <Text style={{ fontSize: 11, fontWeight: "600", color: "#2E7D32", textAlign: sectionAlign, writingDirection: lang === "ar" ? "rtl" : "ltr" }}>{tx(lang, "Tasfiya:", "Tasfiya:", "التصفية:")}</Text>
                  {currentNames.practicalExample.ageSpecific.tasfiya.map((t: any, i: number) => (
                    <Text key={i} style={{ fontSize: 11, color: colors.foreground, lineHeight: 18, textAlign: sectionAlign, writingDirection: lang === "ar" ? "rtl" : "ltr" }}>• {getText(t, lang)}</Text>
                  ))}
                </View>
              )}
              {currentNames.practicalExample.ageSpecific?.tarbiya && (
                <View style={{ marginBottom: 6 }}>
                  <Text style={{ fontSize: 11, fontWeight: "600", color: "#E65100", textAlign: sectionAlign, writingDirection: lang === "ar" ? "rtl" : "ltr" }}>{tx(lang, "Tarbiya:", "Tarbiya:", "التربية:")}</Text>
                  {currentNames.practicalExample.ageSpecific.tarbiya.map((t: any, i: number) => (
                    <Text key={i} style={{ fontSize: 11, color: colors.foreground, lineHeight: 18, textAlign: sectionAlign, writingDirection: lang === "ar" ? "rtl" : "ltr" }}>• {getText(t, lang)}</Text>
                  ))}
                </View>
              )}
            </View>
          )}
          {currentNames.heartStations.map((station: any) => {
            const stationKey = getText(station.station, "ar") || getText(station.station, lang);
            const isExpanded = expandedName === stationKey;
            return (
              <Pressable
                key={stationKey}
                onPress={() => {
                  const newKey = isExpanded ? null : stationKey;
                  setExpandedName(newKey);
                  if (newKey && lang !== "ar") translateNameContent(stationKey, station);
                }}
                style={({ pressed }) => [{
                  backgroundColor: colors.surface,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: isExpanded ? "#E65100" + "60" : colors.border,
                  overflow: "hidden",
                  opacity: pressed ? 0.85 : 1,
                }]}
              >
                <View style={{ padding: 14, flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", justifyContent: "space-between" }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: "700", color: "#E65100", textAlign: sectionAlign, writingDirection: lang === "ar" ? "rtl" : "ltr" }}>{getTranslatedText(stationKey, "station", station.station)}</Text>
                    {station.meaning && (
                      <Text style={{ fontSize: 11, color: colors.muted, marginTop: 3, textAlign: sectionAlign, writingDirection: lang === "ar" ? "rtl" : "ltr", lineHeight: 18 }}>{getTranslatedText(stationKey, "meaning", station.meaning)}</Text>
                    )}
                  </View>
                  <Text style={{ fontSize: 12, color: colors.muted }}>{isExpanded ? "▲" : "▼"}</Text>
                </View>
                {isExpanded && (
                  <View style={{ paddingHorizontal: 14, paddingBottom: 14, borderTopWidth: 0.5, borderTopColor: colors.border, paddingTop: 10 }}>
                    {translatingName === stationKey && lang !== "ar" && (
                      <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", marginBottom: 6, gap: 4 }}>
                        <ActivityIndicator size="small" color={colors.primary} />
                        <Text style={{ fontSize: 10, color: colors.muted }}>{tx(lang, "Vertalen...", "Translating...", "جاري الترجمة...")}</Text>
                      </View>
                    )}
                    {station.method && (
                      <View style={{ marginBottom: 8 }}>
                        <Text style={{ fontSize: 12, fontWeight: "600", color: "#2E7D32", textAlign: sectionAlign, writingDirection: lang === "ar" ? "rtl" : "ltr" }}>{tx(lang, "Methode:", "Method:", "الأسلوب:")}</Text>
                        <Text style={{ fontSize: 12, color: colors.foreground, lineHeight: 20, textAlign: sectionAlign, writingDirection: lang === "ar" ? "rtl" : "ltr" }}>{getTranslatedText(stationKey, "method", station.method)}</Text>
                      </View>
                    )}
                    {station.evidence && (
                      <View style={{ backgroundColor: colors.background, borderRadius: 8, padding: 8 }}>
                        <Text style={{ fontSize: 12, color: colors.primary, lineHeight: 20, textAlign: sectionAlign, writingDirection: lang === "ar" ? "rtl" : "ltr", fontStyle: "italic" }}>
                          ﴿ {getTranslatedText(stationKey, "evidence", station.evidence)} ﴾
                        </Text>
                      </View>
                    )}
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>
      );
    }
    return <Text style={{ color: colors.muted, textAlign: "center", marginTop: 20 }}>{tx(lang, "Geen data", "No data", "لا توجد بيانات")}</Text>;
  };

  const renderConcepts = () => (
    <View style={{ gap: 8 }}>
      {allConcepts.map((item: any) => {
        const isExpanded = expandedConcept === item.id;
        return (
          <Pressable
            key={item.id}
            onPress={() => setExpandedConcept(isExpanded ? null : item.id)}
            style={({ pressed }) => [{
              backgroundColor: colors.surface,
              borderWidth: 1,
              borderColor: isExpanded ? "#1565C0" + "60" : colors.border,
              borderRadius: 10,
              overflow: "hidden",
              opacity: pressed ? 0.9 : 1,
            }]}
          >
            <View style={{ padding: 12, flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center" }}>
              <Text style={{ fontSize: 20, marginLeft: isRTL ? 10 : 0, marginRight: isRTL ? 0 : 10 }}>{getConceptIcon(item.category)}</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.foreground, fontSize: 14, fontWeight: "700", textAlign: sectionAlign, writingDirection: lang === "ar" ? "rtl" : "ltr", lineHeight: 22 }} numberOfLines={isExpanded ? undefined : 2}>
                  {getConceptName(item, lang)}
                </Text>
                <View style={{ flexDirection: isRTL ? "row-reverse" : "row", marginTop: 3 }}>
                  <View style={{ backgroundColor: "#1565C0" + "15", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 }}>
                    <Text style={{ fontSize: 9, fontWeight: "600", color: "#1565C0" }}>{getConceptCategoryLabel(item.category, lang)}</Text>
                  </View>
                </View>
              </View>
              <Text style={{ color: "#1565C0", fontSize: 10 }}>{isExpanded ? "▲" : "▼"}</Text>
            </View>
            {isExpanded && (
              <View style={{ paddingHorizontal: 12, paddingBottom: 12, borderTopWidth: 0.5, borderTopColor: colors.border, paddingTop: 10 }}>
                {/* Description */}
                <Text style={{ color: colors.foreground, fontSize: 12, lineHeight: 22, textAlign: sectionAlign, writingDirection: lang === "ar" ? "rtl" : "ltr", marginBottom: 10 }}>
                  {getConceptDesc(item, lang)}
                </Text>
                {/* Evidence */}
                {getConceptSource(item, lang) ? (
                  <View style={{ backgroundColor: "#FFFBEB", borderRadius: 8, padding: 10, marginBottom: 8 }}>
                    <Text style={{ color: "#92400E", fontSize: 11, fontWeight: "700", marginBottom: 3, textAlign: sectionAlign, writingDirection: lang === "ar" ? "rtl" : "ltr" }}>
                      {tx(lang, "BEWIJS:", "EVIDENCE:", "الدليل:")}
                    </Text>
                    <Text style={{ color: "#78350F", fontSize: 12, lineHeight: 20, textAlign: sectionAlign, writingDirection: lang === "ar" ? "rtl" : "ltr", fontStyle: "italic" }}>
                      {getConceptSource(item, lang)}
                    </Text>
                  </View>
                ) : null}
                {/* Scholar */}
                {getConceptScholar(item, lang) ? (
                  <View style={{ backgroundColor: "#F3E5F5", borderRadius: 8, padding: 10 }}>
                    <Text style={{ color: "#6A1B9A", fontSize: 11, fontWeight: "700", marginBottom: 3, textAlign: sectionAlign, writingDirection: lang === "ar" ? "rtl" : "ltr" }}>
                      {tx(lang, "GELEERDE:", "SCHOLAR:", "العالِم:")}
                    </Text>
                    <Text style={{ color: "#4A148C", fontSize: 12, lineHeight: 20, textAlign: sectionAlign, writingDirection: lang === "ar" ? "rtl" : "ltr" }}>
                      {getConceptScholar(item, lang)}
                    </Text>
                  </View>
                ) : null}
              </View>
            )}
          </Pressable>
        );
      })}
    </View>
  );

  const renderDetail = () => (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 40 }}>
      {/* Back button */}
      <Pressable onPress={goBack} style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1, marginBottom: 10 }]}>
        <Text style={{ color: colors.primary, fontSize: 13, fontWeight: "600", textAlign: sectionAlign, writingDirection: lang === "ar" ? "rtl" : "ltr" }}>
          {isRTL ? "❯" : "❮"} {tx(lang, "Alle leeftijdsfasen", "All age phases", "جميع الفئات العمرية")}
        </Text>
      </Pressable>

      {/* Group header */}
      <View style={{ backgroundColor: colors.primary + "10", borderRadius: 14, padding: 14, borderWidth: 1, borderColor: colors.primary + "25", marginBottom: 14 }}>
        <Text style={{ color: colors.primary, fontSize: 18, fontWeight: "800", textAlign: sectionAlign, writingDirection: lang === "ar" ? "rtl" : "ltr" }}>{getText(currentFitrah?.title, lang)}</Text>
        <Text style={{ color: colors.foreground, fontSize: 12, fontWeight: "600", marginTop: 3, textAlign: sectionAlign, writingDirection: lang === "ar" ? "rtl" : "ltr" }}>{getText(currentFitrah?.subtitle, lang)}</Text>
        <Text style={{ color: colors.muted, fontSize: 11, marginTop: 6, lineHeight: 18, textAlign: sectionAlign, writingDirection: lang === "ar" ? "rtl" : "ltr" }}>{getText(currentFitrah?.description, lang)}</Text>
      </View>

      {/* Section tabs */}
      {renderSectionTabs()}

      {/* Section content */}
      {sectionTab === "traits" && renderTraits()}
      {sectionTab === "hearts" && renderHearts()}
      {sectionTab === "names" && renderNames()}
      {sectionTab === "concepts" && renderConcepts()}
      {sectionTab === "misconceptions" && renderMisconceptions()}
    </ScrollView>
  );

  // === Load misconceptions from API ===
  useEffect(() => {
    if (misconceptions.length === 0 && !misconceptionsLoading) {
      setMisconceptionsLoading(true);
      const baseUrl = getApiBaseUrl();
      authedFetch(`/api/misconceptions`)
        .then(r => r.json())
        .then(data => { if (Array.isArray(data)) setMisconceptions(data); setMisconceptionsLoading(false); })
        .catch(() => setMisconceptionsLoading(false));
    }
  }, []);

  const renderMisconceptions = () => {
    if (misconceptionsLoading) {
      return <ActivityIndicator size="large" color="#B71C1C" style={{ marginTop: 40 }} />;
    }

    // Separate age-based from topic-based misconceptions
    const AGE_GROUPS = ["الفطرة (٠–٧ سنوات)", "التمييز (٧–١٠ سنوات)", "التهيئة للبلوغ (١٢–١٤ سنة)", "التأسيس والزواج (١٦+ سنة)"];
    const ageGrouped: Record<string, any[]> = {};
    const topicGrouped: Record<string, any[]> = {};

    misconceptions.forEach((m: any) => {
      const key = m.age_group || "general";
      if (AGE_GROUPS.includes(key)) {
        if (!ageGrouped[key]) ageGrouped[key] = [];
        ageGrouped[key].push(m);
      } else {
        if (!topicGrouped[key]) topicGrouped[key] = [];
        topicGrouped[key].push(m);
      }
    });

    return (
      <View style={{ gap: 16 }}>
        <Text style={{ fontSize: 14, color: colors.muted, textAlign: sectionAlign, writingDirection: lang === "ar" ? "rtl" : "ltr", marginBottom: 4 }}>
          {tx(lang, "Veelvoorkomende misvattingen over opvoeding en hun weerlegging vanuit Qur'aan en Soennah", "Common misconceptions about parenting and their refutation from Qur'aan and Sunnah", "الشبهات المنتشرة حول التربية وردودها من القرآن والسنة")}
        </Text>

        {/* Age-based misconceptions */}
        {AGE_GROUPS.filter(g => ageGrouped[g]?.length > 0).map((groupName) => (
          <View key={groupName} style={{ marginBottom: 12 }}>
            <View style={{ backgroundColor: "#FFEBEE", borderRadius: 10, padding: 10, marginBottom: 8 }}>
              <Text style={{ fontSize: 14, fontWeight: "700", color: "#B71C1C", textAlign: sectionAlign, writingDirection: lang === "ar" ? "rtl" : "ltr" }}>
                {groupName} ({ageGrouped[groupName].length})
              </Text>
            </View>
            {ageGrouped[groupName].map((item: any) => {
              const isExpanded = expandedMisconception === item.id;
              const misconceptionText = lang === "ar" ? item.misconception_ar : lang === "nl" ? item.misconception_nl : item.misconception_en;
              const clarificationText = lang === "ar" ? item.clarification_ar : lang === "nl" ? item.clarification_nl : item.clarification_en;
              const refutationText = lang === "ar" ? item.refutation_ar : lang === "nl" ? item.refutation_nl : item.refutation_en;
              const evidencesText = lang === "ar" ? item.evidences_ar : lang === "nl" ? item.evidences_nl : item.evidences_en;
              const practicalText = lang === "ar" ? item.practical_benefits_ar : lang === "nl" ? item.practical_benefits_nl : item.practical_benefits_en;

              return (
                <Pressable
                  key={item.id}
                  onPress={() => setExpandedMisconception(isExpanded ? null : item.id)}
                  style={({ pressed }) => [{
                    backgroundColor: "#FFFFFF",
                    borderRadius: 12,
                    padding: 14,
                    marginBottom: 8,
                    borderWidth: 1,
                    borderColor: isExpanded ? "#B71C1C" : "#E5E7EB",
                    opacity: pressed ? 0.95 : 1,
                  }]}
                >
                  <Text style={{ fontSize: 14, fontWeight: "600", color: "#B71C1C", textAlign: sectionAlign, writingDirection: lang === "ar" ? "rtl" : "ltr", lineHeight: 22 }}>
                    {misconceptionText}
                  </Text>
                  {isExpanded && (
                    <View style={{ marginTop: 12, gap: 12 }}>
                      {clarificationText ? (
                        <View style={{ backgroundColor: "#FFF8E1", borderRadius: 8, padding: 10 }}>
                          <Text style={{ fontSize: 12, fontWeight: "700", color: "#F57F17", marginBottom: 4, textAlign: sectionAlign, writingDirection: lang === "ar" ? "rtl" : "ltr" }}>
                            {tx(lang, "Hun bewering", "Their claim", "زعمهم")}
                          </Text>
                          <Text style={{ fontSize: 13, color: "#333", textAlign: sectionAlign, writingDirection: lang === "ar" ? "rtl" : "ltr", lineHeight: 20 }}>{clarificationText}</Text>
                        </View>
                      ) : null}
                      {refutationText ? (
                        <View style={{ backgroundColor: "#E8F5E9", borderRadius: 8, padding: 10 }}>
                          <Text style={{ fontSize: 12, fontWeight: "700", color: "#2E7D32", marginBottom: 4, textAlign: sectionAlign, writingDirection: lang === "ar" ? "rtl" : "ltr" }}>
                            {tx(lang, "Weerlegging", "Refutation", "الرد")}
                          </Text>
                          <Text style={{ fontSize: 13, color: "#333", textAlign: sectionAlign, writingDirection: lang === "ar" ? "rtl" : "ltr", lineHeight: 20 }}>{refutationText}</Text>
                        </View>
                      ) : null}
                      {evidencesText ? (
                        <View style={{ backgroundColor: "#E3F2FD", borderRadius: 8, padding: 10 }}>
                          <Text style={{ fontSize: 12, fontWeight: "700", color: "#1565C0", marginBottom: 4, textAlign: sectionAlign, writingDirection: lang === "ar" ? "rtl" : "ltr" }}>
                            {tx(lang, "Bewijzen", "Evidences", "الأدلة")}
                          </Text>
                          <Text style={{ fontSize: 13, color: "#333", textAlign: sectionAlign, writingDirection: lang === "ar" ? "rtl" : "ltr", lineHeight: 20 }}>{evidencesText}</Text>
                        </View>
                      ) : null}
                      {practicalText ? (
                        <View style={{ backgroundColor: "#F3E5F5", borderRadius: 8, padding: 10 }}>
                          <Text style={{ fontSize: 12, fontWeight: "700", color: "#6A1B9A", marginBottom: 4, textAlign: sectionAlign, writingDirection: lang === "ar" ? "rtl" : "ltr" }}>
                            {tx(lang, "Praktisch voordeel", "Practical benefit", "الفائدة العملية")}
                          </Text>
                          <Text style={{ fontSize: 13, color: "#333", textAlign: sectionAlign, writingDirection: lang === "ar" ? "rtl" : "ltr", lineHeight: 20 }}>{practicalText}</Text>
                        </View>
                      ) : null}
                    </View>
                  )}
                </Pressable>
              );
            })}
          </View>
        ))}

        {/* Topic-based misconceptions (general list) */}
        {Object.entries(topicGrouped).map(([groupName, items]) => (
          <View key={groupName} style={{ marginBottom: 12 }}>
            <View style={{ backgroundColor: "#FFF3E0", borderRadius: 10, padding: 10, marginBottom: 8 }}>
              <Text style={{ fontSize: 14, fontWeight: "700", color: "#E65100", textAlign: sectionAlign, writingDirection: lang === "ar" ? "rtl" : "ltr" }}>
                {groupName} ({items.length})
              </Text>
            </View>
            {items.map((item: any) => {
              const isExpanded = expandedMisconception === item.id;
              const misconceptionText = lang === "ar" ? item.misconception_ar : lang === "nl" ? item.misconception_nl : item.misconception_en;
              const clarificationText = lang === "ar" ? item.clarification_ar : lang === "nl" ? item.clarification_nl : item.clarification_en;
              const refutationText = lang === "ar" ? item.refutation_ar : lang === "nl" ? item.refutation_nl : item.refutation_en;
              const evidencesText = lang === "ar" ? item.evidences_ar : lang === "nl" ? item.evidences_nl : item.evidences_en;
              const practicalText = lang === "ar" ? item.practical_benefits_ar : lang === "nl" ? item.practical_benefits_nl : item.practical_benefits_en;

              return (
                <Pressable
                  key={item.id}
                  onPress={() => setExpandedMisconception(isExpanded ? null : item.id)}
                  style={({ pressed }) => [{
                    backgroundColor: "#FFFFFF",
                    borderRadius: 12,
                    padding: 14,
                    marginBottom: 8,
                    borderWidth: 1,
                    borderColor: isExpanded ? "#B71C1C" : "#E5E7EB",
                    opacity: pressed ? 0.95 : 1,
                  }]}
                >
                  {/* Misconception title */}
                  <Text style={{ fontSize: 14, fontWeight: "600", color: "#B71C1C", textAlign: sectionAlign, writingDirection: lang === "ar" ? "rtl" : "ltr", lineHeight: 22 }}>
                    {misconceptionText}
                  </Text>

                  {isExpanded && (
                    <View style={{ marginTop: 12, gap: 12 }}>
                      {/* Their claim */}
                      {clarificationText ? (
                        <View style={{ backgroundColor: "#FFF8E1", borderRadius: 8, padding: 10 }}>
                          <Text style={{ fontSize: 11, fontWeight: "700", color: "#E65100", marginBottom: 4 }}>
                            {tx(lang, "Hun bewering", "Their claim", "زعمهم")}
                          </Text>
                          <Text style={{ fontSize: 13, color: "#374151", lineHeight: 20, textAlign: sectionAlign, writingDirection: lang === "ar" ? "rtl" : "ltr" }}>
                            {clarificationText}
                          </Text>
                        </View>
                      ) : null}

                      {/* Refutation */}
                      {refutationText ? (
                        <View style={{ backgroundColor: "#E8F5E9", borderRadius: 8, padding: 10 }}>
                          <Text style={{ fontSize: 11, fontWeight: "700", color: "#1B5E20", marginBottom: 4 }}>
                            {tx(lang, "Weerlegging", "Refutation", "تصحيح التصور")}
                          </Text>
                          <Text style={{ fontSize: 13, color: "#374151", lineHeight: 20, textAlign: sectionAlign, writingDirection: lang === "ar" ? "rtl" : "ltr" }}>
                            {refutationText}
                          </Text>
                        </View>
                      ) : null}

                      {/* Evidence */}
                      {evidencesText ? (
                        <View style={{ backgroundColor: "#E3F2FD", borderRadius: 8, padding: 10 }}>
                          <Text style={{ fontSize: 11, fontWeight: "700", color: "#0D47A1", marginBottom: 4 }}>
                            {tx(lang, "Bewijs uit Qur'aan & Soennah", "Evidence from Qur'aan & Sunnah", "الدليل من الكتاب والسنة")}
                          </Text>
                          <Text style={{ fontSize: 13, color: "#374151", lineHeight: 20, textAlign: sectionAlign, writingDirection: lang === "ar" ? "rtl" : "ltr" }}>
                            {evidencesText}
                          </Text>
                        </View>
                      ) : null}

                      {/* Practical benefits */}
                      {practicalText ? (
                        <View style={{ backgroundColor: "#F3E5F5", borderRadius: 8, padding: 10 }}>
                          <Text style={{ fontSize: 11, fontWeight: "700", color: "#4A148C", marginBottom: 4 }}>
                            {tx(lang, "Praktische toepassing", "Practical application", "التطبيق العملي")}
                          </Text>
                          <Text style={{ fontSize: 13, color: "#374151", lineHeight: 20, textAlign: sectionAlign, writingDirection: lang === "ar" ? "rtl" : "ltr" }}>
                            {practicalText}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  )}
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>
    );
  };

  const renderFavoritesList = () => {
    // Collect all favorited items
    const favItems: { type: string; groupIndex: number; item: any; idx?: number }[] = [];
    fitrahGroups.forEach((group, gi) => {
      group.fitrahTraits?.forEach((item: any, idx: number) => {
        if (favorites.includes(getFavoriteId("trait", gi, item, idx))) {
          favItems.push({ type: "trait", groupIndex: gi, item, idx });
        }
      });
      group.heartActions?.forEach((item: any) => {
        if (favorites.includes(getFavoriteId("heart", gi, item))) {
          favItems.push({ type: "heart", groupIndex: gi, item });
        }
      });
    });
    namesGroups.forEach((group, gi) => {
      group.names?.forEach((item: any) => {
        if (favorites.includes(getFavoriteId("name", gi, item))) {
          favItems.push({ type: "name", groupIndex: gi, item });
        }
      });
      group.heartStations?.forEach((item: any) => {
        if (favorites.includes(getFavoriteId("station", gi, item))) {
          favItems.push({ type: "station", groupIndex: gi, item });
        }
      });
    });

    if (favItems.length === 0) {
      return (
        <View style={{ alignItems: "center", paddingTop: 40 }}>
          <Text style={{ color: colors.muted, fontSize: 13 }}>
            {tx(lang, "Geen favorieten opgeslagen", "No favorites saved", "لا توجد مفضلات محفوظة")}
          </Text>
        </View>
      );
    }

    return (
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 40, gap: 8 }}>
        {favItems.map((fav, idx) => (
          <View key={idx} style={{ backgroundColor: colors.surface, borderRadius: 10, borderWidth: 1, borderColor: colors.border, padding: 12 }}>
            <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 8 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: fav.type === "trait" ? colors.success : fav.type === "heart" ? "#6A1B9A" : "#E65100" }} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.foreground, fontSize: 13, fontWeight: "600", textAlign: sectionAlign, writingDirection: lang === "ar" ? "rtl" : "ltr", lineHeight: 20 }} numberOfLines={2}>
                  {fav.type === "trait" ? getText(fav.item.trait, lang) : fav.type === "heart" ? getText(fav.item.title, lang) : fav.type === "name" ? fav.item.name : getText(fav.item.station, lang)}
                </Text>
                <Text style={{ color: colors.muted, fontSize: 10, marginTop: 2, textAlign: sectionAlign, writingDirection: lang === "ar" ? "rtl" : "ltr" }}>
                  {getText(fitrahGroups[fav.groupIndex]?.title, lang)}
                </Text>
                {(fav.type === "trait" && fav.item.method) && (
                  <Text style={{ color: colors.muted, fontSize: 11, marginTop: 4, textAlign: sectionAlign, writingDirection: lang === "ar" ? "rtl" : "ltr", lineHeight: 18 }} numberOfLines={3}>
                    {getText(fav.item.method, lang)}
                  </Text>
                )}
              </View>
              <Pressable
                onPress={() => toggleFavorite(getFavoriteId(fav.type, fav.groupIndex, fav.item, fav.idx))}
                style={{ padding: 6 }}
              >
                <Text style={{ fontSize: 16 }}>❤️</Text>
              </Pressable>
            </View>
          </View>
        ))}
      </ScrollView>
    );
  };

  const renderSearchResults = () => {
    if (!searchResults || searchResults.length === 0) {
      return (
        <View style={{ alignItems: "center", paddingTop: 40 }}>
          <Text style={{ color: colors.muted, fontSize: 13 }}>
            {tx(lang, "Geen resultaten gevonden", "No results found", "لم يتم العثور على نتائج")}
          </Text>
        </View>
      );
    }
    return (
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 40, gap: 8 }}>
        <Text style={{ color: colors.muted, fontSize: 11, textAlign: sectionAlign, writingDirection: lang === "ar" ? "rtl" : "ltr", marginBottom: 4 }}>
          {searchResults.length} {tx(lang, "resultaten", "results", "نتيجة")}
        </Text>
        {searchResults.slice(0, 50).map((result, idx) => (
          <Pressable
            key={idx}
            onPress={() => {
              setSearchQuery("");
              if (result.type === "concept") {
                selectGroup(0);
                setSectionTab("concepts");
              } else {
                selectGroup(result.groupIndex);
                if (result.type === "trait") setSectionTab("traits");
                else if (result.type === "heart") setSectionTab("hearts");
                else setSectionTab("names");
              }
            }}
            style={({ pressed }) => [{
              backgroundColor: colors.surface,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: colors.border,
              padding: 12,
              opacity: pressed ? 0.85 : 1,
            }]}
          >
            <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 8 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: result.type === "trait" ? colors.success : result.type === "heart" ? "#6A1B9A" : result.type === "concept" ? "#1565C0" : "#E65100" }} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.foreground, fontSize: 13, fontWeight: "600", textAlign: sectionAlign, writingDirection: lang === "ar" ? "rtl" : "ltr", lineHeight: 20 }} numberOfLines={2}>
                  {result.type === "trait" ? getText(result.item.trait, lang) : result.type === "heart" ? getText(result.item.title, lang) : result.type === "concept" ? getConceptName(result.item, lang) : result.type === "name" ? result.item.name : getText(result.item.station, lang)}
                </Text>
                <Text style={{ color: colors.muted, fontSize: 10, marginTop: 2, textAlign: sectionAlign, writingDirection: lang === "ar" ? "rtl" : "ltr" }}>
                  {result.type === "concept" ? getConceptCategoryLabel(result.item.category, lang) : getText(fitrahGroups[result.groupIndex]?.title, lang)} • {result.type === "trait" ? tx(lang, "Eigenschap", "Trait", "خصلة") : result.type === "heart" ? tx(lang, "Hartactie", "Heart action", "منزلة") : result.type === "concept" ? tx(lang, "Begrip", "Concept", "مفهوم") : result.type === "name" ? tx(lang, "Naam", "Name", "اسم") : tx(lang, "Station", "Station", "منزلة")}
                </Text>
              </View>
            </View>
          </Pressable>
        ))}
      </ScrollView>
    );
  };

  return (
    
    <ScreenContainer className="px-4 pt-4">
      {/* Header */}
      <View style={{ marginBottom: 12 }}>
        <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={{ color: colors.foreground, fontSize: 20, fontWeight: "800", textAlign: sectionAlign, writingDirection: lang === "ar" ? "rtl" : "ltr" }}>
            {tx(lang, "Fitrah & Tawhied", "Fitrah & Tawheed", "الفطرة والتوحيد")}
          </Text>
          <Pressable
            onPress={() => router.push("/content/fitrah" as any)}
            style={({ pressed }) => [{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 4, paddingVertical: 4, paddingHorizontal: 8, borderRadius: 8, backgroundColor: colors.success + "12", opacity: pressed ? 0.7 : 1 }]}
          >
            <Text style={{ fontSize: 11, color: colors.success, fontWeight: "600" }}>
              {tx(lang, "Artikelen", "Articles", "مقالات")}
            </Text>
          </Pressable>
        </View>
        <Text style={{ color: colors.muted, fontSize: 11, marginTop: 3, textAlign: sectionAlign, writingDirection: lang === "ar" ? "rtl" : "ltr", lineHeight: 18 }}>
          {tx(lang, "Kenmerken, manazil en Namen van Allaah per leeftijdsfase", "Traits, manazil and Names of Allaah per age phase", "خصال الفطرة ومنازل القلوب وأسماء الله حسب الفئة العمرية")}
        </Text>
      </View>

      {/* Search bar + favorites toggle */}
      <View style={{ marginBottom: 12, gap: 8 }}>
        <TextInput
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder={tx(lang, "Zoek eigenschap, naam of methode...", "Search trait, name or method...", "ابحث عن خصلة أو اسم أو طريقة...")}
          placeholderTextColor={colors.muted}
          style={{
            backgroundColor: colors.surface,
            borderRadius: 10,
            borderWidth: 1,
            borderColor: colors.border,
            paddingHorizontal: 14,
            paddingVertical: 10,
            fontSize: 13,
            color: colors.foreground,
            textAlign: sectionAlign, writingDirection: lang === "ar" ? "rtl" : "ltr",
          }}
          returnKeyType="search"
        />
        {favorites.length > 0 && (
          <Pressable
            onPress={() => setShowFavorites(!showFavorites)}
            style={({ pressed }) => [{
              flexDirection: isRTL ? "row-reverse" : "row",
              alignItems: "center",
              gap: 6,
              alignSelf: isRTL ? "flex-end" : "flex-start",
              backgroundColor: showFavorites ? colors.primary + "15" : "transparent",
              paddingHorizontal: 10,
              paddingVertical: 5,
              borderRadius: 8,
              opacity: pressed ? 0.7 : 1,
            }]}
          >
            <Text style={{ fontSize: 13 }}>❤️</Text>
            <Text style={{ color: showFavorites ? colors.primary : colors.muted, fontSize: 12, fontWeight: "600" }}>
              {tx(lang, "Favorieten", "Favorites", "المفضلة")} ({favorites.length})
            </Text>
          </Pressable>
        )}
      </View>

      {searchQuery.trim() ? renderSearchResults() : showFavorites ? renderFavoritesList() : (viewMode === "list" ? renderAgeGroupList() : renderDetail())}
    </ScreenContainer>
    
  );
}
