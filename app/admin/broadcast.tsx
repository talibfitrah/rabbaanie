import { useMemo, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView, Alert, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useColors } from "@/hooks/use-colors";
import { useI18n } from "@/lib/i18n";
import { useL3 } from "@/lib/admin-text";
import { trpc } from "@/lib/trpc";
import { COUNTRIES, COUNTRY_NAMES, getCountryAR, getCityAR } from "@/lib/prayer-data";
import { buildSendPayload, type CategoryConfig, type CategoryKey } from "./broadcast-send";

// ─── Audience categories ────────────────────────────────────────────────
// Daa3iyah asked for the broadcast screen to be organised by audience
// category (not raw filter checkboxes), each with a fixed-structure message
// template: basmala → the message and the action required → al-hamdu +
// as-salaam. The full trilingual templates live in
// server/broadcast-templates.ts, sent through db.broadcastLocalizedPush
// (which already delivers each recipient their own stored language) via
// server/routers.ts's sendBroadcast `category` input (see
// local-docs/BROADCAST-ROUTER-PATCH.md for the wiring). All four categories
// below send via `category` (see buildSendPayload() in ./broadcast-send) so
// every recipient gets the server's trilingual template in their own
// language — this screen still cannot import server/ code directly — no
// app/ file ever has (see server/broadcast-audience.ts's header for why:
// client and server bundles are kept strictly separate) — so
// incompleteAnalytical/incompletePersonal still carry the two Arabic strings
// below, duplicated on purpose from analyticalProfileTemplate() /
// personalProfileTemplate() and pinned against drift by
// tests/broadcast-admin-preview.test.ts, purely as an on-screen preview of
// what gets sent; they are never read by submit() once a category is
// selected. incompleteChildren and notLinkedSpouse have no such strings —
// their wording is per-recipient (child name / gender) and rendered
// server-side either way.
const BASMALA_AR = "بسم الله الرحمن الرحيم";
const CLOSING_AR = "والحمد لله رب العالمين، والسلام عليكم ورحمة الله وبركاته.";

type CompletenessKey = "incompletePersonal" | "incompleteAnalytical" | "incompleteChildren";

// ─── Recurring schedule: day-of-week + hour ─────────────────────────────
// index 0..6 = Sunday..Saturday, matching JS Date#getDay() and
// server/broadcast-schedule.ts's daysOfWeek CSV.
const WEEKDAY_LABELS_AR = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
const ALL_DAYS = ["0", "1", "2", "3", "4", "5", "6"];

function parseDaysCsv(csv: string): string[] {
  return csv ? csv.split(",").map((s) => s.trim()).filter(Boolean) : [];
}

/** Toggles `key` in the CSV, refusing to remove the last remaining day —
 *  same "never let the value go invalid" guard the old cadence stepper used
 *  (disabled at cadenceDays<=1). An empty daysOfWeek would fail the
 *  server's zod validation anyway; this just avoids firing that mutation. */
function toggleDayInCsv(csv: string, key: string): string {
  const days = parseDaysCsv(csv);
  const next = days.includes(key)
    ? (days.length <= 1 ? days : days.filter((d) => d !== key))
    : [...days, key];
  return next.sort((a, b) => Number(a) - Number(b)).join(",");
}

