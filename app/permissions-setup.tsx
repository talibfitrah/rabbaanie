import React, { useState, useEffect, useCallback } from "react";
import { View, Text, ScrollView, Pressable, Platform, Linking, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useI18n } from "@/lib/i18n";
import { useAppState } from "@/lib/app-context";

type PermissionStatus = "granted" | "denied" | "undetermined" | "unavailable";

interface PermissionItem {
  id: string;
  icon: string;
  iconColor: string;
  titleAr: string;
  titleEn: string;
  titleNl: string;
  descAr: string;
  descEn: string;
  descNl: string;
  status: PermissionStatus;
}

export default function PermissionsSetupScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { language, isRTL } = useI18n();
  const { completePermissionsSetup } = useAppState();
  const lang = language as "ar" | "en" | "nl";
  const [permissions, setPermissions] = useState<PermissionItem[]>([]);
  const [checking, setChecking] = useState(true);

  const tx = (ar: string, en: string, nl: string) => lang === "ar" ? ar : lang === "en" ? en : nl;

  const checkAllPermissions = useCallback(async () => {
    const items: PermissionItem[] = [];

    // 1. Location/GPS
    let locationStatus: PermissionStatus = "undetermined";
    if (Platform.OS !== "web") {
      try {
        const Location = require("expo-location");
        const { status } = await Location.getForegroundPermissionsAsync();
        locationStatus = status === "granted" ? "granted" : status === "denied" ? "denied" : "undetermined";
      } catch { locationStatus = "unavailable"; }
    } else {
      locationStatus = "unavailable";
    }
    items.push({
      id: "location",
      icon: "my-location",
      iconColor: "#1B4332",
      titleAr: "الموقع (GPS)",
      titleEn: "Location (GPS)",
      titleNl: "Locatie (GPS)",
      descAr: "لتحديد مدينتك وحساب أوقات الصلاة واتجاه القبلة والمساجد القريبة",
      descEn: "To determine your city, calculate prayer times, Qibla direction, and nearby mosques",
      descNl: "Om je stad te bepalen, gebedstijden te berekenen, Qibla-richting en nabijgelegen moskeeën",
      status: locationStatus,
    });

    // 2. Notifications
    let notifStatus: PermissionStatus = "undetermined";
    if (Platform.OS !== "web") {
      try {
        const Notifications = require("expo-notifications");
        const { status } = await Notifications.getPermissionsAsync();
        notifStatus = status === "granted" ? "granted" : status === "denied" ? "denied" : "undetermined";
      } catch { notifStatus = "unavailable"; }
    } else {
      notifStatus = "unavailable";
    }
    items.push({
      id: "notifications",
      icon: "notifications-active",
      iconColor: "#F59E0B",
      titleAr: "الإشعارات",
      titleEn: "Notifications",
      titleNl: "Meldingen",
      descAr: "لتنبيهات أوقات الصلاة والأذكار والتذكيرات الأسبوعية",
      descEn: "For prayer time alerts, adhkar reminders, and weekly notifications",
      descNl: "Voor gebedstijd-meldingen, adhkar-herinneringen en wekelijkse meldingen",
      status: notifStatus,
    });

    // 3. Audio notifications (sound)
    // On Android, notification sound is part of notification channel settings
    // On iOS, sound is part of notification permissions
    items.push({
      id: "audio_notifications",
      icon: "volume-up",
      iconColor: "#7C3AED",
      titleAr: "الإشعارات الصوتية (الأذان)",
      titleEn: "Audio Notifications (Adhan)",
      titleNl: "Geluidsmeldingen (Adhan)",
      descAr: "للسماح بتشغيل صوت الأذان والتنبيهات الصوتية مع الإشعارات",
      descEn: "To allow Adhan sound and audio alerts with notifications",
      descNl: "Om Adhan-geluid en audio-waarschuwingen bij meldingen toe te staan",
      status: notifStatus === "granted" ? "granted" : notifStatus, // Tied to notification permission
    });

    // 4. Do Not Disturb (DND) / Phone Silence.
    // Silencing the ringer at prayer time needs Android's "Do Not Disturb
    // access" (ACCESS_NOTIFICATION_POLICY). react-native-volume-manager can
    // actually report whether it's granted, so detect it instead of guessing.
    let dndStatus: PermissionStatus = "undetermined";
    if (Platform.OS === "android") {
      try {
        const { VolumeManager } = require("react-native-volume-manager");
        const hasAccess = await VolumeManager.checkDndAccess();
        dndStatus = hasAccess ? "granted" : "denied";
      } catch {
        dndStatus = "undetermined";
      }
    } else {
      // iOS DND is managed by system Focus modes, no app-grantable permission.
      dndStatus = "unavailable";
    }
    items.push({
      id: "dnd",
      icon: "do-not-disturb-on",
      iconColor: "#EF4444",
      titleAr: "عدم الإزعاج (إسكات الهاتف)",
      titleEn: "Do Not Disturb (Phone Silence)",
      titleNl: "Niet storen (Telefoon dempen)",
      descAr: "لإسكات الهاتف تلقائياً أثناء وقت الصلاة والإقامة",
      descEn: "To automatically silence the phone during prayer and Iqamah time",
      descNl: "Om de telefoon automatisch te dempen tijdens gebed en Iqamah",
      status: dndStatus,
    });

    // 4b. Battery optimization exemption (Android) — so notifications keep
    // firing while the app is closed (Doze/OEM battery managers cancel alarms).
    items.push({
      id: "battery",
      icon: "battery-alert",
      iconColor: "#F59E0B",
      titleAr: "استثناء من توفير البطارية",
      titleEn: "Battery Optimization Exemption",
      titleNl: "Uitzondering batterijoptimalisatie",
      descAr: "حتى تصل إشعارات الصلاة والنصائح والتطبيق مغلق",
      descEn: "So prayer & advice notifications arrive while the app is closed",
      descNl: "Zodat gebed- en adviesmeldingen aankomen terwijl de app gesloten is",
      status: Platform.OS === "android" ? "undetermined" : "unavailable",
    });

    // 5. Motion sensors (for compass/Qibla)
    let motionStatus: PermissionStatus = "undetermined";
    if (Platform.OS !== "web") {
      try {
        const { Magnetometer } = require("expo-sensors");
        const { status } = await Magnetometer.getPermissionsAsync();
        motionStatus = status === "granted" ? "granted" : status === "denied" ? "denied" : "undetermined";
      } catch {
        // Some devices don't require explicit permission for sensors
        motionStatus = "granted";
      }
    } else {
      motionStatus = "unavailable";
    }
    items.push({
      id: "motion",
      icon: "explore",
      iconColor: "#0EA5E9",
      titleAr: "مستشعرات الحركة (البوصلة)",
      titleEn: "Motion Sensors (Compass)",
      titleNl: "Bewegingssensoren (Kompas)",
      descAr: "لتحديد اتجاه القبلة بدقة عبر البوصلة",
      descEn: "To accurately determine Qibla direction via compass",
      descNl: "Om de Qibla-richting nauwkeurig te bepalen via het kompas",
      status: motionStatus,
    });

    setPermissions(items);
    setChecking(false);
  }, []);

  useEffect(() => {
    checkAllPermissions();
  }, [checkAllPermissions]);

  // Open the most relevant OS settings screen for a permission so the user can
  // always review or change it — even after it's granted. (Daa3iyah: the buttons
  // must always take me to the settings to modify them; battery did nothing.)
  const openPermissionSettings = async (id: string) => {
    if (Platform.OS !== "android") { Linking.openSettings(); return; }
    const IntentLauncher = require("expo-intent-launcher");
    let pkg = "com.app.opvoedadvies.apk";
    try { const Application = require("expo-application"); if (Application?.applicationId) pkg = Application.applicationId; } catch {}
    try {
      if (id === "battery") {
        await IntentLauncher.startActivityAsync("android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS");
      } else if (id === "dnd") {
        await IntentLauncher.startActivityAsync("android.settings.NOTIFICATION_POLICY_ACCESS_SETTINGS");
      } else if (id === "notifications" || id === "audio_notifications") {
        await IntentLauncher.startActivityAsync("android.settings.APP_NOTIFICATION_SETTINGS", {
          extra: { "android.provider.extra.APP_PACKAGE": pkg },
        });
      } else {
        await IntentLauncher.startActivityAsync(IntentLauncher.ActivityAction.APPLICATION_DETAILS_SETTINGS, {
          data: "package:" + pkg,
        });
      }
    } catch {
      Linking.openSettings();
    }
  };

  const requestPermission = async (id: string, status?: PermissionStatus) => {
    if (Platform.OS === "web") return;

    // Battery & DND have no in-app prompt (the battery direct-request silently
    // did nothing on some devices). Already-granted permissions also jump straight
    // to their settings so the user can review or toggle them off.
    if (id === "battery" || id === "dnd" || status === "granted") {
      await openPermissionSettings(id);
      setTimeout(() => checkAllPermissions(), 500);
      return;
    }

    switch (id) {
      case "location": {
        try {
          const Location = require("expo-location");
          const { status: s } = await Location.requestForegroundPermissionsAsync();
          if (s !== "granted") await openPermissionSettings(id);
        } catch { await openPermissionSettings(id); }
        break;
      }
      case "notifications":
      case "audio_notifications": {
        try {
          const Notifications = require("expo-notifications");
          const { status: s } = await Notifications.requestPermissionsAsync({
            ios: { allowAlert: true, allowBadge: true, allowSound: true },
          });
          if (s !== "granted") await openPermissionSettings(id);
        } catch { await openPermissionSettings(id); }
        break;
      }
      case "motion": {
        try {
          const { Magnetometer } = require("expo-sensors");
          const { status: s } = await Magnetometer.requestPermissionsAsync();
          if (s !== "granted") await openPermissionSettings(id);
        } catch { await openPermissionSettings(id); }
        break;
      }
    }

    // Re-check all permissions after granting
    setTimeout(() => checkAllPermissions(), 500);
  };

  const handleContinue = async () => {
    await completePermissionsSetup();
    router.replace("/(tabs)/" as any);
  };

  const grantedCount = permissions.filter(p => p.status === "granted").length;
  const totalCount = permissions.filter(p => p.status !== "unavailable").length;

  if (checking) {
    return (
      <View style={{ flex: 1, backgroundColor: "#FFFFFF", justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" color="#1B4332" />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#FFFFFF" }}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 20, paddingBottom: insets.bottom + 100, paddingHorizontal: 20 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={{ alignItems: "center", marginBottom: 24 }}>
          <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: "#1B4332" + "15", alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
            <MaterialIcons name="security" size={32} color="#1B4332" />
          </View>
          <Text style={{ fontSize: 22, fontWeight: "800", color: "#1B4332", textAlign: "center", marginBottom: 6 }}>
            {tx("إعداد الأذونات", "Permissions Setup", "Machtigingen instellen")}
          </Text>
          <Text style={{ fontSize: 14, color: "#687076", textAlign: "center", lineHeight: 20 }}>
            {tx(
              "يحتاج التطبيق إلى بعض الأذونات ليعمل بشكل كامل. اضغط على كل إذن لتفعيله.",
              "The app needs some permissions to work fully. Tap each permission to enable it.",
              "De app heeft enkele machtigingen nodig om volledig te werken. Tik op elke machtiging om deze in te schakelen."
            )}
          </Text>
        </View>

        {/* Progress */}
        <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", justifyContent: "center", marginBottom: 20, gap: 8 }}>
          <View style={{ height: 6, flex: 1, backgroundColor: "#E5E7EB", borderRadius: 3, overflow: "hidden" }}>
            <View style={{ height: "100%", width: totalCount > 0 ? `${(grantedCount / totalCount) * 100}%` : "0%", backgroundColor: "#1B4332", borderRadius: 3 }} />
          </View>
          <Text style={{ fontSize: 12, color: "#687076", fontWeight: "600" }}>
            {grantedCount}/{totalCount}
          </Text>
        </View>

        {/* Permission Cards */}
        {permissions.filter(p => p.status !== "unavailable").map((perm) => (
          <Pressable
            key={perm.id}
            onPress={() => requestPermission(perm.id, perm.status)}
            style={({ pressed }) => [{
              backgroundColor: perm.status === "granted" ? "#F0FDF4" : "#FFFFFF",
              borderWidth: 1.5,
              borderColor: perm.status === "granted" ? "#22C55E" + "60" : "#E5E7EB",
              borderRadius: 14,
              padding: 16,
              marginBottom: 12,
              flexDirection: isRTL ? "row-reverse" : "row",
              alignItems: "center",
              gap: 14,
              opacity: pressed ? 0.8 : 1,
            }]}
          >
            {/* Icon */}
            <View style={{
              width: 44, height: 44, borderRadius: 12,
              backgroundColor: perm.iconColor + "15",
              alignItems: "center", justifyContent: "center",
            }}>
              <MaterialIcons name={perm.icon as any} size={24} color={perm.iconColor} />
            </View>

            {/* Text */}
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, fontWeight: "700", color: "#11181C", textAlign: isRTL ? "right" : "left", marginBottom: 2 }}>
                {lang === "ar" ? perm.titleAr : lang === "en" ? perm.titleEn : perm.titleNl}
              </Text>
              <Text style={{ fontSize: 12, color: "#687076", textAlign: isRTL ? "right" : "left", lineHeight: 16 }}>
                {lang === "ar" ? perm.descAr : lang === "en" ? perm.descEn : perm.descNl}
              </Text>
            </View>

            {/* Status indicator */}
            <View style={{
              width: 28, height: 28, borderRadius: 14,
              backgroundColor: perm.status === "granted" ? "#22C55E" : perm.status === "denied" ? "#EF4444" + "20" : "#F3F4F6",
              alignItems: "center", justifyContent: "center",
            }}>
              {perm.status === "granted" ? (
                <MaterialIcons name="check" size={18} color="#FFFFFF" />
              ) : perm.status === "denied" ? (
                <MaterialIcons name="close" size={16} color="#EF4444" />
              ) : (
                <MaterialIcons name="chevron-right" size={18} color="#9CA3AF" />
              )}
            </View>
          </Pressable>
        ))}

        {/* Info note */}
        <View style={{ backgroundColor: "#FEF3C7", borderRadius: 10, padding: 12, marginTop: 8, flexDirection: isRTL ? "row-reverse" : "row", alignItems: "flex-start", gap: 8 }}>
          <MaterialIcons name="info-outline" size={18} color="#D97706" style={{ marginTop: 1 }} />
          <Text style={{ flex: 1, fontSize: 12, color: "#92400E", lineHeight: 17, textAlign: isRTL ? "right" : "left" }}>
            {tx(
              "يمكنك تغيير هذه الأذونات لاحقًا من إعدادات التطبيق أو إعدادات الهاتف. الأذونات المرفوضة يمكن تفعيلها من إعدادات النظام.",
              "You can change these permissions later from app settings or phone settings. Denied permissions can be enabled from system settings.",
              "Je kunt deze machtigingen later wijzigen vanuit app-instellingen of telefooninstellingen. Geweigerde machtigingen kunnen worden ingeschakeld vanuit systeeminstellingen."
            )}
          </Text>
        </View>
      </ScrollView>

      {/* Bottom button */}
      <View style={{
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        paddingHorizontal: 20,
        paddingBottom: insets.bottom + 16,
        paddingTop: 12,
        backgroundColor: "#FFFFFF",
        borderTopWidth: 1,
        borderTopColor: "#E5E7EB",
      }}>
        <Pressable
          onPress={handleContinue}
          style={({ pressed }) => [{
            backgroundColor: "#1B4332",
            borderRadius: 14,
            paddingVertical: 16,
            alignItems: "center",
            opacity: pressed ? 0.9 : 1,
          }]}
        >
          <Text style={{ color: "#FFFFFF", fontSize: 16, fontWeight: "700" }}>
            {grantedCount === totalCount
              ? tx("متابعة", "Continue", "Doorgaan")
              : tx("متابعة (يمكنك الضبط لاحقًا)", "Continue (you can set up later)", "Doorgaan (je kunt later instellen)")
            }
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
