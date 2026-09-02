import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView, Alert, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useColors } from "@/hooks/use-colors";
import { useI18n } from "@/lib/i18n";
import { useL3 } from "@/lib/admin-text";
import { trpc } from "@/lib/trpc";

export default function AddBookScreen() {
  const colors = useColors();
  const { isRTL } = useI18n();
  const L3 = useL3();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("الهدايات");
  const [text, setText] = useState("");

  // addBook exists on the live server (rabbaanie-api); the client's bundled router
  // type copy predates it, so cast past the stale type.
  const addBook = (trpc.admin as any).addBook.useMutation({
    onSuccess: (r: any) => {
      Alert.alert(L3("تمت الإضافة", "Toegevoegd", "Added"), L3(`أُضيف الكتاب إلى المكتبة، وأُدرِج ${r?.chunksAdded ?? 0} مقطعًا في معرفة المستشار الذكي.`, `Het boek is aan de bibliotheek toegevoegd; ${r?.chunksAdded ?? 0} fragmenten zijn opgenomen in de kennis van de AI-adviseur.`, `The book was added to the library; ${r?.chunksAdded ?? 0} passages were added to the AI advisor's knowledge.`), [
        { text: L3("حسنًا", "OK", "OK"), onPress: () => router.back() },
      ]);
    },
    onError: (e: any) => Alert.alert(L3("خطأ", "Fout", "Error"), e?.message || L3("تعذّرت الإضافة. تأكد أنك مسجّل الدخول بحساب المالك.", "Toevoegen mislukt. Controleer of u bent ingelogd met het eigenaarsaccount.", "Could not add. Make sure you're signed in with the owner account.")),
  });

  const submit = () => {
    if (!title.trim() || !text.trim()) { Alert.alert(L3("تنبيه", "Let op", "Notice"), L3("أدخل عنوان الكتاب ونصّه.", "Vul de titel en de tekst van het boek in.", "Enter the book's title and text.")); return; }
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
        <Text style={{ fontSize: 18, fontWeight: "700", color: colors.foreground, flex: 1, textAlign: isRTL ? "right" : "left" }}>{L3("إضافة كتاب", "Boek toevoegen", "Add book")}</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40, gap: 12 }} keyboardShouldPersistTaps="handled">
        <Text style={{ fontSize: 12, color: colors.muted, textAlign: isRTL ? "right" : "left", lineHeight: 20 }}>
          {L3("يظهر الكتاب في المكتبة فورًا (دون تحديث التطبيق) ويستفيد منه المستشار الذكي. افصل الفصول بسطرين فارغين، والفقرات بسطر فارغ.", "Het boek verschijnt direct in de bibliotheek (zonder app-update) en de AI-adviseur maakt er gebruik van. Scheid hoofdstukken met twee lege regels en alinea's met één lege regel.", "The book appears in the library immediately (no app update needed) and the AI advisor draws on it. Separate chapters with two blank lines and paragraphs with one.")}
        </Text>
        <Text style={{ fontSize: 13, fontWeight: "600", color: colors.foreground, textAlign: isRTL ? "right" : "left" }}>{L3("عنوان الكتاب", "Boektitel", "Book title")}</Text>
        <TextInput value={title} onChangeText={setTitle} placeholder={L3("مثال: هدايات سورة يس", "Bijv.: Hidayat van soera Yasin", "e.g. Hidayat of Surah Yasin")} placeholderTextColor={colors.muted} style={inputStyle} />
        <Text style={{ fontSize: 13, fontWeight: "600", color: colors.foreground, textAlign: isRTL ? "right" : "left" }}>{L3("التصنيف", "Categorie", "Category")}</Text>
        <TextInput value={category} onChangeText={setCategory} placeholder="الهدايات" placeholderTextColor={colors.muted} style={inputStyle} />
        <Text style={{ fontSize: 13, fontWeight: "600", color: colors.foreground, textAlign: isRTL ? "right" : "left" }}>{L3("نص الكتاب", "Boektekst", "Book text")}</Text>
        <TextInput value={text} onChangeText={setText} placeholder={L3("الصق نص الكتاب هنا…", "Plak hier de tekst van het boek…", "Paste the book text here…")} placeholderTextColor={colors.muted} multiline style={{ ...inputStyle, minHeight: 220, textAlignVertical: "top" }} />
        <TouchableOpacity onPress={submit} disabled={addBook.isPending} style={{ backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 14, alignItems: "center", opacity: addBook.isPending ? 0.6 : 1, marginTop: 4 }}>
          {addBook.isPending ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>{L3("إضافة إلى المكتبة", "Aan bibliotheek toevoegen", "Add to library")}</Text>}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}