export default function BroadcastScreen() {
  const colors = useColors();
  const { isRTL, language } = useI18n();
  const L3 = useL3();
  const ROLE_TARGETS = [
    { key: "user", label: L3("المستخدمون", "Gebruikers", "Users") },
    { key: "parent", label: L3("أولياء الأمور", "Ouders", "Parents") },
    { key: "specialist", label: L3("المتخصصون", "Specialisten", "Specialists") },
    { key: "moderator", label: L3("المشرفون", "Moderators", "Moderators") },
    { key: "admin", label: L3("المدراء", "Beheerders", "Admins") },
  ];

  const CATEGORIES: CategoryConfig[] = [
    {
      key: "incompleteAnalytical",
      label: L3("لم يُكمل الملف التحليلي", "Analytisch profiel niet afgerond", "Analytical profile incomplete"),
      description: L3("مستخدمون لم يُنهوا خطوات التشخيص/الملف التحليلي الكامل.", "Gebruikers die de stappen van de diagnose / het volledige analytische profiel niet hebben afgerond.", "Users who have not finished the diagnosis / full analytical profile steps."),
      sendReady: true,
      titleAr: "أكمل ملفك التحليلي",
      bodyAr: `${BASMALA_AR}\n\nلاحظنا أنك لم تُكمل بعد الملف التحليلي (التشخيص) الخاص بك في تطبيق ربّانيّ. إكمال هذا الملف يساعدنا على تقديم نصائح تربوية أدقّ لأسرتك. يرجى فتح التطبيق وإكمال خطوات الملف التحليلي في أقرب وقت.\n\n${CLOSING_AR}`,
    },
    {
      key: "incompleteChildren",
      label: L3("ملف الطفل غير مكتمل", "Kindprofiel onvolledig", "Child profile incomplete"),
      description: L3("مستخدمون لديهم طفل لم يكتمل ملفه — الرسالة تذكر اسمه تحديدًا لكل مستلم.", "Gebruikers met een kind wiens profiel onvolledig is — het bericht noemt per ontvanger de naam van het kind.", "Users with a child whose profile is incomplete — the message names that child for each recipient."),
      sendReady: true,
    },
    {
      key: "incompletePersonal",
      label: L3("لم يُدخل بياناته الشخصية", "Persoonsgegevens niet ingevuld", "Personal details missing"),
      description: L3("مستخدمون لم يُكملوا بيانات الهوية والعنوان الأساسية.", "Gebruikers die de basisgegevens (identiteit en adres) niet hebben ingevuld.", "Users who have not completed their basic identity and address details."),
      sendReady: true,
      titleAr: "أكمل بياناتك الشخصية",
      bodyAr: `${BASMALA_AR}\n\nلاحظنا أنك لم تُدخل بعد بياناتك الشخصية كاملةً في تطبيق ربّانيّ. إكمالها ضروري لتفعيل خدمات التطبيق كاملةً. يرجى فتح التطبيق وإكمال بياناتك الشخصية.\n\n${CLOSING_AR}`,
    },
    {
      key: "notLinkedSpouse",
      label: L3("لم يربط ملف الزوج/الزوجة", "Partnerprofiel niet gekoppeld", "Spouse profile not linked"),
      description: L3("مستخدمون متزوجون لم يربطوا ملف الزوج/الزوجة بعد — بصيغة تراعي جنس المستلم (له/لها).", "Getrouwde gebruikers die het profiel van hun echtgenoot/echtgenote nog niet hebben gekoppeld — de formulering volgt het geslacht van de ontvanger.", "Married users who have not yet linked their spouse's profile — worded for the recipient's gender."),
      sendReady: true,
    },
  ];

  const COMPLETENESS_TOGGLES = [
    { key: "incompletePersonal", label: L3("لم يُكمل الملف الشخصي", "Persoonlijk profiel niet afgerond", "Personal profile incomplete") },
    { key: "incompleteAnalytical", label: L3("لم يُكمل الملف التحليلي", "Analytisch profiel niet afgerond", "Analytical profile incomplete") },
    { key: "incompleteChildren", label: L3("لديه طفل بملف غير مكتمل", "Heeft een kind met een onvolledig profiel", "Has a child with an incomplete profile") },
  ] as const;
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [roles, setRoles] = useState<string[]>([]); // empty = everyone
  const [category, setCategory] = useState<CategoryKey | null>(null);

  // ─── Audience targeting: country, city, gender, profile-completeness ───
  const [selectedCountries, setSelectedCountries] = useState<string[]>([]);
  const [selectedCities, setSelectedCities] = useState<string[]>([]);
  // Mutually exclusive with itself (one or neither, never both) — same
  // single-select-via-chipRow pattern as newScheduleCategory below.
  const [gender, setGender] = useState<"man" | "vrouw" | null>(null);
  const [completeness, setCompleteness] = useState<Record<CompletenessKey, boolean>>({
    incompletePersonal: false,
    incompleteAnalytical: false,
    incompleteChildren: false,
  });

  const activeCategory = category ? CATEGORIES.find((c) => c.key === category)! : null;

  // Picking a category sets the underlying filter it maps to and, for the
  // two categories with a fixed titleAr/bodyAr (incompleteAnalytical,
  // incompletePersonal), pre-fills the exact message text as an on-screen
  // preview — submit() always sends via `category` once one is selected, so
  // this prefill (and the fields it fills) is never read at send time (see
  // buildSendPayload() in ./broadcast-send). Picking the already-selected
  // category again returns to manual/custom mode, leaving whatever was
  // already typed untouched.
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
      ...(gender ? { gender } : {}),
      ...(category === "notLinkedSpouse" ? { notLinkedSpouse: true } : {}),
    }),
    [selectedCountries, effectiveCities, completeness, gender, category],
  );
  const audienceQuery = trpc.admin.broadcastAudience.useQuery(audience);
  const matchedCount = audienceQuery.data?.count ?? 0;
  // The notification can only reach users who actually hold a push token.
  // matchedCount counts everyone the audience filter matches; deliverableCount
  // is the subset that will truly receive it — the two diverge sharply for the
  // "incomplete profile" segments, whose users mostly never enabled notifications.
  // ?? count: never print "0 users" just because an older API omits the field —
  // degrade to the matched count, which is what the label showed before.
  const deliverableCount = audienceQuery.data?.deliverable ?? audienceQuery.data?.count ?? 0;
  const incompleteChildrenRecipients = (audienceQuery.data?.recipients || []).filter(
    (r) => r.incompleteChildren.length > 0,
  );

  const send = (trpc.admin as any).sendBroadcast.useMutation({
    onSuccess: (r: any) => Alert.alert(L3("تم الإرسال", "Verzonden", "Sent"), L3(`وصلت الرسالة إلى ${r?.sent ?? 0} جهاز.`, `Het bericht is bij ${r?.sent ?? 0} apparaten aangekomen.`, `The message reached ${r?.sent ?? 0} devices.`), [{ text: L3("حسنًا", "OK", "OK"), onPress: () => router.back() }]),
    onError: (e: any) => Alert.alert(L3("خطأ", "Fout", "Error"), e?.message || L3("تعذّر الإرسال. تأكد أنك المالك.", "Verzenden is mislukt. Controleer of u de eigenaar bent.", "Could not send. Make sure you are the owner.")),
  });

  // ─── Recurring automated broadcasts ─────────────────────────────────────
  // Same four categories as the manual send above (CATEGORIES), sent
  // automatically on a cadence by scripts/send-recurring-broadcasts.ts
  // (server/broadcast-schedule.ts's isScheduleDue) instead of an admin
  // tapping "send" each time.
  const schedulesQuery = (trpc.admin as any).listSchedules.useQuery();
  const schedules: any[] = schedulesQuery.data || [];
  const refetchSchedules = () => schedulesQuery.refetch();
  const categoryLabel = (key: string) => CATEGORIES.find((c) => c.key === key)?.label || key;
  // category is unique per schedule (drizzle/schema.ts) — offering one that
  // already has a schedule would just fail with a raw constraint error.
  const scheduledCategories = new Set(schedules.map((s) => s.category));
  const availableCategories = CATEGORIES.filter((c) => !scheduledCategories.has(c.key));

  const [newScheduleCategory, setNewScheduleCategory] = useState<CategoryKey | null>(null);
  const [newScheduleDays, setNewScheduleDays] = useState<string[]>(ALL_DAYS);
  const [newScheduleHour, setNewScheduleHour] = useState("9");
  const [newScheduleActive, setNewScheduleActive] = useState(false);
  // Live recipient count for the category being staged into a new schedule —
  // independent of the manual-send audienceQuery above so picking one
  // doesn't move the other's number.
  const newScheduleAudienceQuery = trpc.admin.broadcastAudience.useQuery(
    (newScheduleCategory ? { [newScheduleCategory]: true } : {}) as any,
    { enabled: !!newScheduleCategory },
  );

  const createScheduleM = (trpc.admin as any).createSchedule.useMutation({
    onSuccess: () => {
      refetchSchedules();
      setNewScheduleCategory(null);
      setNewScheduleDays(ALL_DAYS);
      setNewScheduleHour("9");
      setNewScheduleActive(false);
    },
    onError: (e: any) => Alert.alert(L3("خطأ", "Fout", "Error"), e?.message || L3("تعذّر إنشاء الجدولة.", "Kon de planning niet aanmaken.", "Could not create the schedule.")),
  });
  const updateScheduleM = (trpc.admin as any).updateSchedule.useMutation({
    onSuccess: refetchSchedules,
    onError: (e: any) => Alert.alert(L3("خطأ", "Fout", "Error"), e?.message || L3("تعذّر تحديث الجدولة.", "Kon de planning niet bijwerken.", "Could not update the schedule.")),
  });
  const deleteScheduleM = (trpc.admin as any).deleteSchedule.useMutation({
    onSuccess: refetchSchedules,
    onError: (e: any) => Alert.alert(L3("خطأ", "Fout", "Error"), e?.message || L3("تعذّر حذف الجدولة.", "Kon de planning niet verwijderen.", "Could not delete the schedule.")),
  });

  // ─── Send reports ────────────────────────────────────────────────────
  const sendLogQuery = (trpc.admin as any).sendLog.useQuery();
  const sendLog: any[] = sendLogQuery.data || [];

  const addSchedule = () => {
    if (!newScheduleCategory) { Alert.alert(L3("تنبيه", "Let op", "Notice"), L3("اختر فئة الجمهور أولاً.", "Kies eerst een doelgroep.", "Choose an audience category first.")); return; }
    // No "at least one day" check here: newScheduleDays starts at ALL_DAYS
    // and toggleDayInCsv refuses to remove the last remaining day, so it
    // structurally can't reach empty through this screen.
    const sendHour = parseInt(newScheduleHour, 10);
    if (!Number.isFinite(sendHour) || sendHour < 0 || sendHour > 23) { Alert.alert(L3("تنبيه", "Let op", "Notice"), L3("أدخل ساعة صحيحة (0 إلى 23).", "Voer een geldig uur in (0 t/m 23).", "Enter a valid hour (0 to 23).")); return; }
    const daysOfWeek = newScheduleDays.slice().sort((a, b) => Number(a) - Number(b)).join(",");
    createScheduleM.mutate({ category: newScheduleCategory, daysOfWeek, sendHour, active: newScheduleActive });
  };

  const confirmDeleteSchedule = (id: number) => {
    Alert.alert(L3("حذف الجدولة", "Planning verwijderen", "Delete schedule"), L3("هل أنت متأكد من حذف هذه الرسالة المتكررة؟", "Weet u zeker dat u dit terugkerende bericht wilt verwijderen?", "Are you sure you want to delete this recurring message?"), [
      { text: L3("إلغاء", "Annuleren", "Cancel"), style: "cancel" },
      { text: L3("حذف", "Verwijderen", "Delete"), style: "destructive", onPress: () => deleteScheduleM.mutate({ id }) },
    ]);
  };

  const submit = () => {
    const result = buildSendPayload(activeCategory, subject, message, roles, audience);
    if (!result.ok) {
      if (result.reason === "not-ready") {
        Alert.alert(L3("غير متاح بعد", "Nog niet beschikbaar", "Not available yet"), activeCategory?.pendingNote || L3("هذه الفئة تحتاج تحديثًا في الخادم قبل الإرسال.", "Deze categorie vereist eerst een serverupdate.", "This category needs a server update before sending."));
      } else {
        Alert.alert(L3("تنبيه", "Let op", "Notice"), L3("أدخل العنوان والنص.", "Voer een titel en tekst in.", "Enter a title and message."));
      }
      return;
    }
    send.mutate(result.payload);
  };

  const inputStyle = { backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, color: colors.foreground, textAlign: (isRTL ? "right" : "left") as "right" | "left", borderWidth: 1, borderColor: colors.border, marginTop: 6 };
  const label = (s: string) => <Text style={{ fontSize: 13, fontWeight: "600", color: colors.foreground, textAlign: isRTL ? "right" : "left", marginTop: 14 }}>{s}</Text>;
  const hint = (s: string) => <Text style={{ fontSize: 11, color: colors.muted, textAlign: isRTL ? "right" : "left", marginTop: 2 }}>{s}</Text>;
  const chipRow = (
    items: { key: string; label: string }[],
    selected: string[],
    onToggle: (key: string) => void,
  ) => (
    <View style={{ flexDirection: isRTL ? "row-reverse" : "row", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
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
        <Text style={{ fontSize: 18, fontWeight: "700", color: colors.foreground, flex: 1, textAlign: isRTL ? "right" : "left" }}>{L3("رسالة جماعية", "Groepsbericht", "Broadcast")}</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }} keyboardShouldPersistTaps="handled">
        <Text style={{ fontSize: 12, color: colors.muted, textAlign: isRTL ? "right" : "left", lineHeight: 20 }}>{L3("تُرسَل كإشعار فوري إلى المستخدمين المحددين.", "Wordt als pushmelding verstuurd naar de geselecteerde gebruikers.", "Sent as a push notification to the selected users.")}</Text>

        {label(L3("فئة الجمهور", "Doelgroep", "Audience"))}
        {hint(L3("اختر فئة جاهزة برسالة بصيغة ثابتة (بسم الله ← الرسالة والإجراء المطلوب ← الحمد والسلام)، أو اترك بلا اختيار للتخصيص اليدوي.", "Kies een kant-en-klare categorie met een vaste berichtvorm (basmala → bericht en gevraagde actie → hamd en salaam), of laat leeg om zelf te schrijven.", "Pick a ready-made category with a fixed message form (basmala → message and required action → hamd and salaam), or leave unselected to write your own."))}
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
                      <Text style={{ fontSize: 10, fontWeight: "700", color: colors.muted }}>{L3("قريبًا", "Binnenkort", "Soon")}</Text>
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

        {label(L3("إلى", "Aan", "To"))}
        {hint(L3("اختر نوعًا أو أكثر — إن لم تختر شيئًا تُرسل إلى الجميع.", "Kies een of meer groepen — niets gekozen betekent iedereen.", "Choose one or more groups — nothing selected means everyone."))}
        {chipRow(ROLE_TARGETS.map((t) => ({ key: t.key, label: t.label })), roles, (k) => setRoles(roles.includes(k) ? roles.filter((r) => r !== k) : [...roles, k]))}

        {label(L3("الدولة", "Land", "Country"))}
        {hint(L3("اختر دولة أو أكثر — لا شيء يعني كل الدول.", "Kies een of meer landen — niets betekent alle landen.", "Choose one or more countries — nothing means all countries."))}
        {chipRow(COUNTRY_NAMES.map((c) => ({ key: c, label: getCountryAR(c) })), selectedCountries, (k) =>
          setSelectedCountries(selectedCountries.includes(k) ? selectedCountries.filter((c) => c !== k) : [...selectedCountries, k]),
        )}

        {selectedCountries.length > 0 && (
          <>
            {label(L3("المدينة", "Stad", "City"))}
            {hint(L3("اختر مدينة أو أكثر ضمن الدول المحددة — لا شيء يعني كل المدن.", "Kies een of meer steden binnen de gekozen landen — niets betekent alle steden.", "Choose one or more cities within the selected countries — nothing means all cities."))}
            {chipRow(availableCities.map((c) => ({ key: c, label: getCityAR(c) })), selectedCities, (k) =>
              setSelectedCities(selectedCities.includes(k) ? selectedCities.filter((c) => c !== k) : [...selectedCities, k]),
            )}
          </>
        )}

        {label(L3("الجنس", "Geslacht", "Gender"))}
        {hint(L3("اختر فئة واحدة — لا شيء يعني الجميع.", "Kies één groep — niets betekent iedereen.", "Choose one group — nothing means everyone."))}
        {chipRow(
          [{ key: "vrouw", label: L3("الأمهات", "Moeders", "Mothers") }, { key: "man", label: L3("الآباء", "Vaders", "Fathers") }],
          gender ? [gender] : [],
          (k) => setGender(gender === k ? null : (k as "man" | "vrouw")),
        )}

        {!category && (
          <>
            {label(L3("اكتمال الملفات", "Profielvolledigheid", "Profile completeness"))}
            <View style={{ gap: 8, marginTop: 8 }}>
              {COMPLETENESS_TOGGLES.map((tgl) => {
                const on = completeness[tgl.key];
                return (
                  <TouchableOpacity key={tgl.key} onPress={() => setCompleteness({ ...completeness, [tgl.key]: !on })}
                    style={{ alignSelf: isRTL ? "flex-end" : "flex-start", flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 6, backgroundColor: on ? colors.error : colors.surface, borderRadius: 20, paddingVertical: 6, paddingHorizontal: 14, borderWidth: 1, borderColor: on ? colors.error : colors.border }}>
                    <MaterialIcons name={on ? "check-box" : "check-box-outline-blank"} size={15} color={on ? "#fff" : colors.muted} />
                    <Text style={{ fontSize: 12, fontWeight: "700", color: on ? "#fff" : colors.foreground }}>{tgl.label}</Text>
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
                {(r.name || "—") + L3("  —  الأطفال غير المكتملين: ", "  —  onvolledige kindprofielen: ", "  —  incomplete child profiles: ") + r.incompleteChildren.join(L3("، ", ", ", ", "))}
              </Text>
            ))}
          </View>
        )}

        {label(L3("العنوان", "Titel", "Title"))}
        <TextInput value={subject} onChangeText={setSubject} placeholder={L3("عنوان الإشعار", "Titel van de melding", "Notification title")} placeholderTextColor={colors.muted} style={inputStyle} />
        {label(L3("النص", "Tekst", "Message"))}
        <TextInput value={message} onChangeText={setMessage} multiline placeholder={L3("نص الرسالة", "Berichttekst", "Message text")} placeholderTextColor={colors.muted} style={{ ...inputStyle, minHeight: 120, textAlignVertical: "top" }} />

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
              {L3("تعذّر حساب عدد المستلمين — قد يصل الإشعار إلى جميع المستخدمين", "Kon het aantal ontvangers niet berekenen — de melding kan alle gebruikers bereiken", "Could not count recipients — the notification may reach all users")}
            </Text>
          ) : (
            <View style={{ alignItems: "center", gap: 2 }}>
              <Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground }}>
                {L3("سيصل الإشعار إلى " + deliverableCount + " مستخدم", "De melding bereikt " + deliverableCount + " gebruikers", "The notification will reach " + deliverableCount + " users")}
              </Text>
              {deliverableCount < matchedCount && (
                <Text style={{ fontSize: 11, color: colors.muted, textAlign: "center" }}>
                  {L3("من أصل " + matchedCount + " مستهدفًا — لم يُفعّل الباقون الإشعارات في هواتفهم", "van de " + matchedCount + " beoogde ontvangers — de overigen hebben meldingen niet ingeschakeld", "out of " + matchedCount + " targeted — the rest have not enabled notifications on their phones")}
                </Text>
              )}
            </View>
          )}
        </View>
        <TouchableOpacity onPress={submit} disabled={send.isPending} style={{ backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 14, alignItems: "center", marginTop: 10, opacity: send.isPending ? 0.6 : 1 }}>
          {send.isPending ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>{L3("إرسال", "Verzenden", "Send")}</Text>}
        </TouchableOpacity>

        <View style={{ height: 1, backgroundColor: colors.border, marginTop: 28 }} />

        {label(L3("الرسائل التلقائية المتكررة", "Automatische terugkerende berichten", "Recurring automatic messages"))}
        {hint(L3("تُرسل تلقائيًا حسب فئة الجمهور بمعدل تكرار محدد بالأيام — لا تعمل الجدولة إلا بعد تفعيلها.", "Worden automatisch per doelgroep verstuurd op de gekozen dagen — een planning werkt pas na activering.", "Sent automatically per audience category on the chosen days — a schedule only runs once activated."))}
        <View style={{ gap: 8, marginTop: 8 }}>
          {schedulesQuery.isLoading && <ActivityIndicator size="small" color={colors.muted} />}
          {schedules.map((s) => (
            <View key={s.id} style={{ borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 12, gap: 8 }}>
              <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 8 }}>
                <Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground, flex: 1, textAlign: isRTL ? "right" : "left" }}>{categoryLabel(s.category)}</Text>
                <TouchableOpacity onPress={() => confirmDeleteSchedule(s.id)}>
                  <MaterialIcons name="delete-outline" size={20} color={colors.error} />
                </TouchableOpacity>
              </View>
              {chipRow(
                WEEKDAY_LABELS_AR.map((lbl, i) => ({ key: String(i), label: lbl })),
                parseDaysCsv(s.daysOfWeek),
                (k) => updateScheduleM.mutate({ id: s.id, daysOfWeek: toggleDayInCsv(s.daysOfWeek, k) }),
              )}
              <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 8 }}>
                  <TouchableOpacity onPress={() => updateScheduleM.mutate({ id: s.id, sendHour: (s.sendHour + 23) % 24 })}>
                    <MaterialIcons name="remove-circle-outline" size={20} color={colors.foreground} />
                  </TouchableOpacity>
                  <Text style={{ fontSize: 13, color: colors.foreground }}>{L3("الساعة ", "Om ", "At ") + s.sendHour + ":00"}</Text>
                  <TouchableOpacity onPress={() => updateScheduleM.mutate({ id: s.id, sendHour: (s.sendHour + 1) % 24 })}>
                    <MaterialIcons name="add-circle-outline" size={20} color={colors.foreground} />
                  </TouchableOpacity>
                </View>
                <TouchableOpacity onPress={() => updateScheduleM.mutate({ id: s.id, active: !s.active })}
                  style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 5, backgroundColor: s.active ? colors.primary : colors.surface, borderRadius: 10, paddingVertical: 6, paddingHorizontal: 11, borderWidth: 1, borderColor: s.active ? colors.primary : colors.border }}>
                  <MaterialIcons name={s.active ? "check-box" : "check-box-outline-blank"} size={15} color={s.active ? "#fff" : colors.muted} />
                  <Text style={{ fontSize: 12, fontWeight: "700", color: s.active ? "#fff" : colors.foreground }}>{s.active ? L3("نشطة", "Actief", "Active") : L3("متوقفة", "Gestopt", "Paused")}</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
          {!schedulesQuery.isLoading && schedules.length === 0 && (
            <Text style={{ fontSize: 12, color: colors.muted, textAlign: isRTL ? "right" : "left" }}>{L3("لا توجد جدولات بعد.", "Nog geen planningen.", "No schedules yet.")}</Text>
          )}
        </View>

        {label(L3("إضافة جدولة جديدة", "Nieuwe planning toevoegen", "Add a new schedule"))}
        {availableCategories.length === 0 ? (
          <Text style={{ fontSize: 12, color: colors.muted, textAlign: isRTL ? "right" : "left", marginTop: 8 }}>
            {L3("لكل فئة جدولة بالفعل — عدّل الجدولة الحالية بدل إضافة جديدة.", "Elke categorie heeft al een planning — pas de bestaande aan in plaats van een nieuwe toe te voegen.", "Every category already has a schedule — edit the existing one instead of adding a new one.")}
          </Text>
        ) : (
          chipRow(
            availableCategories.map((c) => ({ key: c.key, label: c.label })),
            newScheduleCategory ? [newScheduleCategory] : [],
            (k) => setNewScheduleCategory(newScheduleCategory === k ? null : (k as CategoryKey)),
          )
        )}
        {availableCategories.length > 0 && (
          <>
            {newScheduleCategory && (
              <Text style={{ fontSize: 11, color: colors.muted, textAlign: isRTL ? "right" : "left", marginTop: 4 }}>
                {L3("سيصل حاليًا إلى " + (newScheduleAudienceQuery.data?.deliverable ?? newScheduleAudienceQuery.data?.count ?? "…") + " مستخدم", "Bereikt nu " + (newScheduleAudienceQuery.data?.deliverable ?? newScheduleAudienceQuery.data?.count ?? "…") + " gebruikers", "Currently reaches " + (newScheduleAudienceQuery.data?.deliverable ?? newScheduleAudienceQuery.data?.count ?? "…") + " users")}
              </Text>
            )}
            {chipRow(
              WEEKDAY_LABELS_AR.map((lbl, i) => ({ key: String(i), label: lbl })),
              newScheduleDays,
              (k) => setNewScheduleDays(parseDaysCsv(toggleDayInCsv(newScheduleDays.join(","), k))),
            )}
            <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 10, marginTop: 10 }}>
              <Text style={{ fontSize: 13, color: colors.foreground }}>{L3("الساعة", "Uur", "Hour")}</Text>
              <TextInput
                value={newScheduleHour}
                onChangeText={setNewScheduleHour}
                keyboardType="number-pad"
                style={{ ...inputStyle, width: 56, marginTop: 0, textAlign: "center", paddingHorizontal: 4 }}
              />
              <TouchableOpacity onPress={() => setNewScheduleActive(!newScheduleActive)}
                style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 5, backgroundColor: newScheduleActive ? colors.primary : colors.surface, borderRadius: 10, paddingVertical: 6, paddingHorizontal: 11, borderWidth: 1, borderColor: newScheduleActive ? colors.primary : colors.border }}>
                <MaterialIcons name={newScheduleActive ? "check-box" : "check-box-outline-blank"} size={15} color={newScheduleActive ? "#fff" : colors.muted} />
                <Text style={{ fontSize: 12, fontWeight: "700", color: newScheduleActive ? "#fff" : colors.foreground }}>{newScheduleActive ? L3("نشطة", "Actief", "Active") : L3("متوقفة", "Gestopt", "Paused")}</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity onPress={addSchedule} disabled={createScheduleM.isPending}
              style={{ backgroundColor: colors.surface, borderRadius: 12, paddingVertical: 12, alignItems: "center", marginTop: 10, borderWidth: 1, borderColor: colors.primary, opacity: createScheduleM.isPending ? 0.6 : 1 }}>
              {createScheduleM.isPending ? <ActivityIndicator color={colors.primary} /> : <Text style={{ color: colors.primary, fontWeight: "700", fontSize: 14 }}>{L3("إضافة جدولة", "Planning toevoegen", "Add schedule")}</Text>}
            </TouchableOpacity>
          </>
        )}

        <View style={{ height: 1, backgroundColor: colors.border, marginTop: 28 }} />

        {label(L3("تقارير الإرسال", "Verzendrapporten", "Send reports"))}
        {hint(L3("آخر الرسائل المتكررة التي أُرسلت فعليًا، وعدد من وصلتهم كل رسالة.", "De laatst daadwerkelijk verzonden terugkerende berichten en hoeveel mensen elk bericht bereikte.", "The latest recurring messages actually sent, and how many people each one reached."))}
        <View style={{ gap: 8, marginTop: 8 }}>
          {sendLogQuery.isLoading && <ActivityIndicator size="small" color={colors.muted} />}
          {sendLog.map((l) => (
            <View key={l.id} style={{ borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, padding: 12, flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <View>
                <Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground, textAlign: isRTL ? "right" : "left" }}>{categoryLabel(l.category)}</Text>
                <Text style={{ fontSize: 11, color: colors.muted, textAlign: isRTL ? "right" : "left", marginTop: 2 }}>{new Date(l.sentAt).toLocaleString(language)}</Text>
              </View>
              <Text style={{ fontSize: 12, fontWeight: "700", color: colors.foreground }}>{l.recipientCount + L3(" مستخدمًا", " gebruikers", " users")}</Text>
            </View>
          ))}
          {!sendLogQuery.isLoading && sendLog.length === 0 && (
            <Text style={{ fontSize: 12, color: colors.muted, textAlign: isRTL ? "right" : "left" }}>{L3("لا توجد عمليات إرسال بعد.", "Nog niets verzonden.", "Nothing sent yet.")}</Text>
          )}
        </View>
      </ScrollView>
    </View>
  );
}
