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
import { useL3 } from "@/lib/admin-text";
import { trpc } from "@/lib/trpc";
import * as Haptics from "expo-haptics";

const CONTENT_TYPES = ["weekly_goal", "article", "hadith", "dua", "tip", "concept"];
const CATEGORIES = ["tasfiya", "tazkiya", "tarbiya", "aqeedah", "salah", "quran", "akhlaq", "general"];
const AGE_RANGES = ["0-2", "3-5", "5-7", "7-10", "10-12", "12-16", "all"];

export default function ContentEditorScreen() {
  const colors = useColors();
  const L3 = useL3();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const isEditing = !!id;

  const [type, setType] = useState("article");
  const [category, setCategory] = useState("general");
  const [ageRange, setAgeRange] = useState("all");
  const [titleNl, setTitleNl] = useState("");
  const [titleEn, setTitleEn] = useState("");
  const [titleAr, setTitleAr] = useState("");
  const [contentNl, setContentNl] = useState("");
  const [contentEn, setContentEn] = useState("");
  const [contentAr, setContentAr] = useState("");
  const [source, setSource] = useState("");
  const [sourceEn, setSourceEn] = useState("");
  const [sourceAr, setSourceAr] = useState("");
  const [published, setPublished] = useState(true);
  const [saving, setSaving] = useState(false);

  const existingQuery = trpc.content.get.useQuery(
    { id: parseInt(id || "0") },
    { enabled: isEditing }
  );

  useEffect(() => {
    if (existingQuery.data) {
      const d = existingQuery.data;
      setType(d.type || "article");
      setCategory(d.category || "general");
      setAgeRange(d.ageRange || "all");
      setTitleNl(d.titleNl || "");
      setTitleEn(d.titleEn || "");
      setTitleAr(d.titleAr || "");
      setContentNl(d.contentNl || "");
      setContentEn(d.contentEn || "");
      setContentAr(d.contentAr || "");
      setSource(d.source || "");
      setSourceEn(d.sourceEn || "");
      setSourceAr(d.sourceAr || "");
      setPublished(d.published ?? true);
    }
  }, [existingQuery.data]);

  const createMutation = trpc.content.create.useMutation();
  const updateMutation = trpc.content.update.useMutation();
  const deleteMutation = trpc.content.delete.useMutation();

  const handleSave = async () => {
    setSaving(true);
    try {
      const data = {
        type, category, ageRange,
        titleNl: titleNl || undefined,
        titleEn: titleEn || undefined,
        titleAr: titleAr || undefined,
        contentNl: contentNl || undefined,
        contentEn: contentEn || undefined,
        contentAr: contentAr || undefined,
        source: source || undefined,
        sourceEn: sourceEn || undefined,
        sourceAr: sourceAr || undefined,
        published,
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

  const handleDelete = () => {
    Alert.alert("Verwijderen", "Weet u zeker dat u dit item wilt verwijderen?", [
      { text: "Annuleren", style: "cancel" },
      {
        text: "Verwijderen",
        style: "destructive",
        onPress: async () => {
          await deleteMutation.mutateAsync({ id: parseInt(id!) });
          router.back();
        },
      },
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
          {isEditing ? "Content bewerken" : "Nieuwe content"}
        </Text>
        {isEditing ? (
          <TouchableOpacity onPress={handleDelete}>
            <IconSymbol name="trash.fill" size={22} color={colors.error} />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 24 }} />
        )}
      </View>

      <ScrollView className="flex-1 px-4" contentContainerStyle={{ paddingVertical: 16, gap: 16 }}>
        {/* Type selector */}
        <View>
          <Text className="text-sm font-semibold text-foreground mb-2">Type</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View className="flex-row gap-2">
              {CONTENT_TYPES.map((t) => (
                <TouchableOpacity
                  key={t}
                  className={`px-3 py-2 rounded-lg ${type === t ? "bg-primary" : "bg-surface border border-border"}`}
                  onPress={() => setType(t)}
                >
                  <Text className={`text-xs font-medium ${type === t ? "text-background" : "text-foreground"}`}>{t}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </View>

        {/* Category selector */}
        <View>
          <Text className="text-sm font-semibold text-foreground mb-2">Categorie</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View className="flex-row gap-2">
              {CATEGORIES.map((c) => (
                <TouchableOpacity
                  key={c}
                  className={`px-3 py-2 rounded-lg ${category === c ? "bg-primary" : "bg-surface border border-border"}`}
                  onPress={() => setCategory(c)}
                >
                  <Text className={`text-xs font-medium ${category === c ? "text-background" : "text-foreground"}`}>{c}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </View>

        {/* Age range */}
        <View>
          <Text className="text-sm font-semibold text-foreground mb-2">Leeftijdsgroep</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View className="flex-row gap-2">
              {AGE_RANGES.map((a) => (
                <TouchableOpacity
                  key={a}
                  className={`px-3 py-2 rounded-lg ${ageRange === a ? "bg-primary" : "bg-surface border border-border"}`}
                  onPress={() => setAgeRange(a)}
                >
                  <Text className={`text-xs font-medium ${ageRange === a ? "text-background" : "text-foreground"}`}>{a}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
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
            placeholder={L3("العنوان (عربي)", "Titel (Arabisch)", "Title (Arabic)")}
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
            placeholder="Inhoud (Nederlands)"
            placeholderTextColor={colors.muted}
            value={contentNl}
            onChangeText={setContentNl}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
          <TextInput
            className="bg-surface border border-border rounded-lg p-3 text-foreground mb-2"
            placeholder="Content (English)"
            placeholderTextColor={colors.muted}
            value={contentEn}
            onChangeText={setContentEn}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
          <TextInput
            className="bg-surface border border-border rounded-lg p-3 text-foreground mb-2"
            placeholder={L3("المحتوى (عربي)", "Inhoud (Arabisch)", "Content (Arabic)")}
            placeholderTextColor={colors.muted}
            value={contentAr}
            onChangeText={setContentAr}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
            style={{ textAlign: "right" }}
          />
        </View>

        {/* Sources */}
        <View>
          <Text className="text-sm font-semibold text-foreground mb-2">Bron / Hadieth</Text>
          <TextInput
            className="bg-surface border border-border rounded-lg p-3 text-foreground mb-2"
            placeholder="Bron (Nederlands)"
            placeholderTextColor={colors.muted}
            value={source}
            onChangeText={setSource}
            multiline
          />
          <TextInput
            className="bg-surface border border-border rounded-lg p-3 text-foreground mb-2"
            placeholder="Source (English)"
            placeholderTextColor={colors.muted}
            value={sourceEn}
            onChangeText={setSourceEn}
            multiline
          />
          <TextInput
            className="bg-surface border border-border rounded-lg p-3 text-foreground mb-2"
            placeholder={L3("المصدر (عربي)", "Bron (Arabisch)", "Source (Arabic)")}
            placeholderTextColor={colors.muted}
            value={sourceAr}
            onChangeText={setSourceAr}
            multiline
            style={{ textAlign: "right" }}
          />
        </View>

        {/* Published toggle */}
        <TouchableOpacity
          className="flex-row items-center gap-3 bg-surface rounded-lg p-4 border border-border"
          onPress={() => setPublished(!published)}
        >
          <IconSymbol
            name={published ? "checkmark.circle.fill" : "xmark.circle.fill"}
            size={24}
            color={published ? colors.success : colors.muted}
          />
          <Text className="text-sm font-medium text-foreground">
            {published ? "Gepubliceerd" : "Concept (niet zichtbaar)"}
          </Text>
        </TouchableOpacity>

        {/* Save button */}
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
      </ScrollView>
    </ScreenContainer>
  );
}
