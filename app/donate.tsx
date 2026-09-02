import { ScrollView, Text, View, TouchableOpacity, StyleSheet, Linking, Alert } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as Clipboard from "expo-clipboard";
import { useColors } from "@/hooks/use-colors";
import { useI18n } from "@/lib/i18n";
import { useRemoteConfig } from "@/hooks/use-remote-config";
import { DONATE_URL, BUNQ_URL, BANK_TRANSFER_DETAILS } from "@/constants/donate";

type Lang = "nl" | "en" | "ar";

function tx(lang: Lang, nl: string, en: string, ar: string): string {
  if (lang === "en") return en;
  if (lang === "ar") return ar;
  return nl;
}

/**
 * Donation screen (msg 564/577): the home-tab and settings «تصدّق» buttons
 * used to open the card-payment URL directly, so bank transfer had no way to
 * exist. Both entry points now route here instead; this screen presents all
 * three ways to give.
 */
export default function DonateScreen() {
  const colors = useColors();
  const { language, isRTL } = useI18n();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const remoteCfg = useRemoteConfig();
  const align = isRTL ? "right" : "left";

  function openCardPayment() {
    const donateUrl = remoteCfg.donateUrl || DONATE_URL;
    if (donateUrl) Linking.openURL(donateUrl);
    else Alert.alert(
      tx(language, "Doneer (Sadaqah)", "Give Sadaqah", "تصدّق"),
      tx(language, "De doneermogelijkheid (Sadaqah) komt binnenkort, in shaa Allaah.", "The donation (Sadaqah) option will be available soon, in shaa Allaah.", "طريقةُ التصدّق ستتوفّر قريبًا إن شاء الله."),
    );
  }

  function copyToClipboard(value: string) {
    Clipboard.setStringAsync(value);
    Alert.alert(tx(language, "Gekopieerd", "Copied", "تمّ النسخ"), value);
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ paddingTop: insets.top + 8, paddingBottom: 12, paddingHorizontal: 16, backgroundColor: colors.surface, borderBottomWidth: 0.5, borderBottomColor: colors.border, flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 12 }}>
        <TouchableOpacity onPress={() => router.back()}>
          <MaterialIcons name={isRTL ? "arrow-forward" : "arrow-back"} size={24} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={{ fontSize: 18, fontWeight: "700", color: colors.foreground, flex: 1, textAlign: align }}>
          {tx(language, "Doneren (Sadaqah)", "Give Sadaqah", "التبرّع / تصدّق")}
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}>
        {/* 1. Card / online payment */}
        <View style={s.card}>
          <View style={[s.cardHeader, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
            <MaterialIcons name="credit-card" size={20} color="#1B4332" />
            <Text style={[s.cardTitle, { textAlign: align }]}>
              {tx(language, "Kaart / online betaling", "Card / online payment", "الدفع بالبطاقة / أونلاين")}
            </Text>
          </View>
          <Text style={[s.cardDesc, { textAlign: align }]}>
            {tx(language, "Doneer direct en veilig via onze betaalpagina.", "Donate directly and securely through our payment page.", "تصدّق مباشرةً وبأمان عبر صفحة الدفع الخاصّة بنا.")}
          </Text>
          <TouchableOpacity onPress={openCardPayment} style={[s.primaryBtn, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
            <MaterialIcons name="volunteer-activism" size={18} color="#fff" />
            <Text style={s.primaryBtnText}>{tx(language, "Doneer nu (Sadaqah)", "Give Sadaqah now", "تصدّق الآن")}</Text>
          </TouchableOpacity>
        </View>

        {/* 2. bunq — Netherlands & Belgium only */}
        <View style={s.card}>
          <View style={[s.cardHeader, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
            <MaterialIcons name="account-balance-wallet" size={20} color="#1B4332" />
            <Text style={[s.cardTitle, { textAlign: align }]}>
              {tx(language, "Doneren via bunq (Nederland & België)", "Donate via bunq (Netherlands & Belgium)", "التبرّع عبر bunq (هولندا وبلجيكا)")}
            </Text>
          </View>
          <TouchableOpacity onPress={() => Linking.openURL(BUNQ_URL)} style={[s.primaryBtn, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
            <MaterialIcons name="volunteer-activism" size={18} color="#fff" />
            <Text style={s.primaryBtnText}>{tx(language, "Open bunq.me", "Open bunq.me", "فتح bunq.me")}</Text>
          </TouchableOpacity>
        </View>

        {/* 3. Bank transfer */}
        <View style={s.card}>
          <View style={[s.cardHeader, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
            <MaterialIcons name="account-balance" size={20} color="#1B4332" />
            <Text style={[s.cardTitle, { textAlign: align }]}>{tx(language, "Bankoverschrijving", "Bank transfer", "التحويل البنكي")}</Text>
          </View>
          <DetailRow label={tx(language, "Begunstigde", "Beneficiary", "المستفيد")} value={BANK_TRANSFER_DETAILS.beneficiary} align={align} isRTL={isRTL} />
          <DetailRow label="IBAN" value={BANK_TRANSFER_DETAILS.iban} align={align} isRTL={isRTL} onCopy={() => copyToClipboard(BANK_TRANSFER_DETAILS.iban)} />
          <DetailRow label="SWIFT/BIC" value={BANK_TRANSFER_DETAILS.swift} align={align} isRTL={isRTL} onCopy={() => copyToClipboard(BANK_TRANSFER_DETAILS.swift)} />
        </View>
      </ScrollView>
    </View>
  );
}

function DetailRow({ label, value, align, isRTL, onCopy }: { label: string; value: string; align: "left" | "right"; isRTL: boolean; onCopy?: () => void }) {
  return (
    <View style={[s.detailRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
      <View style={{ flex: 1 }}>
        <Text style={[s.detailLabel, { textAlign: align }]}>{label}</Text>
        <Text selectable style={[s.detailValue, { textAlign: align }]}>{value}</Text>
      </View>
      {onCopy && (
        <TouchableOpacity onPress={onCopy} style={s.copyBtn}>
          <MaterialIcons name="content-copy" size={18} color="#1B4332" />
        </TouchableOpacity>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: "#F1F8F2", borderRadius: 14, borderWidth: 1.5, borderColor: "#E8ECE9", padding: 16, marginBottom: 16 },
  cardHeader: { alignItems: "center", gap: 8, marginBottom: 8 },
  cardTitle: { fontSize: 16, fontWeight: "700", color: "#1B4332", flex: 1 },
  cardDesc: { fontSize: 13, lineHeight: 19, color: "#52796F", marginBottom: 14 },
  primaryBtn: { alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#1B4332", borderRadius: 12, paddingVertical: 12 },
  primaryBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  detailRow: { alignItems: "center", paddingVertical: 8 },
  detailLabel: { fontSize: 12, color: "#52796F", marginBottom: 2 },
  detailValue: { fontSize: 15, fontWeight: "600", color: "#1B4332" },
  copyBtn: { padding: 8 },
});
