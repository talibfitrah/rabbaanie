import { useEffect, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView, Alert, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useColors } from "@/hooks/use-colors";
import { useI18n } from "@/lib/i18n";
import { trpc } from "@/lib/trpc";

// ─── Article-email digest admin ─────────────────────────────────────────
// Mirrors the website /dashboard «البريد» tab. admin.getEmailSettings /
// updateEmailSettings / sendDigest / previewDigest / emailLog are live on
// prod but not yet in this repo's server/routers.ts — same repo↔prod lag
// broadcast.tsx already works around for listSchedules/sendLog by casting
// trpc.admin to any, done identically here.
type EmailSettings = {
  autoSendWeekly: boolean;
  audience: string;
  appUrl: string;
  siteUrl: string;
  subscribeUrl: string;
  subjectAr: string; subjectNl: string; subjectEn: string;
  introAr: string; introNl: string; introEn: string;
  closingAr: string; closingNl: string; closingEn: string;
};

const EMPTY_SETTINGS: EmailSettings = {
  autoSendWeekly: false, audience: "", appUrl: "", siteUrl: "", subscribeUrl: "",
  subjectAr: "", subjectNl: "", subjectEn: "",
  introAr: "", introNl: "", introEn: "",
  closingAr: "", closingNl: "", closingEn: "",
};

