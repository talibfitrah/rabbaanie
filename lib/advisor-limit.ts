import { Alert } from "react-native";
import { router } from "expo-router";

// The advisor (المستشار) is capped per subscription tier per week on the server
// (rabbaanie-api phase 2). When a subscriber is over their cap the REST advice
// routes return 403 {error:"ADVISOR_WEEKLY_LIMIT"} instead of advice, so the app
// can steer them to upgrade rather than silently showing nothing.

export function isAdvisorLimit(status: number, data: any): boolean {
  return status === 403 && data?.error === "ADVISOR_WEEKLY_LIMIT";
}

/** Show the "you've hit your weekly advisor limit — upgrade" prompt. */
export function promptAdvisorUpgrade(lang: string): void {
  const t = (nl: string, en: string, ar: string) =>
    lang === "ar" ? ar : lang === "en" ? en : nl;
  Alert.alert(
    t("Weeklimiet bereikt", "Weekly limit reached", "بلغتَ حدّ هذا الأسبوع"),
    t(
      "U heeft uw adviesgesprekken voor deze week op uw huidige abonnement gebruikt. Upgrade uw abonnement voor meer.",
      "You've used your advisor consultations for this week on your current plan. Upgrade your plan for more.",
      "لقد استوفيتَ عددَ استشارات المستشار لهذا الأسبوع في باقتك الحالية. ارفع باقتك للمزيد.",
    ),
    [
      { text: t("Later", "Later", "لاحقًا"), style: "cancel" },
      { text: t("Upgraden", "Upgrade", "ترقية"), onPress: () => router.push("/subscribe") },
    ],
  );
}
