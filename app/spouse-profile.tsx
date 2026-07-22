import { useState, useEffect } from "react";
import { Text, View, ScrollView, Pressable, ActivityIndicator, StyleSheet } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useI18n } from "@/lib/i18n";
import { useRouter } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { trpc } from "@/lib/trpc";

function tx(lang: string, nl: string, en: string, ar: string) {
  return lang === "ar" ? ar : lang === "nl" ? nl : en;
}

export default function SpouseProfileScreen() {
  const colors = useColors();
  const { language: lang, isRTL } = useI18n();
  const router = useRouter();

  const partnerProfileQuery = trpc.links.getPartnerProfile.useQuery(undefined, {
    refetchOnMount: "always",
    staleTime: 0,
  });

  const pp = partnerProfileQuery.data?.parentProfile;
  const partnerName = partnerProfileQuery.data?.name || tx(lang, "Partner", "Partner", "الشريك/ة");

  const translateValue = (v: any) => {
    if (!v) return "-";
    const s = String(v);
    if (s === "ja" || s === "yes") return tx(lang, "Ja", "Yes", "نعم");
    if (s === "nee" || s === "no") return tx(lang, "Nee", "No", "لا");
    return s;
  };

  if (partnerProfileQuery.isLoading) {
    return (
      <ScreenContainer edges={["top", "bottom", "left", "right"]} className="p-4">
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </ScreenContainer>
    );
  }

  if (!partnerProfileQuery.data || !pp) {
    return (
      <ScreenContainer edges={["top", "bottom", "left", "right"]} className="p-4">
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 20 }}>
          <MaterialIcons name="person-off" size={48} color={colors.muted} />
          <Text style={{ fontSize: 16, color: colors.muted, textAlign: "center", marginTop: 12 }}>
            {tx(lang, "Geen partnerprofiel gevonden", "No partner profile found", "لم يتم العثور على ملف الزوجة")}
          </Text>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [{ marginTop: 20, backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 24, opacity: pressed ? 0.8 : 1 }]}
          >
            <Text style={{ color: "#fff", fontWeight: "600" }}>{tx(lang, "Terug", "Back", "رجوع")}</Text>
          </Pressable>
        </View>
      </ScreenContainer>
    );
  }

  // Build profile fields
  const profileFields = [
    { key: "prayer", label: tx(lang, "Gebed", "Prayer", "الصلاة"), icon: "access-time" },
    { key: "fajr", label: tx(lang, "Fajr gebed", "Fajr prayer", "صلاة الفجر"), icon: "wb-twilight" },
    { key: "hijab", label: tx(lang, "Hijaab", "Hijab", "الحجاب"), icon: "checkroom" },
    { key: "knowledgeSource", label: tx(lang, "Bron van kennis", "Source of knowledge", "مصدر المعرفة"), icon: "menu-book" },
    { key: "familyScience", label: tx(lang, "Gezinskunde", "Family science", "علم الأسرة"), icon: "family-restroom" },
    { key: "quranReading", label: tx(lang, "Qur'aan lezen", "Qur'aan reading", "قراءة القرآن"), icon: "auto-stories" },
    { key: "adhkar", label: tx(lang, "Adhkaar", "Adhkaar", "الأذكار"), icon: "favorite" },
    { key: "educationLevel", label: tx(lang, "Opleidingsniveau", "Education level", "المستوى التعليمي"), icon: "school" },
    { key: "workStatus", label: tx(lang, "Werkstatus", "Work status", "حالة العمل"), icon: "work" },
    { key: "healthStatus", label: tx(lang, "Gezondheid", "Health", "الصحة"), icon: "health-and-safety" },
    { key: "stressLevel", label: tx(lang, "Stressniveau", "Stress level", "مستوى التوتر"), icon: "psychology" },
    { key: "partnerRelationQuality", label: tx(lang, "Relatie kwaliteit", "Relationship quality", "جودة العلاقة"), icon: "favorite-border" },
    { key: "parentingStyle", label: tx(lang, "Opvoedstijl", "Parenting style", "أسلوب التربية"), icon: "child-care" },
    { key: "mainConcern", label: tx(lang, "Belangrijkste zorg", "Main concern", "أهم مخاوفها"), icon: "warning" },
    { key: "goals", label: tx(lang, "Doelen", "Goals", "الأهداف"), icon: "flag" },
  ];

  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Header */}
        <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12 }}>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1, padding: 8 }]}
          >
            <MaterialIcons name={isRTL ? "arrow-forward" : "arrow-back"} size={24} color={colors.foreground} />
          </Pressable>
          <Text style={{ fontSize: 18, fontWeight: "800", color: colors.foreground }}>
            {tx(lang, "Profiel van mijn vrouw", "My wife's profile", "ملف زوجتي")}
          </Text>
          <View style={{ width: 40 }} />
        </View>

        {/* Partner name card */}
        <View style={{ marginHorizontal: 16, marginBottom: 16, backgroundColor: "#FFF0F5", borderRadius: 14, padding: 16, alignItems: "center", borderWidth: 1, borderColor: "#F9A8D4" }}>
          <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: "#F9A8D4", alignItems: "center", justifyContent: "center", marginBottom: 8 }}>
            <MaterialIcons name="person" size={32} color="#9D174D" />
          </View>
          <Text style={{ fontSize: 18, fontWeight: "700", color: "#9D174D" }}>{partnerName}</Text>
          <Text style={{ fontSize: 12, color: "#BE185D", marginTop: 4 }}>
            {tx(lang, "Ingevuld door haar", "Filled by her", "ملأته هي")}
          </Text>
        </View>

        {/* Profile fields */}
        <View style={{ marginHorizontal: 16, gap: 8 }}>
          {profileFields.map(({ key, label, icon }) => {
            const value = (pp as any)?.[key];
            if (!value) return null;
            return (
              <View key={key} style={{
                backgroundColor: colors.surface,
                borderRadius: 12,
                padding: 12,
                borderWidth: 1,
                borderColor: colors.border,
                flexDirection: isRTL ? "row-reverse" : "row",
                alignItems: "center",
                gap: 10,
              }}>
                <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.primary + "15", alignItems: "center", justifyContent: "center" }}>
                  <MaterialIcons name={icon as any} size={16} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 11, color: colors.muted, textAlign: isRTL ? "right" : "left" }}>{label}</Text>
                  <Text style={{ fontSize: 13, fontWeight: "600", color: colors.foreground, textAlign: isRTL ? "right" : "left", marginTop: 2 }}>
                    {translateValue(value)}
                  </Text>
                </View>
              </View>
            );
          })}

          {/* If no fields filled */}
          {profileFields.every(({ key }) => !(pp as any)?.[key]) && (
            <View style={{ alignItems: "center", paddingVertical: 30 }}>
              <MaterialIcons name="edit-note" size={40} color={colors.muted} />
              <Text style={{ fontSize: 13, color: colors.muted, textAlign: "center", marginTop: 8 }}>
                {tx(lang, "Uw partner heeft haar profiel nog niet ingevuld", "Your partner hasn't filled her profile yet", "زوجتك لم تملأ ملفها بعد")}
              </Text>
            </View>
          )}
        </View>

        {/* Partner's children */}
        {partnerProfileQuery.data?.children && partnerProfileQuery.data.children.length > 0 && (
          <View style={{ marginHorizontal: 16, marginTop: 20 }}>
            <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground, marginBottom: 8, textAlign: isRTL ? "right" : "left" }}>
              {tx(lang, "Kinderen (volgens haar)", "Children (according to her)", "الأطفال (حسب ملفها)")}
            </Text>
            {partnerProfileQuery.data.children.map((child: any, idx: number) => (
              <View key={child.id || idx} style={{
                backgroundColor: colors.surface,
                borderRadius: 10,
                padding: 10,
                marginBottom: 6,
                borderWidth: 1,
                borderColor: colors.border,
                flexDirection: isRTL ? "row-reverse" : "row",
                alignItems: "center",
                gap: 8,
              }}>
                <MaterialIcons name="child-care" size={18} color={colors.primary} />
                <Text style={{ fontSize: 12, color: colors.foreground, fontWeight: "600" }}>{child.name}</Text>
                {child.birthDate && (
                  <Text style={{ fontSize: 10, color: colors.muted }}>({child.birthDate})</Text>
                )}
              </View>
            ))}
          </View>
        )}

        {/* Partner's issues */}
        {partnerProfileQuery.data?.issues && partnerProfileQuery.data.issues.length > 0 && (
          <View style={{ marginHorizontal: 16, marginTop: 20 }}>
            <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground, marginBottom: 8, textAlign: isRTL ? "right" : "left" }}>
              {tx(lang, "Problemen (volgens haar)", "Issues (according to her)", "المشاكل (حسب ملفها)")}
            </Text>
            {partnerProfileQuery.data.issues.map((issue: any, idx: number) => (
              <View key={issue.id || idx} style={{
                backgroundColor: "#FEF2F2",
                borderRadius: 10,
                padding: 10,
                marginBottom: 6,
                borderWidth: 1,
                borderColor: "#FECACA",
              }}>
                <Text style={{ fontSize: 12, color: "#991B1B", fontWeight: "600", textAlign: isRTL ? "right" : "left" }}>
                  {issue.description || issue.title || `${tx(lang, "Probleem", "Issue", "مشكلة")} ${idx + 1}`}
                </Text>
                {issue.childName && (
                  <Text style={{ fontSize: 10, color: "#B91C1C", marginTop: 2, textAlign: isRTL ? "right" : "left" }}>
                    {tx(lang, "Kind:", "Child:", "الطفل:")} {issue.childName}
                  </Text>
                )}
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}