export default function EmailDigestScreen() {
  const colors = useColors();
  const { isRTL, language } = useI18n();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const L3 = (ar: string, nl: string, en: string) => (language === "ar" ? ar : language === "en" ? en : nl);
  const align: "right" | "left" = isRTL ? "right" : "left";

  const [settings, setSettings] = useState<EmailSettings>(EMPTY_SETTINGS);
  const setField = (patch: Partial<EmailSettings>) => setSettings((s) => ({ ...s, ...patch }));

  const settingsQuery = (trpc.admin as any).getEmailSettings.useQuery();
  useEffect(() => {
    const d = settingsQuery.data;
    if (!d) return;
    setSettings({
      autoSendWeekly: !!d.autoSendWeekly,
      audience: d.audience || "",
      appUrl: d.appUrl || "",
      siteUrl: d.siteUrl || "",
      subscribeUrl: d.subscribeUrl || "",
      subjectAr: d.subjectAr || "", subjectNl: d.subjectNl || "", subjectEn: d.subjectEn || "",
      introAr: d.introAr || "", introNl: d.introNl || "", introEn: d.introEn || "",
      closingAr: d.closingAr || "", closingNl: d.closingNl || "", closingEn: d.closingEn || "",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsQuery.data]);

  const updateMutation = (trpc.admin as any).updateEmailSettings.useMutation({
    onSuccess: () => {
      settingsQuery.refetch();
      Alert.alert(L3("تم الحفظ", "Opgeslagen", "Saved"), L3("تم حفظ إعدادات البريد.", "E-mailinstellingen zijn opgeslagen.", "Email settings saved."));
    },
    onError: (e: any) => Alert.alert(L3("خطأ", "Fout", "Error"), e?.message || L3("تعذّر الحفظ.", "Opslaan is mislukt.", "Could not save.")),
  });

  // ─── Preview: the articles the next send would include ─────────────────
  const previewQuery = (trpc.admin as any).previewDigest.useQuery();
  const previewArticles: any[] = Array.isArray(previewQuery.data)
    ? previewQuery.data
    : Array.isArray(previewQuery.data?.articles)
      ? previewQuery.data.articles
      : [];
  const previewCount = previewQuery.data?.count ?? previewArticles.length;
  const articleTitle = (a: any) => a.title || a.titleAr || a.titleNl || a.titleEn || a.name || `#${a.id ?? ""}`;

  // ─── Send now (test / all) ───────────────────────────────────────────
  const sendMutation = (trpc.admin as any).sendDigest.useMutation({
    onSuccess: (r: any) =>
      Alert.alert(
        L3("تم الإرسال", "Verzonden", "Sent"),
        L3(`أُرسلت النشرة إلى ${r?.sent ?? 0} مستلم.`, `De nieuwsbrief is verzonden naar ${r?.sent ?? 0} ontvangers.`, `The digest was sent to ${r?.sent ?? 0} recipients.`),
      ),
    onError: (e: any) => Alert.alert(L3("خطأ", "Fout", "Error"), e?.message || L3("تعذّر الإرسال.", "Verzenden is mislukt.", "Could not send.")),
  });
  const sendTest = () => sendMutation.mutate({ mode: "test" });
  const confirmSendAll = () => {
    Alert.alert(
      L3("إرسال النشرة للجميع", "Verzenden naar iedereen", "Send to everyone"),
      L3("هل أنت متأكد من إرسال النشرة إلى جميع المشتركين؟", "Weet u zeker dat u de nieuwsbrief naar alle abonnees wilt sturen?", "Are you sure you want to send the digest to all subscribers?"),
      [
        { text: L3("إلغاء", "Annuleren", "Cancel"), style: "cancel" },
        { text: L3("إرسال", "Verzenden", "Send"), style: "destructive", onPress: () => sendMutation.mutate({ mode: "all" }) },
      ],
    );
  };

  // ─── Send log ────────────────────────────────────────────────────────
  const logQuery = (trpc.admin as any).emailLog.useQuery();
  const log: any[] = logQuery.data || [];
  const modeLabel = (m: string) => (m === "test" ? L3("تجربة", "Test", "Test") : m === "all" ? L3("للجميع", "Iedereen", "Everyone") : m);
  const statusLabel = (s: string) => {
    const known: Record<string, string> = {
      sent: L3("أُرسلت", "Verzonden", "Sent"),
      success: L3("نجحت", "Gelukt", "Succeeded"),
      failed: L3("فشلت", "Mislukt", "Failed"),
      error: L3("فشلت", "Mislukt", "Failed"),
    };
    return known[s] || s;
  };

  const inputStyle = { backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, color: colors.foreground, textAlign: align, borderWidth: 1, borderColor: colors.border, marginTop: 6 };
  const label = (s: string) => <Text style={{ fontSize: 13, fontWeight: "600", color: colors.foreground, textAlign: align, marginTop: 14 }}>{s}</Text>;
  const hint = (s: string) => <Text style={{ fontSize: 11, color: colors.muted, textAlign: align, marginTop: 2 }}>{s}</Text>;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ paddingTop: insets.top + 8, paddingBottom: 12, paddingHorizontal: 16, backgroundColor: colors.surface, borderBottomWidth: 0.5, borderBottomColor: colors.border, flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 12 }}>
        <TouchableOpacity onPress={() => router.back()}><MaterialIcons name={isRTL ? "arrow-forward" : "arrow-back"} size={24} color={colors.foreground} /></TouchableOpacity>
        <Text style={{ fontSize: 18, fontWeight: "700", color: colors.foreground, flex: 1, textAlign: align }}>{L3("البريد", "E-mail nieuwsbrief", "Email digest")}</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }} keyboardShouldPersistTaps="handled">
        <Text style={{ fontSize: 12, color: colors.muted, textAlign: align, lineHeight: 20 }}>
          {L3(
            "نشرة المقالات الأسبوعية عبر البريد الإلكتروني — تُرسل تلقائيًا أو يدويًا لمن اشترك عبر الموقع.",
            "De wekelijkse artikel-nieuwsbrief per e-mail — automatisch of handmatig verzonden naar website-abonnees.",
            "The weekly article digest email — sent automatically or manually to site subscribers.",
          )}
        </Text>

        {settingsQuery.isLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginVertical: 20 }} />
        ) : settingsQuery.isError ? (
          <Text style={{ color: colors.error, textAlign: "center", paddingVertical: 20, lineHeight: 22 }}>
            {L3("تعذّر تحميل إعدادات البريد.", "Kon e-mailinstellingen niet laden.", "Could not load email settings.")}
          </Text>
        ) : (
          <>
            {label(L3("الإرسال التلقائي الأسبوعي", "Wekelijks automatisch verzenden", "Weekly auto-send"))}
            <TouchableOpacity
              onPress={() => setField({ autoSendWeekly: !settings.autoSendWeekly })}
              style={{ alignSelf: isRTL ? "flex-end" : "flex-start", flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 6, backgroundColor: settings.autoSendWeekly ? colors.primary : colors.surface, borderRadius: 20, paddingVertical: 6, paddingHorizontal: 14, borderWidth: 1, borderColor: settings.autoSendWeekly ? colors.primary : colors.border, marginTop: 8 }}
            >
              <MaterialIcons name={settings.autoSendWeekly ? "check-box" : "check-box-outline-blank"} size={15} color={settings.autoSendWeekly ? "#fff" : colors.muted} />
              <Text style={{ fontSize: 12, fontWeight: "700", color: settings.autoSendWeekly ? "#fff" : colors.foreground }}>
                {settings.autoSendWeekly ? L3("مفعّل", "Actief", "Active") : L3("متوقف", "Inactief", "Inactive")}
              </Text>
            </TouchableOpacity>

            {label(L3("الجمهور المستهدف", "Doelgroep", "Audience"))}
            <TextInput value={settings.audience} onChangeText={(v) => setField({ audience: v })} placeholderTextColor={colors.muted} style={inputStyle} />

            {label(L3("الموضوع", "Onderwerp", "Subject"))}
            {hint("العربية")}
            <TextInput value={settings.subjectAr} onChangeText={(v) => setField({ subjectAr: v })} placeholderTextColor={colors.muted} style={inputStyle} />
            {hint("Nederlands")}
            <TextInput value={settings.subjectNl} onChangeText={(v) => setField({ subjectNl: v })} placeholderTextColor={colors.muted} style={inputStyle} />
            {hint("English")}
            <TextInput value={settings.subjectEn} onChangeText={(v) => setField({ subjectEn: v })} placeholderTextColor={colors.muted} style={inputStyle} />

            {label(L3("المقدّمة", "Inleiding", "Intro"))}
            {hint("العربية")}
            <TextInput value={settings.introAr} onChangeText={(v) => setField({ introAr: v })} multiline placeholderTextColor={colors.muted} style={{ ...inputStyle, minHeight: 80, textAlignVertical: "top" }} />
            {hint("Nederlands")}
            <TextInput value={settings.introNl} onChangeText={(v) => setField({ introNl: v })} multiline placeholderTextColor={colors.muted} style={{ ...inputStyle, minHeight: 80, textAlignVertical: "top" }} />
            {hint("English")}
            <TextInput value={settings.introEn} onChangeText={(v) => setField({ introEn: v })} multiline placeholderTextColor={colors.muted} style={{ ...inputStyle, minHeight: 80, textAlignVertical: "top" }} />

            {label(L3("الخاتمة", "Afsluiting", "Closing"))}
            {hint("العربية")}
            <TextInput value={settings.closingAr} onChangeText={(v) => setField({ closingAr: v })} multiline placeholderTextColor={colors.muted} style={{ ...inputStyle, minHeight: 80, textAlignVertical: "top" }} />
            {hint("Nederlands")}
            <TextInput value={settings.closingNl} onChangeText={(v) => setField({ closingNl: v })} multiline placeholderTextColor={colors.muted} style={{ ...inputStyle, minHeight: 80, textAlignVertical: "top" }} />
            {hint("English")}
            <TextInput value={settings.closingEn} onChangeText={(v) => setField({ closingEn: v })} multiline placeholderTextColor={colors.muted} style={{ ...inputStyle, minHeight: 80, textAlignVertical: "top" }} />

            {label(L3("الروابط", "Links", "Links"))}
            {hint(L3("رابط التطبيق", "App-link", "App link"))}
            <TextInput value={settings.appUrl} onChangeText={(v) => setField({ appUrl: v })} autoCapitalize="none" keyboardType="url" placeholderTextColor={colors.muted} style={inputStyle} />
            {hint(L3("رابط الموقع", "Website-link", "Site link"))}
            <TextInput value={settings.siteUrl} onChangeText={(v) => setField({ siteUrl: v })} autoCapitalize="none" keyboardType="url" placeholderTextColor={colors.muted} style={inputStyle} />
            {hint(L3("رابط الاشتراك", "Abonneerlink", "Subscribe link"))}
            <TextInput value={settings.subscribeUrl} onChangeText={(v) => setField({ subscribeUrl: v })} autoCapitalize="none" keyboardType="url" placeholderTextColor={colors.muted} style={inputStyle} />

            <TouchableOpacity
              onPress={() => updateMutation.mutate(settings)}
              disabled={updateMutation.isPending}
              style={{ backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 14, alignItems: "center", marginTop: 18, opacity: updateMutation.isPending ? 0.6 : 1 }}
            >
              {updateMutation.isPending ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>{L3("حفظ الإعدادات", "Instellingen opslaan", "Save settings")}</Text>}
            </TouchableOpacity>
          </>
        )}

        <View style={{ height: 1, backgroundColor: colors.border, marginTop: 28 }} />

        {label(L3("معاينة النشرة القادمة", "Voorbeeld van de volgende nieuwsbrief", "Next digest preview"))}
        {previewQuery.isLoading ? (
          <ActivityIndicator size="small" color={colors.muted} style={{ marginTop: 8 }} />
        ) : previewQuery.isError ? (
          <Text style={{ fontSize: 12, color: colors.error, textAlign: align, marginTop: 8 }}>
            {L3("تعذّر تحميل معاينة النشرة.", "Kon voorbeeld niet laden.", "Could not load the preview.")}
          </Text>
        ) : (
          <>
            <Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground, textAlign: align, marginTop: 8 }}>
              {L3(`ستتضمّن النشرةُ ${previewCount} مقالات`, `Deze nieuwsbrief bevat ${previewCount} artikelen.`, `This digest will include ${previewCount} articles.`)}
            </Text>
            {previewArticles.length > 0 && (
              <View style={{ marginTop: 8, backgroundColor: colors.surface, borderRadius: 10, borderWidth: 1, borderColor: colors.border, padding: 10, gap: 6 }}>
                {previewArticles.map((a: any, i: number) => (
                  <Text key={a.id ?? i} style={{ fontSize: 12, color: colors.foreground, textAlign: align }}>{"• " + articleTitle(a)}</Text>
                ))}
              </View>
            )}
          </>
        )}

        <View style={{ flexDirection: isRTL ? "row-reverse" : "row", gap: 10, marginTop: 16 }}>
          <TouchableOpacity
            onPress={sendTest}
            disabled={sendMutation.isPending}
            style={{ flex: 1, backgroundColor: colors.surface, borderRadius: 12, paddingVertical: 13, alignItems: "center", borderWidth: 1, borderColor: colors.primary, opacity: sendMutation.isPending ? 0.6 : 1 }}
          >
            {sendMutation.isPending ? <ActivityIndicator color={colors.primary} /> : <Text style={{ color: colors.primary, fontWeight: "700", fontSize: 13 }}>{L3("أرسِل تجربةً لي", "Stuur mij een test", "Send me a test")}</Text>}
          </TouchableOpacity>
          <TouchableOpacity
            onPress={confirmSendAll}
            disabled={sendMutation.isPending}
            style={{ flex: 1, backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 13, alignItems: "center", opacity: sendMutation.isPending ? 0.6 : 1 }}
          >
            {sendMutation.isPending ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>{L3("أرسِل النشرة للجميع", "Stuur naar iedereen", "Send to everyone")}</Text>}
          </TouchableOpacity>
        </View>

        <View style={{ height: 1, backgroundColor: colors.border, marginTop: 28 }} />

        {label(L3("سجلّ الإرسال", "Verzendlog", "Send log"))}
        {hint(L3("عمليات الإرسال السابقة، نوعها، وعدد من وصلتهم.", "Eerdere verzendingen, hun soort en het aantal ontvangers.", "Past sends, their mode, and how many recipients each reached."))}
        <View style={{ gap: 8, marginTop: 8 }}>
          {logQuery.isLoading && <ActivityIndicator size="small" color={colors.muted} />}
          {log.map((l: any, i: number) => (
            <View key={l.id ?? i} style={{ borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 12, flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <View>
                <Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground, textAlign: align }}>{modeLabel(l.mode) + " · " + statusLabel(l.status)}</Text>
                <Text style={{ fontSize: 11, color: colors.muted, textAlign: align, marginTop: 2 }}>{new Date(l.sentAt ?? l.createdAt).toLocaleString(language)}</Text>
              </View>
              <Text style={{ fontSize: 12, fontWeight: "700", color: colors.foreground }}>{(l.recipientCount ?? l.sent ?? 0) + " " + L3("مستلمًا", "ontvangers", "recipients")}</Text>
            </View>
          ))}
          {!logQuery.isLoading && log.length === 0 && (
            <Text style={{ fontSize: 12, color: colors.muted, textAlign: align }}>{L3("لا توجد عمليات إرسال بعد.", "Nog geen verzendingen.", "No sends yet.")}</Text>
          )}
        </View>
      </ScrollView>
    </View>
  );
}
