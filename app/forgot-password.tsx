import { Text, View, TextInput, TouchableOpacity, ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { useState } from "react";
import { useColors } from "@/hooks/use-colors";
import { useRouter } from "expo-router";
import { getApiBaseUrl } from "@/constants/oauth";
import { useI18n } from "@/lib/i18n";

import { publicFetch } from "@/lib/authed-fetch";
/**
 * Forgot Password Screen - 2 steps:
 * 1. Enter email → sends reset code via Brevo
 * 2. Enter code + new password → resets password
 */
export default function ForgotPasswordScreen() {
  const [step, setStep] = useState<1 | 2>(1);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const colors = useColors();
  const router = useRouter();
  const { language } = useI18n();

  const isRTL = language === "ar";

  function tx(nl: string, en: string, ar: string) {
    if (language === "ar") return ar;
    if (language === "en") return en;
    return nl;
  }

  async function handleRequestCode() {
    if (!email.trim()) {
      setError(tx("Vul uw e-mailadres in", "Please enter your email", "أدخل بريدك الإلكتروني"));
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await publicFetch(`/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      const data = await res.json();
      if (data.success) {
        setStep(2);
        Alert.alert(
          tx("Code verstuurd", "Code sent", "تم إرسال الرمز"),
          tx(
            "Als het e-mailadres bestaat, is er een code verstuurd. Controleer uw inbox.",
            "If the email exists, a reset code has been sent. Check your inbox.",
            "إذا كان البريد الإلكتروني موجوداً، فقد تم إرسال رمز إعادة التعيين. تحقق من بريدك الوارد."
          )
        );
      } else {
        setError(data.error || tx("Er is iets misgegaan", "Something went wrong", "حدث خطأ ما"));
      }
    } catch (e: any) {
      setError(tx("Netwerkfout", "Network error", "خطأ في الشبكة"));
    } finally {
      setLoading(false);
    }
  }

  async function handleResetPassword() {
    if (!code.trim()) {
      setError(tx("Vul de code in", "Please enter the code", "أدخل الرمز"));
      return;
    }
    if (!newPassword.trim() || newPassword.length < 6) {
      setError(tx("Wachtwoord moet minimaal 6 tekens zijn", "Password must be at least 6 characters", "يجب أن تكون كلمة المرور 6 أحرف على الأقل"));
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(tx("Wachtwoorden komen niet overeen", "Passwords do not match", "كلمات المرور غير متطابقة"));
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await publicFetch(`/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          code: code.trim(),
          newPassword,
        }),
      });
      const data = await res.json();
      if (data.success) {
        Alert.alert(
          tx("Gelukt!", "Success!", "تم بنجاح!"),
          tx(
            "Uw wachtwoord is gewijzigd. U kunt nu inloggen.",
            "Your password has been changed. You can now sign in.",
            "تم تغيير كلمة المرور. يمكنك الآن تسجيل الدخول."
          ),
          [{ text: "OK", onPress: () => router.back() }]
        );
      } else {
        setError(data.error || tx("Ongeldige code", "Invalid code", "رمز غير صالح"));
      }
    } catch (e: any) {
      setError(tx("Netwerkfout", "Network error", "خطأ في الشبكة"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: 24 }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={{ gap: 24, maxWidth: 400, width: "100%", alignSelf: "center" }}>
            {/* Header */}
            <View style={{ alignItems: "center", gap: 8 }}>
              <Text style={{ fontSize: 24, fontWeight: "700", color: colors.foreground, textAlign: "center" }}>
                {tx("Wachtwoord vergeten", "Forgot Password", "نسيت كلمة المرور")}
              </Text>
              <Text style={{ fontSize: 14, color: colors.muted, textAlign: "center", lineHeight: 20 }}>
                {step === 1
                  ? tx(
                      "Voer uw e-mailadres in om een herstelcode te ontvangen.",
                      "Enter your email to receive a reset code.",
                      "أدخل بريدك الإلكتروني لتلقي رمز إعادة التعيين."
                    )
                  : tx(
                      "Voer de code in die u per e-mail heeft ontvangen.",
                      "Enter the code you received by email.",
                      "أدخل الرمز الذي تلقيته عبر البريد الإلكتروني."
                    )}
              </Text>
            </View>

            {/* Step 1: Email */}
            {step === 1 && (
              <View style={{ gap: 16 }}>
                <View style={{ gap: 4 }}>
                  <Text style={{ fontSize: 13, color: colors.muted, writingDirection: isRTL ? "rtl" : "ltr" }}>
                    {tx("E-mailadres", "Email address", "البريد الإلكتروني")}
                  </Text>
                  <TextInput
                    value={email}
                    onChangeText={setEmail}
                    placeholder="email@example.com"
                    placeholderTextColor={colors.muted}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoComplete="email"
                    textAlign={isRTL ? "right" : "left"}
                    returnKeyType="done"
                    onSubmitEditing={handleRequestCode}
                    style={{
                      backgroundColor: colors.surface,
                      borderRadius: 10,
                      paddingHorizontal: 14,
                      paddingVertical: 12,
                      fontSize: 15,
                      color: colors.foreground,
                      borderWidth: 1,
                      borderColor: colors.border,
                    }}
                  />
                </View>

                {error ? (
                  <Text style={{ color: colors.error, fontSize: 13, textAlign: "center" }}>{error}</Text>
                ) : null}

                <TouchableOpacity
                  onPress={handleRequestCode}
                  disabled={loading}
                  activeOpacity={0.8}
                  style={{
                    backgroundColor: colors.primary,
                    borderRadius: 10,
                    paddingVertical: 14,
                    alignItems: "center",
                    opacity: loading ? 0.7 : 1,
                  }}
                >
                  {loading ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <Text style={{ fontSize: 15, fontWeight: "600", color: "#ffffff" }}>
                      {tx("Verstuur code", "Send code", "إرسال الرمز")}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            )}

            {/* Step 2: Code + New Password */}
            {step === 2 && (
              <View style={{ gap: 16 }}>
                {/* Code Input */}
                <View style={{ gap: 4 }}>
                  <Text style={{ fontSize: 13, color: colors.muted, writingDirection: isRTL ? "rtl" : "ltr" }}>
                    {tx("Herstelcode", "Reset code", "رمز إعادة التعيين")}
                  </Text>
                  <TextInput
                    value={code}
                    onChangeText={setCode}
                    placeholder="123456"
                    placeholderTextColor={colors.muted}
                    keyboardType="number-pad"
                    maxLength={6}
                    textAlign="center"
                    style={{
                      backgroundColor: colors.surface,
                      borderRadius: 10,
                      paddingHorizontal: 14,
                      paddingVertical: 12,
                      fontSize: 24,
                      fontWeight: "700",
                      letterSpacing: 8,
                      color: colors.foreground,
                      borderWidth: 1,
                      borderColor: colors.border,
                    }}
                  />
                </View>

                {/* New Password */}
                <View style={{ gap: 4 }}>
                  <Text style={{ fontSize: 13, color: colors.muted, writingDirection: isRTL ? "rtl" : "ltr" }}>
                    {tx("Nieuw wachtwoord", "New password", "كلمة المرور الجديدة")}
                  </Text>
                  <View style={{ position: "relative" }}>
                    <TextInput
                      value={newPassword}
                      onChangeText={setNewPassword}
                      placeholder="••••••••"
                      placeholderTextColor={colors.muted}
                      secureTextEntry={!showPassword}
                      autoCapitalize="none"
                      textAlign={isRTL ? "right" : "left"}
                      style={{
                        backgroundColor: colors.surface,
                        borderRadius: 10,
                        paddingHorizontal: 14,
                        paddingVertical: 12,
                        paddingRight: 48,
                        fontSize: 15,
                        color: colors.foreground,
                        borderWidth: 1,
                        borderColor: colors.border,
                      }}
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
                    onSubmitEditing={handleResetPassword}
                    style={{
                      backgroundColor: colors.surface,
                      borderRadius: 10,
                      paddingHorizontal: 14,
                      paddingVertical: 12,
                      fontSize: 15,
                      color: colors.foreground,
                      borderWidth: 1,
                      borderColor: colors.border,
                    }}
                  />
                </View>

                {error ? (
                  <Text style={{ color: colors.error, fontSize: 13, textAlign: "center" }}>{error}</Text>
                ) : null}

                <TouchableOpacity
                  onPress={handleResetPassword}
                  disabled={loading}
                  activeOpacity={0.8}
                  style={{
                    backgroundColor: colors.primary,
                    borderRadius: 10,
                    paddingVertical: 14,
                    alignItems: "center",
                    opacity: loading ? 0.7 : 1,
                  }}
                >
                  {loading ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <Text style={{ fontSize: 15, fontWeight: "600", color: "#ffffff" }}>
                      {tx("Wachtwoord wijzigen", "Reset password", "إعادة تعيين كلمة المرور")}
                    </Text>
                  )}
                </TouchableOpacity>

                {/* Resend code */}
                <TouchableOpacity
                  onPress={handleRequestCode}
                  activeOpacity={0.6}
                  style={{ alignSelf: "center", marginTop: 8 }}
                >
                  <Text style={{ fontSize: 13, color: colors.primary }}>
                    {tx("Code opnieuw versturen", "Resend code", "إعادة إرسال الرمز")}
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Back to login */}
            <TouchableOpacity
              onPress={() => router.back()}
              activeOpacity={0.6}
              style={{ alignSelf: "center", marginTop: 8 }}
            >
              <Text style={{ fontSize: 14, color: colors.muted }}>
                {tx("Terug naar inloggen", "Back to sign in", "العودة لتسجيل الدخول")}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}
