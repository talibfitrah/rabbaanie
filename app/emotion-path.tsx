import { useState, useEffect } from "react";
import { View, Text, ScrollView, Pressable, LayoutAnimation, Platform, UIManager } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useColors } from "@/hooks/use-colors";
import { useI18n } from "@/lib/i18n";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type Lang = "nl" | "en" | "ar";

// Import emotion path data
import emotionPathData from "@/assets/data/emotion_path.json";

const STORAGE_KEY = "emotion_path_progress";

interface WeekProgress {
  parentDone: boolean[];
  childDone: boolean[];
  startedAt?: string;
}

type ProgressMap = Record<number, WeekProgress>;

export default function EmotionPathScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { language, isRTL } = useI18n();
  const lang = language as Lang;

  const [progress, setProgress] = useState<ProgressMap>({});
  const [expandedWeek, setExpandedWeek] = useState<number | null>(null);
  const [currentWeek, setCurrentWeek] = useState(1);

  useEffect(() => {
    loadProgress();
  }, []);

  const loadProgress = async () => {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        setProgress(parsed);
        // Determine current week based on progress
        let maxCompleted = 0;
        for (let w = 1; w <= 7; w++) {
          const wp = parsed[w];
          if (wp && wp.parentDone.every((d: boolean) => d) && wp.childDone.every((d: boolean) => d)) {
            maxCompleted = w;
          }
        }
        setCurrentWeek(Math.min(maxCompleted + 1, 7));
      }
    } catch {}
  };

  const saveProgress = async (newProgress: ProgressMap) => {
    setProgress(newProgress);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(newProgress));
  };

  const toggleTask = (week: number, type: "parent" | "child", index: number) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    const wp = progress[week] || {
      parentDone: new Array(emotionPathData.weeks[week - 1].parent_tasks.length).fill(false),
      childDone: new Array(emotionPathData.weeks[week - 1].child_tasks.length).fill(false),
      startedAt: new Date().toISOString(),
    };
    if (type === "parent") {
      wp.parentDone[index] = !wp.parentDone[index];
    } else {
      wp.childDone[index] = !wp.childDone[index];
    }
    const newProgress = { ...progress, [week]: wp };
    saveProgress(newProgress);
  };

  const getWeekCompletion = (week: number): number => {
    const wp = progress[week];
    if (!wp) return 0;
    const weekData = emotionPathData.weeks[week - 1];
    const total = weekData.parent_tasks.length + weekData.child_tasks.length;
    const done = wp.parentDone.filter(Boolean).length + wp.childDone.filter(Boolean).length;
    return Math.round((done / total) * 100);
  };

  const getDomainColor = (domain: string): string => {
    switch (domain) {
      case "tasfiya": return "#2196F3";
      case "tazkiya": return "#9C27B0";
      case "tarbiya": return "#4CAF50";
      default: return colors.primary;
    }
  };

  const getDomainLabel = (domain: string): string => {
    if (lang === "ar") {
      return domain === "tasfiya" ? "التصفية" : domain === "tazkiya" ? "التزكية" : "التربية";
    } else if (lang === "en") {
      return domain === "tasfiya" ? "Tasfiya (Mind)" : domain === "tazkiya" ? "Tazkiya (Heart)" : "Tarbiya (Behavior)";
    }
    return domain === "tasfiya" ? "Tasfiya (Verstand)" : domain === "tazkiya" ? "Tazkiya (Hart)" : "Tarbiya (Gedrag)";
  };

  const tx = (item: { ar: string; nl: string; en: string }): string => {
    return lang === "ar" ? item.ar : lang === "en" ? item.en : item.nl;
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ paddingTop: insets.top + 12, paddingHorizontal: 16, paddingBottom: 12, backgroundColor: "#1B4332" }}>
        <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 12 }}>
          <Pressable onPress={() => router.back()} style={({ pressed }) => [{ opacity: pressed ? 0.5 : 1 }]}>
            <MaterialIcons name={isRTL ? "arrow-forward" : "arrow-back"} size={24} color="#fff" />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 20, fontWeight: "800", color: "#fff" }}>
              {tx(emotionPathData.title)}
            </Text>
            <Text style={{ fontSize: 12, color: "#C4A35A", marginTop: 2 }}>
              {tx(emotionPathData.methodology)}
            </Text>
          </View>
        </View>
      </View>

      {/* Progress Overview */}
      <View style={{ paddingHorizontal: 16, paddingVertical: 12, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <View style={{ flexDirection: isRTL ? "row-reverse" : "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }}>
            {lang === "ar" ? `الأسبوع ${currentWeek} من 7` : lang === "en" ? `Week ${currentWeek} of 7` : `Week ${currentWeek} van 7`}
          </Text>
          <View style={{ flexDirection: isRTL ? "row-reverse" : "row", gap: 4 }}>
            {[1, 2, 3, 4, 5, 6, 7].map(w => (
              <View key={w} style={{
                width: 28, height: 28, borderRadius: 14,
                backgroundColor: getWeekCompletion(w) === 100 ? "#4CAF50" : w === currentWeek ? "#C4A35A" : colors.border,
                alignItems: "center", justifyContent: "center"
              }}>
                <Text style={{ fontSize: 11, fontWeight: "700", color: getWeekCompletion(w) === 100 ? "#fff" : w === currentWeek ? "#fff" : colors.muted }}>
                  {w}
                </Text>
              </View>
            ))}
          </View>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 40, paddingHorizontal: 16, paddingTop: 12 }}>
        {emotionPathData.weeks.map((week, idx) => {
          const weekNum = idx + 1;
          const isExpanded = expandedWeek === weekNum;
          const completion = getWeekCompletion(weekNum);
          const domainColor = getDomainColor(week.domain);
          const isLocked = weekNum > currentWeek + 1;

          return (
            <View key={weekNum} style={{ marginBottom: 12 }}>
              {/* Week Header */}
              <Pressable
                onPress={() => {
                  if (!isLocked) {
                    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                    setExpandedWeek(isExpanded ? null : weekNum);
                  }
                }}
                style={({ pressed }) => [{
                  backgroundColor: isLocked ? colors.border + "50" : pressed ? domainColor + "15" : colors.surface,
                  borderRadius: 14,
                  padding: 14,
                  borderWidth: 1.5,
                  borderColor: isExpanded ? domainColor : colors.border,
                  opacity: isLocked ? 0.5 : 1,
                }]}
              >
                <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 12 }}>
                  <View style={{
                    width: 40, height: 40, borderRadius: 20,
                    backgroundColor: completion === 100 ? "#4CAF50" : domainColor + "20",
                    alignItems: "center", justifyContent: "center"
                  }}>
                    {completion === 100 ? (
                      <MaterialIcons name="check" size={22} color="#fff" />
                    ) : (
                      <Text style={{ fontSize: 16, fontWeight: "800", color: domainColor }}>{weekNum}</Text>
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: "700", color: colors.foreground, textAlign: isRTL ? "right" : "left" }}>
                      {tx(week.title)}
                    </Text>
                    <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 6, marginTop: 4 }}>
                      <View style={{ backgroundColor: domainColor + "20", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 }}>
                        <Text style={{ fontSize: 10, fontWeight: "600", color: domainColor }}>{getDomainLabel(week.domain)}</Text>
                      </View>
                      {completion > 0 && (
                        <Text style={{ fontSize: 11, color: colors.muted }}>{completion}%</Text>
                      )}
                    </View>
                  </View>
                  <MaterialIcons name={isExpanded ? "expand-less" : "expand-more"} size={24} color={colors.muted} />
                </View>
              </Pressable>

              {/* Expanded Content */}
              {isExpanded && (
                <View style={{ marginTop: 8, backgroundColor: colors.surface, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: colors.border }}>
                  {/* Focus */}
                  <View style={{ backgroundColor: domainColor + "10", borderRadius: 10, padding: 10, marginBottom: 12 }}>
                    <Text style={{ fontSize: 12, color: domainColor, fontWeight: "600", textAlign: isRTL ? "right" : "left" }}>
                      {tx(week.focus)}
                    </Text>
                  </View>

                  {/* Evidence */}
                  <View style={{ backgroundColor: "#FFF8E1", borderRadius: 10, padding: 10, marginBottom: 14, borderLeftWidth: isRTL ? 0 : 3, borderRightWidth: isRTL ? 3 : 0, borderColor: "#C4A35A" }}>
                    <Text style={{ fontSize: 12, color: "#5D4037", lineHeight: 18, textAlign: isRTL ? "right" : "left", fontStyle: "italic" }}>
                      {tx(week.evidence)}
                    </Text>
                  </View>

                  {/* Parent Tasks */}
                  <Text style={{ fontSize: 14, fontWeight: "700", color: "#1B4332", marginBottom: 8, textAlign: isRTL ? "right" : "left" }}>
                    {lang === "ar" ? "مهام الوالد:" : lang === "en" ? "Parent tasks:" : "Taken voor de ouder:"}
                  </Text>
                  {week.parent_tasks.map((task, tIdx) => {
                    const wp = progress[weekNum];
                    const isDone = wp?.parentDone?.[tIdx] || false;
                    return (
                      <Pressable
                        key={tIdx}
                        onPress={() => toggleTask(weekNum, "parent", tIdx)}
                        style={({ pressed }) => [{
                          flexDirection: isRTL ? "row-reverse" : "row",
                          alignItems: "flex-start",
                          gap: 10,
                          paddingVertical: 8,
                          opacity: pressed ? 0.7 : 1,
                        }]}
                      >
                        <View style={{
                          width: 22, height: 22, borderRadius: 6,
                          borderWidth: 2, borderColor: isDone ? "#4CAF50" : colors.border,
                          backgroundColor: isDone ? "#4CAF50" : "transparent",
                          alignItems: "center", justifyContent: "center", marginTop: 1,
                        }}>
                          {isDone && <MaterialIcons name="check" size={14} color="#fff" />}
                        </View>
                        <Text style={{
                          flex: 1, fontSize: 13, lineHeight: 19, color: isDone ? colors.muted : colors.foreground,
                          textDecorationLine: isDone ? "line-through" : "none",
                          textAlign: isRTL ? "right" : "left",
                        }}>
                          {tx(task)}
                        </Text>
                      </Pressable>
                    );
                  })}

                  {/* Child Tasks */}
                  <Text style={{ fontSize: 14, fontWeight: "700", color: "#1565C0", marginTop: 14, marginBottom: 8, textAlign: isRTL ? "right" : "left" }}>
                    {lang === "ar" ? "مهام الطفل:" : lang === "en" ? "Child tasks:" : "Taken voor het kind:"}
                  </Text>
                  {week.child_tasks.map((task, tIdx) => {
                    const wp = progress[weekNum];
                    const isDone = wp?.childDone?.[tIdx] || false;
                    return (
                      <Pressable
                        key={tIdx}
                        onPress={() => toggleTask(weekNum, "child", tIdx)}
                        style={({ pressed }) => [{
                          flexDirection: isRTL ? "row-reverse" : "row",
                          alignItems: "flex-start",
                          gap: 10,
                          paddingVertical: 8,
                          opacity: pressed ? 0.7 : 1,
                        }]}
                      >
                        <View style={{
                          width: 22, height: 22, borderRadius: 6,
                          borderWidth: 2, borderColor: isDone ? "#4CAF50" : colors.border,
                          backgroundColor: isDone ? "#4CAF50" : "transparent",
                          alignItems: "center", justifyContent: "center", marginTop: 1,
                        }}>
                          {isDone && <MaterialIcons name="check" size={14} color="#fff" />}
                        </View>
                        <Text style={{
                          flex: 1, fontSize: 13, lineHeight: 19, color: isDone ? colors.muted : colors.foreground,
                          textDecorationLine: isDone ? "line-through" : "none",
                          textAlign: isRTL ? "right" : "left",
                        }}>
                          {tx(task)}
                        </Text>
                      </Pressable>
                    );
                  })}

                  {/* Dhikr */}
                  <View style={{ marginTop: 14, backgroundColor: "#E8F5E9", borderRadius: 10, padding: 12, alignItems: "center" }}>
                    <Text style={{ fontSize: 11, fontWeight: "600", color: "#2E7D32", marginBottom: 4 }}>
                      {lang === "ar" ? "ذكر الأسبوع" : lang === "en" ? "Weekly dhikr" : "Dhikr van de week"}
                    </Text>
                    <Text style={{ fontSize: 14, fontWeight: "700", color: "#1B5E20", textAlign: "center", lineHeight: 22 }}>
                      {tx(week.dhikr)}
                    </Text>
                  </View>
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}
