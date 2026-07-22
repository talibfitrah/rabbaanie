import { useState } from "react";
import { View, Text, FlatList, Pressable, ActivityIndicator } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useColors } from "@/hooks/use-colors";
import { useI18n } from "@/lib/i18n";
import { ScreenContainer } from "@/components/screen-container";
import { useCmsContent } from "@/hooks/use-cms-content";

type ContentType = "article" | "tip" | "video" | "audio" | "fatwa" | undefined;

const CONTENT_TYPE_LABELS: Record<string, Record<string, string>> = {
  article: { nl: "Artikelen", en: "Articles", ar: "\u0645\u0642\u0627\u0644\u0627\u062a" },
  tip: { nl: "Tips", en: "Tips", ar: "\u0646\u0635\u0627\u0626\u062d" },
  video: { nl: "Video's", en: "Videos", ar: "\u0641\u064a\u062f\u064a\u0648\u0647\u0627\u062a" },
  audio: { nl: "Audio", en: "Audio", ar: "\u0635\u0648\u062a\u064a\u0627\u062a" },
  fatwa: { nl: "Fatwa's", en: "Fatwas", ar: "\u0641\u062a\u0627\u0648\u0649" },
};

const SECTION_TITLES: Record<string, Record<string, string>> = {
  fitrah: { nl: "Fitrah Content", en: "Fitrah Content", ar: "\u0645\u062d\u062a\u0648\u0649 \u0627\u0644\u0641\u0637\u0631\u0629" },
  weekly: { nl: "Weekprogramma", en: "Weekly Program", ar: "\u0627\u0644\u0628\u0631\u0646\u0627\u0645\u062c \u0627\u0644\u0623\u0633\u0628\u0648\u0639\u064a" },
  treatments: { nl: "Behandelingen", en: "Treatments", ar: "\u0627\u0644\u0639\u0644\u0627\u062c\u0627\u062a" },
  concepts: { nl: "Begrippen", en: "Concepts", ar: "\u0627\u0644\u0645\u0641\u0627\u0647\u064a\u0645" },
  general: { nl: "Algemeen", en: "General", ar: "\u0639\u0627\u0645" },
};

