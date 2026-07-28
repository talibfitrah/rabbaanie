import { useEffect, useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useColors } from "@/hooks/use-colors";
import { useI18n } from "@/lib/i18n";
import { fetchWeather, weatherLabel, weatherReflection, ghaybNote, type WeatherNow } from "@/lib/weather";

export default function WeatherScreen() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { language, isRTL } = useI18n();
  const lang = (language === "ar" || language === "en" ? language : "nl") as "ar" | "en" | "nl";
  const tt = (nl: string, en: string, ar: string) => (lang === "ar" ? ar : lang === "en" ? en : nl);

  const [w, setW] = useState<WeatherNow | null>(null);
  const [loading, setLoading] = useState(true);
  const [sel, setSel] = useState(7); // today = index 7 (past_days=7)
  const [city, setCity] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem("@prayer_location");
        if (raw) {
          const l = JSON.parse(raw);
          setCity([l.city, l.country].filter(Boolean).join("، "));
          if (l.lat != null && l.lng != null) setW(await fetchWeather(l.lat, l.lng));
        }
      } catch {}
      setLoading(false);
    })();
  }, []);

  const loc = (d: string) => new Date(d).toLocaleDateString(lang === "ar" ? "ar" : lang, { weekday: "short", day: "numeric" });

  const Header = (
    <View style={{ paddingTop: insets.top + 8, paddingBottom: 12, paddingHorizontal: 16, flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 12, backgroundColor: colors.surface, borderBottomWidth: 0.5, borderBottomColor: colors.border }}>
      <TouchableOpacity onPress={() => router.back()}><MaterialIcons name={isRTL ? "arrow-forward" : "arrow-back"} size={24} color={colors.foreground} /></TouchableOpacity>
      <Text style={{ fontSize: 18, fontWeight: "700", color: colors.foreground, flex: 1, textAlign: isRTL ? "right" : "left" }}>
        {tt("Weer", "Weather", "الطقس")}{city ? ` — ${city}` : ""}
      </Text>
    </View>
  );

  if (loading) return <View style={{ flex: 1, backgroundColor: colors.background }}>{Header}<ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} /></View>;
  if (!w) return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>{Header}
      <Text style={{ textAlign: "center", marginTop: 40, color: colors.muted }}>{tt("Geen locatie ingesteld", "No location set", "لم يُحدَّد موقعٌ للصلاة بعد")}</Text>
    </View>
  );

  const day = w.daily[sel] || w.daily[0];
  const dl = weatherLabel(day.code, lang);
  const refl = weatherReflection(day.code, day.max, lang);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {Header}
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }}>
        {/* Current */}
        <View style={{ alignItems: "center", marginBottom: 8 }}>
          <MaterialIcons name={weatherLabel(w.code, lang).icon as any} size={48} color={colors.primary} />
          <Text style={{ fontSize: 44, fontWeight: "800", color: colors.foreground }}>{w.temp}°</Text>
          <Text style={{ fontSize: 15, color: colors.muted }}>{weatherLabel(w.code, lang).label} · {w.todayMax}° / {w.todayMin}°</Text>
        </View>

        {/* Day browser */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginVertical: 12 }}>
          {w.daily.map((d, i) => {
            const on = i === sel;
            return (
              <TouchableOpacity key={i} onPress={() => setSel(i)} style={{ alignItems: "center", gap: 4, paddingVertical: 8, paddingHorizontal: 12, marginHorizontal: 3, borderRadius: 14, backgroundColor: on ? colors.primary + "18" : colors.surface, borderWidth: 1, borderColor: on ? colors.primary : colors.border }}>
                <Text style={{ fontSize: 11, color: i === 7 ? colors.primary : colors.muted, fontWeight: i === 7 ? "700" : "400" }}>{i === 7 ? tt("Vandaag", "Today", "اليوم") : loc(d.date)}</Text>
                <MaterialIcons name={weatherLabel(d.code, lang).icon as any} size={18} color={on ? colors.primary : colors.muted} />
                <Text style={{ fontSize: 12, color: colors.foreground, fontWeight: "600" }}>{d.max}°</Text>
                <Text style={{ fontSize: 10, color: colors.muted }}>{d.min}°</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Selected day reflection */}
        <View style={{ backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 16 }}>
          <Text style={{ fontSize: 14, fontWeight: "700", color: colors.primary, textAlign: "center", marginBottom: 4 }}>{dl.label} · {day.max}° / {day.min}°</Text>
          <Text style={{ fontSize: 13, color: colors.muted, textAlign: "center", marginBottom: 12 }}>{refl.note}</Text>
          <Text style={{ fontSize: 17, fontWeight: "700", color: colors.foreground, textAlign: "center", lineHeight: 30 }}>{refl.dua}</Text>
          <Text style={{ fontSize: 11, color: colors.muted, textAlign: "center", marginTop: 4 }}>{refl.source}</Text>
        </View>

        <View style={{ backgroundColor: "#EAF3EC", borderRadius: 12, padding: 14, marginTop: 12 }}>
          <Text style={{ fontSize: 13, fontWeight: "800", color: "#1B4332", marginBottom: 4, textAlign: isRTL ? "right" : "left" }}>{tt("Aanmoediging", "Encouragement", "ترغيب")}</Text>
          <Text style={{ fontSize: 14, color: "#374151", lineHeight: 24, textAlign: isRTL ? "right" : "left" }}>{refl.targheeb}</Text>
        </View>
        <View style={{ backgroundColor: "#FDECEA", borderRadius: 12, padding: 14, marginTop: 10 }}>
          <Text style={{ fontSize: 13, fontWeight: "800", color: "#B71C1C", marginBottom: 4, textAlign: isRTL ? "right" : "left" }}>{tt("Waarschuwing", "Warning", "ترهيب")}</Text>
          <Text style={{ fontSize: 14, color: "#374151", lineHeight: 24, textAlign: isRTL ? "right" : "left" }}>{refl.tarheeb}</Text>
        </View>

        <Text style={{ fontSize: 12, color: colors.muted, textAlign: "center", marginTop: 16, fontStyle: "italic" }}>{ghaybNote(lang)}</Text>
      </ScrollView>
    </View>
  );
}
