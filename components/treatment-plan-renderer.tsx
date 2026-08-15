import { useState, useEffect } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useI18n } from "@/lib/i18n";

import { authedFetch } from "@/lib/authed-fetch";
import { sectionOwner } from "@/lib/plan-owner";
import { parsePlanText, type ParsedBlock } from "@/lib/plan-blocks";
import { planProgressKey } from "@/lib/plan-progress";
// Per-text direction: align by the script of the text itself, so Arabic content
// stays readable (RTL) while non-Arabic content follows LTR — regardless of the
// stored plan's original language. The surrounding UI follows the user's choice.
function isArabicText(text: string | undefined | null): boolean {
  if (!text) return false;
  return /[؀-ۿ]/.test(text);
}
// Stable short hash for caching a translation per (plan text, target language).
function hashStr(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}
function textDir(text: string | undefined | null) {
  const ar = isArabicText(text);
  return { textAlign: ar ? ("right" as const) : ("left" as const), writingDirection: ar ? ("rtl" as const) : ("ltr" as const) };
}

/**
 * Treatment Plan Renderer
 * 
 * Renders treatment plan text with:
 * - Collapsible sections grouped by main headings
 * - Checkboxes on the RIGHT side (RTL)
 * - Checkboxes ONLY for complete tasks/goals
 * - Headings visually larger than body text
 * - Progress bar per section and overall
 */

interface Section {
  title: string;
  blocks: ParsedBlock[];
  taskKeys: string[];
}

interface TreatmentPlanRendererProps {
  planText: string;
  issueId: string;
  colors: {
    primary: string;
    foreground: string;
    muted: string;
    background: string;
    surface: string;
    border: string;
    success: string;
    warning: string;
    error: string;
  };
  onProgressChange?: (completed: number, total: number) => void;
}

/**
 * Group blocks into collapsible sections by heading1
 */
function groupIntoSections(blocks: ParsedBlock[]): Section[] {
  const sections: Section[] = [];
  let currentSection: Section = { title: "مقدمة", blocks: [], taskKeys: [] };
  
  for (const block of blocks) {
    if (block.type === "heading1") {
      // Save previous section if it has content
      if (currentSection.blocks.length > 0) {
        sections.push(currentSection);
      }
      currentSection = { title: block.text, blocks: [], taskKeys: [] };
    } else {
      currentSection.blocks.push(block);
      if (block.type === "task") {
        currentSection.taskKeys.push(block.key);
      }
    }
  }
  // Push last section
  if (currentSection.blocks.length > 0) {
    sections.push(currentSection);
  }
  
  return sections;
}

