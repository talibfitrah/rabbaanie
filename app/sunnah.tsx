import { useMemo, useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, Share } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useColors } from "@/hooks/use-colors";
import { useI18n } from "@/lib/i18n";
import sunnahData from "@/data/sunnah-companion.json";

type Item = { text: string; kind: string; source: string; nl?: string; en?: string };
type Moment = { id: string; kind: "time" | "action"; period: string; title: string; quick: string; hint: string; items: Item[] };

const MOMENTS = (sunnahData as any).moments as Moment[];

/** Pick the most relevant moment for the current hour (the «الآن» card). */
function nowMomentId(h: number): string {
  if (h >= 3 && h < 6) return "waking";
  if (h >= 6 && h < 11) return "morning-adhkar";
  if (h >= 16 && h < 19) return "evening-adhkar";
  if (h >= 21 || h < 3) return "sleep";
  return "post-prayer";
}

export default function SunnahScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { language, isRTL } = useI18n();
  const lang = (language === "ar" || language === "en" ? language : "nl") as "ar" | "en" | "nl";
  const tt = (nl: string, en: string, ar: string) => (lang === "ar" ? ar : lang === "en" ? en : nl);

  const [open, setOpen] = useState<string | null>(null);
  const nowId = useMemo(() => nowMomentId(new Date().getHours()), []);
  const nowMoment = MOMENTS.find((m) => m.id === nowId) || MOMENTS[0];
  const actions = MOMENTS.filter((m) => m.kind === "action");

  const shareMoment = (m: Moment) => {
    const body =
      `🕌 ${m.title}\n\n` +
      m.items.map((it) => `• ${it.text}\n(${it.kind} — ${it.source})`).join("\n\n") +
      `\n\n— رفيق السنّة، تطبيق ربّانيّ`;
    Share.share({ message: body }).catch(() => {});
  };

  const Header = (
    <View style={{ paddingTop: insets.top + 8, paddingBottom: 12, paddingHorizontal: 16, flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 12, backgroundColor: colors.surface, borderBottomWidth: 0.5, borderBottomColor: colors.border }}>
      <TouchableOpacity onPress={() => router.back()}><MaterialIcons name={isRTL ? "arrow-forward" : "arrow-back"} size={24} color={colors.foreground} /></TouchableOpacity>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 18, fontWeight: "800", color: colors.foreground, textAlign: isRTL ? "right" : "left" }}>{tt("Metgezel van de Soennah", "Sunnah Companion", "رفيق السنّة")}</Text>
        <Text style={{ fontSize: 12, color: colors.muted, textAlign: isRTL ? "right" : "left" }}>{tt("Soennah's van dag en nacht met hun bronnen", "The sunnahs of day & night with their sources", "سننُ اليوم والليلة بأدلّتها")}</Text>
      </View>
    </View>
  );

  const renderItems = (m: Moment) => m.items.map((it, i) => (
    <View key={i} style={{ marginTop: 10, paddingTop: 10, borderTopWidth: i === 0 ? 0 : 0.5, borderTopColor: colors.border }}>
      <Text style={{ fontSize: 17, fontWeight: "700", color: colors.foreground, lineHeight: 30, textAlign: "right", writingDirection: "rtl" }}>{it.text}</Text>
      {lang !== "ar" && (it.nl || it.en) ? (
        <Text style={{ fontSize: 13, color: colors.muted, marginTop: 4, textAlign: isRTL ? "right" : "left" }}>{tt(it.nl || "", it.en || "", "")}</Text>
      ) : null}
      <Text style={{ fontSize: 11, color: colors.primary, marginTop: 4, textAlign: isRTL ? "right" : "left" }}>{it.kind} · {it.source}</Text>
    </View>
  ));

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {Header}
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 96 }}>
        {/* «الآن» card */}
        <View style={{ backgroundColor: colors.primary + "12", borderRadius: 16, borderWidth: 1.5, borderColor: colors.primary, padding: 16 }}>
          <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <MaterialIcons name="schedule" size={18} color={colors.primary} />
            <Text style={{ fontSize: 13, fontWeight: "800", color: colors.primary }}>{tt("Nu", "Now", "الآن")}</Text>
          </View>
          <Text style={{ fontSize: 16, fontWeight: "800", color: colors.foreground, textAlign: isRTL ? "right" : "left" }}>{nowMoment.title}</Text>
          <Text style={{ fontSize: 12, color: colors.muted, marginBottom: 4, textAlign: isRTL ? "right" : "left" }}>{nowMoment.hint}</Text>
          {renderItems(nowMoment)}
          <TouchableOpacity onPress={() => shareMoment(nowMoment)} style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 9, marginTop: 12 }}>
            <MaterialIcons name="share" size={16} color="#fff" />
            <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>{tt("Herinner je gezin", "Remind your family", "ذكّر أهلك")}</Text>
          </TouchableOpacity>
        </View>

        {/* Quick actions */}
        <Text style={{ fontSize: 14, fontWeight: "800", color: colors.foreground, marginTop: 18, marginBottom: 8, textAlign: isRTL ? "right" : "left" }}>{tt("Snel: waar ben je nu?", "Quick: what are you about to do?", "بحسب فِعلك الآن")}</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {actions.map((m) => (
            <TouchableOpacity key={m.id} onPress={() => setOpen(open === m.id ? null : m.id)} style={{ backgroundColor: open === m.id ? colors.primary : colors.surface, borderWidth: 1, borderColor: open === m.id ? colors.primary : colors.border, borderRadius: 999, paddingVertical: 7, paddingHorizontal: 13 }}>
              <Text style={{ fontSize: 13, fontWeight: "700", color: open === m.id ? "#fff" : colors.foreground }}>{m.quick}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* All moments (browsable) */}
        <Text style={{ fontSize: 14, fontWeight: "800", color: colors.foreground, marginTop: 20, marginBottom: 8, textAlign: isRTL ? "right" : "left" }}>{tt("Alle momenten", "All moments", "كلُّ المواضع")}</Text>
        {MOMENTS.map((m) => {
          const isOpen = open === m.id;
          return (
            <View key={m.id} style={{ backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 14, marginBottom: 10 }}>
              <TouchableOpacity onPress={() => setOpen(isOpen ? null : m.id)} style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", justifyContent: "space-between" }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: "700", color: colors.foreground, textAlign: isRTL ? "right" : "left" }}>{m.title}</Text>
                  <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2, textAlign: isRTL ? "right" : "left" }}>{m.hint}</Text>
                </View>
                <MaterialIcons name={isOpen ? "expand-less" : "expand-more"} size={22} color={colors.muted} />
              </TouchableOpacity>
              {isOpen ? (
                <View>
                  {renderItems(m)}
                  <TouchableOpacity onPress={() => shareMoment(m)} style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.primary + "60", borderRadius: 10, paddingVertical: 8, marginTop: 12 }}>
                    <MaterialIcons name="share" size={15} color={colors.primary} />
                    <Text style={{ color: colors.primary, fontWeight: "700", fontSize: 12 }}>{tt("Herinner je gezin", "Remind your family", "ذكّر أهلك")}</Text>
                  </TouchableOpacity>
                </View>
              ) : null}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}
