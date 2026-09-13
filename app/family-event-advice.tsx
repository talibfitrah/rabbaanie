// Family-event advice flow (Daa3iyah 2975): after logging an event the app asks
// a few clarifying questions (one at a time, per the advisor methodology), then
// shows advice tailored to the answers — each with its دليل — and a button
// onward to the feature that handles the event. Content lives in
// lib/family-event-advice.ts (curated on his manhaj, reviewed before release).
import { useState, useEffect } from "react";
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useI18n } from "@/lib/i18n";
import { useAppState } from "@/lib/app-context";
import { FAMILY_EVENT_TYPES, type FamilyEventType } from "@/lib/family-events";
import { EVENT_ADVICE, routeForEvent, adviceForAnswers, type Trilingual } from "@/lib/family-event-advice";

type Lang = "nl" | "en" | "ar";
function tr(v: Trilingual, lang: Lang): string {
  return lang === "ar" ? v.ar : lang === "en" ? v.en : v.nl;
}
const EVENT_TITLE: Record<FamilyEventType, Trilingual> = {
  marriage: { nl: "Huwelijk", en: "Marriage", ar: "زواج" },
  pregnancy: { nl: "Zwangerschap", en: "Pregnancy", ar: "حمل" },
  birth: { nl: "Geboorte", en: "Birth", ar: "ولادة" },
  divorce: { nl: "Scheiding", en: "Divorce", ar: "طلاق" },
};
function isEventType(v: string | undefined): v is FamilyEventType {
  return !!v && (FAMILY_EVENT_TYPES as readonly string[]).includes(v);
}

