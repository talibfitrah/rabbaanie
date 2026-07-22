import { useState, useCallback, useRef } from "react";
import { FlatList, Text, View, Pressable, ActivityIndicator } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useI18n } from "@/lib/i18n";
import { trpc } from "@/lib/trpc";
import knowledgeBase from "@/assets/data/mawsouah_knowledge.json";

interface Mindset {
  id: string;
  title: string;
  titleNL: string;
  titleEN?: string;
  titleAR?: string;
  description: string;
  descriptionNL: string;
  descriptionEN?: string;
  descriptionAR?: string;
  principle: string;
  principleNL?: string;
  principleEN?: string;
  principleAR?: string;
  evidence: string;
  application: string;
  applicationNL?: string;
  applicationEN?: string;
  applicationAR?: string;
}

export default function MindsetsScreen() {
  const colors = useColors();
  const { t, language: lang, isRTL } = useI18n();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const mindsets = knowledgeBase.mindsets as Mindset[];

  // Translation state
  const [translations, setTranslations] = useState<Record<string, Record<string, string>>>({});
  const [translatingId, setTranslatingId] = useState<string | null>(null);
  const translateMutation = trpc.translate.translateTexts.useMutation();
  const translatingRef = useRef<Set<string>>(new Set());
  const translationsRef = useRef<Record<string, Record<string, string>>>({});
  translationsRef.current = translations;

  // Translate a mindset's content when expanded and lang != ar
  const translateMindset = useCallback(async (item: Mindset) => {
    if (lang === "ar") return;
    const cacheKey = `${item.id}:${lang}`;
    if (translationsRef.current[cacheKey] || translatingRef.current.has(cacheKey)) return;
    translatingRef.current.add(cacheKey);
    setTranslatingId(item.id);

    // Collect Arabic texts that need translation
    const texts: string[] = [];
    const keys: string[] = [];

    // Only translate fields that don't already have a translation in the data
    if (lang === "nl") {
      // For Dutch: description might already have descriptionNL, but evidence/application might not
      if (!item.descriptionNL && item.description) { texts.push(item.description); keys.push("description"); }
      if (item.evidence) { texts.push(item.evidence); keys.push("evidence"); }
      if (!item.applicationEN && item.application) { texts.push(item.application); keys.push("application"); }
      if (item.principle && !item.principleEN) { texts.push(item.principle); keys.push("principle"); }
    } else {
      // For English
      if (!item.descriptionEN && item.description) { texts.push(item.description); keys.push("description"); }
      if (item.evidence) { texts.push(item.evidence); keys.push("evidence"); }
      if (!item.applicationEN && item.application) { texts.push(item.application); keys.push("application"); }
      if (!item.principleEN && item.principle) { texts.push(item.principle); keys.push("principle"); }
    }

    if (texts.length === 0) { setTranslatingId(null); translatingRef.current.delete(cacheKey); return; }

    try {
      const result: Record<string, string> = {};
      for (let i = 0; i < texts.length; i += 20) {
        const batch = texts.slice(i, i + 20);
        const batchKeys = keys.slice(i, i + 20);
        const res = await translateMutation.mutateAsync({
          texts: batch,
          targetLang: lang as "nl" | "en",
          context: "Islamic parenting education - Mindsets and principles",
          category: "mindsets",
        });
        res.translations.forEach((t: string, idx: number) => {
          result[batchKeys[idx]] = t;
        });
      }
      setTranslations(prev => ({ ...prev, [cacheKey]: result }));
    } catch (e) {
      console.warn("Translation failed for mindset", item.id, e);
    } finally {
      setTranslatingId(null);
      translatingRef.current.delete(cacheKey);
    }
  }, [lang, translateMutation]);

  const toggle = (id: string, item: Mindset) => {
    const newExpanded = expandedId === id ? null : id;
    setExpandedId(newExpanded);
    if (newExpanded && lang !== "ar") {
      translateMindset(item);
    }
  };

  // Helper to get translated text
  const getTranslated = (item: Mindset, field: string): string => {
    if (lang === "ar") {
      // Return Arabic version
      if (field === "description") return item.descriptionAR || item.description;
      if (field === "evidence") return item.evidence;
      if (field === "application") return item.applicationAR || item.application;
      if (field === "principle") return item.principleAR || item.principle;
      return "";
    }
    // Check our on-demand translation cache
    const cacheKey = `${item.id}:${lang}`;
    const cached = translations[cacheKey];
    if (cached && cached[field]) return cached[field];
    // Fallback to pre-existing translations in data
    if (lang === "en") {
      if (field === "description") return item.descriptionEN || item.descriptionNL || item.description;
      if (field === "application") return item.applicationEN || item.application;
      if (field === "principle") return item.principleEN || item.principle;
    } else {
      // Dutch
      if (field === "description") return item.descriptionNL || item.description;
      if (field === "application") return item.applicationNL || item.application;
      if (field === "principle") return item.principleNL || item.principle;
    }
    if (field === "evidence") return item.evidence;
    return "";
  };

  const renderMindset = ({ item }: { item: Mindset }) => {
    const isExpanded = expandedId === item.id;
    const isTranslating = translatingId === item.id;
    return (
      <Pressable
        onPress={() => toggle(item.id, item)}
        style={({ pressed }) => [
          {
            backgroundColor: colors.surface,
            borderRadius: 16,
            marginBottom: 12,
            padding: 16,
            ...(isRTL ? { borderRightWidth: 4, borderRightColor: "#7C3AED" } : { borderLeftWidth: 4, borderLeftColor: "#7C3AED" }),
            opacity: pressed ? 0.9 : 1,
            transform: [{ scale: pressed ? 0.98 : 1 }],
          },
        ]}
      >
        {/* Header */}
        <View style={{ flexDirection: isRTL ? "row-reverse" : "row", justifyContent: "space-between", alignItems: "center" }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground, marginBottom: 2, textAlign: isRTL ? "right" : "left" }}>
              {lang === "ar" ? (item.titleAR || item.title) : lang === "en" ? (item.titleEN || item.titleNL) : item.titleNL}
            </Text>
            {lang !== "ar" && (
            <Text style={{ fontSize: 14, color: colors.muted, fontFamily: "System" }}>
              {item.title}
            </Text>
            )}
          </View>
          <Text style={{ fontSize: 18, color: colors.muted }}>
            {isExpanded ? "\u25b2" : "\u25bc"}
          </Text>
        </View>

        {/* Principle (always visible) */}
        <View style={{ marginTop: 8, backgroundColor: "#7C3AED15", borderRadius: 8, padding: 10 }}>
          <Text style={{ fontSize: 13, fontWeight: "600", color: "#7C3AED", textAlign: isRTL ? "right" : "left" }}>
            {getTranslated(item, "principle")}
          </Text>
        </View>

        {/* Expanded content */}
        {isExpanded && (
          <View style={{ marginTop: 12, gap: 10 }}>
            {/* Translation loading indicator */}
            {isTranslating && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, padding: 8, backgroundColor: "#7C3AED10", borderRadius: 8 }}>
                <ActivityIndicator size="small" color="#7C3AED" />
                <Text style={{ fontSize: 12, color: "#7C3AED" }}>
                  {lang === "nl" ? "Vertalen..." : "Translating..."}
                </Text>
              </View>
            )}

            {/* Description */}
            <View>
              <Text style={{ fontSize: 12, fontWeight: "600", color: colors.muted, marginBottom: 4 }}>
                {t("mindsets.explanation")}
              </Text>
              <Text style={{ fontSize: 13, color: colors.foreground, lineHeight: 20, textAlign: isRTL ? "right" : "left" }}>
                {getTranslated(item, "description")}
              </Text>
            </View>

            {/* Arabic description - only show separately when not already in Arabic mode */}
            {lang !== "ar" && (
            <View style={{ backgroundColor: colors.background, borderRadius: 8, padding: 10 }}>
              <Text style={{ fontSize: 14, color: colors.foreground, textAlign: "right", writingDirection: "rtl", lineHeight: 24, fontFamily: "System" }}>
                {item.description}
              </Text>
            </View>
            )}

            {/* Evidence */}
            <View style={{ backgroundColor: "#059669" + "15", borderRadius: 8, padding: 10 }}>
              <Text style={{ fontSize: 12, fontWeight: "600", color: "#059669", marginBottom: 4 }}>
                {t("mindsets.evidence")}
              </Text>
              <Text style={{ fontSize: 13, color: colors.foreground, lineHeight: 20, fontFamily: "System" }}>
                {getTranslated(item, "evidence")}
              </Text>
            </View>

            {/* Application */}
            <View style={{ backgroundColor: "#2563EB" + "15", borderRadius: 8, padding: 10 }}>
              <Text style={{ fontSize: 12, fontWeight: "600", color: "#2563EB", marginBottom: 4 }}>
                {t("mindsets.application")}
              </Text>
              <Text style={{ fontSize: 13, color: colors.foreground, lineHeight: 20, textAlign: isRTL ? "right" : "left" }}>
                {getTranslated(item, "application")}
              </Text>
            </View>
          </View>
        )}
      </Pressable>
    );
  };

  return (
    <ScreenContainer className="px-4 pt-4">
      {/* Header */}
      <View style={{ marginBottom: 16 }}>
        <Text style={{ fontSize: 24, fontWeight: "800", color: colors.foreground }}>
          {t("mindsets.title")}
        </Text>
        <Text style={{ fontSize: 13, color: colors.muted, marginTop: 4 }}>
          {t("mindsets.subtitle")}
        </Text>
      </View>

      {/* Source badge */}
      <View style={{ backgroundColor: "#7C3AED15", borderRadius: 8, padding: 10, marginBottom: 16, flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center" }}>
        <Text style={{ fontSize: 11, color: "#7C3AED", flex: 1 }}>
          {t("mindsets.source")}: {"الموسوعة الميسرة في تربية الأولاد"} — {t("mindsets.based_on")}
        </Text>
      </View>

      <FlatList
        data={mindsets}
        keyExtractor={(item) => item.id}
        renderItem={renderMindset}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 100 }}
        extraData={[expandedId, translations, translatingId]}
      />
    </ScreenContainer>
  );
}
