import { useState, useEffect } from "react";
import {
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  Platform,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { useI18n } from "@/lib/i18n";
import { useL3 } from "@/lib/admin-text";
import { trpc } from "@/lib/trpc";
import * as Haptics from "expo-haptics";

export default function NewsletterEditorScreen() {
  const colors = useColors();
  const { isRTL } = useI18n();
  const L3 = useL3();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const isEditing = !!id;

  // `audience` is a stored DB column (read back via trpc.newsletter.get), so
  // the key stays "all"/"parents"/"teachers"/"specialists" unchanged — only
  // the displayed label is trilingual, mirroring content.tsx's TYPES array.
  const AUDIENCES = [
    { key: "all", label: L3("الجميع", "Iedereen", "Everyone") },
    { key: "parents", label: L3("أولياء الأمور", "Ouders", "Parents") },
    { key: "teachers", label: L3("المعلمون", "Leraren", "Teachers") },
    { key: "specialists", label: L3("المشرفون التربويّون", "Pedagogisch begeleiders", "Educational specialists") },
  ];
  const ELEMENT_TYPE_LABEL: Record<string, string> = {
    poll: L3("استطلاع", "Peiling", "Poll"),
    quiz: L3("اختبار", "Quiz", "Quiz"),
    reflection: L3("تأمل", "Reflectie", "Reflection"),
  };

  const [titleNl, setTitleNl] = useState("");
  const [titleEn, setTitleEn] = useState("");
  const [titleAr, setTitleAr] = useState("");
  const [contentNl, setContentNl] = useState("");
  const [contentEn, setContentEn] = useState("");
  const [contentAr, setContentAr] = useState("");
  const [audience, setAudience] = useState("all");
  const [interactiveElements, setInteractiveElements] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);

  const existingQuery = trpc.newsletter.get.useQuery(
    { id: parseInt(id || "0") },
    { enabled: isEditing }
  );

  useEffect(() => {
    if (existingQuery.data) {
      const d = existingQuery.data;
      setTitleNl(d.titleNl || "");
      setTitleEn(d.titleEn || "");
      setTitleAr(d.titleAr || "");
      setContentNl(d.contentNl || "");
      setContentEn(d.contentEn || "");
      setContentAr(d.contentAr || "");
      setAudience(d.audience || "all");
      setInteractiveElements(Array.isArray(d.interactiveElements) ? d.interactiveElements : []);
    }
  }, [existingQuery.data]);

  const createMutation = trpc.newsletter.create.useMutation();
  const updateMutation = trpc.newsletter.update.useMutation();

  const handleSave = async () => {
    setSaving(true);
    try {
      const data = {
        titleNl: titleNl || undefined,
        titleEn: titleEn || undefined,
        titleAr: titleAr || undefined,
        contentNl: contentNl || undefined,
        contentEn: contentEn || undefined,
        contentAr: contentAr || undefined,
        audience,
        interactiveElements: interactiveElements.length > 0 ? interactiveElements : undefined,
      };
      if (isEditing) {
        await updateMutation.mutateAsync({ id: parseInt(id!), ...data });
      } else {
        await createMutation.mutateAsync(data);
      }
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (e: any) {
      Alert.alert(L3("خطأ", "Fout", "Error"), e.message || L3("تعذّر الحفظ", "Opslaan is mislukt", "Could not save"));
    } finally {
      setSaving(false);
    }
  };

  const addPoll = () => {
    setInteractiveElements([
      ...interactiveElements,
      { type: "poll", question: "", options: ["", ""] },
    ]);
  };

  const addQuiz = () => {
    setInteractiveElements([
      ...interactiveElements,
      { type: "quiz", question: "", options: ["", "", ""], correctIndex: 0 },
    ]);
  };

  const addReflection = () => {
    setInteractiveElements([
      ...interactiveElements,
      { type: "reflection", prompt: "" },
    ]);
  };

  return (
    <ScreenContainer>
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 py-3 border-b border-border" style={{ flexDirection: isRTL ? "row-reverse" : "row" }}>
        <TouchableOpacity onPress={() => router.back()}>
          {/* IconSymbol has no "chevron.left" mapping — chevron.right mirrored via
              scaleX gives a left-pointing arrow for LTR; RTL leaves it unflipped
              so it points right, matching every other back-arrow in app/admin. */}
          <IconSymbol name="chevron.right" size={24} color={colors.primary} style={isRTL ? undefined : { transform: [{ scaleX: -1 }] }} />
        </TouchableOpacity>
        <Text className="text-lg font-bold text-foreground">
          {isEditing ? L3("تعديل النشرة", "Nieuwsbrief bewerken", "Edit newsletter") : L3("نشرة جديدة", "Nieuwe nieuwsbrief", "New newsletter")}
        </Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView className="flex-1 px-4" contentContainerStyle={{ paddingVertical: 16, gap: 16 }}>
        {/* Audience */}
        <View>
          <Text className="text-sm font-semibold text-foreground mb-2">{L3("الفئة المستهدفة", "Doelgroep", "Audience")}</Text>
          <View className="flex-row gap-2 flex-wrap" style={{ flexDirection: isRTL ? "row-reverse" : "row" }}>
            {AUDIENCES.map((opt) => (
              <TouchableOpacity
                key={opt.key}
                className={`px-3 py-2 rounded-lg ${audience === opt.key ? "bg-primary" : "bg-surface border border-border"}`}
                onPress={() => setAudience(opt.key)}
              >
                <Text className={`text-xs font-medium ${audience === opt.key ? "text-background" : "text-foreground"}`}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Titles */}
        <View>
          <Text className="text-sm font-semibold text-foreground mb-2">{L3("العناوين", "Titels", "Titles")}</Text>
          <TextInput
            className="bg-surface border border-border rounded-lg p-3 text-foreground mb-2"
            placeholder={L3("العنوان (الهولندية)", "Titel (Nederlands)", "Title (Dutch)")}
            placeholderTextColor={colors.muted}
            value={titleNl}
            onChangeText={setTitleNl}
          />
          <TextInput
            className="bg-surface border border-border rounded-lg p-3 text-foreground mb-2"
            placeholder={L3("العنوان (الإنجليزية)", "Titel (Engels)", "Title (English)")}
            placeholderTextColor={colors.muted}
            value={titleEn}
            onChangeText={setTitleEn}
          />
          <TextInput
            className="bg-surface border border-border rounded-lg p-3 text-foreground mb-2"
            placeholder={L3("العنوان (عربي)", "Titel (Arabisch)", "Title (Arabic)")}
            placeholderTextColor={colors.muted}
            value={titleAr}
            onChangeText={setTitleAr}
            style={{ textAlign: "right" }}
          />
        </View>

        {/* Content */}
        <View>
          <Text className="text-sm font-semibold text-foreground mb-2">{L3("المحتوى", "Inhoud", "Content")}</Text>
          <TextInput
            className="bg-surface border border-border rounded-lg p-3 text-foreground mb-2"
            placeholder={L3("المحتوى (الهولندية) — يدعم Markdown", "Inhoud (Nederlands) — Markdown ondersteund", "Content (Dutch) — Markdown supported")}
            placeholderTextColor={colors.muted}
            value={contentNl}
            onChangeText={setContentNl}
            multiline
            numberOfLines={6}
            textAlignVertical="top"
          />
          <TextInput
            className="bg-surface border border-border rounded-lg p-3 text-foreground mb-2"
            placeholder={L3("المحتوى (الإنجليزية) — يدعم Markdown", "Inhoud (Engels) — Markdown ondersteund", "Content (English) — Markdown supported")}
            placeholderTextColor={colors.muted}
            value={contentEn}
            onChangeText={setContentEn}
            multiline
            numberOfLines={6}
            textAlignVertical="top"
          />
          <TextInput
            className="bg-surface border border-border rounded-lg p-3 text-foreground mb-2"
            placeholder={L3("المحتوى (عربي) — يدعم Markdown", "Inhoud (Arabisch) — Markdown ondersteund", "Content (Arabic) — Markdown supported")}
            placeholderTextColor={colors.muted}
            value={contentAr}
            onChangeText={setContentAr}
            multiline
            numberOfLines={6}
            textAlignVertical="top"
            style={{ textAlign: "right" }}
          />
        </View>

        {/* Interactive Elements */}
        <View>
          <Text className="text-sm font-semibold text-foreground mb-2">{L3("العناصر التفاعلية", "Interactieve elementen", "Interactive elements")}</Text>
          <View className="flex-row gap-2 mb-3" style={{ flexDirection: isRTL ? "row-reverse" : "row" }}>
            <TouchableOpacity className="bg-surface border border-border rounded-lg px-3 py-2" onPress={addPoll}>
              <Text className="text-xs text-foreground">{L3("+ استطلاع", "+ Peiling", "+ Poll")}</Text>
            </TouchableOpacity>
            <TouchableOpacity className="bg-surface border border-border rounded-lg px-3 py-2" onPress={addQuiz}>
              <Text className="text-xs text-foreground">{L3("+ اختبار", "+ Quiz", "+ Quiz")}</Text>
            </TouchableOpacity>
            <TouchableOpacity className="bg-surface border border-border rounded-lg px-3 py-2" onPress={addReflection}>
              <Text className="text-xs text-foreground">{L3("+ تأمل", "+ Reflectie", "+ Reflection")}</Text>
            </TouchableOpacity>
          </View>
          {interactiveElements.map((el, idx) => (
            <View key={idx} className="bg-surface border border-border rounded-lg p-3 mb-2">
              <View className="flex-row items-center justify-between mb-2" style={{ flexDirection: isRTL ? "row-reverse" : "row" }}>
                <Text className="text-xs font-semibold text-primary uppercase">{ELEMENT_TYPE_LABEL[el.type] || el.type}</Text>
                <TouchableOpacity onPress={() => setInteractiveElements(interactiveElements.filter((_, i) => i !== idx))}>
                  <IconSymbol name="xmark.circle.fill" size={18} color={colors.error} />
                </TouchableOpacity>
              </View>
              <TextInput
                className="bg-background border border-border rounded-lg p-2 text-foreground text-xs"
                placeholder={el.type === "reflection" ? L3("سؤال للتأمل...", "Reflectievraag...", "Reflection question...") : L3("السؤال...", "Vraag...", "Question...")}
                placeholderTextColor={colors.muted}
                value={el.question || el.prompt || ""}
                onChangeText={(text) => {
                  const updated = [...interactiveElements];
                  if (el.type === "reflection") updated[idx].prompt = text;
                  else updated[idx].question = text;
                  setInteractiveElements(updated);
                }}
              />
              {el.options && (
                <View className="mt-2 gap-1">
                  {el.options.map((opt: string, optIdx: number) => (
                    <TextInput
                      key={optIdx}
                      className="bg-background border border-border rounded-lg p-2 text-foreground text-xs"
                      placeholder={L3(`الخيار ${optIdx + 1}`, `Optie ${optIdx + 1}`, `Option ${optIdx + 1}`)}
                      placeholderTextColor={colors.muted}
                      value={opt}
                      onChangeText={(text) => {
                        const updated = [...interactiveElements];
                        updated[idx].options[optIdx] = text;
                        setInteractiveElements(updated);
                      }}
                    />
                  ))}
                </View>
              )}
            </View>
          ))}
        </View>

        {/* Save */}
        <TouchableOpacity
          className="bg-primary rounded-xl p-4 items-center"
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color={colors.background} />
          ) : (
            <Text className="text-background font-bold text-base">
              {isEditing ? L3("حفظ التعديلات", "Wijzigingen opslaan", "Save changes") : L3("إنشاء النشرة", "Nieuwsbrief aanmaken", "Create newsletter")}
            </Text>
          )}
        </TouchableOpacity>

        {/* Publish button for existing newsletters */}
        {isEditing && (
          <TouchableOpacity
            className="bg-success/20 border border-success rounded-xl p-4 items-center"
            onPress={async () => {
              await updateMutation.mutateAsync({ id: parseInt(id!), status: "sent" });
              if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              Alert.alert(L3("تم الإرسال", "Verzonden", "Sent"), L3("تمّ تصنيف النشرة كمُرسَلة.", "De nieuwsbrief is gemarkeerd als verzonden.", "The newsletter has been marked as sent."));
              router.back();
            }}
          >
            <Text className="text-success font-bold text-base">{L3("إرسال", "Verzenden", "Send")}</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}
