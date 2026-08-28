import { useEffect, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView, Alert, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useColors } from "@/hooks/use-colors";
import { useI18n } from "@/lib/i18n";
import { trpc } from "@/lib/trpc";
import { emailSettingsFromRow, isEmailSettingsRow, type EmailSettingsInput } from "./email-settings";

// ─── Article-email digest admin ─────────────────────────────────────────
// Mirrors the website /dashboard «البريد» tab. admin.getEmailSettings /
// updateEmailSettings / sendDigest / previewDigest / emailLog are live on
// prod but not yet in this repo's server/routers.ts — same repo↔prod lag
// broadcast.tsx already works around for listSchedules/sendLog by casting
// trpc.admin to any, done identically here. Because the casts erase the
// types, every shape this screen relies on is pinned against the production
// repo in ./email-settings.ts and tests/admin-email-settings-contract.test.ts.

export default function EmailDigestScreen() {
  const colors = useColors();
  const { isRTL, language } = useI18n();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const L3 = (ar: string, nl: string, en: string) => (language === "ar" ? ar : language === "en" ? en : nl);
  const align: "right" | "left" = isRTL ? "right" : "left";

  // null until the row loads: there is no blank default to accidentally save
  // over the copy the website owns (every field is written unconditionally —
  // rabbaanie-api server/article-email.ts:283-306).
  const [form, setForm] = useState<EmailSettingsInput | null>(null);
  const setField = (patch: Partial<EmailSettingsInput>) => setForm((s) => (s ? { ...s, ...patch } : s));

  const settingsQuery = (trpc.admin as any).getEmailSettings.useQuery();
  // A response that arrived but is not the row this screen knows how to map is
  // treated as a failed load, NOT as an empty row: mapping it yields a blank
  // form whose Save would overwrite the production copy. See isEmailSettingsRow.
  const rowUnusable = settingsQuery.data != null && !isEmailSettingsRow(settingsQuery.data);
  useEffect(() => {
    if (isEmailSettingsRow(settingsQuery.data)) setForm(emailSettingsFromRow(settingsQuery.data));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsQuery.data]);

  const updateMutation = (trpc.admin as any).updateEmailSettings.useMutation({
    onSuccess: () => {
      settingsQuery.refetch();
      Alert.alert(L3("تم الحفظ", "Opgeslagen", "Saved"), L3("تم حفظ إعدادات البريد.", "E-mailinstellingen zijn opgeslagen.", "Email settings saved."));
    },
    onError: (e: any) => Alert.alert(L3("خطأ", "Fout", "Error"), e?.message || L3("تعذّر الحفظ.", "Opslaan is mislukt.", "Could not save.")),
  });

  // auto_send_weekly gates a real mass-mail: the VM's Sunday 19:00 cron
  // (rabbaanie-api scripts/weekly-digest.ts:12-18) sends to every user unless
  // this is false. Turning it on gets the same confirmation as "send to all";
  // turning it off is safe and needs none.
  const toggleWeekly = () => {
    if (!form) return;
    if (form.autoSendWeekly) return setField({ autoSendWeekly: false });
    Alert.alert(
      L3("تفعيل الإرسال الأسبوعيّ", "Wekelijks verzenden inschakelen", "Enable weekly auto-send"),
      L3(
        "سيُرسَل البريد تلقائيًّا إلى جميع المستخدمين كلّ أحد دون تأكيدٍ آخر. هل تريد التفعيل؟",
        "De nieuwsbrief gaat dan elke zondag automatisch naar alle gebruikers, zonder verdere bevestiging. Inschakelen?",
        "The digest will then go automatically to every user each Sunday, with no further confirmation. Enable it?",
      ),
      [
        { text: L3("إلغاء", "Annuleren", "Cancel"), style: "cancel" },
        { text: L3("تفعيل", "Inschakelen", "Enable"), style: "destructive", onPress: () => setField({ autoSendWeekly: true }) },
      ],
    );
  };

  // ─── Preview: the articles the next send would include ─────────────────
  // previewDigest returns a bare array of { id, title, createdAt }; `title`
  // is already resolved server-side (rabbaanie-api server/routers.ts:1630-1638).
  const previewQuery = (trpc.admin as any).previewDigest.useQuery();
  const previewArticles: any[] = previewQuery.data ?? [];

  // ─── Send log ────────────────────────────────────────────────────────
  // getEmailLog returns camelCase { id, mode, recipientCount, status, sentAt }
  // (rabbaanie-api server/article-email.ts:400-412).
  const logQuery = (trpc.admin as any).emailLog.useQuery();
  const log: any[] = logQuery.data ?? [];
  const modeLabel = (m: string) => (m === "test" ? L3("تجربة", "Test", "Test") : m === "all" ? L3("للجميع", "Iedereen", "Everyone") : m);
  const statusLabel = (s: string) => {
    // The four statuses article-email.ts:368-372 actually writes.
    const known: Record<string, string> = {
      sent: L3("أُرسلت", "Verzonden", "Sent"),
      partial: L3("أُرسلت جزئيًّا", "Deels verzonden", "Partially sent"),
      failed: L3("فشلت", "Mislukt", "Failed"),
      empty: L3("لا مستلمين", "Geen ontvangers", "No recipients"),
    };
    return known[s] || s;
  };

  // ─── Send now (test / all) ───────────────────────────────────────────
  // sendDigest resolves to { recipientCount, articleCount }
  // (rabbaanie-api server/article-email.ts:311-313).
  const sendMutation = (trpc.admin as any).sendDigest.useMutation({
    onSuccess: (r: any, vars: any) => {
      logQuery.refetch();
      // "send to all" with nothing new is a logged no-op, not a send
      // (article-email.ts:324-330) — saying "sent" would invite a retry.
      if (vars?.mode === "all" && !r?.articleCount) {
        return Alert.alert(
          L3("لم يُرسَل شيء", "Niets verzonden", "Nothing sent"),
          L3("لا توجد مقالاتٌ جديدة منذ آخر إرسال.", "Er zijn geen nieuwe artikelen sinds de vorige verzending.", "There are no new articles since the last send."),
        );
      }
      const n = r?.recipientCount ?? 0;
      const a = r?.articleCount ?? 0;
      Alert.alert(
        L3("تم الإرسال", "Verzonden", "Sent"),
        L3(`أُرسلت النشرة إلى ${n} مستلمًا (${a} مقالة).`, `De nieuwsbrief is verzonden naar ${n} ontvangers (${a} artikelen).`, `The digest was sent to ${n} recipients (${a} articles).`),
      );
    },
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

        {settingsQuery.isError || rowUnusable ? (
          <Text style={{ color: colors.error, textAlign: "center", paddingVertical: 20, lineHeight: 22 }}>
            {L3("تعذّر تحميل إعدادات البريد.", "Kon e-mailinstellingen niet laden.", "Could not load email settings.")}
          </Text>
        ) : !form ? (
          <ActivityIndicator color={colors.primary} style={{ marginVertical: 20 }} />
        ) : (
          <>
            {label(L3("الإرسال التلقائي الأسبوعي", "Wekelijks automatisch verzenden", "Weekly auto-send"))}
            <TouchableOpacity
              onPress={toggleWeekly}
              style={{ alignSelf: isRTL ? "flex-end" : "flex-start", flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 6, backgroundColor: form.autoSendWeekly ? colors.primary : colors.surface, borderRadius: 20, paddingVertical: 6, paddingHorizontal: 14, borderWidth: 1, borderColor: form.autoSendWeekly ? colors.primary : colors.border, marginTop: 8 }}
            >
              <MaterialIcons name={form.autoSendWeekly ? "check-box" : "check-box-outline-blank"} size={15} color={form.autoSendWeekly ? "#fff" : colors.muted} />
              <Text style={{ fontSize: 12, fontWeight: "700", color: form.autoSendWeekly ? "#fff" : colors.foreground }}>
                {form.autoSendWeekly ? L3("مفعّل", "Actief", "Active") : L3("متوقف", "Inactief", "Inactive")}
              </Text>
            </TouchableOpacity>
            {hint(L3("عند التفعيل تُرسَل النشرة تلقائيًّا كلّ أحد إلى جميع المستخدمين.", "Indien actief gaat de nieuwsbrief elke zondag automatisch naar alle gebruikers.", "When active the digest goes automatically to every user each Sunday."))}

            {/* Audience is stored but never applied: mode:'all' mails every
                user whose account is not deleted and who has not unsubscribed
                (rabbaanie-api server/article-email.ts:339-348). Read-only, like
                the website's single-option <select> (web-dashboard.ts:728). */}
            {label(L3("الجمهور المستهدف", "Doelgroep", "Audience"))}
            <Text style={{ ...inputStyle, color: colors.muted }}>{L3("جميع المستخدمين", "Alle gebruikers", "All users")}</Text>
            {hint(L3("لا يمكن تضييق الجمهور؛ تصل النشرة إلى كلّ مَن لم يُلغِ الاشتراك.", "De doelgroep is niet te beperken; iedereen die zich niet heeft uitgeschreven ontvangt de nieuwsbrief.", "The audience cannot be narrowed; everyone who has not unsubscribed receives the digest."))}

            {/* No subject editor: the digest subject is a fixed per-language
                constant (DIGEST_SUBJECT, rabbaanie-api
                server/article-email.ts:90-94, returned at :274). The stored
                subject_ar/nl/en columns are written but never read, so this
                screen carries them through untouched instead of offering
                three controls that change nothing. */}

            {label(L3("المقدّمة", "Inleiding", "Intro"))}
            {hint("العربية")}
            <TextInput value={form.introAr} onChangeText={(v) => setField({ introAr: v })} multiline placeholderTextColor={colors.muted} style={{ ...inputStyle, minHeight: 80, textAlignVertical: "top" }} />
            {hint("Nederlands")}
            <TextInput value={form.introNl} onChangeText={(v) => setField({ introNl: v })} multiline placeholderTextColor={colors.muted} style={{ ...inputStyle, minHeight: 80, textAlignVertical: "top" }} />
            {hint("English")}
            <TextInput value={form.introEn} onChangeText={(v) => setField({ introEn: v })} multiline placeholderTextColor={colors.muted} style={{ ...inputStyle, minHeight: 80, textAlignVertical: "top" }} />

            {label(L3("الخاتمة", "Afsluiting", "Closing"))}
            {hint("العربية")}
            <TextInput value={form.closingAr} onChangeText={(v) => setField({ closingAr: v })} multiline placeholderTextColor={colors.muted} style={{ ...inputStyle, minHeight: 80, textAlignVertical: "top" }} />
            {hint("Nederlands")}
            <TextInput value={form.closingNl} onChangeText={(v) => setField({ closingNl: v })} multiline placeholderTextColor={colors.muted} style={{ ...inputStyle, minHeight: 80, textAlignVertical: "top" }} />
            {hint("English")}
            <TextInput value={form.closingEn} onChangeText={(v) => setField({ closingEn: v })} multiline placeholderTextColor={colors.muted} style={{ ...inputStyle, minHeight: 80, textAlignVertical: "top" }} />

            {label(L3("الروابط", "Links", "Links"))}
            {hint(L3("رابط التطبيق", "App-link", "App link"))}
            <TextInput value={form.appUrl} onChangeText={(v) => setField({ appUrl: v })} autoCapitalize="none" keyboardType="url" placeholderTextColor={colors.muted} style={inputStyle} />
            {hint(L3("رابط الموقع", "Website-link", "Site link"))}
            <TextInput value={form.siteUrl} onChangeText={(v) => setField({ siteUrl: v })} autoCapitalize="none" keyboardType="url" placeholderTextColor={colors.muted} style={inputStyle} />
            {hint(L3("رابط الاشتراك", "Abonneerlink", "Subscribe link"))}
            <TextInput value={form.subscribeUrl} onChangeText={(v) => setField({ subscribeUrl: v })} autoCapitalize="none" keyboardType="url" placeholderTextColor={colors.muted} style={inputStyle} />

            <TouchableOpacity
              onPress={() => updateMutation.mutate(form)}
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
              {L3(`ستتضمّن النشرةُ ${previewArticles.length} مقالات`, `Deze nieuwsbrief bevat ${previewArticles.length} artikelen.`, `This digest will include ${previewArticles.length} articles.`)}
            </Text>
            {previewArticles.length > 0 && (
              <View style={{ marginTop: 8, backgroundColor: colors.surface, borderRadius: 10, borderWidth: 1, borderColor: colors.border, padding: 10, gap: 6 }}>
                {previewArticles.map((a: any, i: number) => (
                  <Text key={a.id ?? i} style={{ fontSize: 12, color: colors.foreground, textAlign: align }}>{"• " + a.title}</Text>
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
          {logQuery.isError && (
            <Text style={{ fontSize: 12, color: colors.error, textAlign: align }}>
              {L3("تعذّر تحميل سجلّ الإرسال.", "Kon het verzendlog niet laden.", "Could not load the send log.")}
            </Text>
          )}
          {log.map((l: any, i: number) => (
            <View key={l.id ?? i} style={{ borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 12, flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <View>
                <Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground, textAlign: align }}>{modeLabel(l.mode) + " · " + statusLabel(l.status)}</Text>
                <Text style={{ fontSize: 11, color: colors.muted, textAlign: align, marginTop: 2 }}>{new Date(l.sentAt).toLocaleString(language)}</Text>
              </View>
              <Text style={{ fontSize: 12, fontWeight: "700", color: colors.foreground }}>{(l.recipientCount ?? 0) + " " + L3("مستلمًا", "ontvangers", "recipients")}</Text>
            </View>
          ))}
          {!logQuery.isLoading && !logQuery.isError && log.length === 0 && (
            <Text style={{ fontSize: 12, color: colors.muted, textAlign: align }}>{L3("لا توجد عمليات إرسال بعد.", "Nog geen verzendingen.", "No sends yet.")}</Text>
          )}
        </View>
      </ScrollView>
    </View>
  );
}
