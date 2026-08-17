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

// ─── Audience categories ────────────────────────────────────────────────
// Daa3iyah asked for the broadcast screen to be organised by audience
// category (not raw filter checkboxes), each with a fixed-structure message
// template: basmala → the message and the action required → al-hamdu +
// as-salaam. The full trilingual templates live in
// server/broadcast-templates.ts, sent through db.broadcastLocalizedPush
// (which already delivers each recipient their own stored language) via
// server/routers.ts's sendBroadcast `category` input (see
// local-docs/BROADCAST-ROUTER-PATCH.md for the wiring). This screen still
// cannot import server/ code directly — no app/ file ever has (see
// server/broadcast-audience.ts's header for why: client and server bundles
// are kept strictly separate) — so incompleteAnalytical/incompletePersonal
// keep sending through the older freeform subject/message path, with the
// two Arabic strings below duplicated on purpose from
// analyticalProfileTemplate() / personalProfileTemplate() and pinned
// against drift by tests/broadcast-admin-preview.test.ts. incompleteChildren
// and notLinkedSpouse have no such strings — their wording is per-recipient
// (child name / gender), so they send via `category` and the server renders
// the real text (see submit() below).
const BASMALA_AR = "بسم الله الرحمن الرحيم";
const CLOSING_AR = "والحمد لله رب العالمين، والسلام عليكم ورحمة الله وبركاته.";

type CategoryKey = "incompleteAnalytical" | "incompleteChildren" | "incompletePersonal" | "notLinkedSpouse";

type CategoryConfig = {
  key: CategoryKey;
  label: string;
  description: string;
  /** All four categories are sendable now that sendBroadcast accepts
   *  `category` (see local-docs/BROADCAST-ROUTER-PATCH.md). Kept as a field,
   *  not hardcoded true, so a future category can still be staged here
   *  disabled before its server-side wiring lands. */
  sendReady: boolean;
  pendingNote?: string;
  titleAr?: string;
  bodyAr?: string;
};

