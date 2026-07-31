import { Text, TouchableOpacity } from "react-native";
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
 * Gate an action behind a subscription. Returns { subscribed, gate }.
 * gate(fn) runs fn if subscribed, otherwise routes to /subscribe.
 */
export function usePremiumGate() {
  const router = useRouter();
  const { subscribed, loading } = useSubscription();
  const gate = (action: () => void) => {
    if (subscribed) action();
    else router.push("/subscribe" as any);
  };
  return { subscribed, loading, gate };
}
