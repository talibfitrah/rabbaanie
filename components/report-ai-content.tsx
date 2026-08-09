import { useState } from "react";
import { Alert, Text, TouchableOpacity, View } from "react-native";
import { useI18n } from "@/lib/i18n";
import { useColors } from "@/hooks/use-colors";
import { apiCall } from "@/lib/_core/api";

/**
 * "Report this response" control for AI-generated content.
 *
 * Google Play's AI-Generated Content policy is explicit and unconditional:
 * "Apps that generate content using AI must contain in-app user reporting or
 * flagging features that allow users to report or flag offensive content to
 * developers without needing to exit the app."
 * (support.google.com/googleplay/android-developer/answer/13985936)
 *
 * "Without needing to exit the app" is why this posts to the API rather than
 * opening a mailto: link — a mail composer would leave the app and would not
 * satisfy the policy.
 *
 * It reuses the existing public POST /api/feedback endpoint rather than adding a
 * new one, so no production server change is needed. That endpoint coerces
 * `kind` to contact|suggestion, so reports are marked with a [AI-RAPPORT] prefix
 * in the message body instead; they surface in the same admin feedback list
 * (feedbackList / feedbackUnread) the team already reads.
 */

type Props = {
  /** The AI output being reported, so the team can see what was flagged. */
  content: string;
  /** Which screen it came from, e.g. "ai-chat" — narrows down the prompt path. */
  surface: string;
  /** Optional foreground override for dark or tinted content cards. */
  color?: string;
};

const TEXT = {
  nl: {
    disclosure: "Door AI gegenereerd — controleer belangrijke informatie.",
    label: "Antwoord melden",
    confirmTitle: "Dit antwoord melden?",
    confirmBody:
      "Je stuurt dit antwoord naar ons team zodat we het kunnen beoordelen.",
    cancel: "Annuleren",
    send: "Melden",
    done: "Bedankt. Ons team bekijkt dit antwoord.",
    failed: "Melden is niet gelukt. Probeer het later opnieuw.",
  },
  en: {
    disclosure: "AI-generated — check important information.",
    label: "Report response",
    confirmTitle: "Report this response?",
    confirmBody: "This sends the response to our team so we can review it.",
    cancel: "Cancel",
    send: "Report",
    done: "Thank you. Our team will review this response.",
    failed: "Could not send the report. Please try again later.",
  },
  ar: {
    disclosure: "مُولَّد بالذكاء الاصطناعيّ — تحقّق من المعلومات المهمّة.",
    label: "الإبلاغ عن الرد",
    confirmTitle: "هل تريد الإبلاغ عن هذا الرد؟",
    confirmBody: "سيتم إرسال هذا الرد إلى فريقنا لمراجعته.",
    cancel: "إلغاء",
    send: "إبلاغ",
    done: "شكرًا لك. سيراجع فريقنا هذا الرد.",
    failed: "تعذّر إرسال البلاغ. حاول مرة أخرى لاحقًا.",
  },
};

export function ReportAiContent({ content, surface, color }: Props) {
  const { language } = useI18n();
  const colors = useColors();
  const [sending, setSending] = useState(false);

  const lang = language === "ar" ? "ar" : language === "en" ? "en" : "nl";
  const isRTL = lang === "ar";
  const text = TEXT[lang];

  const submit = async () => {
    setSending(true);
    try {
      await apiCall("/api/feedback", {
        method: "POST",
        body: JSON.stringify({
          kind: "contact",
          source: "app",
          language: lang,
          // The endpoint truncates at 4000; keep the reported text well inside
          // that so the prefix and surface label are never cut off.
          message: `[AI-RAPPORT] ${surface}\n\n${content.slice(0, 3000)}`,
        }),
      });
      Alert.alert("", text.done);
    } catch {
      Alert.alert("", text.failed);
    } finally {
      setSending(false);
    }
  };

  const confirm = () => {
    Alert.alert(text.confirmTitle, text.confirmBody, [
      { text: text.cancel, style: "cancel" },
      { text: text.send, onPress: submit },
    ]);
  };

  return (
    <View style={{ alignSelf: isRTL ? "flex-end" : "flex-start" }}>
      {/* The disclosure rides with the report control on purpose. Play's
          AI-Generated Content policy wants users to understand AI is involved
          "without needing to investigate beyond what the app itself
          communicates", and this component is already rendered directly beneath
          every AI output in the app — so pairing them means a new AI surface
          cannot ship with a report button but no disclosure. */}
      <Text
        style={{
          color: color ?? colors.muted,
          fontSize: 11.5,
          opacity: 0.85,
          paddingHorizontal: 8,
          textAlign: isRTL ? "right" : "left",
        }}
      >
        {text.disclosure}
      </Text>
    <TouchableOpacity
      onPress={confirm}
      disabled={sending}
      accessibilityRole="button"
      accessibilityLabel={text.label}
      hitSlop={8}
      style={{
        minHeight: 44,
        paddingVertical: 10,
        paddingHorizontal: 8,
        justifyContent: "center",
        opacity: sending ? 0.5 : 1,
      }}
    >
      <Text
        style={{
          color: color ?? colors.foreground,
          fontSize: 14,
          textAlign: isRTL ? "right" : "left",
        }}
      >
        ⚑ {text.label}
      </Text>
    </TouchableOpacity>
    </View>
  );
}
