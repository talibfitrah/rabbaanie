import { useMemo, useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, Share, TextInput } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useColors } from "@/hooks/use-colors";
import { useI18n } from "@/lib/i18n";
import sunnahData from "@/data/sunnah-companion.json";

type Loc = string | { ar?: string; nl?: string; en?: string };
type Dua = { text: string; translit?: string; nl?: string; en?: string; source: Loc; reward?: Loc; reflect?: Loc };
type Advice = { think?: Loc[]; feel?: Loc[]; speak?: Loc[]; act?: Loc[] };
type Moment = { id: string; kind: "time" | "action"; period: string; cat?: string; title: Loc; quick: Loc; hint: Loc; ikhlas: Loc; duas: Dua[]; deeds: Loc[]; advice: Advice };

const MOMENTS = (sunnahData as any).moments as Moment[];

// Daa3iyah (msg 603): group the moments into 8 topics shown at the top of the screen.
const CATS = [
  { key: "salah", icon: "mosque", ar: "الصلاة والمسجد", nl: "Gebed & moskee", en: "Prayer & mosque" },
  { key: "tahara", icon: "water-drop", ar: "الطهارة", nl: "Reiniging", en: "Purification" },
  { key: "food", icon: "restaurant", ar: "الطعام والشراب", nl: "Eten & drinken", en: "Food & drink" },
  { key: "home", icon: "home", ar: "البيت والأسرة", nl: "Huis & gezin", en: "Home & family" },
  { key: "dhikr", icon: "menu-book", ar: "الذكر والقرآن", nl: "Dhikr & Koran", en: "Dhikr & Qur'an" },
  { key: "travel", icon: "luggage", ar: "الخروج والسفر", nl: "Uitgaan & reizen", en: "Outings & travel" },
  { key: "states", icon: "healing", ar: "الأحوال والمصائب", nl: "Toestanden", en: "States & trials" },
  { key: "nature", icon: "wb-sunny", ar: "الطبيعة والأوقات", nl: "Natuur & tijden", en: "Nature & times" },
] as const;

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
  // Pick the user's language from a localized value; fall back gracefully. Plain strings pass through.
  const L = (v: Loc | undefined): string => (v == null ? "" : typeof v === "string" ? v : (v[lang] ?? v.ar ?? v.nl ?? v.en ?? ""));
  const isAr = lang === "ar";
  // Daa3iyah (msg 518/521): align ALL رفيق السنّة content to the LEFT — Arabic text
  // still reads right-to-left (writingDirection), but the blocks sit on the left.
  const rtlText = { textAlign: "left" as const, writingDirection: "rtl" as const };
  const uiAlign = { textAlign: "left" as const };

  const [open, setOpen] = useState<string | null>(null);
  const nowId = useMemo(() => nowMomentId(new Date().getHours()), []);
  const nowMoment = MOMENTS.find((m) => m.id === nowId) || MOMENTS[0];
  const [selCat, setSelCat] = useState<string>(nowMoment.cat || CATS[0].key);

  // Search across ALL moments (Daa3iyah msg 674) — Arabic diacritics/tatweel-insensitive.
  const [query, setQuery] = useState("");
  const norm = (s: string) => s.toLowerCase()
    .replace(/[ً-ْٰـ]/g, "").replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").trim();
  const momentText = (m: Moment) => {
    const parts: string[] = [];
    [m.title, m.quick, m.hint, m.ikhlas].forEach((v) => { if (v) { parts.push(typeof v === "string" ? v : (v.ar || "")); parts.push(L(v)); } });
    (m.duas || []).forEach((d) => { parts.push(d.text || ""); if (d.reflect) parts.push(L(d.reflect)); });
    (m.deeds || []).forEach((d) => parts.push(L(d)));
    return norm(parts.join(" "));
  };
  const q = norm(query);
  const searching = q.length > 0;
  const results = useMemo(() => (searching ? MOMENTS.filter((m) => momentText(m).includes(q)) : []), [q, lang]);

  const shareMoment = (m: Moment) => {
    const body =
      `🕌 ${L(m.title)}\n\n` +
      `• ${tt("Ikhlaas", "Sincerity", "تذكيرُ الإخلاص")}: ${L(m.ikhlas)}\n\n` +
      m.duas.map((d) => `• ${d.text}${d.translit ? `\n${d.translit}` : ""}${!isAr && (d.nl || d.en) ? `\n${tt(d.nl || "", d.en || "", "")}` : ""}\n(${L(d.source)})${d.reward ? `\n${tt("Beloning", "Reward", "الأجر")}: ${L(d.reward)}` : ""}`).join("\n\n") +
      `\n\n— ${tt("Metgezel van de Soennah, Rabbaanie", "Sunnah Companion, Rabbaanie", "رفيق السنّة، تطبيق ربّانيّ")}`;
    Share.share({ message: body }).catch(() => {});
  };

  const Header = (
    <View style={{ paddingTop: insets.top + 8, paddingBottom: 12, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: colors.surface, borderBottomWidth: 0.5, borderBottomColor: colors.border }}>
      <TouchableOpacity onPress={() => router.back()}><MaterialIcons name={"arrow-back"} size={24} color={colors.foreground} /></TouchableOpacity>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 18, fontWeight: "800", color: colors.foreground, ...uiAlign }}>{tt("Metgezel van de Soennah", "Sunnah Companion", "رفيق السنّة")}</Text>
        <Text style={{ fontSize: 12, color: colors.muted, ...uiAlign }}>{tt("Bij elk moment: ikhlaas, doe'aa's, uitspraak, daden & advies", "Each moment: sincerity, du'as, pronunciation, deeds & advice", "لكلِّ موضعٍ: إخلاصٌ وأدعيةٌ ونطقٌ وأعمالٌ ونصائح")}</Text>
      </View>
    </View>
  );

  const AdviceRow = (icon: any, label: string, arr?: Loc[]) => (arr && arr.length ? (
    <View style={{ marginTop: 8 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <MaterialIcons name={icon} size={14} color={colors.primary} />
        <Text style={{ fontSize: 12.5, fontWeight: "800", color: colors.primary, ...uiAlign }}>{label}</Text>
      </View>
      {arr.map((it, i) => (
        <Text key={i} style={{ fontSize: 12.5, color: colors.foreground, lineHeight: 22, marginTop: 2, ...(isAr ? rtlText : uiAlign) }}>• {L(it)}</Text>
      ))}
    </View>
  ) : null);

  const SectionTitle = (icon: any, label: string) => (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 14, marginBottom: 2 }}>
      <MaterialIcons name={icon} size={16} color={colors.foreground} />
      <Text style={{ fontSize: 13.5, fontWeight: "800", color: colors.foreground, ...uiAlign }}>{label}</Text>
    </View>
  );

  const renderMoment = (m: Moment) => (
    <View>
      {/* Ikhlas — leads every moment */}
      <View style={{ backgroundColor: "#FFF7E6", borderRadius: 12, borderWidth: 1, borderColor: "#E9C46A", padding: 12, marginTop: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 }}>
          <MaterialIcons name="favorite" size={15} color="#B8860B" />
          <Text style={{ fontSize: 13, fontWeight: "800", color: "#7A5B00", ...uiAlign }}>{tt("Ikhlaas & intentie", "Sincerity & intention", "تذكيرُ الإخلاص والنيّة")}</Text>
        </View>
        <Text style={{ fontSize: 13.5, color: "#5c4600", lineHeight: 25, ...(isAr ? rtlText : uiAlign) }}>{L(m.ikhlas)}</Text>
      </View>

      {/* Duas: Arabic + Latin transliteration + meaning */}
      {m.duas && m.duas.length ? SectionTitle("menu-book", tt("De doe'aa's (met uitspraak)", "The du'as (with pronunciation)", "الأدعيةُ الثابتة")) : null}
      {(m.duas || []).map((d, i) => (
        <View key={i} style={{ marginTop: 8, paddingTop: 8, borderTopWidth: i === 0 ? 0 : 0.5, borderTopColor: colors.border }}>
          <Text style={{ fontSize: 16.5, fontWeight: "700", color: colors.foreground, lineHeight: 30, ...rtlText }}>{d.text}</Text>
          {!isAr && d.translit ? (
            <Text style={{ fontSize: 12.5, color: colors.primary, fontStyle: "italic", marginTop: 4, ...uiAlign }}>{d.translit}</Text>
          ) : null}
          {!isAr && (d.nl || d.en) ? (
            <Text style={{ fontSize: 12.5, color: colors.muted, marginTop: 3, ...uiAlign }}>{tt(d.nl || "", d.en || "", "")}</Text>
          ) : null}
          {d.reward ? (
            <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 6, marginTop: 6, backgroundColor: "#EAF3EC", borderRadius: 8, padding: 8 }}>
              <MaterialIcons name="workspace-premium" size={15} color="#1B4332" />
              <Text style={{ flex: 1, fontSize: 12, color: "#1B4332", lineHeight: 21, ...(isAr ? rtlText : uiAlign) }}>{tt("Beloning: ", "Reward: ", "الأجرُ الثابت: ")}{L(d.reward)}</Text>
            </View>
          ) : null}
          {d.reflect ? (
            <Text style={{ fontSize: 12, color: colors.primary, marginTop: 5, lineHeight: 21, ...(isAr ? rtlText : uiAlign) }}>{tt("Overdenk: ", "Reflect: ", "تفكّر: ")}{L(d.reflect)}</Text>
          ) : null}
          <Text style={{ fontSize: 10.5, color: colors.muted, marginTop: 3, ...(isAr ? rtlText : uiAlign) }}>{L(d.source)}</Text>
        </View>
      ))}

      {/* Accompanying deeds */}
      {m.deeds && m.deeds.length ? (
        <View>
          {SectionTitle("done-all", tt("Bijbehorende daden", "Accompanying deeds", "أعمالٌ مصاحبة"))}
          {m.deeds.map((it, i) => (
            <Text key={i} style={{ fontSize: 12.5, color: colors.foreground, lineHeight: 22, marginTop: 2, ...(isAr ? rtlText : uiAlign) }}>• {L(it)}</Text>
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
    <TouchableOpacity onPress={() => shareMoment(m)} style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: solid ? colors.primary : colors.background, borderWidth: solid ? 0 : 1, borderColor: colors.primary + "60", borderRadius: 10, paddingVertical: 9, marginTop: 14 }}>
      <MaterialIcons name="share" size={15} color={solid ? "#fff" : colors.primary} />
      <Text style={{ color: solid ? "#fff" : colors.primary, fontWeight: "700", fontSize: 13 }}>{tt("Herinner je gezin", "Remind your family", "ذكّر أهلك")}</Text>
    </TouchableOpacity>
  );

  const catLabel = (key?: string) => { const c = CATS.find((x) => x.key === key); return c ? tt(c.nl, c.en, c.ar) : ""; };
  const momentCard = (m: Moment, showCat: boolean) => {
    const isOpen = open === m.id;
    return (
      <View key={m.id} style={{ backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 14, marginBottom: 10 }}>
        <TouchableOpacity onPress={() => setOpen(isOpen ? null : m.id)} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 15, fontWeight: "700", color: colors.foreground, ...uiAlign }}>{L(m.title)}</Text>
            <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2, ...uiAlign }}>{L(m.hint)}</Text>
            {showCat ? <Text style={{ fontSize: 11, fontWeight: "700", color: colors.primary, marginTop: 4, ...uiAlign }}>{catLabel(m.cat)}</Text> : null}
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
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {Header}
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 96 }}>
        {/* «الآن» card */}
        <View style={{ backgroundColor: colors.primary + "12", borderRadius: 16, borderWidth: 1.5, borderColor: colors.primary, padding: 16 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <MaterialIcons name="schedule" size={18} color={colors.primary} />
            <Text style={{ fontSize: 13, fontWeight: "800", color: colors.primary }}>{tt("Nu", "Now", "الآن")}</Text>
          </View>
          <Text style={{ fontSize: 16, fontWeight: "800", color: colors.foreground, ...uiAlign }}>{L(nowMoment.title)}</Text>
          <Text style={{ fontSize: 12, color: colors.muted, ...uiAlign }}>{L(nowMoment.hint)}</Text>
          {renderMoment(nowMoment)}
          {ShareBtn(nowMoment, true)}
        </View>

        {/* Search across all moments (msg 674) */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 12, marginTop: 18 }}>
          <MaterialIcons name="search" size={18} color={colors.muted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={tt("Zoek in momenten…", "Search moments…", "ابحث في المواضع…")}
            placeholderTextColor={colors.muted}
            style={{ flex: 1, fontSize: 14, color: colors.foreground, paddingVertical: 10, ...uiAlign }}
          />
          {searching ? (
            <TouchableOpacity onPress={() => setQuery("")}><MaterialIcons name="close" size={18} color={colors.muted} /></TouchableOpacity>
          ) : null}
        </View>

        {searching ? (
          <View style={{ marginTop: 12 }}>
            <Text style={{ fontSize: 12, color: colors.muted, marginBottom: 8, ...uiAlign }}>{results.length} {tt("resultaten", "results", "نتيجة")}</Text>
            {results.length ? results.map((m) => momentCard(m, true)) : (
              <Text style={{ fontSize: 13, color: colors.muted, marginTop: 8, ...uiAlign }}>{tt("Geen resultaten", "No results", "لا نتائج")}</Text>
            )}
          </View>
        ) : (
          <View>
            {/* Topics — 8 categories at the top (msg 603) */}
            <Text style={{ fontSize: 14, fontWeight: "800", color: colors.foreground, marginTop: 18, marginBottom: 8, ...uiAlign }}>{tt("Onderwerpen", "Topics", "الأبواب")}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 4, flexDirection: isRTL ? "row-reverse" : "row" }}>
              {CATS.map((c) => {
                const on = selCat === c.key;
                return (
                  <TouchableOpacity key={c.key} onPress={() => { setSelCat(c.key); setOpen(null); }} style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: on ? colors.primary : colors.surface, borderWidth: 1, borderColor: on ? colors.primary : colors.border, borderRadius: 999, paddingVertical: 7, paddingHorizontal: 13 }}>
                    <MaterialIcons name={c.icon as any} size={15} color={on ? "#fff" : colors.primary} />
                    <Text style={{ fontSize: 13, fontWeight: "700", color: on ? "#fff" : colors.foreground }}>{tt(c.nl, c.en, c.ar)}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Moments of the selected topic */}
            <View style={{ marginTop: 10 }}>
              {MOMENTS.filter((m) => m.cat === selCat).map((m) => momentCard(m, false))}
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
