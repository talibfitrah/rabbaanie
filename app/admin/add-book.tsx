import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView, Alert, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useColors } from "@/hooks/use-colors";
import { useI18n } from "@/lib/i18n";
import { trpc } from "@/lib/trpc";

export default function AddBookScreen() {
  const colors = useColors();
  const { isRTL } = useI18n();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("الهدايات");
  const [text, setText] = useState("");

  // addBook exists on the live server (rabbaanie-api); the client's bundled router
  // type copy predates it, so cast past the stale type.
  const addBook = (trpc.admin as any).addBook.useMutation({
    onSuccess: (r: any) => {
      Alert.alert("تمت الإضافة", `أُضيف الكتاب إلى المكتبة، وأُدرِج ${r?.chunksAdded ?? 0} مقطعًا في معرفة المستشار الذكي.`, [
        { text: "حسنًا", onPress: () => router.back() },
      ]);
    },
    onError: (e: any) => Alert.alert("خطأ", e?.message || "تعذّرت الإضافة. تأكد أنك مسجّل الدخول بحساب المالك."),
  });

  const submit = () => {
    if (!title.trim() || !text.trim()) { Alert.alert("تنبيه", "أدخل عنوان الكتاب ونصّه."); return; }
    addBook.mutate({ title_ar: title.trim(), category: category.trim() || "الهدايات", text: text.trim() });
  };

  const inputStyle = {
    backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
    color: colors.foreground, textAlign: (isRTL ? "right" : "left") as "right" | "left", borderWidth: 1, borderColor: colors.border,
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ paddingTop: insets.top + 8, paddingBottom: 12, paddingHorizontal: 16, backgroundColor: colors.surface, borderBottomWidth: 0.5, borderBottomColor: colors.border, flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 12 }}>
        <TouchableOpacity onPress={() => router.back()}><MaterialIcons name={isRTL ? "arrow-forward" : "arrow-back"} size={24} color={colors.foreground} /></TouchableOpacity>
        <Text style={{ fontSize: 18, fontWeight: "700", color: colors.foreground, flex: 1, textAlign: isRTL ? "right" : "left" }}>إضافة كتاب</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40, gap: 12 }} keyboardShouldPersistTaps="handled">
        <Text style={{ fontSize: 12, color: colors.muted, textAlign: isRTL ? "right" : "left", lineHeight: 20 }}>
          يظهر الكتاب في المكتبة فورًا (دون تحديث التطبيق) ويستفيد منه المستشار الذكي. افصل الفصول بسطرين فارغين، والفقرات بسطر فارغ.
        </Text>
        <Text style={{ fontSize: 13, fontWeight: "600", color: colors.foreground, textAlign: isRTL ? "right" : "left" }}>عنوان الكتاب</Text>
        <TextInput value={title} onChangeText={setTitle} placeholder="مثال: هدايات سورة يس" placeholderTextColor={colors.muted} style={inputStyle} />
        <Text style={{ fontSize: 13, fontWeight: "600", color: colors.foreground, textAlign: isRTL ? "right" : "left" }}>التصنيف</Text>
        <TextInput value={category} onChangeText={setCategory} placeholder="الهدايات" placeholderTextColor={colors.muted} style={inputStyle} />
        <Text style={{ fontSize: 13, fontWeight: "600", color: colors.foreground, textAlign: isRTL ? "right" : "left" }}>نص الكتاب</Text>
        <TextInput value={text} onChangeText={setText} placeholder="الصق نص الكتاب هنا…" placeholderTextColor={colors.muted} multiline style={{ ...inputStyle, minHeight: 220, textAlignVertical: "top" }} />
        <TouchableOpacity onPress={submit} disabled={addBook.isPending} style={{ backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 14, alignItems: "center", opacity: addBook.isPending ? 0.6 : 1, marginTop: 4 }}>
          {addBook.isPending ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>إضافة إلى المكتبة</Text>}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}
