// أحداث الأسرة — Family life-events hub (Daa3iyah 2966/2968/2975). The user logs
// a family event (with its date); the app then opens /family-event-advice for
// that event — clarifying questions, then advice, then onward to the feature
// that handles it (gender-aware routeForEvent in lib/family-event-advice.ts).
import { useState, useCallback } from "react";
import { View, Text, ScrollView, Pressable, StyleSheet, TextInput, Modal, Alert } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useI18n } from "@/lib/i18n";
import { DatePicker } from "@/components/date-picker";
import { loadFamilyEvents, addFamilyEvent, removeFamilyEvent, type FamilyEvent, type FamilyEventType } from "@/lib/family-events";

type Lang = "nl" | "en" | "ar";
function tx(lang: Lang, nl: string, en: string, ar: string): string {
  return lang === "ar" ? ar : lang === "en" ? en : nl;
}
function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
type EventMeta = { key: FamilyEventType; icon: string; color: string; nl: string; en: string; ar: string };
const EVENT_TYPES: EventMeta[] = [
  { key: "marriage", icon: "favorite", color: "#C4A35A", nl: "Huwelijk", en: "Marriage", ar: "زواج" },
  { key: "pregnancy", icon: "spa", color: "#16A34A", nl: "Zwangerschap", en: "Pregnancy", ar: "حمل" },
  { key: "birth", icon: "child-friendly", color: "#2563EB", nl: "Geboorte", en: "Birth", ar: "ولادة" },
  { key: "divorce", icon: "link-off", color: "#C62828", nl: "Scheiding", en: "Divorce", ar: "طلاق" },
];
const META = (k: FamilyEventType): EventMeta => EVENT_TYPES.find((e) => e.key === k) ?? EVENT_TYPES[0];
const typeLabel = (k: FamilyEventType, lang: Lang) => { const m = META(k); return tx(lang, m.nl, m.en, m.ar); };

