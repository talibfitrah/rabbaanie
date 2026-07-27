import { useState, useMemo } from "react";
import { View, Text, SectionList, Pressable, Dimensions } from "react-native";
import { useRouter } from "expo-router";
import { Image } from "expo-image";
import { useColors } from "@/hooks/use-colors";
import { useI18n } from "@/lib/i18n";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { ScreenContainer } from "@/components/screen-container";
import libraryIndex from "@/assets/data/library/index.json";
import coverUrls from "@/assets/data/library/cover_urls.json";

type Lang = "ar" | "en" | "nl";

function tx(lang: Lang, nl: string, en: string, ar: string): string {
  return lang === "ar" ? ar : lang === "en" ? en : nl;
}

// Category translations
const CATEGORY_TRANSLATIONS: Record<string, { nl: string; en: string; ar: string }> = {
  "الهدايات": { ar: "الهدايات", nl: "Leidraden (Hidayat)", en: "Guidances (Hidayat)" },
  "قيادة النفس": { ar: "قيادة النفس", nl: "Zelfleiderschap", en: "Self-Leadership" },
  "الفطرة": { ar: "الفطرة", nl: "Fitrah (Aangeboren aard)", en: "Fitrah (Innate Nature)" },
  "التوحيد": { ar: "التوحيد", nl: "Tawhied (Eenheid van Allah)", en: "Tawheed (Oneness of Allah)" },
  "النصيحة": { ar: "النصيحة", nl: "Nasiha (Advies)", en: "Nasiha (Advice)" },
  "الطرق التربوية": { ar: "الطرق التربوية", nl: "Opvoedkundige methoden", en: "Educational Methods" },
  "الزواج": { ar: "الزواج", nl: "Huwelijk", en: "Marriage" },
  "تربية الولد": { ar: "تربية الولد", nl: "Kindopvoeding", en: "Child Upbringing" },
  "الدعوة": { ar: "الدعوة", nl: "Da'wah (Uitnodiging)", en: "Da'wah (Invitation)" },
  "السنن الكونية": { ar: "السنن الكونية", nl: "Universele Wetten", en: "Universal Laws" },
};

// Category order
const CATEGORY_ORDER = ["الهدايات", "قيادة النفس", "الفطرة", "التوحيد", "النصيحة", "الطرق التربوية", "الزواج", "تربية الولد", "الدعوة", "السنن الكونية"];

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const CARD_WIDTH = (SCREEN_WIDTH - 48) / 2;

