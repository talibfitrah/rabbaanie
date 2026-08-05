import React, { useState } from "react";
import { View, Text, Pressable, TextInput, ScrollView, Alert, Platform, KeyboardAvoidingView } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/use-colors";
import { useAppState } from "@/lib/app-context";
import { useI18n, Language } from "@/lib/i18n";
import { ChildProfile } from "@/lib/store";
import { DatePicker } from "@/components/date-picker";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { trpc } from "@/lib/trpc";
import { PremiumGate, PremiumNotice, usePremiumGate } from "@/components/premium-notice";

function tx(lang: Language, nl: string, en: string, ar: string): string {
  return lang === "ar" ? ar : lang === "en" ? en : nl;
}

function AddChildScreenInner() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { language } = useI18n();
  const lang = language as Language;
  const { addChild, state } = useAppState();
  const { subscribed, loading: subLoading } = usePremiumGate();

  const [name, setName] = useState("");
  const [gender, setGender] = useState<"jongen" | "meisje" | "">("");
  const [birthDate, setBirthDate] = useState("");
  const [bsn, setBsn] = useState("");
  const [saving, setSaving] = useState(false);

  // Auto-link to network when BSN is provided
  const linkChildMutation = trpc.links.linkChildByPublicId.useMutation();

  const handleSave = async () => {
    if (subLoading) return; // status still loading — don't bounce a subscriber
    if (!subscribed) { router.push("/subscribe" as any); return; }
    if (!name.trim()) {
      Alert.alert(
        tx(lang, "Naam vereist", "Name required", "الاسم مطلوب"),
        tx(lang, "Vul de naam van het kind in", "Please enter the child's name", "يرجى إدخال اسم الطفل")
      );
      return;
    }
    setSaving(true);
    // Generate deterministic ID from name + birthdate for consistent parent-child linking
    const childIdBase = `${name.trim().toLowerCase().replace(/\s+/g, "_")}_${(birthDate || "unknown").replace(/-/g, "")}`;
    const child: ChildProfile = {
      id: childIdBase,
      name: name.trim(),
      birthDate: birthDate || "",
      gender: gender || "",
      profileCompleted: !!(name && birthDate && gender),
      laterInvullen: false,
      parentId: state?.parentProfile?.firstName || "parent",
    };
    await addChild(child);
    // If BSN/ID is provided, auto-link to network
    if (bsn.trim()) {
      try {
        await linkChildMutation.mutateAsync({ childPublicId: bsn.trim(), relationship: "parent" });
      } catch (e) {
        // Non-blocking - child is still added locally, suppress error message
      }
    }
    setSaving(false);
    Alert.alert(
      tx(lang, "Opgeslagen", "Saved", "تم الحفظ"),
      tx(lang, "Kind is toegevoegd, met Gods hulp.", "Child has been added, by God's grace.", "تم الحفظ بعون الله."),
      [{ text: tx(lang, "OK", "OK", "حسنًا"), onPress: () => router.back() }]
    );
  };

  const isRTL = lang === "ar";

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 16, paddingBottom: 12, flexDirection: "row", alignItems: "center", borderBottomWidth: 0.5, borderBottomColor: colors.border }}>
        <Pressable onPress={() => router.back()} style={({ pressed }) => [{ padding: 8, opacity: pressed ? 0.6 : 1 }]}>
          <MaterialIcons name={isRTL ? "arrow-forward" : "arrow-back"} size={24} color={colors.foreground} />
        </Pressable>
        <Text style={{ flex: 1, textAlign: "center", fontSize: 18, fontWeight: "700", color: colors.foreground }}>
          {tx(lang, "Kind toevoegen", "Add Child", "إضافة طفل")}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <PremiumNotice />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 80 }} keyboardShouldPersistTaps="handled">
        {/* Name */}
        <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground, marginBottom: 6, textAlign: isRTL ? "right" : "left" }}>
          {tx(lang, "Naam van het kind", "Child's name", "اسم الطفل")} *
        </Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder={tx(lang, "Bijv. Ahmed", "E.g. Ahmed", "مثال: أحمد")}
          placeholderTextColor={colors.muted}
          style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 14, fontSize: 16, color: colors.foreground, textAlign: isRTL ? "right" : "left", marginBottom: 20 }}
          returnKeyType="done"
        />

        {/* Gender */}
        <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground, marginBottom: 6, textAlign: isRTL ? "right" : "left" }}>
          {tx(lang, "Geslacht", "Gender", "الجنس")}
        </Text>
        <View style={{ flexDirection: isRTL ? "row-reverse" : "row", gap: 12, marginBottom: 20 }}>
          <Pressable
            onPress={() => setGender("jongen")}
            style={({ pressed }) => [{ flex: 1, paddingVertical: 14, borderRadius: 10, borderWidth: 2, borderColor: gender === "jongen" ? "#1565C0" : colors.border, backgroundColor: gender === "jongen" ? "#E3F2FD" : colors.surface, alignItems: "center", opacity: pressed ? 0.8 : 1 }]}
          >
            <MaterialIcons name="face-6" size={28} color={gender === "jongen" ? "#1565C0" : colors.muted} />
            <Text style={{ marginTop: 4, fontSize: 13, fontWeight: "600", color: gender === "jongen" ? "#1565C0" : colors.foreground }}>
              {tx(lang, "Jongen", "Boy", "ولد")}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setGender("meisje")}
            style={({ pressed }) => [{ flex: 1, paddingVertical: 14, borderRadius: 10, borderWidth: 2, borderColor: gender === "meisje" ? "#E91E63" : colors.border, backgroundColor: gender === "meisje" ? "#FCE4EC" : colors.surface, alignItems: "center", opacity: pressed ? 0.8 : 1 }]}
          >
            <MaterialIcons name="face-3" size={28} color={gender === "meisje" ? "#E91E63" : colors.muted} />
            <Text style={{ marginTop: 4, fontSize: 13, fontWeight: "600", color: gender === "meisje" ? "#E91E63" : colors.foreground }}>
              {tx(lang, "Meisje", "Girl", "بنت")}
            </Text>
          </Pressable>
        </View>

        {/* Birth Date */}
        <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground, marginBottom: 6, textAlign: isRTL ? "right" : "left" }}>
          {tx(lang, "Geboortedatum", "Date of birth", "تاريخ الميلاد")}
        </Text>
        <DatePicker
          value={birthDate}
          onChange={setBirthDate}
          placeholder={tx(lang, "Selecteer datum", "Select date", "اختر التاريخ")}
        />
        <View style={{ height: 20 }} />

        {/* BSN / Identity Number */}
        <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground, marginBottom: 6, textAlign: isRTL ? "right" : "left" }}>
          {tx(lang, "BSN / ID-nummer", "BSN / ID number", "رقم الهوية / BSN")}
        </Text>
        <TextInput
          value={bsn}
          onChangeText={setBsn}
          placeholder={tx(lang, "Optioneel", "Optional", "اختياري")}
          placeholderTextColor={colors.muted}
          keyboardType="number-pad"
          style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 14, fontSize: 16, color: colors.foreground, textAlign: isRTL ? "right" : "left", marginBottom: 8 }}
          returnKeyType="done"
        />
        <Text style={{ fontSize: 11, color: colors.muted, textAlign: isRTL ? "right" : "left", marginBottom: 20 }}>
          {tx(lang, "Bij het invullen van het BSN wordt het kind automatisch gekoppeld aan uw netwerk", "When BSN is entered, the child will be automatically linked to your network", "عند إدخال رقم الهوية سيتم ربط الطفل تلقائياً بشبكتك")}
        </Text>

        {/* Save Button */}
        <Pressable
          onPress={handleSave}
          disabled={saving}
          style={({ pressed }) => [{ backgroundColor: "#1B4332", paddingVertical: 16, borderRadius: 12, alignItems: "center", opacity: pressed || saving ? 0.7 : 1, marginTop: 10 }]}
        >
          <Text style={{ color: "#fff", fontSize: 16, fontWeight: "700" }}>
            {saving ? tx(lang, "Opslaan...", "Saving...", "جاري الحفظ...") : tx(lang, "Kind toevoegen", "Add Child", "إضافة طفل")}
          </Text>
        </Pressable>
      </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

/**
 * Paid feature: advertised on the subscribe screen, so it is closed to
 * non-subscribers rather than shown with a banner over it. Wrapping rather
 * than an early return means every return path inside is covered, and the
 * inner component's hooks never run for a non-subscriber.
 */
export default function AddChildScreen() {
  return (
    <PremiumGate>
      <AddChildScreenInner />
    </PremiumGate>
  );
}
