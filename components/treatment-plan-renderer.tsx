import { useState, useEffect } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useI18n } from "@/lib/i18n";

// Per-text direction: align by the script of the text itself, so Arabic content
// stays readable (RTL) while non-Arabic content follows LTR — regardless of the
// stored plan's original language. The surrounding UI follows the user's choice.
function isArabicText(text: string | undefined | null): boolean {
  if (!text) return false;
  return /[؀-ۿ]/.test(text);
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

type ParsedBlock =
  | { type: "heading1"; text: string }
  | { type: "heading2"; text: string }
  | { type: "heading3"; text: string }
  | { type: "paragraph"; text: string }
  | { type: "task"; text: string; key: string }
  | { type: "separator" }
  | { type: "warning"; text: string };

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

function cleanMarkdown(text: string): string {
  return text
    .replace(/\*\*/g, "")
    .replace(/\*/g, "")
    .replace(/^#{1,6}\s*/, "")
    .replace(/^[-•]\s*/, "")
    .replace(/^\d+\.\s*/, "")
    .trim();
}

function isCompleteTask(line: string): boolean {
  const cleaned = cleanMarkdown(line);
  if (cleaned.length < 10 || cleaned.length > 300) return false;
  const isBulleted = /^[-•*]\s*/.test(line.trim()) || /^\d+\.\s/.test(line.trim());
  if (!isBulleted) return false;
  if (cleaned.startsWith("أي ") && cleaned.includes("؟")) return false;
  if (cleaned.startsWith('"') || cleaned.startsWith('«') || cleaned.startsWith('"')) return false;
  if (cleaned.startsWith("مثل:") || cleaned.startsWith("مثال:")) return false;
  return true;
}

function isHeading1(trimmed: string): boolean {
  const h1Match = trimmed.match(/^(?:#{1,2}\s+|(?:\*\*)?(\d+)\.\s*)(.+?)(?:\*\*)?$/);
  if (h1Match && (
    trimmed.includes("تشخيص") || 
    trimmed.includes("مهام الوالد") || 
    trimmed.includes("مهام الابن") || 
    trimmed.includes("مهام البنت") ||
    trimmed.includes("الجدول الزمني") ||
    trimmed.includes("التحليل") ||
    trimmed.includes("علاج في") ||
    /^#{1,2}\s/.test(trimmed) ||
    /^\*\*\d+\./.test(trimmed)
  )) return true;
  // Also match standalone section titles like "التشخيص:" or "علاج في التصفية:"
  if (
    /^(التشخيص|تشخيص|علاج ?في|مهام)/.test(trimmed) &&
    (trimmed.endsWith(":") || trimmed.endsWith("،") || trimmed.length < 40)
  ) return true;
  return false;
}

function parsePlanText(text: string): ParsedBlock[] {
  if (!text) return [];
  const lines = text.split("\n");
  const blocks: ParsedBlock[] = [];
  let taskIndex = 0;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) continue;
    
    if (trimmed === "---" || trimmed === "***" || trimmed === "___") {
      blocks.push({ type: "separator" });
      continue;
    }
    
    if (trimmed.includes("التربية القصيرة المدى مبنية على التربية الطويلة المدى") ||
        trimmed.includes("بدونها لن تفلح")) {
      blocks.push({ type: "warning", text: cleanMarkdown(trimmed) });
      continue;
    }
    
    if (isHeading1(trimmed)) {
      blocks.push({ type: "heading1", text: cleanMarkdown(trimmed) });
      continue;
    }
    
    if (
      trimmed.match(/^(?:#{3}\s+|(?:\*\*)?)(?:تمهيد|تصفية|تزكية|تربية|التعليم|التذكير|الموعظة|الزجر|العقاب|الأسبوع)/) ||
      trimmed.match(/^(?:\*\*)?(?:تمهيد|تصفية|تزكية|تربية)(?:\s*\(|:|\*\*)/) ||
      trimmed.match(/^#{3}\s/)
    ) {
      blocks.push({ type: "heading2", text: cleanMarkdown(trimmed) });
      continue;
    }
    
    if (trimmed.match(/^#{4,6}\s/) || (trimmed.startsWith("**") && trimmed.endsWith("**") && trimmed.length < 80)) {
      blocks.push({ type: "heading3", text: cleanMarkdown(trimmed) });
      continue;
    }
    
    if (/^\d+\.\s/.test(trimmed) && !line.startsWith("  ") && !line.startsWith("\t")) {
      const cleaned = cleanMarkdown(trimmed);
      if (cleaned.length < 100 && (
        cleaned.includes("تشخيص") || cleaned.includes("مهام") || cleaned.includes("الجدول") ||
        cleaned.includes("التقييم") || cleaned.includes("العلاج")
      )) {
        blocks.push({ type: "heading1", text: cleaned });
      } else if (isCompleteTask(trimmed)) {
        blocks.push({ type: "task", text: cleaned, key: `task-${taskIndex++}` });
      } else {
        blocks.push({ type: "paragraph", text: cleaned });
      }
      continue;
    }
    
    if (/^[-•*]\s/.test(trimmed) || /^\s+[-•*]\s/.test(line) || /^\s+\d+\.\s/.test(line)) {
      const cleaned = cleanMarkdown(trimmed);
      if (isCompleteTask(trimmed)) {
        blocks.push({ type: "task", text: cleaned, key: `task-${taskIndex++}` });
      } else {
        blocks.push({ type: "paragraph", text: cleaned });
      }
      continue;
    }
    
    blocks.push({ type: "paragraph", text: cleanMarkdown(trimmed) });
  }
  
  return blocks;
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
  const [completedTasks, setCompletedTasks] = useState<Set<string>>(new Set());
  const [expandedSections, setExpandedSections] = useState<Set<number>>(new Set());
  
  useEffect(() => {
    AsyncStorage.getItem(`@treatment_tasks_${issueId}`).then((raw) => {
      if (raw) {
        setCompletedTasks(new Set<string>(JSON.parse(raw)));
      }
    }).catch(() => {});
  }, [issueId]);
  
  useEffect(() => {
    if (onProgressChange) {
      const blocks = parsePlanText(planText);
      const totalTasks = blocks.filter(b => b.type === "task").length;
      onProgressChange(completedTasks.size, totalTasks);
    }
  }, [completedTasks, planText]);
  
  const toggleTask = async (key: string) => {
    const next = new Set(completedTasks);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setCompletedTasks(next);
    await AsyncStorage.setItem(`@treatment_tasks_${issueId}`, JSON.stringify([...next]));
  };
  
  const toggleSection = (idx: number) => {
    const next = new Set(expandedSections);
    if (next.has(idx)) next.delete(idx);
    else next.add(idx);
    setExpandedSections(next);
  };
  
  const blocks = parsePlanText(planText);
  const sections = groupIntoSections(blocks);
  const totalTasks = blocks.filter(b => b.type === "task").length;
  const completedCount = completedTasks.size;
  
  return (
    <View style={styles.container}>
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
