import { useState, useEffect, useCallback } from "react";
import {
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  Alert,
  Platform,
  Switch,
  ActivityIndicator,
} from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useI18n } from "@/lib/i18n";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useAppState } from "@/lib/app-context";
import { loadNetwork, NetworkPerson } from "@/lib/network-store";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/hooks/use-auth";

const SHARE_PREFS_KEY = "@share_default_fields";

interface ShareField {
  key: string;
  label: { nl: string; en: string; ar: string };
  category: "profile" | "environment" | "issues";
}

const SHARE_FIELDS: ShareField[] = [
  { key: "name", label: { nl: "Naam", en: "Name", ar: "الاسم" }, category: "profile" },
  { key: "age", label: { nl: "Leeftijd", en: "Age", ar: "العمر" }, category: "profile" },
  { key: "gender", label: { nl: "Geslacht", en: "Gender", ar: "الجنس" }, category: "profile" },
  { key: "education", label: { nl: "Onderwijs", en: "Education", ar: "التعليم" }, category: "environment" },
  { key: "social", label: { nl: "Sociaal/Gezin", en: "Social/Family", ar: "اجتماعي/عائلي" }, category: "environment" },
  { key: "health", label: { nl: "Gezondheid", en: "Health", ar: "الصحة" }, category: "environment" },
  { key: "personality", label: { nl: "Persoonlijkheid", en: "Personality", ar: "الشخصية" }, category: "environment" },
  { key: "bond_allah", label: { nl: "Band met Allaah", en: "Bond with Allaah", ar: "الصلة بالله" }, category: "environment" },
  { key: "media", label: { nl: "Media & Structuur", en: "Media & Structure", ar: "الإعلام والهيكل" }, category: "environment" },
  { key: "issues", label: { nl: "Aandachtspunten", en: "Issues", ar: "نقاط الاهتمام" }, category: "issues" },
  { key: "treatment", label: { nl: "Behandelplan", en: "Treatment plan", ar: "خطة العلاج" }, category: "issues" },
];

type Lang = "nl" | "en" | "ar";
function tx(lang: Lang, nl: string, en: string, ar: string): string {
  if (lang === "en") return en;
  if (lang === "ar") return ar;
  return nl;
}

