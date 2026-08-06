import { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { useColors } from "@/hooks/use-colors";
import { useI18n } from "@/lib/i18n";

// Mirrors CREATE_COOLDOWN_MS in rabbaanie-api/server/admin-2fa-challenge.ts.
// Duplicated, not imported: client and server are separate deployed repos.
const RESEND_COOLDOWN_MS = 60_000;

function useCountdown(issuedAt: number): number {
  const [now, setNow] = useState(() => Date.now());
  const remainingMs = Math.min(
    RESEND_COOLDOWN_MS,
    Math.max(0, RESEND_COOLDOWN_MS - (now - issuedAt)),
  );
  useEffect(() => {
    if (remainingMs <= 0) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [issuedAt, remainingMs <= 0]);
  return remainingMs;
}

type TwoFactorVerifyScreenProps = {
  email: string;
  code: string;
  onChangeCode: (value: string) => void;
  method: "app" | "email";
  issuedAt: number;
  error: string;
  verifying: boolean;
  onVerify: () => void;
  onCancel: () => void;
  resending: boolean;
  onResend: () => void;
};

/**
 * Replaces the entire sign-in form while an admin/owner second factor is
 * outstanding. Reached from both the password and Google sign-in paths in
 * app/login.tsx, which hand off to the same challenge state either way.
 */
export function TwoFactorVerifyScreen({
  email,
  code,
  onChangeCode,
  method,
  issuedAt,
  error,
  verifying,
  onVerify,
  onCancel,
  resending,
  onResend,
}: TwoFactorVerifyScreenProps) {
  const colors = useColors();
  const { language } = useI18n();
  const isRTL = language === "ar";
  const tx = (nl: string, en: string, ar: string) =>
    language === "ar" ? ar : language === "en" ? en : nl;

  const remainingMs = useCountdown(issuedAt);
  const remainingSec = Math.ceil(remainingMs / 1000);
  const canResend = remainingMs <= 0 && !resending && !verifying;

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

  return (
    <View style={{ width: "100%", maxWidth: 340, gap: 14 }}>
      <View style={{ gap: 6 }}>
        <Text
          style={{
            fontSize: 19,
            fontWeight: "700",
            color: colors.foreground,
            textAlign: "center",
            writingDirection: isRTL ? "rtl" : "ltr",
          }}
        >
          {tx(
            "Extra verificatie vereist",
            "Extra verification required",
            "التحقّق الإضافي مطلوب",
          )}
        </Text>
        <Text
          style={{
            fontSize: 13,
            color: colors.muted,
            textAlign: "center",
            lineHeight: 19,
            writingDirection: isRTL ? "rtl" : "ltr",
          }}
        >
          {tx(
            "Omdat uw account beheerdersrechten heeft, vragen we een extra controle om de gezinnen die u beheert te beschermen.",
            "Because your account has admin/owner access, we require an extra check to protect the families you manage.",
            "لأنّ حسابك يملك صلاحيات إدارية، نطلب تحقّقًا إضافيًّا لحماية العائلات التي تديرها.",
          )}
        </Text>
      </View>

      {method === "email" ? (
        <View style={{ gap: 2 }}>
          <Text
            style={{
              fontSize: 13,
              color: colors.foreground,
              textAlign: "center",
              writingDirection: isRTL ? "rtl" : "ltr",
            }}
          >
            {email ? (
              <>
                {tx("We hebben een code gestuurd naar", "We sent a code to", "أرسلنا رمزًا إلى")}{" "}
                <Text style={{ fontWeight: "700" }}>{email}</Text>
              </>
            ) : (
              tx(
                "We hebben een verificatiecode naar uw e-mailadres gestuurd.",
                "We sent a verification code to your email address.",
                "أرسلنا رمز تحقّق إلى بريدك الإلكتروني.",
              )
            )}
          </Text>
          <Text
            style={{
              fontSize: 12,
              color: colors.muted,
              textAlign: "center",
              writingDirection: isRTL ? "rtl" : "ltr",
            }}
          >
            {tx(
              "Gebruik de nieuwste e-mail als u er meerdere heeft ontvangen.",
              "Use the most recent email if you received more than one.",
              "استخدم أحدث رسالة إذا تلقّيت أكثر من واحدة.",
            )}
          </Text>
        </View>
      ) : (
        <Text
          style={{
            fontSize: 13,
            color: colors.foreground,
            textAlign: "center",
            writingDirection: isRTL ? "rtl" : "ltr",
          }}
        >
          {tx(
            "Voer uw 2FA-code of back-upcode in",
            "Enter your 2FA or backup code",
            "أدخل رمز التحقق أو الرمز الاحتياطي",
          )}
        </Text>
      )}

      <TextInput
        value={code}
        onChangeText={onChangeCode}
        placeholder="000000"
        placeholderTextColor={colors.muted}
        autoCapitalize="characters"
        autoCorrect={false}
        textContentType="oneTimeCode"
        keyboardType="default"
        maxLength={9}
        textAlign="center"
        returnKeyType="done"
        onSubmitEditing={onVerify}
        autoFocus
        style={{ ...inputStyle, fontSize: 22, letterSpacing: 4, fontWeight: "700" }}
      />

      {error ? (
        <Text
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          style={{
            color: colors.error,
            fontSize: 13,
            textAlign: "center",
            writingDirection: isRTL ? "rtl" : "ltr",
          }}
        >
          {error}
        </Text>
      ) : null}

      <TouchableOpacity
        onPress={onVerify}
        disabled={verifying || resending}
        activeOpacity={0.8}
        style={{
          backgroundColor: colors.primary,
          borderRadius: 10,
          paddingVertical: 14,
          alignItems: "center",
          opacity: verifying || resending ? 0.7 : 1,
        }}
      >
        {verifying ? (
          <ActivityIndicator size="small" color="#ffffff" />
        ) : (
          <Text
            style={{
              fontSize: 15,
              fontWeight: "600",
              color: "#ffffff",
              writingDirection: isRTL ? "rtl" : "ltr",
            }}
          >
            {tx("Verifiëren", "Verify", "تحقق")}
          </Text>
        )}
      </TouchableOpacity>

      {method === "email" ? (
        <TouchableOpacity
          onPress={onResend}
          disabled={!canResend}
          activeOpacity={0.7}
          style={{
            minHeight: 44,
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 10,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.surface,
            paddingVertical: 10,
          }}
        >
          <Text
            style={{
              fontSize: 13,
              color: canResend ? colors.primary : colors.muted,
              writingDirection: isRTL ? "rtl" : "ltr",
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
                : tx("Code opnieuw versturen", "Resend code", "إعادة إرسال الرمز")}
          </Text>
        </TouchableOpacity>
      ) : null}

      <TouchableOpacity
        onPress={onCancel}
        activeOpacity={0.7}
        style={{
          minHeight: 44,
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 10,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surface,
          paddingVertical: 10,
        }}
      >
        <Text
          style={{
            fontSize: 13,
            color: colors.muted,
            writingDirection: isRTL ? "rtl" : "ltr",
          }}
        >
          {tx("Annuleren", "Cancel", "إلغاء")}
        </Text>
      </TouchableOpacity>
    </View>
  );
}
