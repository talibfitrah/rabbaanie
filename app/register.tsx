import { View, Text, TouchableOpacity, ActivityIndicator, Image, Platform, ScrollView, KeyboardAvoidingView, TextInput } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { useState } from "react";
import { useColors } from "@/hooks/use-colors";
import { useRouter } from "expo-router";
import { useAuthContext } from "@/lib/auth-context";
import { getApiBaseUrl } from "@/constants/oauth";
import * as Auth from "@/lib/_core/auth";
import { useI18n } from "@/lib/i18n";
import { useAppState } from "@/lib/app-context";

type SocialStatus = "married" | "divorced" | "widowed" | "single_male" | "single_female" | "";
type Role = "father" | "mother" | "";

/**
 * Registration Screen
 * Multi-step registration: basic info → role & status → address
 * All data sent to api.rabbaanie.com/auth/register
 */
export default function RegisterScreen() {
  // Step management
  const [step, setStep] = useState(1); // 1=basic, 2=role+status, 3=address

  // Step 1: Basic info
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Step 2: Role & Social status
  const [role, setRole] = useState<Role>("");
  const [socialStatus, setSocialStatus] = useState<SocialStatus>("");

  // Step 3: Address
  const [streetHouseNumber, setStreetHouseNumber] = useState("");
  const [postalCodeCity, setPostalCodeCity] = useState("");
  const [country, setCountry] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const colors = useColors();
  const router = useRouter();
  const { setAuthState } = useAuthContext();
  const { language } = useI18n();
  const { rehydrateFromServer } = useAppState();

  const isRTL = language === "ar";

  const tx = (nl: string, en: string, ar: string) => {
    return language === "ar" ? ar : language === "en" ? en : nl;
  };

  const validateStep1 = (): boolean => {
    if (!name.trim()) {
      setError(tx("Vul uw naam in", "Please enter your name", "أدخل اسمك"));
      return false;
    }
    if (!email.trim()) {
      setError(tx("Vul uw e-mailadres in", "Please enter your email", "أدخل بريدك الإلكتروني"));
      return false;
    }
    if (!password || password.length < 6) {
      setError(tx(
        "Wachtwoord moet minimaal 6 tekens bevatten",
        "Password must be at least 6 characters",
        "كلمة المرور يجب أن تكون 6 أحرف على الأقل"
      ));
      return false;
    }
    if (password !== confirmPassword) {
      setError(tx(
        "Wachtwoorden komen niet overeen",
        "Passwords do not match",
        "كلمتا المرور غير متطابقتين"
      ));
      return false;
    }
    return true;
  };

  const validateStep2 = (): boolean => {
    if (!role) {
      setError(tx("Selecteer uw rol", "Please select your role", "اختر دورك"));
      return false;
    }
    if (!socialStatus) {
      setError(tx("Selecteer uw burgerlijke staat", "Please select your social status", "اختر حالتك الاجتماعية"));
      return false;
    }
    return true;
  };

  const handleNext = () => {
    setError("");
    if (step === 1 && validateStep1()) {
      setStep(2);
    } else if (step === 2 && validateStep2()) {
      setStep(3);
    }
  };

  const handleBack = () => {
    setError("");
    if (step > 1) setStep(step - 1);
  };

  const handleRegister = async () => {
    setError("");
    setLoading(true);
    try {
      const apiBase = getApiBaseUrl();
      const response = await fetch(`${apiBase}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim().toLowerCase(),
          password,
          role,
          socialStatus,
          address: {
            streetHouseNumber: streetHouseNumber.trim(),
            postalCodeCity: postalCodeCity.trim(),
            country: country.trim(),
          },
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 409) {
          setError(tx(
            "Dit e-mailadres is al geregistreerd",
            "This email is already registered",
            "هذا البريد الإلكتروني مسجّل بالفعل"
          ));
        } else {
          setError(data.error || data.message || "Registration failed");
        }
        return;
      }

      // Success: data has { success, sessionToken, user }
      const { sessionToken, user: userData } = data;
      if (!sessionToken) {
        setError("Registration response missing token");
        return;
      }
      const user: Auth.User = {
        id: userData.id,
        openId: userData.openId || `email_${userData.id}`,
        name: userData.name || name,
        email: userData.email || email,
        loginMethod: "email",
        lastSignedIn: new Date(),
      };

      await setAuthState(user, sessionToken);
      await rehydrateFromServer();
      router.replace("/(tabs)");
    } catch (err: any) {
      console.error("[Register] Error:", err);
      setError(tx(
        "Verbindingsfout. Controleer uw internetverbinding.",
        "Connection error. Check your internet connection.",
        "خطأ في الاتصال. تحقق من اتصالك بالإنترنت."
      ));
    } finally {
      setLoading(false);
    }
  };

  // Social status options based on role
  const socialStatusOptions: { value: SocialStatus; label: string }[] = role === "father"
    ? [
        { value: "married", label: tx("Getrouwd", "Married", "متزوج") },
        { value: "divorced", label: tx("Gescheiden", "Divorced", "مطلّق") },
        { value: "widowed", label: tx("Weduwnaar", "Widowed", "أرمل") },
        { value: "single_male", label: tx("Ongehuwd", "Single (never married)", "أعزب لم أتزوج من قبل") },
      ]
    : [
        { value: "married", label: tx("Getrouwd", "Married", "متزوجة") },
        { value: "divorced", label: tx("Gescheiden", "Divorced", "مطلّقة") },
        { value: "widowed", label: tx("Weduwe", "Widowed", "أرملة") },
        { value: "single_female", label: tx("Ongehuwd", "Single (never married)", "عزباء لم أتزوج من قبل") },
      ];

  const roleOptions: { value: Role; label: string }[] = [
    { value: "father", label: tx("Vader", "Father", "أب") },
    { value: "mother", label: tx("Moeder", "Mother", "أم") },
  ];

  const renderStep1 = () => (
    <View style={{ gap: 12 }}>
      {/* Name */}
      <View style={{ gap: 4 }}>
        <Text style={{ fontSize: 13, color: colors.muted, writingDirection: isRTL ? "rtl" : "ltr" }}>
          {tx("Volledige naam", "Full name", "الاسم الكامل")}
        </Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder={tx("Uw naam", "Your name", "اسمك")}
          placeholderTextColor={colors.muted}
          autoCapitalize="words"
          textAlign={isRTL ? "right" : "left"}
          returnKeyType="next"
          style={inputStyle}
        />
      </View>

      {/* Email */}
      <View style={{ gap: 4 }}>
        <Text style={{ fontSize: 13, color: colors.muted, writingDirection: isRTL ? "rtl" : "ltr" }}>
          {tx("E-mailadres", "Email address", "البريد الإلكتروني")}
        </Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder={tx("uw@email.nl", "your@email.com", "بريدك@مثال.com")}
          placeholderTextColor={colors.muted}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          textAlign={isRTL ? "right" : "left"}
          returnKeyType="next"
          style={inputStyle}
        />
      </View>

      {/* Password */}
      <View style={{ gap: 4 }}>
        <Text style={{ fontSize: 13, color: colors.muted, writingDirection: isRTL ? "rtl" : "ltr" }}>
          {tx("Wachtwoord", "Password", "كلمة المرور")}
        </Text>
        <View style={{ position: "relative" }}>
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder={tx("Min. 6 tekens", "Min. 6 characters", "6 أحرف على الأقل")}
            placeholderTextColor={colors.muted}
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            textAlign={isRTL ? "right" : "left"}
            returnKeyType="next"
            style={{ ...inputStyle, paddingRight: 48 }}
          />
          <TouchableOpacity
            onPress={() => setShowPassword(!showPassword)}
            style={{ position: "absolute", right: 12, top: 12 }}
            activeOpacity={0.6}
          >
            <Text style={{ fontSize: 13, color: colors.primary }}>
              {showPassword ? tx("Verberg", "Hide", "إخفاء") : tx("Toon", "Show", "إظهار")}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Confirm Password */}
      <View style={{ gap: 4 }}>
        <Text style={{ fontSize: 13, color: colors.muted, writingDirection: isRTL ? "rtl" : "ltr" }}>
          {tx("Bevestig wachtwoord", "Confirm password", "تأكيد كلمة المرور")}
        </Text>
        <TextInput
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          placeholder="••••••••"
          placeholderTextColor={colors.muted}
          secureTextEntry={!showPassword}
          autoCapitalize="none"
          textAlign={isRTL ? "right" : "left"}
          returnKeyType="done"
          style={inputStyle}
        />
      </View>
    </View>
  );

  const renderStep2 = () => (
    <View style={{ gap: 16 }}>
      {/* Role Selection */}
      <View style={{ gap: 8 }}>
        <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground, writingDirection: isRTL ? "rtl" : "ltr" }}>
          {tx("Uw rol", "Your role", "دورك")}
        </Text>
        <View style={{ flexDirection: "row", gap: 10 }}>
          {roleOptions.map((opt) => (
            <TouchableOpacity
              key={opt.value}
              onPress={() => { setRole(opt.value); setSocialStatus(""); }}
              activeOpacity={0.7}
              style={{
                flex: 1,
                paddingVertical: 14,
                borderRadius: 10,
                alignItems: "center",
                backgroundColor: role === opt.value ? colors.primary : colors.surface,
                borderWidth: 1,
                borderColor: role === opt.value ? colors.primary : colors.border,
              }}
            >
              <Text style={{
                fontSize: 15,
                fontWeight: "600",
                color: role === opt.value ? "#ffffff" : colors.foreground,
              }}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Social Status Selection */}
      {role ? (
        <View style={{ gap: 8 }}>
          <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground, writingDirection: isRTL ? "rtl" : "ltr" }}>
            {tx("Burgerlijke staat", "Social status", "الحالة الاجتماعية")}
          </Text>
          <View style={{ gap: 8 }}>
            {socialStatusOptions.map((opt) => (
              <TouchableOpacity
                key={opt.value}
                onPress={() => setSocialStatus(opt.value)}
                activeOpacity={0.7}
                style={{
                  paddingVertical: 12,
                  paddingHorizontal: 16,
                  borderRadius: 10,
                  backgroundColor: socialStatus === opt.value ? colors.primary : colors.surface,
                  borderWidth: 1,
                  borderColor: socialStatus === opt.value ? colors.primary : colors.border,
                }}
              >
                <Text style={{
                  fontSize: 14,
                  color: socialStatus === opt.value ? "#ffffff" : colors.foreground,
                  textAlign: isRTL ? "right" : "left",
                }}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );

  const renderStep3 = () => (
    <View style={{ gap: 12 }}>
      <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground, writingDirection: isRTL ? "rtl" : "ltr", marginBottom: 4 }}>
        {tx("Adresgegevens", "Address details", "بيانات العنوان")}
      </Text>
      <Text style={{ fontSize: 12, color: colors.muted, writingDirection: isRTL ? "rtl" : "ltr", marginBottom: 4 }}>
        {tx("(optioneel - u kunt dit later invullen)", "(optional - you can fill this in later)", "(اختياري - يمكنك ملؤه لاحقاً)")}
      </Text>

      {/* Street + House Number */}
      <View style={{ gap: 4 }}>
        <Text style={{ fontSize: 13, color: colors.muted, writingDirection: isRTL ? "rtl" : "ltr" }}>
          {tx("Straat en huisnummer", "Street and house number", "الشارع ورقم المنزل")}
        </Text>
        <TextInput
          value={streetHouseNumber}
          onChangeText={setStreetHouseNumber}
          placeholder={tx("Voorbeeldstraat 12", "Example Street 12", "شارع المثال 12")}
          placeholderTextColor={colors.muted}
          textAlign={isRTL ? "right" : "left"}
          returnKeyType="next"
          style={inputStyle}
        />
      </View>

      {/* Postal Code + City */}
      <View style={{ gap: 4 }}>
        <Text style={{ fontSize: 13, color: colors.muted, writingDirection: isRTL ? "rtl" : "ltr" }}>
          {tx("Postcode en plaats", "Postal code and city", "الرمز البريدي والمدينة")}
        </Text>
        <TextInput
          value={postalCodeCity}
          onChangeText={setPostalCodeCity}
          placeholder={tx("1234 AB Amsterdam", "1234 AB Amsterdam", "1234 AB أمستردام")}
          placeholderTextColor={colors.muted}
          textAlign={isRTL ? "right" : "left"}
          returnKeyType="next"
          style={inputStyle}
        />
      </View>

      {/* Country */}
      <View style={{ gap: 4 }}>
        <Text style={{ fontSize: 13, color: colors.muted, writingDirection: isRTL ? "rtl" : "ltr" }}>
          {tx("Land", "Country", "البلد")}
        </Text>
        <TextInput
          value={country}
          onChangeText={setCountry}
          placeholder={tx("Nederland", "Netherlands", "هولندا")}
          placeholderTextColor={colors.muted}
          textAlign={isRTL ? "right" : "left"}
          returnKeyType="done"
          style={inputStyle}
        />
      </View>
    </View>
  );

  const inputStyle = {
    backgroundColor: colors.surface,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.foreground,
    borderWidth: 1,
    borderColor: colors.border,
  };

  const stepTitles = [
    tx("Basisgegevens", "Basic info", "البيانات الأساسية"),
    tx("Rol & Status", "Role & Status", "الدور والحالة"),
    tx("Adres", "Address", "العنوان"),
  ];

  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
          <View style={{ flex: 1, paddingHorizontal: 24, paddingVertical: 32 }}>
            {/* Header */}
            <View style={{ alignItems: "center", gap: 6, marginBottom: 24 }}>
              <Text style={{ fontSize: 20, fontWeight: "bold", color: colors.foreground, textAlign: "center" }}>
                {tx("Account aanmaken", "Create account", "إنشاء حساب")}
              </Text>
              {/* Step indicator */}
              <View style={{ flexDirection: "row", gap: 6, marginTop: 8 }}>
                {[1, 2, 3].map((s) => (
                  <View
                    key={s}
                    style={{
                      width: step === s ? 24 : 8,
                      height: 8,
                      borderRadius: 4,
                      backgroundColor: step >= s ? colors.primary : colors.border,
                    }}
                  />
                ))}
              </View>
              <Text style={{ fontSize: 13, color: colors.muted, marginTop: 4 }}>
                {tx("Stap", "Step", "خطوة")} {step}/3: {stepTitles[step - 1]}
              </Text>
            </View>

            {/* Form Content */}
            <View style={{ width: "100%", maxWidth: 340, alignSelf: "center" }}>
              {step === 1 && renderStep1()}
              {step === 2 && renderStep2()}
              {step === 3 && renderStep3()}

              {/* Error message */}
              {error ? (
                <Text style={{ color: colors.error, fontSize: 13, textAlign: "center", marginTop: 12 }}>
                  {error}
                </Text>
              ) : null}

              {/* Navigation Buttons */}
              <View style={{ flexDirection: "row", gap: 12, marginTop: 24 }}>
                {step > 1 && (
                  <TouchableOpacity
                    onPress={handleBack}
                    activeOpacity={0.7}
                    style={{
                      flex: 1,
                      paddingVertical: 14,
                      borderRadius: 10,
                      alignItems: "center",
                      backgroundColor: colors.surface,
                      borderWidth: 1,
                      borderColor: colors.border,
                    }}
                  >
                    <Text style={{ fontSize: 15, fontWeight: "500", color: colors.foreground }}>
                      {tx("Vorige", "Back", "السابق")}
                    </Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  onPress={step === 3 ? handleRegister : handleNext}
                  disabled={loading}
                  activeOpacity={0.8}
                  style={{
                    flex: 1,
                    paddingVertical: 14,
                    borderRadius: 10,
                    alignItems: "center",
                    backgroundColor: colors.primary,
                    opacity: loading ? 0.7 : 1,
                  }}
                >
                  {loading ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <Text style={{ fontSize: 15, fontWeight: "600", color: "#ffffff" }}>
                      {step === 3
                        ? tx("Registreren", "Register", "تسجيل")
                        : tx("Volgende", "Next", "التالي")}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>

              {/* Back to Login */}
              <View style={{ alignItems: "center", marginTop: 20 }}>
                <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7}>
                  <Text style={{ fontSize: 14, color: colors.muted }}>
                    {tx("Al een account? ", "Already have an account? ", "لديك حساب بالفعل؟ ")}
                    <Text style={{ color: colors.primary, fontWeight: "600" }}>
                      {tx("Inloggen", "Sign in", "تسجيل الدخول")}
                    </Text>
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}
