import React, { useState, useEffect } from "react";
import { View, Text, Pressable, TextInput, ScrollView, Alert, Platform, KeyboardAvoidingView, Modal } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/use-colors";
import { useAppState } from "@/lib/app-context";
import { useI18n, Language } from "@/lib/i18n";
import { ChildProfile, isProfileComplete, getFirstIncompleteOnboardingStep } from "@/lib/store";
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
 * Step 3: Number of children
 * Then creates empty child profiles and goes to the main app.
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
  useEffect(() => {
    if (isProfileComplete({ parentProfile: state.parentProfile, children: state.children })) {
      console.log("[Onboarding] Data already exists, skipping to main app");
      router.replace("/(tabs)");
    }
  }, [state.parentProfile, state.children]);

  const [step, setStep] = useState<"basic" | "gender" | "children">(
    () => getFirstIncompleteOnboardingStep({ parentProfile: state.parentProfile, children: state.children }) || "basic"
  );
  const [firstName, setFirstName] = useState(state.parentProfile.firstName || "");
  const [lastName, setLastName] = useState(state.parentProfile.lastName || "");
  const [birthDate, setBirthDate] = useState(state.parentProfile.birthDate || "");
  const [country, setCountry] = useState(state.parentProfile.country || "");
  const [city, setCity] = useState(state.parentProfile.city || "");
  const [street, setStreet] = useState(state.parentProfile.street || "");
  const [houseNumber, setHouseNumber] = useState(state.parentProfile.houseNumber || "");
  const [postalCode, setPostalCode] = useState(state.parentProfile.postalCode || "");
  const [addressPicker, setAddressPicker] = useState<"country" | "city" | null>(null);
  const [phoneNumber, setPhoneNumber] = useState(state.parentProfile.phoneNumber || "");
  const [gender, setGender] = useState<"man" | "vrouw" | "">((state.parentProfile.gender as "man" | "vrouw" | "") || "")
  const [maritalStatus, setMaritalStatus] = useState(state.parentProfile.maritalStatus || "");
  const [childCount, setChildCount] = useState(state.children.length > 0 ? String(state.children.length) : "");

  const lang = language;
  const isRTL = lang === "ar";

  const handleBasicSubmit = async () => {
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
    setStep("children");
  };

  const MARITAL_OPTIONS = [
    { value: "getrouwd", label: tx(lang, "Getrouwd", "Married", "متزوّج/ة") },
    { value: "gescheiden", label: tx(lang, "Gescheiden", "Divorced", "مطلّق/ة") },
    { value: "weduwe_weduwnaar", label: tx(lang, "Weduwe/Weduwnaar", "Widowed", "أرمل/ة") },
    { value: "alleenstaand", label: tx(lang, "Alleenstaand", "Single", "أعزب/عزباء") },
  ];

  const handleChildrenSubmit = async () => {
    const count = parseInt(childCount);
    if (!count || count < 1 || count > 20) {
      Alert.alert(tx(lang, "Fout", "Error", "خطأ"), tx(lang, "Voer een geldig aantal kinderen in (1-20)", "Enter a valid number of children (1-20)", "أدخل عددًا صحيحًا (1-20)"));
      return;
    }

    // Create child profiles linked to parent
    const parentName = firstName.trim() || "parent";
    const profiles: ChildProfile[] = Array.from({ length: count }, (_, index) => ({
      id: `${parentName.toLowerCase().replace(/\s+/g, "_")}_child_${index + 1}_${Date.now()}`,
      name: tx(lang, `Kind ${index + 1}`, `Child ${index + 1}`, `طفل ${index + 1}`),
      birthDate: "",
      gender: "",
      profileCompleted: false,
      laterInvullen: true,
      parentId: parentName,
    }));
    await addChildren(profiles);

    // Mark onboarding as completed — before the network calls below, so a
    // crash during either of them can no longer leave "profile complete,
    // flag false" (see the profile-completion-gate fix history: that window
    // used to be reachable and, before the gate fix, could lock a user out).
    await completeOnboarding();

    // Auto-assign vader/moeder function on server
    try {
      if (gender === 'man' || gender === 'vrouw') {
        setGenderMutation.mutate({ gender });
      }
    } catch (e) {
      // Non-blocking: function assignment is best-effort
      console.log('Auto-assign function failed (non-blocking):', e);
    }

    // Generate the user's distinctive publicId from their birth date (msg 471/476)
    try { await generateMyIdMutation.mutateAsync({ birthDate }); } catch (e) { console.log('generateMyId failed (non-blocking):', e); }

    // Go to main app
    router.replace("/(tabs)");
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
      <View style={{ flexDirection: "row", justifyContent: "center", gap: 8, marginBottom: 24 }}>
        {["basic", "gender", "children"].map((s, i) => (
          <View
            key={s}
            style={{
              width: step === s ? 32 : 10,
              height: 10,
              borderRadius: 5,
              backgroundColor: step === s ? colors.primary : (["basic", "gender", "children"].indexOf(step) > i ? colors.primary + "60" : colors.border),
            }}
          />
        ))}
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
            isRTL={isRTL}
            maxDate={new Date(2010, 11, 31)}
            minDate={new Date(1940, 0, 1)}
          />
          <View style={{ marginBottom: 16 }} />

          {/* Country */}
          <Text className="text-sm font-semibold mb-1" style={{ color: colors.foreground }}>
            {tx(lang, "Land", "Country", "البلد")} *
          </Text>
          <Pressable
            onPress={() => setAddressPicker("country")}
            className="rounded-xl px-4 py-3 mb-4"
            style={inputStyle}
          >
            <Text style={{ color: country ? colors.foreground : colors.muted, fontSize: 16, textAlign: isRTL ? "right" : "left" }}>
              {country ? (lang === "ar" ? getCountryAR(country) : country) : tx(lang, "Kies uw land", "Select your country", "اختر بلدك")}
            </Text>
          </Pressable>

          {/* City (depends on the chosen country) */}
          <Text className="text-sm font-semibold mb-1" style={{ color: colors.foreground }}>
            {tx(lang, "Stad", "City", "المدينة")} *
          </Text>
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

          {/* Street name */}
          <Text className="text-sm font-semibold mb-1" style={{ color: colors.foreground }}>
            {tx(lang, "Straatnaam", "Street name", "اسم الشارع")} *
          </Text>
          <TextInput
            value={street}
            onChangeText={setStreet}
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

      {/* Step 3: Children */}
      {step === "children" && (
        <View>
          <Text className="text-xl font-bold mb-2" style={{ color: colors.foreground }}>
            {tx(lang, "Hoeveel kinderen heeft u?", "How many children do you have?", "كم عدد أبنائك؟")}
          </Text>
          <Text className="text-sm mb-6" style={{ color: colors.muted }}>
            {tx(lang, "U kunt de gegevens van uw kinderen later invullen.", "You can fill in your children's details later.", "يمكنك إكمال بيانات أبنائك لاحقًا.")}
          </Text>
          <TextInput
            value={childCount}
            onChangeText={setChildCount}
            placeholder={tx(lang, "Aantal kinderen", "Number of children", "عدد الأبناء")}
            placeholderTextColor={colors.muted}
            keyboardType="number-pad"
            returnKeyType="done"
            className="rounded-xl px-4 py-4 text-lg mb-6"
            style={inputStyle}
          />
          <Pressable
            onPress={handleChildrenSubmit}
            style={({ pressed }) => [{
              backgroundColor: colors.primary,
              borderRadius: 12,
              paddingVertical: 16,
              alignItems: "center" as const,
              opacity: pressed ? 0.8 : 1,
            }]}
          >
            <Text className="text-white text-lg font-bold">{tx(lang, "Starten", "Start", "ابدأ الآن")}</Text>
          </Pressable>

          <Pressable
            onPress={() => setStep("gender")}
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
                onPress={() => { setCountry(name); setCity(""); setAddressPicker(null); }}
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
            {addressPicker === "city" && country && COUNTRIES[country].cities.map((c) => (
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
          </ScrollView>
        </View>
      </View>
    </Modal>
    </KeyboardAvoidingView>
  );
}
