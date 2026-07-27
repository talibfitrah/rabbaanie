import { useMemo, useRef, useState, useEffect, useCallback } from "react";
import { View, Text, ScrollView, Pressable, ActivityIndicator, LayoutAnimation, Platform, UIManager } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}
import { useLocalSearchParams, useRouter } from "expo-router";
import { useColors } from "@/hooks/use-colors";
import { useI18n } from "@/lib/i18n";
import { ScreenContainer } from "@/components/screen-container";
import { trpc } from "@/lib/trpc";

import { ALL_BOOKS } from "@/lib/book-data";
import { fetchServerBook } from "@/lib/server-books";

const BOOKS = ALL_BOOKS;

type Lang = "ar" | "en" | "nl";
function tx(lang: Lang, nl: string, en: string, ar: string): string {
  return lang === "ar" ? ar : lang === "en" ? en : nl;
}

export default function ReadScreen() {
  const { bookId, chapterIdx } = useLocalSearchParams<{ bookId: string; chapterIdx: string }>();
  const colors = useColors();
  const { language, isRTL } = useI18n();
  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);
  const lang = (language || "ar") as Lang;

  const id = parseInt(bookId || "1", 10);
  const idx = parseInt(chapterIdx || "0", 10);
  // Bundled book, or fetch a server-managed one (cached offline).
  const bundled = BOOKS[id];
  const [bookData, setBookData] = useState<any>(bundled || null);
  useEffect(() => {
    if (!bundled) fetchServerBook(id).then(setBookData);
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const chapter = bookData?.chapters?.[idx];
  const sections = chapter?.sections || [];

  // Translation state for sections that don't have pre-translated content
  const [translatedSections, setTranslatedSections] = useState<Record<string, { title?: string; content?: string }>>({});
  const [isTranslating, setIsTranslating] = useState(false);
  const [expandedArticleSections, setExpandedArticleSections] = useState<Record<string, boolean>>({});

  const toggleArticleSection = useCallback((key: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedArticleSections(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);
  const translateMutation = trpc.translate.translateTexts.useMutation();

  // Get chapter title in correct language
  const chapterTitle = useMemo(() => {
    if (lang === "ar") return chapter?.title || "";
    if (lang === "nl" && chapter?.title_nl) return chapter.title_nl;
    if (lang === "en" && chapter?.title_en) return chapter.title_en;
    return chapter?.title || "";
  }, [chapter, lang]);

  // Get section text in correct language, using pre-translated fields or fallback
  const getSectionTitle = useCallback((section: any, sIdx: number): string => {
    if (lang === "ar") return section.title || "";
    // Check pre-translated fields
    if (lang === "nl" && section.title_nl) return section.title_nl;
    if (lang === "en" && section.title_en) return section.title_en;
    // Check on-demand translation cache
    const cached = translatedSections[`${id}_${idx}_${sIdx}`];
    if (cached?.title) return cached.title;
    return section.title || "";
  }, [lang, translatedSections, id, idx]);

  const getSectionContent = useCallback((section: any, sIdx: number): string => {
    if (lang === "ar") return section.content || "";
    // Check pre-translated fields
    if (lang === "nl" && section.content_nl) return section.content_nl;
    if (lang === "en" && section.content_en) return section.content_en;
    // Check on-demand translation cache
    const cached = translatedSections[`${id}_${idx}_${sIdx}`];
    if (cached?.content) return cached.content;
    return section.content || "";
  }, [lang, translatedSections, id, idx]);

  // Translate sections that don't have pre-translated content
  useEffect(() => {
    if (lang === "ar" || !sections.length) return;

    const missingTranslations: { sIdx: number; field: "title" | "content"; text: string }[] = [];

    sections.forEach((section: any, sIdx: number) => {
      const cacheKey = `${id}_${idx}_${sIdx}`;
      const cached = translatedSections[cacheKey];

      // Check if title needs translation
      if (section.title && !(lang === "nl" ? section.title_nl : section.title_en) && !cached?.title) {
        missingTranslations.push({ sIdx, field: "title", text: section.title });
      }
      // Check if content needs translation
      if (section.content && !(lang === "nl" ? section.content_nl : section.content_en) && !cached?.content) {
        missingTranslations.push({ sIdx, field: "content", text: section.content });
      }
    });

    if (missingTranslations.length === 0) return;

    const doTranslate = async () => {
      setIsTranslating(true);
      try {
        // Batch translate in groups of 20
        const results: Record<string, { title?: string; content?: string }> = {};
        for (let i = 0; i < missingTranslations.length; i += 20) {
          const batch = missingTranslations.slice(i, i + 20);
          const res = await translateMutation.mutateAsync({
            texts: batch.map(b => b.text),
            targetLang: lang as "nl" | "en",
            context: "Islamic parenting education book",
          });
          res.translations.forEach((t: string, tIdx: number) => {
            const item = batch[tIdx];
            const key = `${id}_${idx}_${item.sIdx}`;
            if (!results[key]) results[key] = {};
            results[key][item.field] = t;
          });
        }
        setTranslatedSections(prev => ({ ...prev, ...results }));
      } catch (e) {
        console.warn("Library translation failed:", e);
      } finally {
        setIsTranslating(false);
      }
    };

    doTranslate();
  }, [id, idx, lang, sections.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Get all chapters with content for navigation
  const contentChapters = useMemo(() => {
    if (!bookData?.chapters) return [];
    return bookData.chapters
      .map((ch: any, i: number) => ({ ...ch, index: i }))
      .filter((ch: any) => (ch.sections || []).reduce((sum: number, s: any) => sum + (s.content?.length || 0), 0) > 100);
  }, [bookData]);

  const currentContentIdx = contentChapters.findIndex((ch: any) => ch.index === idx);
  const hasPrev = currentContentIdx > 0;
  const hasNext = currentContentIdx < contentChapters.length - 1;

  const goToPrev = () => {
    if (hasPrev) {
      const prevIdx = contentChapters[currentContentIdx - 1].index;
      setTranslatedSections({});
      router.replace(`/library/read?bookId=${id}&chapterIdx=${prevIdx}` as any);
    }
  };

  const goToNext = () => {
    if (hasNext) {
      const nextIdx = contentChapters[currentContentIdx + 1].index;
      setTranslatedSections({});
      router.replace(`/library/read?bookId=${id}&chapterIdx=${nextIdx}` as any);
    }
  };

  if (!chapter) {
    return (
      <ScreenContainer className="flex-1 items-center justify-center">
        <Text style={{ color: colors.muted }}>
          {tx(lang, "Hoofdstuk niet gevonden", "Chapter not found", "الفصل غير موجود")}
        </Text>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer className="flex-1">
      <View style={{ flex: 1 }}>
        {/* Header */}
        <View style={{
          flexDirection: isRTL ? "row-reverse" : "row",
          alignItems: "center",
          paddingHorizontal: 16,
          paddingVertical: 12,
          borderBottomWidth: 0.5,
          borderBottomColor: colors.border,
          gap: 12,
        }}>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}
          >
            <Text style={{ fontSize: 24, color: colors.foreground }}>
              {isRTL ? "\u2192" : "\u2190"}
            </Text>
          </Pressable>
          <Text
            numberOfLines={1}
            style={{
              fontSize: 15,
              fontWeight: "600",
              color: colors.foreground,
              flex: 1,
              textAlign: isRTL ? "right" : "left",
            }}
          >
            {chapterTitle}
          </Text>
        </View>

        {/* Content */}
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: 20, paddingVertical: 24, paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Chapter title */}
          <Text style={{
            fontSize: 22,
            fontWeight: "bold",
            color: colors.foreground,
            textAlign: "center",
            marginBottom: 24,
            lineHeight: 34,
          }}>
            {chapterTitle}
          </Text>

          {/* Translation loading indicator */}
          {isTranslating && lang !== "ar" && (
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", marginBottom: 16, gap: 8 }}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={{ fontSize: 12, color: colors.muted }}>
                {tx(lang, "Vertalen...", "Translating...", "\u062c\u0627\u0631\u064a \u0627\u0644\u062a\u0631\u062c\u0645\u0629...")}
              </Text>
            </View>
          )}

          {/* Sections - split long ones into collapsible subsections */}
          {sections.map((section: any, sIdx: number) => {
            const content = getSectionContent(section, sIdx);
            const isLong = content.length > 1500;
            
            if (isLong) {
              return (
                <CollapsibleArticleSection
                  key={`sec-${sIdx}`}
                  title={getSectionTitle(section, sIdx)}
                  content={content}
                  colors={colors}
                  isRTL={isRTL}
                  sIdx={sIdx}
                  expandedSections={expandedArticleSections}
                  toggleSection={toggleArticleSection}
                />
              );
            }
            
            return (
              <View key={`sec-${sIdx}`} style={{ marginBottom: 20 }}>
                {section.title && (
                  <Text style={{
                    fontSize: 17,
                    fontWeight: "700",
                    color: colors.primary,
                    textAlign: isRTL ? "right" : "left",
                    marginBottom: 10,
                    lineHeight: 26,
                  }}>
                    {getSectionTitle(section, sIdx)}
                  </Text>
                )}
                {section.content && (
                  <Text style={{
                    fontSize: 16,
                    color: colors.foreground,
                    textAlign: isRTL ? "right" : "left",
                    lineHeight: 28,
                    writingDirection: isRTL ? "rtl" : "ltr",
                  }}>
                    {content}
                  </Text>
                )}
              </View>
            );
          })}

          {/* Navigation buttons */}
          <View style={{
            flexDirection: isRTL ? "row-reverse" : "row",
            justifyContent: "space-between",
            marginTop: 32,
            paddingTop: 20,
            borderTopWidth: 0.5,
            borderTopColor: colors.border,
          }}>
            <Pressable
              onPress={goToPrev}
              disabled={!hasPrev}
              style={({ pressed }) => [{
                flexDirection: isRTL ? "row-reverse" : "row",
                alignItems: "center",
                gap: 6,
                paddingVertical: 10,
                paddingHorizontal: 16,
                borderRadius: 8,
                backgroundColor: hasPrev ? colors.primary + "15" : colors.surface,
                opacity: hasPrev ? (pressed ? 0.7 : 1) : 0.4,
              }]}
            >
              <Text style={{ fontSize: 16, color: hasPrev ? colors.primary : colors.muted }}>
                {isRTL ? "\u2192" : "\u2190"}
              </Text>
              <Text style={{ fontSize: 13, fontWeight: "600", color: hasPrev ? colors.primary : colors.muted }}>
                {tx(lang, "Vorige", "Previous", "\u0627\u0644\u0633\u0627\u0628\u0642")}
              </Text>
            </Pressable>

            <Pressable
              onPress={goToNext}
              disabled={!hasNext}
              style={({ pressed }) => [{
                flexDirection: isRTL ? "row-reverse" : "row",
                alignItems: "center",
                gap: 6,
                paddingVertical: 10,
                paddingHorizontal: 16,
                borderRadius: 8,
                backgroundColor: hasNext ? colors.primary + "15" : colors.surface,
                opacity: hasNext ? (pressed ? 0.7 : 1) : 0.4,
              }]}
            >
              <Text style={{ fontSize: 13, fontWeight: "600", color: hasNext ? colors.primary : colors.muted }}>
                {tx(lang, "Volgende", "Next", "\u0627\u0644\u062a\u0627\u0644\u064a")}
              </Text>
              <Text style={{ fontSize: 16, color: hasNext ? colors.primary : colors.muted }}>
                {isRTL ? "\u2190" : "\u2192"}
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </View>
    </ScreenContainer>
  );
}

// Collapsible section for long articles - splits content by newlines into subsections
function CollapsibleArticleSection({ title, content, colors, isRTL, sIdx, expandedSections, toggleSection }: {
  title: string;
  content: string;
  colors: any;
  isRTL: boolean;
  sIdx: number;
  expandedSections: Record<string, boolean>;
  toggleSection: (key: string) => void;
}) {
  // Split content into paragraphs by newlines
  const paragraphs = content.split(/\n+/).filter(p => p.trim().length > 0);
  
  // Group paragraphs into subsections (roughly 3-5 paragraphs each)
  const subsections: { heading: string; paragraphs: string[] }[] = [];
  let currentGroup: string[] = [];
  let groupCount = 0;
  
  for (const para of paragraphs) {
    // Detect if this paragraph looks like a heading (short, ends with colon, or starts with special chars)
    const isHeading = (para.length < 80 && (para.endsWith(":") || para.endsWith("؟"))) ||
      para.startsWith("▪") && para.length < 100;
    
    if (isHeading && currentGroup.length > 0) {
      // Save current group and start new one
      subsections.push({
        heading: currentGroup[0].substring(0, 60) + (currentGroup[0].length > 60 ? "..." : ""),
        paragraphs: currentGroup,
      });
      currentGroup = [para];
      groupCount = 0;
    } else {
      currentGroup.push(para);
      groupCount++;
      // If group gets too large, split it
      if (groupCount >= 5 && !isHeading) {
        subsections.push({
          heading: currentGroup[0].substring(0, 60) + (currentGroup[0].length > 60 ? "..." : ""),
          paragraphs: currentGroup,
        });
        currentGroup = [];
        groupCount = 0;
      }
    }
  }
  // Don't forget the last group
  if (currentGroup.length > 0) {
    subsections.push({
      heading: currentGroup[0].substring(0, 60) + (currentGroup[0].length > 60 ? "..." : ""),
      paragraphs: currentGroup,
    });
  }

  // If only 1 subsection, just show it expanded (no point in collapsing)
  if (subsections.length <= 1) {
    return (
      <View style={{ marginBottom: 20 }}>
        {title ? (
          <Text style={{
            fontSize: 17,
            fontWeight: "700",
            color: colors.primary,
            textAlign: isRTL ? "right" : "left",
            marginBottom: 10,
            lineHeight: 26,
          }}>
            {title}
          </Text>
        ) : null}
        <Text style={{
          fontSize: 16,
          color: colors.foreground,
          textAlign: isRTL ? "right" : "left",
          lineHeight: 28,
          writingDirection: isRTL ? "rtl" : "ltr",
        }}>
          {content}
        </Text>
      </View>
    );
  }

  return (
    <View style={{ marginBottom: 20 }}>
      {/* Section title */}
      {title ? (
        <Text style={{
          fontSize: 17,
          fontWeight: "700",
          color: colors.primary,
          textAlign: isRTL ? "right" : "left",
          marginBottom: 12,
          lineHeight: 26,
        }}>
          {title}
        </Text>
      ) : null}

      {/* Collapsible subsections */}
      {subsections.map((sub, subIdx) => {
        const key = `${sIdx}_${subIdx}`;
        const isExpanded = expandedSections[key] ?? (subIdx === 0); // First subsection expanded by default
        
        return (
          <View key={key} style={{
            marginBottom: 8,
            borderRadius: 10,
            borderWidth: 0.5,
            borderColor: colors.border,
            overflow: "hidden",
          }}>
            {/* Subsection header (collapsible) */}
            <Pressable
              onPress={() => toggleSection(key)}
              style={({ pressed }) => [{
                flexDirection: isRTL ? "row-reverse" : "row",
                alignItems: "center",
                paddingHorizontal: 14,
                paddingVertical: 12,
                backgroundColor: isExpanded ? colors.primary + "08" : colors.surface,
                opacity: pressed ? 0.7 : 1,
              }]}
            >
              <MaterialIcons
                name={isExpanded ? "expand-less" : "expand-more"}
                size={20}
                color={colors.primary}
              />
              <Text
                numberOfLines={1}
                style={{
                  flex: 1,
                  fontSize: 13,
                  fontWeight: "600",
                  color: isExpanded ? colors.primary : colors.foreground,
                  textAlign: isRTL ? "right" : "left",
                  marginLeft: isRTL ? 0 : 8,
                  marginRight: isRTL ? 8 : 0,
                  writingDirection: isRTL ? "rtl" : "ltr",
                }}
              >
                {sub.heading}
              </Text>
            </Pressable>

            {/* Subsection content */}
            {isExpanded && (
              <View style={{ paddingHorizontal: 14, paddingVertical: 12, paddingTop: 8 }}>
                {sub.paragraphs.map((para, pIdx) => (
                  <Text
                    key={pIdx}
                    style={{
                      fontSize: 16,
                      color: colors.foreground,
                      textAlign: isRTL ? "right" : "left",
                      lineHeight: 28,
                      writingDirection: isRTL ? "rtl" : "ltr",
                      marginBottom: pIdx < sub.paragraphs.length - 1 ? 12 : 0,
                    }}
                  >
                    {para}
                  </Text>
                ))}
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}
