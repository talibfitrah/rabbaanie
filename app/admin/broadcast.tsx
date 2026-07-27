import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView, Alert, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useColors } from "@/hooks/use-colors";
import { useI18n } from "@/lib/i18n";
import { trpc } from "@/lib/trpc";

const TARGETS = [
  { key: "all", ar: "كل المستخدمين" },
  { key: "parents", ar: "الآباء" },
  { key: "admins", ar: "المدراء" },
];

export default function BroadcastScreen() {
  const colors = useColors();
  const { isRTL } = useI18n();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [target, setTarget] = useState("all");

  const send = (trpc.admin as any).sendBroadcast.useMutation({
    onSuccess: (r: any) => Alert.alert("تم الإرسال", `وصلت الرسالة إلى ${r?.sent ?? 0} جهاز.`, [{ text: "حسنًا", onPress: () => router.back() }]),
    onError: (e: any) => Alert.alert("خطأ", e?.message || "تعذّر الإرسال. تأكد أنك المالك."),
  });

  const submit = () => {
    if (!subject.trim() || !message.trim()) { Alert.alert("تنبيه", "أدخل العنوان والنص."); return; }
    send.mutate({ subject: subject.trim(), message: message.trim(), target });
  };

  const inputStyle = { backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, color: colors.foreground, textAlign: (isRTL ? "right" : "left") as "right" | "left", borderWidth: 1, borderColor: colors.border, marginTop: 6 };
  const label = (s: string) => <Text style={{ fontSize: 13, fontWeight: "600", color: colors.foreground, textAlign: isRTL ? "right" : "left", marginTop: 14 }}>{s}</Text>;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ paddingTop: insets.top + 8, paddingBottom: 12, paddingHorizontal: 16, backgroundColor: colors.surface, borderBottomWidth: 0.5, borderBottomColor: colors.border, flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 12 }}>
        <TouchableOpacity onPress={() => router.back()}><MaterialIcons name={isRTL ? "arrow-forward" : "arrow-back"} size={24} color={colors.foreground} /></TouchableOpacity>
        <Text style={{ fontSize: 18, fontWeight: "700", color: colors.foreground, flex: 1, textAlign: isRTL ? "right" : "left" }}>رسالة جماعية</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }} keyboardShouldPersistTaps="handled">
        <Text style={{ fontSize: 12, color: colors.muted, textAlign: isRTL ? "right" : "left", lineHeight: 20 }}>تُرسَل كإشعار فوري إلى المستخدمين المحددين.</Text>
        {label("إلى")}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 6 }}>
          {TARGETS.map((t) => (
            <TouchableOpacity key={t.key} onPress={() => setTarget(t.key)}
              style={{ backgroundColor: target === t.key ? colors.primary : colors.surface, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 13, borderWidth: 1, borderColor: target === t.key ? colors.primary : colors.border }}>
              <Text style={{ fontSize: 13, fontWeight: "700", color: target === t.key ? "#fff" : colors.foreground }}>{t.ar}</Text>
            </TouchableOpacity>
          ))}
        </View>
        {label("العنوان")}
        <TextInput value={subject} onChangeText={setSubject} placeholder="عنوان الإشعار" placeholderTextColor={colors.muted} style={inputStyle} />
        {label("النص")}
        <TextInput value={message} onChangeText={setMessage} multiline placeholder="نص الرسالة" placeholderTextColor={colors.muted} style={{ ...inputStyle, minHeight: 120, textAlignVertical: "top" }} />
        <TouchableOpacity onPress={submit} disabled={send.isPending} style={{ backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 14, alignItems: "center", marginTop: 22, opacity: send.isPending ? 0.6 : 1 }}>
          {send.isPending ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>إرسال</Text>}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}
