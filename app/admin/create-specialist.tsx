import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView, Alert, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useColors } from "@/hooks/use-colors";
import { useI18n } from "@/lib/i18n";
import { useL3 } from "@/lib/admin-text";
import { trpc } from "@/lib/trpc";

export default function CreateSpecialistScreen() {
  const colors = useColors();
  const { isRTL } = useI18n();
  const L3 = useL3();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const create = (trpc.admin as any).createSpecialist.useMutation({
    onSuccess: (r: any) => Alert.alert(L3("تم الإنشاء", "Aangemaakt", "Created"), L3(`أُنشئ حساب المشرف التربوي (المعرّف ${r?.id}). يدخل بالبريد وكلمة المرور.`, `Het account van de pedagogisch begeleider is aangemaakt (ID ${r?.id}). Inloggen kan met e-mail en wachtwoord.`, `The educational specialist's account was created (ID ${r?.id}). They sign in with email and password.`), [{ text: L3("حسنًا", "OK", "OK"), onPress: () => router.back() }]),
    onError: (e: any) => Alert.alert(L3("خطأ", "Fout", "Error"), e?.message || L3("تعذّر إنشاء الحساب.", "Account aanmaken mislukt.", "Could not create the account.")),
  });

  const submit = () => {
    if (!name.trim() || !email.trim() || password.length < 6) { Alert.alert(L3("تنبيه", "Let op", "Notice"), L3("أدخل الاسم والبريد وكلمة مرور (٦ أحرف على الأقل).", "Vul naam, e-mail en een wachtwoord in (minimaal 6 tekens).", "Enter a name, email and password (at least 6 characters).")); return; }
    create.mutate({ name: name.trim(), email: email.trim(), password });
  };

  const inputStyle = { backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, color: colors.foreground, textAlign: (isRTL ? "right" : "left") as "right" | "left", borderWidth: 1, borderColor: colors.border, marginTop: 6 };
  const label = (s: string) => <Text style={{ fontSize: 13, fontWeight: "600", color: colors.foreground, textAlign: isRTL ? "right" : "left", marginTop: 14 }}>{s}</Text>;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ paddingTop: insets.top + 8, paddingBottom: 12, paddingHorizontal: 16, backgroundColor: colors.surface, borderBottomWidth: 0.5, borderBottomColor: colors.border, flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 12 }}>
        <TouchableOpacity onPress={() => router.back()}><MaterialIcons name={isRTL ? "arrow-forward" : "arrow-back"} size={24} color={colors.foreground} /></TouchableOpacity>
        <Text style={{ fontSize: 18, fontWeight: "700", color: colors.foreground, flex: 1, textAlign: isRTL ? "right" : "left" }}>{L3("إضافة مشرف تربوي جديد", "Nieuwe pedagogisch begeleider", "New educational specialist")}</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }} keyboardShouldPersistTaps="handled">
        <Text style={{ fontSize: 12, color: colors.muted, textAlign: isRTL ? "right" : "left", lineHeight: 20 }}>
          {L3("يُنشئ حساب مشرف تربوي جديد (ليس مستخدمًا في التطبيق). يدخل المشرف التربوي بالبريد وكلمة المرور اللذين تحددهما.", "Maakt een nieuw account voor een pedagogisch begeleider aan (geen app-gebruiker). De begeleider logt in met het e-mailadres en wachtwoord die u hier kiest.", "Creates a new educational specialist account (not an app user). The specialist signs in with the email and password you set here.")}
        </Text>
        {label(L3("الاسم", "Naam", "Name"))}
        <TextInput value={name} onChangeText={setName} placeholder={L3("اسم المشرف التربوي", "Naam van de begeleider", "Specialist's name")} placeholderTextColor={colors.muted} style={inputStyle} />
        {label(L3("البريد الإلكتروني", "E-mailadres", "Email address"))}
        <TextInput value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="email@example.com" placeholderTextColor={colors.muted} style={inputStyle} />
        {label(L3("كلمة المرور", "Wachtwoord", "Password"))}
        <TextInput value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" placeholder={L3("٦ أحرف على الأقل", "Minimaal 6 tekens", "At least 6 characters")} placeholderTextColor={colors.muted} style={inputStyle} />
        <TouchableOpacity onPress={submit} disabled={create.isPending} style={{ backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 14, alignItems: "center", marginTop: 24, opacity: create.isPending ? 0.6 : 1 }}>
          {create.isPending ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>{L3("إنشاء الحساب", "Account aanmaken", "Create account")}</Text>}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}
