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
import { trpc } from "@/lib/trpc";
import * as Haptics from "expo-haptics";

const AUDIENCES = ["all", "parents", "teachers", "specialists"];

export default function NewsletterEditorScreen() {
  const colors = useColors();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const isEditing = !!id;

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
      Alert.alert("Fout", e.message || "Kon niet opslaan");
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
      <View className="flex-row items-center justify-between px-4 py-3 border-b border-border">
        <TouchableOpacity onPress={() => router.back()}>
          <IconSymbol name="chevron.right" size={24} color={colors.primary} style={{ transform: [{ scaleX: -1 }] }} />
        </TouchableOpacity>
        <Text className="text-lg font-bold text-foreground">
          {isEditing ? "Nieuwsbrief bewerken" : "Nieuwe nieuwsbrief"}
        </Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView className="flex-1 px-4" contentContainerStyle={{ paddingVertical: 16, gap: 16 }}>
        {/* Audience */}
        <View>
          <Text className="text-sm font-semibold text-foreground mb-2">Doelgroep</Text>
          <View className="flex-row gap-2 flex-wrap">
            {AUDIENCES.map((a) => (
              <TouchableOpacity
                key={a}
                className={`px-3 py-2 rounded-lg ${audience === a ? "bg-primary" : "bg-surface border border-border"}`}
                onPress={() => setAudience(a)}
              >
                <Text className={`text-xs font-medium ${audience === a ? "text-background" : "text-foreground"}`}>
                  {a === "all" ? "Iedereen" : a === "parents" ? "Ouders" : a === "teachers" ? "Leraren" : "Pedagogisch begeleiders"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Titles */}
        <View>
          <Text className="text-sm font-semibold text-foreground mb-2">Titels</Text>
          <TextInput
            className="bg-surface border border-border rounded-lg p-3 text-foreground mb-2"
            placeholder="Titel (Nederlands)"
            placeholderTextColor={colors.muted}
            value={titleNl}
            onChangeText={setTitleNl}
          />
          <TextInput
            className="bg-surface border border-border rounded-lg p-3 text-foreground mb-2"
            placeholder="Title (English)"
            placeholderTextColor={colors.muted}
            value={titleEn}
            onChangeText={setTitleEn}
          />
          <TextInput
            className="bg-surface border border-border rounded-lg p-3 text-foreground mb-2"
            placeholder="العنوان (عربي)"
            placeholderTextColor={colors.muted}
            value={titleAr}
            onChangeText={setTitleAr}
            style={{ textAlign: "right" }}
          />
        </View>

        {/* Content */}
        <View>
          <Text className="text-sm font-semibold text-foreground mb-2">Inhoud</Text>
          <TextInput
            className="bg-surface border border-border rounded-lg p-3 text-foreground mb-2"
            placeholder="Inhoud (Nederlands) — Markdown ondersteund"
            placeholderTextColor={colors.muted}
            value={contentNl}
            onChangeText={setContentNl}
            multiline
            numberOfLines={6}
            textAlignVertical="top"
          />
          <TextInput
            className="bg-surface border border-border rounded-lg p-3 text-foreground mb-2"
            placeholder="Content (English) — Markdown supported"
            placeholderTextColor={colors.muted}
            value={contentEn}
            onChangeText={setContentEn}
            multiline
            numberOfLines={6}
            textAlignVertical="top"
          />
          <TextInput
            className="bg-surface border border-border rounded-lg p-3 text-foreground mb-2"
            placeholder="المحتوى (عربي) — يدعم Markdown"
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
          <Text className="text-sm font-semibold text-foreground mb-2">Interactieve elementen</Text>
          <View className="flex-row gap-2 mb-3">
            <TouchableOpacity className="bg-surface border border-border rounded-lg px-3 py-2" onPress={addPoll}>
              <Text className="text-xs text-foreground">+ Peiling</Text>
            </TouchableOpacity>
            <TouchableOpacity className="bg-surface border border-border rounded-lg px-3 py-2" onPress={addQuiz}>
              <Text className="text-xs text-foreground">+ Quiz</Text>
            </TouchableOpacity>
            <TouchableOpacity className="bg-surface border border-border rounded-lg px-3 py-2" onPress={addReflection}>
              <Text className="text-xs text-foreground">+ Reflectie</Text>
            </TouchableOpacity>
          </View>
          {interactiveElements.map((el, idx) => (
            <View key={idx} className="bg-surface border border-border rounded-lg p-3 mb-2">
              <View className="flex-row items-center justify-between mb-2">
                <Text className="text-xs font-semibold text-primary uppercase">{el.type}</Text>
                <TouchableOpacity onPress={() => setInteractiveElements(interactiveElements.filter((_, i) => i !== idx))}>
                  <IconSymbol name="xmark.circle.fill" size={18} color={colors.error} />
                </TouchableOpacity>
              </View>
              <TextInput
                className="bg-background border border-border rounded-lg p-2 text-foreground text-xs"
                placeholder={el.type === "reflection" ? "Reflectievraag..." : "Vraag..."}
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
                      placeholder={`Optie ${optIdx + 1}`}
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
              {isEditing ? "Opslaan" : "Aanmaken"}
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
              Alert.alert("Verzonden", "De nieuwsbrief is gemarkeerd als verzonden.");
              router.back();
            }}
          >
            <Text className="text-success font-bold text-base">Verzenden</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}
