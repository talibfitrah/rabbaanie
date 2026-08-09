/**
 * Usage Stats Permission Setup Screen
 *
 * This screen guides the parent/child through granting the
 * PACKAGE_USAGE_STATS permission on Android. This is required
 * to monitor which apps the child uses.
 *
 * Flow:
 * 1. Explain why the permission is needed
 * 2. Check if already granted
 * 3. If not, guide user to system settings
 * 4. On return, verify permission was granted
 * 5. Start collecting data
 */
import { useState, useEffect, useCallback, useRef } from "react";
import {
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  Platform,
  Alert,
  AppState,
  Linking,
  ActivityIndicator,
} from "react-native";
import { Redirect, useRouter, useLocalSearchParams } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { CHILD_MONITORING_ENABLED } from "@/lib/distribution";
import { useI18n } from "@/lib/i18n";
import {
  isNativeModuleAvailable,
  isUsageStatsPermissionGranted,
  requestUsageStatsPermission,
  fetchAndStoreExternalUsage,
} from "@/lib/app-usage-tracker";
import { runNoticeGatedCollection } from "@/lib/monitoring-notice";

export default function UsagePermissionScreen() {
  const colors = useColors();
  const router = useRouter();
  const { t, language } = useI18n();
  const params = useLocalSearchParams<{
    accountId: string;
    returnTo: string;
  }>();
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [checking, setChecking] = useState(true);
  const [moduleAvailable, setModuleAvailable] = useState(false);
  const [noticeReady, setNoticeReady] = useState<boolean | null>(null);
  const [noticeAttempt, setNoticeAttempt] = useState(0);
  const noticeReadyRef = useRef<boolean | null>(null);

  const isRTL = language === "ar";

  // Check permission status
  useEffect(() => {
    noticeReadyRef.current = noticeReady;
  }, [noticeReady]);

  const checkPermission = useCallback((): boolean => {
    const available = isNativeModuleAvailable();
    setModuleAvailable(available);
    if (available) {
      const granted = isUsageStatsPermissionGranted();
      setPermissionGranted(granted);
      setChecking(false);
      return granted;
    }
    setChecking(false);
    return false;
  }, []);

  useEffect(() => {
    // Channel first, and inside the effect rather than above it because hooks
    // cannot be skipped. The <Redirect> further down runs only AFTER these
    // effects have already probed the native module and attached an AppState
    // listener; on Play they are inert solely because the module is absent —
    // an accident of the autolinking exclusion, which child-account/home.tsx
    // explicitly refuses to rely on. Same invariant, stated the same way here.
    if (!CHILD_MONITORING_ENABLED) return;
    checkPermission();
    // Re-check when app comes back to foreground (after settings)
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        const granted = checkPermission();
        if (granted && noticeReadyRef.current === false) {
          setNoticeAttempt((attempt) => attempt + 1);
        }
      }
    });
    return () => subscription.remove();
  }, [checkPermission]);

  // Monitoring is allowed to start only after its persistent notice is visible.
  useEffect(() => {
    let cancelled = false;
    if (!CHILD_MONITORING_ENABLED) return;
    if (!permissionGranted) {
      setNoticeReady(null);
      return () => {
        cancelled = true;
      };
    }

    setNoticeReady(null);
    void (async () => {
      const completed = await runNoticeGatedCollection({
        language,
        isCancelled: () => cancelled,
        collect: async () => {
          await fetchAndStoreExternalUsage();
        },
      });
      if (!cancelled) setNoticeReady(completed);
    })().catch((error) => {
      if (!cancelled) setNoticeReady(false);
      console.warn("[Monitoring] Could not start usage collection:", error);
    });

    return () => {
      cancelled = true;
    };
  }, [language, noticeAttempt, permissionGranted]);

  const handleOpenSettings = () => {
    const opened = requestUsageStatsPermission();
    if (!opened) {
      Alert.alert(
        language === "ar" ? "خطأ" : language === "nl" ? "Fout" : "Error",
        language === "ar"
          ? "لم نتمكن من فتح الإعدادات. يرجى الذهاب يدوياً إلى: الإعدادات > التطبيقات > الوصول الخاص > الوصول إلى بيانات الاستخدام"
          : language === "nl"
            ? "Kon instellingen niet openen. Ga handmatig naar: Instellingen > Apps > Speciale toegang > Gebruiksgegevens"
            : "Could not open settings. Please go manually to: Settings > Apps > Special access > Usage data access",
      );
    }
  };

  const handleDone = () => {
    if (params.returnTo) {
      router.replace(params.returnTo as any);
    } else {
      router.back();
    }
  };

  // App-usage monitoring is the one sideload-only capability inside child mode.
  // The Play build ships without PACKAGE_USAGE_STATS and without the native
  // module, so this screen could only ever offer a permission it cannot hold —
  // and a Play reviewer finding a "grant usage access" flow is the exact
  // stalkerware signature the build is shaped to avoid. Guarded here rather
  // than in the router because the router only sees the top-level segment, and
  // a screen-level guard holds for every route that reaches this file.
  if (!CHILD_MONITORING_ENABLED) return <Redirect href="/(tabs)" />;

  // Not Android - show message
  if (Platform.OS !== "android") {
    return (
      <ScreenContainer
        className="p-6"
        edges={["top", "bottom", "left", "right"]}
      >
        <View className="flex-1 items-center justify-center gap-4">
          <Text style={{ fontSize: 60 }}>📱</Text>
          <Text className="text-xl font-bold text-foreground text-center">
            {language === "ar"
              ? "هذه الميزة متاحة فقط على Android"
              : language === "nl"
                ? "Deze functie is alleen beschikbaar op Android"
                : "This feature is only available on Android"}
          </Text>
          <Text className="text-base text-muted text-center mt-2">
            {language === "ar"
              ? "نظام iOS لا يسمح بمراقبة استخدام التطبيقات الأخرى. يمكنك استخدام Screen Time المدمج في iPhone."
              : language === "nl"
                ? "iOS staat het monitoren van app-gebruik niet toe. Gebruik de ingebouwde Schermtijd op iPhone."
                : "iOS does not allow monitoring other app usage. Use the built-in Screen Time on iPhone."}
          </Text>
          <TouchableOpacity
            onPress={() => router.back()}
            style={{
              backgroundColor: colors.primary,
              paddingHorizontal: 32,
              paddingVertical: 14,
              borderRadius: 12,
              marginTop: 20,
            }}
          >
            <Text style={{ color: "#fff", fontWeight: "700", fontSize: 16 }}>
              {language === "ar"
                ? "رجوع"
                : language === "nl"
                  ? "Terug"
                  : "Back"}
            </Text>
          </TouchableOpacity>
        </View>
      </ScreenContainer>
    );
  }

  if (checking || (permissionGranted && noticeReady === null)) {
    return (
      <ScreenContainer
        className="p-6"
        edges={["top", "bottom", "left", "right"]}
      >
        <View className="flex-1 items-center justify-center gap-4">
          <ActivityIndicator size="large" color={colors.primary} />
          <Text className="text-base text-muted text-center">
            {language === "ar"
              ? "جارٍ التحقق من الحماية…"
              : language === "nl"
                ? "Beveiliging controleren…"
                : "Checking protection…"}
          </Text>
        </View>
      </ScreenContainer>
    );
  }

  // Native module not available (Expo Go / web preview)
  if (!moduleAvailable && !checking) {
    return (
      <ScreenContainer
        className="p-6"
        edges={["top", "bottom", "left", "right"]}
      >
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            justifyContent: "center",
            alignItems: "center",
            gap: 16,
          }}
        >
          <Text style={{ fontSize: 60 }}>🔧</Text>
          <Text className="text-xl font-bold text-foreground text-center">
            {language === "ar"
              ? "يتطلب التثبيت كتطبيق APK"
              : language === "nl"
                ? "Vereist APK-installatie"
                : "Requires APK installation"}
          </Text>
          <Text
            className="text-base text-muted text-center mt-2"
            style={{ paddingHorizontal: 20 }}
          >
            {language === "ar"
              ? "مراقبة التطبيقات الخارجية تتطلب تثبيت التطبيق كـ APK على هاتف الطفل (وليس عبر Expo Go). بعد التثبيت، ستتمكن من:\n\n• رؤية جميع التطبيقات المستخدمة\n• معرفة مدة استخدام كل تطبيق\n• تصنيف التطبيقات (ألعاب، تواصل، تعليم...)\n• تلقي تنبيهات عند الاستخدام المفرط"
              : language === "nl"
                ? "Het monitoren van externe apps vereist installatie als APK op het telefoon van het kind (niet via Expo Go). Na installatie kunt u:\n\n• Alle gebruikte apps zien\n• De gebruiksduur per app bekijken\n• Apps categoriseren (games, sociaal, educatief...)\n• Waarschuwingen ontvangen bij overmatig gebruik"
                : "Monitoring external apps requires installing the app as APK on the child's phone (not via Expo Go). After installation, you can:\n\n• See all used apps\n• View usage duration per app\n• Categorize apps (games, social, education...)\n• Receive alerts for excessive usage"}
          </Text>

          <View
            style={{
              backgroundColor: colors.surface,
              borderRadius: 12,
              padding: 16,
              marginTop: 16,
              width: "100%",
            }}
          >
            <Text
              className="text-sm font-semibold text-foreground mb-2"
              style={{ textAlign: isRTL ? "right" : "left" }}
            >
              {language === "ar"
                ? "📋 خطوات التفعيل:"
                : language === "nl"
                  ? "📋 Activeringsstappen:"
                  : "📋 Activation steps:"}
            </Text>
            {[
              language === "ar"
                ? "1. انشر التطبيق كـ APK (زر Publish)"
                : language === "nl"
                  ? "1. Publiceer de app als APK (Publish-knop)"
                  : "1. Publish the app as APK (Publish button)",
              language === "ar"
                ? "2. ثبّت APK على هاتف الطفل"
                : language === "nl"
                  ? "2. Installeer APK op het telefoon van het kind"
                  : "2. Install APK on the child's phone",
              language === "ar"
                ? "3. افتح هذه الشاشة مرة أخرى"
                : language === "nl"
                  ? "3. Open dit scherm opnieuw"
                  : "3. Open this screen again",
              language === "ar"
                ? "4. امنح إذن الوصول لبيانات الاستخدام"
                : language === "nl"
                  ? "4. Verleen toegang tot gebruiksgegevens"
                  : "4. Grant usage data access permission",
            ].map((step, i) => (
              <Text
                key={i}
                className="text-sm text-muted"
                style={{ textAlign: isRTL ? "right" : "left", marginTop: 4 }}
              >
                {step}
              </Text>
            ))}
          </View>

          <TouchableOpacity
            onPress={() => router.back()}
            style={{
              backgroundColor: colors.primary,
              paddingHorizontal: 32,
              paddingVertical: 14,
              borderRadius: 12,
              marginTop: 24,
            }}
          >
            <Text style={{ color: "#fff", fontWeight: "700", fontSize: 16 }}>
              {language === "ar"
                ? "فهمت"
                : language === "nl"
                  ? "Begrepen"
                  : "Got it"}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </ScreenContainer>
    );
  }

  if (permissionGranted && noticeReady === false) {
    return (
      <ScreenContainer
        className="p-6"
        edges={["top", "bottom", "left", "right"]}
      >
        <View className="flex-1 items-center justify-center gap-4">
          <Text style={{ fontSize: 60 }}>🔔</Text>
          <Text className="text-xl font-bold text-foreground text-center">
            {language === "ar"
              ? "فعّل الإشعارات لبدء المراقبة"
              : language === "nl"
                ? "Schakel meldingen in om monitoring te starten"
                : "Enable notifications to start monitoring"}
          </Text>
          <Text className="text-base text-muted text-center mt-2">
            {language === "ar"
              ? "لن نجمع أو نشارك بيانات الاستخدام ما لم يظهر إشعار مراقبة دائم على هذا الجهاز. فعّل إشعارات ربّانيّ ثم ارجع إلى هذه الشاشة."
              : language === "nl"
                ? "We verzamelen of delen geen gebruiksgegevens tenzij op dit apparaat een permanente monitoringmelding zichtbaar is. Schakel Rabbaanie-meldingen in en keer daarna terug."
                : "We do not collect or share usage data unless a persistent monitoring notice is visible on this device. Enable Rabbaanie notifications, then return here."}
          </Text>
          <TouchableOpacity
            onPress={() => void Linking.openSettings()}
            style={{
              backgroundColor: colors.primary,
              paddingHorizontal: 32,
              paddingVertical: 14,
              borderRadius: 12,
              marginTop: 20,
            }}
          >
            <Text style={{ color: "#fff", fontWeight: "700", fontSize: 16 }}>
              {language === "ar"
                ? "فتح إعدادات التطبيق"
                : language === "nl"
                  ? "App-instellingen openen"
                  : "Open App Settings"}
            </Text>
          </TouchableOpacity>
        </View>
      </ScreenContainer>
    );
  }

  // Permission granted and the required notice is visible - success state.
  if (permissionGranted && noticeReady === true) {
    return (
      <ScreenContainer
        className="p-6"
        edges={["top", "bottom", "left", "right"]}
      >
        <View className="flex-1 items-center justify-center gap-4">
          <Text style={{ fontSize: 60 }}>✅</Text>
          <Text className="text-xl font-bold text-foreground text-center">
            {language === "ar"
              ? "تم تفعيل المراقبة بنجاح!"
              : language === "nl"
                ? "Monitoring succesvol geactiveerd!"
                : "Monitoring successfully activated!"}
          </Text>
          <Text className="text-base text-muted text-center mt-2">
            {language === "ar"
              ? "سيتم الآن تتبع استخدام التطبيقات على هذا الجهاز وإرسال التقارير للوالدين."
              : language === "nl"
                ? "App-gebruik op dit apparaat wordt nu bijgehouden en rapporten worden naar de ouders gestuurd."
                : "App usage on this device will now be tracked and reports sent to parents."}
          </Text>

          <View
            style={{
              backgroundColor: "#E8F5E9",
              borderRadius: 12,
              padding: 16,
              marginTop: 16,
              width: "100%",
            }}
          >
            <Text
              style={{
                color: "#2E7D32",
                fontWeight: "600",
                textAlign: "center",
              }}
            >
              {language === "ar"
                ? "📊 البيانات تُجمع تلقائياً وتُرسل عند فتح التطبيق"
                : language === "nl"
                  ? "📊 Gegevens worden automatisch verzameld en verzonden bij het openen van de app"
                  : "📊 Data is collected automatically and sent when the app is opened"}
            </Text>
          </View>

          <TouchableOpacity
            onPress={handleDone}
            style={{
              backgroundColor: colors.primary,
              paddingHorizontal: 32,
              paddingVertical: 14,
              borderRadius: 12,
              marginTop: 24,
            }}
          >
            <Text style={{ color: "#fff", fontWeight: "700", fontSize: 16 }}>
              {language === "ar" ? "تم" : language === "nl" ? "Klaar" : "Done"}
            </Text>
          </TouchableOpacity>
        </View>
      </ScreenContainer>
    );
  }

  // Permission not granted - guide user
  return (
    <ScreenContainer className="p-6" edges={["top", "bottom", "left", "right"]}>
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, gap: 16 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View className="items-center gap-3 mt-4">
          <Text style={{ fontSize: 60 }}>🛡️</Text>
          <Text className="text-2xl font-bold text-foreground text-center">
            {language === "ar"
              ? "تفعيل مراقبة التطبيقات"
              : language === "nl"
                ? "App-monitoring activeren"
                : "Activate App Monitoring"}
          </Text>
        </View>

        {/* Explanation */}
        <View
          style={{
            backgroundColor: colors.surface,
            borderRadius: 12,
            padding: 16,
            marginTop: 8,
          }}
        >
          <Text
            className="text-base text-foreground"
            style={{ textAlign: isRTL ? "right" : "left", lineHeight: 24 }}
          >
            {language === "ar"
              ? "لمراقبة التطبيقات التي يستخدمها طفلك، نحتاج إذن الوصول إلى بيانات الاستخدام. هذا يسمح لنا بـ:"
              : language === "nl"
                ? "Om de apps die uw kind gebruikt te monitoren, hebben we toegang tot gebruiksgegevens nodig. Dit stelt ons in staat om:"
                : "To monitor the apps your child uses, we need access to usage data. This allows us to:"}
          </Text>
          <View style={{ marginTop: 12, gap: 8 }}>
            {[
              {
                icon: "📱",
                text:
                  language === "ar"
                    ? "معرفة التطبيقات المستخدمة يومياً"
                    : language === "nl"
                      ? "Dagelijks gebruikte apps zien"
                      : "See daily used apps",
              },
              {
                icon: "⏱️",
                text:
                  language === "ar"
                    ? "حساب مدة استخدام كل تطبيق"
                    : language === "nl"
                      ? "Gebruiksduur per app berekenen"
                      : "Calculate usage time per app",
              },
              {
                icon: "📊",
                text:
                  language === "ar"
                    ? "إرسال تقارير للوالدين"
                    : language === "nl"
                      ? "Rapporten naar ouders sturen"
                      : "Send reports to parents",
              },
              {
                icon: "⚠️",
                text:
                  language === "ar"
                    ? "تنبيه عند الاستخدام المفرط"
                    : language === "nl"
                      ? "Waarschuwen bij overmatig gebruik"
                      : "Alert on excessive usage",
              },
            ].map((item, i) => (
              <View
                key={i}
                style={{
                  flexDirection: isRTL ? "row-reverse" : "row",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <Text style={{ fontSize: 18 }}>{item.icon}</Text>
                <Text
                  className="text-sm text-muted flex-1"
                  style={{ textAlign: isRTL ? "right" : "left" }}
                >
                  {item.text}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* Privacy note */}
        <View
          style={{
            backgroundColor: "#FFF3E0",
            borderRadius: 12,
            padding: 12,
            borderWidth: 1,
            borderColor: "#FFE0B2",
          }}
        >
          <Text
            style={{
              color: "#E65100",
              fontSize: 13,
              textAlign: isRTL ? "right" : "left",
              lineHeight: 20,
            }}
          >
            {language === "ar"
              ? "🔒 الخصوصية: البيانات تُخزن محلياً وتُرسل فقط لحساب الوالدين المرتبط. لا نشارك البيانات مع أي طرف ثالث."
              : language === "nl"
                ? "🔒 Privacy: Gegevens worden lokaal opgeslagen en alleen naar het gekoppelde ouderaccount gestuurd. We delen geen gegevens met derden."
                : "🔒 Privacy: Data is stored locally and only sent to the linked parent account. We do not share data with any third party."}
          </Text>
        </View>

        {/* Steps */}
        <View
          style={{
            backgroundColor: colors.surface,
            borderRadius: 12,
            padding: 16,
          }}
        >
          <Text
            className="text-sm font-semibold text-foreground mb-3"
            style={{ textAlign: isRTL ? "right" : "left" }}
          >
            {language === "ar"
              ? "خطوات التفعيل:"
              : language === "nl"
                ? "Stappen:"
                : "Steps:"}
          </Text>
          {[
            language === "ar"
              ? "اضغط على الزر أدناه لفتح الإعدادات"
              : language === "nl"
                ? "Druk op de knop hieronder om instellingen te openen"
                : "Press the button below to open settings",
            language === "ar"
              ? 'ابحث عن تطبيق "ربّاني" في القائمة'
              : language === "nl"
                ? 'Zoek de app "Rabbaani" in de lijst'
                : 'Find the app "Rabbaani" in the list',
            language === "ar"
              ? "فعّل إذن الوصول لبيانات الاستخدام"
              : language === "nl"
                ? "Schakel toegang tot gebruiksgegevens in"
                : "Enable usage data access",
            language === "ar"
              ? "ارجع إلى التطبيق"
              : language === "nl"
                ? "Keer terug naar de app"
                : "Return to the app",
          ].map((step, i) => (
            <View
              key={i}
              style={{
                flexDirection: isRTL ? "row-reverse" : "row",
                alignItems: "flex-start",
                gap: 8,
                marginTop: 8,
              }}
            >
              <View
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 12,
                  backgroundColor: colors.primary,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text
                  style={{ color: "#fff", fontSize: 12, fontWeight: "700" }}
                >
                  {i + 1}
                </Text>
              </View>
              <Text
                className="text-sm text-muted flex-1"
                style={{ textAlign: isRTL ? "right" : "left", lineHeight: 20 }}
              >
                {step}
              </Text>
            </View>
          ))}
        </View>

        {/* Action button */}
        <TouchableOpacity
          onPress={handleOpenSettings}
          style={{
            backgroundColor: colors.primary,
            paddingVertical: 16,
            borderRadius: 12,
            alignItems: "center",
            marginTop: 8,
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.1,
            shadowRadius: 4,
            elevation: 3,
          }}
        >
          <Text style={{ color: "#fff", fontWeight: "700", fontSize: 16 }}>
            {language === "ar"
              ? "⚙️ فتح إعدادات الوصول"
              : language === "nl"
                ? "⚙️ Open toegangsinstellingen"
                : "⚙️ Open Access Settings"}
          </Text>
        </TouchableOpacity>

        {/* Skip button */}
        <TouchableOpacity
          onPress={() => router.back()}
          style={{ paddingVertical: 12, alignItems: "center" }}
        >
          <Text className="text-sm text-muted">
            {language === "ar"
              ? "تخطي (يمكنك التفعيل لاحقاً)"
              : language === "nl"
                ? "Overslaan (later activeren)"
                : "Skip (activate later)"}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </ScreenContainer>
  );
}
