import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TextInput,
} from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { useState } from "react";
import { useColors } from "@/hooks/use-colors";
import { useRouter } from "expo-router";
import { useAuthContext } from "@/lib/auth-context";
import { getApiBaseUrl } from "@/constants/oauth";
import { useI18n } from "@/lib/i18n";
import { useAppState } from "@/lib/app-context";

import { publicFetch } from "@/lib/authed-fetch";
import {
  buildRegistrationPayload,
  isRegistrationComplete,
} from "@/lib/registration";
import { buildSendVerificationPayload } from "@/lib/verification";
/**
 * Sign-up screen. The app was sign-in only, which left anyone without an
 * account at a dead end — the Play build could not even point them at the
 * website, because rabbaanie.com sells the subscription outside Play billing.
 * Creating the account in-app and landing on /subscribe is the compliant path.
 *
 * It sits behind the age gate by virtue of the router: app/_layout.tsx sends
 * an unclassified visitor to /age-check before any auth route renders.
 */
export default function RegisterScreen() {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const colors = useColors();
  const router = useRouter();
  const { completeTokenSignIn } = useAuthContext();
  const { language } = useI18n();
  const { resetState } = useAppState();

  const isRTL = language === "ar";
  const tx = (nl: string, en: string, ar: string) =>
    language === "ar" ? ar : language === "en" ? en : nl;

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
  const labelStyle = {
    fontSize: 13,
    color: colors.muted,
    writingDirection: (isRTL ? "rtl" : "ltr") as "rtl" | "ltr",
  };

  const fields = { firstName, lastName, email, password };

  const handleRegister = async () => {
    if (!isRegistrationComplete(fields)) {
      setError(
        tx(
          "Vul uw voornaam, achternaam, e-mailadres en wachtwoord in",
          "Please enter your first name, last name, email and password",
          "أدخل اسمك الأول واسم العائلة وبريدك الإلكتروني وكلمة المرور",
        ),
      );
      return;
    }
    // Mirrors the server's own minimum, so a too-short password is rejected
    // here with a clear message instead of coming back as a generic 400.
    if (password.length < 6) {
      setError(
        tx(
          "Wachtwoord moet minstens 6 tekens zijn",
          "Password must be at least 6 characters",
          "كلمة المرور يجب أن تكون ٦ أحرف على الأقل",
        ),
      );
      return;
    }
    if (password !== confirmPassword) {
      setError(
        tx(
          "De wachtwoorden komen niet overeen",
          "The passwords do not match",
          "كلمتا المرور غير متطابقتين",
        ),
      );
      return;
    }

    setError("");
    setLoading(true);
    try {
      const response = await publicFetch(`/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildRegistrationPayload(fields, language)),
      });
      const data = await response.json();

      if (!response.ok || !data?.sessionToken) {
        if (response.status === 409) {
          setError(
            tx(
              "Dit e-mailadres heeft al een account. Log hieronder in.",
              "This email already has an account. Sign in below.",
              "هذا البريد له حساب بالفعل. سجّل الدخول أدناه.",
            ),
          );
          return;
        }
        setError(
          data?.error ||
            tx(
              "Registreren mislukt. Probeer het opnieuw.",
              "Registration failed. Please try again.",
              "فشل إنشاء الحساب. حاول مرة أخرى.",
            ),
        );
        return;
      }

      await completeTokenSignIn(data.sessionToken);
      // Start this account from an empty slate, never from whatever is on the
      // device. A brand-new account has nothing on the server, so
      // rehydrateFromServer() would fall through to its "try local state"
      // branch and adopt the *previous* user's children, birth dates and
      // profile — and skip onboarding, because their onboardingCompleted is
      // true. The sign-out and delete-account buttons already call resetState()
      // for exactly this reason (app/(tabs)/settings.tsx), but a session that
      // ended by token expiry or a crash never passes through them, so the
      // local state can outlive the account that created it.
      await resetState();
      // Hand off to the router's own gate rather than picking a destination:
      // a brand-new account has onboardingCompleted false, so AuthGate's
      // mandatory-profile check (app/_layout.tsx) redirects to /onboarding on
      // the very next render and onboarding always exits to /(tabs). Naming
      // /subscribe here looked purposeful but was overwritten every time.
      // They reach /subscribe from the paywall on any gated screen instead.
      // (That hand-off now starts from /verify-email below instead of
      // /(tabs) directly — its own Verify/Skip actions are what call
      // router.replace("/(tabs)"), so this reasoning still applies there.)
      //
      // Best-effort: registration must not fail, or even wait, on this. A
      // dropped request here is recovered by the "Resend code" button on
      // /verify-email itself.
      try {
        await publicFetch("/auth/send-verification", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildSendVerificationPayload(email)),
        });
      } catch {}
      router.replace(
        ("/verify-email?email=" +
          encodeURIComponent(email.trim().toLowerCase())) as any,
      );
    } catch {
      setError(
        tx(
          "Verbinding mislukt. Controleer uw internet.",
          "Connection failed. Check your internet.",
          "فشل الاتصال. تحقّق من الإنترنت.",
        ),
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScreenContainer>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            justifyContent: "center",
            alignItems: "center",
            padding: 24,
            gap: 20,
          }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={{ alignItems: "center", gap: 6 }}>
            <Text
              style={{
                fontSize: 24,
                fontWeight: "800",
                color: colors.foreground,
                textAlign: "center",
              }}
            >
              {tx("Account aanmaken", "Create account", "إنشاء حساب")}
            </Text>
            <Text
              style={{ fontSize: 13, color: colors.muted, textAlign: "center" }}
            >
              {tx(
                "Maak een account om te abonneren",
                "Create an account to subscribe",
                "أنشئ حسابًا للاشتراك",
              )}
            </Text>
          </View>

          <View style={{ width: "100%", maxWidth: 340, gap: 12 }}>
            {/* Two fields, not one: the server validates the given name and
                the family name separately (rabbaanie-api name-validation.ts),
                and guessing a split out of one free-text box gets Arabic and
                Indonesian compound names wrong — the exact cultures that
                validator was written to accommodate. */}
            <View style={{ gap: 4 }}>
              <Text style={labelStyle}>{tx("Voornaam", "First name", "الاسم الأول")}</Text>
              <TextInput
                value={firstName}
                onChangeText={setFirstName}
                placeholder={tx("Uw voornaam", "Your first name", "اسمك الأول")}
                placeholderTextColor={colors.muted}
                autoCapitalize="words"
                textAlign={isRTL ? "right" : "left"}
                returnKeyType="next"
                style={inputStyle}
              />
            </View>

            <View style={{ gap: 4 }}>
              <Text style={labelStyle}>{tx("Achternaam", "Last name", "اسم العائلة")}</Text>
              <TextInput
                value={lastName}
                onChangeText={setLastName}
                placeholder={tx("Uw achternaam", "Your last name", "اسم عائلتك")}
                placeholderTextColor={colors.muted}
                autoCapitalize="words"
                textAlign={isRTL ? "right" : "left"}
                returnKeyType="next"
                style={inputStyle}
              />
            </View>

            <View style={{ gap: 4 }}>
              <Text style={labelStyle}>
                {tx("E-mailadres", "Email address", "البريد الإلكتروني")}
              </Text>
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder={tx(
                  "uw@email.nl",
                  "your@email.com",
                  "بريدك@مثال.com",
                )}
                placeholderTextColor={colors.muted}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                textAlign={isRTL ? "right" : "left"}
                returnKeyType="next"
                style={inputStyle}
              />
            </View>

            <View style={{ gap: 4 }}>
              <Text style={labelStyle}>
                {tx("Wachtwoord", "Password", "كلمة المرور")}
              </Text>
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder={tx(
                  "Minstens 6 tekens",
                  "At least 6 characters",
                  "٦ أحرف على الأقل",
                )}
                placeholderTextColor={colors.muted}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                textAlign={isRTL ? "right" : "left"}
                returnKeyType="next"
                style={inputStyle}
              />
            </View>

            {/* Confirmation field: the password is masked and this account is
                about to be paid for, so a typo here means a locked-out
                subscriber and a refund request. Catching it costs one field. */}
            <View style={{ gap: 4 }}>
              <Text style={labelStyle}>
                {tx("Wachtwoord herhalen", "Repeat password", "تأكيد كلمة المرور")}
              </Text>
              <TextInput
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder={tx(
                  "Herhaal uw wachtwoord",
                  "Repeat your password",
                  "أعد إدخال كلمة المرور",
                )}
                placeholderTextColor={colors.muted}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                textAlign={isRTL ? "right" : "left"}
                returnKeyType="done"
                onSubmitEditing={handleRegister}
                style={inputStyle}
              />
            </View>

            {error ? (
              <Text
                style={{
                  color: colors.error,
                  fontSize: 13,
                  textAlign: "center",
                  lineHeight: 19,
                }}
              >
                {error}
              </Text>
            ) : null}

            <TouchableOpacity
              onPress={handleRegister}
              disabled={loading}
              style={{
                backgroundColor: colors.primary,
                borderRadius: 10,
                paddingVertical: 14,
                alignItems: "center",
                opacity: loading ? 0.6 : 1,
                minHeight: 48,
                justifyContent: "center",
              }}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>
                  {tx("Account aanmaken", "Create account", "إنشاء حساب")}
                </Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => router.replace("/login" as any)}
              accessibilityRole="link"
              style={{
                minHeight: 44,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text
                style={{ fontSize: 13, color: colors.muted, textAlign: "center" }}
              >
                {tx(
                  "Heeft u al een account? Inloggen",
                  "Already have an account? Sign in",
                  "لديك حساب؟ سجّل الدخول",
                )}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}
