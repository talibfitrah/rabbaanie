import { useState, useMemo, useEffect } from "react";
import { View, Text, SectionList, Pressable, useWindowDimensions } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { useColors } from "@/hooks/use-colors";
import { useI18n } from "@/lib/i18n";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { ScreenContainer } from "@/components/screen-container";
import libraryIndex from "@/assets/data/library/index.json";
import coverUrls from "@/assets/data/library/cover_urls.json";
import { fetchServerBookIndex } from "@/lib/server-books";

type Lang = "ar" | "en" | "nl";

function tx(lang: Lang, nl: string, en: string, ar: string): string {
  return lang === "ar" ? ar : lang === "en" ? en : nl;
}

// Category translations
const CATEGORY_TRANSLATIONS: Record<string, { nl: string; en: string; ar: string }> = {
  "الهدايات": { ar: "الهدايات", nl: "Leidraden (Hidayat)", en: "Guidances (Hidayat)" },
  "قيادة النفس": { ar: "قيادة النفس", nl: "Zelfleiderschap", en: "Self-Leadership" },
  "الفطرة": { ar: "الفطرة", nl: "Fitrah (Aangeboren aard)", en: "Fitrah (Innate Nature)" },
  "التوحيد": { ar: "التوحيد", nl: "Tawhied (Eenheid van Allaah)", en: "Tawheed (Oneness of Allaah)" },
  "النصيحة": { ar: "النصيحة", nl: "Nasiha (Advies)", en: "Nasiha (Advice)" },
  "الطرق التربوية": { ar: "الطرق التربوية", nl: "Opvoedkundige methoden", en: "Educational Methods" },
  "الزواج": { ar: "الزواج", nl: "Huwelijk", en: "Marriage" },
  "تربية الولد": { ar: "تربية الولد", nl: "Kindopvoeding", en: "Child Upbringing" },
  "الدعوة": { ar: "الدعوة", nl: "Da'wah (Uitnodiging)", en: "Da'wah (Invitation)" },
  "السنن الكونية": { ar: "السنن الكونية", nl: "Universele Wetten", en: "Universal Laws" },
};

// Category order
const CATEGORY_ORDER = ["الهدايات", "قيادة النفس", "الفطرة", "التوحيد", "النصيحة", "الطرق التربوية", "الزواج", "تربية الولد", "الدعوة", "السنن الكونية"];

export default function LibraryScreen() {
  const colors = useColors();
  const { language, isRTL } = useI18n();
  const router = useRouter();
  // Measured per render, not once at import: the app is no longer
  // portrait-locked, and a width captured before a rotation leaves the row
  // either clipped past the right edge (landscape -> portrait) or hugging the
  // left with a dead gap (portrait -> landscape).
  //
  // Insets, not just the window: ScreenContainer wraps this in a SafeAreaView
  // with edges ["top","left","right"], so the row's real box is narrower than
  // the window by left+right. Those are 0 in portrait, which is why measuring
  // the window alone was fine before — but landscape is exactly what this
  // change unlocks, and there a cutout or gesture inset runs 27-48dp. Cards
  // default to flexShrink: 0, so the trailing one would simply be clipped.
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  // The row box: window minus the safe-area sides, minus the container's own
  // paddingHorizontal: 16 each side.
  const rowWidth = width - insets.left - insets.right - 32;
  // Bounded by HEIGHT as well as width, because the thing that overflows is the
  // cover (CARD_WIDTH * 1.3), not the row. A width-only rule reads 2 columns on
  // an 800x360dp phone in landscape and draws a 489dp cover into a 360dp
  // viewport — the same defect as the tablet, on the more common device.
  // ~320dp is the widest a card should get; on a short viewport the cap falls
  // out of the height instead.
  const maxCardWidth = Math.min(320, height * 0.45);
  const COLUMNS = Math.max(2, Math.ceil(rowWidth / maxCardWidth));
  // COLUMNS cards separated by COLUMNS-1 gaps of 16, which justifyContent
  // "space-between" produces. At COLUMNS=2 and no insets this is the original
  // (width - 48) / 2, which is what every phone in portrait still gets.
  const CARD_WIDTH = (rowWidth - (COLUMNS - 1) * 16) / COLUMNS;
  const lang = (language || "ar") as Lang;

  // Server-managed books (added at runtime) merged with the bundled ones.
  const [serverBooks, setServerBooks] = useState<any[]>([]);
  useEffect(() => { fetchServerBookIndex().then(setServerBooks); }, []);

  const books = useMemo(() => {
    return [...libraryIndex, ...serverBooks].map((book: any) => ({
      ...book,
      title: lang === "ar" ? book.title_ar : lang === "en" ? book.title_en : book.title_nl,
      series: lang === "ar" ? book.series : lang === "en" ? (book.series_en || book.series) : (book.series_nl || book.series),
      coverUrl: (coverUrls as any)[`book_${book.id}`] || "",
    }));
  }, [lang, serverBooks]);

  // Group books by category
  const sections = useMemo(() => {
    const grouped: Record<string, any[]> = {};
    for (const book of books) {
      const cat = book.category || "أخرى";
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(book);
    }
    // Known categories in their predefined order, then any other categories
    // (e.g. from server-added books) appended so they always show.
    const known = CATEGORY_ORDER.filter((cat) => grouped[cat] && grouped[cat].length > 0);
    const extra = Object.keys(grouped).filter((cat) => !CATEGORY_ORDER.includes(cat) && grouped[cat].length > 0);
    return [...known, ...extra].map((cat) => ({
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
      // Rows are built with .map now, so the element needs its own key.
      key={item.id}
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
  const renderSectionItem = ({ index, section }: { item: any; index: number; section: any }) => {
    // Render one row per COLUMNS-sized chunk; the rest return null.
    if (index % COLUMNS !== 0) return null;
    const row = section.data.slice(index, index + COLUMNS);
    return (
      <View style={{ flexDirection: isRTL ? "row-reverse" : "row", justifyContent: "space-between", paddingHorizontal: 0 }}>
        {row.map((book: any) => renderBook({ item: book }))}
        {/* Keep a short last row left-aligned instead of space-between
            spreading its cards across the full width. */}
        {Array.from({ length: COLUMNS - row.length }, (_, i) => (
          <View key={`gap-${i}`} style={{ width: CARD_WIDTH }} />
        ))}
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
