import { useMemo, useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, Share } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useColors } from "@/hooks/use-colors";
import { useI18n } from "@/lib/i18n";
import sunnahData from "@/data/sunnah-companion.json";

type Dua = { text: string; source: string; reward?: string; reflect?: string; nl?: string; en?: string };
type Advice = { think?: string[]; feel?: string[]; speak?: string[]; act?: string[] };
type Moment = { id: string; kind: "time" | "action"; period: string; title: string; quick: string; hint: string; ikhlas: string; duas: Dua[]; deeds: string[]; advice: Advice };

const MOMENTS = (sunnahData as any).moments as Moment[];

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
  const rtlText = { textAlign: "right" as const, writingDirection: "rtl" as const };

  const [sel, setSel] = useState<string | null>(null); // selected quick action (shown inline)
  const [open, setOpen] = useState<string | null>(null); // expanded in the full list
  const nowId = useMemo(() => nowMomentId(new Date().getHours()), []);
  const nowMoment = MOMENTS.find((m) => m.id === nowId) || MOMENTS[0];
  const selMoment = sel ? MOMENTS.find((m) => m.id === sel) : null;
  const actions = MOMENTS.filter((m) => m.kind === "action");

  const shareMoment = (m: Moment) => {
    const body =
      `🕌 ${m.title}\n\n` +
      `• تذكيرُ الإخلاص: ${m.ikhlas}\n\n` +
      m.duas.map((d) => `• ${d.text}\n(${d.source})${d.reward ? `\nالأجر: ${d.reward}` : ""}`).join("\n\n") +
      `\n\n— رفيق السنّة، تطبيق ربّانيّ`;
    Share.share({ message: body }).catch(() => {});
  };

  const Header = (
    <View style={{ paddingTop: insets.top + 8, paddingBottom: 12, paddingHorizontal: 16, flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 12, backgroundColor: colors.surface, borderBottomWidth: 0.5, borderBottomColor: colors.border }}>
      <TouchableOpacity onPress={() => router.back()}><MaterialIcons name={isRTL ? "arrow-forward" : "arrow-back"} size={24} color={colors.foreground} /></TouchableOpacity>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 18, fontWeight: "800", color: colors.foreground, textAlign: isRTL ? "right" : "left" }}>{tt("Metgezel van de Soennah", "Sunnah Companion", "رفيق السنّة")}</Text>
        <Text style={{ fontSize: 12, color: colors.muted, textAlign: isRTL ? "right" : "left" }}>{tt("Bij elk moment: ikhlaas, alle doe'aa's, daden en adviezen", "For each moment: sincerity, all du'as, deeds & advice", "لكلِّ موضعٍ: إخلاصٌ وأدعيةٌ وأعمالٌ ونصائح")}</Text>
      </View>
    </View>
  );

  const AdviceRow = (icon: any, label: string, arr?: string[]) => (arr && arr.length ? (
    <View style={{ marginTop: 8 }}>
      <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 6 }}>
        <MaterialIcons name={icon} size={14} color={colors.primary} />
        <Text style={{ fontSize: 12.5, fontWeight: "800", color: colors.primary, ...rtlText }}>{label}</Text>
      </View>
      {arr.map((t, i) => (
        <Text key={i} style={{ fontSize: 12.5, color: colors.foreground, lineHeight: 22, marginTop: 2, ...rtlText }}>• {t}</Text>
      ))}
    </View>
  ) : null);

  const SectionTitle = (icon: any, label: string) => (
    <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 6, marginTop: 14, marginBottom: 2 }}>
      <MaterialIcons name={icon} size={16} color={colors.foreground} />
      <Text style={{ fontSize: 13.5, fontWeight: "800", color: colors.foreground, ...rtlText }}>{label}</Text>
    </View>
  );

  // Full rich renderer for one moment
  const renderMoment = (m: Moment) => (
    <View>
      {/* Ikhlas — leads every moment */}
      <View style={{ backgroundColor: "#FFF7E6", borderRadius: 12, borderWidth: 1, borderColor: "#E9C46A", padding: 12, marginTop: 12 }}>
        <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 6, marginBottom: 4 }}>
          <MaterialIcons name="favorite" size={15} color="#B8860B" />
          <Text style={{ fontSize: 13, fontWeight: "800", color: "#7A5B00", ...rtlText }}>{tt("Ikhlaas & intentie", "Sincerity & intention", "تذكيرُ الإخلاص والنيّة")}</Text>
        </View>
        <Text style={{ fontSize: 13.5, color: "#5c4600", lineHeight: 25, ...rtlText }}>{m.ikhlas}</Text>
      </View>

      {/* Duas */}
      {SectionTitle("menu-book", tt("De vaststaande doe'aa's", "The established du'as", "الأدعيةُ الثابتة"))}
      {m.duas.map((d, i) => (
        <View key={i} style={{ marginTop: 8, paddingTop: 8, borderTopWidth: i === 0 ? 0 : 0.5, borderTopColor: colors.border }}>
          <Text style={{ fontSize: 16.5, fontWeight: "700", color: colors.foreground, lineHeight: 30, ...rtlText }}>{d.text}</Text>
          {lang !== "ar" && (d.nl || d.en) ? (
            <Text style={{ fontSize: 12.5, color: colors.muted, marginTop: 3, textAlign: isRTL ? "right" : "left" }}>{tt(d.nl || "", d.en || "", "")}</Text>
          ) : null}
          {d.reward ? (
            <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "flex-start", gap: 6, marginTop: 6, backgroundColor: "#EAF3EC", borderRadius: 8, padding: 8 }}>
              <MaterialIcons name="workspace-premium" size={15} color="#1B4332" />
              <Text style={{ flex: 1, fontSize: 12, color: "#1B4332", lineHeight: 21, ...rtlText }}>{tt("Beloning: ", "Reward: ", "الأجرُ الثابت: ")}{d.reward}</Text>
            </View>
          ) : null}
          {d.reflect ? (
            <Text style={{ fontSize: 12, color: colors.primary, marginTop: 5, lineHeight: 21, ...rtlText }}>{tt("Overdenk: ", "Reflect: ", "تفكّر: ")}{d.reflect}</Text>
          ) : null}
          <Text style={{ fontSize: 10.5, color: colors.muted, marginTop: 3, ...rtlText }}>{d.source}</Text>
        </View>
      ))}

      {/* Accompanying deeds */}
      {m.deeds && m.deeds.length ? (
        <View>
          {SectionTitle("done-all", tt("Bijbehorende daden", "Accompanying deeds", "أعمالٌ مصاحبة"))}
          {m.deeds.map((t, i) => (
            <Text key={i} style={{ fontSize: 12.5, color: colors.foreground, lineHeight: 22, marginTop: 2, ...rtlText }}>• {t}</Text>
          ))}
        </View>
      ) : null}

      {/* Advice — four dimensions */}
      {m.advice ? (
        <View>
          {SectionTitle("tips-and-updates", tt("Adviezen (denken · voelen · spreken · handelen)", "Advice (think · feel · speak · act)", "نصائح: تفكيرًا وإحساسًا وخطابًا وجوارح"))}
          {AdviceRow("lightbulb-outline", tt("In je denken", "In your thinking", "في تفكيرك"), m.advice.think)}
          {AdviceRow("favorite-border", tt("In je gevoel", "In your feeling", "في إحساسك"), m.advice.feel)}
          {AdviceRow("campaign", tt("In je spreken", "In your speech", "في خطابك"), m.advice.speak)}
          {AdviceRow("bolt", tt("In je handelen", "In your action", "في جوارحك"), m.advice.act)}
        </View>
      ) : null}
    </View>
  );

  const ShareBtn = (m: Moment, solid: boolean) => (
    <TouchableOpacity onPress={() => shareMoment(m)} style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: solid ? colors.primary : colors.background, borderWidth: solid ? 0 : 1, borderColor: colors.primary + "60", borderRadius: 10, paddingVertical: 9, marginTop: 14 }}>
      <MaterialIcons name="share" size={15} color={solid ? "#fff" : colors.primary} />
      <Text style={{ color: solid ? "#fff" : colors.primary, fontWeight: "700", fontSize: 13 }}>{tt("Herinner je gezin", "Remind your family", "ذكّر أهلك")}</Text>
    </TouchableOpacity>
  );

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
          <Text style={{ fontSize: 12, color: colors.muted, textAlign: isRTL ? "right" : "left" }}>{nowMoment.hint}</Text>
          {renderMoment(nowMoment)}
          {ShareBtn(nowMoment, true)}
        </View>

        {/* Quick actions */}
        <Text style={{ fontSize: 14, fontWeight: "800", color: colors.foreground, marginTop: 18, marginBottom: 8, textAlign: isRTL ? "right" : "left" }}>{tt("Snel: wat ga je nu doen?", "Quick: what are you about to do?", "بحسب فِعلك الآن")}</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {actions.map((m) => (
            <TouchableOpacity key={m.id} onPress={() => setSel(sel === m.id ? null : m.id)} style={{ backgroundColor: sel === m.id ? colors.primary : colors.surface, borderWidth: 1, borderColor: sel === m.id ? colors.primary : colors.border, borderRadius: 999, paddingVertical: 7, paddingHorizontal: 13 }}>
              <Text style={{ fontSize: 13, fontWeight: "700", color: sel === m.id ? "#fff" : colors.foreground }}>{m.quick}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Selected action — shown INLINE right under the chips (no scrolling needed) */}
        {selMoment ? (
          <View style={{ backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1.5, borderColor: colors.primary, padding: 14, marginTop: 10 }}>
            <Text style={{ fontSize: 15, fontWeight: "800", color: colors.foreground, textAlign: isRTL ? "right" : "left" }}>{selMoment.title}</Text>
            <Text style={{ fontSize: 12, color: colors.muted, textAlign: isRTL ? "right" : "left" }}>{selMoment.hint}</Text>
            {renderMoment(selMoment)}
            {ShareBtn(selMoment, false)}
          </View>
        ) : null}

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
                  {renderMoment(m)}
                  {ShareBtn(m, false)}
                </View>
              ) : null}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}
