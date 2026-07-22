import { useState, useEffect, useCallback } from "react";
import { View, Text, Pressable, ScrollView, TextInput, Alert, Platform, FlatList,
  KeyboardAvoidingView,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/use-colors";
import { useAppState } from "@/lib/app-context";
import { useI18n } from "@/lib/i18n";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";

const NOTES_KEY = "@chat_notes";

interface ChatNote {
  id: string;
  childId: string;
  childName: string;
  title: string;
  content: string;
  category: "decision" | "agreement" | "observation" | "action";
  createdAt: string;
  updatedAt: string;
}

type Lang = "nl" | "en" | "ar";

function tx(lang: Lang, nl: string, en: string, ar: string): string {
  return lang === "ar" ? ar : lang === "en" ? en : nl;
}

const CATEGORIES = [
  { key: "decision", nl: "Beslissing", en: "Decision", ar: "قرار", icon: "gavel" as const, color: "#1976D2" },
  { key: "agreement", nl: "Afspraak", en: "Agreement", ar: "اتفاق", icon: "handshake" as const, color: "#388E3C" },
  { key: "observation", nl: "Observatie", en: "Observation", ar: "ملاحظة", icon: "visibility" as const, color: "#F57C00" },
  { key: "action", nl: "Actie", en: "Action", ar: "إجراء", icon: "bolt" as const, color: "#7B1FA2" },
];

export default function ChatNotesScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t, language } = useI18n();
  const { state } = useAppState();
  const lang = language as Lang;
  const isRTL = lang === "ar";

  const [notes, setNotes] = useState<ChatNote[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingNote, setEditingNote] = useState<ChatNote | null>(null);
  const [selectedChildId, setSelectedChildId] = useState<string>("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [category, setCategory] = useState<ChatNote["category"]>("decision");
  const [filterChild, setFilterChild] = useState<string>("all");

  useEffect(() => {
    loadNotes();
  }, []);

  const loadNotes = async () => {
    try {
      const stored = await AsyncStorage.getItem(NOTES_KEY);
      if (stored) setNotes(JSON.parse(stored));
    } catch {}
  };

  const saveNotes = async (updated: ChatNote[]) => {
    setNotes(updated);
    await AsyncStorage.setItem(NOTES_KEY, JSON.stringify(updated));
  };

  const handleSave = async () => {
    if (!title.trim() || !content.trim() || !selectedChildId) {
      Alert.alert(
        tx(lang, "Vul alles in", "Fill in all fields", "أكمل جميع الحقول"),
        tx(lang, "Titel, inhoud en kind zijn verplicht", "Title, content and child are required", "العنوان والمحتوى والطفل مطلوبون")
      );
      return;
    }

    const child = state.children.find((c) => c.id === selectedChildId);
    const now = new Date().toISOString();

    if (editingNote) {
      const updated = notes.map((n) =>
        n.id === editingNote.id
          ? { ...n, title: title.trim(), content: content.trim(), category, childId: selectedChildId, childName: child?.name || "", updatedAt: now }
          : n
      );
      await saveNotes(updated);
    } else {
      const newNote: ChatNote = {
        id: `note_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        childId: selectedChildId,
        childName: child?.name || "",
        title: title.trim(),
        content: content.trim(),
        category,
        createdAt: now,
        updatedAt: now,
      };
      await saveNotes([newNote, ...notes]);
    }

    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    resetForm();
  };

  const handleDelete = (noteId: string) => {
    Alert.alert(
      tx(lang, "Verwijderen", "Delete", "حذف"),
      tx(lang, "Weet u zeker dat u deze notitie wilt verwijderen?", "Are you sure you want to delete this note?", "هل أنت متأكد من حذف هذه الملاحظة؟"),
      [
        { text: tx(lang, "Annuleren", "Cancel", "إلغاء"), style: "cancel" },
        {
          text: tx(lang, "Verwijderen", "Delete", "حذف"),
          style: "destructive",
          onPress: async () => {
            const updated = notes.filter((n) => n.id !== noteId);
            await saveNotes(updated);
            if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          },
        },
      ]
    );
  };

  const resetForm = () => {
    setShowForm(false);
    setEditingNote(null);
    setTitle("");
    setContent("");
    setCategory("decision");
    setSelectedChildId("");
  };

  const startEdit = (note: ChatNote) => {
    setEditingNote(note);
    setTitle(note.title);
    setContent(note.content);
    setCategory(note.category);
    setSelectedChildId(note.childId);
    setShowForm(true);
  };

  const filteredNotes = filterChild === "all" ? notes : notes.filter((n) => n.childId === filterChild);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ paddingTop: insets.top + 10, paddingHorizontal: 16, paddingBottom: 12, backgroundColor: colors.surface, borderBottomWidth: 0.5, borderBottomColor: colors.border }}>
        <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", justifyContent: "space-between" }}>
          <Pressable onPress={() => router.back()} style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}>
            <MaterialIcons name={isRTL ? "arrow-forward" : "arrow-back"} size={24} color={colors.foreground} />
          </Pressable>
          <Text style={{ fontSize: 18, fontWeight: "700", color: colors.foreground }}>
            {tx(lang, "Gespreksnotities", "Chat Notes", "ملاحظات المحادثة")}
          </Text>
          <Pressable onPress={() => setShowForm(true)} style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}>
            <MaterialIcons name="add-circle" size={28} color={colors.primary} />
          </Pressable>
        </View>
      </View>

      {/* Child filter */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: 44, paddingHorizontal: 12, marginTop: 8 }}>
        <Pressable
          onPress={() => setFilterChild("all")}
          style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16, marginRight: 8, backgroundColor: filterChild === "all" ? colors.primary : colors.surface }}
        >
          <Text style={{ fontSize: 12, fontWeight: "600", color: filterChild === "all" ? "#fff" : colors.foreground }}>
            {tx(lang, "Alle", "All", "الكل")}
          </Text>
        </Pressable>
        {state.children.map((child) => (
          <Pressable
            key={child.id}
            onPress={() => setFilterChild(child.id)}
            style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16, marginRight: 8, backgroundColor: filterChild === child.id ? colors.primary : colors.surface }}
          >
            <Text style={{ fontSize: 12, fontWeight: "600", color: filterChild === child.id ? "#fff" : colors.foreground }}>
              {child.name}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* Notes list */}
      <FlatList
        data={filteredNotes}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
        ListEmptyComponent={
          <View style={{ alignItems: "center", paddingTop: 60 }}>
            <MaterialIcons name="note-add" size={48} color={colors.muted} />
            <Text style={{ color: colors.muted, fontSize: 14, marginTop: 12, textAlign: "center" }}>
              {tx(lang, "Nog geen notities.\nLeg afspraken en beslissingen vast.", "No notes yet.\nRecord agreements and decisions.", "لا توجد ملاحظات بعد.\nسجّل الاتفاقيات والقرارات.")}
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const cat = CATEGORIES.find((c) => c.key === item.category);
          return (
            <Pressable
              onPress={() => startEdit(item)}
              onLongPress={() => handleDelete(item.id)}
              style={({ pressed }) => [{
                backgroundColor: colors.surface,
                borderRadius: 14,
                padding: 14,
                marginBottom: 10,
                borderLeftWidth: 4,
                borderLeftColor: cat?.color || colors.primary,
                opacity: pressed ? 0.8 : 1,
              }]}
            >
              <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <MaterialIcons name={cat?.icon || "note"} size={16} color={cat?.color || colors.primary} />
                <Text style={{ fontSize: 11, fontWeight: "600", color: cat?.color || colors.primary }}>
                  {cat ? (lang === "ar" ? cat.ar : lang === "en" ? cat.en : cat.nl) : ""}
                </Text>
                <View style={{ flex: 1 }} />
                <Text style={{ fontSize: 10, color: colors.muted }}>{item.childName}</Text>
              </View>
              <Text style={{ fontSize: 15, fontWeight: "700", color: colors.foreground, textAlign: isRTL ? "right" : "left" }}>
                {item.title}
              </Text>
              <Text style={{ fontSize: 13, color: colors.muted, marginTop: 4, textAlign: isRTL ? "right" : "left" }} numberOfLines={2}>
                {item.content}
              </Text>
              <Text style={{ fontSize: 10, color: colors.muted, marginTop: 6, textAlign: isRTL ? "right" : "left" }}>
                {new Date(item.updatedAt).toLocaleDateString(lang === "ar" ? "ar-SA" : lang === "en" ? "en-US" : "nl-NL", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
              </Text>
            </Pressable>
          );
        }}
      />

      {/* Add/Edit form modal */}
      {showForm && (
        <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: insets.bottom + 20, maxHeight: "85%" }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <Text style={{ fontSize: 18, fontWeight: "700", color: colors.foreground }}>
                {editingNote ? tx(lang, "Bewerken", "Edit", "تعديل") : tx(lang, "Nieuwe notitie", "New note", "ملاحظة جديدة")}
              </Text>
              <Pressable onPress={resetForm}>
                <MaterialIcons name="close" size={24} color={colors.muted} />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Child selector */}
              <Text style={{ fontSize: 13, fontWeight: "600", color: colors.foreground, marginBottom: 6 }}>
                {tx(lang, "Kind", "Child", "الطفل")}
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
                {state.children.map((child) => (
                  <Pressable
                    key={child.id}
                    onPress={() => setSelectedChildId(child.id)}
                    style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16, marginRight: 8, backgroundColor: selectedChildId === child.id ? colors.primary : colors.surface, borderWidth: 1, borderColor: selectedChildId === child.id ? colors.primary : colors.border }}
                  >
                    <Text style={{ fontSize: 13, color: selectedChildId === child.id ? "#fff" : colors.foreground }}>{child.name}</Text>
                  </Pressable>
                ))}
              </ScrollView>

              {/* Category selector */}
              <Text style={{ fontSize: 13, fontWeight: "600", color: colors.foreground, marginBottom: 6 }}>
                {tx(lang, "Categorie", "Category", "الفئة")}
              </Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
                {CATEGORIES.map((cat) => (
                  <Pressable
                    key={cat.key}
                    onPress={() => setCategory(cat.key as ChatNote["category"])}
                    style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16, backgroundColor: category === cat.key ? cat.color + "20" : colors.surface, borderWidth: 1, borderColor: category === cat.key ? cat.color : colors.border }}
                  >
                    <MaterialIcons name={cat.icon} size={14} color={category === cat.key ? cat.color : colors.muted} />
                    <Text style={{ fontSize: 12, color: category === cat.key ? cat.color : colors.foreground }}>
                      {lang === "ar" ? cat.ar : lang === "en" ? cat.en : cat.nl}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {/* Title */}
              <Text style={{ fontSize: 13, fontWeight: "600", color: colors.foreground, marginBottom: 6 }}>
                {tx(lang, "Titel", "Title", "العنوان")}
              </Text>
              <TextInput
                value={title}
                onChangeText={setTitle}
                placeholder={tx(lang, "Bijv. Afspraak over bedtijd", "E.g. Agreement about bedtime", "مثال: اتفاق حول وقت النوم")}
                placeholderTextColor={colors.muted}
                style={{ backgroundColor: colors.surface, borderRadius: 10, padding: 12, fontSize: 14, color: colors.foreground, borderWidth: 1, borderColor: colors.border, marginBottom: 14 }}
              />

              {/* Content */}
              <Text style={{ fontSize: 13, fontWeight: "600", color: colors.foreground, marginBottom: 6 }}>
                {tx(lang, "Inhoud", "Content", "المحتوى")}
              </Text>
              <TextInput
                value={content}
                onChangeText={setContent}
                placeholder={tx(lang, "Beschrijf de afspraak of beslissing...", "Describe the agreement or decision...", "اوصف الاتفاق أو القرار...")}
                placeholderTextColor={colors.muted}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
                style={{ backgroundColor: colors.surface, borderRadius: 10, padding: 12, fontSize: 14, color: colors.foreground, borderWidth: 1, borderColor: colors.border, minHeight: 100, marginBottom: 20 }}
              />

              {/* Save button */}
              <Pressable
                onPress={handleSave}
                style={({ pressed }) => [{ backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 14, alignItems: "center", opacity: pressed ? 0.8 : 1 }]}
              >
                <Text style={{ color: "#fff", fontSize: 15, fontWeight: "700" }}>
                  {editingNote ? tx(lang, "Bijwerken", "Update", "تحديث") : tx(lang, "Opslaan", "Save", "حفظ")}
                </Text>
              </Pressable>
            </ScrollView>
          </View>
        </View>
      )}
    </View>
  );
}
