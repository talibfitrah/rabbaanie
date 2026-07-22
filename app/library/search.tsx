import { useState, useMemo, useCallback } from "react";
import { View, Text, TextInput, FlatList, Pressable, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useColors } from "@/hooks/use-colors";
import { useI18n } from "@/lib/i18n";
import { ScreenContainer } from "@/components/screen-container";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";

import libraryIndex from "@/assets/data/library/index.json";
import { ALL_BOOKS } from "@/lib/book-data";

type Lang = "ar" | "en" | "nl";
function tx(lang: Lang, nl: string, en: string, ar: string): string {
  return lang === "ar" ? ar : lang === "en" ? en : nl;
}

interface SearchResult {
  bookId: number;
  bookTitle: string;
  chapterIdx: number;
  chapterTitle: string;
  snippet: string;
  matchCount: number;
}

export default function LibrarySearchScreen() {
  const colors = useColors();
  const { language, isRTL } = useI18n();
  const router = useRouter();
  const lang = (language || "ar") as Lang;

  const [query, setQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);

  // Build search index once
  const searchIndex = useMemo(() => {
    const index: Array<{
      bookId: number;
      bookTitle: string;
      chapterIdx: number;
      chapterTitle: string;
      content: string;
    }> = [];

    for (const meta of libraryIndex as any[]) {
      const bookData = ALL_BOOKS[meta.id];
      if (!bookData?.chapters) continue;

      const bookTitle = lang === "ar" ? meta.title_ar : lang === "en" ? meta.title_en : meta.title_nl;

      for (let ci = 0; ci < bookData.chapters.length; ci++) {
        const ch = bookData.chapters[ci];
        const chTitle = ch.title || `${tx(lang, "Hoofdstuk", "Chapter", "فصل")} ${ci + 1}`;
        const content = (ch.sections || [])
          .map((s: any) => s.content || "")
          .join(" ")
          .toLowerCase();

        index.push({
          bookId: meta.id,
          bookTitle,
          chapterIdx: ci,
          chapterTitle: chTitle,
          content,
        });
      }
    }
    return index;
  }, [lang]);

  // Search results
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];

    setIsSearching(true);
    const found: SearchResult[] = [];
    const terms = q.split(/\s+/).filter(t => t.length >= 2);

    for (const entry of searchIndex) {
      // Check if all terms are found
      const allMatch = terms.every(term => entry.content.includes(term));
      if (!allMatch) continue;

      // Count total matches
      let matchCount = 0;
      for (const term of terms) {
        let idx = 0;
        while ((idx = entry.content.indexOf(term, idx)) !== -1) {
          matchCount++;
          idx += term.length;
        }
      }

      // Extract snippet around first match
      const firstTermIdx = entry.content.indexOf(terms[0]);
      const snippetStart = Math.max(0, firstTermIdx - 40);
      const snippetEnd = Math.min(entry.content.length, firstTermIdx + terms[0].length + 100);
      const snippet = (snippetStart > 0 ? "..." : "") +
        entry.content.substring(snippetStart, snippetEnd) +
        (snippetEnd < entry.content.length ? "..." : "");

      found.push({
        bookId: entry.bookId,
        bookTitle: entry.bookTitle,
        chapterIdx: entry.chapterIdx,
        chapterTitle: entry.chapterTitle,
        snippet,
        matchCount,
      });
    }

    // Sort by match count (most relevant first)
    found.sort((a, b) => b.matchCount - a.matchCount);
    setIsSearching(false);
    return found.slice(0, 50); // Limit to 50 results
  }, [query, searchIndex]);

  const renderResult = useCallback(({ item }: { item: SearchResult }) => (
    <Pressable
      onPress={() => router.push(`/library/read?bookId=${item.bookId}&chapterIdx=${item.chapterIdx}` as any)}
      style={({ pressed }) => [{
        paddingVertical: 14,
        paddingHorizontal: 16,
        backgroundColor: pressed ? colors.surface : "transparent",
        borderBottomWidth: 0.5,
        borderBottomColor: colors.border,
      }]}
    >
      <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <MaterialIcons name="menu-book" size={16} color={colors.primary} />
        <Text numberOfLines={1} style={{
          fontSize: 13,
          fontWeight: "700",
          color: colors.primary,
          flex: 1,
          textAlign: isRTL ? "right" : "left",
        }}>
          {item.bookTitle}
        </Text>
        <View style={{
          backgroundColor: colors.primary + "20",
          paddingHorizontal: 6,
          paddingVertical: 2,
          borderRadius: 8,
        }}>
          <Text style={{ fontSize: 10, color: colors.primary, fontWeight: "600" }}>
            {item.matchCount}x
          </Text>
        </View>
      </View>
      <Text numberOfLines={1} style={{
        fontSize: 14,
        fontWeight: "600",
        color: colors.foreground,
        textAlign: isRTL ? "right" : "left",
        marginBottom: 4,
      }}>
        {item.chapterTitle}
      </Text>
      <Text numberOfLines={2} style={{
        fontSize: 12,
        color: colors.muted,
        textAlign: isRTL ? "right" : "left",
        lineHeight: 18,
      }}>
        {item.snippet}
      </Text>
    </Pressable>
  ), [colors, isRTL, router]);

  return (
    <ScreenContainer className="flex-1">
      <View style={{ flex: 1 }}>
        {/* Header */}
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
            fontSize: 20,
            fontWeight: "bold",
            color: colors.foreground,
            flex: 1,
            textAlign: isRTL ? "right" : "left",
          }}>
            {tx(lang, "Zoeken in bibliotheek", "Search Library", "البحث في المكتبة")}
          </Text>
        </View>

        {/* Search input */}
        <View style={{
          flexDirection: isRTL ? "row-reverse" : "row",
          alignItems: "center",
          marginHorizontal: 16,
          marginBottom: 12,
          paddingHorizontal: 14,
          height: 48,
          borderRadius: 12,
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: colors.border,
          gap: 10,
        }}>
          <MaterialIcons name="search" size={22} color={colors.muted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={tx(lang, "Zoek op trefwoord...", "Search by keyword...", "ابحث بكلمة مفتاحية...")}
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            style={{
              flex: 1,
              fontSize: 15,
              color: colors.foreground,
              textAlign: isRTL ? "right" : "left",
              writingDirection: isRTL ? "rtl" : "ltr",
            }}
          />
          {query.length > 0 && (
            <Pressable onPress={() => setQuery("")} style={({ pressed }) => [{ opacity: pressed ? 0.5 : 1 }]}>
              <MaterialIcons name="close" size={20} color={colors.muted} />
            </Pressable>
          )}
        </View>

        {/* Results count */}
        {query.trim().length >= 2 && (
          <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
            <Text style={{
              fontSize: 13,
              color: colors.muted,
              textAlign: isRTL ? "right" : "left",
            }}>
              {results.length} {tx(lang, "resultaten", "results", "نتيجة")}
              {results.length === 50 ? ` (${tx(lang, "max weergegeven", "max shown", "الحد الأقصى")})` : ""}
            </Text>
          </View>
        )}

        {/* Loading indicator */}
        {isSearching && (
          <View style={{ padding: 20, alignItems: "center" }}>
            <ActivityIndicator size="small" color={colors.primary} />
          </View>
        )}

        {/* Results list */}
        {query.trim().length >= 2 && !isSearching && (
          <FlatList
            data={results}
            renderItem={renderResult}
            keyExtractor={(item, idx) => `${item.bookId}-${item.chapterIdx}-${idx}`}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 40 }}
            ListEmptyComponent={
              <View style={{ padding: 40, alignItems: "center" }}>
                <MaterialIcons name="search-off" size={48} color={colors.muted} />
                <Text style={{
                  fontSize: 15,
                  color: colors.muted,
                  marginTop: 12,
                  textAlign: "center",
                }}>
                  {tx(lang, "Geen resultaten gevonden", "No results found", "لم يتم العثور على نتائج")}
                </Text>
              </View>
            }
          />
        )}

        {/* Empty state - before search */}
        {query.trim().length < 2 && (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingBottom: 80 }}>
            <MaterialIcons name="menu-book" size={64} color={colors.border} />
            <Text style={{
              fontSize: 15,
              color: colors.muted,
              marginTop: 16,
              textAlign: "center",
              paddingHorizontal: 40,
              lineHeight: 22,
            }}>
              {tx(
                lang,
                "Zoek in 45 boeken\n(1.079.358 woorden)",
                "Search across 45 books\n(1,079,358 words)",
                "ابحث في 45 كتاباً\n(١٬٠٧٩٬٣٥٨ كلمة)"
              )}
            </Text>
          </View>
        )}
      </View>
    </ScreenContainer>
  );
}
