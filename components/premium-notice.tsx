import { ActivityIndicator, Text, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useColors } from "@/hooks/use-colors";
import { useI18n } from "@/lib/i18n";
import { useSubscription } from "@/hooks/use-subscription";

/** Tappable "subscribe to use" banner shown atop premium screens for non-subscribers. */
export function PremiumNotice() {
  const colors = useColors();
  const router = useRouter();
  const { language, isRTL } = useI18n();
  const { subscribed, loading } = useSubscription();
  const tx = (ar: string, nl: string, en: string) => (language === "ar" ? ar : language === "en" ? en : nl);
  if (loading || subscribed) return null;
  return (
    <TouchableOpacity
      onPress={() => router.push("/subscribe" as any)}
      style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 10, backgroundColor: "#FFF7E6", borderColor: "#E9C46A", borderWidth: 1.5, borderRadius: 12, padding: 12, marginHorizontal: 12, marginTop: 12 }}
    >
      <MaterialIcons name="lock" size={20} color="#B8860B" />
      <Text style={{ flex: 1, color: "#7A5B00", fontWeight: "700", fontSize: 13, textAlign: isRTL ? "right" : "left" }}>
        {tx("هذه الخدمة للمشتركين — اشترك لاستخدامها", "Deze dienst is voor abonnees — abonneer om te gebruiken", "This service is for subscribers — subscribe to use")}
      </Text>
      <MaterialIcons name={isRTL ? "chevron-left" : "chevron-right"} size={22} color="#B8860B" />
    </TouchableOpacity>
  );
}

/**
 * Full-screen gate (msg 829): renders `children` only for subscribers; everyone
 * else sees a locked view with a subscribe CTA — so special services cannot be
 * accessed without the annual membership (parity with the website gating).
 */
export function PremiumGate({ children }: { children: React.ReactNode }) {
  const colors = useColors();
  const router = useRouter();
  const { language, isRTL } = useI18n();
  const { subscribed, loading } = useSubscription();
  const tx = (ar: string, nl: string, en: string) => (language === "ar" ? ar : language === "en" ? en : nl);
  // While status loads, show a spinner — not a blank screen (looks broken) and
  // not the children (would flash paid content to a non-subscriber).
  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }
  if (subscribed) return <>{children}</>;
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 28, backgroundColor: colors.background }}>
      <MaterialIcons name="lock" size={56} color="#B8860B" />
      <Text style={{ color: colors.text, fontWeight: "800", fontSize: 18, textAlign: "center", marginTop: 16 }}>
        {tx("خدمةٌ خاصّةٌ بالمشتركين", "Dienst voor abonnees", "A subscribers' service")}
      </Text>
      <Text style={{ color: colors.muted, fontSize: 14, textAlign: "center", marginTop: 8, lineHeight: 22, writingDirection: isRTL ? "rtl" : "ltr" }}>
        {tx("اشترك بالعضويّة السنويّة (١٢€) لتفتح هذه الخدمة لأسرتك، بلا إعلانات.", "Word jaarlid (€12) om deze dienst voor uw gezin te openen, advertentievrij.", "Get the annual membership (€12) to unlock this service for your family, ad-free.")}
      </Text>
      <TouchableOpacity onPress={() => router.push("/subscribe" as any)} style={{ marginTop: 22, backgroundColor: "#1B4332", paddingVertical: 13, paddingHorizontal: 30, borderRadius: 12 }}>
        <Text style={{ color: "#fff", fontWeight: "800", fontSize: 15 }}>{tx("اشترك الآن", "Nu abonneren", "Subscribe now")}</Text>
      </TouchableOpacity>
    </View>
  );
}

/**
 * Gate an action behind a subscription. Returns { subscribed, gate }.
 * gate(fn) runs fn if subscribed, otherwise routes to /subscribe.
 */
export function usePremiumGate() {
  const router = useRouter();
  const { subscribed, loading } = useSubscription();
  const gate = (action: () => void) => {
    if (subscribed) action();
    // Don't bounce to the paywall while status is still loading — on cold start
    // subscribed is false until the fetch resolves, so a real subscriber tapping
    // a gated action in the first moments would be wrongly sent to /subscribe.
    else if (!loading) router.push("/subscribe" as any);
  };
  return { subscribed, loading, gate };
}
