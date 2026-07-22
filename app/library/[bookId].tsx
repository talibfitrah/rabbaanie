import { useMemo } from "react";
import { View, Text, FlatList, Pressable } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Image } from "expo-image";
import { useColors } from "@/hooks/use-colors";
import { useI18n } from "@/lib/i18n";
import { ScreenContainer } from "@/components/screen-container";
import { ALL_BOOKS } from "@/lib/book-data";

import libraryIndex from "@/assets/data/library/index.json";
import coverUrls from "@/assets/data/library/cover_urls.json";

type Lang = "ar" | "en" | "nl";
function tx(lang: Lang, nl: string, en: string, ar: string): string {
  return lang === "ar" ? ar : lang === "en" ? en : nl;
}

export default function BookDetailScreen() {
  const { bookId } = useLocalSearchParams<{ bookId: string }>();
  const colors = useColors();
  const { language, isRTL } = useI18n();
  const router = useRouter();
  const lang = (language || "ar") as Lang;
  const id = parseInt(bookId || "1", 10);

  const bookMeta = libraryIndex.find((b: any) => b.id === id);
  const bookData = ALL_BOOKS[id];
  const coverUrl = (coverUrls as any)[`book_${id}`] || "";

  const title = bookMeta
    ? lang === "ar" ? bookMeta.title_ar : lang === "en" ? bookMeta.title_en : bookMeta.title_nl
    : "";

  // Filter chapters that have actual content (sections with content > 100 chars)
  const chapters = useMemo(() => {
    if (!bookData?.chapters) return [];
    return bookData.chapters
      .map((ch: any, idx: number) => ({
        ...ch,
        index: idx,
        totalContent: (ch.sections || []).reduce((sum: number, s: any) => sum + (s.content?.length || 0), 0),
      }))
      .filter((ch: any) => ch.totalContent > 100);
  }, [bookData]);

  const renderChapter = ({ item, index }: { item: any; index: number }) => (
    <Pressable
      onPress={() => router.push(`/library/read?bookId=${id}&chapterIdx=${item.index}` as any)}
      style={({ pressed }) => [{
        flexDirection: isRTL ? "row-reverse" : "row",
        alignItems: "center",
        paddingVertical: 14,
        paddingHorizontal: 16,
        backgroundColor: pressed ? colors.surface : "transparent",
        borderBottomWidth: 0.5,
        borderBottomColor: colors.border,
        gap: 12,
      }]}
    >
      <View style={{
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: colors.primary + "15",
        alignItems: "center",
        justifyContent: "center",
      }}>
        <Text style={{ fontSize: 13, fontWeight: "700", color: colors.primary }}>
          {index + 1}
        </Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text
          numberOfLines={2}
          style={{
            fontSize: 15,
            fontWeight: "600",
            color: colors.foreground,
            textAlign: isRTL ? "right" : "left",
            lineHeight: 22,
          }}
        >
          {lang === "nl" && item.title_nl ? item.title_nl : lang === "en" && item.title_en ? item.title_en : item.title}
        </Text>
        <Text style={{
          fontSize: 11,
          color: colors.muted,
          marginTop: 2,
          textAlign: isRTL ? "right" : "left",
        }}>
          {(item.sections || []).length} {tx(lang, "secties", "sections", "أقسام")}
        </Text>
      </View>
      <Text style={{ fontSize: 18, color: colors.muted }}>
        {isRTL ? "‹" : "›"}
      </Text>
    </Pressable>
  );

  return (
    <ScreenContainer className="flex-1">
      <View style={{ flex: 1 }}>
        {/* Header with back button */}
        <View style={{
          flexDirection: isRTL ? "row-reverse" : "row",
          alignItems: "center",
          paddingHorizontal: 16,
          paddingVertical: 12,
          gap: 12,
        }}>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}
          >
            <Text style={{ fontSize: 24, color: colors.foreground }}>
              {isRTL ? "→" : "←"}
            </Text>
          </Pressable>
          <Text style={{
            fontSize: 11,
            color: colors.muted,
            flex: 1,
            textAlign: isRTL ? "right" : "left",
          }}>
            {tx(lang, "Bibliotheek", "Library", "المكتبة")}
          </Text>
        </View>

        {/* Book info header */}
        <View style={{
          flexDirection: isRTL ? "row-reverse" : "row",
          paddingHorizontal: 16,
          paddingBottom: 16,
          gap: 14,
          borderBottomWidth: 0.5,
          borderBottomColor: colors.border,
        }}>
          <Image
            source={{ uri: coverUrl }}
            style={{ width: 90, height: 120, borderRadius: 10 }}
            contentFit="cover"
          />
          <View style={{ flex: 1, justifyContent: "center" }}>
            <Text style={{
              fontSize: 18,
              fontWeight: "bold",
              color: colors.foreground,
              textAlign: isRTL ? "right" : "left",
              lineHeight: 26,
            }}>
              {title}
            </Text>
            <Text style={{
              fontSize: 12,
              color: colors.muted,
              marginTop: 6,
              textAlign: isRTL ? "right" : "left",
            }}>
              {bookMeta?.series || ""}
            </Text>
            <Text style={{
              fontSize: 12,
              color: colors.primary,
              marginTop: 4,
              textAlign: isRTL ? "right" : "left",
            }}>
              {chapters.length} {tx(lang, "hoofdstukken", "chapters", "فصلاً")}
            </Text>
          </View>
        </View>

        {/* Table of contents title */}
        <View style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
          <Text style={{
            fontSize: 16,
            fontWeight: "700",
            color: colors.foreground,
            textAlign: isRTL ? "right" : "left",
          }}>
            {tx(lang, "Inhoudsopgave", "Table of Contents", "الفهرس")}
          </Text>
        </View>

        {/* Chapter list */}
        <FlatList
          data={chapters}
          renderItem={renderChapter}
          keyExtractor={(item) => `ch-${item.index}`}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 40 }}
        />
      </View>
    </ScreenContainer>
  );
}