export function TreatmentPlanRenderer({ planText, issueId, colors, onProgressChange }: TreatmentPlanRendererProps) {
  const { language, isRTL } = useI18n();
  const doneLabel = language === "ar" ? "مكتمل" : language === "en" ? "completed" : "voltooid";
  const trLabels = language === "ar"
    ? { translating: "جارٍ الترجمة…", auto: "مترجَمٌ آليًّا إلى لغتك", showOrig: "إظهار الأصل", showTr: "إظهار الترجمة" }
    : language === "en"
    ? { translating: "Translating…", auto: "Auto-translated to your language", showOrig: "Show original", showTr: "Show translation" }
    : { translating: "Aan het vertalen…", auto: "Automatisch vertaald naar jouw taal", showOrig: "Toon origineel", showTr: "Toon vertaling" };

  // Auto-translate the plan into the VIEWER's language when it was authored in a
  // different one (e.g. a father's Arabic plan viewed by a Dutch-speaking mother).
  const [translated, setTranslated] = useState<string | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);
  const [translating, setTranslating] = useState(false);
  const planIsArabic = isArabicText(planText);
  const needsTranslation = (planIsArabic && language !== "ar") || (!planIsArabic && language === "ar");

  useEffect(() => {
    let alive = true;
    setTranslated(null);
    setShowOriginal(false);
    if (!needsTranslation || !planText.trim()) return;
    const key = `@plan_tr_${language}_${hashStr(planText)}`;
    (async () => {
      try {
        const cached = await AsyncStorage.getItem(key);
        if (cached) { if (alive) setTranslated(cached); return; }
        if (alive) setTranslating(true);
        const res = await authedFetch(`/api/advice/translate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: planText, targetLang: language }),
        });
        const data = await res.json();
        const tr = (data?.translation || "").trim();
        if (tr) { await AsyncStorage.setItem(key, tr); if (alive) setTranslated(tr); }
      } catch { /* keep original on failure */ }
      finally { if (alive) setTranslating(false); }
    })();
    return () => { alive = false; };
  }, [planText, language, needsTranslation]);

  const effectiveText = (!showOriginal && translated) ? translated : planText;

  const [completedTasks, setCompletedTasks] = useState<Set<string>>(new Set());
  const [expandedSections, setExpandedSections] = useState<Set<number>>(new Set());
  
  // Callers persist what this component reports, so nothing may be reported
  // before the stored ticks are in: the first render would otherwise save a 0
  // over a plan the parents had already worked through.
  const [ticksLoaded, setTicksLoaded] = useState(false);

  useEffect(() => {
    setTicksLoaded(false);
    AsyncStorage.getItem(planProgressKey(issueId)).then((raw) => {
      if (raw) {
        setCompletedTasks(new Set<string>(JSON.parse(raw)));
      }
      setTicksLoaded(true);
    }).catch(() => setTicksLoaded(true));
  }, [issueId]);

  useEffect(() => {
    if (onProgressChange && ticksLoaded) {
      // Both numbers come from the original text, never the translation on
      // screen: a plan's task count is a property of the plan, not of who is
      // reading it, and a numerator counted against a different parse can
      // exceed its own denominator.
      const keys = parsePlanText(planText).filter(b => b.type === "task").map(b => b.key);
      const done = keys.filter(k => completedTasks.has(k)).length;
      onProgressChange(done, keys.length);
    }
  }, [completedTasks, planText, ticksLoaded]);
  
  const toggleTask = async (key: string) => {
    const next = new Set(completedTasks);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setCompletedTasks(next);
    await AsyncStorage.setItem(planProgressKey(issueId), JSON.stringify([...next]));
  };
  
  const toggleSection = (idx: number) => {
    const next = new Set(expandedSections);
    if (next.has(idx)) next.delete(idx);
    else next.add(idx);
    setExpandedSections(next);
  };
  
  const blocks = parsePlanText(effectiveText);
  // Ticks are always stored against the ORIGINAL text's task keys. The blocks on
  // screen may come from the auto-translation, which parses to its own task-N
  // numbering; storing those would tick one plan under two different sets of
  // keys, and a task ticked in Dutch would read as undone in Arabic. Both parses
  // walk the plan in the same order, so the Nth task is the same task.
  const originalTaskKeys = parsePlanText(planText)
    .filter(b => b.type === "task")
    .map(b => b.key);
  const storedKey = (blockKey: string) =>
    originalTaskKeys[Number(blockKey.split("-")[1])] ?? blockKey;
  const sections = groupIntoSections(blocks);
  // Counted the same way as what this component reports to its caller, so the
  // bar on screen and the number the card caches cannot disagree.
  const totalTasks = originalTaskKeys.length;
  const completedCount = originalTaskKeys.filter(k => completedTasks.has(k)).length;
  
  return (
    <View style={styles.container}>
      {/* Auto-translation notice + toggle (shown when the plan is in another language) */}
      {needsTranslation && (translating || translated) ? (
        <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 10, backgroundColor: colors.primary + "12", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7 }}>
          <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 6, flex: 1 }}>
            <MaterialIcons name="translate" size={14} color={colors.primary} />
            <Text style={{ fontSize: 11, color: colors.primary, flex: 1, textAlign: isRTL ? "right" : "left" }}>
              {translating ? trLabels.translating : trLabels.auto}
            </Text>
          </View>
          {translated ? (
            <Pressable onPress={() => setShowOriginal((v) => !v)} hitSlop={8}>
              <Text style={{ fontSize: 11, fontWeight: "700", color: colors.primary }}>
                {showOriginal ? trLabels.showTr : trLabels.showOrig}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {/* Overall Progress bar */}
      {totalTasks > 0 && (
        <View style={styles.progressContainer}>
          <View style={[styles.progressBar, { backgroundColor: colors.border }]}>
            <View style={[
              styles.progressFill, 
              { backgroundColor: colors.primary, width: `${totalTasks > 0 ? (completedCount / totalTasks) * 100 : 0}%` }
            ]} />
          </View>
          <Text style={[styles.progressText, { color: colors.muted, textAlign: isRTL ? "right" : "left", writingDirection: isRTL ? "rtl" : "ltr" }]}>
            {completedCount}/{totalTasks} {doneLabel}
          </Text>
        </View>
      )}
      
      {/* Collapsible sections */}
      {sections.map((section, sIdx) => {
        const isExpanded = expandedSections.has(sIdx);
        const sectionCompleted = section.taskKeys.filter(k => completedTasks.has(storedKey(k))).length;
        const sectionTotal = section.taskKeys.length;
        const owner = sectionOwner(section.title);
        
        return (
          <View key={sIdx} style={[styles.sectionContainer, { borderColor: isExpanded ? colors.primary + "40" : colors.border }]}>
            {/* Section header - always visible */}
            <Pressable
              onPress={() => toggleSection(sIdx)}
              style={({ pressed }) => [{
                flexDirection: isArabicText(section.title) ? "row-reverse" : "row",
                alignItems: "center",
                justifyContent: "space-between",
                padding: 12,
                backgroundColor: isExpanded ? colors.primary + "08" : "transparent",
                opacity: pressed ? 0.8 : 1,
              }]}
            >
              <View style={{ flex: 1 }}>
                {owner && (
                  <View
                    style={{
                      alignSelf: isArabicText(section.title) ? "flex-end" : "flex-start",
                      backgroundColor:
                        (owner.role === "parent" ? colors.primary : colors.success) + "18",
                      borderRadius: 6,
                      paddingHorizontal: 8,
                      paddingVertical: 2,
                      marginBottom: 4,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 11,
                        fontWeight: "700",
                        color: owner.role === "parent" ? colors.primary : colors.success,
                      }}
                    >
                      {owner.label}
                    </Text>
                  </View>
                )}
                <Text style={{
                  fontSize: 15,
                  fontWeight: "800",
                  color: isExpanded ? colors.primary : colors.foreground,
                  ...textDir(section.title),
                }}>
                  {section.title}
                </Text>
                {sectionTotal > 0 && (
                  <Text style={{ fontSize: 11, color: colors.muted, marginTop: 2, ...textDir(section.title) }}>
                    {sectionCompleted}/{sectionTotal} {doneLabel}
                  </Text>
                )}
              </View>
              <Text style={{ fontSize: 14, color: colors.primary, marginHorizontal: 8 }}>
                {isExpanded ? "▲" : "▼"}
              </Text>
            </Pressable>
            
            {/* Section content - collapsible */}
            {isExpanded && (
              <View style={{ paddingHorizontal: 12, paddingBottom: 12 }}>
                {section.blocks.map((block, idx) => {
                  switch (block.type) {
                    case "heading2":
                      return (
                        <Text key={idx} style={[styles.heading2, { color: colors.foreground }, textDir(block.text)]}>
                          {block.text}
                        </Text>
                      );
                    case "heading3":
                      return (
                        <Text key={idx} style={[styles.heading3, { color: colors.foreground }, textDir(block.text)]}>
                          {block.text}
                        </Text>
                      );
                    case "paragraph":
                      return (
                        <Text key={idx} style={[styles.paragraph, { color: colors.foreground }, textDir(block.text)]}>
                          {block.text}
                        </Text>
                      );
                    case "task":
                      const isCompleted = completedTasks.has(storedKey(block.key));
                      return (
                        <Pressable
                          key={idx}
                          onPress={() => toggleTask(storedKey(block.key))}
                          style={({ pressed }) => [styles.taskRow, { flexDirection: isArabicText(block.text) ? "row-reverse" : "row", opacity: pressed ? 0.7 : 1 }]}
                        >
                          <Text style={[
                            styles.taskText,
                            { color: isCompleted ? colors.muted : colors.foreground },
                            textDir(block.text),
                            isCompleted && styles.taskTextCompleted,
                          ]}>
                            {block.text}
                          </Text>
                          <View style={[
                            styles.checkbox,
                            {
                              borderColor: isCompleted ? colors.primary : colors.muted,
                              backgroundColor: isCompleted ? colors.primary : "transparent",
                            }
                          ]}>
                            {isCompleted && <Text style={styles.checkmark}>✓</Text>}
                          </View>
                        </Pressable>
                      );
                    case "separator":
                      return <View key={idx} style={[styles.separator, { backgroundColor: colors.border }]} />;
                    case "warning":
                      return (
                        <View key={idx} style={[styles.warningBox, { backgroundColor: colors.warning + "15", borderColor: colors.warning + "40" }]}>
                          <Text style={[styles.warningText, { color: colors.warning }, textDir(block.text)]}>
                            ⚠️ {block.text}
                          </Text>
                        </View>
                      );
                    default:
                      return null;
                  }
                })}
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 8,
  },
  progressContainer: {
    marginBottom: 16,
  },
  progressBar: {
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
  },
  progressFill: {
    height: 6,
    borderRadius: 3,
  },
  progressText: {
    fontSize: 11,
    marginTop: 4,
    textAlign: "right",
    writingDirection: "rtl",
  },
  sectionContainer: {
    borderWidth: 1,
    borderRadius: 10,
    marginBottom: 8,
    overflow: "hidden",
  },
  heading2: {
    fontSize: 15,
    fontWeight: "700",
    textAlign: "right",
    writingDirection: "rtl",
    marginTop: 14,
    marginBottom: 6,
  },
  heading3: {
    fontSize: 13,
    fontWeight: "600",
    textAlign: "right",
    writingDirection: "rtl",
    marginTop: 10,
    marginBottom: 4,
  },
  paragraph: {
    fontSize: 13,
    lineHeight: 22,
    textAlign: "right",
    writingDirection: "rtl",
    marginBottom: 6,
  },
  taskRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 8,
    gap: 10,
  },
  taskText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 22,
    textAlign: "right",
    writingDirection: "rtl",
  },
  taskTextCompleted: {
    textDecorationLine: "line-through",
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 4,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  checkmark: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "bold",
  },
  separator: {
    height: 1,
    marginVertical: 12,
  },
  warningBox: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    marginVertical: 8,
  },
  warningText: {
    fontSize: 12,
    textAlign: "right",
    writingDirection: "rtl",
    lineHeight: 20,
  },
});
