import { useState, useEffect } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useI18n } from "@/lib/i18n";

import { authedFetch } from "@/lib/authed-fetch";
import { sectionOwner } from "@/lib/plan-owner";
import { taskKeysOf, groupIntoSections, migrateLegacyTaskKeys, displayBlocks, type ParsedBlock } from "@/lib/plan-blocks";
import { planProgressKey } from "@/lib/plan-progress";
import { canonicalPlanText } from "@/lib/plan-text";
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
 * Whether useAutoTranslate's effect should actually fetch a translation --
 * pulled out of the effect as a plain function so it can be asserted on
 * directly. The hook itself can't be exercised in tests/treatment-renderer.test.ts
 * by rendering (a hook needs a real React renderer to run its effect, and
 * none is installed in this project), but a plain function needs no renderer.
 */
export function shouldFetchTranslation(
  text: string | undefined | null,
  language: string,
  enabled: boolean,
): text is string {
  const isArabic = isArabicText(text);
  const needsTranslation = (isArabic && language !== "ar") || (!isArabic && language === "ar");
  return !!(enabled && needsTranslation && text && text.trim());
}

/**
 * Auto-translates `text` into `language` when it looks like it was authored in a
 * different one, caching the result so the network call happens once per
 * (text, language) pair. Shared by the plan body below and by the issue's own
 * heading text (app/child/[id].tsx) above it — both must follow the reader's
 * chosen language the same way, through the same call path, not two of them.
 *
 * `text` can be undefined/null at runtime despite its TS type (issue.description
 * comes from AsyncStorage and partner-synced records, where the field can be
 * absent) — guarded below rather than trusted, since a viewer whose own
 * language is Arabic needs translation even of undefined text (isArabicText
 * treats "not Arabic" the same whether that's because the text is Latin or
 * because there's no text at all).
 *
 * `enabled` (default on) lets a caller that mounts unconditionally — unlike
 * the plan body, which only mounts once its section is expanded — defer the
 * network call until it actually needs the result, so N unopened cards don't
 * fire N POSTs to this LLM-backed, paid endpoint on first render.
 */
