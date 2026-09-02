import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { View, Text, ScrollView, Pressable, StyleSheet, FlatList } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import {
  ADHKAR_CATEGORIES,
  POST_PRAYER_ADHKAR,
  categoryTitle,
  type Dhikr,
} from "@/lib/adhkar-data";
import { useI18n } from "@/lib/i18n";
import { loadAdhkarProgress, saveAdhkarProgress } from "@/lib/adhkar-progress";
import { isoToday } from "@/lib/haid";
import { rulingLabel } from "@/lib/notification-settings";

// Post-prayer specific additions
const POST_FAJR_EXTRA: Dhikr[] = [
  { id: "pf1", text: "اللهم إني أسألك علماً نافعاً، ورزقاً طيباً، وعملاً متقبلاً", count: 1, reward: "يقال بعد صلاة الفجر" },
];

const POST_MAGHRIB_EXTRA: Dhikr[] = [
  { id: "pm1", text: "لا إله إلا الله وحده لا شريك له، له الملك وله الحمد، يحيي ويميت وهو على كل شيء قدير", count: 10, reward: "يقال بعد المغرب — كتب له عشر حسنات" },
];

export default function AdhkarScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { language, t, isRTL } = useI18n();
  const showTranslit = language === "nl" || language === "en";
  const rowDir = useMemo(() => ({ flexDirection: isRTL ? "row-reverse" : "row" } as const), [isRTL]);
  const textDir = useMemo(() => ({ textAlign: isRTL ? "right" : "left", writingDirection: isRTL ? "rtl" : "ltr" } as const), [isRTL]);
  const params = useLocalSearchParams<{ type?: string; prayer?: string }>();

  const isPostPrayer = params.type === "post-prayer";
  const initialCategory = params.type || "morning";

  // Find the category from ADHKAR_CATEGORIES
  const [selectedCategoryId, setSelectedCategoryId] = useState(initialCategory);

  // Determine adhkar list based on type
  let adhkarList: Dhikr[];
  let title: string;
  let iconName: string;
  let accentColor: string;
  let bgAccent: string;

  if (isPostPrayer) {
    const prayer = params.prayer || "dhuhr";
    let extras: Dhikr[] = [];
    if (prayer === "fajr") extras = POST_FAJR_EXTRA;
    else if (prayer === "maghrib") extras = POST_MAGHRIB_EXTRA;
    adhkarList = [...POST_PRAYER_ADHKAR, ...extras];
    const name = ["fajr", "dhuhr", "asr", "maghrib", "isha"].includes(prayer)
      ? t(`prayer.${prayer}`)
      : language === "nl" ? "het gebed" : language === "en" ? "the prayer" : "الصلاة";
    title = language === "nl" ? `Adhkaar na ${name}` : language === "en" ? `Adhkaar after ${name}` : `أذكار بعد ${name}`;
    iconName = "mosque";
    accentColor = "#1B4332";
    bgAccent = "#E8F5E9";
  } else {
    const category = ADHKAR_CATEGORIES.find(c => c.id === selectedCategoryId);
    if (category) {
      adhkarList = category.adhkar;
      title = categoryTitle(category, language);
      iconName = category.icon;
      accentColor = category.color;
      bgAccent = category.color + "15";
    } else {
      // Fallback to morning
      const morning = ADHKAR_CATEGORIES[0];
      adhkarList = morning.adhkar;
      title = categoryTitle(morning, language);
      iconName = morning.icon;
      accentColor = morning.color;
      bgAccent = morning.color + "15";
    }
  }

  const [completedCounts, setCompletedCounts] = useState<Record<string, number>>({});
  // Only the type=post-prayer route skips persistence; the after_every_prayer
  // chip category recurs too, and its ids are dropped on save (lib/adhkar-progress.ts).
  const loadedRef = useRef(isPostPrayer);
  const dayRef = useRef(isoToday());
  useEffect(() => {
    if (!isPostPrayer) loadAdhkarProgress().then((stored) => {
      setCompletedCounts(stored);
      loadedRef.current = true;
    });
  }, [isPostPrayer]);
  // The loadedRef gate is what makes this effect safe: it cannot persist {} before the load.
  useEffect(() => {
    if (loadedRef.current && !isPostPrayer) saveAdhkarProgress(completedCounts).catch(() => {});
  }, [completedCounts, isPostPrayer]);

  const handleTap = useCallback((dhikrId: string, maxCount: number) => {
    // Past midnight while mounted, don't re-stamp yesterday's counts as today's.
    const day = isoToday();
    const rolled = dayRef.current !== day;
    dayRef.current = day;
    setCompletedCounts(prev => {
      // A tap before the load resolves would be persisted over today's counts.
      if (!loadedRef.current) return prev;
      const base: Record<string, number> = rolled ? {} : prev;
      const current = base[dhikrId] || 0;
      if (current >= maxCount) return prev;
      return { ...base, [dhikrId]: current + 1 };
    });
  }, []);

  const handleCategoryChange = useCallback((catId: string) => {
    setSelectedCategoryId(catId);
  }, []);

  const totalAdhkar = adhkarList.length;
  const completedAdhkar = adhkarList.filter(d => (completedCounts[d.id] || 0) >= d.count).length;

  const renderDhikrItem = useCallback(({ item, index }: { item: Dhikr; index: number }) => {
    const current = completedCounts[item.id] || 0;
    const isDone = current >= item.count;
    const left = item.count - current;
    return (
      <Pressable
        onPress={() => handleTap(item.id, item.count)}
        style={({ pressed }) => [
          st.dhikrCard,
          isDone && st.dhikrCardDone,
          pressed && !isDone && { backgroundColor: bgAccent },
        ]}
      >
        <View style={[st.dhikrHeader, rowDir]}>
          <View style={[st.countBadge, { backgroundColor: isDone ? "#22C55E" : accentColor }]}>
            {isDone ? (
              <MaterialIcons name="check" size={14} color="#FFFFFF" />
            ) : (
              <Text style={st.countBadgeText}>{current}/{item.count}</Text>
            )}
          </View>
          <View style={[rowDir, { alignItems: "center", gap: 6 }]}>
            {item.ruling && (
              <View style={[st.rulingBadge, { backgroundColor: item.ruling === "واجب" ? "#DC262620" : item.ruling === "سنة مؤكدة" ? "#05966920" : "#0891B220" }]}>
                <Text style={[st.rulingText, { color: item.ruling === "واجب" ? "#DC2626" : item.ruling === "سنة مؤكدة" ? "#059669" : "#0891B2" }]}>
                  {rulingLabel(item.ruling, language)}
                </Text>
              </View>
            )}
            <Text style={st.dhikrIndex}>{index + 1}</Text>
          </View>
        </View>
        <Text style={[st.dhikrText, isDone && st.dhikrTextDone]}>{item.text}</Text>
        {showTranslit && item.translit && (
          <Text style={st.translitText}>{item.translit}</Text>
        )}
        {language === "nl" && item.textNL && (
          <Text style={st.translationText}>{item.textNL}</Text>
        )}
        {language === "en" && item.textEN && (
          <Text style={st.translationText}>{item.textEN}</Text>
        )}
        {(() => {
          const reward = language === "nl" ? (item.rewardNL || item.reward) : language === "en" ? (item.rewardEN || item.reward) : item.reward;
          return reward ? (
            <View style={[st.rewardRow, rowDir]}>
              <MaterialIcons name="star" size={12} color="#C4A35A" />
              <Text style={[st.rewardText, textDir]}>{reward}</Text>
            </View>
          ) : null;
        })()}
        {(() => {
          const howTo = language === "nl" ? (item.howToNL || item.howTo) : language === "en" ? (item.howToEN || item.howTo) : item.howTo;
          return howTo ? (
            <Text style={[st.sourceText, textDir]}>{howTo}</Text>
          ) : null;
        })()}
        {/* A hadith reference stays Arabic in every language. */}
        {item.source && (
          <Text style={[st.sourceText, { textAlign: "right", writingDirection: "rtl" }]}>{item.source}</Text>
        )}
        {item.count > 1 && !isDone && (
          <Text style={[st.tapHint, { color: accentColor }]}>
            {language === "nl" ? `Tik nog ${left} keer` : language === "en" ? `Tap ${left} more ${left === 1 ? "time" : "times"}` : `اضغط ${left} ${left === 1 ? "مرة" : "مرات"}`}
          </Text>
        )}
      </Pressable>
    );
  }, [completedCounts, accentColor, bgAccent, handleTap, showTranslit, language, rowDir, textDir]);

  return (
    <View style={[st.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={[st.header, rowDir]}>
        <Pressable onPress={() => router.back()} style={({ pressed }) => [st.backBtn, pressed && { opacity: 0.5 }]}>
          <MaterialIcons name={isRTL ? "arrow-forward" : "arrow-back"} size={22} color="#1B4332" />
        </Pressable>
        <View style={[st.headerCenter, rowDir]}>
          <MaterialIcons name={iconName as any} size={26} color={accentColor} />
          <Text style={st.headerTitle} numberOfLines={2}>{title}</Text>
        </View>
        <View style={{ width: 36 }} />
      </View>

      {/* Category Tabs (only if not post-prayer) */}
      {!isPostPrayer && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={st.categoryScroll}
          style={st.categoryContainer}
        >
          {ADHKAR_CATEGORIES.map((cat) => (
            <Pressable
              key={cat.id}
              onPress={() => handleCategoryChange(cat.id)}
              style={({ pressed }) => [
                st.categoryTab,
                rowDir,
                selectedCategoryId === cat.id && { backgroundColor: cat.color, borderColor: cat.color },
                pressed && { opacity: 0.7 },
              ]}
            >
              <MaterialIcons
                name={cat.icon as any}
                size={16}
                color={selectedCategoryId === cat.id ? "#FFFFFF" : cat.color}
              />
              <Text
                style={[
                  st.categoryTabText,
                  selectedCategoryId === cat.id && { color: "#FFFFFF" },
                ]}
                numberOfLines={1}
              >
                {categoryTitle(cat, language)}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      {/* Progress */}
      <View style={[st.progressBar, { backgroundColor: bgAccent }]}>
        <Text style={[st.progressText, { color: accentColor }]}>{completedAdhkar} / {totalAdhkar}</Text>
        <View style={st.progressTrack}>
          <View style={[st.progressFill, { width: `${totalAdhkar > 0 ? (completedAdhkar / totalAdhkar) * 100 : 0}%`, backgroundColor: accentColor }]} />
        </View>
        {completedAdhkar === totalAdhkar && totalAdhkar > 0 && (
          <View style={[rowDir, { alignItems: "center", gap: 4, marginTop: 4 }]}>
            <MaterialIcons name="check-circle" size={16} color="#22C55E" />
            <Text style={{ fontSize: 12, fontWeight: "700", color: "#22C55E" }}>
              {language === "nl" ? "Goed gedaan! U heeft alle adhkaar voltooid" : language === "en" ? "Well done! You completed all the adhkaar" : "أحسنت! أتممت جميع الأذكار"}
            </Text>
          </View>
        )}
      </View>

      {/* Adhkar List */}
      <FlatList
        data={adhkarList}
        keyExtractor={(item) => item.id}
        renderItem={renderDhikrItem}
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FAFBFC" },
  header: { alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12 },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#F0F7F2", alignItems: "center", justifyContent: "center" },
  headerCenter: { flex: 1, alignItems: "center", gap: 8 },
  headerTitle: { fontSize: 20, fontWeight: "800", color: "#1B4332", flexShrink: 1, textAlign: "center" },
  categoryContainer: { flexGrow: 0, flexShrink: 0, marginBottom: 8 },
  categoryScroll: { paddingHorizontal: 16, gap: 8, alignItems: "center" },
  categoryTab: {
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: "#E5E7EB",
    backgroundColor: "#FFFFFF",
  },
  categoryTabText: { fontSize: 12, fontWeight: "600", color: "#374151", maxWidth: 200 },
  progressBar: { marginHorizontal: 16, borderRadius: 12, padding: 12, marginBottom: 12, alignItems: "center", gap: 6 },
  progressText: { fontSize: 13, fontWeight: "700" },
  progressTrack: { width: "100%", height: 6, borderRadius: 3, backgroundColor: "#E5E7EB" },
  progressFill: { height: 6, borderRadius: 3 },
  dhikrCard: { marginHorizontal: 16, marginBottom: 10, backgroundColor: "#FFFFFF", borderRadius: 14, borderWidth: 1, borderColor: "#E5E7EB", padding: 16 },
  dhikrCardDone: { backgroundColor: "#F0FDF4", borderColor: "#BBF7D0" },
  dhikrHeader: { alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  countBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, minWidth: 36, alignItems: "center" },
  countBadgeText: { fontSize: 11, fontWeight: "700", color: "#FFFFFF" },
  rulingBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  rulingText: { fontSize: 9, fontWeight: "700" },
  dhikrIndex: { fontSize: 12, fontWeight: "600", color: "#9CA3AF" },
  dhikrText: { fontSize: 16, fontWeight: "500", color: "#1F2937", lineHeight: 30, textAlign: "right", writingDirection: "rtl" },
  dhikrTextDone: { color: "#6B7280" },
  rewardRow: { alignItems: "flex-start", gap: 4, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: "#F3F4F6" },
  rewardText: { flex: 1, fontSize: 11, color: "#92400E", lineHeight: 18 },
  sourceText: { fontSize: 10, color: "#6B7280", marginTop: 4 },
  tapHint: { fontSize: 11, fontWeight: "600", textAlign: "center", marginTop: 8 },
  translitText: { fontSize: 13, color: "#4B5563", lineHeight: 22, marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: "#F3F4F6", textAlign: "left", writingDirection: "ltr", fontStyle: "italic" },
  translationText: { fontSize: 13, color: "#374151", lineHeight: 22, marginTop: 6, paddingTop: 6, borderTopWidth: 1, borderTopColor: "#F3F4F6", textAlign: "left", writingDirection: "ltr" },
});
