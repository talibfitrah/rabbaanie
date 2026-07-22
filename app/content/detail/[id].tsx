import { View, Text, ScrollView, Pressable, ActivityIndicator, Linking } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useColors } from "@/hooks/use-colors";
import { useI18n } from "@/lib/i18n";
import { ScreenContainer } from "@/components/screen-container";
import { useCmsItem } from "@/hooks/use-cms-content";

/** Strip HTML tags from content text */
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export default function ContentDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const { language, isRTL } = useI18n();
  const router = useRouter();
  const lang = (language || "nl") as string;

  const { item, isLoading } = useCmsItem(parseInt(id || "0", 10));

  if (isLoading) {
    return (
      <ScreenContainer className="flex-1">
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </ScreenContainer>
    );
  }

  if (!item) {
    return (
      <ScreenContainer className="flex-1">
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <Text style={{ color: colors.muted, fontSize: 16 }}>
            {lang === "ar" ? "\u0627\u0644\u0645\u062d\u062a\u0648\u0649 \u063a\u064a\u0631 \u0645\u0648\u062c\u0648\u062f" : lang === "en" ? "Content not found" : "Content niet gevonden"}
          </Text>
        </View>
      </ScreenContainer>
    );
  }

  // Find translation in user's language, fallback to nl, then first available
  const translation = item.translations?.find((t: any) => t.language === lang)
    || item.translations?.find((t: any) => t.language === "nl")
    || item.translations?.[0];

  const getTypeIcon = (type: string) => {
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
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40 }}>
        {/* Back button */}
        <Pressable onPress={() => router.back()} style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1, marginBottom: 16 }]}>
          <Text style={{ fontSize: 16, color: colors.primary, fontWeight: "600" }}>
            {isRTL ? "\u2192" : "\u2190"} {lang === "ar" ? "\u0631\u062c\u0648\u0639" : lang === "en" ? "Back" : "Terug"}
          </Text>
        </Pressable>

        {/* Content type badge */}
        <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", marginBottom: 12 }}>
          <Text style={{ fontSize: 28, marginRight: isRTL ? 0 : 10, marginLeft: isRTL ? 10 : 0 }}>
            {getTypeIcon(item.contentType)}
          </Text>
          {item.category && (
            <View style={{ backgroundColor: colors.primary + "20", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 }}>
              <Text style={{ fontSize: 12, color: colors.primary, fontWeight: "600" }}>
                {lang === "ar" ? item.category.nameAr : lang === "en" ? item.category.nameEn : item.category.nameNl}
              </Text>
            </View>
          )}
        </View>

        {/* Title */}
        <Text style={{ fontSize: 24, fontWeight: "bold", color: colors.foreground, textAlign: isRTL ? "right" : "left", marginBottom: 8 }}>
          {translation?.title || ""}
        </Text>

        {/* Summary */}
        {translation?.summary && (
          <Text style={{ fontSize: 15, color: colors.muted, textAlign: isRTL ? "right" : "left", marginBottom: 16, lineHeight: 22 }}>
            {translation.summary}
          </Text>
        )}

        {/* Media link */}
        {item.mediaUrl && (
          <Pressable
            onPress={() => Linking.openURL(item.mediaUrl!)}
            style={({ pressed }) => [{
              backgroundColor: colors.primary,
              borderRadius: 12,
              padding: 14,
              alignItems: "center",
              marginBottom: 16,
              opacity: pressed ? 0.8 : 1,
            }]}
          >
            <Text style={{ color: "#fff", fontWeight: "bold", fontSize: 14 }}>
              {item.contentType === "video" ? (lang === "ar" ? "\u0634\u0627\u0647\u062f \u0627\u0644\u0641\u064a\u062f\u064a\u0648" : lang === "en" ? "Watch Video" : "Video bekijken") :
               item.contentType === "audio" ? (lang === "ar" ? "\u0627\u0633\u062a\u0645\u0639" : lang === "en" ? "Listen" : "Luisteren") :
               (lang === "ar" ? "\u0641\u062a\u062d \u0627\u0644\u0631\u0627\u0628\u0637" : lang === "en" ? "Open Link" : "Link openen")}
            </Text>
          </Pressable>
        )}

        {/* Body content */}
        {translation?.body && (
          <View style={{ backgroundColor: colors.surface, borderRadius: 14, padding: 20, borderWidth: 1, borderColor: colors.border }}>
            <Text style={{ fontSize: 15, color: colors.foreground, textAlign: isRTL ? "right" : "left", lineHeight: 24 }}>
              {stripHtml(translation.body)}
            </Text>
          </View>
        )}

        {/* Files */}
        {item.files && item.files.length > 0 && (
          <View style={{ marginTop: 20 }}>
            <Text style={{ fontSize: 16, fontWeight: "bold", color: colors.foreground, marginBottom: 10, textAlign: isRTL ? "right" : "left" }}>
              {lang === "ar" ? "\u0627\u0644\u0645\u0644\u0641\u0627\u062a" : lang === "en" ? "Files" : "Bestanden"}
            </Text>
            {item.files.map((file: any) => (
              <Pressable
                key={file.id}
                onPress={() => file.fileUrl && Linking.openURL(file.fileUrl)}
                style={({ pressed }) => [{
                  backgroundColor: colors.surface,
                  borderRadius: 10,
                  padding: 12,
                  marginBottom: 8,
                  borderWidth: 1,
                  borderColor: colors.border,
                  flexDirection: isRTL ? "row-reverse" : "row",
                  alignItems: "center",
                  opacity: pressed ? 0.8 : 1,
                }]}
              >
                <Text style={{ fontSize: 20, marginRight: isRTL ? 0 : 10, marginLeft: isRTL ? 10 : 0 }}>
                  {file.fileType === "pdf" ? "\ud83d\udcc4" : file.fileType === "word" ? "\ud83d\udcdd" : file.fileType === "excel" ? "\ud83d\udcca" : "\ud83d\udcc1"}
                </Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, color: colors.foreground, fontWeight: "500" }}>{file.fileName}</Text>
                  <Text style={{ fontSize: 12, color: colors.muted }}>{file.language?.toUpperCase()} - {file.fileType?.toUpperCase()}</Text>
                </View>
              </Pressable>
            ))}
          </View>
        )}

        {/* Available languages */}
        {item.translations && item.translations.length > 1 && (
          <View style={{ marginTop: 20, padding: 14, backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border }}>
            <Text style={{ fontSize: 13, color: colors.muted, textAlign: isRTL ? "right" : "left" }}>
              {lang === "ar" ? "\u0645\u062a\u0627\u062d \u0628\u0627\u0644\u0644\u063a\u0627\u062a:" : lang === "en" ? "Available in:" : "Beschikbaar in:"}{" "}
              {item.translations.map((t: any) => t.language === "nl" ? "Nederlands" : t.language === "en" ? "English" : "\u0627\u0644\u0639\u0631\u0628\u064a\u0629").join(", ")}
            </Text>
          </View>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}
