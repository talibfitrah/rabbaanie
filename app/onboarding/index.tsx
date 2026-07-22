import React, { useState, useEffect } from "react";
import { View, Text, Pressable, TextInput, ScrollView, Alert, Platform, KeyboardAvoidingView } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/use-colors";
import { useAppState } from "@/lib/app-context";
import { useI18n, Language } from "@/lib/i18n";
import { ChildProfile } from "@/lib/store";
import { trpc } from "@/lib/trpc";
import { DatePicker } from "@/components/date-picker";

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

  // If the user already has completed onboarding and has basic info,
  // skip this screen entirely (data was restored from server after login)
  useEffect(() => {
    if (
      state.onboardingCompleted &&
      state.parentProfile.firstName &&
      state.parentProfile.lastName &&
      state.parentProfile.birthDate &&
      (state.parentProfile.streetHouseNumber || state.parentProfile.address) &&
      state.parentProfile.gender &&
      state.parentProfile.phoneNumber
    ) {
      console.log("[Onboarding] Data already exists, skipping to main app");
      router.replace("/(tabs)");
    }
  }, [state.onboardingCompleted, state.parentProfile]);

  const [step, setStep] = useState<"basic" | "gender" | "children">("basic");
  const [firstName, setFirstName] = useState(state.parentProfile.firstName || "");
  const [lastName, setLastName] = useState(state.parentProfile.lastName || "");
  const [birthDate, setBirthDate] = useState(state.parentProfile.birthDate || "");
  const [streetHouseNumber, setStreetHouseNumber] = useState(state.parentProfile.streetHouseNumber || "");
  const [postalCodeCity, setPostalCodeCity] = useState(state.parentProfile.postalCodeCity || "");
  const [country, setCountry] = useState(state.parentProfile.country || "");
  const [phoneNumber, setPhoneNumber] = useState(state.parentProfile.phoneNumber || "");
  const [gender, setGender] = useState<"man" | "vrouw" | "">((state.parentProfile.gender as "man" | "vrouw" | "") || "")
  const [childCount, setChildCount] = useState(state.children.length > 0 ? String(state.children.length) : "");

  const lang = language;
  const isRTL = lang === "ar";

  const handleBasicSubmit = () => {
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
    if (!streetHouseNumber.trim()) {
      Alert.alert(tx(lang, "Verplicht", "Required", "مطلوب"), tx(lang, "Voer uw straat en huisnummer in", "Enter your street and house number", "أدخل الشارع ورقم البيت"));
      return;
    }
    if (!postalCodeCity.trim()) {
      Alert.alert(tx(lang, "Verplicht", "Required", "مطلوب"), tx(lang, "Voer uw postcode en stad in", "Enter your postal code and city", "أدخل الرمز البريدي والمدينة"));
      return;
    }
    if (!country.trim()) {
      Alert.alert(tx(lang, "Verplicht", "Required", "مطلوب"), tx(lang, "Voer uw land in", "Enter your country", "أدخل البلد"));
      return;
    }
    if (!phoneNumber.trim() || phoneNumber.trim().length < 8) {
      Alert.alert(tx(lang, "Verplicht", "Required", "مطلوب"), tx(lang, "Voer uw telefoonnummer in", "Enter your phone number", "أدخل رقم هاتفك"));
      return;
    }
    setStep("gender");
  };

  const handleGenderSubmit = () => {
    if (!gender) {
      Alert.alert(tx(lang, "Verplicht", "Required", "مطلوب"), tx(lang, "Kies uw geslacht", "Choose your gender", "اختر: أب أم أم"));
      return;
    }
    setStep("children");
  };

  const handleChildrenSubmit = async () => {
    const count = parseInt(childCount);
    if (!count || count < 1 || count > 20) {
      Alert.alert(tx(lang, "Fout", "Error", "خطأ"), tx(lang, "Voer een geldig aantal kinderen in (1-20)", "Enter a valid number of children (1-20)", "أدخل عددًا صحيحًا (1-20)"));
      return;
    }

    // Save all basic info to parent profile
    await updateParentProfile({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      birthDate,
      address: `${streetHouseNumber.trim()}, ${postalCodeCity.trim()}, ${country.trim()}`,
      streetHouseNumber: streetHouseNumber.trim(),
      postalCodeCity: postalCodeCity.trim(),
      country: country.trim(),
      phoneNumber: phoneNumber.trim(),
      gender,
    });

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

    // Auto-assign vader/moeder function on server
    try {
      if (gender === 'man' || gender === 'vrouw') {
        setGenderMutation.mutate({ gender });
      }
    } catch (e) {
      // Non-blocking: function assignment is best-effort
      console.log('Auto-assign function failed (non-blocking):', e);
    }

    // Mark onboarding as completed
    await completeOnboarding();

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
          {tx(lang, "Opvoedadvies", "Parenting Advice", "المستشار التربوي")}
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

          {/* Street & House Number */}
          <Text className="text-sm font-semibold mb-1" style={{ color: colors.foreground }}>
            {tx(lang, "Straat en huisnummer", "Street & House number", "الشارع ورقم البيت")} *
          </Text>
          <TextInput
            value={streetHouseNumber}
            onChangeText={setStreetHouseNumber}
            placeholder={tx(lang, "Bijv: Kerkstraat 12", "E.g.: Main Street 12", "مثال: شارع الملك 12")}
            placeholderTextColor={colors.muted}
            returnKeyType="next"
            className="rounded-xl px-4 py-3 text-base mb-4"
            style={inputStyle}
          />

          {/* Postal Code & City */}
          <Text className="text-sm font-semibold mb-1" style={{ color: colors.foreground }}>
            {tx(lang, "Postcode en stad", "Postal code & City", "الرمز البريدي والمدينة")} *
          </Text>
          <TextInput
            value={postalCodeCity}
            onChangeText={setPostalCodeCity}
            placeholder={tx(lang, "Bijv: 1012 AB Amsterdam", "E.g.: 1012 AB Amsterdam", "مثال: 1012 AB أمستردام")}
            placeholderTextColor={colors.muted}
            returnKeyType="next"
            className="rounded-xl px-4 py-3 text-base mb-4"
            style={inputStyle}
          />

          {/* Country */}
          <Text className="text-sm font-semibold mb-1" style={{ color: colors.foreground }}>
            {tx(lang, "Land", "Country", "البلد")} *
          </Text>
          <TextInput
            value={country}
            onChangeText={setCountry}
            placeholder={tx(lang, "Bijv: Nederland", "E.g.: Netherlands", "مثال: هولندا")}
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
    </KeyboardAvoidingView>
  );
}
