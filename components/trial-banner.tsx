import { useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useI18n } from "@/lib/i18n";
import { formatSubscriptionRemaining, useSubscription } from "@/hooks/use-subscription";

/**
 * Countdown banner for a free-trial user: names the days left and routes
 * straight to payment. Same warm "attention" card as PremiumNotice
 * (components/premium-notice.tsx) so the two nags read as one family; shown
 * instead of PremiumNotice since a trial user's `subscribed` is already true
 * (PremiumNotice hides for them), not in addition to it.
 */
export function TrialBanner() {
  const router = useRouter();
  const { language, isRTL } = useI18n();
  const { trial, expiresAt, loading } = useSubscription();
  // Session-local only (cheap): reappears next app open, which is fine for a
  // daily reminder — no AsyncStorage plumbing for a "for today" version.
  const [dismissed, setDismissed] = useState(false);
  const tx = (ar: string, nl: string, en: string) => (language === "ar" ? ar : language === "en" ? en : nl);
  if (loading || !trial || !expiresAt || dismissed) return null;
  const remaining = formatSubscriptionRemaining(expiresAt, language);
  return (
    <TouchableOpacity
      onPress={() => router.push("/subscribe" as any)}
      activeOpacity={0.85}
      style={{ backgroundColor: "#FFF7E6", borderColor: "#E9C46A", borderWidth: 1.5, borderRadius: 12, padding: 12, marginHorizontal: 12, marginTop: 12 }}
    >
      <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 10 }}>
        <MaterialIcons name="hourglass-top" size={20} color="#B8860B" />
        <Text style={{ flex: 1, color: "#7A5B00", fontWeight: "700", fontSize: 13, textAlign: isRTL ? "right" : "left" }}>
          {tx(
            `أسبوعك المجّانيّ: ${remaining} — اشترك لتحتفظ بالمستشار والنصائح الشخصيّة`,
            `Uw gratis week: ${remaining} — abonneer om de adviseur en persoonlijk advies te behouden`,
            `Your free week: ${remaining} — subscribe to keep the advisor and personal advice`,
          )}
        </Text>
        <MaterialIcons name={isRTL ? "chevron-left" : "chevron-right"} size={22} color="#B8860B" />
      </View>
      <TouchableOpacity
        onPress={() => setDismissed(true)}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        style={{ position: "absolute", top: 6, ...(isRTL ? { left: 6 } : { right: 6 }) }}
      >
        <MaterialIcons name="close" size={16} color="#B8860B" />
      </TouchableOpacity>
    </TouchableOpacity>
  );
}
