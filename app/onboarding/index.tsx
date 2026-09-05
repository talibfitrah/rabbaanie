import React, { useState, useEffect, useRef } from "react";
import { View, Text, Pressable, TextInput, ScrollView, Alert, Platform, KeyboardAvoidingView, Modal } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/use-colors";
import { useAppState } from "@/lib/app-context";
import { useI18n, Language } from "@/lib/i18n";
import { ChildProfile, isProfileComplete, getFirstIncompleteOnboardingStep, childIdFrom } from "@/lib/store";
import { trpc } from "@/lib/trpc";
import { DatePicker } from "@/components/date-picker";
import { COUNTRIES, COUNTRY_NAMES, getCountryAR, getCityAR } from "@/lib/prayer-data";

function tx(lang: Language, nl: string, en: string, ar: string): string {
  return lang === "ar" ? ar : lang === "en" ? en : nl;
}

/**
 * Onboarding: requires mandatory basic info before app access:
 * Step 1: First name, Last name, Birth date, Address
 * Step 2: Gender (man/vrouw)
 * Step 3: Each child's name (+ optional birthdate) — no auto-generated
 *         placeholder children; see handleChildrenSubmit.
 * Then goes to the main app.
 */
export default function OnboardingScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t, language } = useI18n();
  const { state, addChildren, updateParentProfile, completeOnboarding } = useAppState();
  const setGenderMutation = trpc.links.setMyGender.useMutation();
  const generateMyIdMutation = trpc.links.generateMyId.useMutation();

  // If the profile is already complete, skip this screen entirely (data was
  // restored from server after login). Deliberately does not gate on
  // state.onboardingCompleted first — that flag can be stale on a device
  // that never locally called completeOnboarding() even though the profile
  // itself is fully filled in (e.g. restored from another device).
  // Once the user has STARTED onboarding, a background merge that completes
  // their profile mid-flow must not auto-skip them. fillParentProfileFromServer
  // runs on app open and fills empty local fields from the server copy — for a
  // linked partner that copy can even be the other spouse's data. Without this
  // guard it flipped isProfileComplete true and router.replace'd the user to
  // home while they were still filling the form: "first step works, then I'm
  // thrown back / dumped on home" (c.geldorp/edgar report). The initial
  // restore-from-server skip still works: it fires before any interaction.
  const hasInteracted = useRef(false);
  useEffect(() => {
    if (hasInteracted.current) return;
    if (isProfileComplete({ parentProfile: state.parentProfile, children: state.children })) {
      console.log("[Onboarding] Data already exists, skipping to main app");
      router.replace("/(tabs)");
    }
  }, [state.parentProfile, state.children]);

  const [step, setStep] = useState<"basic" | "gender" | "hasChildren" | "children">(() => {
    const first = getFirstIncompleteOnboardingStep({ parentProfile: state.parentProfile, children: state.children }) || "basic";
    // getFirstIncompleteOnboardingStep returns "children" only when the user has
    // no children AND hasn't declared they have none — exactly when they should
    // meet the "do you have children?" gate first, not the names form. Mapping it
    // here also rescues existing childless users already stranded on that screen.
    return first === "children" ? "hasChildren" : first;
  });
  const [firstName, setFirstName] = useState(state.parentProfile.firstName || "");
  const [lastName, setLastName] = useState(state.parentProfile.lastName || "");
  const [birthDate, setBirthDate] = useState(state.parentProfile.birthDate || "");
  const [country, setCountry] = useState(state.parentProfile.country || "");
  // Start in free-text mode when the stored country is not one the list knows,
  // so a profile saved with "Netherlands" (or from the free-text editor in
  // settings) edits as text instead of silently disagreeing with the picker.
  const [countryFreeText, setCountryFreeText] = useState<boolean>(
    !!state.parentProfile.country && !COUNTRIES[state.parentProfile.country],
  );
  const [city, setCity] = useState(state.parentProfile.city || "");
  // Same escape hatch the country field has, and for the same reason stated
  // above it: the per-country city lists come from the prayer-times data and
  // hold ~20 entries each, so Nederland offers Amsterdam but not Delft. With
  // onboarding gating the whole app and city mandatory, a list-only picker
  // forces anyone outside those 20 to enter a city they do not live in.
  // Starts on when the stored city is not one this country's list knows.
  const [cityFreeText, setCityFreeText] = useState<boolean>(
    !!state.parentProfile.city &&
      !(COUNTRIES[state.parentProfile.country]?.cities ?? []).some(
        (c) => c.name === state.parentProfile.city,
      ),
  );
  const [street, setStreet] = useState(state.parentProfile.street || "");
  const [houseNumber, setHouseNumber] = useState(state.parentProfile.houseNumber || "");
  const [postalCode, setPostalCode] = useState(state.parentProfile.postalCode || "");
  const [addressPicker, setAddressPicker] = useState<"country" | "city" | null>(null);
  const [phoneNumber, setPhoneNumber] = useState(state.parentProfile.phoneNumber || "");
  const [gender, setGender] = useState<"man" | "vrouw" | "">((state.parentProfile.gender as "man" | "vrouw" | "") || "")
  const [maritalStatus, setMaritalStatus] = useState(state.parentProfile.maritalStatus || "");
  // `existing` marks children already saved before this (re-)entry into
  // onboarding. They're shown for context but not removable here — onboarding
  // isn't the child-management screen, and a ✕ that only edits this local list
  // (submit re-adds nothing and deletes nothing for them) would be a lie.
  // Removing a real child is done from the Children tab (removeChild).
  const [childEntries, setChildEntries] = useState<{ name: string; birthDate: string; existing?: boolean }[]>(
    () => state.children.map((c) => ({ name: c.name, birthDate: c.birthDate, existing: true }))
  );
  const [newChildName, setNewChildName] = useState("");
  const [newChildBirthDate, setNewChildBirthDate] = useState("");

  const lang = language;
  const isRTL = lang === "ar";

  const handleBasicSubmit = async () => {
    hasInteracted.current = true;
    if (!firstName.trim()) {
      Alert.alert(tx(lang, "Verplicht", "Required", "مطلوب"), tx(lang, "Voer uw voornaam in", "Enter your first name", "أدخل اسمك الأول"));
      return;
    }
    if (!lastName.trim()) {
      Alert.alert(tx(lang, "Verplicht", "Required", "مطلوب"), tx(lang, "Voer uw achternaam in", "Enter your last name", "أدخل اسم العائلة"));
      return;
    }
    if (!birthDate || !birthDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
      Alert.alert(tx(lang, "Verplicht", "Required", "مطلوب"), tx(lang, "Kies uw geboortedatum", "Select your date of birth", "اختر تاريخ ميلادك"));
      return;
    }
    // Validate the date is reasonable
    const d = new Date(birthDate);
    if (isNaN(d.getTime()) || d.getFullYear() < 1940 || d.getFullYear() > 2010) {
      Alert.alert(tx(lang, "Verplicht", "Required", "مطلوب"), tx(lang, "Voer een geldige geboortedatum in", "Enter a valid birth date", "أدخل تاريخ ميلاد صحيح"));
      return;
    }
    if (!country.trim()) {
      Alert.alert(tx(lang, "Verplicht", "Required", "مطلوب"), tx(lang, "Kies uw land", "Select your country", "اختر بلدك"));
      return;
    }
    if (!city.trim()) {
      Alert.alert(tx(lang, "Verplicht", "Required", "مطلوب"), tx(lang, "Kies uw stad", "Select your city", "اختر مدينتك"));
      return;
    }
    if (!street.trim()) {
      Alert.alert(tx(lang, "Verplicht", "Required", "مطلوب"), tx(lang, "Voer uw straatnaam in", "Enter your street name", "أدخل اسم الشارع"));
      return;
    }
    if (!houseNumber.trim()) {
      Alert.alert(tx(lang, "Verplicht", "Required", "مطلوب"), tx(lang, "Voer uw huisnummer in", "Enter your house number", "أدخل رقم البيت"));
      return;
    }
    // Postal code is intentionally not validated here — it is optional.
    if (!phoneNumber.trim() || phoneNumber.trim().length < 8) {
      Alert.alert(tx(lang, "Verplicht", "Required", "مطلوب"), tx(lang, "Voer uw telefoonnummer in", "Enter your phone number", "أدخل رقم هاتفك"));
      return;
    }
    // Save partial progress. streetHouseNumber/postalCodeCity/address are the
    // legacy combined fields, kept in sync from the new discrete ones so
    // other screens that still read them (e.g. settings.tsx AddressEditor)
    // keep working — see lib/store.ts for the completeness-gate fallback.
    const streetHouseNumber = `${street.trim()} ${houseNumber.trim()}`.trim();
    const postalCodeCity = `${postalCode.trim()} ${city.trim()}`.trim();
    await updateParentProfile({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      birthDate,
      country: country.trim(),
      city: city.trim(),
      street: street.trim(),
      houseNumber: houseNumber.trim(),
      postalCode: postalCode.trim(),
      address: `${streetHouseNumber}, ${postalCodeCity}, ${country.trim()}`,
      streetHouseNumber,
      postalCodeCity,
      phoneNumber: phoneNumber.trim(),
    });
    setStep("gender");
  };

  const handleGenderSubmit = async () => {
    hasInteracted.current = true;
    if (!gender) {
      Alert.alert(tx(lang, "Verplicht", "Required", "مطلوب"), tx(lang, "Kies uw geslacht", "Choose your gender", "اختر: أب أم أم"));
      return;
    }
    if (!maritalStatus) {
      Alert.alert(tx(lang, "Verplicht", "Required", "مطلوب"), tx(lang, "Kies uw burgerlijke staat", "Choose your marital status", "اختر حالتك الاجتماعية"));
      return;
    }
    // Save partial progress
    await updateParentProfile({ gender, maritalStatus });
    setStep("hasChildren");
  };

  const MARITAL_OPTIONS = [
    { value: "getrouwd", label: tx(lang, "Getrouwd", "Married", "متزوّج/ة") },
    { value: "gescheiden", label: tx(lang, "Gescheiden", "Divorced", "مطلّق/ة") },
    { value: "weduwe_weduwnaar", label: tx(lang, "Weduwe/Weduwnaar", "Widowed", "أرمل/ة") },
    { value: "alleenstaand", label: tx(lang, "Alleenstaand", "Single", "أعزب/عزباء") },
  ];

  const handleAddChildEntry = () => {
    hasInteracted.current = true;
    if (!newChildName.trim()) {
      Alert.alert(tx(lang, "Naam vereist", "Name required", "الاسم مطلوب"), tx(lang, "Vul de naam van het kind in", "Please enter the child's name", "يرجى إدخال اسم الطفل"));
      return;
    }
    if (childEntries.length >= 20) {
      Alert.alert(tx(lang, "Fout", "Error", "خطأ"), tx(lang, "U kunt maximaal 20 kinderen toevoegen", "You can add up to 20 children", "يمكنك إضافة 20 طفلاً كحد أقصى"));
      return;
    }
    // The child id is derived from name+birthdate, so two same-named children
    // with no birthdate would share one id (edit/remove would then hit both).
    // Require a birthdate to disambiguate rather than let them collide.
    const name = newChildName.trim();
    const bd = newChildBirthDate || "";
    const newId = childIdFrom(name, bd);
    if (childEntries.some((e) => childIdFrom(e.name, e.birthDate) === newId)) {
      Alert.alert(
        tx(lang, "Al toegevoegd", "Already added", "مُضاف بالفعل"),
        tx(lang, "Voeg een geboortedatum toe om kinderen met dezelfde naam te onderscheiden.", "Add a date of birth to tell children with the same name apart.", "أضف تاريخ ميلاد للتمييز بين طفلين بالاسم نفسه.")
      );
      return;
    }
    setChildEntries((prev) => [...prev, { name, birthDate: bd }]);
    setNewChildName("");
    setNewChildBirthDate("");
  };

  const handleRemoveChildEntry = (index: number) => {
    setChildEntries((prev) => prev.filter((_, i) => i !== index));
  };

  // Shared tail for both onboarding exits (with children, or "no children").
  // Marks complete BEFORE the network calls so a crash mid-call can't leave the
  // "profile complete but flag false" window that used to lock users out, then
  // best-effort function assignment + publicId, then into the app.
  const finishOnboarding = async () => {
    await completeOnboarding();
    // Auto-assign vader/moeder function on server (non-blocking)
    try {
      if (gender === 'man' || gender === 'vrouw') {
        setGenderMutation.mutate({ gender });
      }
    } catch (e) {
      console.log('Auto-assign function failed (non-blocking):', e);
    }
    // Generate the user's distinctive publicId from their birth date (msg 471/476)
    try { await generateMyIdMutation.mutateAsync({ birthDate }); } catch (e) { console.log('generateMyId failed (non-blocking):', e); }
    // Continue into the analytical profile (the tarbiya questionnaire), not home:
    // basic onboarding only sets onboardingCompleted; the *full* profile the app
    // advises on is parentProfileCompleted, which only parent-profile.tsx sets.
    // Dropping to home here dead-ended users after gender/marital/children, so
    // "the rest of the questions" never appeared (Daa3iyah, 2026-09-05).
    router.replace("/onboarding/parent-profile");
  };

  // "Do you have children?" gate, asked before the names screen. Yes → collect
  // names; No → record the declaration and finish with zero children, so a
  // childless married user isn't trapped on a screen they cannot complete.
  const handleHasChildrenYes = () => {
    hasInteracted.current = true;
    setStep("children");
  };
  const handleHasChildrenNo = async () => {
    hasInteracted.current = true;
    await updateParentProfile({ hasNoChildren: true });
    await finishOnboarding();
  };

  const handleChildrenSubmit = async () => {
    hasInteracted.current = true;
    // Fold in a child whose name was typed but not yet "+ Add"ed — tapping the
    // primary button shouldn't silently drop it. Skip it if it duplicates an
    // entry already in the list (same derived id).
    const pendingName = newChildName.trim();
    const effectiveEntries =
      pendingName && childEntries.length < 20 && !childEntries.some((e) => childIdFrom(e.name, e.birthDate) === childIdFrom(pendingName, newChildBirthDate || ""))
        ? [...childEntries, { name: pendingName, birthDate: newChildBirthDate || "" }]
        : childEntries;
    if (effectiveEntries.length === 0) {
      Alert.alert(tx(lang, "Fout", "Error", "خطأ"), tx(lang, "Voeg minstens één kind toe", "Add at least one child", "أضف طفلاً واحدًا على الأقل"));
      return;
    }

    // Create child profiles linked to parent — real, user-entered names only.
    // Same shape as app/add-child.tsx / app/onboarding/add-child.tsx. No more
    // auto-generated "Kind N" placeholders: an unnamed child here would be
    // pruned client-side on next hydrate (see pruneEmptyPlaceholderChildren in
    // lib/store.ts) and, since onboarding is the profile-completeness gate,
    // re-created right back — an infinite loop this shape avoids entirely.
    const parentName = firstName.trim() || "parent";
    const profiles: ChildProfile[] = effectiveEntries.map((entry) => {
      const trimmedName = entry.name.trim();
      return {
        id: childIdFrom(entry.name, entry.birthDate),
        name: trimmedName,
        birthDate: entry.birthDate || "",
        gender: "",
        profileCompleted: false,
        laterInvullen: false,
        parentId: parentName,
      };
    });
    // Onboarding can be re-entered to fill a profile field added after signup,
    // with childEntries pre-seeded from the user's existing children (see the
    // useState initializer). addChildren appends without de-duping, so add only
    // the children that aren't already present — matched by id or name+birthdate
    // — otherwise a pass-through re-entry duplicates every existing child.
    const isExisting = (p: ChildProfile) =>
      state.children.some(
        (c) => c.id === p.id || childIdFrom(c.name, c.birthDate) === childIdFrom(p.name, p.birthDate)
      );
    const newProfiles = profiles.filter((p) => !isExisting(p));
    if (newProfiles.length > 0) {
      await addChildren(newProfiles);
    }

    await finishOnboarding();
  };

  const inputStyle = {
    backgroundColor: colors.surface,
    color: colors.foreground,
    borderWidth: 1,
    borderColor: colors.border,
    textAlign: (isRTL ? "right" : "left") as "left" | "right",
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
    >
    <ScrollView
      // Catch-all "user is actively onboarding" signal: the first touch anywhere
      // on the screen (any field, picker, button) arms the guard, so a background
      // merge completing the profile can never skip-to-home an engaged user. The
      // per-step submit handlers also arm it (covers a keyboard "done" submit
      // that starts no ScrollView touch). See the hasInteracted effect.
      onTouchStart={() => { hasInteracted.current = true; }}
      className="flex-1"
      contentContainerStyle={{
        paddingTop: insets.top + 30,
        paddingBottom: insets.bottom + 80,
        paddingHorizontal: 24,
        flexGrow: 1,
      }}
      keyboardShouldPersistTaps="handled"
    >
      {/* Header */}
      <View className="items-center mb-8">
        <Text className="text-3xl font-bold text-center" style={{ color: colors.primary }}>
          {tx(lang, "Rabbaanie", "Rabbaanie", "ربّانيّ")}
        </Text>
        <Text className="text-base text-center mt-2" style={{ color: colors.muted }}>
          {tx(lang, "Islamitisch opvoedingsprogramma", "Islamic parenting program", "برنامج التربية الإسلامية")}
        </Text>
      </View>

      {/* Progress indicator */}
      <View style={{ flexDirection: isRTL ? "row-reverse" : "row", justifyContent: "center", gap: 8, marginBottom: 24 }}>
        {(() => {
          // "hasChildren" is the front half of the children stage — light the
          // same (3rd) dot for both so the gate adds no visible extra step.
          const stages = ["basic", "gender", "children"];
          const current = step === "hasChildren" ? 2 : stages.indexOf(step);
          return stages.map((s, i) => (
            <View
              key={s}
              style={{
                width: current === i ? 32 : 10,
                height: 10,
                borderRadius: 5,
                backgroundColor: current === i ? colors.primary : (current > i ? colors.primary + "60" : colors.border),
              }}
            />
          ));
        })()}
      </View>

      {/* Step 1: Basic Info */}
      {step === "basic" && (
        <View>
          <Text className="text-xl font-bold mb-2" style={{ color: colors.foreground }}>
            {tx(lang, "Basisgegevens", "Basic Information", "البيانات الأساسية")}
          </Text>
          <Text className="text-sm mb-6" style={{ color: colors.muted }}>
            {tx(lang, "Deze gegevens zijn verplicht om de app te gebruiken.", "This information is required to use the app.", "هذه البيانات مطلوبة لاستخدام التطبيق.")}
          </Text>

          {/* First Name */}
          <Text className="text-sm font-semibold mb-1" style={{ color: colors.foreground }}>
            {tx(lang, "Voornaam", "First Name", "الاسم الأول")} *
          </Text>
          <TextInput
            value={firstName}
            onChangeText={setFirstName}
            placeholder={tx(lang, "Uw voornaam", "Your first name", "اسمك الأول")}
            placeholderTextColor={colors.muted}
            returnKeyType="next"
            className="rounded-xl px-4 py-3 text-base mb-4"
            style={inputStyle}
          />

          {/* Last Name */}
          <Text className="text-sm font-semibold mb-1" style={{ color: colors.foreground }}>
            {tx(lang, "Achternaam", "Last Name", "اسم العائلة")} *
          </Text>
          <TextInput
            value={lastName}
            onChangeText={setLastName}
            placeholder={tx(lang, "Uw achternaam", "Your last name", "اسم عائلتك")}
            placeholderTextColor={colors.muted}
            returnKeyType="next"
            className="rounded-xl px-4 py-3 text-base mb-4"
            style={inputStyle}
          />

          {/* Birth Date */}
          <DatePicker
            value={birthDate}
            onChange={setBirthDate}
            label={tx(lang, "Geboortedatum", "Date of Birth", "تاريخ الميلاد") + " *"}
            placeholder={tx(lang, "Kies uw geboortedatum", "Select your date of birth", "اختر تاريخ ميلادك")}
            maxDate={new Date(2010, 11, 31)}
            minDate={new Date(1940, 0, 1)}
          />
          <View style={{ marginBottom: 16 }} />

          {/* Country */}
          <Text className="text-sm font-semibold mb-1" style={{ color: colors.foreground }}>
            {tx(lang, "Land", "Country", "البلد")} *
          </Text>
          {/* The list holds 14 countries. Making it the ONLY way to set a
              country would bar everyone outside it from ever finishing
              onboarding — and onboarding is now the gate on the whole app, so
              that is a permanent lockout, not an inconvenience. The list stays
              for the common case; "other" falls back to typing it. */}
          {countryFreeText ? (
            <TextInput
              value={country}
              onChangeText={setCountry}
              maxLength={60}
              placeholder={tx(lang, "Uw land", "Your country", "بلدك")}
              placeholderTextColor={colors.muted}
              returnKeyType="next"
              className="rounded-xl px-4 py-3 mb-2"
              style={inputStyle}
            />
          ) : (
            <Pressable
              onPress={() => setAddressPicker("country")}
              className="rounded-xl px-4 py-3 mb-4"
              style={inputStyle}
            >
              <Text style={{ color: country ? colors.foreground : colors.muted, fontSize: 16, textAlign: isRTL ? "right" : "left" }}>
                {country ? (lang === "ar" ? getCountryAR(country) : country) : tx(lang, "Kies uw land", "Select your country", "اختر بلدك")}
              </Text>
            </Pressable>
          )}
          {/* setCityFreeText too: going back to the country picker clears the
              country, and a city left in free-text mode would then render a
              text box where "choose a country first" belongs. */}
          {countryFreeText && (
            <Pressable onPress={() => { setCountryFreeText(false); setCountry(""); setCity(""); setCityFreeText(false); }} className="mb-4">
              <Text style={{ color: colors.primary, fontSize: 13, textAlign: isRTL ? "right" : "left" }}>
                {tx(lang, "Kies uit de lijst", "Choose from the list", "الاختيار من القائمة")}
              </Text>
            </Pressable>
          )}

          {/* City (depends on the chosen country) */}
          <Text className="text-sm font-semibold mb-1" style={{ color: colors.foreground }}>
            {tx(lang, "Stad", "City", "المدينة")} *
          </Text>
          {/* `country &&` matters: COUNTRIES[""] is undefined, so without it a
              brand-new user (country still "") got the free-text box instead of
              the picker — and then choosing a country ran setCity("") and threw
              away what they had typed. It also made the disabled branch below
              ("Kies eerst een land") unreachable. Free text is for a country the
              list does not know, not for no country yet. */}
          {(country && !COUNTRIES[country]) || cityFreeText ? (
            <TextInput
              value={city}
              onChangeText={setCity}
              maxLength={60}
              placeholder={tx(lang, "Uw stad", "Your city", "مدينتك")}
              placeholderTextColor={colors.muted}
              returnKeyType="next"
              className="rounded-xl px-4 py-3 mb-4"
              style={inputStyle}
            />
          ) : (
          <Pressable
            onPress={() => { if (country) setAddressPicker("city"); }}
            className="rounded-xl px-4 py-3 mb-4"
            style={[inputStyle, !country && { opacity: 0.5 }]}
          >
            <Text style={{ color: city ? colors.foreground : colors.muted, fontSize: 16, textAlign: isRTL ? "right" : "left" }}>
              {city
                ? (lang === "ar" ? getCityAR(city) : city)
                : country
                ? tx(lang, "Kies uw stad", "Select your city", "اختر مدينتك")
                : tx(lang, "Kies eerst een land", "Select a country first", "اختر البلد أولاً")}
            </Text>
          </Pressable>
          )}
          {/* Only when this country HAS a list to go back to — a country the
              picker does not know has no city list, so offering "choose from
              the list" there would lead to an empty one. */}
          {cityFreeText && COUNTRIES[country] && (
            <Pressable onPress={() => { setCityFreeText(false); setCity(""); }} className="mb-4">
              <Text style={{ color: colors.primary, fontSize: 13, textAlign: isRTL ? "right" : "left" }}>
                {tx(lang, "Kies uit de lijst", "Choose from the list", "الاختيار من القائمة")}
              </Text>
            </Pressable>
          )}

          {/* Street name.
              These three carry maxLength where the older fields in this form do
              not: profile.save takes z.any() and the column is untyped JSON, so
              nothing downstream bounds them. It costs a prop and stops an
              accidental paste of a whole document becoming a stored profile. */}
          <Text className="text-sm font-semibold mb-1" style={{ color: colors.foreground }}>
            {tx(lang, "Straatnaam", "Street name", "اسم الشارع")} *
          </Text>
          <TextInput
            value={street}
            onChangeText={setStreet}
            maxLength={100}
            placeholder={tx(lang, "Bijv: Kerkstraat", "E.g.: Main Street", "مثال: شارع الملك")}
            placeholderTextColor={colors.muted}
            returnKeyType="next"
            className="rounded-xl px-4 py-3 text-base mb-4"
            style={inputStyle}
          />

          {/* House number */}
          <Text className="text-sm font-semibold mb-1" style={{ color: colors.foreground }}>
            {tx(lang, "Huisnummer", "House number", "رقم البيت")} *
          </Text>
          <TextInput
            value={houseNumber}
            onChangeText={setHouseNumber}
            maxLength={20}
            placeholder={tx(lang, "Bijv: 12", "E.g.: 12", "مثال: 12")}
            placeholderTextColor={colors.muted}
            returnKeyType="next"
            className="rounded-xl px-4 py-3 text-base mb-4"
            style={inputStyle}
          />

          {/* Postal code (optional) */}
          <Text className="text-sm font-semibold mb-1" style={{ color: colors.foreground }}>
            {tx(lang, "Postcode", "Postal code", "الرمز البريدي")}
            <Text style={{ color: colors.muted, fontWeight: "400" }}> ({tx(lang, "optioneel", "optional", "اختياري")})</Text>
          </Text>
          <TextInput
            value={postalCode}
            onChangeText={setPostalCode}
            maxLength={16}
            placeholder={tx(lang, "Bijv: 1012 AB", "E.g.: 1012 AB", "مثال: 1012 AB")}
            placeholderTextColor={colors.muted}
            returnKeyType="next"
            className="rounded-xl px-4 py-3 text-base mb-4"
            style={inputStyle}
          />

          {/* Phone Number */}
          <Text className="text-sm font-semibold mb-1" style={{ color: colors.foreground }}>
            {tx(lang, "Telefoonnummer", "Phone Number", "رقم الهاتف")} *
          </Text>
          <TextInput
            value={phoneNumber}
            onChangeText={setPhoneNumber}
            placeholder={tx(lang, "Bijv: +31612345678", "E.g.: +31612345678", "مثال: +31612345678")}
            placeholderTextColor={colors.muted}
            keyboardType="phone-pad"
            returnKeyType="done"
            className="rounded-xl px-4 py-3 text-base mb-6"
            style={inputStyle}
          />

          <Pressable
            onPress={handleBasicSubmit}
            style={({ pressed }) => [{
              backgroundColor: colors.primary,
              borderRadius: 12,
              paddingVertical: 16,
              alignItems: "center" as const,
              opacity: pressed ? 0.8 : 1,
            }]}
          >
            <Text className="text-white text-lg font-bold">{tx(lang, "Volgende", "Next", "التالي")}</Text>
          </Pressable>
        </View>
      )}

      {/* Step 2: Gender */}
      {step === "gender" && (
        <View>
          <Text className="text-xl font-bold mb-2" style={{ color: colors.foreground }}>
            {tx(lang, "Bent u een man of een vrouw?", "Are you a man or a woman?", "هل أنت الأب أم الأم؟")}
          </Text>
          <Text className="text-sm mb-6" style={{ color: colors.muted }}>
            {tx(lang, "Dit is nodig om de juiste vragen te stellen.", "This is needed to ask the right questions.", "هذا ضروري لتقديم النصائح المناسبة.")}
          </Text>

          <View className="gap-3 mb-8">
            {([
              { value: "man" as const, label: tx(lang, "Man (vader)", "Man (father)", "أب") },
              { value: "vrouw" as const, label: tx(lang, "Vrouw (moeder)", "Woman (mother)", "أم") },
            ]).map((option) => (
              <Pressable
                key={option.value}
                onPress={() => setGender(option.value)}
                style={({ pressed }) => [{
                  backgroundColor: gender === option.value ? colors.primary : colors.surface,
                  borderWidth: 2,
                  borderColor: gender === option.value ? colors.primary : colors.border,
                  borderRadius: 12,
                  paddingVertical: 16,
                  paddingHorizontal: 20,
                  alignItems: "center" as const,
                  opacity: pressed ? 0.8 : 1,
                }]}
              >
                <Text
                  className="text-lg font-bold"
                  style={{ color: gender === option.value ? "#FFFFFF" : colors.foreground }}
                >
                  {option.label}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text className="text-lg font-bold mb-2" style={{ color: colors.foreground }}>
            {tx(lang, "Wat is uw burgerlijke staat?", "What is your marital status?", "ما هي حالتك الاجتماعية؟")}
          </Text>
          <View className="gap-2 mb-8">
            {MARITAL_OPTIONS.map((option) => (
              <Pressable
                key={option.value}
                onPress={() => setMaritalStatus(option.value)}
                style={({ pressed }) => [{
                  backgroundColor: maritalStatus === option.value ? colors.primary : colors.surface,
                  borderWidth: 2,
                  borderColor: maritalStatus === option.value ? colors.primary : colors.border,
                  borderRadius: 12,
                  paddingVertical: 13,
                  paddingHorizontal: 20,
                  alignItems: "center" as const,
                  opacity: pressed ? 0.8 : 1,
                }]}
              >
                <Text className="text-base font-bold" style={{ color: maritalStatus === option.value ? "#FFFFFF" : colors.foreground }}>{option.label}</Text>
              </Pressable>
            ))}
          </View>

          <Pressable
            onPress={handleGenderSubmit}
            style={({ pressed }) => [{
              backgroundColor: gender ? colors.primary : colors.muted,
              borderRadius: 12,
              paddingVertical: 16,
              alignItems: "center" as const,
              opacity: pressed ? 0.8 : 1,
            }]}
          >
            <Text className="text-white text-lg font-bold">{tx(lang, "Volgende", "Next", "التالي")}</Text>
          </Pressable>

          <Pressable
            onPress={() => setStep("basic")}
            style={({ pressed }) => [{ marginTop: 12, alignItems: "center" as const, opacity: pressed ? 0.6 : 1 }]}
          >
            <Text className="text-base" style={{ color: colors.muted }}>{tx(lang, "\u2190 Terug", "\u2190 Back", "\u2192 رجوع")}</Text>
          </Pressable>
        </View>
      )}

      {/* Step 3a: Has children? gate — asked before the names screen so a
          childless married user is never dumped on a form they can't finish. */}
      {step === "hasChildren" && (
        <View>
          <Text className="text-xl font-bold mb-2" style={{ color: colors.foreground }}>
            {tx(lang, "Heeft u kinderen?", "Do you have children?", "هل لديك أبناء؟")}
          </Text>
          <Text className="text-sm mb-6" style={{ color: colors.muted }}>
            {tx(lang, "Zo niet, dan kunt u ze later toevoegen.", "If not, you can add them later.", "إن لم يكونوا لديك الآن، يمكنك إضافتهم لاحقًا.")}
          </Text>

          <Pressable
            onPress={handleHasChildrenYes}
            style={({ pressed }) => [{
              backgroundColor: colors.primary,
              borderRadius: 12,
              paddingVertical: 16,
              alignItems: "center" as const,
              marginBottom: 12,
              opacity: pressed ? 0.8 : 1,
            }]}
          >
            <Text className="text-white text-lg font-bold">{tx(lang, "Ja, ik heb kinderen", "Yes, I have children", "نعم، لديّ أبناء")}</Text>
          </Pressable>

          <Pressable
            onPress={handleHasChildrenNo}
            style={({ pressed }) => [{
              borderWidth: 2,
              borderColor: colors.primary,
              borderRadius: 12,
              paddingVertical: 16,
              alignItems: "center" as const,
              opacity: pressed ? 0.7 : 1,
            }]}
          >
            <Text className="text-lg font-bold" style={{ color: colors.primary }}>{tx(lang, "Nee, nog niet", "No, not yet", "لا، ليس لديّ أبناء بعد")}</Text>
          </Pressable>

          <Pressable
            onPress={() => setStep("gender")}
            style={({ pressed }) => [{ marginTop: 12, alignItems: "center" as const, opacity: pressed ? 0.6 : 1 }]}
          >
            <Text className="text-base" style={{ color: colors.muted }}>{tx(lang, "← Terug", "← Back", "→ رجوع")}</Text>
          </Pressable>
        </View>
      )}

      {/* Step 3: Children */}
      {step === "children" && (
        <View>
          <Text className="text-xl font-bold mb-2" style={{ color: colors.foreground }}>
            {tx(lang, "Wie zijn uw kinderen?", "Who are your children?", "من هم أبناؤك؟")}
          </Text>
          <Text className="text-sm mb-6" style={{ color: colors.muted }}>
            {tx(lang, "Voeg de naam van elk kind toe. Overige gegevens kunt u later invullen.", "Add each child's name. You can fill in the rest later.", "أضف اسم كل طفل. يمكنك إكمال باقي البيانات لاحقًا.")}
          </Text>

          {/* Already-added children */}
          {childEntries.length > 0 && (
            <View className="mb-4" style={{ gap: 8 }}>
              {childEntries.map((entry, index) => (
                <View
                  key={`${childIdFrom(entry.name, entry.birthDate)}_${index}`}
                  style={{
                    flexDirection: isRTL ? "row-reverse" : "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    backgroundColor: colors.surface,
                    borderWidth: 1,
                    borderColor: colors.border,
                    borderRadius: 12,
                    paddingVertical: 12,
                    paddingHorizontal: 16,
                  }}
                >
                  <Text style={{ color: colors.foreground, fontSize: 16, fontWeight: "600", textAlign: isRTL ? "right" : "left" }}>
                    {entry.name}{entry.birthDate ? ` · ${entry.birthDate}` : ""}
                  </Text>
                  {!entry.existing && (
                    <Pressable onPress={() => handleRemoveChildEntry(index)} style={({ pressed }) => [{ padding: 4, opacity: pressed ? 0.6 : 1 }]}>
                      <Text style={{ color: colors.muted, fontSize: 18, fontWeight: "700" }}>{"✕"}</Text>
                    </Pressable>
                  )}
                </View>
              ))}
            </View>
          )}

          {/* New child entry */}
          <Text className="text-sm font-semibold mb-1" style={{ color: colors.foreground }}>
            {tx(lang, "Naam van het kind", "Child's name", "اسم الطفل")}
          </Text>
          <TextInput
            value={newChildName}
            onChangeText={setNewChildName}
            placeholder={tx(lang, "Bijv. Ahmed", "E.g. Ahmed", "مثال: أحمد")}
            placeholderTextColor={colors.muted}
            returnKeyType="done"
            maxLength={100}
            className="rounded-xl px-4 py-3 text-base mb-4"
            style={inputStyle}
          />
          <DatePicker
            value={newChildBirthDate}
            onChange={setNewChildBirthDate}
            label={tx(lang, "Geboortedatum", "Date of birth", "تاريخ الميلاد") + ` (${tx(lang, "optioneel", "optional", "اختياري")})`}
            placeholder={tx(lang, "Kies geboortedatum", "Select date of birth", "اختر تاريخ الميلاد")}
          />
          <View style={{ marginBottom: 12 }} />
          <Pressable
            onPress={handleAddChildEntry}
            style={({ pressed }) => [{
              borderWidth: 2,
              borderColor: colors.primary,
              borderRadius: 12,
              paddingVertical: 14,
              alignItems: "center" as const,
              marginBottom: 24,
              opacity: pressed ? 0.7 : 1,
            }]}
          >
            <Text className="text-base font-bold" style={{ color: colors.primary }}>
              {tx(lang, "+ Kind toevoegen", "+ Add child", "+ إضافة طفل")}
            </Text>
          </Pressable>

          <Pressable
            onPress={handleChildrenSubmit}
            // Enabled when there's an added child OR a name typed but not yet
            // "+ Add"ed — handleChildrenSubmit folds that pending name in, so the
            // single-child user isn't stuck on a greyed button.
            disabled={childEntries.length === 0 && newChildName.trim().length === 0}
            style={({ pressed }) => [{
              backgroundColor: childEntries.length > 0 || newChildName.trim().length > 0 ? colors.primary : colors.muted,
              borderRadius: 12,
              paddingVertical: 16,
              alignItems: "center" as const,
              opacity: pressed ? 0.8 : 1,
            }]}
          >
            <Text className="text-white text-lg font-bold">{tx(lang, "Starten", "Start", "ابدأ الآن")}</Text>
          </Pressable>

          <Pressable
            onPress={() => setStep("hasChildren")}
            style={({ pressed }) => [{ marginTop: 12, alignItems: "center" as const, opacity: pressed ? 0.6 : 1 }]}
          >
            <Text className="text-base" style={{ color: colors.muted }}>{tx(lang, "\u2190 Terug", "\u2190 Back", "\u2192 رجوع")}</Text>
          </Pressable>
        </View>
      )}
    </ScrollView>

    {/* Country / city picker, shared by the two address fields above */}
    <Modal
      visible={addressPicker !== null}
      transparent
      animationType="slide"
      onRequestClose={() => setAddressPicker(null)}
      supportedOrientations={["portrait", "portrait-upside-down", "landscape"]}
    >
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }}>
        <View style={{ backgroundColor: colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: "75%", paddingBottom: insets.bottom + 16 }}>
          <View style={{ flexDirection: isRTL ? "row-reverse" : "row", justifyContent: "space-between", alignItems: "center", padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <Text style={{ fontSize: 17, fontWeight: "700", color: colors.foreground }}>
              {addressPicker === "country"
                ? tx(lang, "Kies uw land", "Select your country", "اختر البلد")
                : tx(lang, "Kies uw stad", "Select your city", "اختر المدينة")}
            </Text>
            <Pressable onPress={() => setAddressPicker(null)}>
              <Text style={{ color: colors.primary, fontSize: 15, fontWeight: "700" }}>{tx(lang, "Sluiten", "Close", "إغلاق")}</Text>
            </Pressable>
          </View>
          <ScrollView style={{ maxHeight: 420 }}>
            {addressPicker === "country" && COUNTRY_NAMES.map((name) => (
              <Pressable
                key={name}
                // Only clear the city when the country actually changes: the
                // city list is per-country, but re-picking the same country —
                // or coming back from typing one by hand — should not silently
                // discard a city already chosen.
                // A different country means a different city list, so drop back
                // to the picker for it — otherwise a free-typed city from the
                // previous country would sit in a box the new list never offers.
                onPress={() => { if (name !== country) { setCity(""); setCityFreeText(false); } setCountry(name); setCountryFreeText(false); setAddressPicker(null); }}
                style={({ pressed }) => [{
                  padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border,
                  backgroundColor: pressed ? colors.primary + "15" : "transparent",
                  flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 10,
                }]}
              >
                <Text style={{ fontSize: 20 }}>{COUNTRIES[name].flag}</Text>
                <Text style={{ color: colors.foreground, fontSize: 15 }}>{lang === "ar" ? getCountryAR(name) : name}</Text>
              </Pressable>
            ))}
            {addressPicker === "country" && (
              <Pressable
                onPress={() => { setCountryFreeText(true); setCountry(""); setCity(""); setAddressPicker(null); }}
                style={({ pressed }) => [{
                  padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border,
                  backgroundColor: pressed ? colors.primary + "15" : "transparent",
                }]}
              >
                <Text style={{ color: colors.primary, fontSize: 15, fontWeight: "600", textAlign: isRTL ? "right" : "left" }}>
                  {tx(lang, "Ander land — zelf invullen", "Other country — type it", "بلد آخر — اكتبه بنفسك")}
                </Text>
              </Pressable>
            )}
            {/* Optional chaining, not COUNTRIES[country].cities: `country` is
                seeded from stored profile data and from a free-text editor in
                settings, so it can hold a value this map has never heard of —
                "Netherlands" instead of "Nederland" is enough. Unguarded, that
                threw on open and the error boundary's "try again" remounted the
                same broken state, so the picker could never be opened again. */}
            {addressPicker === "city" && (COUNTRIES[country]?.cities ?? []).map((c) => (
              <Pressable
                key={c.name}
                onPress={() => { setCity(c.name); setAddressPicker(null); }}
                style={({ pressed }) => [{
                  padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border,
                  backgroundColor: pressed ? colors.primary + "15" : "transparent",
                }]}
              >
                <Text style={{ color: colors.foreground, fontSize: 15, textAlign: isRTL ? "right" : "left" }}>
                  {lang === "ar" ? getCityAR(c.name) : c.name}
                </Text>
              </Pressable>
            ))}
            {addressPicker === "city" && (
              <Pressable
                onPress={() => { setCityFreeText(true); setCity(""); setAddressPicker(null); }}
                style={({ pressed }) => [{
                  padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border,
                  backgroundColor: pressed ? colors.primary + "15" : "transparent",
                }]}
              >
                <Text style={{ color: colors.primary, fontSize: 15, fontWeight: "600", textAlign: isRTL ? "right" : "left" }}>
                  {tx(lang, "Andere stad — zelf invullen", "Other city — type it", "مدينة أخرى — اكتبها بنفسك")}
                </Text>
              </Pressable>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
    </KeyboardAvoidingView>
  );
}