const CATEGORIES: CategoryConfig[] = [
  {
    key: "incompleteAnalytical",
    label: "لم يُكمل الملف التحليلي",
    description: "مستخدمون لم يُنهوا خطوات التشخيص/الملف التحليلي الكامل.",
    sendReady: true,
    titleAr: "أكمل ملفك التحليلي",
    bodyAr: `${BASMALA_AR}\n\nلاحظنا أنك لم تُكمل بعد الملف التحليلي (التشخيص) الخاص بك في تطبيق ربّانيّ. إكمال هذا الملف يساعدنا على تقديم نصائح تربوية أدقّ لأسرتك. يرجى فتح التطبيق وإكمال خطوات الملف التحليلي في أقرب وقت.\n\n${CLOSING_AR}`,
  },
  {
    key: "incompleteChildren",
    label: "ملف الطفل غير مكتمل",
    description: "مستخدمون لديهم طفل لم يكتمل ملفه — الرسالة تذكر اسمه تحديدًا لكل مستلم.",
    sendReady: true,
  },
  {
    key: "incompletePersonal",
    label: "لم يُدخل بياناته الشخصية",
    description: "مستخدمون لم يُكملوا بيانات الهوية والعنوان الأساسية.",
    sendReady: true,
    titleAr: "أكمل بياناتك الشخصية",
    bodyAr: `${BASMALA_AR}\n\nلاحظنا أنك لم تُدخل بعد بياناتك الشخصية كاملةً في تطبيق ربّانيّ. إكمالها ضروري لتفعيل خدمات التطبيق كاملةً. يرجى فتح التطبيق وإكمال بياناتك الشخصية.\n\n${CLOSING_AR}`,
  },
  {
    key: "notLinkedSpouse",
    label: "لم يربط ملف الزوج/الزوجة",
    description: "مستخدمون متزوجون لم يربطوا ملف الزوج/الزوجة بعد — بصيغة تراعي جنس المستلم (له/لها).",
    sendReady: true,
  },
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
  const [category, setCategory] = useState<CategoryKey | null>(null);

  // ─── Audience targeting: country, city, profile-completeness ───────────
  const [selectedCountries, setSelectedCountries] = useState<string[]>([]);
  const [selectedCities, setSelectedCities] = useState<string[]>([]);
  const [completeness, setCompleteness] = useState<Record<CompletenessKey, boolean>>({
    incompletePersonal: false,
    incompleteAnalytical: false,
    incompleteChildren: false,
  });

  const activeCategory = category ? CATEGORIES.find((c) => c.key === category)! : null;

  // Picking a category sets the underlying filter it maps to and, for the
  // two categories with a fixed titleAr/bodyAr (incompleteAnalytical,
  // incompletePersonal), pre-fills the exact message text — the other two
  // send server-rendered per-recipient text instead (see submit() below).
  // Picking the already-selected category again returns to manual/custom
  // mode, leaving whatever was already typed untouched.
  const applyCategory = (key: CategoryKey) => {
    if (key === category) {
      setCategory(null);
      return;
    }
    setCategory(key);
    setCompleteness({
      incompletePersonal: key === "incompletePersonal",
      incompleteAnalytical: key === "incompleteAnalytical",
      incompleteChildren: key === "incompleteChildren",
    });
    const cat = CATEGORIES.find((c) => c.key === key)!;
    setSubject(cat.sendReady ? cat.titleAr || "" : "");
    setMessage(cat.sendReady ? cat.bodyAr || "" : "");
  };

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

  // notLinkedSpouse has no manual checkbox (see COMPLETENESS_TOGGLES below —
  // it's category-only, not combinable like the other three), so it isn't
  // in `completeness`. Fold it in from `category` directly, mirroring how
  // sendBroadcast itself merges `[category]: true` into the filter — the
  // preview count must ask the server the same question the send will.
  const audience = useMemo(
    () => ({
      countries: selectedCountries,
      cities: effectiveCities,
      ...completeness,
      ...(category === "notLinkedSpouse" ? { notLinkedSpouse: true } : {}),
    }),
    [selectedCountries, effectiveCities, completeness, category],
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
    if (activeCategory && !activeCategory.sendReady) {
      Alert.alert("غير متاح بعد", activeCategory.pendingNote || "هذه الفئة تحتاج تحديثًا في الخادم قبل الإرسال.");
      return;
    }
    // A category with no prefilled titleAr (incompleteChildren,
    // notLinkedSpouse) has per-recipient wording the server renders itself —
    // send `category`, not the (empty) subject/message fields.
    if (activeCategory && !activeCategory.titleAr) {
      send.mutate({ category: activeCategory.key, roles, audience });
      return;
    }
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

        {label("فئة الجمهور")}
        {hint("اختر فئة جاهزة برسالة بصيغة ثابتة (بسم الله ← الرسالة والإجراء المطلوب ← الحمد والسلام)، أو اترك بلا اختيار للتخصيص اليدوي.")}
        <View style={{ gap: 8, marginTop: 8 }}>
          {CATEGORIES.map((cat) => {
            const on = category === cat.key;
            return (
              <TouchableOpacity key={cat.key} onPress={() => applyCategory(cat.key)}
                style={{ borderRadius: 12, borderWidth: 1, borderColor: on ? colors.primary : colors.border, backgroundColor: on ? colors.primary + "15" : colors.surface, padding: 12 }}>
                <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 6 }}>
                  <MaterialIcons name={on ? "radio-button-checked" : "radio-button-unchecked"} size={17} color={on ? colors.primary : colors.muted} />
                  <Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground, flex: 1, textAlign: isRTL ? "right" : "left" }}>{cat.label}</Text>
                  {!cat.sendReady && (
                    <View style={{ backgroundColor: colors.muted + "25", borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
                      <Text style={{ fontSize: 10, fontWeight: "700", color: colors.muted }}>قريبًا</Text>
                    </View>
                  )}
                </View>
                <Text style={{ fontSize: 11, color: colors.muted, textAlign: isRTL ? "right" : "left", marginTop: 4 }}>{cat.description}</Text>
                {on && !cat.sendReady && (
                  <Text style={{ fontSize: 11, color: colors.error, textAlign: isRTL ? "right" : "left", marginTop: 6 }}>{cat.pendingNote}</Text>
                )}
              </TouchableOpacity>
            );
          })}
        </View>

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

        {!category && (
          <>
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
          </>
        )}

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