export default function FamilyEventsScreen() {
  const { language, isRTL, dig } = useI18n();
  const lang = language as Lang;
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [events, setEvents] = useState<FamilyEvent[]>([]);
  const [active, setActive] = useState<EventMeta | null>(null);
  const [formDate, setFormDate] = useState(todayISO());
  const [formNote, setFormNote] = useState("");

  const reload = useCallback(() => { loadFamilyEvents().then(setEvents); }, []);
  useFocusEffect(useCallback(() => { reload(); }, [reload]));

  function openLog(m: EventMeta) {
    setActive(m);
    setFormDate(todayISO());
    setFormNote("");
  }

  async function confirmLog() {
    if (!active) return;
    const type = active.key; // capture before setActive(null) below
    // formDate is always a valid ISO: initialized to today and only ever set by
    // the constrained <DatePicker>, so no date-format guard is needed here.
    try {
      await addFamilyEvent({ type, dateISO: formDate.trim(), note: formNote.trim() || undefined });
    } catch {
      Alert.alert(tx(lang, "Opslaan mislukt", "Save failed", "تعذّر الحفظ"), tx(lang, "Probeer opnieuw.", "Try again.", "حاول مرة أخرى."));
      return;
    }
    setActive(null);
    reload();
    router.push(`/family-event-advice?type=${type}` as any); // questions + advice, then onward to the feature
  }

  return (
    <View style={[st.root, { paddingTop: insets.top }]}>
      <View style={[st.topBar, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
        <Pressable onPress={() => router.back()} style={({ pressed }) => [st.iconBtn, pressed && { opacity: 0.5 }]}>
          <MaterialIcons name={isRTL ? "chevron-right" : "chevron-left"} size={28} color="#1B4332" />
        </Pressable>
        <Text style={st.topTitle}>{tx(lang, "Familiegebeurtenissen", "Family events", "أحداث الأسرة")}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }} showsVerticalScrollIndicator={false}>
        <Text style={st.intro}>
          {tx(lang, "Leg een gebeurtenis vast; de app brengt u naar wat erbij hoort.", "Log an event; the app takes you to what it needs.", "سجّل الحدث، ويَنقلك التطبيق إلى ما يناسبه.")}
        </Text>

        <View style={[st.grid, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
          {EVENT_TYPES.map((m) => (
            <Pressable key={m.key} onPress={() => openLog(m)} style={({ pressed }) => [st.card, pressed && { opacity: 0.85 }]}>
              <View style={[st.cardIcon, { backgroundColor: m.color + "18" }]}>
                <MaterialIcons name={m.icon as any} size={26} color={m.color} />
              </View>
              <Text style={st.cardLabel}>{typeLabel(m.key, lang)}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={st.sectionTitle}>{tx(lang, "Geschiedenis", "History", "السجلّ")}</Text>
        {events.length === 0 ? (
          <Text style={st.empty}>{tx(lang, "Nog geen gebeurtenissen.", "No events yet.", "لا أحداث بعد.")}</Text>
        ) : (
          events.map((ev) => {
            const m = META(ev.type);
            return (
              <View key={ev.id} style={[st.histRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
                <View style={[st.histDot, { backgroundColor: m.color }]}><MaterialIcons name={m.icon as any} size={16} color="#fff" /></View>
                <Pressable style={{ flex: 1 }} onPress={() => router.push(`/family-event-advice?type=${ev.type}` as any)}>
                  <Text style={st.histTitle}>{typeLabel(ev.type, lang)}</Text>
                  <Text style={st.histDate}>{dig(ev.dateISO)}{ev.note ? ` · ${ev.note}` : ""}</Text>
                </Pressable>
                <Pressable onPress={() => removeFamilyEvent(ev.id).then(reload)} hitSlop={8} style={({ pressed }) => [pressed && { opacity: 0.6 }]}>
                  <MaterialIcons name="delete-outline" size={18} color="#9CA3AF" />
                </Pressable>
              </View>
            );
          })
        )}
      </ScrollView>

      <Modal visible={!!active} transparent animationType="slide" supportedOrientations={["portrait", "portrait-upside-down", "landscape"]} onRequestClose={() => setActive(null)}>
        <View style={st.modalOverlay}>
          <View style={st.modalContent}>
            <View style={[st.modalHeaderRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
              <Text style={st.modalTitle}>{active ? typeLabel(active.key, lang) : ""}</Text>
              <Pressable onPress={() => setActive(null)}><MaterialIcons name="close" size={24} color="#6B7B72" /></Pressable>
            </View>
            <Text style={st.fieldLabel}>{tx(lang, "Datum", "Date", "التاريخ")}</Text>
            <DatePicker value={formDate} onChange={setFormDate} placeholder={tx(lang, "Selecteer datum", "Select date", "اختر التاريخ")} />
            <Text style={st.fieldLabel}>{tx(lang, "Notitie (optioneel)", "Note (optional)", "ملاحظة (اختياري)")}</Text>
            <TextInput value={formNote} onChangeText={setFormNote} style={[st.input, { textAlign: isRTL ? "right" : "left" }]} placeholder={tx(lang, "Details...", "Details...", "تفاصيل...")} placeholderTextColor="#9CA3AF" maxLength={120} />
            <Pressable onPress={confirmLog} style={({ pressed }) => [st.saveBtn, pressed && { opacity: 0.85 }]}>
              <Text style={st.saveBtnText}>{active ? tx(lang, "Opslaan en ga verder", "Save & continue", "سجّل وانتقل") : ""}</Text>
            </Pressable>
            {active ? <Text style={st.goHint}>{tx(lang, "Vragen en advies, daarna wat past", "Questions and advice, then what fits", "أسئلة ونصائح، ثم ما يناسب الحدث")}</Text> : null}
            <View style={{ height: insets.bottom + 12 }} />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F7F5EF" },
  topBar: { alignItems: "center", justifyContent: "space-between", paddingHorizontal: 8, paddingVertical: 8 },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  topTitle: { fontSize: 18, fontWeight: "800", color: "#1B4332" },
  intro: { fontSize: 14, color: "#4b5a52", lineHeight: 20, marginBottom: 14, textAlign: "center" },
  grid: { flexWrap: "wrap", gap: 12, justifyContent: "center" },
  card: { width: "46%", backgroundColor: "#fff", borderRadius: 14, paddingVertical: 20, alignItems: "center", borderWidth: 1, borderColor: "#E8ECE9" },
  cardIcon: { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  cardLabel: { fontSize: 15, fontWeight: "700", color: "#1B4332" },
  sectionTitle: { fontSize: 15, fontWeight: "700", color: "#1B4332", marginTop: 24, marginBottom: 8 },
  empty: { fontSize: 13, color: "#9CA3AF", textAlign: "center", paddingVertical: 16 },
  histRow: { alignItems: "center", gap: 10, backgroundColor: "#fff", borderRadius: 10, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: "#EEF1EE" },
  histDot: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  histTitle: { fontSize: 14, fontWeight: "700", color: "#1F2937" },
  histDate: { fontSize: 12, color: "#6B7B72", marginTop: 1 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalContent: { backgroundColor: "#FFFFFF", borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 20, paddingTop: 20 },
  modalHeaderRow: { alignItems: "center", justifyContent: "space-between", marginBottom: 16 },
  modalTitle: { fontSize: 18, fontWeight: "800", color: "#1B4332" },
  fieldLabel: { fontSize: 12, color: "#6B7B72", marginBottom: 6, marginTop: 8 },
  input: { borderWidth: 1, borderColor: "#E8ECE9", borderRadius: 10, padding: 12, fontSize: 14, color: "#1F2937" },
  saveBtn: { backgroundColor: "#1B4332", borderRadius: 12, paddingVertical: 14, alignItems: "center", marginTop: 18 },
  saveBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  goHint: { fontSize: 12, color: "#6B7B72", textAlign: "center", marginTop: 8 },
});