export default function ContentSectionScreen() {
  const { section } = useLocalSearchParams<{ section: string }>();
  const colors = useColors();
  const { language, isRTL } = useI18n();
  const router = useRouter();
  const lang = (language || "nl") as string;
  const [selectedType, setSelectedType] = useState<ContentType>(undefined);

  const { items, isLoading } = useCmsContent(section || "general", selectedType, 50);

  const sectionTitle = SECTION_TITLES[section || "general"]?.[lang] || section || "Content";

  const contentTypes: ContentType[] = [undefined, "article", "tip", "video", "audio", "fatwa"];

  const getTypeLabel = (type: ContentType) => {
    if (!type) return lang === "ar" ? "\u0627\u0644\u0643\u0644" : lang === "en" ? "All" : "Alles";
    return CONTENT_TYPE_LABELS[type]?.[lang] || type;
  };

  const getTypeIcon = (type: string | undefined) => {
    switch (type) {
      case "article": return "\ud83d\udcdd";
      case "tip": return "\ud83d\udca1";
      case "video": return "\ud83c\udfac";
      case "audio": return "\ud83c\udfa7";
      case "fatwa": return "\ud83d\udcdc";
      default: return "\ud83d\udcda";
    }
  };

  return (
    <ScreenContainer className="flex-1">
      <View style={{ paddingHorizontal: 20, paddingTop: 16 }}>
        {/* Header */}
        <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", marginBottom: 16 }}>
          <Pressable onPress={() => router.back()} style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1, marginRight: isRTL ? 0 : 12, marginLeft: isRTL ? 12 : 0 }]}>
            <Text style={{ fontSize: 24 }}>{isRTL ? "\u2192" : "\u2190"}</Text>
          </Pressable>
          <Text style={{ fontSize: 22, fontWeight: "bold", color: colors.foreground }}>{sectionTitle}</Text>
        </View>

        {/* Content type filter tabs */}
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={contentTypes}
          keyExtractor={(item) => item || "all"}
          style={{ marginBottom: 16 }}
          inverted={isRTL}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => setSelectedType(item)}
              style={({ pressed }) => [{
                backgroundColor: selectedType === item ? colors.primary : colors.surface,
                paddingHorizontal: 14,
                paddingVertical: 8,
                borderRadius: 20,
                marginRight: 8,
                opacity: pressed ? 0.8 : 1,
              }]}
            >
              <Text style={{ color: selectedType === item ? "#fff" : colors.foreground, fontSize: 13, fontWeight: "600" }}>
                {getTypeLabel(item)}
              </Text>
            </Pressable>
          )}
        />
      </View>

      {/* Content list */}
      {isLoading ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : items.length === 0 ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 40 }}>
          <Text style={{ fontSize: 48, marginBottom: 12 }}>{"\ud83d\udcda"}</Text>
          <Text style={{ color: colors.muted, textAlign: "center", fontSize: 15 }}>
            {lang === "ar" ? "\u0644\u0627 \u064a\u0648\u062c\u062f \u0645\u062d\u062a\u0648\u0649 \u0628\u0639\u062f" : lang === "en" ? "No content available yet" : "Nog geen content beschikbaar"}
          </Text>
          <Text style={{ color: colors.muted, textAlign: "center", fontSize: 13, marginTop: 4 }}>
            {lang === "ar" ? "\u0633\u064a\u062a\u0645 \u0625\u0636\u0627\u0641\u0629 \u0645\u062d\u062a\u0648\u0649 \u0642\u0631\u064a\u0628\u0627\u064b" : lang === "en" ? "Content will be added soon" : "Content wordt binnenkort toegevoegd"}
          </Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item: any) => String(item.id)}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
          renderItem={({ item }: { item: any }) => (
            <Pressable
              onPress={() => router.push(`/content/detail/${item.id}`)}
              style={({ pressed }) => [{
                backgroundColor: colors.surface,
                borderRadius: 14,
                padding: 16,
                marginBottom: 12,
                borderWidth: 1,
                borderColor: colors.border,
                opacity: pressed ? 0.85 : 1,
              }]}
            >
              <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "flex-start" }}>
                <Text style={{ fontSize: 28, marginRight: isRTL ? 0 : 12, marginLeft: isRTL ? 12 : 0 }}>
                  {getTypeIcon(item.contentType)}
                </Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 16, fontWeight: "bold", color: colors.foreground, textAlign: isRTL ? "right" : "left", marginBottom: 4 }}>
                    {item.title}
                  </Text>
                  {item.summary && (
                    <Text style={{ fontSize: 13, color: colors.muted, textAlign: isRTL ? "right" : "left", lineHeight: 18 }} numberOfLines={2}>
                      {item.summary}
                    </Text>
                  )}
                  <View style={{ flexDirection: isRTL ? "row-reverse" : "row", marginTop: 8, gap: 8 }}>
                    {item.category && (
                      <View style={{ backgroundColor: colors.primary + "20", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 }}>
                        <Text style={{ fontSize: 11, color: colors.primary, fontWeight: "600" }}>
                          {lang === "ar" ? item.category.nameAr : lang === "en" ? item.category.nameEn : item.category.nameNl}
                        </Text>
                      </View>
                    )}
                    <View style={{ backgroundColor: colors.surface, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, borderWidth: 1, borderColor: colors.border }}>
                      <Text style={{ fontSize: 11, color: colors.muted }}>
                        {getTypeLabel(item.contentType)}
                      </Text>
                    </View>
                  </View>
                </View>
              </View>
            </Pressable>
          )}
        />
      )}
    </ScreenContainer>
  );
}
