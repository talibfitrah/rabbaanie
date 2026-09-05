import React, { useState, useEffect } from "react";
import { View, Text, Pressable, TextInput, ScrollView, Alert, Platform, KeyboardAvoidingView } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/use-colors";
import { useAppState } from "@/lib/app-context";
import { useAuthContext } from "@/lib/auth-context";
import { useI18n, Language } from "@/lib/i18n";
import { ChildProfile, otherParentTier, childParentFields } from "@/lib/store";
import { DatePicker } from "@/components/date-picker";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { trpc } from "@/lib/trpc";
import { PremiumGate } from "@/components/premium-notice";

function tx(lang: Language, nl: string, en: string, ar: string): string {
  return lang === "ar" ? ar : lang === "en" ? en : nl;
}

function AddChildScreenInner() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { language } = useI18n();
  const lang = language as Language;
  const { addChild, updateChild, state } = useAppState();
  const { user } = useAuthContext();

  // Edit mode: /add-child?childId=<id> reuses this create screen instead of
  // building a second one, so the mother/father pickers below (and their fix
  // for the motherId-attribution bug — see childParentFields in lib/store.ts)
  // apply to an existing child too, not just a new one.
  const { childId } = useLocalSearchParams<{ childId?: string }>();
  const editingChild = childId ? state?.children?.find((c) => c.id === childId) : undefined;

  const [name, setName] = useState(editingChild?.name || "");
  const [gender, setGender] = useState<"jongen" | "meisje" | "">(editingChild?.gender || "");
  const [birthDate, setBirthDate] = useState(editingChild?.birthDate || "");
  const [bsn, setBsn] = useState("");
  const [saving, setSaving] = useState(false);

  // Auto-link to network when BSN is provided
  const linkChildMutation = trpc.links.linkChildByPublicId.useMutation();

  // Polygamy Phase 2: who is this child's other parent? Tiers (see
  // otherParentTier in lib/store.ts): 0 confirmed co-parents -> nothing
  // shown; exactly 1 -> pre-filled default; 2+ -> a pick (required for a
  // man choosing which wife is the mother; optional, with a plain-name
  // escape hatch, for a woman choosing the father).
  const coParentsQuery = trpc.links.coParents.useQuery(undefined, { refetchOnMount: "always" });
  const coParents: { id: number; name: string | null }[] = coParentsQuery.data ?? [];
  const viewerGender = state?.parentProfile?.gender || "man";
  const otherTier = otherParentTier(viewerGender, coParents.length);
  const [fatherChoice, setFatherChoice] = useState<number | "external" | null>(
    editingChild?.fatherId ?? (editingChild?.externalFatherName ? "external" : null),
  );
  const [externalFatherNameInput, setExternalFatherNameInput] = useState(editingChild?.externalFatherName || "");
  const [motherChoice, setMotherChoice] = useState<number | null>(editingChild?.motherId ?? null);
  const [showOtherFather, setShowOtherFather] = useState(false);

  // Pre-fills the single-co-parent default once it loads. A plain effect,
  // not lazy useState init, since coParents resolves async after mount.
  useEffect(() => {
    if (otherTier !== "single") return;
    const onlyId = coParents[0]?.id;
    if (onlyId == null) return;
    if (viewerGender === "man") setMotherChoice((prev) => (prev == null ? onlyId : prev));
    else setFatherChoice((prev) => (prev == null ? onlyId : prev));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otherTier, coParents[0]?.id, viewerGender]);

  // The useState initializers above run once at mount. If state.children
  // hydrates AFTER mount (a cold-start / restored-navigation deep-link to
  // /add-child?childId=…), editingChild was undefined then, so the form stayed
  // blank under an "Edit" header. Seed it once the child resolves — guarded on
  // the form still being pristine, so it never clobbers a user's own typing.
  useEffect(() => {
    if (!editingChild || name !== "" || birthDate !== "" || gender !== "") return;
    setName(editingChild.name || "");
    setGender(editingChild.gender || "");
    setBirthDate(editingChild.birthDate || "");
    setMotherChoice(editingChild.motherId ?? null);
    setFatherChoice(editingChild.fatherId ?? (editingChild.externalFatherName ? "external" : null));
    setExternalFatherNameInput(editingChild.externalFatherName || "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingChild?.id]);

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert(
        tx(lang, "Naam vereist", "Name required", "الاسم مطلوب"),
        tx(lang, "Vul de naam van het kind in", "Please enter the child's name", "يرجى إدخال اسم الطفل")
      );
      return;
    }
    if (otherTier === "choose-required" && motherChoice == null) {
      Alert.alert(
        tx(lang, "Kies de moeder", "Choose the mother", "اختر الأم"),
        tx(lang, "Selecteer welke van uw echtgenotes de moeder van dit kind is.", "Select which of your wives is this child's mother.", "اختر أي من زوجاتك هي أم هذا الطفل.")
      );
      return;
    }
    setSaving(true);
    // Generate deterministic ID from name + birthdate for consistent parent-child linking.
    // Editing keeps the existing id — the point is to correct this child's
    // record in place, never to fork a second one.
    const childIdBase = editingChild
      ? editingChild.id
      : `${name.trim().toLowerCase().replace(/\s+/g, "_")}_${(birthDate || "unknown").replace(/-/g, "")}`;
    const child: ChildProfile = {
      id: childIdBase,
      name: name.trim(),
      birthDate: birthDate || "",
      gender: gender || "",
      profileCompleted: !!(name && birthDate && gender),
      laterInvullen: false,
      parentId: editingChild?.parentId || state?.parentProfile?.firstName || "parent",
      // A woman can switch the father between a co-parent and an external
      // name; childParentFields emits only the field she picked, so on an
      // edit clear BOTH father fields first (updateChild shallow-merges, so a
      // stale one would otherwise survive) and let childParentFields re-add
      // her choice. Only when the father picker is actually loaded/usable
      // (otherTier !== "skip"), so a save before co-parents resolve can't wipe
      // a synced value. A man needs NO clear: he only switches the mother to
      // another wife (childParentFields re-emits motherId, overwriting in
      // place) and his father is always himself — clearing would risk wiping a
      // still-correct motherId when the picker hasn't loaded (cubic P2).
      ...(viewerGender !== "man" && otherTier !== "skip"
        ? { fatherId: undefined, externalFatherName: undefined }
        : {}),
      ...childParentFields({
        viewerGender,
        viewerOwnId: user?.id ?? null,
        motherChoice,
        fatherChoice,
        externalFatherName: externalFatherNameInput,
      }),
    };
    if (editingChild) {
      await updateChild(editingChild.id, child);
    } else {
      await addChild(child);
      // If BSN/ID is provided, auto-link to network (create only — an
      // already-added child isn't re-run through this on an edit save)
      if (bsn.trim()) {
        try {
          await linkChildMutation.mutateAsync({ childPublicId: bsn.trim(), relationship: "parent" });
        } catch (e) {
          // Non-blocking - child is still added locally, suppress error message
        }
      }
    }
    setSaving(false);
    Alert.alert(
      tx(lang, "Opgeslagen", "Saved", "تم الحفظ"),
      editingChild
        ? tx(lang, "De gegevens van het kind zijn bijgewerkt.", "The child's details have been updated.", "تم تحديث بيانات الطفل.")
        : tx(lang, "Kind is toegevoegd, met Gods hulp.", "Child has been added, by God's grace.", "تم الحفظ بعون الله."),
      [{ text: tx(lang, "OK", "OK", "حسنًا"), onPress: () => router.back() }]
    );
  };

  const isRTL = lang === "ar";

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 16, paddingBottom: 12, flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", borderBottomWidth: 0.5, borderBottomColor: colors.border }}>
        <Pressable onPress={() => router.back()} style={({ pressed }) => [{ padding: 8, opacity: pressed ? 0.6 : 1 }]}>
          <MaterialIcons name={isRTL ? "arrow-forward" : "arrow-back"} size={24} color={colors.foreground} />
        </Pressable>
        <Text style={{ flex: 1, textAlign: "center", fontSize: 18, fontWeight: "700", color: colors.foreground }}>
          {editingChild
            ? tx(lang, "Kind bewerken", "Edit Child", "تعديل الطفل")
            : tx(lang, "Kind toevoegen", "Add Child", "إضافة طفل")}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 80 }} keyboardShouldPersistTaps="handled">
        {/* Name */}
        <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground, marginBottom: 6, textAlign: isRTL ? "right" : "left" }}>
          {tx(lang, "Naam van het kind", "Child's name", "اسم الطفل")} *
        </Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder={tx(lang, "Bijv. Ahmed", "E.g. Ahmed", "مثال: أحمد")}
          placeholderTextColor={colors.muted}
          style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 14, fontSize: 16, color: colors.foreground, textAlign: isRTL ? "right" : "left", marginBottom: 20 }}
          returnKeyType="done"
        />

        {/* Gender */}
        <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground, marginBottom: 6, textAlign: isRTL ? "right" : "left" }}>
          {tx(lang, "Geslacht", "Gender", "الجنس")}
        </Text>
        <View style={{ flexDirection: isRTL ? "row-reverse" : "row", gap: 12, marginBottom: 20 }}>
          <Pressable
            onPress={() => setGender("jongen")}
            style={({ pressed }) => [{ flex: 1, paddingVertical: 14, borderRadius: 10, borderWidth: 2, borderColor: gender === "jongen" ? "#1565C0" : colors.border, backgroundColor: gender === "jongen" ? "#E3F2FD" : colors.surface, alignItems: "center", opacity: pressed ? 0.8 : 1 }]}
          >
            <MaterialIcons name="face-6" size={28} color={gender === "jongen" ? "#1565C0" : colors.muted} />
            <Text style={{ marginTop: 4, fontSize: 13, fontWeight: "600", color: gender === "jongen" ? "#1565C0" : colors.foreground }}>
              {tx(lang, "Jongen", "Boy", "ولد")}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setGender("meisje")}
            style={({ pressed }) => [{ flex: 1, paddingVertical: 14, borderRadius: 10, borderWidth: 2, borderColor: gender === "meisje" ? "#E91E63" : colors.border, backgroundColor: gender === "meisje" ? "#FCE4EC" : colors.surface, alignItems: "center", opacity: pressed ? 0.8 : 1 }]}
          >
            <MaterialIcons name="face-3" size={28} color={gender === "meisje" ? "#E91E63" : colors.muted} />
            <Text style={{ marginTop: 4, fontSize: 13, fontWeight: "600", color: gender === "meisje" ? "#E91E63" : colors.foreground }}>
              {tx(lang, "Meisje", "Girl", "بنت")}
            </Text>
          </Pressable>
        </View>

        {/* Birth Date */}
        <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground, marginBottom: 6, textAlign: isRTL ? "right" : "left" }}>
          {tx(lang, "Geboortedatum", "Date of birth", "تاريخ الميلاد")}
        </Text>
        <DatePicker
          value={birthDate}
          onChange={setBirthDate}
          placeholder={tx(lang, "Selecteer datum", "Select date", "اختر التاريخ")}
        />
        <View style={{ height: 20 }} />

        {/* Polygamy Phase 2: who is the other parent? Hidden entirely with
            0 confirmed co-parents (otherTier === "skip") — nothing to
            attribute to yet. */}
        {otherTier !== "skip" && (
          <>
            <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground, marginBottom: 6, textAlign: isRTL ? "right" : "left" }}>
              {viewerGender === "man"
                ? tx(lang, "Moeder van dit kind", "Mother of this child", "أم هذا الطفل")
                : tx(lang, "Vader van dit kind", "Father of this child", "أبو هذا الطفل")}
              {otherTier === "choose-required" ? " *" : ""}
            </Text>

            {otherTier === "single" && (
              <View style={{ backgroundColor: colors.primary + "15", borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, alignSelf: isRTL ? "flex-end" : "flex-start", marginBottom: 8 }}>
                <Text style={{ color: colors.primary, fontSize: 13, fontWeight: "600" }}>
                  {coParents[0]?.name || tx(lang, "Echtgeno(o)t(e)", "Spouse", "الزوج/ة")}
                </Text>
              </View>
            )}

            {viewerGender !== "man" && otherTier === "single" && (
              <Pressable onPress={() => setShowOtherFather((v) => !v)} style={{ marginBottom: 8 }}>
                <Text style={{ fontSize: 12, color: colors.primary, fontWeight: "600", textDecorationLine: "underline" }}>
                  {showOtherFather
                    ? tx(lang, "Toch de hierboven getoonde vader", "Use the spouse shown above after all", "استخدم الزوج المذكور أعلاه")
                    : tx(lang, "Iemand anders?", "Someone else?", "شخص آخر؟")}
                </Text>
              </Pressable>
            )}

            {viewerGender !== "man" && (otherTier === "choose-optional" || (otherTier === "single" && showOtherFather)) && (
              <View style={{ marginBottom: 8 }}>
                {coParents.length > 0 && (
                  <View style={{ flexDirection: isRTL ? "row-reverse" : "row", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
                    {coParents.map((p) => (
                      <Pressable
                        key={p.id}
                        onPress={() => { setFatherChoice(p.id); setExternalFatherNameInput(""); }}
                        style={{ backgroundColor: fatherChoice === p.id ? colors.primary : colors.primary + "12", borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 }}
                      >
                        <Text style={{ color: fatherChoice === p.id ? "#fff" : colors.primary, fontSize: 12, fontWeight: "600" }}>
                          {p.name || tx(lang, "Echtgeno(o)t(e)", "Spouse", "الزوج/ة")}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                )}
                <TextInput
                  value={fatherChoice === "external" ? externalFatherNameInput : ""}
                  onChangeText={(v) => { setExternalFatherNameInput(v); setFatherChoice(v.trim() ? "external" : null); }}
                  placeholder={tx(lang, "Of typ een naam (bijv. vorige echtgenoot)", "Or type a name (e.g. previous husband)", "أو اكتب اسمًا (مثلاً الزوج السابق)")}
                  placeholderTextColor={colors.muted}
                  style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12, fontSize: 14, color: colors.foreground, textAlign: isRTL ? "right" : "left" }}
                />
              </View>
            )}

            {viewerGender === "man" && otherTier === "choose-required" && (
              <View style={{ flexDirection: isRTL ? "row-reverse" : "row", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
                {coParents.map((p) => (
                  <Pressable
                    key={p.id}
                    onPress={() => setMotherChoice(p.id)}
                    style={{ backgroundColor: motherChoice === p.id ? colors.primary : colors.primary + "12", borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, borderWidth: motherChoice === p.id ? 0 : 1, borderColor: colors.primary + "40" }}
                  >
                    <Text style={{ color: motherChoice === p.id ? "#fff" : colors.primary, fontSize: 12, fontWeight: "600" }}>
                      {p.name || tx(lang, "Echtgenote", "Wife", "الزوجة")}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}
            <View style={{ height: 12 }} />
          </>
        )}

        {/* BSN / Identity Number — create only; an already-added child's
            network link isn't re-run from an edit save. */}
        {!editingChild && (
          <>
            <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground, marginBottom: 6, textAlign: isRTL ? "right" : "left" }}>
              {tx(lang, "BSN / ID-nummer", "BSN / ID number", "رقم الهوية / BSN")}
            </Text>
            <TextInput
              value={bsn}
              onChangeText={setBsn}
              placeholder={tx(lang, "Optioneel", "Optional", "اختياري")}
              placeholderTextColor={colors.muted}
              keyboardType="number-pad"
              style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 14, fontSize: 16, color: colors.foreground, textAlign: isRTL ? "right" : "left", marginBottom: 8 }}
              returnKeyType="done"
            />
            <Text style={{ fontSize: 11, color: colors.muted, textAlign: isRTL ? "right" : "left", marginBottom: 20 }}>
              {tx(lang, "Bij het invullen van het BSN wordt het kind automatisch gekoppeld aan uw netwerk", "When BSN is entered, the child will be automatically linked to your network", "عند إدخال رقم الهوية سيتم ربط الطفل تلقائياً بشبكتك")}
            </Text>
          </>
        )}

        {/* Save Button */}
        <Pressable
          onPress={handleSave}
          disabled={saving}
          style={({ pressed }) => [{ backgroundColor: "#1B4332", paddingVertical: 16, borderRadius: 12, alignItems: "center", opacity: pressed || saving ? 0.7 : 1, marginTop: 10 }]}
        >
          <Text style={{ color: "#fff", fontSize: 16, fontWeight: "700" }}>
            {saving
              ? tx(lang, "Opslaan...", "Saving...", "جاري الحفظ...")
              : editingChild
                ? tx(lang, "Wijzigingen opslaan", "Save changes", "حفظ التغييرات")
                : tx(lang, "Kind toevoegen", "Add Child", "إضافة طفل")}
          </Text>
        </Pressable>
      </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

/**
 * Paid feature: advertised on the subscribe screen, so it is closed to
 * non-subscribers rather than shown with a banner over it. Wrapping rather
 * than an early return means every return path inside is covered, and the
 * inner component's hooks never run for a non-subscriber.
 */
export default function AddChildScreen() {
  return (
    <PremiumGate>
      <AddChildScreenInner />
    </PremiumGate>
  );
}
