import { useState } from "react";
import {
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Platform,
  Modal,
} from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useI18n } from "@/lib/i18n";
import { useRouter } from "expo-router";
import { useAppState } from "@/lib/app-context";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/hooks/use-auth";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { DatePicker } from "@/components/date-picker";
import QRCode from "react-native-qrcode-svg";
import { loadSyncSettings, saveSyncSettings, type SyncSettings, DEFAULT_SYNC_SETTINGS } from "@/lib/notification-settings";
import { useEffect } from "react";
import { PremiumGate } from "@/components/premium-notice";

function NetworkSettingsScreenInner() {
  const colors = useColors();
  const { t, language, isRTL } = useI18n();
  const router = useRouter();
  const { state } = useAppState();
  const { isAuthenticated } = useAuth();

  const [qrModalVisible, setQrModalVisible] = useState(false);
  const [qrValue, setQrValue] = useState("");
  const [qrLabel, setQrLabel] = useState("");
  const [syncSettings, setSyncSettings] = useState<SyncSettings>(DEFAULT_SYNC_SETTINGS);

  useEffect(() => {
    loadSyncSettings().then(setSyncSettings);
  }, []);

  const updateSync = async (patch: Partial<SyncSettings>) => {
    const updated = { ...syncSettings, ...patch };
    setSyncSettings(updated);
    await saveSyncSettings(updated);
  };

  const isEn = language === "en";
  const isAr = language === "ar";

  const FREQ_OPTIONS: { value: SyncSettings["syncFrequency"]; label: string }[] = [
    { value: "15min", label: isAr ? "كل 15 دقيقة" : isEn ? "Every 15 min" : "Elke 15 min" },
    { value: "30min", label: isAr ? "كل 30 دقيقة" : isEn ? "Every 30 min" : "Elke 30 min" },
    { value: "1hr", label: isAr ? "كل ساعة" : isEn ? "Every hour" : "Elk uur" },
    { value: "manual", label: isAr ? "يدوي فقط" : isEn ? "Manual only" : "Alleen handmatig" },
  ];

  // Server queries (only if authenticated)
  const myIdQuery = trpc.links.getMyId.useQuery(undefined, { enabled: isAuthenticated });
  const linkedChildrenQuery = trpc.links.myLinkedChildren.useQuery(undefined, { enabled: isAuthenticated });
  const generateMyId = trpc.links.generateMyId.useMutation({
    onSuccess: () => { myIdQuery.refetch(); },
  });

  const [birthDateInput, setBirthDateInput] = useState("");

  const handleGenerateId = () => {
    if (!birthDateInput || !birthDateInput.match(/^\d{4}-\d{2}-\d{2}$/)) {
      Alert.alert(
        language === "ar" ? "مطلوب" : language === "en" ? "Required" : "Verplicht",
        language === "ar" ? "اختر تاريخ ميلادك" : language === "en" ? "Select your birth date" : "Kies uw geboortedatum"
      );
      return;
    }
    generateMyId.mutate({ birthDate: birthDateInput });
  };

  const showQr = (value: string, label: string) => {
    setQrValue(value);
    setQrLabel(label);
    setQrModalVisible(true);
  };

  const localChildren = state.children || [];

  return (
    <ScreenContainer className="p-0">
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Header */}
        <View style={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12 }}>
          <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 12, marginBottom: 4 }}>
            <TouchableOpacity onPress={() => router.back()}>
              <MaterialIcons name={isRTL ? "chevron-right" : "chevron-left"} size={28} color={colors.primary} />
            </TouchableOpacity>
            <Text style={{ fontSize: 22, fontWeight: "bold", color: colors.foreground, flex: 1, textAlign: isRTL ? "right" : "left" }}>
              {language === "ar" ? "إعدادات الشبكة" : language === "en" ? "Network Settings" : "Netwerk Instellingen"}
            </Text>
          </View>
          <Text style={{ fontSize: 13, color: colors.muted, paddingLeft: isRTL ? 0 : 40, paddingRight: isRTL ? 40 : 0, textAlign: isRTL ? "right" : "left" }}>
            {language === "ar" ? "إدارة الرمز المميز ورموز الأبناء" : language === "en" ? "Manage your unique code and children's codes" : "Beheer uw unieke code en codes van kinderen"}
          </Text>
        </View>

        {/* Content */}
        <View style={{ paddingHorizontal: 20, gap: 16 }}>
          {/* My ID Card */}
          <View style={{ backgroundColor: colors.surface, borderRadius: 16, padding: 20, borderWidth: 1, borderColor: colors.border }}>
            <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primary + "15", alignItems: "center", justifyContent: "center" }}>
                <MaterialIcons name="fingerprint" size={22} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground }}>
                  {t("network.my_id")}
                </Text>
                <Text style={{ fontSize: 11, color: colors.muted }}>
                  {t("network.id_format_info")}
                </Text>
              </View>
            </View>

            {isAuthenticated && myIdQuery.data?.publicId ? (
              <View style={{ alignItems: "center", gap: 10 }}>
                <View style={{ backgroundColor: colors.primary + "10", borderRadius: 12, paddingVertical: 14, paddingHorizontal: 24, borderWidth: 2, borderColor: colors.primary, borderStyle: "dashed" }}>
                  <Text style={{ fontSize: 20, fontWeight: "bold", color: colors.primary, letterSpacing: 2, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" }}>
                    {myIdQuery.data.publicId}
                  </Text>
                </View>
                <View style={{ flexDirection: isRTL ? "row-reverse" : "row", gap: 10 }}>
                  <TouchableOpacity
                    onPress={() => showQr(myIdQuery.data!.publicId!, t("network.my_id"))}
                    style={{ backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 16, flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 6 }}
                  >
                    <MaterialIcons name="qr-code" size={16} color="#fff" />
                    <Text style={{ color: "#fff", fontWeight: "600", fontSize: 13 }}>{t("network.share_qr")}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => router.push("/qr-scanner")}
                    style={{ backgroundColor: colors.surface, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 16, borderWidth: 1, borderColor: colors.primary, flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 6 }}
                  >
                    <MaterialIcons name="qr-code-scanner" size={16} color={colors.primary} />
                    <Text style={{ color: colors.primary, fontWeight: "600", fontSize: 13 }}>{t("network.scan_qr")}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : isAuthenticated ? (
              <View style={{ gap: 12 }}>
                <Text style={{ fontSize: 13, color: colors.muted }}>
                  {language === "ar" ? "أدخل تاريخ ميلادك لإنشاء رمزك المميز:" : language === "en" ? "Enter your birth date to generate your unique code:" : "Voer uw geboortedatum in om uw unieke code te genereren:"}
                </Text>
                <DatePicker
                  value={birthDateInput}
                  onChange={setBirthDateInput}
                  placeholder={language === "ar" ? "اختر تاريخ ميلادك" : language === "en" ? "Select your birth date" : "Kies uw geboortedatum"}
                  maxDate={new Date(2010, 11, 31)}
                  minDate={new Date(1940, 0, 1)}
                />
                <TouchableOpacity
                  onPress={handleGenerateId}
                  disabled={generateMyId.isPending}
                  style={{ backgroundColor: colors.primary, paddingVertical: 14, borderRadius: 10, alignItems: "center", opacity: generateMyId.isPending ? 0.7 : 1 }}
                >
                  {generateMyId.isPending ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>
                      {language === "ar" ? "إنشاء الرمز" : language === "en" ? "Generate Code" : "Code Genereren"}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            ) : (
              <View style={{ alignItems: "center", paddingVertical: 16, gap: 12 }}>
                <Text style={{ fontSize: 13, color: colors.muted, textAlign: "center" }}>
                  {language === "ar" ? "سجّل الدخول لإنشاء رمزك المميز وربط حسابك بشريكك" : language === "en" ? "Sign in to generate your unique code and link with your partner" : "Log in om uw unieke code te genereren en te koppelen met uw partner"}
                </Text>
                <TouchableOpacity
                  onPress={() => router.push("/login" as any)}
                  style={{ backgroundColor: colors.primary, paddingVertical: 12, paddingHorizontal: 24, borderRadius: 10, alignItems: "center" }}
                >
                  <Text style={{ color: "#fff", fontWeight: "700", fontSize: 14 }}>
                    {language === "ar" ? "تسجيل الدخول" : language === "en" ? "Sign In" : "Inloggen"}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* Children IDs */}
          <View style={{ backgroundColor: colors.surface, borderRadius: 16, padding: 20, borderWidth: 1, borderColor: colors.border }}>
            <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <MaterialIcons name="child-care" size={20} color={colors.primary} />
              <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground }}>
                {t("network.child_id")}
              </Text>
            </View>

            {localChildren.length > 0 ? (
              <View style={{ gap: 10 }}>
                {localChildren.map((child: any, idx: number) => (
                  <View key={child.id} style={{ backgroundColor: colors.background, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: colors.border, flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", justifyContent: "space-between" }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }}>
                        {child.name || `Kind ${idx + 1}`}
                      </Text>
                      <Text style={{ fontSize: 11, color: colors.muted }}>
                        {child.birthDate || (language === "ar" ? "لا تاريخ ميلاد" : language === "en" ? "No birth date" : "Geen geboortedatum")}
                      </Text>
                      {child.birthDate && (
                        <Text style={{ fontSize: 12, color: colors.primary, fontWeight: "600", fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace", marginTop: 4 }}>
                          {getChildIdString(child.birthDate, idx)}
                        </Text>
                      )}
                    </View>
                    {child.birthDate && (
                      <TouchableOpacity
                        onPress={() => showQr(getChildIdString(child.birthDate, idx), `${child.name || "Kind"} - QR`)}
                        style={{ backgroundColor: colors.primary + "15", borderRadius: 8, padding: 8 }}
                      >
                        <MaterialIcons name="qr-code" size={18} color={colors.primary} />
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
              </View>
            ) : (
              <Text style={{ fontSize: 13, color: colors.muted, textAlign: "center", paddingVertical: 12 }}>
                {language === "ar" ? "لم تتم إضافة أطفال بعد" : language === "en" ? "No children added yet" : "Nog geen kinderen toegevoegd"}
              </Text>
            )}
          </View>

          {/* Sync Settings Section */}
          <View style={{ backgroundColor: colors.surface, borderRadius: 16, padding: 20, borderWidth: 1, borderColor: colors.border }}>
            <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 10, marginBottom: 16 }}>
              <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: "#059669" + "15", alignItems: "center", justifyContent: "center" }}>
                <MaterialIcons name="sync" size={22} color="#059669" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground, textAlign: isRTL ? "right" : "left" }}>
                  {isAr ? "إعدادات المزامنة" : isEn ? "Sync Settings" : "Synchronisatie-instellingen"}
                </Text>
                <Text style={{ fontSize: 11, color: colors.muted, textAlign: isRTL ? "right" : "left" }}>
                  {isAr ? "تحكم في تكرار المزامنة والبيانات المشمولة" : isEn ? "Control sync frequency and included data" : "Beheer synchronisatiefrequentie en opgenomen data"}
                </Text>
              </View>
            </View>

            {/* Frequency */}
            <Text style={{ fontSize: 13, fontWeight: "600", color: colors.foreground, marginBottom: 8, textAlign: isRTL ? "right" : "left" }}>
              {isAr ? "تكرار المزامنة" : isEn ? "Sync Frequency" : "Synchronisatiefrequentie"}
            </Text>
            <View style={{ flexDirection: isRTL ? "row-reverse" : "row", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
              {FREQ_OPTIONS.map((opt) => (
                <TouchableOpacity
                  key={opt.value}
                  onPress={() => updateSync({ syncFrequency: opt.value })}
                  style={{
                    paddingVertical: 8,
                    paddingHorizontal: 14,
                    borderRadius: 20,
                    backgroundColor: syncSettings.syncFrequency === opt.value ? "#059669" : colors.background,
                    borderWidth: 1,
                    borderColor: syncSettings.syncFrequency === opt.value ? "#059669" : colors.border,
                  }}
                >
                  <Text style={{ fontSize: 12, fontWeight: "600", color: syncSettings.syncFrequency === opt.value ? "#fff" : colors.foreground }}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Scope Toggles */}
            <Text style={{ fontSize: 13, fontWeight: "600", color: colors.foreground, marginBottom: 8, textAlign: isRTL ? "right" : "left" }}>
              {isAr ? "البيانات المشمولة" : isEn ? "Data Included" : "Opgenomen data"}
            </Text>
            {[
              { key: "syncChildren" as const, label: isAr ? "بيانات الأبناء" : isEn ? "Children data" : "Kinderdata" },
              { key: "syncIssues" as const, label: isAr ? "المشكلات المبلّغة" : isEn ? "Reported issues" : "Gemelde problemen" },
              { key: "syncActionPlans" as const, label: isAr ? "خطط العلاج" : isEn ? "Treatment plans" : "Behandelplannen" },
              { key: "syncEnvironments" as const, label: isAr ? "بيئة الطفل" : isEn ? "Child environment" : "Kindomgeving" },
              { key: "syncWeeklyProgress" as const, label: isAr ? "التقدم الأسبوعي" : isEn ? "Weekly progress" : "Wekelijkse voortgang" },
            ].map((item) => (
              <TouchableOpacity
                key={item.key}
                onPress={() => updateSync({ [item.key]: !syncSettings[item.key] })}
                style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: colors.border }}
              >
                <Text style={{ fontSize: 13, color: colors.foreground, textAlign: isRTL ? "right" : "left" }}>{item.label}</Text>
                <MaterialIcons
                  name={syncSettings[item.key] ? "toggle-on" : "toggle-off"}
                  size={32}
                  color={syncSettings[item.key] ? "#059669" : colors.muted}
                />
              </TouchableOpacity>
            ))}
          </View>

          {/* Info: manage network in شبكتي tab */}
          <View style={{ backgroundColor: colors.primary + "08", borderRadius: 12, padding: 16, borderWidth: 1, borderColor: colors.primary + "20", flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 10 }}>
            <MaterialIcons name="info-outline" size={20} color={colors.primary} />
            <Text style={{ flex: 1, fontSize: 12, color: colors.muted, textAlign: isRTL ? "right" : "left" }}>
              {language === "ar" ? "لإضافة أشخاص إلى شبكتك أو ربط الشريك، استخدم تبويب \"شبكتي\" في القائمة الرئيسية" : language === "en" ? "To add people to your network or link a partner, use the \"My Network\" tab in the main menu" : "Om personen aan uw netwerk toe te voegen of een partner te koppelen, gebruik het tabblad \"Mijn Netwerk\" in het hoofdmenu"}
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* QR Code Modal */}
      <Modal visible={qrModalVisible} transparent animationType="fade" onRequestClose={() => setQrModalVisible(false)}
        supportedOrientations={["portrait", "portrait-upside-down", "landscape"]}>
        {/* ScrollView: fixed-height card + landscape clips the close button. See components/prayer-popup-modal.tsx. */}
        <ScrollView
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)" }}
          contentContainerStyle={{ flexGrow: 1, justifyContent: "center", alignItems: "center" }}
        >
          <View style={{ backgroundColor: colors.background, borderRadius: 20, padding: 32, alignItems: "center", width: 300, gap: 16 }}>
            <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground, textAlign: "center" }}>
              {qrLabel}
            </Text>
            <View style={{ backgroundColor: "#fff", padding: 16, borderRadius: 12 }}>
              <QRCode value={qrValue || "empty"} size={180} />
            </View>
            <Text style={{ fontSize: 14, fontWeight: "600", color: colors.primary, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" }}>
              {qrValue}
            </Text>
            <Text style={{ fontSize: 11, color: colors.muted, textAlign: "center" }}>
              {language === "ar" ? "اجعل الشخص الآخر يمسح هذا الرمز" : language === "en" ? "Let the other person scan this code" : "Laat de andere persoon deze code scannen"}
            </Text>
            <TouchableOpacity
              onPress={() => setQrModalVisible(false)}
              style={{ backgroundColor: colors.surface, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 24, borderWidth: 1, borderColor: colors.border }}
            >
              <Text style={{ color: colors.foreground, fontWeight: "600" }}>
                {language === "ar" ? "إغلاق" : language === "en" ? "Close" : "Sluiten"}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </Modal>
    </ScreenContainer>
  );
}

// ============ ID HELPERS ============

const DAY_LETTERS = ["ZO", "MA", "DI", "WO", "DO", "VR", "ZA"];

function getChildIdString(birthDate: string, idx: number): string {
  const datePart = birthDate.replace(/-/g, "");
  const dayLetter = DAY_LETTERS[new Date(birthDate).getDay()];
  const seqPart = String(idx + 1).padStart(3, "0");
  return `${datePart}_${dayLetter}_${seqPart}`;
}

/**
 * Paid feature: advertised on the subscribe screen, so it is closed to
 * non-subscribers rather than shown with a banner over it. Wrapping rather
 * than an early return means every return path inside is covered, and the
 * inner component's hooks never run for a non-subscriber.
 */
export default function NetworkSettingsScreen() {
  return (
    <PremiumGate>
      <NetworkSettingsScreenInner />
    </PremiumGate>
  );
}
