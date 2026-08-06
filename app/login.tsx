import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  Platform,
  ScrollView,
  KeyboardAvoidingView,
  TextInput,
  Linking,
} from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { useState } from "react";
import { useColors } from "@/hooks/use-colors";
import { useRouter } from "expo-router";
import { useAuthContext } from "@/lib/auth-context";
import { getApiBaseUrl } from "@/constants/oauth";
import { useI18n } from "@/lib/i18n";
import { useAppState } from "@/lib/app-context";
import {
  completeNativeGoogleSignIn,
  GoogleSignInError,
} from "@/lib/google-oauth";
import Svg, { Path } from "react-native-svg";

const SUPPORT_EMAIL = "support@albunyaan.tv";

/**
 * Login Screen - Email/Password + Google Sign-In
 * Email/password is exchanged directly with the API. Google authentication
 * uses Google's Android-native identity flow and a server-verified ID token.
 */
export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [twoFactorChallenge, setTwoFactorChallenge] = useState("");
  const [twoFactorCode, setTwoFactorCode] = useState("");
  // Where the code came from, so the prompt matches reality. The server says
  // which; this initial value is only ever replaced before the field renders.
  const [twoFactorMethod, setTwoFactorMethod] = useState<"app" | "email">(
    "email",
  );
  const colors = useColors();
  const router = useRouter();
  const { completeTokenSignIn } = useAuthContext();
  const { t, language } = useI18n();
  const { rehydrateFromServer } = useAppState();

  const isRTL = language === "ar";

  const tx = (nl: string, en: string, ar: string) => {
    return language === "ar" ? ar : language === "en" ? en : nl;
  };

  // Takes the method rather than reading state: both callers set it in the same
  // tick, where the state value is still the previous one.
  const twoFactorPrompt = (method: "app" | "email") =>
    method === "email"
      ? tx(
          "We hebben een verificatiecode naar uw e-mailadres gestuurd.",
          "We sent a verification code to your email address.",
          "أرسلنا رمز تحقّق إلى بريدك الإلكتروني.",
        )
      : tx(
          "Voer uw 2FA-code of back-upcode in",
          "Enter your 2FA or backup code",
          "أدخل رمز التحقق أو الرمز الاحتياطي",
        );

  const handleEmailLogin = async () => {
    const completingTwoFactor = Boolean(twoFactorChallenge);
    if (completingTwoFactor && !twoFactorCode.trim()) {
      setError(
        tx(
          "Voer uw 2FA-code of back-upcode in",
          "Enter your 2FA or backup code",
          "أدخل رمز التحقق أو الرمز الاحتياطي",
        ),
      );
      return;
    }
    if (!completingTwoFactor && (!email.trim() || !password.trim())) {
      setError(
        tx(
          "Vul uw e-mailadres en wachtwoord in",
          "Please enter your email and password",
          "أدخل بريدك الإلكتروني وكلمة المرور",
        ),
      );
      return;
    }

    setError("");
    setLoading(true);
    try {
      const apiBase = getApiBaseUrl();
      const response = await fetch(
        `${apiBase}${completingTwoFactor ? "/auth/2fa/verify" : "/auth/login"}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            completingTwoFactor
              ? {
                  challengeToken: twoFactorChallenge,
                  factorCode: twoFactorCode.trim(),
                }
              : { email: email.trim().toLowerCase(), password },
          ),
        },
      );

      const data = await response.json();

      if (data.requires2FA && typeof data.challengeToken === "string" && data.challengeToken) {
        // See lib/google-oauth.ts: an omitted `factor` means an older server,
        // which only challenges admins that have an authenticator.
        const method = data.factor === "email" ? "email" : "app";
        setTwoFactorChallenge(data.challengeToken);
        setTwoFactorMethod(method);
        setTwoFactorCode("");
        setPassword("");
        setError(twoFactorPrompt(method));
        return;
      }

      if (!response.ok) {
        if (completingTwoFactor) {
          // Deliberately keep the challenge: the server allows 5 attempts, and
          // a 401 covers both "wrong digit" and "expired" without telling them
          // apart. Clearing here would spend a live challenge on one typo — and
          // on a Google-initiated one, force the whole account picker again.
          // The "start over" control below is the way out instead.
          setTwoFactorCode("");
          setError(
            data.error ||
              tx(
                "Ongeldige of verlopen verificatiecode",
                "Invalid or expired verification code",
                "رمز التحقق غير صالح أو منتهٍ",
              ),
          );
        } else if (response.status === 401) {
          setError(
            tx(
              "Onjuist e-mailadres of wachtwoord",
              "Incorrect email or password",
              "البريد الإلكتروني أو كلمة المرور غير صحيحة",
            ),
          );
        } else if (response.status === 404) {
          setError(
            tx(
              "Geen account gevonden met dit e-mailadres.",
              "No account found with this email address.",
              "لا يوجد حساب بهذا البريد الإلكتروني.",
            ),
          );
        } else {
          setError(data.error || data.message || "Login failed");
        }
        return;
      }

      // Success: data has { success, sessionToken, user }
      const { sessionToken } = data;
      if (!sessionToken) {
        setError("Login response missing token");
        return;
      }
      setTwoFactorChallenge("");
      setTwoFactorCode("");
      await completeTokenSignIn(sessionToken);
      await rehydrateFromServer();
      router.replace("/(tabs)");
    } catch (err: any) {
      console.error("[Login] Email login error:", err);
      setError(
        tx(
          "Verbindingsfout. Controleer uw internetverbinding.",
          "Connection error. Check your internet connection.",
          "خطأ في الاتصال. تحقق من اتصالك بالإنترنت.",
        ),
      );
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError("");
    // Starting a fresh Google sign-in abandons any challenge already on screen;
    // leaving it would show a stale code field over the new flow.
    setTwoFactorChallenge("");
    setTwoFactorCode("");
    setLoading(true);
    try {
      const result = await completeNativeGoogleSignIn();
      if (!result) return;
      if (result.kind === "twoFactor") {
        // Hand off to the same code field the email flow uses; submitting it
        // posts to /auth/2fa/verify, which is what mints an admin session.
        setTwoFactorChallenge(result.challengeToken);
        setTwoFactorMethod(result.factor);
        setTwoFactorCode("");
        setError(twoFactorPrompt(result.factor));
        return;
      }
      await completeTokenSignIn(result.sessionToken);
      await rehydrateFromServer();
      router.replace("/(tabs)");
    } catch (err: any) {
      // Log the cause too: SDK rejections carry the readable name only there
      // (the `reason` is a bare numeric code like "10" for DEVELOPER_ERROR).
      console.error("[Login] Google login error:", err, err?.cause);
      const denied = err instanceof GoogleSignInError ? err.reason : null;
      if (denied === "no_account") {
        setError(
          tx(
            "Geen Rabbaanie-account gevonden voor dit Google-account.",
            "No Rabbaanie account is linked to this Google account.",
            "لا يوجد حساب ربّانيّ مرتبط بحساب Google هذا.",
          ),
        );
        return;
      }
      if (denied === "email_account") {
        setError(
          tx(
            "Dit e-mailadres heeft een account met een wachtwoord. Log hierboven in met je e-mailadres.",
            "This email has a password account. Sign in with your email and password above.",
            "هذا البريد لديه حساب بكلمة مرور. سجّل الدخول أعلاه ببريدك وكلمة المرور.",
          ),
        );
        return;
      }
      if (denied === "admin_2fa_required") {
        setError(
          tx(
            "Gebruik e-mail en wachtwoord om de 2FA-controle voor dit beheerdersaccount te voltooien.",
            "Use email and password to complete 2FA for this administrator account.",
            "استخدم البريد وكلمة المرور لإكمال التحقق بخطوتين لحساب الإدارة.",
          ),
        );
        return;
      }
      setError(
        tx(
          "Google-inloggen mislukt. Probeer het opnieuw.",
          "Google sign-in failed. Please try again.",
          "فشل تسجيل الدخول بـ Google. حاول مرة أخرى.",
        ),
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
        >
          <View
            style={{
              flex: 1,
              justifyContent: "center",
              alignItems: "center",
              paddingHorizontal: 24,
              paddingVertical: 40,
            }}
          >
            {/* Logo */}
            <View style={{ alignItems: "center", gap: 8, marginBottom: 32 }}>
              <Image
                source={require("@/assets/images/icon.png")}
                style={{ width: 72, height: 72, borderRadius: 16 }}
              />
              <Text
                style={{
                  fontSize: 22,
                  fontWeight: "bold",
                  color: colors.foreground,
                  textAlign: "center",
                }}
              >
                {tx("Rabbaanie", "Rabbaanie", "ربّاني")}
              </Text>
              <Text
                style={{
                  fontSize: 13,
                  color: colors.muted,
                  textAlign: "center",
                }}
              >
                {tx(
                  "Islamitisch opvoedingsprogramma",
                  "Islamic parenting program",
                  "برنامج تربوي إسلامي",
                )}
              </Text>
            </View>

            {/* Email/Password Form */}
            <View style={{ width: "100%", maxWidth: 340, gap: 12 }}>
              {/* Email Input */}
              <View style={{ gap: 4 }}>
                <Text
                  style={{
                    fontSize: 13,
                    color: colors.muted,
                    writingDirection: isRTL ? "rtl" : "ltr",
                  }}
                >
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

              {twoFactorChallenge ? (
                <View style={{ gap: 4 }}>
                  <Text
                    style={{
                      fontSize: 13,
                      color: colors.muted,
                      writingDirection: isRTL ? "rtl" : "ltr",
                    }}
                  >
                    {twoFactorMethod === "email"
                      ? tx(
                          "Code uit uw e-mail",
                          "Code from your email",
                          "الرمز من بريدك الإلكتروني",
                        )
                      : tx(
                          "2FA-code of back-upcode",
                          "2FA or backup code",
                          "رمز التحقق أو الرمز الاحتياطي",
                        )}
                  </Text>
                  <TextInput
                    value={twoFactorCode}
                    onChangeText={setTwoFactorCode}
                    placeholder="000000"
                    placeholderTextColor={colors.muted}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    textContentType="oneTimeCode"
                    keyboardType="default"
                    maxLength={9}
                    textAlign={isRTL ? "right" : "left"}
                    returnKeyType="done"
                    onSubmitEditing={handleEmailLogin}
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
                  {/* The only way out of the challenge. Without it an expired
                      code is a dead end: every submit routes to /auth/2fa/verify
                      against a challenge the server has already dropped. */}
                  <TouchableOpacity
                    onPress={() => {
                      setTwoFactorChallenge("");
                      setTwoFactorCode("");
                      setError("");
                    }}
                    hitSlop={8}
                  >
                    <Text
                      style={{
                        fontSize: 13,
                        color: colors.primary,
                        textAlign: isRTL ? "right" : "left",
                        marginTop: 2,
                      }}
                    >
                      {tx(
                        "Opnieuw beginnen",
                        "Start over",
                        "البدء من جديد",
                      )}
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : null}

              {/* Password Input */}
              <View style={{ gap: 4 }}>
                <Text
                  style={{
                    fontSize: 13,
                    color: colors.muted,
                    writingDirection: isRTL ? "rtl" : "ltr",
                  }}
                >
                  {tx("Wachtwoord", "Password", "كلمة المرور")}
                </Text>
                <View style={{ position: "relative" }}>
                  <TextInput
                    value={password}
                    onChangeText={setPassword}
                    placeholder="••••••••"
                    placeholderTextColor={colors.muted}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    textAlign={isRTL ? "right" : "left"}
                    returnKeyType="done"
                    onSubmitEditing={handleEmailLogin}
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
                    accessibilityRole="button"
                    accessibilityLabel={
                      showPassword
                        ? tx(
                            "Wachtwoord verbergen",
                            "Hide password",
                            "إخفاء كلمة المرور",
                          )
                        : tx(
                            "Wachtwoord tonen",
                            "Show password",
                            "إظهار كلمة المرور",
                          )
                    }
                    hitSlop={8}
                    style={{
                      position: "absolute",
                      right: 4,
                      top: 0,
                      minWidth: 44,
                      minHeight: 44,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                    activeOpacity={0.6}
                  >
                    <Text style={{ fontSize: 13, color: colors.primary }}>
                      {showPassword
                        ? tx("Verberg", "Hide", "إخفاء")
                        : tx("Toon", "Show", "إظهار")}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Forgot password link */}
              <TouchableOpacity
                onPress={() => router.push("/forgot-password" as any)}
                activeOpacity={0.6}
                style={{
                  alignSelf: isRTL ? "flex-start" : "flex-end",
                  minHeight: 44,
                  justifyContent: "center",
                }}
              >
                <Text style={{ fontSize: 13, color: colors.primary }}>
                  {tx(
                    "Wachtwoord vergeten?",
                    "Forgot password?",
                    "نسيت كلمة المرور؟",
                  )}
                </Text>
              </TouchableOpacity>

              {/* Error message */}
              {error ? (
                <Text
                  accessibilityRole="alert"
                  accessibilityLiveRegion="polite"
                  style={{
                    color: colors.error,
                    fontSize: 13,
                    textAlign: "center",
                    marginTop: 4,
                  }}
                >
                  {error}
                </Text>
              ) : null}

              {/* Login Button */}
              <TouchableOpacity
                onPress={handleEmailLogin}
                disabled={loading}
                activeOpacity={0.8}
                style={{
                  backgroundColor: colors.primary,
                  borderRadius: 10,
                  paddingVertical: 14,
                  alignItems: "center",
                  marginTop: 8,
                  opacity: loading ? 0.7 : 1,
                }}
              >
                {loading ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Text
                    style={{
                      fontSize: 15,
                      fontWeight: "600",
                      color: "#ffffff",
                    }}
                  >
                    {twoFactorChallenge
                      ? tx("Verifiëren", "Verify", "تحقق")
                      : tx("Inloggen", "Sign in", "تسجيل الدخول")}
                  </Text>
                )}
              </TouchableOpacity>

              {Platform.OS === "android" && (
                <>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      marginVertical: 12,
                    }}
                  >
                    <View
                      style={{
                        flex: 1,
                        height: 1,
                        backgroundColor: colors.border,
                      }}
                    />
                    <Text
                      style={{
                        marginHorizontal: 12,
                        fontSize: 12,
                        color: colors.muted,
                      }}
                    >
                      {tx("of", "or", "أو")}
                    </Text>
                    <View
                      style={{
                        flex: 1,
                        height: 1,
                        backgroundColor: colors.border,
                      }}
                    />
                  </View>

                  <TouchableOpacity
                    onPress={handleGoogleLogin}
                    disabled={loading}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 10,
                      backgroundColor: "#ffffff",
                      borderRadius: 10,
                      paddingVertical: 13,
                      paddingHorizontal: 20,
                      borderWidth: 1,
                      borderColor: "#dadce0",
                      shadowColor: "#000",
                      shadowOffset: { width: 0, height: 1 },
                      shadowOpacity: 0.08,
                      shadowRadius: 2,
                      elevation: 1,
                      opacity: loading ? 0.7 : 1,
                    }}
                    activeOpacity={0.8}
                  >
                    <GoogleGIcon />
                    <Text
                      style={{
                        fontSize: 14,
                        fontWeight: "500",
                        color: "#3c4043",
                      }}
                    >
                      {tx(
                        "Inloggen met Google",
                        "Sign in with Google",
                        "تسجيل الدخول بـ Google",
                      )}
                    </Text>
                  </TouchableOpacity>
                </>
              )}

              {/* Sideload build points at the website; the Play build must not,
                  because rabbaanie.com sells the subscription outside Play
                  billing (anti-steering). Play users get a support contact —
                  allowed app furniture — so a stranded user still has a path. */}
              {/* Both channels now create the account in-app. That is the only
                  route the Play build may offer, and it is also better for the
                  sideload build: a purchase started on rabbaanie.com provisions
                  nothing for a brand-new customer, so pointing them there took
                  money and left them without an account. */}
              <TouchableOpacity
                onPress={() => router.push("/register" as any)}
                accessibilityRole="link"
                activeOpacity={0.6}
                style={{
                  minHeight: 44,
                  marginTop: 8,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text
                  style={{
                    fontSize: 13,
                    color: colors.muted,
                    textAlign: "center",
                  }}
                >
                  {tx(
                    "Nog geen account? ",
                    "No account yet? ",
                    "ليس لديك حساب؟ ",
                  )}
                  <Text
                    style={{
                      color: colors.primary,
                      textDecorationLine: "underline",
                    }}
                  >
                    {tx("Account aanmaken", "Create account", "إنشاء حساب")}
                  </Text>
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() =>
                  Linking.openURL(`mailto:${SUPPORT_EMAIL}`).catch(() => {})
                }
                accessibilityRole="link"
                activeOpacity={0.6}
                style={{
                  minHeight: 44,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text
                  style={{
                    fontSize: 12,
                    color: colors.muted,
                    textAlign: "center",
                  }}
                >
                  {tx(
                    "Hulp nodig bij het inloggen? Mail ",
                    "Need help signing in? Contact ",
                    "تحتاج مساعدة في تسجيل الدخول؟ راسل ",
                  )}
                  <Text style={{ textDecorationLine: "underline" }}>
                    {SUPPORT_EMAIL}
                  </Text>
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

function GoogleGIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 48 48" accessibilityLabel="Google">
      <Path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <Path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <Path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24s.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <Path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </Svg>
  );
}