export default function FamilyEventAdviceScreen() {
  const { language, isRTL } = useI18n();
  const lang = language as Lang;
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { state, loading } = useAppState();
  const isWoman = state.parentProfile?.gender === "vrouw"; // unset/man → husband routing (default-to-man convention)

  const params = useLocalSearchParams<{ type?: string }>();
  const type = isEventType(params.type) ? params.type : null;
  const config = type ? EVENT_ADVICE[type] : undefined;

  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [qIndex, setQIndex] = useState(0);

  // No advice content for this event (not yet reviewed/published) → go straight
  // to the feature, preserving the pre-2975 behavior. Wait for gender to hydrate
  // first so the route is correct.
  useEffect(() => {
    if (loading) return;
    // replace (not back): a direct deep-link with a bad/absent type has no back
    // stack, so router.back() would no-op and leave a permanent spinner.
    if (!type) { router.replace("/family-events" as any); return; }
    if (!config) router.replace(routeForEvent(type, isWoman) as any);
  }, [loading, type, config, isWoman, router]);

  if (loading || !type || !config) {
    return <View style={[st.root, { paddingTop: insets.top, justifyContent: "center" }]}><ActivityIndicator /></View>;
  }

  const questions = config.questions;
  const onQuestions = qIndex < questions.length;
  const items = adviceForAnswers(config, answers);

  function answer(qid: string, value: string) {
    setAnswers((a) => ({ ...a, [qid]: value }));
    setQIndex((i) => i + 1);
  }

  return (
    <View style={[st.root, { paddingTop: insets.top }]}>
      <View style={[st.topBar, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
        <Pressable onPress={() => router.back()} style={({ pressed }) => [st.iconBtn, pressed && { opacity: 0.5 }]}>
          <MaterialIcons name={isRTL ? "chevron-right" : "chevron-left"} size={28} color="#1B4332" />
        </Pressable>
        <Text style={st.topTitle}>{tr(EVENT_TITLE[type], lang)}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }} showsVerticalScrollIndicator={false}>
        <Text style={[st.intro, { textAlign: isRTL ? "right" : "left" }]}>{tr(config.intro, lang)}</Text>
        {onQuestions ? (
          <View>
            {questions[qIndex] ? (
              <>
                <Text style={[st.question, { textAlign: isRTL ? "right" : "left" }]}>{tr(questions[qIndex].text, lang)}</Text>
                {questions[qIndex].options.map((o) => (
                  <Pressable key={o.value} onPress={() => answer(questions[qIndex].id, o.value)} style={({ pressed }) => [st.option, { flexDirection: isRTL ? "row-reverse" : "row" }, pressed && { opacity: 0.85 }]}>
                    <MaterialIcons name="radio-button-unchecked" size={20} color="#1B4332" />
                    <Text style={st.optionText}>{tr(o.label, lang)}</Text>
                  </Pressable>
                ))}
                <Text style={st.progress}>{`${qIndex + 1} / ${questions.length}`}</Text>
              </>
            ) : null}
          </View>
        ) : (
          <View>
            {questions.length > 0 ? (
              <Pressable onPress={() => { setAnswers({}); setQIndex(0); }} style={({ pressed }) => [st.revise, { flexDirection: isRTL ? "row-reverse" : "row" }, pressed && { opacity: 0.6 }]}>
                <MaterialIcons name="refresh" size={16} color="#6B7B72" />
                <Text style={st.reviseText}>{tx(lang, "Vragen opnieuw", "Answer again", "إعادة الأسئلة")}</Text>
              </Pressable>
            ) : null}

            {items.map((item, i) => (
              <View key={i} style={st.adviceCard}>
                <Text style={[st.adviceBody, { textAlign: isRTL ? "right" : "left" }]}>{tr(item.body, lang)}</Text>
                {item.daleel ? (
                  <View style={[st.daleelBox, isRTL ? { borderRightWidth: 3, borderRightColor: "#C4A35A" } : { borderLeftWidth: 3, borderLeftColor: "#C4A35A" }]}>
                    <Text style={[st.daleelText, { textAlign: isRTL ? "right" : "left" }]}>{tr(item.daleel, lang)}</Text>
                  </View>
                ) : null}
              </View>
            ))}

            <Pressable onPress={() => router.replace(routeForEvent(type, isWoman) as any)} style={({ pressed }) => [st.continueBtn, pressed && { opacity: 0.85 }]}>
              <Text style={st.continueText}>{tx(lang, "Doorgaan", "Continue", "المتابعة")}</Text>
            </Pressable>
            <Pressable onPress={() => router.back()} style={({ pressed }) => [st.doneBtn, pressed && { opacity: 0.6 }]}>
              <Text style={st.doneText}>{tx(lang, "Klaar", "Done", "تمّ")}</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function tx(lang: Lang, nl: string, en: string, ar: string): string {
  return lang === "ar" ? ar : lang === "en" ? en : nl;
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F7F5EF" },
  topBar: { alignItems: "center", justifyContent: "space-between", paddingHorizontal: 8, paddingVertical: 8 },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  topTitle: { fontSize: 16, fontWeight: "800", color: "#1B4332", flex: 1, textAlign: "center" },
  intro: { fontSize: 14, color: "#4b5a52", lineHeight: 22, backgroundColor: "#fff", borderWidth: 1, borderColor: "#E8ECE9", borderRadius: 10, padding: 12, marginBottom: 16 },
  question: { fontSize: 18, fontWeight: "700", color: "#1B4332", marginBottom: 16, lineHeight: 26 },
  option: { alignItems: "center", gap: 10, backgroundColor: "#fff", borderRadius: 12, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: "#E8ECE9" },
  optionText: { fontSize: 15, color: "#1F2937", flex: 1, fontWeight: "600" },
  progress: { fontSize: 12, color: "#9CA3AF", textAlign: "center", marginTop: 10 },
  revise: { alignItems: "center", gap: 6, alignSelf: "center", marginBottom: 14, paddingVertical: 4 },
  reviseText: { fontSize: 13, color: "#6B7B72", fontWeight: "600" },
  adviceCard: { backgroundColor: "#fff", borderRadius: 12, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: "#E8ECE9" },
  adviceBody: { fontSize: 15, color: "#1F2937", lineHeight: 24 },
  daleelBox: { backgroundColor: "#F4F1E8", borderRadius: 8, padding: 10, marginTop: 10 },
  daleelText: { fontSize: 14, color: "#5b5336", lineHeight: 26 },
  continueBtn: { backgroundColor: "#1B4332", borderRadius: 12, paddingVertical: 14, alignItems: "center", marginTop: 8 },
  continueText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  doneBtn: { paddingVertical: 12, alignItems: "center", marginTop: 4 },
  doneText: { color: "#6B7B72", fontSize: 14, fontWeight: "600" },
});
