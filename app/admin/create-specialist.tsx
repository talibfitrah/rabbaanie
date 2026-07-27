import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView, Alert, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useColors } from "@/hooks/use-colors";
import { useI18n } from "@/lib/i18n";
import { trpc } from "@/lib/trpc";

export default function CreateSpecialistScreen() {
  const colors = useColors();
  const { isRTL } = useI18n();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const create = (trpc.admin as any).createSpecialist.useMutation({
    onSuccess: (r: any) => Alert.alert("تم الإنشاء", `أُنشئ حساب المتخصص (المعرّف ${r?.id}). يدخل بالبريد وكلمة المرور.`, [{ text: "حسنًا", onPress: () => router.back() }]),
    onError: (e: any) => Alert.alert("خطأ", e?.message || "تعذّر إنشاء الحساب."),
  });

  const submit = () => {
    if (!name.trim() || !email.trim() || password.length < 6) { Alert.alert("تنبيه", "أدخل الاسم والبريد وكلمة مرور (٦ أحرف على الأقل)."); return; }
    create.mutate({ name: name.trim(), email: email.trim(), password });
  };

  const inputStyle = { backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, color: colors.foreground, textAlign: (isRTL ? "right" : "left") as "right" | "left", borderWidth: 1, borderColor: colors.border, marginTop: 6 };
  const label = (s: string) => <Text style={{ fontSize: 13, fontWeight: "600", color: colors.foreground, textAlign: isRTL ? "right" : "left", marginTop: 14 }}>{s}</Text>;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ paddingTop: insets.top + 8, paddingBottom: 12, paddingHorizontal: 16, backgroundColor: colors.surface, borderBottomWidth: 0.5, borderBottomColor: colors.border, flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 12 }}>
        <TouchableOpacity onPress={() => router.back()}><MaterialIcons name={isRTL ? "arrow-forward" : "arrow-back"} size={24} color={colors.foreground} /></TouchableOpacity>
        <Text style={{ fontSize: 18, fontWeight: "700", color: colors.foreground, flex: 1, textAlign: isRTL ? "right" : "left" }}>إضافة متخصص جديد</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }} keyboardShouldPersistTaps="handled">
        <Text style={{ fontSize: 12, color: colors.muted, textAlign: isRTL ? "right" : "left", lineHeight: 20 }}>
          يُنشئ حساب متخصص جديد (ليس مستخدمًا في التطبيق). يدخل المتخصص بالبريد وكلمة المرور اللذين تحددهما.
        </Text>
        {label("الاسم")}
        <TextInput value={name} onChangeText={setName} placeholder="اسم المتخصص" placeholderTextColor={colors.muted} style={inputStyle} />
        {label("البريد الإلكتروني")}
        <TextInput value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="email@example.com" placeholderTextColor={colors.muted} style={inputStyle} />
        {label("كلمة المرور")}
        <TextInput value={password} onChangeText={setPassword} autoCapitalize="none" placeholder="٦ أحرف على الأقل" placeholderTextColor={colors.muted} style={inputStyle} />
        <TouchableOpacity onPress={submit} disabled={create.isPending} style={{ backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 14, alignItems: "center", marginTop: 24, opacity: create.isPending ? 0.6 : 1 }}>
          {create.isPending ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>إنشاء الحساب</Text>}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}
