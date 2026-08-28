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
} from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { useEffect, useRef, useState } from "react";
import { useColors } from "@/hooks/use-colors";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useRouter } from "expo-router";
import { useAuthContext } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n";
import { useAppState } from "@/lib/app-context";
import {
  completeNativeGoogleSignIn,
  GoogleSignInError,
  sanitizeErrorDetail,
} from "@/lib/google-oauth";
import {
  completeNativeAppleSignIn,
  AppleSignInError,
} from "@/lib/apple-oauth";
import * as AppleAuthentication from "expo-apple-authentication";
import { GOOGLE_IOS_CLIENT_ID } from "@/constants/app-identity";
import { TwoFactorVerifyScreen } from "@/components/two-factor-verify-screen";
import Svg, { Path } from "react-native-svg";

import { publicFetch } from "@/lib/authed-fetch";

/**
 * Whether to show the Google button at all, per platform.
 *
 * Android needs nothing here: Google binds sign-in to the package name and the
 * app signing certificate, so the web client id alone is enough.
 *
 * iOS needs an iOS-type OAuth client id, and GoogleSignin.configure() REJECTS
 * without one (RNGoogleSignin.mm:78) — the failure lands on the user's first
 * tap, as a "Google sign-in failed" alert with no way forward. That is App
 * Store guideline 2.1 territory; a button that is simply absent is not. So the
 * button follows the id: fill in GOOGLE_IOS_CLIENT_ID and it appears.
 *
 * Web is excluded deliberately rather than incidentally — the browser build has
 * never offered this button, and lighting one up there is a separate change
 * with its own OAuth client and its own consent screen.
 */
const GOOGLE_SIGN_IN_AVAILABLE =
  Platform.OS === "android" ||
  (Platform.OS === "ios" && GOOGLE_IOS_CLIENT_ID !== "");

/**
 * Sign in with Apple is iOS-only. Apple's guideline 4.8 requires it wherever a
 * third-party sign-in (Google here) is offered, and it exists only on iOS 13+ —
 * so the button appears on iOS and nowhere else. No client id gates it: the
 * native flow's `aud` is the app bundle id, so there is nothing to fill in the
 * way GOOGLE_IOS_CLIENT_ID gates the Google button.
 */