export default function ShareChildScreen() {
  const colors = useColors();
  const { t, language, isRTL } = useI18n();
  const router = useRouter();
  const params = useLocalSearchParams<{ childId: string }>();
  const { state } = useAppState();
  const { isAuthenticated } = useAuth();

  const childId = params.childId;
  const child = state.children.find((c) => c.id === childId);
  const env = (state.environments as any)?.find?.((e: any) => e.childId === childId) || (state.environments as any)?.[childId || ""];
  const issues = state.issues?.filter((i: any) => i.childId === childId) || [];

  const [selectedFields, setSelectedFields] = useState<Set<string>>(new Set(["name", "age", "gender"]));
  const [contacts, setContacts] = useState<NetworkPerson[]>([]);
  const [showFieldSelection, setShowFieldSelection] = useState(false);
  const [sharing, setSharing] = useState(false);

  const coParentsQuery = trpc.links.coParents.useQuery(undefined, { enabled: isAuthenticated });

  useEffect(() => {
    AsyncStorage.getItem(SHARE_PREFS_KEY).then((raw) => {
      if (raw) {
        try {
          const fields = JSON.parse(raw);
          if (Array.isArray(fields)) setSelectedFields(new Set(fields));
        } catch {}
      }
    });
    loadNetwork().then(setContacts);
  }, []);

  const toggleField = (key: string) => {
    setSelectedFields((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const saveDefaultFields = async () => {
    await AsyncStorage.setItem(SHARE_PREFS_KEY, JSON.stringify([...selectedFields]));
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert(
      tx(language as Lang, "Opgeslagen", "Saved", "تم الحفظ"),
      tx(language as Lang, "Standaard velden opgeslagen", "Default fields saved", "تم حفظ الحقول الافتراضية")
    );
  };

  const buildShareText = useCallback(() => {
    if (!child) return "";
    let text = "";
    const divider = "─".repeat(30);

    text += `📋 ${tx(language as Lang, "Samenvatting Kindgegevens", "Child Data Summary", "ملخص بيانات الطفل")}\n`;
    text += `${divider}\n\n`;

    if (selectedFields.has("name")) {
      text += `👤 ${tx(language as Lang, "Naam", "Name", "الاسم")}: ${child.name}\n`;
    }
    if (selectedFields.has("age") && child.birthDate) {
      const age = Math.floor((Date.now() - new Date(child.birthDate).getTime()) / (365.25 * 24 * 60 * 60 * 1000));
      text += `${tx(language as Lang, "Leeftijd", "Age", "العمر")}: ${age} ${tx(language as Lang, "jaar", "years", "سنة")}\n`;
    }
    if (selectedFields.has("gender") && child.gender) {
      text += `⚥ ${tx(language as Lang, "Geslacht", "Gender", "الجنس")}: ${child.gender}\n`;
    }

    if (env) {
      text += `\n${divider}\n`;
      text += `🏠 ${tx(language as Lang, "Omgeving", "Environment", "البيئة")}\n\n`;

      if (selectedFields.has("education") && env.education) {
        text += `📚 ${tx(language as Lang, "Onderwijs", "Education", "التعليم")}:\n`;
        if (env.education.schoolType) text += `  • ${env.education.schoolType}\n`;
        if (env.education.level) text += `  • ${env.education.level}\n`;
        if (env.education.notes) text += `  • ${env.education.notes}\n`;
        text += "\n";
      }

      if (selectedFields.has("social") && env.social) {
        text += `👥 ${tx(language as Lang, "Sociaal", "Social", "اجتماعي")}:\n`;
        if (env.social.familyStructure) text += `  • ${env.social.familyStructure}\n`;
        if (env.social.siblings) text += `  • ${tx(language as Lang, "Broers/zussen", "Siblings", "إخوة")}: ${env.social.siblings}\n`;
        if (env.social.notes) text += `  • ${env.social.notes}\n`;
        text += "\n";
      }

      if (selectedFields.has("health") && env.health) {
        text += `🏥 ${tx(language as Lang, "Gezondheid", "Health", "الصحة")}:\n`;
        if (env.health.conditions) text += `  • ${env.health.conditions}\n`;
        if (env.health.medications) text += `  • ${env.health.medications}\n`;
        if (env.health.notes) text += `  • ${env.health.notes}\n`;
        text += "\n";
      }

      if (selectedFields.has("personality") && env.personality) {
        text += `🧠 ${tx(language as Lang, "Persoonlijkheid", "Personality", "الشخصية")}:\n`;
        if (env.personality.traits) text += `  • ${env.personality.traits}\n`;
        if (env.personality.strengths) text += `  • ${tx(language as Lang, "Sterktes", "Strengths", "نقاط القوة")}: ${env.personality.strengths}\n`;
        if (env.personality.challenges) text += `  • ${tx(language as Lang, "Uitdagingen", "Challenges", "التحديات")}: ${env.personality.challenges}\n`;
        text += "\n";
      }

      if (selectedFields.has("bond_allah") && env.bondWithAllaah) {
        text += `🤲 ${tx(language as Lang, "Band met Allaah", "Bond with Allaah", "الصلة بالله")}:\n`;
        if (env.bondWithAllaah.prayer) text += `  • ${tx(language as Lang, "Gebed", "Prayer", "الصلاة")}: ${env.bondWithAllaah.prayer}\n`;
        if (env.bondWithAllaah.quran) text += `  • Qur'aan: ${env.bondWithAllaah.quran}\n`;
        if (env.bondWithAllaah.notes) text += `  • ${env.bondWithAllaah.notes}\n`;
        text += "\n";
      }

      if (selectedFields.has("media") && env.media) {
        text += `📱 ${tx(language as Lang, "Media", "Media", "الإعلام")}:\n`;
        if (env.media.screenTime) text += `  • ${tx(language as Lang, "Schermtijd", "Screen time", "وقت الشاشة")}: ${env.media.screenTime}\n`;
        if (env.media.devices) text += `  • ${env.media.devices}\n`;
        if (env.media.notes) text += `  • ${env.media.notes}\n`;
        text += "\n";
      }
    }

    if (selectedFields.has("issues") && issues.length > 0) {
      text += `\n${divider}\n`;
      text += `⚠️ ${tx(language as Lang, "Aandachtspunten", "Issues", "نقاط الاهتمام")}:\n\n`;
      issues.slice(0, 5).forEach((issue: any) => {
        text += `  • ${issue.title || issue.description || "—"}\n`;
        if (issue.severity) text += `    ${tx(language as Lang, "Ernst", "Severity", "الخطورة")}: ${issue.severity}\n`;
      });
      text += "\n";
    }

    if (selectedFields.has("treatment")) {
      const treated = issues.filter((i: any) => i.treatmentPlan);
      if (treated.length > 0) {
        text += `\n${divider}\n`;
        text += `💊 ${tx(language as Lang, "Behandelplan", "Treatment plan", "خطة العلاج")}:\n\n`;
        treated.slice(0, 3).forEach((issue: any) => {
          text += `  • ${issue.title}: ${issue.treatmentPlan?.substring(0, 100)}...\n`;
        });
        text += "\n";
      }
    }

    text += `\n${divider}\n`;
    text += `📅 ${tx(language as Lang, "Datum", "Date", "التاريخ")}: ${new Date().toLocaleDateString(language === "ar" ? "ar-SA" : language === "en" ? "en-US" : "nl-NL")}\n`;
    text += `🏷️ ${tx(language as Lang, "Via Tarbiyah App", "From Tarbiyah App", "من تطبيق تربية")}\n`;

    return text;
  }, [child, env, issues, selectedFields, language]);

  // Share as external text (system share sheet)
  const handleShareAsText = async () => {
    const text = buildShareText();
    if (!text) return;
    try {
      const { Share } = require("react-native");
      await Share.share({
        message: text,
        title: tx(language as Lang, "Samenvatting Kindgegevens", "Child Data Summary", "ملخص بيانات الطفل"),
      });
    } catch {
      Alert.alert(tx(language as Lang, "Fout", "Error", "خطأ"), tx(language as Lang, "Delen mislukt", "Sharing failed", "فشلت المشاركة"));
    }
  };

  // Share as PDF
  const handleShareAsPDF = async () => {
    setSharing(true);
    try {
      const text = buildShareText();
      // Create a simple HTML for PDF
      const html = `
        <html dir="${isRTL ? "rtl" : "ltr"}">
        <head><meta charset="utf-8"><style>
          body { font-family: Arial, sans-serif; padding: 20px; font-size: 14px; line-height: 1.8; direction: ${isRTL ? "rtl" : "ltr"}; }
          h1 { color: #1B4332; font-size: 20px; border-bottom: 2px solid #1B4332; padding-bottom: 8px; }
          .section { margin: 16px 0; padding: 12px; background: #f8f9fa; border-radius: 8px; }
          .section-title { font-weight: bold; color: #1B4332; font-size: 16px; margin-bottom: 8px; }
          .item { margin: 4px 0; }
          .footer { margin-top: 24px; padding-top: 12px; border-top: 1px solid #ddd; color: #666; font-size: 12px; }
        </style></head>
        <body>
          <h1>📋 ${tx(language as Lang, "Samenvatting Kindgegevens", "Child Data Summary", "ملخص بيانات الطفل")}</h1>
          <pre style="white-space: pre-wrap; font-family: Arial, sans-serif;">${text}</pre>
        </body></html>
      `;

      // Use Print module to generate PDF
      const { printToFileAsync } = await import("expo-print");
      const { isAvailableAsync, shareAsync } = await import("expo-sharing");
      const { uri } = await printToFileAsync({ html, base64: false });
      if (await isAvailableAsync()) {
        await shareAsync(uri, { mimeType: "application/pdf", dialogTitle: tx(language as Lang, "PDF Delen", "Share PDF", "مشاركة PDF") });
      } else {
        Alert.alert(tx(language as Lang, "PDF aangemaakt", "PDF created", "تم إنشاء PDF"), uri);
      }
    } catch (e: any) {
      Alert.alert(tx(language as Lang, "Fout", "Error", "خطأ"), e?.message || tx(language as Lang, "PDF genereren mislukt", "PDF generation failed", "فشل إنشاء PDF"));
    } finally {
      setSharing(false);
    }
  };

  // Share with network contact (in-app)
  const handleShareWithContact = (contact: NetworkPerson) => {
    const text = buildShareText();
    // Save shared data to AsyncStorage for the messaging system to pick up
    const shareData = {
      type: "child_data",
      childName: child?.name,
      recipientId: contact.id,
      recipientName: contact.name,
      data: text,
      timestamp: Date.now(),
    };
    AsyncStorage.setItem(`@shared_data_${Date.now()}`, JSON.stringify(shareData)).then(() => {
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(
        tx(language as Lang, "Gedeeld", "Shared", "تمت المشاركة"),
        tx(language as Lang, `Gegevens gedeeld met ${contact.name}`, `Data shared with ${contact.name}`, `تمت مشاركة البيانات مع ${contact.name}`)
      );
    });
  };

  // Share with partner (in-app via trpc)
  const shareWithPartnerMutation = trpc.links.shareWeeklyProgress.useMutation();
  const handleShareWithPartner = () => {
    if (!child) return;
    const text = buildShareText();
    shareWithPartnerMutation.mutate(
      { childName: child.name, weekNumber: 0, completedGoals: 0, totalGoals: 0, progressPercent: 0, summary: text },
      {
        onSuccess: () => {
          if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          Alert.alert(
            tx(language as Lang, "Gedeeld", "Shared", "تمت المشاركة"),
            tx(language as Lang, "Gegevens gedeeld met uw partner", "Data shared with your partner", "تمت مشاركة البيانات مع الشريك/ة")
          );
        },
        onError: () => {
          Alert.alert(tx(language as Lang, "Fout", "Error", "خطأ"), tx(language as Lang, "Delen mislukt", "Sharing failed", "فشلت المشاركة"));
        },
      }
    );
  };

  const shareableContacts = contacts.filter((c) => c.category !== "parents");
  const hasPartner = (coParentsQuery.data ?? []).length > 0;

  if (!child) {
    return (
      <ScreenContainer className="p-6">
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: colors.muted }}>{tx(language as Lang, "Kind niet gevonden", "Child not found", "لم يُعثر على الطفل")}</Text>
          <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 16 }}>
            <Text style={{ color: colors.primary }}>{tx(language as Lang, "Terug", "Back", "رجوع")}</Text>
          </TouchableOpacity>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer className="p-0">
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Header */}
        <View style={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12 }}>
          <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 12 }}>
            <TouchableOpacity onPress={() => router.back()}>
              <MaterialIcons name={isRTL ? "chevron-right" : "chevron-left"} size={28} color={colors.primary} />
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 20, fontWeight: "bold", color: colors.foreground, textAlign: isRTL ? "right" : "left" }}>
                {tx(language as Lang, "Gegevens Delen", "Share Data", "مشاركة البيانات")}
              </Text>
              <Text style={{ fontSize: 13, color: colors.muted, textAlign: isRTL ? "right" : "left" }}>
                {child.name}
              </Text>
            </View>
          </View>
        </View>

        {/* Field Selection Toggle */}
        <View style={{ paddingHorizontal: 20, marginBottom: 16 }}>
          <TouchableOpacity
            onPress={() => setShowFieldSelection(!showFieldSelection)}
            style={{
              flexDirection: isRTL ? "row-reverse" : "row",
              alignItems: "center",
              justifyContent: "space-between",
              backgroundColor: colors.surface,
              borderRadius: 12,
              padding: 14,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 10 }}>
              <MaterialIcons name="tune" size={20} color={colors.primary} />
              <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }}>
                {tx(language as Lang, "Selecteer gegevens", "Select data", "اختر البيانات")}
              </Text>
            </View>
            <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 6 }}>
              <Text style={{ fontSize: 12, color: colors.muted }}>{selectedFields.size} {tx(language as Lang, "geselecteerd", "selected", "مختار")}</Text>
              <MaterialIcons name={showFieldSelection ? "expand-less" : "expand-more"} size={20} color={colors.muted} />
            </View>
          </TouchableOpacity>
        </View>

        {/* Collapsible Field Selection */}
        {showFieldSelection && (
          <View style={{ paddingHorizontal: 20, marginBottom: 16 }}>
            <View style={{ backgroundColor: colors.surface, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: colors.border }}>
              {/* Profile fields */}
              <Text style={{ fontSize: 12, fontWeight: "600", color: colors.primary, marginBottom: 6, textAlign: isRTL ? "right" : "left" }}>
                {tx(language as Lang, "Profiel", "Profile", "الملف الشخصي")}
              </Text>
              {SHARE_FIELDS.filter((f) => f.category === "profile").map((field) => (
                <View key={field.key} style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 6 }}>
                  <Text style={{ fontSize: 13, color: colors.foreground }}>{field.label[language as keyof typeof field.label]}</Text>
                  <Switch
                    value={selectedFields.has(field.key)}
                    onValueChange={() => toggleField(field.key)}
                    trackColor={{ false: colors.border, true: colors.primary + "60" }}
                    thumbColor={selectedFields.has(field.key) ? colors.primary : colors.muted}
                  />
                </View>
              ))}

              {/* Environment fields */}
              <Text style={{ fontSize: 12, fontWeight: "600", color: colors.primary, marginBottom: 6, marginTop: 12, textAlign: isRTL ? "right" : "left" }}>
                {tx(language as Lang, "Omgeving", "Environment", "البيئة")}
              </Text>
              {SHARE_FIELDS.filter((f) => f.category === "environment").map((field) => (
                <View key={field.key} style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 6 }}>
                  <Text style={{ fontSize: 13, color: colors.foreground }}>{field.label[language as keyof typeof field.label]}</Text>
                  <Switch
                    value={selectedFields.has(field.key)}
                    onValueChange={() => toggleField(field.key)}
                    trackColor={{ false: colors.border, true: colors.primary + "60" }}
                    thumbColor={selectedFields.has(field.key) ? colors.primary : colors.muted}
                  />
                </View>
              ))}

              {/* Issues fields */}
              <Text style={{ fontSize: 12, fontWeight: "600", color: colors.primary, marginBottom: 6, marginTop: 12, textAlign: isRTL ? "right" : "left" }}>
                {tx(language as Lang, "Aandachtspunten", "Issues", "نقاط الاهتمام")}
              </Text>
              {SHARE_FIELDS.filter((f) => f.category === "issues").map((field) => (
                <View key={field.key} style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 6 }}>
                  <Text style={{ fontSize: 13, color: colors.foreground }}>{field.label[language as keyof typeof field.label]}</Text>
                  <Switch
                    value={selectedFields.has(field.key)}
                    onValueChange={() => toggleField(field.key)}
                    trackColor={{ false: colors.border, true: colors.primary + "60" }}
                    thumbColor={selectedFields.has(field.key) ? colors.primary : colors.muted}
                  />
                </View>
              ))}

              {/* Save defaults */}
              <TouchableOpacity onPress={saveDefaultFields} style={{ marginTop: 12, alignSelf: "center" }}>
                <Text style={{ fontSize: 12, color: colors.primary, fontWeight: "600" }}>
                  {tx(language as Lang, "Opslaan als standaard", "Save as default", "حفظ كافتراضي")}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ═══════ 3 SHARE OPTIONS ═══════ */}
        <View style={{ paddingHorizontal: 20, gap: 12 }}>
          <Text style={{ fontSize: 15, fontWeight: "700", color: colors.foreground, marginBottom: 4, textAlign: isRTL ? "right" : "left" }}>
            {tx(language as Lang, "Hoe wilt u delen?", "How would you like to share?", "كيف تريد المشاركة؟")}
          </Text>

          {/* Option 1: PDF Export */}
          <TouchableOpacity
            onPress={handleShareAsPDF}
            disabled={sharing || selectedFields.size === 0}
            style={{
              flexDirection: isRTL ? "row-reverse" : "row",
              alignItems: "center",
              gap: 14,
              backgroundColor: "#FEF3C7",
              borderRadius: 14,
              padding: 16,
              borderWidth: 1.5,
              borderColor: "#F59E0B40",
              opacity: sharing || selectedFields.size === 0 ? 0.6 : 1,
            }}
          >
            {sharing ? (
              <ActivityIndicator size="small" color="#D97706" />
            ) : (
              <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: "#FDE68A", alignItems: "center", justifyContent: "center" }}>
                <MaterialIcons name="picture-as-pdf" size={22} color="#D97706" />
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, fontWeight: "700", color: "#92400E", textAlign: isRTL ? "right" : "left" }}>
                {tx(language as Lang, "Exporteer als PDF", "Export as PDF", "تصدير كـ PDF")}
              </Text>
              <Text style={{ fontSize: 12, color: "#B45309", marginTop: 2, textAlign: isRTL ? "right" : "left" }}>
                {tx(language as Lang, "Maak een PDF-document om te bewaren of af te drukken", "Create a PDF document to save or print", "إنشاء مستند PDF للحفظ أو الطباعة")}
              </Text>
            </View>
          </TouchableOpacity>

          {/* Option 2: Share with network contact (in-app) */}
          <TouchableOpacity
            onPress={() => {
              if (shareableContacts.length === 0 && !hasPartner) {
                Alert.alert(
                  tx(language as Lang, "Geen contacten", "No contacts", "لا توجد جهات اتصال"),
                  tx(language as Lang, "Voeg eerst contacten toe aan uw netwerk", "Add contacts to your network first", "أضف جهات اتصال إلى شبكتك أولاً")
                );
                return;
              }
            }}
            style={{
              backgroundColor: "#DCFCE7",
              borderRadius: 14,
              padding: 16,
              borderWidth: 1.5,
              borderColor: "#22C55E40",
              opacity: selectedFields.size === 0 ? 0.6 : 1,
            }}
          >
            <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 14 }}>
              <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: "#BBF7D0", alignItems: "center", justifyContent: "center" }}>
                <MaterialIcons name="people" size={22} color="#16A34A" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontWeight: "700", color: "#14532D", textAlign: isRTL ? "right" : "left" }}>
                  {tx(language as Lang, "Deel met iemand uit mijn netwerk", "Share with someone from my network", "مشاركة مع شخص من شبكتي")}
                </Text>
                <Text style={{ fontSize: 12, color: "#166534", marginTop: 2, textAlign: isRTL ? "right" : "left" }}>
                  {tx(language as Lang, "Stuur direct naar een contact in de app", "Send directly to a contact in the app", "إرسال مباشر لجهة اتصال في التطبيق")}
                </Text>
              </View>
            </View>

            {/* Partner option */}
            {hasPartner && (
              <View style={{ marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: "#22C55E30" }}>
                {(coParentsQuery.data ?? []).map((cp: any) => (
                  <TouchableOpacity
                    key={cp.id}
                    onPress={handleShareWithPartner}
                    disabled={shareWithPartnerMutation.isPending}
                    style={{
                      flexDirection: isRTL ? "row-reverse" : "row",
                      alignItems: "center",
                      gap: 10,
                      paddingVertical: 8,
                      paddingHorizontal: 10,
                      backgroundColor: "#F0FDF4",
                      borderRadius: 8,
                      marginBottom: 4,
                    }}
                  >
                    <Text style={{ fontSize: 16 }}>{cp.role === "mother" ? "🧕" : "🧔"}</Text>
                    <Text style={{ flex: 1, fontSize: 13, fontWeight: "600", color: "#14532D", textAlign: isRTL ? "right" : "left" }}>
                      {cp.name || (cp.role === "mother" ? tx(language as Lang, "Moeder", "Mother", "الأم") : tx(language as Lang, "Vader", "Father", "الأب"))}
                    </Text>
                    {shareWithPartnerMutation.isPending ? (
                      <ActivityIndicator size="small" color="#16A34A" />
                    ) : (
                      <MaterialIcons name="send" size={16} color="#16A34A" />
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Network contacts */}
            {shareableContacts.length > 0 && (
              <View style={{ marginTop: hasPartner ? 8 : 12, paddingTop: hasPartner ? 0 : 10, borderTopWidth: hasPartner ? 0 : 1, borderTopColor: "#22C55E30" }}>
                {shareableContacts.map((contact) => (
                  <TouchableOpacity
                    key={contact.id}
                    onPress={() => handleShareWithContact(contact)}
                    style={{
                      flexDirection: isRTL ? "row-reverse" : "row",
                      alignItems: "center",
                      gap: 10,
                      paddingVertical: 8,
                      paddingHorizontal: 10,
                      backgroundColor: "#F0FDF4",
                      borderRadius: 8,
                      marginBottom: 4,
                    }}
                  >
                    <MaterialIcons
                      name={contact.category === "teachers" ? "menu-book" : contact.category === "scholars" ? "menu-book" : "nightlight-round"}
                      size={16}
                      color="#16A34A"
                    />
                    <Text style={{ flex: 1, fontSize: 13, fontWeight: "600", color: "#14532D", textAlign: isRTL ? "right" : "left" }}>
                      {contact.name}
                    </Text>
                    <MaterialIcons name="send" size={16} color="#16A34A" />
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </TouchableOpacity>

          {/* Option 3: Share as text (external) */}
          <TouchableOpacity
            onPress={handleShareAsText}
            disabled={selectedFields.size === 0}
            style={{
              flexDirection: isRTL ? "row-reverse" : "row",
              alignItems: "center",
              gap: 14,
              backgroundColor: "#DBEAFE",
              borderRadius: 14,
              padding: 16,
              borderWidth: 1.5,
              borderColor: "#3B82F640",
              opacity: selectedFields.size === 0 ? 0.6 : 1,
            }}
          >
            <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: "#BFDBFE", alignItems: "center", justifyContent: "center" }}>
              <MaterialIcons name="share" size={22} color="#2563EB" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, fontWeight: "700", color: "#1E3A5F", textAlign: isRTL ? "right" : "left" }}>
                {tx(language as Lang, "Deel als tekst", "Share as text", "مشاركة كنص")}
              </Text>
              <Text style={{ fontSize: 12, color: "#1D4ED8", marginTop: 2, textAlign: isRTL ? "right" : "left" }}>
                {tx(language as Lang, "Via WhatsApp, e-mail of andere apps", "Via WhatsApp, email or other apps", "عبر واتساب أو البريد أو تطبيقات أخرى")}
              </Text>
            </View>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