export function useAutoTranslate(text: string | undefined | null, language: string, enabled: boolean = true) {
  const [translated, setTranslated] = useState<string | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);
  const [translating, setTranslating] = useState(false);
  const isArabic = isArabicText(text);
  const needsTranslation = (isArabic && language !== "ar") || (!isArabic && language === "ar");

  // Resets only when the underlying content changes -- NOT when `enabled`
  // merely toggles (a card collapsing/reopening), so a translation already
  // fetched for this (text, language) survives the toggle instead of being
  // thrown away and re-fetched every time the card is reopened.
  useEffect(() => {
    setTranslated(null);
    setShowOriginal(false);
  }, [text, language]);

  useEffect(() => {
    let alive = true;
    if (!shouldFetchTranslation(text, language, enabled)) return;
    const key = `@plan_tr_${language}_${hashStr(text)}`;
    (async () => {
      try {
        const cached = await AsyncStorage.getItem(key);
        if (cached) { if (alive) setTranslated(cached); return; }
        if (alive) setTranslating(true);
        const res = await authedFetch(`/api/advice/translate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, targetLang: language }),
        });
        const data = await res.json();
        const tr = (data?.translation || "").trim();
        if (tr) { await AsyncStorage.setItem(key, tr); if (alive) setTranslated(tr); }
      } catch { /* keep original on failure */ }
      finally { if (alive) setTranslating(false); }
    })();
    return () => { alive = false; };
  }, [text, language, needsTranslation, enabled]);

  const effectiveText = (!showOriginal && translated) ? translated : (text || "");
  return { effectiveText, translated, translating, showOriginal, setShowOriginal, needsTranslation };
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
  /**
   * Bump to re-read the stored ticks without remounting. A screen that stays
   * mounted while another writes progress needs the refresh; remounting for it
   * would also reset which sections the parent had opened.
   */
  reloadTicks?: number;
}

/**
 * Group blocks into collapsible sections by heading1
 */
export function TreatmentPlanRenderer({ planText, issueId, colors, onProgressChange, reloadTicks }: TreatmentPlanRendererProps) {
  const { language, isRTL } = useI18n();
  const doneLabel = language === "ar" ? "مكتمل" : language === "en" ? "completed" : "voltooid";
  const trLabels = language === "ar"
    ? { translating: "جارٍ الترجمة…", auto: "مترجَمٌ آليًّا إلى لغتك", showOrig: "إظهار الأصل", showTr: "إظهار الترجمة" }
    : language === "en"
    ? { translating: "Translating…", auto: "Auto-translated to your language", showOrig: "Show original", showTr: "Show translation" }
    : { translating: "Aan het vertalen…", auto: "Automatisch vertaald naar jouw taal", showOrig: "Toon origineel", showTr: "Toon vertaling" };

  // Auto-translate the plan into the VIEWER's language when it was authored in a
  // different one (e.g. a father's Arabic plan viewed by a Dutch-speaking mother).
  const { effectiveText, translated, translating, showOriginal, setShowOriginal, needsTranslation } =
    useAutoTranslate(planText, language);

  // planText already comes cleaned for `language` -- every call site cleans
  // it before handing it down (see cleanTreatmentText's own doc comment) --
  // so it is NOT language-independent on its own: switching the UI language
  // changes the STRING, and content-derived keys (lib/plan-blocks.ts's
  // nextTaskKey) change with it. canonicalPlanText normalises away exactly
  // the part of that cleaning which varies with language, so canonicalText is
  // the same string no matter which UI language was active when planText was
  // produced. Every reader of this plan's progress -- the checkboxes below,
  // the bar, AsyncStorage, and the daily reminder in
  // lib/weekly-goals-notification.ts -- keys off this, never off planText or
  // effectiveText directly, so a tick means the same task everywhere
  // regardless of translation or UI language.
  const canonicalText = canonicalPlanText(planText);

  const [completedTasks, setCompletedTasks] = useState<Set<string>>(new Set());
  // Folded by default, which is what Daa3iyah asked for once he could actually
  // reach the plan (2026-08-16): the headings ARE the organisation, and he wants
  // to open the part he is working on. This was briefly expanded-by-default
  // while the plan appeared to be missing entirely — but the real cause was that
  // the message list never rendered past item 10, not the folding.
  const [expandedSections, setExpandedSections] = useState<Set<number>>(new Set());
  
  // Callers persist what this component reports, so nothing may be reported
  // before the stored ticks are in: the first render would otherwise save a 0
  // over a plan the parents had already worked through.
  const [ticksLoaded, setTicksLoaded] = useState(false);

  useEffect(() => {
    setTicksLoaded(false);
    AsyncStorage.getItem(planProgressKey(issueId)).then((raw) => {
      // Always replace, never leave the previous plan's ticks in state: with
      // onProgressChange wired up, switching to a plan that has no saved ticks
      // would report the old plan's count against the new one and then persist
      // those keys under the new plan on the first toggle.
      //
      // migrateLegacyTaskKeys upgrades any pre-existing "task-N" keys onto the
      // current content-derived scheme, against canonicalText -- never planText
      // or effectiveText, same reason as taskKeys below. It re-persists on the
      // next toggleTask (which saves whatever is in `next`, already migrated),
      // not here.
      const stored: string[] = raw ? JSON.parse(raw) : [];
      setCompletedTasks(new Set<string>(migrateLegacyTaskKeys(stored, canonicalText)));
      setTicksLoaded(true);
    }).catch(() => setTicksLoaded(true));
  }, [issueId, reloadTicks, canonicalText]);

  useEffect(() => {
    if (onProgressChange && ticksLoaded) {
      // Same parse the bar and the checkboxes use, so what the card caches
      // cannot disagree with what this screen shows.
      const keys = taskKeysOf(canonicalText);
      const done = keys.filter(k => completedTasks.has(k)).length;
      onProgressChange(done, keys.length);
    }
  }, [completedTasks, canonicalText, ticksLoaded]);
  
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
  
  // ONE key space for a plan's ticks: canonicalText's.
  //
  // Keys are content-derived (lib/plan-blocks.ts's nextTaskKey), so two
  // parses of DIFFERENT text for "the same" task -- a translation, or the
  // same plan cleaned for two different UI languages -- produce two
  // different keys for it. Measuring taskKeysOf(planText) against blocks
  // parsed from effectiveText (an earlier version of this file did exactly
  // that) silently failed to count a tick made on a translated box, because
  // planText and effectiveText are different text with disjoint key spaces.
  //
  // displayBlocks parses effectiveText for what's shown but keys every task
  // to its canonical position in canonicalText, so a tick made on a
  // translated/transliterated box always lands in the same key space the bar,
  // AsyncStorage, and lib/weekly-goals-notification.ts's reminder all count
  // against.
  const taskKeys = taskKeysOf(canonicalText);
  const blocks = displayBlocks(effectiveText, canonicalText);
  const sections = groupIntoSections(blocks, language);
  const totalTasks = taskKeys.length;
  const completedCount = taskKeys.filter(k => completedTasks.has(k)).length;
  // ponytail: a translation that drops a task leaves the reader unable to tick
  // the ones it lost, so the bar can sit below 100% with every visible box
  // ticked. That is the honest reading — the plan really does have more tasks
  // than the translation shows. No keying scheme fixes this: the task is simply
  // absent from what's on screen, so there is nothing there to tick.
  
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
        const sectionCompleted = section.taskKeys.filter(k => completedTasks.has(k)).length;
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
                      const isCompleted = completedTasks.has(block.key);
                      return (
                        <Pressable
                          key={idx}
                          onPress={() => toggleTask(block.key)}
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