export default function LibraryScreen() {
  const colors = useColors();
  const { language, isRTL } = useI18n();
  const router = useRouter();
  const lang = (language || "ar") as Lang;

  const books = useMemo(() => {
    return libraryIndex.map((book: any) => ({
      ...book,
      title: lang === "ar" ? book.title_ar : lang === "en" ? book.title_en : book.title_nl,
      series: lang === "ar" ? book.series : lang === "en" ? (book.series_en || book.series) : (book.series_nl || book.series),
      coverUrl: (coverUrls as any)[`book_${book.id}`] || "",
    }));
  }, [lang]);

  // Group books by category
  const sections = useMemo(() => {
    const grouped: Record<string, any[]> = {};
    for (const book of books) {
      const cat = book.category || "أخرى";
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(book);
    }
    // Sort by predefined order
    return CATEGORY_ORDER
      .filter((cat) => grouped[cat] && grouped[cat].length > 0)
      .map((cat) => ({
        title: cat,
        translatedTitle: CATEGORY_TRANSLATIONS[cat]
          ? tx(lang, CATEGORY_TRANSLATIONS[cat].nl, CATEGORY_TRANSLATIONS[cat].en, CATEGORY_TRANSLATIONS[cat].ar)
          : cat,
        data: grouped[cat],
      }));
  }, [books, lang]);

  // Weekly rotation: show one featured book based on week number
  const weekNumber = Math.floor((Date.now() - new Date("2025-01-01").getTime()) / (7 * 24 * 60 * 60 * 1000)) % books.length;
  const featuredBook = books[weekNumber];

  const renderBook = ({ item }: { item: any }) => (
    <Pressable
      onPress={() => router.push(`/library/${item.id}` as any)}
      style={({ pressed }) => [{
        width: CARD_WIDTH,
        marginBottom: 16,
        opacity: pressed ? 0.8 : 1,
        transform: [{ scale: pressed ? 0.97 : 1 }],
      }]}
    >
      <View style={{
        borderRadius: 12,
        overflow: "hidden",
        backgroundColor: colors.surface,
        borderWidth: 0.5,
        borderColor: colors.border,
        elevation: 3,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      }}>
        <Image
          source={{ uri: item.coverUrl }}
          style={{ width: "100%", height: CARD_WIDTH * 1.3, borderTopLeftRadius: 12, borderTopRightRadius: 12 }}
          contentFit="cover"
        />
        <View style={{ padding: 10 }}>
          <Text
            numberOfLines={2}
            style={{
              fontSize: 13,
              fontWeight: "700",
              color: colors.foreground,
              textAlign: isRTL ? "right" : "left",
              lineHeight: 20,
            }}
          >
            {item.title}
          </Text>
          <Text style={{
            fontSize: 11,
            color: colors.muted,
            marginTop: 4,
            textAlign: isRTL ? "right" : "left",
          }}>
            {item.total_chapters} {tx(lang, "hoofdstukken", "chapters", "فصلاً")}
          </Text>
        </View>
      </View>
    </Pressable>
  );

  // Render two books per row in section
  const renderSectionItem = ({ item, index, section }: { item: any; index: number; section: any }) => {
    // Only render on even indices (we'll render pairs)
    if (index % 2 !== 0) return null;
    const nextItem = section.data[index + 1];
    return (
      <View style={{ flexDirection: isRTL ? "row-reverse" : "row", justifyContent: "space-between", paddingHorizontal: 0 }}>
        {renderBook({ item })}
        {nextItem ? renderBook({ item: nextItem }) : <View style={{ width: CARD_WIDTH }} />}
      </View>
    );
  };

  const renderSectionHeader = ({ section }: { section: { translatedTitle: string } }) => (
    <View style={{
      paddingVertical: 12,
      paddingHorizontal: 4,
      marginTop: 8,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      marginBottom: 12,
    }}>
      <Text style={{
        fontSize: 18,
        fontWeight: "800",
        color: colors.primary,
        textAlign: isRTL ? "right" : "left",
      }}>
        {section.translatedTitle}
      </Text>
    </View>
  );

  return (
    <ScreenContainer className="flex-1">
      <View style={{ flex: 1, paddingHorizontal: 16 }}>
        {/* Header */}
        <View style={{
          flexDirection: isRTL ? "row-reverse" : "row",
          alignItems: "center",
          paddingVertical: 16,
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
            fontSize: 22,
            fontWeight: "bold",
            color: colors.foreground,
            flex: 1,
            textAlign: isRTL ? "right" : "left",
          }}>
            {tx(lang, "Bibliotheek", "Library", "المكتبة")}
          </Text>
          <Pressable
            onPress={() => router.push("/library/search" as any)}
            style={({ pressed }) => [{
              opacity: pressed ? 0.6 : 1,
              padding: 6,
              borderRadius: 20,
              backgroundColor: colors.surface,
            }]}
          >
            <MaterialIcons name="search" size={22} color={colors.primary} />
          </Pressable>
        </View>

        {/* Featured book of the week */}
        {featuredBook && (
          <Pressable
            onPress={() => router.push(`/library/${featuredBook.id}` as any)}
            style={({ pressed }) => [{
              marginBottom: 20,
              opacity: pressed ? 0.9 : 1,
              transform: [{ scale: pressed ? 0.98 : 1 }],
            }]}
          >
            <View style={{
              borderRadius: 16,
              overflow: "hidden",
              backgroundColor: colors.primary + "15",
              borderWidth: 1,
              borderColor: colors.primary + "30",
            }}>
              <View style={{ flexDirection: isRTL ? "row-reverse" : "row", padding: 12, gap: 12 }}>
                <Image
                  source={{ uri: featuredBook.coverUrl }}
                  style={{ width: 80, height: 110, borderRadius: 8 }}
                  contentFit="cover"
                />
                <View style={{ flex: 1, justifyContent: "center" }}>
                  <Text style={{
                    fontSize: 11,
                    fontWeight: "600",
                    color: colors.primary,
                    textAlign: isRTL ? "right" : "left",
                    marginBottom: 4,
                  }}>
                    {tx(lang, "Boek van de week", "Book of the week", "كتاب الأسبوع")}
                  </Text>
                  <Text style={{
                    fontSize: 16,
                    fontWeight: "bold",
                    color: colors.foreground,
                    textAlign: isRTL ? "right" : "left",
                    lineHeight: 24,
                  }}>
                    {featuredBook.title}
                  </Text>
                  <Text style={{
                    fontSize: 12,
                    color: colors.muted,
                    marginTop: 6,
                    textAlign: isRTL ? "right" : "left",
                  }}>
                    {featuredBook.total_chapters} {tx(lang, "hoofdstukken", "chapters", "فصلاً")} • {tx(lang, "Serie:", "Series:", "السلسلة:")} {featuredBook.series}
                  </Text>
                </View>
              </View>
            </View>
          </Pressable>
        )}

        {/* Books grouped by category */}
        <SectionList
          sections={sections}
          renderItem={renderSectionItem}
          renderSectionHeader={renderSectionHeader}
          keyExtractor={(item) => `book-${item.id}`}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 40 }}
          stickySectionHeadersEnabled={false}
        />
      </View>
    </ScreenContainer>
  );
}
