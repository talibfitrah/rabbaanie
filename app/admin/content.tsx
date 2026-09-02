import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView, Modal, Alert, ActivityIndicator, RefreshControl, Switch } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useColors } from "@/hooks/use-colors";
import { useI18n } from "@/lib/i18n";
import { useL3 } from "@/lib/admin-text";
import { trpc } from "@/lib/trpc";

type Draft = { id?: number; type: string; category: string; titleAr: string; titleEn: string; titleNl: string; contentAr: string; contentEn: string; contentNl: string; published: boolean };
const emptyDraft = (): Draft => ({ type: "article", category: "", titleAr: "", titleEn: "", titleNl: "", contentAr: "", contentEn: "", contentNl: "", published: false });

export default function AdminContentScreen() {
  const colors = useColors();
  const { isRTL } = useI18n();
  const L3 = useL3();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState<Draft | null>(null);

  const TYPES = [
    { key: "article", label: L3("مقال", "Artikel", "Article") },
    { key: "tip", label: L3("نصيحة", "Tip", "Tip") },
    { key: "hadith", label: L3("حديث", "Hadith", "Hadith") },
    { key: "concept", label: L3("مفهوم", "Begrip", "Concept") },
    { key: "weekly_goal", label: L3("هدف أسبوعي", "Weekdoel", "Weekly goal") },
  ];
  const typeLabel = (t: string) => TYPES.find((x) => x.key === t)?.label || t;

  const listQ = trpc.content.list.useQuery({ limit: 300 } as any);
  const invalidate = () => listQ.refetch();
  const createM = trpc.content.create.useMutation({ onSuccess: () => { invalidate(); setDraft(null); } });
  const updateM = trpc.content.update.useMutation({ onSuccess: () => { invalidate(); setDraft(null); } });
  const deleteM = trpc.content.delete.useMutation({ onSuccess: () => { invalidate(); setDraft(null); } });
  const generate = (trpc.admin as any).generateArticleFromHidayat.useMutation({
    onSuccess: (r: any) => setDraft((d) => (d ? { ...d, titleAr: r?.titleAr || d.titleAr, contentAr: r?.contentAr || d.contentAr } : d)),
    onError: (e: any) => Alert.alert(L3("خطأ", "Fout", "Error"), e?.message || L3("تعذّر توليد المقال.", "Artikel genereren mislukt.", "Could not generate the article.")),
  });
  const doGenerate = () => {
    if (!draft?.titleAr.trim()) { Alert.alert(L3("تنبيه", "Let op", "Notice"), L3("اكتب الموضوع في حقل «العنوان (عربي)» أولاً، ثم اضغط توليد.", "Vul eerst het onderwerp in bij «Titel (Arabisch)» en tik dan op Genereren.", "Enter the topic in the “Title (Arabic)” field first, then tap Generate.")); return; }
    generate.mutate({ topic: draft.titleAr.trim(), category: draft.category || undefined });
  };
  const busy = createM.isPending || updateM.isPending || deleteM.isPending;

  const rows = (listQ.data as any[]) || [];

  const save = () => {
    if (!draft) return;
    if (!draft.titleAr.trim() && !draft.titleEn.trim() && !draft.titleNl.trim()) { Alert.alert(L3("تنبيه", "Let op", "Notice"), L3("أدخل عنوانًا على الأقل.", "Vul minstens één titel in.", "Enter at least one title.")); return; }
    const payload: any = { type: draft.type, category: draft.category || undefined, titleAr: draft.titleAr, titleEn: draft.titleEn, titleNl: draft.titleNl, contentAr: draft.contentAr, contentEn: draft.contentEn, contentNl: draft.contentNl, published: draft.published };
    if (draft.id) updateM.mutate({ id: draft.id, ...payload });
    else createM.mutate(payload);
  };

  const remove = () => {
    if (!draft?.id) return;
    Alert.alert(L3("حذف المحتوى", "Inhoud verwijderen", "Delete content"), L3("هل أنت متأكد من الحذف؟", "Weet u zeker dat u dit wilt verwijderen?", "Are you sure you want to delete this?"), [
      { text: L3("إلغاء", "Annuleren", "Cancel"), style: "cancel" },
      { text: L3("حذف", "Verwijderen", "Delete"), style: "destructive", onPress: () => deleteM.mutate({ id: draft.id! }) },
    ]);
  };

  const openEdit = (r: any) => setDraft({
    id: r.id, type: r.type || "article", category: r.category || "",
    titleAr: r.titleAr || "", titleEn: r.titleEn || "", titleNl: r.titleNl || "",
    contentAr: r.contentAr || "", contentEn: r.contentEn || "", contentNl: r.contentNl || "",
    published: !!r.published,
  });

  const inputStyle = { backgroundColor: colors.background, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: colors.foreground, textAlign: (isRTL ? "right" : "left") as "right" | "left", borderWidth: 1, borderColor: colors.border, marginTop: 6 };
  const label = (s: string) => <Text style={{ fontSize: 13, fontWeight: "600", color: colors.foreground, textAlign: isRTL ? "right" : "left", marginTop: 10 }}>{s}</Text>;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ paddingTop: insets.top + 8, paddingBottom: 12, paddingHorizontal: 16, backgroundColor: colors.surface, borderBottomWidth: 0.5, borderBottomColor: colors.border, flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 12 }}>
        <TouchableOpacity onPress={() => router.back()}><MaterialIcons name={isRTL ? "arrow-forward" : "arrow-back"} size={24} color={colors.foreground} /></TouchableOpacity>
        <Text style={{ fontSize: 18, fontWeight: "700", color: colors.foreground, flex: 1, textAlign: isRTL ? "right" : "left" }}>{L3("إدارة المحتوى", "Inhoudsbeheer", "Content management")}</Text>
        <TouchableOpacity onPress={() => setDraft(emptyDraft())} style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 4, backgroundColor: colors.primary, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 }}>
          <MaterialIcons name="add" size={18} color="#fff" /><Text style={{ color: "#fff", fontWeight: "700", fontSize: 12 }}>{L3("إضافة", "Toevoegen", "Add")}</Text>
        </TouchableOpacity>
      </View>

      {listQ.isLoading ? <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
        : listQ.error ? <Text style={{ textAlign: "center", marginTop: 40, color: colors.error, paddingHorizontal: 24, lineHeight: 22 }}>{L3("تعذّر التحميل. تأكد أنك مسجّل الدخول بحساب المالك.", "Laden mislukt. Controleer of u bent ingelogd met het eigenaarsaccount.", "Could not load. Make sure you're signed in with the owner account.")}</Text>
        : (
          <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: insets.bottom + 40, gap: 10 }}
            refreshControl={<RefreshControl refreshing={listQ.isFetching} onRefresh={invalidate} tintColor={colors.primary} />}>
            {rows.map((r: any) => (
              <TouchableOpacity key={r.id} onPress={() => openEdit(r)} activeOpacity={0.7}
                style={{ backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 14, flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground, textAlign: isRTL ? "right" : "left" }}>{r.titleAr || r.titleEn || r.titleNl || "—"}</Text>
                  <Text style={{ fontSize: 11, color: colors.muted, textAlign: isRTL ? "right" : "left", marginTop: 2 }}>{typeLabel(r.type)}{r.category ? ` · ${r.category}` : ""}</Text>
                </View>
                <View style={{ backgroundColor: (r.published ? "#059669" : colors.muted) + "20", borderRadius: 8, paddingVertical: 2, paddingHorizontal: 8 }}>
                  <Text style={{ fontSize: 10, fontWeight: "700", color: r.published ? "#059669" : colors.muted }}>{r.published ? L3("منشور", "Gepubliceerd", "Published") : L3("مسودة", "Concept", "Draft")}</Text>
                </View>
              </TouchableOpacity>
            ))}
            {rows.length === 0 && <Text style={{ textAlign: "center", marginTop: 40, color: colors.muted }}>{L3("لا يوجد محتوى — اضغط «إضافة»", "Geen inhoud — tik op «Toevoegen»", "No content — tap “Add”")}</Text>}
          </ScrollView>
        )}

      <Modal visible={!!draft} animationType="slide" onRequestClose={() => setDraft(null)}
        supportedOrientations={["portrait", "portrait-upside-down", "landscape"]}>
        <View style={{ flex: 1, backgroundColor: colors.background }}>
          <View style={{ paddingTop: insets.top + 8, paddingBottom: 12, paddingHorizontal: 16, backgroundColor: colors.surface, borderBottomWidth: 0.5, borderBottomColor: colors.border, flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 12 }}>
            <TouchableOpacity onPress={() => setDraft(null)}><MaterialIcons name="close" size={24} color={colors.foreground} /></TouchableOpacity>
            <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground, flex: 1, textAlign: isRTL ? "right" : "left" }}>{draft?.id ? L3("تعديل المحتوى", "Inhoud bewerken", "Edit content") : L3("محتوى جديد", "Nieuwe inhoud", "New content")}</Text>
            {draft?.id && <TouchableOpacity onPress={remove}><MaterialIcons name="delete" size={22} color={colors.error} /></TouchableOpacity>}
          </View>
          {draft && (
            <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }} keyboardShouldPersistTaps="handled">
              {label(L3("النوع", "Type", "Type"))}
              <View style={{ flexDirection: isRTL ? "row-reverse" : "row", flexWrap: "wrap", gap: 8, marginTop: 6 }}>
                {TYPES.map((t) => (
                  <TouchableOpacity key={t.key} onPress={() => setDraft({ ...draft, type: t.key })}
                    style={{ backgroundColor: draft.type === t.key ? colors.primary : colors.surface, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12, borderWidth: 1, borderColor: draft.type === t.key ? colors.primary : colors.border }}>
                    <Text style={{ fontSize: 12, fontWeight: "700", color: draft.type === t.key ? "#fff" : colors.foreground }}>{t.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {label(L3("التصنيف", "Categorie", "Category"))}
              <TextInput value={draft.category} onChangeText={(v) => setDraft({ ...draft, category: v })} placeholder={L3("مثال: تربية", "Bijv.: opvoeding", "e.g. parenting")} placeholderTextColor={colors.muted} style={inputStyle} />
              {label(L3("العنوان (عربي) — أو الموضوع للتوليد", "Titel (Arabisch) — of het onderwerp om te genereren", "Title (Arabic) — or the topic to generate"))}
              <TextInput value={draft.titleAr} onChangeText={(v) => setDraft({ ...draft, titleAr: v })} placeholderTextColor={colors.muted} style={inputStyle} />
              <TouchableOpacity onPress={doGenerate} disabled={generate.isPending}
                style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: "#7C3AED14", borderWidth: 1, borderColor: "#7C3AED44", borderRadius: 10, paddingVertical: 11, marginTop: 10 }}>
                {generate.isPending
                  ? <ActivityIndicator color="#7C3AED" />
                  : <><MaterialIcons name="auto-awesome" size={16} color="#7C3AED" /><Text style={{ color: "#7C3AED", fontWeight: "700", fontSize: 13 }}>{L3("توليد مقال كامل من الهدايات (يملأ النص)", "Volledig artikel genereren uit de Hidayat (vult de tekst in)", "Generate a full article from the Hidayat (fills in the text)")}</Text></>}
              </TouchableOpacity>
              {label(L3("النص (عربي)", "Tekst (Arabisch)", "Text (Arabic)"))}
              <TextInput value={draft.contentAr} onChangeText={(v) => setDraft({ ...draft, contentAr: v })} multiline placeholderTextColor={colors.muted} style={{ ...inputStyle, minHeight: 140, textAlignVertical: "top" }} />
              {label(L3("العنوان (إنجليزي — اختياري)", "Titel (Engels — optioneel)", "Title (English — optional)"))}
              <TextInput value={draft.titleEn} onChangeText={(v) => setDraft({ ...draft, titleEn: v })} placeholderTextColor={colors.muted} style={inputStyle} />
              {label(L3("النص (إنجليزي — اختياري)", "Tekst (Engels — optioneel)", "Text (English — optional)"))}
              <TextInput value={draft.contentEn} onChangeText={(v) => setDraft({ ...draft, contentEn: v })} multiline placeholderTextColor={colors.muted} style={{ ...inputStyle, minHeight: 90, textAlignVertical: "top" }} />
              <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", justifyContent: "space-between", marginTop: 16 }}>
                <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }}>{L3("نشر المحتوى (يُرسَل إشعار للجميع)", "Inhoud publiceren (iedereen krijgt een melding)", "Publish content (everyone gets a notification)")}</Text>
                <Switch value={draft.published} onValueChange={(v) => setDraft({ ...draft, published: v })} />
              </View>
              <TouchableOpacity onPress={save} disabled={busy} style={{ backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 14, alignItems: "center", marginTop: 20, opacity: busy ? 0.6 : 1 }}>
                {busy ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>{draft.id ? L3("حفظ التعديلات", "Wijzigingen opslaan", "Save changes") : L3("إضافة المحتوى", "Inhoud toevoegen", "Add content")}</Text>}
              </TouchableOpacity>
            </ScrollView>
          )}
        </View>
      </Modal>
    </View>
  );
}
