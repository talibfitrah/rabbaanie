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

/**
 * Login Screen - Email/Password + Google Sign-In
 * All authentication goes directly to api.rabbaanie.com (no external redirect).
 */
export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const colors = useColors();
  const router = useRouter();
  const { setAuthState } = useAuthContext();
  const { t, language } = useI18n();
  const { rehydrateFromServer } = useAppState();

  const isRTL = language === "ar";

  const tx = (nl: string, en: string, ar: string) => {
    return language === "ar" ? ar : language === "en" ? en : nl;
  };

  const handleEmailLogin = async () => {
    if (!email.trim() || !password.trim()) {
      setError(tx(
        "Vul uw e-mailadres en wachtwoord in",
        "Please enter your email and password",
        "أدخل بريدك الإلكتروني وكلمة المرور"
      ));
      return;
    }

    setError("");
    setLoading(true);
    try {
      const apiBase = getApiBaseUrl();
      const response = await fetch(`${apiBase}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 401) {
          setError(tx(
            "Onjuist e-mailadres of wachtwoord",
            "Incorrect email or password",
            "البريد الإلكتروني أو كلمة المرور غير صحيحة"
          ));
        } else if (response.status === 404) {
          setError(tx(
            "Account niet gevonden. Maak eerst een account aan.",
            "Account not found. Please register first.",
            "الحساب غير موجود. سجّل أولاً."
          ));
        } else {
          setError(data.error || data.message || "Login failed");
        }
        return;
      }

      // Success: data has { success, sessionToken, user }
      const { sessionToken, user: userData } = data;
      if (!sessionToken) {
        setError("Login response missing token");
        return;
      }
      const user: Auth.User = {
        id: userData.id,
        openId: userData.openId || `email_${userData.id}`,
        name: userData.name || email.split("@")[0],
        email: userData.email || email,
        loginMethod: "email",
        lastSignedIn: new Date(),
      };

      await setAuthState(user, sessionToken);
      await rehydrateFromServer();
      router.replace("/(tabs)");
    } catch (err: any) {
      console.error("[Login] Email login error:", err);
      setError(tx(
        "Verbindingsfout. Controleer uw internetverbinding.",
        "Connection error. Check your internet connection.",
        "خطأ في الاتصال. تحقق من اتصالك بالإنترنت."
      ));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError("");
    setLoading(true);
    try {
      const WebBrowser = await import("expo-web-browser");
      const Linking = await import("expo-linking");
      const apiBase = getApiBaseUrl();
      const redirectUri = Linking.createURL("/oauth/callback");
      const loginUrl = `${apiBase}/auth/google/redirect?redirect_uri=${encodeURIComponent(redirectUri)}`;

      const result = await WebBrowser.openAuthSessionAsync(loginUrl, redirectUri);

      if (result.type === "success" && result.url) {
        const url = new URL(result.url);
        const token = url.searchParams.get("token");
        const userParam = url.searchParams.get("user");

        if (token && userParam) {
          try {
            const userData = JSON.parse(decodeURIComponent(userParam));
            const user: Auth.User = {
              id: userData.id,
              openId: userData.openId || `google_${userData.id}`,
              name: userData.name,
              email: userData.email,
              loginMethod: "google",
              lastSignedIn: new Date(),
            };
            await setAuthState(user, token);
            await rehydrateFromServer();
            router.replace("/(tabs)");
            return;
          } catch (parseErr) {
            console.error("[Login] Failed to parse Google user:", parseErr);
          }
        }
      } else if (result.type === "cancel" || result.type === "dismiss") {
        return;
      }
    } catch (err: any) {
      console.error("[Login] Google login error:", err);
      setError(tx(
        "Google-inloggen mislukt. Probeer het opnieuw.",
        "Google sign-in failed. Please try again.",
        "فشل تسجيل الدخول بـ Google. حاول مرة أخرى."
      ));
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
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
          <View style={{ flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 24, paddingVertical: 40 }}>
            {/* Logo */}
            <View style={{ alignItems: "center", gap: 8, marginBottom: 32 }}>
              <Image
                source={require("@/assets/images/icon.png")}
                style={{ width: 72, height: 72, borderRadius: 16 }}
              />
              <Text style={{ fontSize: 22, fontWeight: "bold", color: colors.foreground, textAlign: "center" }}>
                {tx("Rabbaanie", "Rabbaanie", "ربّاني")}
              </Text>
              <Text style={{ fontSize: 13, color: colors.muted, textAlign: "center" }}>
                {tx(
                  "Islamitisch opvoedingsprogramma",
                  "Islamic parenting program",
                  "برنامج تربوي إسلامي"
                )}
              </Text>
            </View>

            {/* Email/Password Form */}
            <View style={{ width: "100%", maxWidth: 340, gap: 12 }}>
              {/* Email Input */}
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
                <Text style={{ fontSize: 13, color: colors.muted, writingDirection: isRTL ? "rtl" : "ltr" }}>
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
                    style={{ position: "absolute", right: 12, top: 12 }}
                    activeOpacity={0.6}
                  >
                    <Text style={{ fontSize: 13, color: colors.primary }}>
                      {showPassword ? tx("Verberg", "Hide", "إخفاء") : tx("Toon", "Show", "إظهار")}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Forgot password link */}
              <TouchableOpacity
                onPress={() => router.push("/forgot-password" as any)}
                activeOpacity={0.6}
                style={{ alignSelf: isRTL ? "flex-start" : "flex-end" }}
              >
                <Text style={{ fontSize: 13, color: colors.primary }}>
                  {tx("Wachtwoord vergeten?", "Forgot password?", "نسيت كلمة المرور؟")}
                </Text>
              </TouchableOpacity>

              {/* Error message */}
              {error ? (
                <Text style={{ color: colors.error, fontSize: 13, textAlign: "center", marginTop: 4 }}>
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
                  <Text style={{ fontSize: 15, fontWeight: "600", color: "#ffffff" }}>
                    {tx("Inloggen", "Sign in", "تسجيل الدخول")}
                  </Text>
                )}
              </TouchableOpacity>

              {/* Divider */}
              <View style={{ flexDirection: "row", alignItems: "center", marginVertical: 12 }}>
                <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
                <Text style={{ marginHorizontal: 12, fontSize: 12, color: colors.muted }}>
                  {tx("of", "or", "أو")}
                </Text>
                <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
              </View>

              {/* Google Login Button */}
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
                <Image
                  source={{ uri: "https://developers.google.com/identity/images/g-logo.png" }}
                  style={{ width: 18, height: 18 }}
                />
                <Text style={{ fontSize: 14, fontWeight: "500", color: "#3c4043" }}>
                  {tx("Inloggen met Google", "Sign in with Google", "تسجيل الدخول بـ Google")}
                </Text>
              </TouchableOpacity>

              {/* Register Link */}
              <View style={{ alignItems: "center", marginTop: 16 }}>
                <TouchableOpacity onPress={() => router.push("/register")} activeOpacity={0.7}>
                  <Text style={{ fontSize: 14, color: colors.muted }}>
                    {tx("Nog geen account? ", "Don't have an account? ", "ليس لديك حساب؟ ")}
                    <Text style={{ color: colors.primary, fontWeight: "600" }}>
                      {tx("Registreer", "Register", "سجّل الآن")}
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
