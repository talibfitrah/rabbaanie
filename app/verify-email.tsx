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
import { useEffect, useState } from "react";
import { useColors } from "@/hooks/use-colors";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useAuthContext } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n";

import { publicFetch } from "@/lib/authed-fetch";
import {
  buildSendVerificationPayload,
  buildVerifyEmailPayload,
  isValidVerificationCode,
} from "@/lib/verification";

// Mirrors the resend cooldown in rabbaanie-api server/web-auth.ts
// (POST /auth/send-verification). Duplicated, not imported: client and
// server are separate deployed repos with no shared types.
const RESEND_COOLDOWN_MS = 60_000;

/** Ticks once a second while a resend cooldown is outstanding, same shape as
 * components/two-factor-verify-screen.tsx's useCountdown. */
function useCountdown(issuedAt: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  const remainingMs = issuedAt
    ? Math.min(
        RESEND_COOLDOWN_MS,
        Math.max(0, RESEND_COOLDOWN_MS - (now - issuedAt)),
      )
    : 0;
  useEffect(() => {
    if (remainingMs <= 0) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [issuedAt, remainingMs <= 0]);
  return remainingMs;
}

/**
 * Soft-gate email verification screen. Reached from app/register.tsx right
 * after a brand-new account is created (which already fired the initial
 * send-verification call), and — once EMAIL_VERIFICATION_GATE is enabled
 * server-side — from anywhere the API rejects a call with the
 * email_not_verified error (see the QueryCache/MutationCache onError in
 * app/_layout.tsx). "Soft" means Skip is always available; nothing in this
 * app blocks on verification yet.
 */
export default function VerifyEmailScreen() {
  const { email: emailParam } = useLocalSearchParams<{ email?: string }>();
  const { user } = useAuthContext();
  const email = emailParam || user?.email || "";

  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendIssuedAt, setResendIssuedAt] = useState<number | null>(null);
  const [resendSent, setResendSent] = useState(false);
  const colors = useColors();
  const router = useRouter();
  const { language } = useI18n();

  const isRTL = language === "ar";
  const tx = (nl: string, en: string, ar: string) =>
    language === "ar" ? ar : language === "en" ? en : nl;

  const remainingMs = useCountdown(resendIssuedAt);
  const remainingSec = Math.ceil(remainingMs / 1000);
  const canResend = remainingMs <= 0 && !resending && !verifying;

  const rateLimitedMessage = tx(
    "Te veel pogingen. Probeer het later opnieuw.",
    "Too many attempts. Please try again later.",
    "محاولات كثيرة جدًا. حاول مرة أخرى لاحقًا.",
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
  const labelStyle = {
    fontSize: 13,
    color: colors.muted,
    writingDirection: (isRTL ? "rtl" : "ltr") as "rtl" | "ltr",
  };

  const handleVerify = async () => {
    if (!isValidVerificationCode(code)) return;
    setError("");
    setVerifying(true);
    try {
      const response = await publicFetch("/auth/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildVerifyEmailPayload(email, code)),
      });
      const data = await response.json().catch(() => ({}));

      if (response.ok && data?.success) {
        router.replace("/(tabs)" as any);
        return;
      }
      if (response.status === 429) {
        setError(rateLimitedMessage);
        return;
      }
      setError(
        data?.error ||
          tx(
            "Ongeldige of verlopen code. Probeer het opnieuw.",
            "Invalid or expired code. Please try again.",
            "رمز غير صالح أو منتهي الصلاحية. حاول مرة أخرى.",
          ),
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
      setVerifying(false);
    }
  };

  const handleResend = async () => {
    setError("");
    setResendSent(false);
    setResending(true);
    try {
      const response = await publicFetch("/auth/send-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildSendVerificationPayload(email)),
      });
      if (response.status === 429) {
        setError(rateLimitedMessage);
        return;
      }
      if (response.ok) {
        setResendIssuedAt(Date.now());
        setResendSent(true);
      } else {
        setError(
          tx(
            "Opnieuw versturen mislukt. Probeer het later nog eens.",
            "Could not resend the code. Please try again shortly.",
            "تعذّر إعادة إرسال الرمز. حاول مرة أخرى لاحقًا.",
          ),
        );
      }
    } catch {
      setError(
        tx(
          "Verbinding mislukt. Controleer uw internet.",
          "Connection failed. Check your internet.",
          "فشل الاتصال. تحقّق من الإنترنت.",
        ),
      );
    } finally {
      setResending(false);
    }
  };

  if (!email) {
    return (
      <ScreenContainer>
        <View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
            gap: 16,
          }}
        >
          <Text
            style={{
              fontSize: 15,
              color: colors.foreground,
              textAlign: "center",
              lineHeight: 21,
            }}
          >
            {tx(
              "We konden geen e-mailadres vinden om te verifiëren.",
              "We could not find an email address to verify.",
              "تعذّر العثور على بريد إلكتروني للتحقق منه.",
            )}
          </Text>
          <TouchableOpacity
            onPress={() => router.replace("/login" as any)}
            accessibilityRole="link"
            style={{ minHeight: 44, alignItems: "center", justifyContent: "center" }}
          >
            <Text style={{ fontSize: 13, color: colors.primary, textAlign: "center" }}>
              {tx("Terug naar inloggen", "Back to sign in", "العودة لتسجيل الدخول")}
            </Text>
          </TouchableOpacity>
        </View>
      </ScreenContainer>
    );
  }

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
              {tx("Verifieer uw e-mail", "Verify your email", "تحقّق من بريدك الإلكتروني")}
            </Text>
            <Text
              style={{ fontSize: 13, color: colors.muted, textAlign: "center" }}
            >
              {tx(
                `We hebben een code gestuurd naar ${email}`,
                `We sent a code to ${email}`,
                `أرسلنا رمزًا إلى ${email}`,
              )}
            </Text>
          </View>

          <View style={{ width: "100%", maxWidth: 340, gap: 12 }}>
            <View style={{ gap: 4 }}>
              <Text style={labelStyle}>
                {tx("Verificatiecode", "Verification code", "رمز التحقّق")}
              </Text>
              <TextInput
                value={code}
                onChangeText={setCode}
                placeholder="123456"
                placeholderTextColor={colors.muted}
                keyboardType="number-pad"
                textContentType="oneTimeCode"
                maxLength={6}
                textAlign="center"
                autoFocus
                style={{
                  ...inputStyle,
                  fontSize: 24,
                  fontWeight: "700",
                  letterSpacing: 8,
                }}
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
            ) : resendSent ? (
              <Text
                style={{
                  color: colors.primary,
                  fontSize: 13,
                  textAlign: "center",
                  lineHeight: 19,
                }}
              >
                {tx(
                  "Code verstuurd. Controleer uw inbox.",
                  "Code sent. Check your inbox.",
                  "تم إرسال الرمز. تحقّق من بريدك الوارد.",
                )}
              </Text>
            ) : null}

            <TouchableOpacity
              onPress={handleVerify}
              disabled={verifying || !isValidVerificationCode(code)}
              style={{
                backgroundColor: colors.primary,
                borderRadius: 10,
                paddingVertical: 14,
                alignItems: "center",
                opacity: verifying || !isValidVerificationCode(code) ? 0.6 : 1,
                minHeight: 48,
                justifyContent: "center",
              }}
            >
              {verifying ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>
                  {tx("Verifiëren", "Verify", "تحقّق")}
                </Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleResend}
              disabled={!canResend}
              style={{
                minHeight: 44,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text
                style={{
                  fontSize: 13,
                  color: canResend ? colors.primary : colors.muted,
                  textAlign: "center",
                }}
              >
                {remainingMs > 0
                  ? tx(
                      `Opnieuw versturen (${remainingSec}s)`,
                      `Resend code (${remainingSec}s)`,
                      `إعادة الإرسال (${remainingSec}ث)`,
                    )
                  : resending
                    ? tx("Bezig...", "Sending...", "جارٍ الإرسال...")
                    : tx(
                        "Code opnieuw versturen",
                        "Resend code",
                        "إعادة إرسال الرمز",
                      )}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => router.replace("/(tabs)" as any)}
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
                {tx("Later doen", "Skip for now", "لاحقًا")}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}