const APPLE_SIGN_IN_AVAILABLE = Platform.OS === "ios";

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
  // When the current challenge was (re)issued — drives the resend cooldown
  // countdown in TwoFactorVerifyScreen.
  const [twoFactorIssuedAt, setTwoFactorIssuedAt] = useState(0);
  // The email the code was actually sent to. Not the same as the `email`
  // field state: the Google sign-in path never touches that field, so it
  // can be empty or hold whatever the admin typed but never submitted.
  const [twoFactorEmail, setTwoFactorEmail] = useState("");
  const [resending, setResending] = useState(false);
  const colors = useColors();
  // Apple's button owns its own fill; only its light/dark variant is ours to
  // pick — black on light backgrounds, white on dark, per Apple's HIG.
  const isDark = useColorScheme() === "dark";
  const router = useRouter();
  const { completeTokenSignIn } = useAuthContext();
  const { t, language } = useI18n();
  const { rehydrateFromServer, resetState } = useAppState();
  // Set when the server says this Google identity has no account, so the screen
  // can offer to create one instead of leaving the user at a dead end.
  const [offerGoogleSignup, setOfferGoogleSignup] = useState(false);
  // Same, for Sign in with Apple.
  const [offerAppleSignup, setOfferAppleSignup] = useState(false);

  const isRTL = language === "ar";

  const tx = (nl: string, en: string, ar: string) => {
    return language === "ar" ? ar : language === "en" ? en : nl;
  };

  // Mirrors twoFactorChallenge for handleEmailLogin's in-flight requests:
  // onCancel's setState is only visible on the next render, but a fetch
  // already in flight needs the *current* value when its response lands.
  const twoFactorChallengeRef = useRef(twoFactorChallenge);
  useEffect(() => {
    twoFactorChallengeRef.current = twoFactorChallenge;
  }, [twoFactorChallenge]);

  const handleEmailLogin = async () => {
    if (loading) return;
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
      const response = await publicFetch(
        completingTwoFactor ? "/auth/2fa/verify" : "/auth/login",
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

      const data = await response.json().catch(() => ({}));

      if (data.requires2FA && typeof data.challengeToken === "string" && data.challengeToken) {
        // See lib/google-oauth.ts: an omitted `factor` means an older server,
        // which only challenges admins that have an authenticator.
        const method = data.factor === "email" ? "email" : "app";
        setTwoFactorChallenge(data.challengeToken);
        setTwoFactorMethod(method);
        setTwoFactorCode("");
        setPassword("");
        setTwoFactorIssuedAt(Date.now());
        setTwoFactorEmail(email.trim().toLowerCase());
        setError("");
        return;
      }

      if (!response.ok) {
        if (completingTwoFactor) {
          // Same guard as the success path below: if Cancel already fired,
          // don't resurrect a 2FA error on the now-plain sign-in form.
          if (completingTwoFactor && !twoFactorChallengeRef.current) return;
          // Deliberately keep the challenge: the server allows 5 attempts, and
          // a 401 covers both "wrong digit" and "expired" without telling them
          // apart. Clearing here would spend a live challenge on one typo — and
          // on a Google-initiated one, force the whole account picker again.
          // The "Cancel" control below is the way out instead.
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
      // Same race handleResend guards against: if Cancel fired while this
      // request was in flight, don't sign the user in behind their back.
      if (completingTwoFactor && !twoFactorChallengeRef.current) return;
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
      // Same guard: don't show a connection error after Cancel fired.
      if (completingTwoFactor && !twoFactorChallengeRef.current) return;
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

  const handleGoogleAuth = async (createAccount = false) => {
    setError("");
    setOfferGoogleSignup(false);
    setLoading(true);
    try {
      const result = await completeNativeGoogleSignIn({
        createAccount,
        language,
      });
      if (!result) return;
      if (result.kind === "twoFactor") {
        // Hand off to the same code field the email flow uses; submitting it
        // posts to /auth/2fa/verify, which is what mints an admin session.
        setTwoFactorChallenge(result.challengeToken);
        setTwoFactorMethod(result.factor);
        setTwoFactorCode("");
        setTwoFactorIssuedAt(Date.now());
        setTwoFactorEmail("");
        setError("");
        return;
      }
      await completeTokenSignIn(result.sessionToken);
      // A just-created account has nothing on the server, so
      // rehydrateFromServer() falls through to its "try local state" branch and
      // adopts whatever the previous user left on this device — their children,
      // birth dates and profile — and skips onboarding, because their
      // onboardingCompleted is true. app/register.tsx calls resetState() for
      // exactly this reason; the Google sign-up path creates accounts the same
      // way and needs the same empty slate.
      //
      // Keyed on what the SERVER did, never on `createAccount`. Every call to
      // completeNativeGoogleSignIn re-opens the account picker (it signs out of
      // the SDK first, deliberately, so the picker appears at all), so a user
      // who taps "Create account with Google" can still choose an account that
      // already exists. The server signs them in and reports created:false.
      // Resetting there wipes a real profile, and the next local edit syncs
      // that empty state back over their server copy, soft-deleting their
      // children. `created` is false unless the server explicitly said true.
      if (result.created) await resetState();
      else await rehydrateFromServer();
      router.replace("/(tabs)");
    } catch (err: any) {
      // Log the cause too: SDK rejections carry the readable name only there
      // (the `reason` is a bare numeric code like "10" for DEVELOPER_ERROR).
      console.error("[Login] Google login error:", err, err?.cause);
      const denied = err instanceof GoogleSignInError ? err.reason : null;
      if (denied === "no_account") {
        // Not a dead end any more. This gate was written when the app was
        // sign-in only and accounts came from the website; in-app sign-up has
        // since landed, so the honest answer to "no account" is to offer one.
        // Only when this attempt was a sign-IN: if a sign-UP still comes back
        // no_account the server has not shipped the creation path, and
        // repeating the offer would loop the user through the Google picker
        // forever. Say it plainly instead.
        if (createAccount) {
          setError(
            tx(
              "Account aanmaken met Google is nu niet beschikbaar. Maak hieronder een account aan met uw e-mailadres.",
              "Creating an account with Google is unavailable right now. Please create one with your email below.",
              "إنشاء حساب بواسطة Google غير متاح الآن. أنشئ حسابًا ببريدك الإلكتروني أدناه.",
            ),
          );
          return;
        }
        setOfferGoogleSignup(true);
        setError(
          tx(
            "Nog geen Rabbaanie-account voor dit Google-account. Maak er direct een aan.",
            "No Rabbaanie account yet for this Google account. Create one now.",
            "لا يوجد حساب ربّانيّ لحساب Google هذا بعد. أنشئ حسابًا الآن.",
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
      // This branch is the catch-all for every failure not already understood
      // above (an SDK rejection after account selection, a missing idToken, a
      // dropped connection to our own /auth/google/native) — console.error
      // above is invisible on a release build with no device attached, so the
      // in-app message is the only trace a real report ever carries. A short
      // code costs nothing and turns "generic failure, no clue" into
      // something that can be read off the screen and acted on.
      // sanitizeErrorDetail (lib/google-oauth.ts) is the safety layer; see
      // its docstring for what it guarantees and its documented ceiling.
      const detail = sanitizeErrorDetail(denied ?? err?.name ?? "unknown");
      setError(
        tx(
          `Google-inloggen mislukt (${detail}). Probeer het opnieuw.`,
          `Google sign-in failed (${detail}). Please try again.`,
          `فشل تسجيل الدخول بـ Google (${detail}). حاول مرة أخرى.`,
        ),
      );
    } finally {
      setLoading(false);
    }
  };

  // Mirror of handleGoogleAuth for native Sign in with Apple. Terminates in the
  // same completeTokenSignIn / created-reset path, and reuses the same result
  // union so the branching is identical.
  const handleAppleAuth = async (createAccount = false) => {
    setError("");
    setOfferAppleSignup(false);
    setLoading(true);
    try {
      const result = await completeNativeAppleSignIn({ createAccount, language });
      if (!result) return;
      if (result.kind === "twoFactor") {
        setTwoFactorChallenge(result.challengeToken);
        setTwoFactorMethod(result.factor);
        setTwoFactorCode("");
        setTwoFactorIssuedAt(Date.now());
        setTwoFactorEmail("");
        setError("");
        return;
      }
      await completeTokenSignIn(result.sessionToken);
      // Keyed on what the SERVER did, never on `createAccount` — see the same
      // note in handleGoogleAuth for why resetting on the request flag wipes a
      // real profile.
      if (result.created) await resetState();
      else await rehydrateFromServer();
      router.replace("/(tabs)");
    } catch (err: any) {
      console.error("[Login] Apple login error:", err, err?.cause);
      const denied = err instanceof AppleSignInError ? err.reason : null;
      if (denied === "no_account") {
        if (createAccount) {
          setError(
            tx(
              "Account aanmaken met Apple is nu niet beschikbaar. Maak hieronder een account aan met uw e-mailadres.",
              "Creating an account with Apple is unavailable right now. Please create one with your email below.",
              "إنشاء حساب بواسطة Apple غير متاح الآن. أنشئ حسابًا ببريدك الإلكتروني أدناه.",
            ),
          );
          return;
        }
        setOfferAppleSignup(true);
        setError(
          tx(
            "Nog geen Rabbaanie-account voor dit Apple-account. Maak er direct een aan.",
            "No Rabbaanie account yet for this Apple account. Create one now.",
            "لا يوجد حساب ربّانيّ لحساب Apple هذا بعد. أنشئ حسابًا الآن.",
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
      const detail = sanitizeErrorDetail(denied ?? err?.name ?? "unknown");
      setError(
        tx(
          `Apple-inloggen mislukt (${detail}). Probeer het opnieuw.`,
          `Apple sign-in failed (${detail}). Please try again.`,
          `فشل تسجيل الدخول بـ Apple (${detail}). حاول مرة أخرى.`,
        ),
      );
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setResending(true);
    setError("");
    try {
      const response = await publicFetch(`/auth/2fa/resend`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengeToken: twoFactorChallenge }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || typeof data.challengeToken !== "string" || !data.challengeToken) {
        // Guarded the same way as the success path below: if the user tapped
        // Cancel while this request was in flight, twoFactorChallenge is
        // already "" and this error must not land on the plain sign-in form.
        setTwoFactorChallenge((current) => {
          if (current) {
            setError(
              tx(
                "Opnieuw versturen mislukt. Probeer het later nog eens.",
                "Could not resend the code. Please try again shortly.",
                "تعذّر إعادة إرسال الرمز. حاول مرة أخرى لاحقًا.",
              ),
            );
          }
          return current;
        });
        return;
      }
      // Functional update: if the user tapped Cancel while this request was in
      // flight, twoFactorChallenge is already "" and must stay that way rather
      // than being silently reopened by a stale response.
      setTwoFactorChallenge((current) => (current ? data.challengeToken : current));
      setTwoFactorMethod(data.factor === "email" ? "email" : "app");
      setTwoFactorCode("");
      setTwoFactorIssuedAt(Date.now());
    } catch {
      // Same guard as above: don't leak a connection error onto the plain
      // sign-in form if the user already cancelled out of the challenge.
      setTwoFactorChallenge((current) => {
        if (current) {
          setError(
            tx(
              "Verbindingsfout. Controleer uw internetverbinding.",
              "Connection error. Check your internet connection.",
              "خطأ في الاتصال. تحقق من اتصالك بالإنترنت.",
            ),
          );
        }
        return current;
      });
    } finally {
      setResending(false);
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

            {twoFactorChallenge ? (
              <TwoFactorVerifyScreen
                email={twoFactorEmail}
                code={twoFactorCode}
                onChangeCode={setTwoFactorCode}
                method={twoFactorMethod}
                issuedAt={twoFactorIssuedAt}
                error={error}
                verifying={loading}
                onVerify={handleEmailLogin}
                onCancel={() => {
                  setTwoFactorChallenge("");
                  setTwoFactorCode("");
                  setError("");
                }}
                resending={resending}
                onResend={handleResend}
              />
            ) : (
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
                      {tx("Inloggen", "Sign in", "تسجيل الدخول")}
                    </Text>
                  )}
                </TouchableOpacity>

                {GOOGLE_SIGN_IN_AVAILABLE && (
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
                      onPress={() => handleGoogleAuth()}
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

                    {/* Only after the server has said this identity has no
                        account. Rendering it unconditionally would put a
                        "create an account" button next to "sign in" for people
                        who already have one, and every stray tap would ask the
                        server to create a duplicate. */}
                    {offerGoogleSignup ? (
                      <TouchableOpacity
                        onPress={() => handleGoogleAuth(true)}
                        disabled={loading}
                        accessibilityRole="button"
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: 10,
                          backgroundColor: colors.primary,
                          borderRadius: 10,
                          paddingVertical: 13,
                          paddingHorizontal: 20,
                          marginTop: 10,
                          minHeight: 48,
                          opacity: loading ? 0.7 : 1,
                        }}
                        activeOpacity={0.8}
                      >
                        <Text
                          style={{
                            fontSize: 14,
                            fontWeight: "700",
                            color: "#ffffff",
                          }}
                        >
                          {tx(
                            "Account aanmaken met Google",
                            "Create account with Google",
                            "إنشاء حساب بواسطة Google",
                          )}
                        </Text>
                      </TouchableOpacity>
                    ) : null}
                  </>
                )}

                {/* Sign in with Apple — iOS only, guideline 4.8. Uses Apple's
                    official button component, which App Review requires; its
                    appearance and label are owned by the system, so only the
                    theme (black in light mode, white in dark) and the onPress
                    are set here. */}
                {APPLE_SIGN_IN_AVAILABLE && (
                  <>
                    <AppleAuthentication.AppleAuthenticationButton
                      buttonType={
                        AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN
                      }
                      buttonStyle={
                        isDark
                          ? AppleAuthentication.AppleAuthenticationButtonStyle
                              .WHITE
                          : AppleAuthentication.AppleAuthenticationButtonStyle
                              .BLACK
                      }
                      cornerRadius={10}
                      style={{ height: 48, marginTop: 10 }}
                      onPress={() => handleAppleAuth()}
                    />
                    {offerAppleSignup ? (
                      <AppleAuthentication.AppleAuthenticationButton
                        buttonType={
                          AppleAuthentication.AppleAuthenticationButtonType
                            .SIGN_UP
                        }
                        buttonStyle={
                          isDark
                            ? AppleAuthentication.AppleAuthenticationButtonStyle
                                .WHITE
                            : AppleAuthentication.AppleAuthenticationButtonStyle
                                .BLACK
                        }
                        cornerRadius={10}
                        style={{ height: 48, marginTop: 10 }}
                        onPress={() => handleAppleAuth(true)}
                      />
                    ) : null}
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
                  onPress={() => router.push("/support" as any)}
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
                      "Hulp nodig bij het inloggen? ",
                      "Need help signing in? ",
                      "تحتاج مساعدة في تسجيل الدخول؟ ",
                    )}
                    <Text style={{ textDecorationLine: "underline" }}>
                      {tx(
                        "Technische support",
                        "Technical support",
                        "الدعم التقنيّ",
                      )}
                    </Text>
                  </Text>
                </TouchableOpacity>
              </View>
            )}
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
