import { useMemo, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView, Alert, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useColors } from "@/hooks/use-colors";
import { useI18n } from "@/lib/i18n";
import { trpc } from "@/lib/trpc";
import { COUNTRIES, COUNTRY_NAMES, getCountryAR, getCityAR } from "@/lib/prayer-data";

const ROLE_TARGETS = [
  { key: "user", ar: "المستخدمون" },
  { key: "parent", ar: "الآباء" },
  { key: "specialist", ar: "المتخصصون" },
  { key: "moderator", ar: "المشرفون" },
  { key: "admin", ar: "المدراء" },
];

const COMPLETENESS_TOGGLES = [
  { key: "incompletePersonal", ar: "لم يُكمل الملف الشخصي" },
  { key: "incompleteAnalytical", ar: "لم يُكمل الملف التحليلي" },
  { key: "incompleteChildren", ar: "لديه طفل بملف غير مكتمل" },
] as const;
type CompletenessKey = (typeof COMPLETENESS_TOGGLES)[number]["key"];

export default function BroadcastScreen() {
  const colors = useColors();
  const { isRTL } = useI18n();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [roles, setRoles] = useState<string[]>([]); // empty = everyone

  // ─── Audience targeting: country, city, profile-completeness ───────────
  const [selectedCountries, setSelectedCountries] = useState<string[]>([]);
  const [selectedCities, setSelectedCities] = useState<string[]>([]);
  const [completeness, setCompleteness] = useState<Record<CompletenessKey, boolean>>({
    incompletePersonal: false,
    incompleteAnalytical: false,
    incompleteChildren: false,
  });

  // Cities are scoped to the chosen countries — same gate the onboarding
  // address step uses (no country picked yet means no meaningful city list).
  const availableCities = useMemo(() => {
    const set = new Set<string>();
    for (const c of selectedCountries) {
      for (const city of COUNTRIES[c]?.cities || []) set.add(city.name);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [selectedCountries]);
  // If a country is deselected, its cities silently drop out of availableCities;
  // this keeps the applied filter in sync without a separate effect.
  const effectiveCities = useMemo(
    () => selectedCities.filter((c) => availableCities.includes(c)),
    [selectedCities, availableCities],
  );

  const audience = useMemo(
    () => ({ countries: selectedCountries, cities: effectiveCities, ...completeness }),
    [selectedCountries, effectiveCities, completeness],
  );
  const audienceQuery = trpc.admin.broadcastAudience.useQuery(audience);
  const matchedCount = audienceQuery.data?.count ?? 0;
  const incompleteChildrenRecipients = (audienceQuery.data?.recipients || []).filter(
    (r) => r.incompleteChildren.length > 0,
  );

  const send = (trpc.admin as any).sendBroadcast.useMutation({
    onSuccess: (r: any) => Alert.alert("تم الإرسال", `وصلت الرسالة إلى ${r?.sent ?? 0} جهاز.`, [{ text: "حسنًا", onPress: () => router.back() }]),
    onError: (e: any) => Alert.alert("خطأ", e?.message || "تعذّر الإرسال. تأكد أنك المالك."),
  });

  const submit = () => {
    if (!subject.trim() || !message.trim()) { Alert.alert("تنبيه", "أدخل العنوان والنص."); return; }
    send.mutate({ subject: subject.trim(), message: message.trim(), roles, audience });
  };

  const inputStyle = { backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, color: colors.foreground, textAlign: (isRTL ? "right" : "left") as "right" | "left", borderWidth: 1, borderColor: colors.border, marginTop: 6 };
  const label = (s: string) => <Text style={{ fontSize: 13, fontWeight: "600", color: colors.foreground, textAlign: isRTL ? "right" : "left", marginTop: 14 }}>{s}</Text>;
  const hint = (s: string) => <Text style={{ fontSize: 11, color: colors.muted, textAlign: isRTL ? "right" : "left", marginTop: 2 }}>{s}</Text>;
  const chipRow = (
    items: { key: string; label: string }[],
    selected: string[],
    onToggle: (key: string) => void,
  ) => (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
      {items.map((it) => {
        const on = selected.includes(it.key);
        return (
          <TouchableOpacity key={it.key} onPress={() => onToggle(it.key)}
            style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 5, backgroundColor: on ? colors.primary : colors.surface, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 13, borderWidth: 1, borderColor: on ? colors.primary : colors.border }}>
            <MaterialIcons name={on ? "check" : "add"} size={15} color={on ? "#fff" : colors.muted} />
            <Text style={{ fontSize: 13, fontWeight: "700", color: on ? "#fff" : colors.foreground }}>{it.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ paddingTop: insets.top + 8, paddingBottom: 12, paddingHorizontal: 16, backgroundColor: colors.surface, borderBottomWidth: 0.5, borderBottomColor: colors.border, flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 12 }}>
        <TouchableOpacity onPress={() => router.back()}><MaterialIcons name={isRTL ? "arrow-forward" : "arrow-back"} size={24} color={colors.foreground} /></TouchableOpacity>
        <Text style={{ fontSize: 18, fontWeight: "700", color: colors.foreground, flex: 1, textAlign: isRTL ? "right" : "left" }}>رسالة جماعية</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }} keyboardShouldPersistTaps="handled">
        <Text style={{ fontSize: 12, color: colors.muted, textAlign: isRTL ? "right" : "left", lineHeight: 20 }}>تُرسَل كإشعار فوري إلى المستخدمين المحددين.</Text>
        {label("إلى")}
        {hint("اختر نوعًا أو أكثر — إن لم تختر شيئًا تُرسل إلى الجميع.")}
        {chipRow(ROLE_TARGETS.map((t) => ({ key: t.key, label: t.ar })), roles, (k) => setRoles(roles.includes(k) ? roles.filter((r) => r !== k) : [...roles, k]))}

        {label("الدولة")}
        {hint("اختر دولة أو أكثر — لا شيء يعني كل الدول.")}
        {chipRow(COUNTRY_NAMES.map((c) => ({ key: c, label: getCountryAR(c) })), selectedCountries, (k) =>
          setSelectedCountries(selectedCountries.includes(k) ? selectedCountries.filter((c) => c !== k) : [...selectedCountries, k]),
        )}

        {selectedCountries.length > 0 && (
          <>
            {label("المدينة")}
            {hint("اختر مدينة أو أكثر ضمن الدول المحددة — لا شيء يعني كل المدن.")}
            {chipRow(availableCities.map((c) => ({ key: c, label: getCityAR(c) })), selectedCities, (k) =>
              setSelectedCities(selectedCities.includes(k) ? selectedCities.filter((c) => c !== k) : [...selectedCities, k]),
            )}
          </>
        )}

        {label("اكتمال الملفات")}
        <View style={{ gap: 8, marginTop: 8 }}>
          {COMPLETENESS_TOGGLES.map((tgl) => {
            const on = completeness[tgl.key];
            return (
              <TouchableOpacity key={tgl.key} onPress={() => setCompleteness({ ...completeness, [tgl.key]: !on })}
                style={{ alignSelf: isRTL ? "flex-end" : "flex-start", flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 6, backgroundColor: on ? colors.error : colors.surface, borderRadius: 20, paddingVertical: 6, paddingHorizontal: 14, borderWidth: 1, borderColor: on ? colors.error : colors.border }}>
                <MaterialIcons name={on ? "check-box" : "check-box-outline-blank"} size={15} color={on ? "#fff" : colors.muted} />
                <Text style={{ fontSize: 12, fontWeight: "700", color: on ? "#fff" : colors.foreground }}>{tgl.ar}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {completeness.incompleteChildren && incompleteChildrenRecipients.length > 0 && (
          <View style={{ marginTop: 10, backgroundColor: colors.surface, borderRadius: 10, borderWidth: 1, borderColor: colors.border, padding: 10, gap: 4 }}>
            {incompleteChildrenRecipients.map((r: any) => (
              <Text key={r.id} style={{ fontSize: 11, color: colors.muted, textAlign: isRTL ? "right" : "left" }}>
                {(r.name || "—") + "  —  الأطفال غير المكتملين: " + r.incompleteChildren.join("، ")}
              </Text>
            ))}
          </View>
        )}

        {label("العنوان")}
        <TextInput value={subject} onChangeText={setSubject} placeholder="عنوان الإشعار" placeholderTextColor={colors.muted} style={inputStyle} />
        {label("النص")}
        <TextInput value={message} onChangeText={setMessage} multiline placeholder="نص الرسالة" placeholderTextColor={colors.muted} style={{ ...inputStyle, minHeight: 120, textAlignVertical: "top" }} />

        <View style={{ marginTop: 22, flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", justifyContent: "center", gap: 6 }}>
          {audienceQuery.isLoading ? (
            <ActivityIndicator size="small" color={colors.muted} />
          ) : audienceQuery.isError ? (
            // Never print a count the query did not return. matchedCount falls
            // back to 0, and isLoading is false once the query has errored, so
            // without this branch a failure renders as a confident "will reach
            // 0 users" over an enabled send button — while the send itself
            // still goes out to everyone the roles match.
            <Text style={{ fontSize: 12, fontWeight: "700", color: colors.error, textAlign: "center" }}>
              {"تعذّر حساب عدد المستلمين — قد يصل الإشعار إلى جميع المستخدمين"}
            </Text>
          ) : (
            <Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground }}>
              {"سيصل الإشعار إلى " + matchedCount + " مستخدم"}
            </Text>
          )}
        </View>
        <TouchableOpacity onPress={submit} disabled={send.isPending} style={{ backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 14, alignItems: "center", marginTop: 10, opacity: send.isPending ? 0.6 : 1 }}>
          {send.isPending ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>إرسال</Text>}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}
