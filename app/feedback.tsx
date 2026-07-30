import { useState } from "react";
import { ScrollView, Text, View, TextInput, TouchableOpacity, ActivityIndicator, KeyboardAvoidingView, Platform } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useColors } from "@/hooks/use-colors";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/hooks/use-auth";
import { getApiBaseUrl } from "@/constants/oauth";

/**
 * Contact-the-team / suggestion form (msg 564). Posts to the public
 * /api/feedback endpoint; the admin reads submissions in the admin panel.
 */
export default function FeedbackScreen() {
  const colors = useColors();
  const { language, isRTL } = useI18n();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ kind?: string }>();
  const kind = params.kind === "suggestion" ? "suggestion" : "contact";
  const L3 = (ar: string, nl: string, en: string) => (language === "ar" ? ar : language === "en" ? en : nl);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  const title = kind === "suggestion"
    ? L3("اقترح فكرةً", "Doe een suggestie", "Send a suggestion")
    : L3("تواصل مع الفريق التقني", "Contact het technisch team", "Contact the technical team");
  const align = isRTL ? "right" : "left";
  const inputStyle = {
    backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
    color: colors.foreground, textAlign: align as "right" | "left", borderWidth: 1, borderColor: colors.border, marginBottom: 12,
  };

  async function submit() {
    const msg = message.trim();
    if (!msg) { setError(L3("اكتب رسالتك أولًا.", "Schrijf eerst een bericht.", "Please write a message first.")); return; }
    setSending(true); setError("");
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, source: "app", language, message: msg, name: name.trim(), email: email.trim(), userId: (user as any)?.id }),
      });
      const data = await res.json();
      if (data && data.ok) setDone(true);
      else setError(L3("تعذّر الإرسال، حاول لاحقًا.", "Versturen mislukt, probeer later.", "Could not send, try again later."));
    } catch {
      setError(L3("تعذّر الإرسال، تحقّق من الاتصال.", "Versturen mislukt, controleer uw verbinding.", "Could not send, check your connection."));
    } finally { setSending(false); }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ paddingTop: insets.top + 8, paddingBottom: 12, paddingHorizontal: 16, backgroundColor: colors.surface, borderBottomWidth: 0.5, borderBottomColor: colors.border, flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 12 }}>
        <TouchableOpacity onPress={() => router.back()}><MaterialIcons name={isRTL ? "arrow-forward" : "arrow-back"} size={24} color={colors.foreground} /></TouchableOpacity>
        <Text style={{ fontSize: 18, fontWeight: "700", color: colors.foreground, flex: 1, textAlign: align }}>{title}</Text>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
          {done ? (
            <View style={{ alignItems: "center", paddingVertical: 40 }}>
              <MaterialIcons name="check-circle" size={56} color={colors.primary} />
              <Text style={{ fontSize: 18, fontWeight: "800", color: colors.foreground, marginTop: 14, textAlign: "center" }}>{L3("جزاك الله خيرًا", "Djazaak Allaahu khayran", "Djazaak Allaahu khayran")}</Text>
              <Text style={{ fontSize: 14, color: colors.muted, marginTop: 8, textAlign: "center", lineHeight: 22 }}>{L3("وصلَتْنا رسالتُك، وسنطّلع عليها إن شاء الله.", "Uw bericht is ontvangen. In shaa Allaah bekijken we het.", "Your message was received. In shaa Allaah we will review it.")}</Text>
              <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 22, backgroundColor: colors.primary, borderRadius: 12, paddingHorizontal: 26, paddingVertical: 12 }}>
                <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>{L3("إغلاق", "Sluiten", "Close")}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 14, textAlign: align, lineHeight: 20 }}>
                {kind === "suggestion"
                  ? L3("شاركنا اقتراحك لتحسين التطبيق.", "Deel uw suggestie om de app te verbeteren.", "Share your suggestion to improve the app.")
                  : L3("راسل الفريق التقني في أيّ مشكلةٍ أو استفسار.", "Bericht het technisch team bij een probleem of vraag.", "Message the technical team about any issue or question.")}
              </Text>
              <Text style={{ color: colors.muted, fontSize: 12, marginBottom: 4, textAlign: align }}>{L3("الاسم (اختياري)", "Naam (optioneel)", "Name (optional)")}</Text>
              <TextInput value={name} onChangeText={setName} style={inputStyle} placeholderTextColor={colors.muted} />
              <Text style={{ color: colors.muted, fontSize: 12, marginBottom: 4, textAlign: align }}>{L3("بريدٌ للردّ (اختياري)", "E-mail voor antwoord (optioneel)", "Email for a reply (optional)")}</Text>
              <TextInput value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" style={inputStyle} placeholderTextColor={colors.muted} />
              <Text style={{ color: colors.muted, fontSize: 12, marginBottom: 4, textAlign: align }}>{kind === "suggestion" ? L3("اقتراحك", "Uw suggestie", "Your suggestion") : L3("رسالتك", "Uw bericht", "Your message")}</Text>
              <TextInput value={message} onChangeText={setMessage} multiline style={{ ...inputStyle, minHeight: 130, textAlignVertical: "top" }} placeholderTextColor={colors.muted} />
              {!!error && <Text style={{ color: "#c0392b", fontSize: 13, marginBottom: 10, textAlign: align }}>{error}</Text>}
              <TouchableOpacity onPress={submit} disabled={sending} style={{ backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 14, alignItems: "center", opacity: sending ? 0.6 : 1 }}>
                {sending ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "800", fontSize: 15 }}>{L3("إرسال", "Versturen", "Send")}</Text>}
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
