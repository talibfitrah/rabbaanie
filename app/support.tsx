import { useState, useRef } from "react";
import { ScrollView, Text, View, TextInput, TouchableOpacity, ActivityIndicator, KeyboardAvoidingView, Platform, Linking, Alert } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useColors } from "@/hooks/use-colors";
import { useI18n } from "@/lib/i18n";
import { getApiBaseUrl } from "@/constants/oauth";
import { SUPPORT_WHATSAPP } from "@/constants/support";

/**
 * Technical-support assistant (msg 583/584): the user first chats with a bounded
 * AI that only helps with using the app / technical issues; if it can't resolve
 * (or the user asks), they escalate to the human team directly on WhatsApp.
 */
type Msg = { role: "user" | "assistant"; content: string };

export default function SupportScreen() {
  const colors = useColors();
  const { language, isRTL } = useI18n();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const L3 = (ar: string, nl: string, en: string) => (language === "ar" ? ar : language === "en" ? en : nl);
  const align = isRTL ? "right" : "left";

  const intro: Msg = { role: "assistant", content: L3(
    "السلام عليكم. أنا مساعدُ الدعم التقنيّ لتطبيق ربّانيّ. اسألني عن أيِّ مشكلةٍ أو استفسارٍ في استعمال التطبيق (الإشعارات، تسجيل الدخول، مواقيت الصلاة، إضافة طفل…). وإن لم نصل إلى حلّ، يمكنك التواصل مع الفريق مباشرةً عبر واتساب.",
    "As-salaamu 3alaykum. Ik ben de technische support-assistent van Rabbaanie. Stel me een vraag over het gebruik van de app (meldingen, inloggen, gebedstijden, kind toevoegen…). Lukt het niet, dan kunt u het team direct via WhatsApp bereiken.",
    "As-salaamu 3alaykum. I'm Rabbaanie's technical support assistant. Ask me about using the app (notifications, login, prayer times, adding a child…). If we can't solve it, you can reach the team directly on WhatsApp.",
  ) };

  const [messages, setMessages] = useState<Msg[]>([intro]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [escalate, setEscalate] = useState(false);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;
    const next = [...messages, { role: "user" as const, content: text }];
    setMessages(next); setInput(""); setLoading(true);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/support/chat`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language, messages: next.filter((m) => m.role !== "assistant" || m !== intro) }),
      });
      const data = await res.json();
      const reply = (data && data.reply) || L3("تعذّر الردّ الآن. يمكنك التواصل مع الفريق عبر واتساب.", "Geen antwoord nu. Bereik het team via WhatsApp.", "No reply right now. You can reach the team on WhatsApp.");
      setMessages([...next, { role: "assistant", content: reply }]);
      if (data && data.escalate) setEscalate(true);
    } catch {
      setMessages([...next, { role: "assistant", content: L3("تعذّر الاتصال. تحقّق من الإنترنت أو تواصل عبر واتساب.", "Verbinding mislukt. Controleer internet of gebruik WhatsApp.", "Connection failed. Check the internet or use WhatsApp.") }]);
      setEscalate(true);
    } finally { setLoading(false); setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 60); }
  }

  function contactHuman() {
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    const ctx = L3("السلام عليكم، أحتاج مساعدةً تقنيّةً في تطبيق ربّانيّ", "As-salaamu 3alaykum, ik heb technische hulp nodig bij de Rabbaanie-app", "As-salaamu 3alaykum, I need technical help with the Rabbaanie app") + (lastUser ? `:\n${lastUser.content}` : ".");
    if (SUPPORT_WHATSAPP) Linking.openURL(`https://wa.me/${SUPPORT_WHATSAPP}?text=${encodeURIComponent(ctx)}`);
    else Alert.alert(L3("واتساب الفريق", "WhatsApp van het team", "Team WhatsApp"), L3("سيُفعَّل التواصل المباشر عبر واتساب قريبًا إن شاء الله.", "Direct contact via WhatsApp komt binnenkort, in shaa Allaah.", "Direct WhatsApp contact will be available soon, in shaa Allaah."));
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ paddingTop: insets.top + 8, paddingBottom: 12, paddingHorizontal: 16, backgroundColor: colors.surface, borderBottomWidth: 0.5, borderBottomColor: colors.border, flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 12 }}>
        <TouchableOpacity onPress={() => router.back()}><MaterialIcons name={isRTL ? "arrow-forward" : "arrow-back"} size={24} color={colors.foreground} /></TouchableOpacity>
        <Text style={{ fontSize: 18, fontWeight: "700", color: colors.foreground, flex: 1, textAlign: align }}>{L3("الدعم التقنيّ", "Technische support", "Technical support")}</Text>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={80}>
        <ScrollView ref={scrollRef} contentContainerStyle={{ padding: 14, paddingBottom: 8 }} keyboardShouldPersistTaps="handled">
          {messages.map((m, i) => (
            <View key={i} style={{ alignSelf: m.role === "user" ? (isRTL ? "flex-start" : "flex-end") : (isRTL ? "flex-end" : "flex-start"), maxWidth: "88%", backgroundColor: m.role === "user" ? colors.primary : colors.surface, borderRadius: 16, paddingVertical: 10, paddingHorizontal: 14, marginBottom: 10, borderWidth: m.role === "user" ? 0 : 1, borderColor: colors.border }}>
              <Text style={{ color: m.role === "user" ? "#fff" : colors.foreground, fontSize: 14.5, lineHeight: 22, textAlign: align, writingDirection: isRTL ? "rtl" : "ltr" }}>{m.content}</Text>
            </View>
          ))}
          {loading && <View style={{ alignSelf: isRTL ? "flex-end" : "flex-start", padding: 10 }}><ActivityIndicator color={colors.primary} /></View>}
        </ScrollView>

        <View style={{ paddingHorizontal: 12, paddingBottom: insets.bottom + 8, paddingTop: 6, borderTopWidth: 0.5, borderTopColor: colors.border, backgroundColor: colors.surface }}>
          <TouchableOpacity onPress={contactHuman} style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: escalate ? "#25D366" : "transparent", borderWidth: escalate ? 0 : 1, borderColor: "#25D366", borderRadius: 12, paddingVertical: 10, marginBottom: 8 }}>
            <MaterialIcons name="chat" size={18} color={escalate ? "#fff" : "#128C7E"} />
            <Text style={{ color: escalate ? "#fff" : "#128C7E", fontWeight: "700", fontSize: 14 }}>{L3("التواصل مع الفريق مباشرةً (واتساب)", "Direct contact met het team (WhatsApp)", "Contact the team directly (WhatsApp)")}</Text>
          </TouchableOpacity>
          <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "flex-end", gap: 8 }}>
            <TextInput value={input} onChangeText={setInput} multiline placeholder={L3("اكتب سؤالك التقنيّ…", "Typ uw technische vraag…", "Type your technical question…")} placeholderTextColor={colors.muted}
              style={{ flex: 1, maxHeight: 120, backgroundColor: colors.background, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, color: colors.foreground, textAlign: align, borderWidth: 1, borderColor: colors.border }} />
            <TouchableOpacity onPress={send} disabled={loading || !input.trim()} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center", opacity: loading || !input.trim() ? 0.5 : 1 }}>
              <MaterialIcons name={isRTL ? "send" : "send"} size={20} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}
