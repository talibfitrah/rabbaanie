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

export default function ContentEditorScreen() {
  const colors = useColors();
  const { isRTL } = useI18n();
  const L3 = useL3();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const isEditing = !!id;

  // Stored keys are unchanged (still what trpc.content.* reads/writes); only
  // the displayed label is now trilingual, mirroring content.tsx's TYPES array.
  const CONTENT_TYPES = [
    { key: "weekly_goal", label: L3("هدف أسبوعي", "Weekdoel", "Weekly goal") },
    { key: "article", label: L3("مقال", "Artikel", "Article") },
    { key: "hadith", label: L3("حديث", "Hadith", "Hadith") },
    { key: "dua", label: L3("دعاء", "Dua", "Dua") },
    { key: "tip", label: L3("نصيحة", "Tip", "Tip") },
    { key: "concept", label: L3("مفهوم", "Begrip", "Concept") },
  ];
  const CATEGORIES = [
    { key: "tasfiya", label: L3("تصفية", "Tasfiya", "Tasfiya") },
    { key: "tazkiya", label: L3("تزكية", "Tazkiya", "Tazkiya") },
    { key: "tarbiya", label: L3("تربية", "Tarbiya", "Tarbiya") },
    { key: "aqeedah", label: L3("عقيدة", "Aqeedah", "Aqeedah") },
    { key: "salah", label: L3("الصلاة", "Salah", "Salah") },
    { key: "quran", label: L3("القرآن", "Qur'aan", "Qur'aan") },
    { key: "akhlaq", label: L3("الأخلاق", "Akhlaq", "Akhlaq") },
    { key: "general", label: L3("عام", "Algemeen", "General") },
  ];
  const AGE_RANGES = [
    { key: "0-2", label: L3("0-2 سنة", "0-2 jaar", "0-2 yrs") },
    { key: "3-5", label: L3("3-5 سنة", "3-5 jaar", "3-5 yrs") },
    { key: "5-7", label: L3("5-7 سنة", "5-7 jaar", "5-7 yrs") },
    { key: "7-10", label: L3("7-10 سنة", "7-10 jaar", "7-10 yrs") },
    { key: "10-12", label: L3("10-12 سنة", "10-12 jaar", "10-12 yrs") },
    { key: "12-16", label: L3("12-16 سنة", "12-16 jaar", "12-16 yrs") },
    { key: "all", label: L3("الكل", "Alle", "All") },
  ];

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
      Alert.alert(L3("خطأ", "Fout", "Error"), e.message || L3("تعذّر الحفظ", "Opslaan is mislukt", "Could not save"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    // Title/body/buttons reused verbatim from app/admin/content.tsx's own delete confirm.
    Alert.alert(L3("حذف المحتوى", "Inhoud verwijderen", "Delete content"), L3("هل أنت متأكد من الحذف؟", "Weet u zeker dat u dit wilt verwijderen?", "Are you sure you want to delete this?"), [
      { text: L3("إلغاء", "Annuleren", "Cancel"), style: "cancel" },
      {
        text: L3("حذف", "Verwijderen", "Delete"),
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
      <View className="flex-row items-center justify-between px-4 py-3 border-b border-border" style={{ flexDirection: isRTL ? "row-reverse" : "row" }}>
        <TouchableOpacity onPress={() => router.back()}>
          {/* IconSymbol has no "chevron.left" mapping — chevron.right mirrored via
              scaleX gives a left-pointing arrow for LTR; RTL leaves it unflipped
              so it points right, matching every other back-arrow in app/admin. */}
          <IconSymbol name="chevron.right" size={24} color={colors.primary} style={isRTL ? undefined : { transform: [{ scaleX: -1 }] }} />
        </TouchableOpacity>
        <Text className="text-lg font-bold text-foreground">
          {isEditing ? L3("تعديل المحتوى", "Content bewerken", "Edit content") : L3("محتوى جديد", "Nieuwe content", "New content")}
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
          <Text className="text-sm font-semibold text-foreground mb-2">{L3("النوع", "Type", "Type")}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View className="flex-row gap-2" style={{ flexDirection: isRTL ? "row-reverse" : "row" }}>
              {CONTENT_TYPES.map((opt) => (
                <TouchableOpacity
                  key={opt.key}
                  className={`px-3 py-2 rounded-lg ${type === opt.key ? "bg-primary" : "bg-surface border border-border"}`}
                  onPress={() => setType(opt.key)}
                >
                  <Text className={`text-xs font-medium ${type === opt.key ? "text-background" : "text-foreground"}`}>{opt.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </View>

        {/* Category selector */}
        <View>
          <Text className="text-sm font-semibold text-foreground mb-2">{L3("التصنيف", "Categorie", "Category")}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View className="flex-row gap-2" style={{ flexDirection: isRTL ? "row-reverse" : "row" }}>
              {CATEGORIES.map((opt) => (
                <TouchableOpacity
                  key={opt.key}
                  className={`px-3 py-2 rounded-lg ${category === opt.key ? "bg-primary" : "bg-surface border border-border"}`}
                  onPress={() => setCategory(opt.key)}
                >
                  <Text className={`text-xs font-medium ${category === opt.key ? "text-background" : "text-foreground"}`}>{opt.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </View>

        {/* Age range */}
        <View>
          <Text className="text-sm font-semibold text-foreground mb-2">{L3("الفئة العمرية", "Leeftijdsgroep", "Age group")}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View className="flex-row gap-2" style={{ flexDirection: isRTL ? "row-reverse" : "row" }}>
              {AGE_RANGES.map((opt) => (
                <TouchableOpacity
                  key={opt.key}
                  className={`px-3 py-2 rounded-lg ${ageRange === opt.key ? "bg-primary" : "bg-surface border border-border"}`}
                  onPress={() => setAgeRange(opt.key)}
                >
                  <Text className={`text-xs font-medium ${ageRange === opt.key ? "text-background" : "text-foreground"}`}>{opt.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
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
            placeholder={L3("المحتوى (الهولندية)", "Inhoud (Nederlands)", "Content (Dutch)")}
            placeholderTextColor={colors.muted}
            value={contentNl}
            onChangeText={setContentNl}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
          <TextInput
            className="bg-surface border border-border rounded-lg p-3 text-foreground mb-2"
            placeholder={L3("المحتوى (الإنجليزية)", "Inhoud (Engels)", "Content (English)")}
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
          <Text className="text-sm font-semibold text-foreground mb-2">{L3("المصدر / الحديث", "Bron / Hadieth", "Source / Hadith")}</Text>
          <TextInput
            className="bg-surface border border-border rounded-lg p-3 text-foreground mb-2"
            placeholder={L3("المصدر (الهولندية)", "Bron (Nederlands)", "Source (Dutch)")}
            placeholderTextColor={colors.muted}
            value={source}
            onChangeText={setSource}
            multiline
          />
          <TextInput
            className="bg-surface border border-border rounded-lg p-3 text-foreground mb-2"
            placeholder={L3("المصدر (الإنجليزية)", "Bron (Engels)", "Source (English)")}
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
          style={{ flexDirection: isRTL ? "row-reverse" : "row" }}
          onPress={() => setPublished(!published)}
        >
          <IconSymbol
            name={published ? "checkmark.circle.fill" : "xmark.circle.fill"}
            size={24}
            color={published ? colors.success : colors.muted}
          />
          <Text className="text-sm font-medium text-foreground">
            {published ? L3("منشور", "Gepubliceerd", "Published") : L3("مسودة (غير ظاهر)", "Concept (niet zichtbaar)", "Draft (not visible)")}
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
              {isEditing ? L3("حفظ التعديلات", "Wijzigingen opslaan", "Save changes") : L3("إضافة المحتوى", "Inhoud toevoegen", "Add content")}
            </Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </ScreenContainer>
  );
}
