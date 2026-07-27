import React, { useState, useCallback, useEffect, useRef } from "react";
import { View, Text, Pressable, ScrollView, Alert, Platform, ActivityIndicator, Linking, TextInput, FlatList,
  KeyboardAvoidingView,
} from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as IntentLauncher from "expo-intent-launcher";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/use-colors";
import { useAppState } from "@/lib/app-context";
import { DateTimeHeader } from "@/components/date-time-header";
import { useI18n } from "@/lib/i18n";
import { withTimeout } from "@/lib/location-utils";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  PRAYER_LOCATION_KEY,
  PRAYER_METHOD_KEY,
  CALC_METHODS,
  COUNTRIES,
  COUNTRY_NAMES,
  getCityAR,
  getCountryAR,
  type SavedPrayerLocation,
  type CalcMethod,
} from "@/lib/prayer-data";
import {
  loadNotificationPrefs,
  saveNotificationPrefs,
  requestNotificationPermissions,
  scheduleAllNotifications,
  getScheduledCount,
  scheduleWeeklyReminder,
  loadWeeklyReminderPrefs,
  saveWeeklyReminderPrefs,
  type NotificationPrefs,
  type WeeklyReminderPrefs,
  DEFAULT_NOTIFICATION_PREFS,
  DEFAULT_WEEKLY_REMINDER_PREFS,
  ADHAN_SOUND_OPTIONS,
  NATURE_SOUND_OPTIONS,
  type AdhanSoundOption,
  type NatureSoundOption,
} from "@/lib/notifications";
import {
  loadIqamahSilencePrefs,
  saveIqamahSilencePrefs,
  scheduleIqamahSilence,
  type IqamahSilencePrefs,
  DEFAULT_IQAMAH_SILENCE_PREFS,
} from "@/lib/iqamah-silence";
import {
  loadIslamicRemindersPrefs,
  saveIslamicRemindersPrefs,
  scheduleIslamicReminders,
  cancelIslamicReminders,
  type IslamicRemindersPrefs,
  DEFAULT_ISLAMIC_REMINDERS_PREFS,
} from "@/lib/islamic-reminders";
import { useThemeContext } from "@/lib/theme-provider";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/hooks/use-auth";
import { useUpdates } from "@/hooks/use-updates";
import { getSessionRole } from "@/lib/_core/auth";


const REMINDER_OPTIONS_KEYS = [
  { value: 7, key: "settings.every_week" },
  { value: 14, key: "settings.every_2_weeks" },
  { value: 30, key: "settings.every_month" },
  { value: 60, key: "settings.every_2_months" },
  { value: 90, key: "settings.every_quarter" },
];

// Lazy-load expo-location to prevent crashes on platforms where it's not available
let LocationModule: any = null;
function getLocationModule() {
  if (!LocationModule) {
    try {
      LocationModule = require("expo-location");
    } catch (e) {
      LocationModule = null;
    }
  }
    return LocationModule;
}

// Address editor component for settings
function AddressEditor({ language, isRTL, colors }: { language: string; isRTL: boolean; colors: any }) {
  const { state, updateParentProfile } = useAppState();
  const isEn = language === "en";
  const [streetHouse, setStreetHouse] = useState(state.parentProfile.streetHouseNumber || "");
  const [postalCity, setPostalCity] = useState(state.parentProfile.postalCodeCity || "");
  const [addressCountry, setAddressCountry] = useState(state.parentProfile.country || "");
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    await updateParentProfile({ streetHouseNumber: streetHouse, postalCodeCity: postalCity, country: addressCountry });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <View style={{ gap: 10 }}>
      <View>
        <Text style={{ color: colors.muted, fontSize: 12, marginBottom: 4, textAlign: isRTL ? "right" : "left" }}>
          {language === "ar" ? "الشارع ورقم البيت" : isEn ? "Street & House number" : "Straat & Huisnummer"}
        </Text>
        <TextInput
          value={streetHouse}
          onChangeText={setStreetHouse}
          placeholder={language === "ar" ? "مثال: شارع النور 12" : isEn ? "e.g. Main Street 12" : "bijv. Hoofdstraat 12"}
          placeholderTextColor={colors.muted + "80"}
          style={{ backgroundColor: colors.surface, borderRadius: 8, padding: 12, color: colors.foreground, textAlign: isRTL ? "right" : "left", borderWidth: 1, borderColor: colors.border }}
        />
      </View>
      <View>
        <Text style={{ color: colors.muted, fontSize: 12, marginBottom: 4, textAlign: isRTL ? "right" : "left" }}>
          {language === "ar" ? "الرمز البريدي والمدينة" : isEn ? "Postal code & City" : "Postcode & Stad"}
        </Text>
        <TextInput
          value={postalCity}
          onChangeText={setPostalCity}
          placeholder={language === "ar" ? "مثال: 1234 AB أمستردام" : isEn ? "e.g. 1234 AB Amsterdam" : "bijv. 1234 AB Amsterdam"}
          placeholderTextColor={colors.muted + "80"}
          style={{ backgroundColor: colors.surface, borderRadius: 8, padding: 12, color: colors.foreground, textAlign: isRTL ? "right" : "left", borderWidth: 1, borderColor: colors.border }}
        />
      </View>
      <View>
        <Text style={{ color: colors.muted, fontSize: 12, marginBottom: 4, textAlign: isRTL ? "right" : "left" }}>
          {language === "ar" ? "البلد" : isEn ? "Country" : "Land"}
        </Text>
        <TextInput
          value={addressCountry}
          onChangeText={setAddressCountry}
          placeholder={language === "ar" ? "مثال: هولندا" : isEn ? "e.g. Netherlands" : "bijv. Nederland"}
          placeholderTextColor={colors.muted + "80"}
          style={{ backgroundColor: colors.surface, borderRadius: 8, padding: 12, color: colors.foreground, textAlign: isRTL ? "right" : "left", borderWidth: 1, borderColor: colors.border }}
        />
      </View>
      <Pressable
        onPress={handleSave}
        style={({ pressed }) => [{
          backgroundColor: saved ? colors.success : colors.primary,
          borderRadius: 10,
          paddingVertical: 12,
          alignItems: "center" as const,
          opacity: pressed ? 0.8 : 1,
          marginTop: 4,
        }]}
      >
        <Text style={{ color: "#ffffff", fontSize: 14, fontWeight: "bold" }}>
          {saved ? (language === "ar" ? "✓ تم الحفظ" : isEn ? "✓ Saved" : "✓ Opgeslagen") : (language === "ar" ? "حفظ العنوان" : isEn ? "Save Address" : "Adres opslaan")}
        </Text>
      </Pressable>
    </View>
  );
}

// Collapsible section wrapper for settings
function SettingsCollapsible({ title, icon, iconColor, children, colors, isRTL, defaultOpen = false }: {
  title: string; icon: string; iconColor?: string; children: React.ReactNode; colors: any; isRTL: boolean; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <View className="rounded-2xl mb-4 border" style={{ backgroundColor: colors.surface, borderColor: colors.border, overflow: "hidden" }}>
      <Pressable
        onPress={() => setOpen(!open)}
        style={({ pressed }) => [{
          flexDirection: isRTL ? "row-reverse" : "row",
          alignItems: "center",
          justifyContent: "space-between",
          padding: 16,
          opacity: pressed ? 0.8 : 1,
        }]}
      >
        <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 10 }}>
          <MaterialIcons name={icon as any} size={20} color={iconColor || colors.primary} />
          <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground }}>{title}</Text>
        </View>
        <MaterialIcons name={open ? "keyboard-arrow-up" : "keyboard-arrow-down"} size={24} color={colors.muted} />
      </Pressable>
      {open && <View style={{ paddingHorizontal: 16, paddingBottom: 16 }}>{children}</View>}
    </View>
  );
}

export default function SettingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t, language, setLanguage, isRTL } = useI18n();
  const isEn = language === "en";
  const { colorScheme, setColorScheme } = useThemeContext();
  const isDark = colorScheme === "dark";
  const { state, updateReminderSettings, updateLocationSettings, resetState, removeChild } = useAppState();
  const { isAuthenticated } = useAuth();
  const [adminRole, setAdminRole] = useState<string | null>(null);
  useEffect(() => { getSessionRole().then(setAdminRole); }, []);
  const isAdminUser = ["admin", "super_admin", "moderator"].includes(adminRole || "");
  const myIdQuery = trpc.links.getMyId.useQuery(undefined, { enabled: isAuthenticated });
  const [showFrequency, setShowFrequency] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsError, setGpsError] = useState("");
  const [gpsStep, setGpsStep] = useState(""); // For showing progress to user

  // Prayer settings state
  const [prayerLocation, setPrayerLocation] = useState<SavedPrayerLocation | null>(null);
  const [prayerMethod, setPrayerMethod] = useState<CalcMethod>(CALC_METHODS[0]);
  const [prayerSelecting, setPrayerSelecting] = useState<"country" | "city" | "method" | null>(null);
  const [prayerSelectedCountry, setPrayerSelectedCountry] = useState<string | null>(null);
  const [prayerLoaded, setPrayerLoaded] = useState(false);

  // Notification state
  const [notifPrefs, setNotifPrefs] = useState<NotificationPrefs>(DEFAULT_NOTIFICATION_PREFS);
  const [notifScheduledCount, setNotifScheduledCount] = useState(0);
  const [notifPermissionDenied, setNotifPermissionDenied] = useState(false);
  const [showMinutesBefore, setShowMinutesBefore] = useState(false);
  const [weeklyReminderPrefs, setWeeklyReminderPrefs] = useState<WeeklyReminderPrefs>(DEFAULT_WEEKLY_REMINDER_PREFS);

  // Iqamah silence state
  const [iqamahPrefs, setIqamahPrefs] = useState<IqamahSilencePrefs>(DEFAULT_IQAMAH_SILENCE_PREFS);

  // Islamic reminders state
  const [islamicPrefs, setIslamicPrefs] = useState<IslamicRemindersPrefs>(DEFAULT_ISLAMIC_REMINDERS_PREFS);



  // Load prayer settings on mount
  React.useEffect(() => {
    Promise.all([
      AsyncStorage.getItem(PRAYER_LOCATION_KEY),
      AsyncStorage.getItem(PRAYER_METHOD_KEY),
    ]).then(([locVal, methodVal]) => {
      if (locVal) {
        try { setPrayerLocation(JSON.parse(locVal)); } catch (_) {}
      }
      if (methodVal) {
        const found = CALC_METHODS.find(m => m.id === methodVal);
        if (found) setPrayerMethod(found);
      }
      setPrayerLoaded(true);
    });
  }, []);

  // Load notification preferences on mount
  useEffect(() => {
    loadNotificationPrefs().then((prefs) => {
      setNotifPrefs(prefs);
    });
    loadWeeklyReminderPrefs().then((prefs) => {
      setWeeklyReminderPrefs(prefs);
    });
    loadIqamahSilencePrefs().then((prefs) => {
      setIqamahPrefs(prefs);
    });
    loadIslamicRemindersPrefs().then((prefs) => {
      setIslamicPrefs(prefs);
    });
    if (Platform.OS !== "web") {
      getScheduledCount().then(setNotifScheduledCount);
    }
  }, []);

  // Handle weekly reminder toggle
  const handleWeeklyReminderToggle = useCallback(async () => {
    const newPrefs = { ...weeklyReminderPrefs, enabled: !weeklyReminderPrefs.enabled };
    setWeeklyReminderPrefs(newPrefs);
    await saveWeeklyReminderPrefs(newPrefs);
    if (Platform.OS !== "web") {
      if (newPrefs.enabled) {
        const granted = await requestNotificationPermissions();
        if (!granted) {
          setNotifPermissionDenied(true);
          return;
        }
      }
      const { getUnfinishedGoalCount } = await import("@/lib/notifications");
      const unfinished = await getUnfinishedGoalCount();
      await scheduleWeeklyReminder(language as "nl" | "en" | "ar", unfinished);
    }
  }, [weeklyReminderPrefs, language]);

  // Reschedule notifications when prefs change
  const rescheduleNotifications = useCallback(async (newPrefs: NotificationPrefs) => {
    setNotifPrefs(newPrefs);
    await saveNotificationPrefs(newPrefs);
    if (Platform.OS !== "web" && newPrefs.enabled) {
      const count = await scheduleAllNotifications(language);
      setNotifScheduledCount(count);
    } else if (!newPrefs.enabled) {
      // If disabled, cancel all
      const Notifications = require("expo-notifications");
      await Notifications.cancelAllScheduledNotificationsAsync();
      setNotifScheduledCount(0);
    }
  }, [language]);

  const handleNotifMasterToggle = useCallback(async () => {
    if (!notifPrefs.enabled) {
      // Turning on: request permission first
      if (Platform.OS !== "web") {
        const granted = await requestNotificationPermissions();
        if (!granted) {
          setNotifPermissionDenied(true);
          return;
        }
        setNotifPermissionDenied(false);
      }
    }
    const newPrefs = { ...notifPrefs, enabled: !notifPrefs.enabled };
    await rescheduleNotifications(newPrefs);
  }, [notifPrefs, rescheduleNotifications]);

  const handlePrayerToggle = useCallback(async (prayer: keyof NotificationPrefs["prayers"]) => {
    const newPrefs = {
      ...notifPrefs,
      prayers: { ...notifPrefs.prayers, [prayer]: !notifPrefs.prayers[prayer] },
    };
    await rescheduleNotifications(newPrefs);
  }, [notifPrefs, rescheduleNotifications]);

  const handleAdhkaarToggle = useCallback(async (type: "morning" | "evening") => {
    const newPrefs = {
      ...notifPrefs,
      adhkaar: { ...notifPrefs.adhkaar, [type]: !notifPrefs.adhkaar[type] },
    };
    await rescheduleNotifications(newPrefs);
  }, [notifPrefs, rescheduleNotifications]);

  const handleMinutesBefore = useCallback(async (minutes: number) => {
    const newPrefs = { ...notifPrefs, minutesBefore: minutes };
    setShowMinutesBefore(false);
    await rescheduleNotifications(newPrefs);
  }, [notifPrefs, rescheduleNotifications]);

  const [showAdhanSound, setShowAdhanSound] = useState(false);
  const [showNatureSound, setShowNatureSound] = useState(false);
  const [playingSound, setPlayingSound] = useState<string | null>(null);

  const handleAdhanSoundChange = useCallback(async (sound: AdhanSoundOption) => {
    const newPrefs = { ...notifPrefs, adhanSound: sound };
    setShowAdhanSound(false);
    await rescheduleNotifications(newPrefs);
  }, [notifPrefs, rescheduleNotifications]);

  const handleNatureSoundChange = useCallback(async (sound: NatureSoundOption) => {
    const newPrefs = { ...notifPrefs, natureSound: sound };
    setShowNatureSound(false);
    await rescheduleNotifications(newPrefs);
  }, [notifPrefs, rescheduleNotifications]);



  const audioRef = useRef<any>(null);
  const playPreviewSound = useCallback(async (soundId: string) => {
    try {
      // Stop any currently playing sound
      if (audioRef.current) {
        try { await audioRef.current.stopAsync(); await audioRef.current.unloadAsync(); } catch {}
        audioRef.current = null;
      }
      
      // If same sound is playing, just stop it
      if (playingSound === soundId) {
        setPlayingSound(null);
        return;
      }
      
      setPlayingSound(soundId);
      
      // Map sound IDs to asset files
      const soundMap: Record<string, any> = {
        "takbeer_1": require("@/assets/sounds/adhan_takbeer_1.mp3"),
        "takbeer_2": require("@/assets/sounds/adhan_takbeer_2.mp3"),
        "takbeer_3": require("@/assets/sounds/adhan_takbeer_3.mp3"),
        "water_stream": require("@/assets/sounds/water_stream.mp3"),
        "birds_chirp": require("@/assets/sounds/birds_chirp.mp3"),
        "wind_gentle": require("@/assets/sounds/wind_gentle.mp3"),
        "rain_soft": require("@/assets/sounds/rain_soft.mp3"),
      };
      
      const source = soundMap[soundId];
      if (!source) {
        setPlayingSound(null);
        return;
      }
      
      if (Platform.OS === "web") {
        // On web, just show visual feedback
        setTimeout(() => setPlayingSound(null), 3000);
        return;
      }
      
      const { Audio } = require("expo-av");
      // Route through the loudspeaker at media volume even on silent — without
      // this expo-av can play through the earpiece (inaudible) on Android.
      try {
        await Audio.setAudioModeAsync({
          playsInSilentModeIOS: true,
          shouldDuckAndroid: true,
          playThroughEarpieceAndroid: false,
          staysActiveInBackground: false,
        });
      } catch {}
      const { sound } = await Audio.Sound.createAsync(source, { shouldPlay: true, volume: 1.0 });
      audioRef.current = sound;

      // Auto-stop after 5 seconds (preview only)
      sound.setOnPlaybackStatusUpdate((status: any) => {
        if (status.didJustFinish || (status.positionMillis && status.positionMillis >= 5000)) {
          sound.stopAsync().then(() => sound.unloadAsync()).catch(() => {});
          audioRef.current = null;
          setPlayingSound(null);
        }
      });
      
      // Safety timeout
      setTimeout(async () => {
        try {
          if (audioRef.current === sound) {
            await sound.stopAsync();
            await sound.unloadAsync();
            audioRef.current = null;
            setPlayingSound(null);
          }
        } catch {}
      }, 5000);
    } catch (err) {
      console.warn("[settings] playPreviewSound error:", err);
      setPlayingSound(null);
    }
  }, [playingSound]);

  const savePrayerLocation = useCallback(async (loc: SavedPrayerLocation) => {
    setPrayerLocation(loc);
    setPrayerSelecting(null);
    setPrayerSelectedCountry(null);
    await AsyncStorage.setItem(PRAYER_LOCATION_KEY, JSON.stringify(loc));
    // Reschedule notifications with new location
    if (Platform.OS !== "web" && notifPrefs.enabled) {
      const count = await scheduleAllNotifications(language);
      setNotifScheduledCount(count);
    }
  }, [notifPrefs.enabled, language]);

  const savePrayerMethod = useCallback(async (method: CalcMethod) => {
    setPrayerMethod(method);
    setPrayerSelecting(null);
    await AsyncStorage.setItem(PRAYER_METHOD_KEY, method.id);
    // Reschedule notifications with new method
    if (Platform.OS !== "web" && notifPrefs.enabled) {
      const count = await scheduleAllNotifications(language);
      setNotifScheduledCount(count);
    }
  }, [notifPrefs.enabled, language]);

  const reminder = state.reminderSettings;
  const location = state.locationSettings;
  const [manualCityInput, setManualCityInput] = useState(location.manualCity || "");
  const [showManualInput, setShowManualInput] = useState(false);
  const lastUpdate = reminder.lastProfileUpdate
    ? new Date(reminder.lastProfileUpdate).toLocaleDateString(language === "ar" ? "ar-SA" : language === "en" ? "en-US" : "nl-NL", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : t("settings.profile_not_filled");

  // Open app-specifieke instellingen (locatie-permissie)
  const openAppSettings = useCallback(async () => {
    try {
      if (Platform.OS === "ios") {
        await Linking.openURL("app-settings:");
      } else if (Platform.OS === "android") {
        // In Expo Go, het package is host.exp.exponent
        const pkg = "host.exp.exponent";
        try {
          await IntentLauncher.startActivityAsync(
            IntentLauncher.ActivityAction.APPLICATION_DETAILS_SETTINGS,
            { data: `package:${pkg}` }
          );
        } catch (_) {
          // Fallback: open algemene app-instellingen
          await Linking.openURL("content://settings/applications").catch(() => {
            Alert.alert(t("settings.alert_settings"), t("settings.alert_settings_msg"));
          });
        }
      }
    } catch (e: any) {
      Alert.alert(t("settings.alert_settings"), t("settings.alert_settings_msg"));
    }
  }, []);

  // Open apparaat locatie-instellingen (GPS aan/uit)
  const openLocationSettings = useCallback(async () => {
    try {
      if (Platform.OS === "android") {
        try {
          await IntentLauncher.startActivityAsync(
            IntentLauncher.ActivityAction.LOCATION_SOURCE_SETTINGS
          );
        } catch (_) {
          // Fallback: probeer via URL
          await Linking.openURL("android.settings.LOCATION_SOURCE_SETTINGS").catch(() => {
            Alert.alert(t("settings.alert_location"), t("settings.alert_location_msg"));
          });
        }
      } else if (Platform.OS === "ios") {
        await Linking.openURL("app-settings:");
      }
    } catch (e: any) {
      Alert.alert(t("settings.alert_location"), t("settings.alert_location_msg"));
    }
  }, []);

  const handleGpsEnable = useCallback(async () => {
    if (gpsLoading) return;
    
    setGpsLoading(true);
    setGpsError("");
    setGpsStep(t("settings.gps_requesting"));

    const Location = getLocationModule();
    
    if (!Location) {
      // expo-location not available - enable GPS with manual city input
      setGpsStep("");
      setGpsLoading(false);
      setGpsError(t("settings.gps_not_available"));
      // Still enable GPS state so user knows it's "on" conceptually
      await updateLocationSettings({
        gpsEnabled: true,
        city: t("settings.gps_unknown"),
        country: "",
        latitude: null,
        longitude: null,
        lastUpdated: new Date().toISOString(),
      });
      return;
    }

    try {
      // Step 1: Check if location services are enabled
      let servicesEnabled = true;
      try {
        servicesEnabled = await Location.hasServicesEnabledAsync();
      } catch (_) {
        // Some platforms don't support this check
      }
      
      if (!servicesEnabled) {
        setGpsStep("");
        setGpsLoading(false);
        setGpsError(t("settings.gps_services_disabled"));
        // Direct naar locatie-instellingen openen
        openLocationSettings();
        return;
      }

      // Step 2: Request permission
      setGpsStep(t("settings.gps_requesting"));
      let permissionResult;
      try {
        permissionResult = await Location.requestForegroundPermissionsAsync();
      } catch (permErr: any) {
        setGpsStep("");
        setGpsLoading(false);
        setGpsError(`${t("settings.gps_permission_error")}: ${permErr?.message || "?"}`);
        return;
      }

      if (permissionResult.status !== "granted") {
        setGpsStep("");
        setGpsLoading(false);
        setGpsError(t("settings.gps_permission_denied"));
        // Direct naar app-instellingen openen
        openAppSettings();
        return;
      }

      // Step 3: Get current position (with fallback strategy)
      setGpsStep(t("settings.gps_fetching"));
      let pos;
      try {
        // First try getLastKnownPositionAsync (instant, no GPS needed)
        const lastKnown = await Location.getLastKnownPositionAsync({
          maxAge: 30 * 60 * 1000, // 30 minutes (was 10)
          requiredAccuracy: 10000, // 10km radius (was 5km)
        });
        if (lastKnown) {
          pos = lastKnown;
        } else {
          // Fallback 1: getCurrentPositionAsync with Balanced accuracy (uses cell towers + WiFi)
          const timeoutMs = 30000; // 30 seconds timeout (was 15)
          try {
            pos = await Promise.race([
              Location.getCurrentPositionAsync({
                accuracy: Location.Accuracy.Balanced, // Uses cell towers, faster than GPS
                mayShowUserSettingsDialog: true,
              }),
              new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error("Timeout")), timeoutMs)
              ),
            ]);
          } catch (_balancedErr) {
            // Fallback 2: Lowest accuracy (network only)
            pos = await Promise.race([
              Location.getCurrentPositionAsync({
                accuracy: Location.Accuracy.Lowest,
              }),
              new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error("Timeout")), 15000)
              ),
            ]);
          }
        }
      } catch (posErr: any) {
        // Final fallback: use saved prayer location if available
        if (prayerLocation && prayerLocation.lat && prayerLocation.lng) {
          // Use prayer location as GPS location
          await updateLocationSettings({
            gpsEnabled: true,
            city: prayerLocation.city || "",
            country: prayerLocation.country || "",
            latitude: prayerLocation.lat,
            longitude: prayerLocation.lng,
            lastUpdated: new Date().toISOString(),
          });
          setGpsStep("");
          setGpsLoading(false);
          setGpsError("");
          return;
        }
        // No fallback available
        setGpsStep("");
        setGpsLoading(false);
        const errorMsg = language === "ar"
          ? "تعذر جلب الموقع. تأكد من تفعيل GPS وأنك في مكان مفتوح أو متصل بالإنترنت. يمكنك إدخال المدينة يدوياً."
          : isEn
          ? "Could not fetch location. Make sure GPS is enabled and you are outdoors or connected to WiFi. You can enter the city manually."
          : "Kon locatie niet ophalen. Zorg dat GPS is ingeschakeld en je buiten bent of verbonden met WiFi. Je kunt de stad handmatig invoeren.";
        setGpsError(errorMsg);
        // Still enable GPS with unknown location
        await updateLocationSettings({
          gpsEnabled: true,
          city: t("settings.gps_unknown"),
          country: "",
          latitude: null,
          longitude: null,
          lastUpdated: new Date().toISOString(),
        });
        return;
      }

      // Step 4: Reverse geocode
      setGpsStep(t("settings.gps_determining_city"));
      let city = "";
      let country = "";
      try {
        const geocodeResults = await withTimeout<any>(Location.reverseGeocodeAsync({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        }), 8000);
        if (geocodeResults && geocodeResults.length > 0) {
          const geo = geocodeResults[0];
          city = geo.city || geo.subregion || geo.region || "";
          country = geo.country || "";
        }
      } catch (_geoErr) {
        // Fallback: use coordinates
        city = `${pos.coords.latitude.toFixed(2)}, ${pos.coords.longitude.toFixed(2)}`;
      }

      if (!city) {
        city = `${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`;
      }

      // Step 5: Save
      setGpsStep(t("settings.gps_saving"));
      await updateLocationSettings({
        gpsEnabled: true,
        city,
        country,
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        lastUpdated: new Date().toISOString(),
      });
      // Also save to PRAYER_LOCATION_KEY so home screen shows prayer times
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Amsterdam";
      await savePrayerLocation({
        country: country || "Unknown",
        city: city || "Unknown",
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        tz,
      });
      setGpsStep("");
      setGpsError("");
    } catch (err: any) {
      setGpsError(`${t("settings.gps_unexpected_error")}: ${err?.message || "?"}`);
      setGpsStep("");
    } finally {
      setGpsLoading(false);
    }
  }, [gpsLoading, updateLocationSettings]);

  const handleGpsDisable = useCallback(async () => {
    setGpsError("");
    setGpsStep("");
    await updateLocationSettings({
      gpsEnabled: false,
      city: "",
      country: "",
      latitude: null,
      longitude: null,
      lastUpdated: "",
    });
  }, [updateLocationSettings]);

  const handleRefreshLocation = useCallback(async () => {
    if (gpsLoading) return;
    setGpsLoading(true);
    setGpsError("");
    setGpsStep(t("settings.gps_refreshing"));

    const Location = getLocationModule();
    if (!Location) {
      setGpsLoading(false);
      setGpsStep("");
      setGpsError(t("settings.gps_module_unavailable"));
      return;
    }

    try {
      // Try getLastKnownPositionAsync first (instant)
      let pos = await Location.getLastKnownPositionAsync({
        maxAge: 30 * 60 * 1000, // 30 minutes (was 5)
        requiredAccuracy: 10000, // 10km (was 3km)
      });
      if (!pos) {
        // Fallback 1: Balanced accuracy (cell towers + WiFi)
        try {
          pos = await Promise.race([
            Location.getCurrentPositionAsync({
              accuracy: Location.Accuracy.Balanced,
              mayShowUserSettingsDialog: true,
            }),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error("Timeout")), 30000)
            ),
          ]);
        } catch (_) {
          // Fallback 2: Lowest accuracy
          pos = await Promise.race([
            Location.getCurrentPositionAsync({
              accuracy: Location.Accuracy.Lowest,
            }),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error("Timeout")), 15000)
            ),
          ]);
        }
      }
      let city = "";
      let country = "";
      try {
        const geocodeResults = await withTimeout<any>(Location.reverseGeocodeAsync({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        }), 8000);
        if (geocodeResults && geocodeResults.length > 0) {
          const geo = geocodeResults[0];
          city = geo.city || geo.subregion || geo.region || "";
          country = geo.country || "";
        }
      } catch (_) {
        city = `${pos.coords.latitude.toFixed(2)}, ${pos.coords.longitude.toFixed(2)}`;
      }
      if (!city) city = `${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`;
      
      await updateLocationSettings({
        city,
        country,
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        lastUpdated: new Date().toISOString(),
      });
      setGpsError("");
    } catch (err: any) {
      // Final fallback: use prayer location if available
      if (prayerLocation && prayerLocation.lat && prayerLocation.lng) {
        await updateLocationSettings({
          city: prayerLocation.city || "",
          country: prayerLocation.country || "",
          latitude: prayerLocation.lat,
          longitude: prayerLocation.lng,
          lastUpdated: new Date().toISOString(),
        });
        setGpsError("");
      } else {
        const errorMsg = language === "ar"
          ? "تعذر تحديث الموقع. تأكد من تفعيل GPS أو أدخل المدينة يدوياً."
          : isEn
          ? "Could not refresh location. Make sure GPS is enabled or enter city manually."
          : "Kon locatie niet vernieuwen. Zorg dat GPS is ingeschakeld of voer de stad handmatig in.";
        setGpsError(errorMsg);
      }
    } finally {
      setGpsLoading(false);
      setGpsStep("");
    }
  }, [gpsLoading, updateLocationSettings]);

  // Bekende steden voor herkenning (Nederland, België, Duitsland, etc.)
  const KNOWN_CITIES: Record<string, { country: string; lat: number; lng: number }> = {
    // Nederland
    "amsterdam": { country: "Nederland", lat: 52.3676, lng: 4.9041 },
    "rotterdam": { country: "Nederland", lat: 51.9244, lng: 4.4777 },
    "den haag": { country: "Nederland", lat: 52.0705, lng: 4.3007 },
    "'s-gravenhage": { country: "Nederland", lat: 52.0705, lng: 4.3007 },
    "utrecht": { country: "Nederland", lat: 52.0907, lng: 5.1214 },
    "eindhoven": { country: "Nederland", lat: 51.4416, lng: 5.4697 },
    "tilburg": { country: "Nederland", lat: 51.5555, lng: 5.0913 },
    "groningen": { country: "Nederland", lat: 53.2194, lng: 6.5665 },
    "almere": { country: "Nederland", lat: 52.3508, lng: 5.2647 },
    "breda": { country: "Nederland", lat: 51.5719, lng: 4.7683 },
    "nijmegen": { country: "Nederland", lat: 51.8126, lng: 5.8372 },
    "enschede": { country: "Nederland", lat: 52.2215, lng: 6.8937 },
    "haarlem": { country: "Nederland", lat: 52.3874, lng: 4.6462 },
    "arnhem": { country: "Nederland", lat: 51.9851, lng: 5.8987 },
    "zaanstad": { country: "Nederland", lat: 52.4588, lng: 4.8126 },
    "amersfoort": { country: "Nederland", lat: 52.1561, lng: 5.3878 },
    "apeldoorn": { country: "Nederland", lat: 52.2112, lng: 5.9699 },
    "hoofddorp": { country: "Nederland", lat: 52.3025, lng: 4.6889 },
    "maastricht": { country: "Nederland", lat: 50.8514, lng: 5.6910 },
    "leiden": { country: "Nederland", lat: 52.1601, lng: 4.4970 },
    "dordrecht": { country: "Nederland", lat: 51.8133, lng: 4.6901 },
    "zoetermeer": { country: "Nederland", lat: 52.0575, lng: 4.4931 },
    "zwolle": { country: "Nederland", lat: 52.5168, lng: 6.0830 },
    "deventer": { country: "Nederland", lat: 52.2660, lng: 6.1552 },
    "delft": { country: "Nederland", lat: 52.0116, lng: 4.3571 },
    "alkmaar": { country: "Nederland", lat: 52.6324, lng: 4.7534 },
    "heerlen": { country: "Nederland", lat: 50.8882, lng: 5.9795 },
    "venlo": { country: "Nederland", lat: 51.3704, lng: 6.1724 },
    "leeuwarden": { country: "Nederland", lat: 53.2012, lng: 5.7999 },
    "hilversum": { country: "Nederland", lat: 52.2292, lng: 5.1669 },
    "oss": { country: "Nederland", lat: 51.7652, lng: 5.5181 },
    "schiedam": { country: "Nederland", lat: 51.9225, lng: 4.3990 },
    "spijkenisse": { country: "Nederland", lat: 51.8449, lng: 4.3290 },
    "helmond": { country: "Nederland", lat: 51.4758, lng: 5.6612 },
    "vlaardingen": { country: "Nederland", lat: 51.9120, lng: 4.3419 },
    "almelo": { country: "Nederland", lat: 52.3567, lng: 6.6683 },
    "gouda": { country: "Nederland", lat: 52.0115, lng: 4.7104 },
    "zaandam": { country: "Nederland", lat: 52.4399, lng: 4.8265 },
    "lelystad": { country: "Nederland", lat: 52.5185, lng: 5.4714 },
    "alphen aan den rijn": { country: "Nederland", lat: 52.1293, lng: 4.6576 },
    "hoorn": { country: "Nederland", lat: 52.6424, lng: 5.0602 },
    "purmerend": { country: "Nederland", lat: 52.5049, lng: 4.9597 },
    "den bosch": { country: "Nederland", lat: 51.6978, lng: 5.3037 },
    "'s-hertogenbosch": { country: "Nederland", lat: 51.6978, lng: 5.3037 },
    "roosendaal": { country: "Nederland", lat: 51.5308, lng: 4.4654 },
    "ede": { country: "Nederland", lat: 52.0484, lng: 5.6519 },
    "veenendaal": { country: "Nederland", lat: 52.0284, lng: 5.5587 },
    "capelle aan den ijssel": { country: "Nederland", lat: 51.9292, lng: 4.5780 },
    "kampen": { country: "Nederland", lat: 52.5552, lng: 5.9106 },
    "woerden": { country: "Nederland", lat: 52.0853, lng: 4.8838 },
    "harderwijk": { country: "Nederland", lat: 52.3424, lng: 5.6207 },
    "nieuwegein": { country: "Nederland", lat: 52.0286, lng: 5.0809 },
    // België
    "brussel": { country: "België", lat: 50.8503, lng: 4.3517 },
    "antwerpen": { country: "België", lat: 51.2194, lng: 4.4025 },
    "gent": { country: "België", lat: 51.0543, lng: 3.7174 },
    "charleroi": { country: "België", lat: 50.4108, lng: 4.4446 },
    "luik": { country: "België", lat: 50.6326, lng: 5.5797 },
    "brugge": { country: "België", lat: 51.2093, lng: 3.2247 },
    // Duitsland
    "berlijn": { country: "Duitsland", lat: 52.5200, lng: 13.4050 },
    "hamburg": { country: "Duitsland", lat: 53.5511, lng: 9.9937 },
    "münchen": { country: "Duitsland", lat: 48.1351, lng: 11.5820 },
    "keulen": { country: "Duitsland", lat: 50.9375, lng: 6.9603 },
    "düsseldorf": { country: "Duitsland", lat: 51.2277, lng: 6.7735 },
    "frankfurt": { country: "Duitsland", lat: 50.1109, lng: 8.6821 },
    // Marokko
    "casablanca": { country: "Marokko", lat: 33.5731, lng: -7.5898 },
    "rabat": { country: "Marokko", lat: 34.0209, lng: -6.8416 },
    "marrakech": { country: "Marokko", lat: 31.6295, lng: -7.9811 },
    "fes": { country: "Marokko", lat: 34.0181, lng: -5.0078 },
    "tanger": { country: "Marokko", lat: 35.7595, lng: -5.8340 },
    "nador": { country: "Marokko", lat: 35.1688, lng: -2.9286 },
    "oujda": { country: "Marokko", lat: 34.6814, lng: -1.9086 },
    "agadir": { country: "Marokko", lat: 30.4278, lng: -9.5981 },
    "meknes": { country: "Marokko", lat: 33.8935, lng: -5.5473 },
    "tetouan": { country: "Marokko", lat: 35.5889, lng: -5.3626 },
    "kenitra": { country: "Marokko", lat: 34.2610, lng: -6.5802 },
    "sale": { country: "Marokko", lat: 34.0531, lng: -6.7985 },
    "beni mellal": { country: "Marokko", lat: 32.3373, lng: -6.3498 },
    "khouribga": { country: "Marokko", lat: 32.8811, lng: -6.9063 },
    "el jadida": { country: "Marokko", lat: 33.2316, lng: -8.5007 },
    "safi": { country: "Marokko", lat: 32.2994, lng: -9.2372 },
    "mohammedia": { country: "Marokko", lat: 33.6861, lng: -7.3828 },
    "settat": { country: "Marokko", lat: 33.0011, lng: -7.6166 },
    "berkane": { country: "Marokko", lat: 34.9200, lng: -2.3200 },
    "taza": { country: "Marokko", lat: 34.2100, lng: -4.0100 },
    "larache": { country: "Marokko", lat: 35.1932, lng: -6.1561 },
    "khemisset": { country: "Marokko", lat: 33.8242, lng: -6.0664 },
    // Turkije
    "istanbul": { country: "Turkije", lat: 41.0082, lng: 28.9784 },
    "ankara": { country: "Turkije", lat: 39.9334, lng: 32.8597 },
    // Saoedi-Arabië
    "mekka": { country: "Saoedi-Arabië", lat: 21.3891, lng: 39.8579 },
    "medina": { country: "Saoedi-Arabië", lat: 24.5247, lng: 39.5692 },
    "riyad": { country: "Saoedi-Arabië", lat: 24.7136, lng: 46.6753 },
    "jeddah": { country: "Saoedi-Arabië", lat: 21.4858, lng: 39.1925 },
    // Egypte
    "cairo": { country: "Egypte", lat: 30.0444, lng: 31.2357 },
    "alexandrië": { country: "Egypte", lat: 31.2001, lng: 29.9187 },
    // VK
    "londen": { country: "Verenigd Koninkrijk", lat: 51.5074, lng: -0.1278 },
    "birmingham": { country: "Verenigd Koninkrijk", lat: 52.4862, lng: -1.8904 },
    // Frankrijk
    "parijs": { country: "Frankrijk", lat: 48.8566, lng: 2.3522 },
    "marseille": { country: "Frankrijk", lat: 43.2965, lng: 5.3698 },
    "lyon": { country: "Frankrijk", lat: 45.7640, lng: 4.8357 },
  };

  const handleManualCitySave = useCallback(async () => {
    const input = manualCityInput.trim().toLowerCase();
    if (!input) return;

    // 1. Exacte match
    let matchKey = input;
    let match = KNOWN_CITIES[input];

    // 2. Fuzzy: zoek stad die begint met de invoer
    if (!match) {
      const startsWith = Object.keys(KNOWN_CITIES).find(k => k.startsWith(input));
      if (startsWith) {
        matchKey = startsWith;
        match = KNOWN_CITIES[startsWith];
      }
    }

    // 3. Fuzzy: zoek stad die de invoer bevat
    if (!match) {
      const includes = Object.keys(KNOWN_CITIES).find(k => k.includes(input));
      if (includes) {
        matchKey = includes;
        match = KNOWN_CITIES[includes];
      }
    }

    // 4. Fuzzy: zoek stad waar de invoer in zit
    if (!match) {
      const reverseIncludes = Object.keys(KNOWN_CITIES).find(k => input.includes(k));
      if (reverseIncludes) {
        matchKey = reverseIncludes;
        match = KNOWN_CITIES[reverseIncludes];
      }
    }
    
    if (match) {
      // Stad herkend!
      const displayName = matchKey.charAt(0).toUpperCase() + matchKey.slice(1);
      await updateLocationSettings({
        gpsEnabled: true,
        city: displayName,
        country: match.country,
        latitude: match.lat,
        longitude: match.lng,
        lastUpdated: new Date().toISOString(),
        manualCity: displayName,
      });
      setShowManualInput(false);
      setGpsError("");
    } else {
      // Stad niet herkend - toon suggesties
      const suggestions = Object.keys(KNOWN_CITIES)
        .filter(k => k.includes(input.charAt(0)))
        .slice(0, 5)
        .map(k => k.charAt(0).toUpperCase() + k.slice(1))
        .join(", ");
      Alert.alert(
        language === "ar" ? "المدينة غير معروفة" : isEn ? "City not recognized" : "Stad niet herkend",
        language === "ar"
          ? `لم نتمكن من العثور على "${manualCityInput.trim()}". حاول إدخال اسم المدينة كاملاً.\n\nأمثلة: أمستردام، روتردام، بروكسل، الدار البيضاء، باريس...${suggestions ? `\n\nمدن محتملة: ${suggestions}` : ""}`
          : isEn
          ? `We could not find "${manualCityInput.trim()}". Try entering the full city name.\n\nExamples: Amsterdam, Rotterdam, The Hague, Brussels, Casablanca, Paris...${suggestions ? `\n\nPossible cities: ${suggestions}` : ""}`
          : `We konden "${manualCityInput.trim()}" niet vinden. Probeer de volledige stadsnaam in te voeren.\n\nVoorbeelden: Amsterdam, Rotterdam, Den Haag, Brussel, Casablanca, Parijs...${suggestions ? `\n\nMogelijke steden: ${suggestions}` : ""}`
      );
    }
  }, [manualCityInput, updateLocationSettings]);

  const handleReminderToggle = useCallback(() => {
    updateReminderSettings({ enabled: !reminder.enabled });
  }, [reminder.enabled, updateReminderSettings]);

  const handleReset = () => {
    Alert.alert(
      language === "ar" ? "هل أنت متأكد؟" : isEn ? "Are you sure?" : "Weet u het zeker?",
      language === "ar" ? "سيتم حذف جميع البيانات. لا يمكن التراجع عن هذا." : isEn ? "All data will be deleted. This cannot be undone." : "Alle gegevens worden verwijderd. Dit kan niet ongedaan worden gemaakt.",
      [
        { text: language === "ar" ? "إلغاء" : isEn ? "Cancel" : "Annuleren", style: "cancel" },
        {
          text: language === "ar" ? "حذف" : isEn ? "Delete" : "Verwijderen",
          style: "destructive",
          onPress: async () => {
            await resetState();
            router.replace("/onboarding");
          },
        },
      ]
    );
  };

  // ============ PRAYER COUNTRY SELECTION ============
  if (prayerSelecting === "country") {
    return (
      <View className="flex-1" style={{ backgroundColor: colors.background, paddingTop: insets.top }}>
        <View style={{ paddingHorizontal: 20, paddingTop: 16 }}>
          <Pressable
            onPress={() => setPrayerSelecting(null)}
            style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1, flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 6, marginBottom: 12 }]}
          >
            <Text style={{ fontSize: 14, color: colors.primary }}>{t("settings.back")}</Text>
          </Pressable>
          <Text style={{ fontSize: 22, fontWeight: "800", color: colors.foreground, marginBottom: 12 }}>{t("settings.choose_country")}</Text>
        </View>
        <FlatList
          data={COUNTRY_NAMES}
          keyExtractor={(item) => item}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => { setPrayerSelectedCountry(item); setPrayerSelecting("city"); }}
              style={({ pressed }) => [{
                backgroundColor: pressed ? colors.primary + "15" : colors.surface,
                borderRadius: 12, padding: 16, marginBottom: 8,
                flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 12,
                borderWidth: 1, borderColor: colors.border,
              }]}
            >
              <Text style={{ fontSize: 24 }}>{COUNTRIES[item].flag}</Text>
              <Text style={{ fontSize: 16, fontWeight: "600", color: colors.foreground }}>{language === "ar" ? getCountryAR(item) : item}</Text>
              <Text style={{ fontSize: 12, color: colors.muted, marginLeft: "auto" }}>{COUNTRIES[item].cities.length} {t("prayer.cities_count")}</Text>
            </Pressable>
          )}
        />
      </View>
    );
  }

  // ============ PRAYER CITY SELECTION ============
  if (prayerSelecting === "city" && prayerSelectedCountry) {
    const countryData = COUNTRIES[prayerSelectedCountry];
    return (
      <View className="flex-1" style={{ backgroundColor: colors.background, paddingTop: insets.top }}>
        <View style={{ paddingHorizontal: 20, paddingTop: 16 }}>
          <Pressable
            onPress={() => setPrayerSelecting("country")}
            style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1, flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 6, marginBottom: 8 }]}
          >
            <Text style={{ fontSize: 14, color: colors.primary }}>{t("settings.back_countries")}</Text>
          </Pressable>
          <Text style={{ fontSize: 22, fontWeight: "800", color: colors.foreground }}>{countryData.flag} {language === "ar" ? getCountryAR(prayerSelectedCountry) : prayerSelectedCountry}</Text>
          <Text style={{ fontSize: 13, color: colors.muted, marginTop: 2, marginBottom: 12 }}>{t("settings.choose_city")}</Text>
        </View>
        <FlatList
          data={countryData.cities}
          keyExtractor={(item) => item.name}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => savePrayerLocation({ country: prayerSelectedCountry, city: item.name, lat: item.lat, lng: item.lng, tz: countryData.tz })}
              style={({ pressed }) => [{
                backgroundColor: pressed ? colors.primary + "15" : colors.surface,
                borderRadius: 12, padding: 16, marginBottom: 8,
                borderWidth: 1, borderColor: colors.border,
              }]}
            >
              <Text style={{ fontSize: 16, fontWeight: "600", color: colors.foreground }}>{language === "ar" ? getCityAR(item.name) : item.name}</Text>
              <Text style={{ fontSize: 11, color: colors.muted, marginTop: 2 }}>{item.lat.toFixed(2)}, {item.lng.toFixed(2)}</Text>
            </Pressable>
          )}
        />
      </View>
    );
  }

  // ============ PRAYER METHOD SELECTION ============
  if (prayerSelecting === "method") {
    return (
      <View className="flex-1" style={{ backgroundColor: colors.background, paddingTop: insets.top }}>
        <View style={{ paddingHorizontal: 20, paddingTop: 16 }}>
          <Pressable
            onPress={() => setPrayerSelecting(null)}
            style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1, flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 6, marginBottom: 8 }]}
          >
            <Text style={{ fontSize: 14, color: colors.primary }}>{t("settings.back")}</Text>
          </Pressable>
          <Text style={{ fontSize: 22, fontWeight: "800", color: colors.foreground }}>{t("settings.choose_method")}</Text>
          <Text style={{ fontSize: 13, color: colors.muted, marginTop: 2, marginBottom: 12 }}>{t("settings.choose_method_desc")}</Text>
        </View>
        <FlatList
          data={CALC_METHODS}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => {
            const isSelected = item.id === prayerMethod.id;
            return (
              <Pressable
                onPress={() => savePrayerMethod(item)}
                style={({ pressed }) => [{
                  backgroundColor: isSelected ? colors.primary + "15" : pressed ? colors.primary + "08" : colors.surface,
                  borderRadius: 12, padding: 14, marginBottom: 8,
                  borderWidth: isSelected ? 1.5 : 1,
                  borderColor: isSelected ? colors.primary + "60" : colors.border,
                }]}
              >
                <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", justifyContent: "space-between" }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: "600", color: isSelected ? colors.primary : colors.foreground }}>{item.name}</Text>
                    <Text style={{ fontSize: 12, color: colors.muted, marginTop: 1 }}>{item.nameAr}</Text>
                    <Text style={{ fontSize: 11, color: colors.muted, marginTop: 3 }}>
                      Fajr: {item.fajrAngle}° | Isha: {item.ishaMinutes ? `${item.ishaMinutes} min` : `${item.ishaAngle}°`} | Asr: {item.asrFactor === 1 ? "Shafi'i" : "Hanafi"}
                    </Text>
                  </View>
                  {isSelected && (
                    <View style={{ backgroundColor: colors.primary, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 }}>
                      <Text style={{ fontSize: 10, color: "#fff", fontWeight: "700" }}>{t("settings.active")}</Text>
                    </View>
                  )}
                </View>
                <Text style={{ fontSize: 10, color: colors.muted, marginTop: 4, fontStyle: "italic" }}>{item.region}</Text>
              </Pressable>
            );
          }}
        />
      </View>
    );
  }

  return (
    <View className="flex-1" style={{ backgroundColor: colors.background }}>
      <View style={{ paddingTop: insets.top }}>
        <DateTimeHeader />
      </View>
      <ScrollView
        className="flex-1"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingTop: 16,
          paddingBottom: insets.bottom + 100,
          paddingHorizontal: 20,
        }}
      >
      <Text className="text-2xl font-bold mb-6" style={{ color: colors.foreground }}>
        {t("settings.title")}
      </Text>

      {/* Quick status summary */}
      <View style={{ flexDirection: isRTL ? "row-reverse" : "row", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <View style={{ flex: 1, minWidth: 100, backgroundColor: colors.primary + "12", borderRadius: 12, padding: 12, alignItems: "center" }}>
          <Text style={{ color: colors.primary, fontSize: 18, fontWeight: "800" }}>{notifScheduledCount}</Text>
          <Text style={{ color: colors.muted, fontSize: 9, marginTop: 2 }}>{language === "ar" ? "إشعارات مجدولة" : isEn ? "Scheduled" : "Gepland"}</Text>
        </View>
        <View style={{ flex: 1, minWidth: 100, backgroundColor: colors.success + "12", borderRadius: 12, padding: 12, alignItems: "center" }}>
          <Text style={{ color: colors.success, fontSize: 18, fontWeight: "800" }}>{state.children.length}</Text>
          <Text style={{ color: colors.muted, fontSize: 9, marginTop: 2 }}>{language === "ar" ? "أطفال" : isEn ? "Children" : "Kinderen"}</Text>
        </View>
        <View style={{ flex: 1, minWidth: 100, backgroundColor: (prayerLocation ? colors.success : colors.warning) + "12", borderRadius: 12, padding: 12, alignItems: "center" }}>
          <Text style={{ color: prayerLocation ? colors.success : colors.warning, fontSize: 14, fontWeight: "800" }}>{prayerLocation ? "\u2713" : "!"}</Text>
          <Text style={{ color: colors.muted, fontSize: 9, marginTop: 2 }}>{language === "ar" ? "الموقع" : isEn ? "Location" : "Locatie"}</Text>
        </View>
      </View>

      {/* My ID card */}
      {isAuthenticated && myIdQuery.data?.publicId && (
        <View style={{ backgroundColor: colors.primary + "08", borderRadius: 12, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: colors.primary + "30", flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 12 }}>
          <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primary + "15", alignItems: "center", justifyContent: "center" }}>
            <Text style={{ fontSize: 18 }}>🆔</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.muted, fontSize: 10 }}>{language === "ar" ? "رقم هويتي" : isEn ? "My ID" : "Mijn ID"}</Text>
            <Text style={{ color: colors.primary, fontSize: 16, fontWeight: "800", fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace", letterSpacing: 1 }}>
              {myIdQuery.data.publicId}
            </Text>
          </View>
        </View>
      )}

      {/* Dark mode & Language */}
      <SettingsCollapsible title={language === "ar" ? "المظهر واللغة" : isEn ? "Appearance & Language" : "Weergave & Taal"} icon="palette" colors={colors} isRTL={isRTL} defaultOpen={false}>
        <Pressable
          onPress={() => setColorScheme(isDark ? "light" : "dark")}
          style={({ pressed }) => [{
            flexDirection: isRTL ? "row-reverse" : "row" as const,
            alignItems: "center" as const,
            justifyContent: "space-between" as const,
            opacity: pressed ? 0.8 : 1,
            marginBottom: 16,
          }]}
        >
          <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 10 }}>
            <Text style={{ fontSize: 20 }}>{isDark ? "\uD83C\uDF19" : "\u2600\uFE0F"}</Text>
            <View>
              <Text style={{ color: colors.foreground, fontSize: 14, fontWeight: "600" }}>
                {language === "ar" ? "الوضع الداكن" : isEn ? "Dark Mode" : "Donker thema"}
              </Text>
              <Text style={{ color: colors.muted, fontSize: 11 }}>
                {isDark ? (language === "ar" ? "مفعّل" : isEn ? "Enabled" : "Ingeschakeld") : (language === "ar" ? "معطّل" : isEn ? "Disabled" : "Uitgeschakeld")}
              </Text>
            </View>
          </View>
          <View style={{
            width: 48,
            height: 28,
            borderRadius: 14,
            backgroundColor: isDark ? colors.primary : colors.muted + "40",
            justifyContent: "center" as const,
            paddingHorizontal: 2,
          }}>
            <View style={{
              width: 24,
              height: 24,
              borderRadius: 12,
              backgroundColor: "#ffffff",
              alignSelf: isDark ? "flex-end" as const : "flex-start" as const,
            }} />
          </View>
        </Pressable>

        <Text style={{ color: colors.foreground, fontSize: 14, fontWeight: "700", marginBottom: 10 }}>
          {t("settings.language")}
        </Text>
        <View style={{ flexDirection: isRTL ? "row-reverse" : "row", gap: 8, flexWrap: "wrap" }}>
          <Pressable
            onPress={() => setLanguage("nl")}
            style={({ pressed }) => [{
              flex: 1,
              minWidth: 90,
              backgroundColor: language === "nl" ? colors.primary + "15" : colors.background,
              borderRadius: 10,
              paddingVertical: 12,
              alignItems: "center" as const,
              borderWidth: language === "nl" ? 1.5 : 1,
              borderColor: language === "nl" ? colors.primary + "60" : colors.border,
              opacity: pressed ? 0.8 : 1,
            }]}
          >
            <Text style={{ fontSize: 13, fontWeight: language === "nl" ? "700" : "500", color: language === "nl" ? colors.primary : colors.foreground }}>
              🇳🇱 Nederlands
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setLanguage("en")}
            style={({ pressed }) => [{
              flex: 1,
              minWidth: 90,
              backgroundColor: language === "en" ? colors.primary + "15" : colors.background,
              borderRadius: 10,
              paddingVertical: 12,
              alignItems: "center" as const,
              borderWidth: language === "en" ? 1.5 : 1,
              borderColor: language === "en" ? colors.primary + "60" : colors.border,
              opacity: pressed ? 0.8 : 1,
            }]}
          >
            <Text style={{ fontSize: 13, fontWeight: language === "en" ? "700" : "500", color: language === "en" ? colors.primary : colors.foreground }}>
              🇬🇧 English
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setLanguage("ar")}
            style={({ pressed }) => [{
              flex: 1,
              minWidth: 90,
              backgroundColor: language === "ar" ? colors.primary + "15" : colors.background,
              borderRadius: 10,
              paddingVertical: 12,
              alignItems: "center" as const,
              borderWidth: language === "ar" ? 1.5 : 1,
              borderColor: language === "ar" ? colors.primary + "60" : colors.border,
              opacity: pressed ? 0.8 : 1,
            }]}
          >
            <Text style={{ fontSize: 13, fontWeight: language === "ar" ? "700" : "500", color: language === "ar" ? colors.primary : colors.foreground }}>
              🇸🇦 العربية
            </Text>
          </Pressable>
        </View>
      </SettingsCollapsible>

      {/* Permissions */}
      <Pressable
        onPress={() => router.push("/permissions-setup" as any)}
        style={({ pressed }) => [{
          flexDirection: isRTL ? "row-reverse" : "row",
          alignItems: "center",
          justifyContent: "space-between",
          backgroundColor: pressed ? colors.surface : colors.background,
          borderRadius: 12,
          padding: 14,
          marginBottom: 12,
          borderWidth: 1,
          borderColor: colors.border,
        }]}
      >
        <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 10 }}>
          <MaterialIcons name="security" size={20} color={colors.primary} />
          <Text style={{ color: colors.foreground, fontSize: 14, fontWeight: "600" }}>
            {language === "ar" ? "الأذونات" : isEn ? "Permissions" : "Machtigingen"}
          </Text>
        </View>
        <MaterialIcons name={isRTL ? "chevron-left" : "chevron-right"} size={20} color={colors.muted} />
      </Pressable>

      {/* Prayer time settings */}
      <SettingsCollapsible title={language === "ar" ? "إعدادات الصلاة" : isEn ? "Prayer Settings" : "Gebedsinstellingen"} icon="access-time" colors={colors} isRTL={isRTL}>

        {/* Current location */}
        <Text style={{ fontSize: 12, color: colors.muted, marginBottom: 4 }}>{t("settings.current_location")}</Text>
        <Pressable
          onPress={() => setPrayerSelecting("country")}
          style={({ pressed }) => [{
            backgroundColor: pressed ? colors.primary + "15" : colors.background,
            borderRadius: 10, padding: 12, marginBottom: 12,
            flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", justifyContent: "space-between",
            borderWidth: 1, borderColor: colors.border,
          }]}
        >
          <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }}>
            {prayerLocation ? `${COUNTRIES[prayerLocation.country]?.flag || "\uD83D\uDCCD"} ${prayerLocation.city}, ${prayerLocation.country}` : t("settings.not_set")}
          </Text>
          <Text style={{ fontSize: 12, color: colors.primary, fontWeight: "600" }}>{t("prayer.change_location")}</Text>
        </Pressable>

        {/* Auto-locate GPS button */}
        <Pressable
          onPress={handleGpsEnable}
          disabled={gpsLoading}
          style={({ pressed }) => [{
            backgroundColor: gpsLoading ? colors.muted + "20" : (pressed ? colors.primary + "25" : colors.primary + "10"),
            borderRadius: 10,
            paddingVertical: 10,
            paddingHorizontal: 14,
            flexDirection: isRTL ? "row-reverse" : "row" as const,
            alignItems: "center" as const,
            justifyContent: "center" as const,
            gap: 8,
            marginBottom: 12,
            borderWidth: 1,
            borderColor: colors.primary + "30",
          }]}
        >
          {gpsLoading && <ActivityIndicator size="small" color={colors.primary} />}
          <Text style={{ color: colors.primary, fontSize: 12, fontWeight: "600" }}>
            {gpsLoading ? (language === "ar" ? "جاري التحديد..." : isEn ? "Locating..." : "Zoeken...") : (language === "ar" ? "📍 تحديد الموقع تلقائياً" : isEn ? "📍 Auto-detect location" : "📍 Locatie automatisch detecteren")}
          </Text>
        </Pressable>

        {/* Current method */}
        <Text style={{ fontSize: 12, color: colors.muted, marginBottom: 4 }}>{t("settings.current_method")}</Text>
        <Pressable
          onPress={() => setPrayerSelecting("method")}
          style={({ pressed }) => [{
            backgroundColor: pressed ? "#F59E0B15" : colors.background,
            borderRadius: 10, padding: 12,
            flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", justifyContent: "space-between",
            borderWidth: 1, borderColor: colors.border,
          }]}
        >
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }}>{prayerMethod.name}</Text>
            <Text style={{ fontSize: 11, color: colors.muted }}>{prayerMethod.nameAr}</Text>
          </View>
          <Text style={{ fontSize: 12, color: "#F59E0B", fontWeight: "600" }}>{t("prayer.change_method")}</Text>
        </Pressable>
      </SettingsCollapsible>
      {/* All Notification Settings - Single Unified Page */}
      <Pressable
        onPress={() => router.push("/notification-settings")}
        style={({ pressed }) => [{
          flexDirection: isRTL ? "row-reverse" : "row",
          alignItems: "center",
          justifyContent: "space-between",
          backgroundColor: colors.surface,
          borderRadius: 16,
          padding: 16,
          marginBottom: 16,
          borderWidth: 2,
          borderColor: colors.primary + "40",
          opacity: pressed ? 0.8 : 1,
        }]}
      >
        <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 12 }}>
          <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: colors.primary + "15", alignItems: "center", justifyContent: "center" }}>
            <MaterialIcons name="notifications-active" size={24} color={colors.primary} />
          </View>
          <View>
            <Text style={{ fontSize: 16, fontWeight: "700", color: colors.foreground, textAlign: isRTL ? "right" : "left" }}>
              {language === "ar" ? "جميع الإشعارات والتذكيرات" : isEn ? "All Notifications & Reminders" : "Alle meldingen & herinneringen"}
            </Text>
            <Text style={{ fontSize: 12, color: colors.muted, textAlign: isRTL ? "right" : "left", marginTop: 3 }}>
              {language === "ar" ? "صلاة • أذكار • إيمانية • تربوية • إسكات • أسبوعية" : isEn ? "Prayer • Adhkar • Faith • Parenting • Silence • Weekly" : "Gebed • Adhkar • Geloof • Opvoeding • Stilte • Wekelijks"}
            </Text>
          </View>
        </View>
        <MaterialIcons name={isRTL ? "chevron-left" : "chevron-right"} size={24} color={colors.muted} />
      </Pressable>
      <SettingsCollapsible title={language === "ar" ? "الموقع" : isEn ? "Location" : "Locatie"} icon="location-on" colors={colors} isRTL={isRTL}>
        <Text className="text-xs mb-4 leading-4" style={{ color: colors.muted }}>
          {t("settings.gps_desc_full")}
        </Text>

        {/* Error message */}
        {gpsError ? (
          <View style={{ backgroundColor: colors.error + "15", borderRadius: 8, padding: 10, marginBottom: 12, borderWidth: 1, borderColor: colors.error + "30" }}>
            <Text style={{ color: colors.error, fontSize: 12, lineHeight: 16 }}>{gpsError}</Text>
            <View style={{ flexDirection: isRTL ? "row-reverse" : "row", gap: 8, marginTop: 10 }}>
              <Pressable
                onPress={openAppSettings}
                style={({ pressed }) => [{
                  flex: 1,
                  backgroundColor: colors.primary,
                  borderRadius: 8,
                  paddingVertical: 10,
                  paddingHorizontal: 12,
                  alignItems: "center" as const,
                  opacity: pressed ? 0.8 : 1,
                }]}
              >
                <Text style={{ color: "#ffffff", fontSize: 12, fontWeight: "bold" }}>{t("settings.app_settings")}</Text>
              </Pressable>
              <Pressable
                onPress={openLocationSettings}
                style={({ pressed }) => [{
                  flex: 1,
                  backgroundColor: colors.warning || "#F59E0B",
                  borderRadius: 8,
                  paddingVertical: 10,
                  paddingHorizontal: 12,
                  alignItems: "center" as const,
                  opacity: pressed ? 0.8 : 1,
                }]}
              >
                <Text style={{ color: "#ffffff", fontSize: 12, fontWeight: "bold" }}>{t("settings.location_settings_btn")}</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {/* Progress step */}
        {gpsStep ? (
          <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 8, marginBottom: 12, padding: 10, backgroundColor: colors.primary + "10", borderRadius: 8 }}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={{ color: colors.primary, fontSize: 12 }}>{gpsStep}</Text>
          </View>
        ) : null}

        {/* GPS Toggle Button */}
        {!location.gpsEnabled ? (
          <View style={{ gap: 12 }}>
            <Pressable
              onPress={handleGpsEnable}
              disabled={gpsLoading}
              style={({ pressed }) => [{
                backgroundColor: gpsLoading ? colors.muted + "30" : (pressed ? colors.primary + "CC" : colors.primary),
                borderRadius: 12,
                paddingVertical: 14,
                paddingHorizontal: 20,
                alignItems: "center" as const,
                flexDirection: isRTL ? "row-reverse" : "row" as const,
                justifyContent: "center" as const,
                gap: 8,
                opacity: gpsLoading ? 0.7 : 1,
              }]}
            >
              <Text style={{ color: "#ffffff", fontWeight: "bold", fontSize: 14 }}>
                {gpsLoading ? (language === "ar" ? "جاري التحميل..." : isEn ? "Loading..." : "Bezig...") : (language === "ar" ? "📍 تفعيل GPS" : isEn ? "📍 Enable GPS" : "📍 GPS inschakelen")}
              </Text>
            </Pressable>

            {/* Divider */}
            <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 10 }}>
              <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
              <Text style={{ color: colors.muted, fontSize: 12 }}>{t("settings.or")}</Text>
              <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
            </View>

            {/* Manual city input */}
            <Pressable
              onPress={() => setShowManualInput(!showManualInput)}
              style={({ pressed }) => [{
                backgroundColor: pressed ? colors.surface : colors.background,
                borderRadius: 12,
                paddingVertical: 12,
                paddingHorizontal: 16,
                alignItems: "center" as const,
                borderWidth: 1,
                borderColor: colors.border,
              }]}
            >
              <Text style={{ color: colors.foreground, fontSize: 14, fontWeight: "600" }}>
                {t("settings.gps_manual_enter")}
              </Text>
            </Pressable>

            {showManualInput && (
              <View style={{ gap: 8 }}>
                <TextInput
                  value={manualCityInput}
                  onChangeText={setManualCityInput}
                  placeholder={t("settings.gps_placeholder")}
                  placeholderTextColor={colors.muted}
                  returnKeyType="done"
                  onSubmitEditing={() => {
                    if (manualCityInput.trim()) {
                      handleManualCitySave();
                    }
                  }}
                  style={{
                    backgroundColor: colors.background,
                    borderWidth: 1,
                    borderColor: colors.border,
                    borderRadius: 10,
                    paddingHorizontal: 14,
                    paddingVertical: 12,
                    fontSize: 15,
                    color: colors.foreground,
                  }}
                />
                <Pressable
                  onPress={handleManualCitySave}
                  disabled={!manualCityInput.trim()}
                  style={({ pressed }) => [{
                    backgroundColor: manualCityInput.trim() ? (pressed ? colors.primary + "CC" : colors.primary) : colors.muted + "30",
                    borderRadius: 10,
                    paddingVertical: 12,
                    alignItems: "center" as const,
                  }]}
                >
                  <Text style={{ color: "#ffffff", fontSize: 14, fontWeight: "bold" }}>
                    {t("settings.save")}
                  </Text>
                </Pressable>
              </View>
            )}
          </View>
        ) : (
          <View>
            {/* Location info */}
            <View style={{ backgroundColor: colors.primary + "10", borderWidth: 1, borderColor: colors.primary + "30", borderRadius: 12, padding: 12, marginBottom: 12 }}>
              <Text style={{ color: colors.foreground, fontSize: 13, marginBottom: 2 }}>
                {t("settings.gps_is_enabled")}
              </Text>
              {location.city ? (
                <Text style={{ color: colors.primary, fontSize: 16, fontWeight: "bold" }}>
                  📍 {language === "ar" ? getCityAR(location.city || "") : location.city}{location.country ? `, ${language === "ar" ? getCountryAR(location.country) : location.country}` : ""}
                </Text>
              ) : (
                <Text style={{ color: colors.muted, fontSize: 12 }}>
                  {t("settings.gps_city_unknown")}
                </Text>
              )}
              {location.lastUpdated ? (
                <Text style={{ color: colors.muted, fontSize: 10, marginTop: 4 }}>
                  {t("settings.gps_last_updated")}: {new Date(location.lastUpdated).toLocaleString(language === "ar" ? "ar-SA" : language === "en" ? "en-US" : "nl-NL")}
                </Text>
              ) : null}
            </View>

            {/* Action buttons */}
            <View style={{ flexDirection: isRTL ? "row-reverse" : "row", gap: 10, marginBottom: 10 }}>
              <Pressable
                onPress={handleRefreshLocation}
                disabled={gpsLoading}
                style={({ pressed }) => [{
                  flex: 1,
                  backgroundColor: pressed ? colors.primary + "25" : colors.primary + "15",
                  borderRadius: 10,
                  paddingVertical: 12,
                  alignItems: "center" as const,
                  opacity: gpsLoading ? 0.5 : 1,
                }]}
              >
                <Text style={{ color: colors.primary, fontSize: 12, fontWeight: "600" }}>
                  {gpsLoading ? (language === "ar" ? "جاري الجلب..." : isEn ? "Fetching..." : "Ophalen...") : (language === "ar" ? "🔄 تحديث" : isEn ? "🔄 Refresh" : "🔄 Vernieuwen")}
                </Text>
              </Pressable>

              <Pressable
                onPress={handleGpsDisable}
                style={({ pressed }) => [{
                  flex: 1,
                  backgroundColor: pressed ? colors.error + "25" : colors.error + "10",
                  borderRadius: 10,
                  paddingVertical: 12,
                  alignItems: "center" as const,
                }]}
              >
                <Text style={{ color: colors.error, fontSize: 12, fontWeight: "600" }}>
                  {t("settings.gps_disable_btn")}
                </Text>
              </Pressable>
            </View>

            {/* Manual city change */}
            <Pressable
              onPress={() => setShowManualInput(!showManualInput)}
              style={({ pressed }) => [{
                backgroundColor: pressed ? colors.surface : colors.background,
                borderRadius: 10,
                paddingVertical: 10,
                paddingHorizontal: 14,
                alignItems: "center" as const,
                borderWidth: 1,
                borderColor: colors.border,
                marginBottom: showManualInput ? 0 : 0,
              }]}
            >
              <Text style={{ color: colors.foreground, fontSize: 12, fontWeight: "600" }}>
                {t("settings.gps_manual_change")}
              </Text>
            </Pressable>

            {showManualInput && (
              <View style={{ gap: 8, marginTop: 8 }}>
                <TextInput
                  value={manualCityInput}
                  onChangeText={setManualCityInput}
                  placeholder={t("settings.gps_placeholder")}
                  placeholderTextColor={colors.muted}
                  returnKeyType="done"
                  onSubmitEditing={() => {
                    if (manualCityInput.trim()) {
                      handleManualCitySave();
                    }
                  }}
                  style={{
                    backgroundColor: colors.background,
                    borderWidth: 1,
                    borderColor: colors.border,
                    borderRadius: 10,
                    paddingHorizontal: 14,
                    paddingVertical: 12,
                    fontSize: 15,
                    color: colors.foreground,
                  }}
                />
                <Pressable
                  onPress={handleManualCitySave}
                  disabled={!manualCityInput.trim()}
                  style={({ pressed }) => [{
                    backgroundColor: manualCityInput.trim() ? (pressed ? colors.primary + "CC" : colors.primary) : colors.muted + "30",
                    borderRadius: 10,
                    paddingVertical: 12,
                    alignItems: "center" as const,
                  }]}
                >
                  <Text style={{ color: "#ffffff", fontSize: 14, fontWeight: "bold" }}>
                    {t("settings.save")}
                  </Text>
                </Pressable>
              </View>
            )}
          </View>
        )}
      </SettingsCollapsible>

      {/* Parent profile editing */}
      <SettingsCollapsible title={language === "ar" ? "الملف الشخصي" : isEn ? "My Profile" : "Mijn Profiel"} icon="person" colors={colors} isRTL={isRTL} defaultOpen={false}>
        {/* ID display */}
        {isAuthenticated && myIdQuery.data?.publicId && (
          <View style={{ backgroundColor: colors.primary + "08", borderRadius: 10, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: colors.primary + "20" }}>
            <Text style={{ color: colors.muted, fontSize: 11 }}>{language === "ar" ? "رقم هويتي" : isEn ? "My ID" : "Mijn ID"}</Text>
            <Text style={{ color: colors.primary, fontSize: 16, fontWeight: "800", fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace", letterSpacing: 1, marginTop: 2 }}>
              {myIdQuery.data.publicId}
            </Text>
          </View>
        )}
        {/* Spouse/Mother info if married */}
        {state.parentProfile.gender === "man" && state.parentProfile.partnerName && (
          <View style={{ backgroundColor: "#AD1457" + "10", borderRadius: 10, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: "#AD1457" + "25" }}>
            <Text style={{ color: colors.muted, fontSize: 11 }}>{language === "ar" ? "الأم المرتبطة" : isEn ? "Connected Mother" : "Gekoppelde moeder"}</Text>
            <Text style={{ color: "#AD1457", fontSize: 14, fontWeight: "700", marginTop: 2 }}>
              {state.parentProfile.partnerName}
            </Text>
            {state.parentProfile.partnerId && (
              <Text style={{ color: colors.muted, fontSize: 11, marginTop: 2 }}>
                {language === "ar" ? "رقم هوية الأم" : isEn ? "Mother ID" : "ID moeder"}: {state.parentProfile.partnerId}
              </Text>
            )}
          </View>
        )}
        {state.parentProfile.gender === "vrouw" && state.parentProfile.partnerName && (
          <View style={{ backgroundColor: "#0277BD" + "10", borderRadius: 10, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: "#0277BD" + "25" }}>
            <Text style={{ color: colors.muted, fontSize: 11 }}>{language === "ar" ? "الأب المرتبط" : isEn ? "Connected Father" : "Gekoppelde vader"}</Text>
            <Text style={{ color: "#0277BD", fontSize: 14, fontWeight: "700", marginTop: 2 }}>
              {state.parentProfile.partnerName}
            </Text>
            {state.parentProfile.partnerId && (
              <Text style={{ color: colors.muted, fontSize: 11, marginTop: 2 }}>
                {language === "ar" ? "رقم هوية الأب" : isEn ? "Father ID" : "ID vader"}: {state.parentProfile.partnerId}
              </Text>
            )}
          </View>
        )}
        <Text className="text-sm mb-1" style={{ color: colors.muted }}>
          {t("settings.profile_gender")}: {state.parentProfile.gender === "man" ? t("settings.man") : state.parentProfile.gender === "vrouw" ? t("settings.woman") : t("settings.not_filled")}
        </Text>
        <Text className="text-sm mb-1" style={{ color: colors.muted }}>
          {language === "ar" ? "الحالة الاجتماعية" : isEn ? "Marital status" : "Burgerlijke staat"}: {state.parentProfile.maritalStatus === "getrouwd" ? (language === "ar" ? "متزوج/ة" : isEn ? "Married" : "Getrouwd") : state.parentProfile.maritalStatus === "gescheiden" ? (language === "ar" ? "مطلق/ة" : isEn ? "Divorced" : "Gescheiden") : state.parentProfile.maritalStatus === "weduwe_weduwnaar" ? (language === "ar" ? "أرمل/ة" : isEn ? "Widowed" : "Weduwe/Weduwnaar") : state.parentProfile.maritalStatus === "alleenstaand" ? (language === "ar" ? "أعزب/عزباء" : isEn ? "Single" : "Alleenstaand") : t("settings.not_filled")}
        </Text>
        {state.parentProfile.previousMethodology && state.parentProfile.previousMethodology !== "geen" && (
          <Text className="text-sm mb-1" style={{ color: colors.warning }}>
            {language === "ar" ? "المنهج السابق" : isEn ? "Previous method" : "Vorige methode"}: {state.parentProfile.previousMethodology === "montessori" ? "Montessori" : state.parentProfile.previousMethodology === "positief_opvoeden" ? (language === "ar" ? "التربية الإيجابية" : isEn ? "Positive parenting" : "Positief opvoeden") : state.parentProfile.previousMethodology === "westers_psychologie" ? (language === "ar" ? "علم النفس الغربي" : isEn ? "Western psychology" : "Westerse psychologie") : state.parentProfile.previousMethodology}
          </Text>
        )}
        <Text className="text-sm mb-1" style={{ color: colors.muted }}>
          {t("settings.profile_status")}: {state.parentProfileCompleted ? t("settings.profile_complete") : t("settings.profile_incomplete")}
        </Text>
        <Text className="text-sm mb-3" style={{ color: colors.muted }}>
          {t("settings.profile_last_updated")}: {lastUpdate}
        </Text>
        {/* Function badges */}
        {state.parentProfile.gender && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
            <View style={{ backgroundColor: state.parentProfile.gender === 'man' ? '#0277BD' : '#AD1457', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 }}>
              <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>
                {state.parentProfile.gender === 'man' ? (language === 'ar' ? '\u0623\u0628' : language === 'en' ? 'Father' : 'Vader') : (language === 'ar' ? '\u0623\u0645' : language === 'en' ? 'Mother' : 'Moeder')}
              </Text>
            </View>
          </View>
        )}
        <Pressable
          onPress={() => router.push("/onboarding/parent-profile")}
          style={({ pressed }) => [{
            backgroundColor: colors.primary,
            borderRadius: 10,
            paddingVertical: 12,
            alignItems: "center" as const,
            opacity: pressed ? 0.8 : 1,
          }]}
        >
          <Text style={{ color: "#ffffff", fontSize: 14, fontWeight: "bold" }}>
            {state.parentProfileCompleted ? t("settings.edit_profile") : t("settings.profile_fill")}
          </Text>
        </Pressable>
      </SettingsCollapsible>

      {/* Address editing */}
      <SettingsCollapsible title={language === "ar" ? "العنوان" : isEn ? "Address" : "Adres"} icon="location-on" colors={colors} isRTL={isRTL} defaultOpen={false}>
        <AddressEditor language={language} isRTL={isRTL} colors={colors} />
      </SettingsCollapsible>
      {/* Personal Advice Settings */}
      <SettingsCollapsible title={language === "ar" ? "النصيحة الشخصية" : isEn ? "Personal Advice" : "Persoonlijk Advies"} icon="auto-awesome" colors={colors} isRTL={isRTL}>
        <PersonalAdviceSettings colors={colors} language={language} isRTL={isRTL} router={router} />
      </SettingsCollapsible>
      {/* Children list */}
      <SettingsCollapsible title={language === "ar" ? "الأطفال" : isEn ? "Children" : "Kinderen"} icon="child-care" colors={colors} isRTL={isRTL}>
        <Text className="text-lg font-bold mb-3" style={{ color: colors.foreground }}>
          {t("settings.children_title")} ({state.children.length})
        </Text>
        {state.children.map((child) => (
          <View key={child.id} style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.foreground, fontSize: 16, fontWeight: "500" }}>
                {(() => { const n = child.name; const m = n.match(/^(Kind|Child|طفل)\s*(\d+)$/i); if (m) { return language === "ar" ? `طفل ${m[2]}` : language === "en" ? `Child ${m[2]}` : `Kind ${m[2]}`; } return n; })()}
              </Text>
              <Text style={{ color: colors.muted, fontSize: 12 }}>
                {child.gender || t("settings.gender_unknown")} — {child.birthDate ? new Date(child.birthDate).toLocaleDateString(language === "ar" ? "ar-SA" : language === "en" ? "en-US" : "nl-NL") : t("settings.no_birthdate")}
              </Text>
            </View>
            <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 8 }}>
              <Pressable
                onPress={() => router.push(`/child/${child.id}`)}
                style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}
              >
                <Text style={{ color: colors.primary, fontSize: 12, fontWeight: "600" }}>{t("settings.edit_btn")}</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  Alert.alert(
                    language === "ar" ? "إلغاء طفل" : isEn ? "Remove Child" : "Kind verwijderen",
                    language === "ar" ? `هل أنت متأكد من إلغاء "${child.name}"؟` : isEn ? `Are you sure you want to remove "${child.name}"?` : `Weet u zeker dat u "${child.name}" wilt verwijderen?`,
                    [
                      { text: language === "ar" ? "إلغاء" : isEn ? "Cancel" : "Annuleren", style: "cancel" },
                      {
                        text: language === "ar" ? "حذف" : isEn ? "Remove" : "Verwijderen",
                        style: "destructive",
                        onPress: () => removeChild(child.id),
                      },
                    ]
                  );
                }}
                style={({ pressed }) => [{ opacity: pressed ? 0.5 : 1 }]}
              >
                <Text style={{ color: colors.error, fontSize: 12, fontWeight: "600" }}>{language === "ar" ? "حذف" : isEn ? "Delete" : "Verwijderen"}</Text>
              </Pressable>
            </View>
          </View>
        ))}
      </SettingsCollapsible>


      {/* Communication & Sharing Settings */}
      <CommunicationSettings colors={colors} language={language} />

      {/* App info */}
      <SettingsCollapsible title={language === "ar" ? "معلومات التطبيق" : isEn ? "App Info" : "App Info"} icon="info" colors={colors} isRTL={isRTL}>
        <Text className="text-lg font-bold mb-2" style={{ color: colors.foreground }}>
          {t("settings.about_title")}
        </Text>
        <Text style={{ color: colors.muted, fontSize: 14, lineHeight: 20 }}>
          {t("settings.about_desc")}{"\n\n"}
          {"\u2022"} Het Opvoedingsdoelen-werkboek (Pre-nataal t/m Jaar 12){"\n"}
          {"\u2022"} الطرق العملية التربوية الربانية لغرس تعظيم الله{"\n"}
          {"\u2022"} الطرق الربانية العملية لتصحيح الأخطاء بالخطوات الخمس{"\n"}
          {"\u2022"} Islamitische Gezinskunde (feb 2022 - juni 2025){"\n"}
          {"\u2022"} الموسوعة الميسرة في تربية الأولاد
        </Text>
      </SettingsCollapsible>

      {/* Home Screen Widgets Settings */}
      {Platform.OS === "android" && (
        <SettingsCollapsible title={language === "ar" ? "ودجت الشاشة الرئيسية" : isEn ? "Home Screen Widgets" : "Startscherm Widgets"} icon="widgets" colors={colors} isRTL={isRTL}>
          <WidgetSettingsSection colors={colors} language={language} isRTL={isRTL} />
        </SettingsCollapsible>
      )}

      {/* App Updates Section */}
      <SettingsCollapsible title={language === "ar" ? "تحديث التطبيق" : isEn ? "App Updates" : "App Updates"} icon="system-update" colors={colors} isRTL={isRTL}>
        <UpdateSection colors={colors} language={language} isRTL={isRTL} isEn={isEn} />
      </SettingsCollapsible>

      {/* Owner / Admin panel — only for admin-role accounts */}
      {isAdminUser && (
        <Pressable
          onPress={() => router.push("/admin/panel" as any)}
          style={({ pressed }) => [{
            backgroundColor: "#EDE7F6",
            borderWidth: 1,
            borderColor: "#7C3AED30",
            borderRadius: 12,
            paddingVertical: 16,
            paddingHorizontal: 16,
            flexDirection: isRTL ? "row-reverse" : "row",
            alignItems: "center",
            gap: 12,
            marginTop: 16,
            opacity: pressed ? 0.7 : 1,
          }]}
        >
          <MaterialIcons name="admin-panel-settings" size={22} color="#7C3AED" />
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: "bold", color: "#7C3AED", fontSize: 14, textAlign: isRTL ? "right" : "left" }}>
              {language === "ar" ? "لوحة الإدارة" : language === "en" ? "Admin Panel" : "Beheerpaneel"}
            </Text>
            <Text style={{ color: "#9575CD", fontSize: 11, marginTop: 2, textAlign: isRTL ? "right" : "left" }}>
              {language === "ar" ? "المستخدمون، الصلاحيات، التقارير والأرقام" : language === "en" ? "Users, permissions, reports" : "Gebruikers, rechten, rapporten"}
            </Text>
          </View>
          <MaterialIcons name={isRTL ? "chevron-left" : "chevron-right"} size={20} color="#7C3AED" />
        </Pressable>
      )}

      {/* Specialist Registration */}
      <Pressable
        onPress={() => router.push("/specialist/register" as any)}
        style={({ pressed }) => [{
          backgroundColor: "#FFF3E0",
          borderWidth: 1,
          borderColor: "#FF980030",
          borderRadius: 12,
          paddingVertical: 16,
          paddingHorizontal: 16,
          flexDirection: "row" as const,
          alignItems: "center" as const,
          gap: 12,
          marginTop: 16,
          opacity: pressed ? 0.7 : 1,
        }]}
      >
        <MaterialIcons name="vpn-key" size={22} color="#FF9800" />
        <View style={{ flex: 1 }}>
          <Text style={{ fontWeight: "bold", color: "#E65100", fontSize: 14 }}>
            {language === "ar" ? "التسجيل كمتخصص" : language === "en" ? "Register as Specialist" : "Registreer als Specialist"}
          </Text>
          <Text style={{ color: "#FF9800", fontSize: 11, marginTop: 2 }}>
            {language === "ar" ? "أدخل رمز الدعوة للتسجيل" : language === "en" ? "Enter invitation code to register" : "Voer uitnodigingscode in om te registreren"}
          </Text>
        </View>
        <MaterialIcons name="chevron-right" size={20} color="#FF9800" />
      </Pressable>

      {/* Specialist Dashboard */}
      <Pressable
        onPress={() => router.push("/specialist/dashboard")}
        style={({ pressed }) => [{
          backgroundColor: "#E8F5E9",
          borderWidth: 1,
          borderColor: "#2E7D3230",
          borderRadius: 12,
          paddingVertical: 16,
          paddingHorizontal: 16,
          flexDirection: "row" as const,
          alignItems: "center" as const,
          gap: 12,
          marginTop: 16,
          opacity: pressed ? 0.7 : 1,
        }]}
      >
        <MaterialIcons name="menu-book" size={22} color="#2E7D32" />
        <View style={{ flex: 1 }}>
          <Text style={{ fontWeight: "bold", color: "#2E7D32", fontSize: 14 }}>
            {language === "ar" ? "لوحة المتخصص" : language === "en" ? "Specialist Dashboard" : "Specialistendashboard"}
          </Text>
          <Text style={{ color: "#4CAF50", fontSize: 11, marginTop: 2 }}>
            {language === "ar" ? "إدارة ملفك ومشاهدة العائلات المعينة" : language === "en" ? "Manage your profile and view assigned families" : "Beheer je profiel en bekijk toegewezen gezinnen"}
          </Text>
        </View>
        <MaterialIcons name="chevron-right" size={20} color="#2E7D32" />
      </Pressable>

      {/* Reset */}
      <Pressable
        onPress={handleReset}
        style={({ pressed }) => [{
          backgroundColor: colors.error + "15",
          borderWidth: 1,
          borderColor: colors.error,
          borderRadius: 12,
          paddingVertical: 16,
          alignItems: "center" as const,
          marginTop: 16,
          opacity: pressed ? 0.7 : 1,
        }]}
      >
        <Text style={{ fontWeight: "bold", color: colors.error }}>
          {t("settings.reset_all")}
        </Text>
      </Pressable>
      </ScrollView>
    </View>
  );
}

// ============ PERSONAL ADVICE SETTINGS COMPONENT ============

function PersonalAdviceSettings({ colors, language, isRTL, router }: { colors: any; language: string; isRTL: boolean; router: any }) {
  const [animEnabled, setAnimEnabled] = React.useState(true);
  const [dailyPrefs, setDailyPrefs] = React.useState({ enabled: true, hour: 7, minute: 0 });
  const [weeklyGoalsPrefs, setWeeklyGoalsPrefs] = React.useState({ enabled: true, hour: 8, minute: 30 });
  const [widgetEnabled, setWidgetEnabled] = React.useState(false);
  const [favCount, setFavCount] = React.useState(0);
  const [showTimePicker, setShowTimePicker] = React.useState(false);
  const [showWeeklyTimePicker, setShowWeeklyTimePicker] = React.useState(false);
  const [spousePrefs, setSpousePrefs] = React.useState({ enabled: true, hour: 20, minute: 30 });
  const [showSpouseTimePicker, setShowSpouseTimePicker] = React.useState(false);

  React.useEffect(() => {
    (async () => {
      const { loadAnimationEnabled, loadDailyAdvicePrefs, loadWidgetEnabled, loadFavorites } = await import("@/lib/advice-prefs");
      const { loadWeeklyGoalsNotifPrefs } = await import("@/lib/weekly-goals-notification");
      const { loadSpouseAdvicePrefs } = await import("@/lib/spouse-advice-notification");
      setAnimEnabled(await loadAnimationEnabled());
      setDailyPrefs(await loadDailyAdvicePrefs());
      setWeeklyGoalsPrefs(await loadWeeklyGoalsNotifPrefs());
      setWidgetEnabled(await loadWidgetEnabled());
      setSpousePrefs(await loadSpouseAdvicePrefs());
      const favs = await loadFavorites();
      setFavCount(favs.length);
    })();
  }, []);

  const handleAnimToggle = React.useCallback(async () => {
    const newVal = !animEnabled;
    setAnimEnabled(newVal);
    const { saveAnimationEnabled } = await import("@/lib/advice-prefs");
    await saveAnimationEnabled(newVal);
  }, [animEnabled]);

  const handleDailyToggle = React.useCallback(async () => {
    const newPrefs = { ...dailyPrefs, enabled: !dailyPrefs.enabled };
    setDailyPrefs(newPrefs);
    const { saveDailyAdvicePrefs } = await import("@/lib/advice-prefs");
    await saveDailyAdvicePrefs(newPrefs);
    if (Platform.OS !== "web") {
      if (newPrefs.enabled) {
        const { requestNotificationPermissions } = await import("@/lib/notifications");
        await requestNotificationPermissions();
      }
      const { scheduleDailyAdviceNotification, cancelDailyAdviceNotification } = await import("@/lib/daily-advice-notification");
      if (newPrefs.enabled) {
        await scheduleDailyAdviceNotification(language as "nl" | "en" | "ar");
      } else {
        await cancelDailyAdviceNotification();
      }
    }
  }, [dailyPrefs, language]);

  const handleTimeChange = React.useCallback(async (hour: number) => {
    const newPrefs = { ...dailyPrefs, hour, minute: 0 };
    setDailyPrefs(newPrefs);
    setShowTimePicker(false);
    const { saveDailyAdvicePrefs } = await import("@/lib/advice-prefs");
    await saveDailyAdvicePrefs(newPrefs);
    if (Platform.OS !== "web" && newPrefs.enabled) {
      const { scheduleDailyAdviceNotification } = await import("@/lib/daily-advice-notification");
      await scheduleDailyAdviceNotification(language as "nl" | "en" | "ar");
    }
  }, [dailyPrefs, language]);

  const handleSpouseToggle = React.useCallback(async () => {
    const newPrefs = { ...spousePrefs, enabled: !spousePrefs.enabled };
    setSpousePrefs(newPrefs);
    const { saveSpouseAdvicePrefs } = await import("@/lib/spouse-advice-notification");
    await saveSpouseAdvicePrefs(newPrefs);
    if (Platform.OS !== "web") {
      if (newPrefs.enabled) {
        const { requestNotificationPermissions } = await import("@/lib/notifications");
        await requestNotificationPermissions();
      }
      const { scheduleSpouseAdviceNotification, cancelSpouseAdviceNotification } = await import("@/lib/spouse-advice-notification");
      if (newPrefs.enabled) {
        await scheduleSpouseAdviceNotification(language as "nl" | "en" | "ar");
      } else {
        await cancelSpouseAdviceNotification();
      }
    }
  }, [spousePrefs, language]);

  const handleSpouseTimeChange = React.useCallback(async (hour: number) => {
    const newPrefs = { ...spousePrefs, hour, minute: 0 };
    setSpousePrefs(newPrefs);
    setShowSpouseTimePicker(false);
    const { saveSpouseAdvicePrefs } = await import("@/lib/spouse-advice-notification");
    await saveSpouseAdvicePrefs(newPrefs);
    if (Platform.OS !== "web" && newPrefs.enabled) {
      const { scheduleSpouseAdviceNotification } = await import("@/lib/spouse-advice-notification");
      await scheduleSpouseAdviceNotification(language as "nl" | "en" | "ar");
    }
  }, [spousePrefs, language]);

  const handleWeeklyGoalsToggle = React.useCallback(async () => {
    const newPrefs = { ...weeklyGoalsPrefs, enabled: !weeklyGoalsPrefs.enabled };
    setWeeklyGoalsPrefs(newPrefs);
    const { saveWeeklyGoalsNotifPrefs } = await import("@/lib/weekly-goals-notification");
    await saveWeeklyGoalsNotifPrefs(newPrefs);
    if (Platform.OS !== "web") {
      if (newPrefs.enabled) {
        const { requestNotificationPermissions } = await import("@/lib/notifications");
        await requestNotificationPermissions();
      }
      const { scheduleWeeklyGoalsNotification, cancelWeeklyGoalsNotification } = await import("@/lib/weekly-goals-notification");
      if (newPrefs.enabled) {
        await scheduleAllNotifications(language as "nl" | "en" | "ar");
      } else {
        await cancelWeeklyGoalsNotification();
      }
    }
  }, [weeklyGoalsPrefs, language]);

  const handleWeeklyGoalsTimeChange = React.useCallback(async (hour: number) => {
    const newPrefs = { ...weeklyGoalsPrefs, hour, minute: 30 };
    setWeeklyGoalsPrefs(newPrefs);
    setShowWeeklyTimePicker(false);
    const { saveWeeklyGoalsNotifPrefs } = await import("@/lib/weekly-goals-notification");
    await saveWeeklyGoalsNotifPrefs(newPrefs);
    if (Platform.OS !== "web" && newPrefs.enabled) {
      const { scheduleWeeklyGoalsNotification } = await import("@/lib/weekly-goals-notification");
      await scheduleAllNotifications(language as "nl" | "en" | "ar");
    }
  }, [weeklyGoalsPrefs, language]);

  const handleWidgetToggle = React.useCallback(async () => {
    const newVal = !widgetEnabled;
    setWidgetEnabled(newVal);
    const { saveWidgetEnabled } = await import("@/lib/advice-prefs");
    await saveWidgetEnabled(newVal);
    if (Platform.OS !== "web") {
      const { showAdviceWidget, dismissAdviceWidget } = await import("@/lib/daily-advice-notification");
      if (newVal) {
        await showAdviceWidget(language as "nl" | "en" | "ar");
      } else {
        await dismissAdviceWidget();
      }
    }
  }, [widgetEnabled, language]);

  const tx = (nl: string, en: string, ar: string) => language === "ar" ? ar : language === "en" ? en : nl;

  const HOURS = [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];

  // Time picker overlay
  if (showTimePicker) {
    return (
      <View className="rounded-2xl p-5 mb-4 border" style={{ backgroundColor: colors.surface, borderColor: colors.border }}>
        <Pressable onPress={() => setShowTimePicker(false)} style={{ marginBottom: 12 }}>
          <Text style={{ color: colors.primary, fontSize: 13 }}>{tx("\u2190 Terug", "\u2190 Back", "\u2190 رجوع")}</Text>
        </Pressable>
        <Text className="text-lg font-bold mb-3" style={{ color: colors.foreground }}>
          {tx("Kies tijdstip", "Choose time", "اختر الوقت")}
        </Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {HOURS.map((h) => (
            <Pressable
              key={h}
              onPress={() => handleTimeChange(h)}
              style={({ pressed }) => [{
                backgroundColor: h === dailyPrefs.hour ? colors.primary + "20" : colors.background,
                borderWidth: h === dailyPrefs.hour ? 1.5 : 1,
                borderColor: h === dailyPrefs.hour ? colors.primary : colors.border,
                borderRadius: 8,
                paddingVertical: 10,
                paddingHorizontal: 14,
                opacity: pressed ? 0.7 : 1,
              }]}
            >
              <Text style={{ fontSize: 13, fontWeight: h === dailyPrefs.hour ? "700" : "500", color: h === dailyPrefs.hour ? colors.primary : colors.foreground }}>
                {String(h).padStart(2, "0")}:00
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
    );
  }

  return (
    <View>
      <Text className="text-xs mb-4 leading-4" style={{ color: colors.muted }}>
        {tx("Beheer animaties, favorieten, meldingen en widget voor persoonlijk advies.", "Manage animations, favorites, notifications and widget for personal advice.", "إدارة الرسوم المتحركة والمفضلات والإشعارات والأداة للنصيحة الشخصية.")}
      </Text>

      {/* Animation toggle */}
      <Pressable
        onPress={handleAnimToggle}
        style={({ pressed }) => [{
          backgroundColor: animEnabled ? colors.primary + "15" : colors.muted + "15",
          borderRadius: 10,
          paddingVertical: 12,
          paddingHorizontal: 16,
          flexDirection: isRTL ? "row-reverse" : "row" as const,
          alignItems: "center" as const,
          justifyContent: "space-between" as const,
          borderWidth: 1,
          borderColor: animEnabled ? colors.primary + "40" : colors.border,
          opacity: pressed ? 0.8 : 1,
          marginBottom: 10,
        }]}
      >
        <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 8 }}>
          <MaterialIcons name="animation" size={18} color={animEnabled ? colors.primary : colors.muted} />
          <Text style={{ color: colors.foreground, fontSize: 13 }}>
            {tx("Animatie bij openklappen", "Expand animation", "حركة الفتح")}
          </Text>
        </View>
        <View style={{
          width: 44,
          height: 26,
          borderRadius: 13,
          backgroundColor: animEnabled ? colors.primary : colors.muted + "40",
          justifyContent: "center" as const,
          paddingHorizontal: 2,
        }}>
          <View style={{
            width: 22,
            height: 22,
            borderRadius: 11,
            backgroundColor: "#ffffff",
            alignSelf: animEnabled ? "flex-end" as const : "flex-start" as const,
          }} />
        </View>
      </Pressable>

      {/* Daily notification toggle */}
      <Pressable
        onPress={handleDailyToggle}
        style={({ pressed }) => [{
          backgroundColor: dailyPrefs.enabled ? "#4CAF5015" : colors.muted + "15",
          borderRadius: 10,
          paddingVertical: 12,
          paddingHorizontal: 16,
          flexDirection: isRTL ? "row-reverse" : "row" as const,
          alignItems: "center" as const,
          justifyContent: "space-between" as const,
          borderWidth: 1,
          borderColor: dailyPrefs.enabled ? "#4CAF5040" : colors.border,
          opacity: pressed ? 0.8 : 1,
          marginBottom: 10,
        }]}
      >
        <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 8 }}>
          <MaterialIcons name="notifications-active" size={18} color={dailyPrefs.enabled ? "#4CAF50" : colors.muted} />
          <Text style={{ color: colors.foreground, fontSize: 13 }}>
            {tx("Dagelijks advies-melding", "Daily advice notification", "إشعار النصيحة اليومية")}
          </Text>
        </View>
        <View style={{
          width: 44,
          height: 26,
          borderRadius: 13,
          backgroundColor: dailyPrefs.enabled ? "#4CAF50" : colors.muted + "40",
          justifyContent: "center" as const,
          paddingHorizontal: 2,
        }}>
          <View style={{
            width: 22,
            height: 22,
            borderRadius: 11,
            backgroundColor: "#ffffff",
            alignSelf: dailyPrefs.enabled ? "flex-end" as const : "flex-start" as const,
          }} />
        </View>
      </Pressable>

      {/* Time selector (only if daily enabled) */}
      {dailyPrefs.enabled && (
        <Pressable
          onPress={() => setShowTimePicker(true)}
          style={({ pressed }) => [{
            backgroundColor: colors.background,
            borderRadius: 8,
            paddingVertical: 10,
            paddingHorizontal: 14,
            flexDirection: isRTL ? "row-reverse" : "row" as const,
            alignItems: "center" as const,
            justifyContent: "space-between" as const,
            borderWidth: 1,
            borderColor: colors.border,
            opacity: pressed ? 0.8 : 1,
            marginBottom: 10,
            marginLeft: isRTL ? 0 : 26,
            marginRight: isRTL ? 26 : 0,
          }]}
        >
          <Text style={{ color: colors.muted, fontSize: 12 }}>
            {tx("Tijdstip", "Time", "الوقت")}: <Text style={{ fontWeight: "700", color: colors.foreground }}>{String(dailyPrefs.hour).padStart(2, "0")}:00</Text>
          </Text>
          <MaterialIcons name="schedule" size={16} color={colors.primary} />
        </Pressable>
      )}

      {/* Spouse advice daily notification toggle */}
      <Pressable
        onPress={handleSpouseToggle}
        style={({ pressed }) => [{
          backgroundColor: spousePrefs.enabled ? "#E91E6315" : colors.muted + "15",
          borderRadius: 10,
          paddingVertical: 12,
          paddingHorizontal: 16,
          flexDirection: isRTL ? "row-reverse" : "row" as const,
          alignItems: "center" as const,
          justifyContent: "space-between" as const,
          borderWidth: 1,
          borderColor: spousePrefs.enabled ? "#E91E6340" : colors.border,
          opacity: pressed ? 0.8 : 1,
          marginBottom: 10,
        }]}
      >
        <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 8 }}>
          <MaterialIcons name="favorite" size={18} color={spousePrefs.enabled ? "#E91E63" : colors.muted} />
          <Text style={{ color: colors.foreground, fontSize: 13 }}>
            {tx("إشعار اقتراحات الشريك اليومي", "Daily spouse suggestion", "إشعار اقتراحات الشريك اليومي")}
          </Text>
        </View>
        <View style={{
          width: 44,
          height: 26,
          borderRadius: 13,
          backgroundColor: spousePrefs.enabled ? "#E91E63" : colors.muted + "40",
          justifyContent: "center" as const,
          paddingHorizontal: 2,
        }}>
          <View style={{
            width: 22,
            height: 22,
            borderRadius: 11,
            backgroundColor: "#ffffff",
            alignSelf: spousePrefs.enabled ? "flex-end" as const : "flex-start" as const,
          }} />
        </View>
      </Pressable>

      {/* Spouse time selector */}
      {spousePrefs.enabled && (
        <Pressable
          onPress={() => setShowSpouseTimePicker(true)}
          style={({ pressed }) => [{
            backgroundColor: colors.background,
            borderRadius: 8,
            paddingVertical: 10,
            paddingHorizontal: 14,
            flexDirection: isRTL ? "row-reverse" : "row" as const,
            alignItems: "center" as const,
            justifyContent: "space-between" as const,
            borderWidth: 1,
            borderColor: colors.border,
            opacity: pressed ? 0.8 : 1,
            marginBottom: 10,
            marginLeft: isRTL ? 0 : 26,
            marginRight: isRTL ? 26 : 0,
          }]}
        >
          <Text style={{ color: colors.muted, fontSize: 12 }}>
            {tx("الوقت", "Time", "الوقت")}: <Text style={{ fontWeight: "700", color: colors.foreground }}>{String(spousePrefs.hour).padStart(2, "0")}:00</Text>
          </Text>
          <MaterialIcons name="schedule" size={16} color="#E91E63" />
        </Pressable>
      )}
      {showSpouseTimePicker && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 12, marginLeft: isRTL ? 0 : 26, marginRight: isRTL ? 26 : 0 }}>
          {[18, 19, 20, 21, 22].map(h => (
            <Pressable key={h} onPress={() => handleSpouseTimeChange(h)} style={({ pressed }) => [{
              paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8,
              backgroundColor: spousePrefs.hour === h ? "#E91E63" : colors.surface,
              borderWidth: 1, borderColor: spousePrefs.hour === h ? "#E91E63" : colors.border,
              opacity: pressed ? 0.7 : 1,
            }]}>
              <Text style={{ color: spousePrefs.hour === h ? "#fff" : colors.foreground, fontSize: 12, fontWeight: "600" }}>{String(h).padStart(2, "0")}:00</Text>
            </Pressable>
          ))}
        </View>
      )}

      {/* Widget toggle (Android only) */}
      {Platform.OS !== "web" && (
        <Pressable
          onPress={handleWidgetToggle}
          style={({ pressed }) => [{
            backgroundColor: widgetEnabled ? "#FF980015" : colors.muted + "15",
            borderRadius: 10,
            paddingVertical: 12,
            paddingHorizontal: 16,
            flexDirection: isRTL ? "row-reverse" : "row" as const,
            alignItems: "center" as const,
            justifyContent: "space-between" as const,
            borderWidth: 1,
            borderColor: widgetEnabled ? "#FF980040" : colors.border,
            opacity: pressed ? 0.8 : 1,
            marginBottom: 10,
          }]}
        >
          <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 8, flex: 1 }}>
            <MaterialIcons name="widgets" size={18} color={widgetEnabled ? "#FF9800" : colors.muted} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.foreground, fontSize: 13 }}>
                {tx("Advies-widget (vast bericht)", "Advice widget (sticky notification)", "أداة النصيحة (إشعار ثابت)")}
              </Text>
              <Text style={{ color: colors.muted, fontSize: 10, marginTop: 2 }}>
                {tx("Toont het advies van vandaag als vast bericht", "Shows today's advice as a persistent notification", "يعرض نصيحة اليوم كإشعار ثابت")}
              </Text>
            </View>
          </View>
          <View style={{
            width: 44,
            height: 26,
            borderRadius: 13,
            backgroundColor: widgetEnabled ? "#FF9800" : colors.muted + "40",
            justifyContent: "center" as const,
            paddingHorizontal: 2,
            flexShrink: 0,
            marginLeft: isRTL ? 0 : 8,
            marginRight: isRTL ? 8 : 0,
          }}>
            <View style={{
              width: 22,
              height: 22,
              borderRadius: 11,
              backgroundColor: "#ffffff",
              alignSelf: widgetEnabled ? "flex-end" as const : "flex-start" as const,
            }} />
          </View>
        </Pressable>
      )}

      {/* Weekly Goals Notification toggle */}
      <Pressable
        onPress={handleWeeklyGoalsToggle}
        style={({ pressed }) => [{
          backgroundColor: weeklyGoalsPrefs.enabled ? "#2196F315" : colors.muted + "15",
          borderRadius: 10,
          paddingVertical: 12,
          paddingHorizontal: 16,
          flexDirection: isRTL ? "row-reverse" : "row" as const,
          alignItems: "center" as const,
          justifyContent: "space-between" as const,
          borderWidth: 1,
          borderColor: weeklyGoalsPrefs.enabled ? "#2196F340" : colors.border,
          opacity: pressed ? 0.8 : 1,
          marginBottom: 10,
        }]}
      >
        <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 8, flex: 1 }}>
          <MaterialIcons name="flag" size={18} color={weeklyGoalsPrefs.enabled ? "#2196F3" : colors.muted} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.foreground, fontSize: 13 }}>
              {tx("Wekelijkse doelen herinnering", "Weekly goals reminder", "تذكير الأهداف الأسبوعية")}
            </Text>
            <Text style={{ color: colors.muted, fontSize: 10, marginTop: 2 }}>
              {tx("Dagelijkse herinnering aan je opvoeddoelen", "Daily reminder of your parenting goals", "تذكير يومي بأهدافك التربوية")}
            </Text>
          </View>
        </View>
        <View style={{
          width: 44,
          height: 26,
          borderRadius: 13,
          backgroundColor: weeklyGoalsPrefs.enabled ? "#2196F3" : colors.muted + "40",
          justifyContent: "center" as const,
          paddingHorizontal: 2,
          flexShrink: 0,
          marginLeft: isRTL ? 0 : 8,
          marginRight: isRTL ? 8 : 0,
        }}>
          <View style={{
            width: 22,
            height: 22,
            borderRadius: 11,
            backgroundColor: "#ffffff",
            alignSelf: weeklyGoalsPrefs.enabled ? "flex-end" as const : "flex-start" as const,
          }} />
        </View>
      </Pressable>

      {/* Weekly Goals Time selector */}
      {weeklyGoalsPrefs.enabled && (
        <View style={{ marginLeft: isRTL ? 0 : 26, marginRight: isRTL ? 26 : 0, marginBottom: 10 }}>
          <Text style={{ color: colors.muted, fontSize: 11, marginBottom: 6 }}>
            {tx("Kies tijd vrij", "Choose time freely", "اختر الوقت بحرية")}
          </Text>
          <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 8 }}>
            <TextInput
              value={String(weeklyGoalsPrefs.hour)}
              onChangeText={async (text) => {
                const num = parseInt(text.replace(/[^0-9]/g, ""), 10);
                if (!isNaN(num) && num >= 0 && num <= 23) {
                  const newPrefs = { ...weeklyGoalsPrefs, hour: num };
                  setWeeklyGoalsPrefs(newPrefs);
                  await AsyncStorage.setItem("@weekly_goals_prefs", JSON.stringify(newPrefs));
                  await scheduleAllNotifications(language as "nl" | "en" | "ar");
                }
              }}
              keyboardType="number-pad"
              returnKeyType="done"
              style={{ backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingVertical: 6, paddingHorizontal: 12, minWidth: 50, textAlign: "center", fontSize: 16, fontWeight: "700", color: colors.foreground }}
            />
            <Text style={{ fontSize: 18, fontWeight: "700", color: colors.foreground }}>:</Text>
            <TextInput
              value={String(weeklyGoalsPrefs.minute).padStart(2, "0")}
              onChangeText={async (text) => {
                const num = parseInt(text.replace(/[^0-9]/g, ""), 10);
                if (!isNaN(num) && num >= 0 && num <= 59) {
                  const newPrefs = { ...weeklyGoalsPrefs, minute: num };
                  setWeeklyGoalsPrefs(newPrefs);
                  await AsyncStorage.setItem("@weekly_goals_prefs", JSON.stringify(newPrefs));
                  await scheduleAllNotifications(language as "nl" | "en" | "ar");
                }
              }}
              keyboardType="number-pad"
              returnKeyType="done"
              style={{ backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingVertical: 6, paddingHorizontal: 12, minWidth: 50, textAlign: "center", fontSize: 16, fontWeight: "700", color: colors.foreground }}
            />
            <MaterialIcons name="schedule" size={16} color="#2196F3" />
          </View>
        </View>
      )}

      {/* Favorites summary */}
      <Pressable
        onPress={() => router.push("/(tabs)/personal-advice" as any)}
        style={({ pressed }) => [{
          backgroundColor: "#E5393510",
          borderRadius: 10,
          paddingVertical: 12,
          paddingHorizontal: 16,
          flexDirection: isRTL ? "row-reverse" : "row" as const,
          alignItems: "center" as const,
          justifyContent: "space-between" as const,
          borderWidth: 1,
          borderColor: "#E5393530",
          opacity: pressed ? 0.8 : 1,
        }]}
      >
        <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 8 }}>
          <MaterialIcons name="favorite" size={18} color="#E53935" />
          <Text style={{ color: colors.foreground, fontSize: 13 }}>
            {tx("Opgeslagen adviezen", "Saved advice", "النصائح المحفوظة")}
          </Text>
        </View>
        <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 6 }}>
          <View style={{ backgroundColor: "#E53935", minWidth: 20, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center", paddingHorizontal: 5 }}>
            <Text style={{ color: "#fff", fontSize: 11, fontWeight: "700" }}>{favCount}</Text>
          </View>
          <MaterialIcons name={isRTL ? "chevron-left" : "chevron-right"} size={18} color={colors.muted} />
        </View>
      </Pressable>
    </View>
  );
}

// ============================================================
// Communication & Sharing Settings Component
// ============================================================
function CommunicationSettings({ colors, language }: { colors: any; language: string }) {
  const [chatNotifications, setChatNotifications] = useState(true);
  const [autoAcceptLinks, setAutoAcceptLinks] = useState(false);
  const [shareDefaults, setShareDefaults] = useState<string[]>(["name", "age", "gender"]);
  const [open, setOpen] = useState(false);
  const isRTL = language === "ar";

  const tx = (nl: string, en: string, ar: string) =>
    language === "ar" ? ar : language === "en" ? en : nl;

  useEffect(() => {
    AsyncStorage.getItem("@comm_chat_notifications").then((v) => {
      if (v !== null) setChatNotifications(v === "true");
    });
    AsyncStorage.getItem("@comm_auto_accept_links").then((v) => {
      if (v !== null) setAutoAcceptLinks(v === "true");
    });
    AsyncStorage.getItem("@share_default_fields").then((v) => {
      if (v) {
        try { setShareDefaults(JSON.parse(v)); } catch {}
      }
    });
  }, []);

  const toggleChatNotifications = async () => {
    const newVal = !chatNotifications;
    setChatNotifications(newVal);
    await AsyncStorage.setItem("@comm_chat_notifications", String(newVal));
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const toggleAutoAcceptLinks = async () => {
    const newVal = !autoAcceptLinks;
    setAutoAcceptLinks(newVal);
    await AsyncStorage.setItem("@comm_auto_accept_links", String(newVal));
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  return (
    <View
      className="rounded-2xl p-5 mb-4 border"
      style={{ backgroundColor: colors.surface, borderColor: colors.border }}
    >
      <Pressable
        onPress={() => setOpen((o) => !o)}
        style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", justifyContent: "space-between" }}
      >
        <Text className="text-lg font-bold" style={{ color: colors.foreground, textAlign: isRTL ? "right" : "left" }}>
          {tx("Communicatie & Delen", "Communication & Sharing", "التواصل والمشاركة")}
        </Text>
        <MaterialIcons name={open ? "keyboard-arrow-up" : "keyboard-arrow-down"} size={24} color={colors.muted} />
      </Pressable>

      {open && (<View style={{ marginTop: 12 }}>
      {/* Chat notifications toggle */}
      <Pressable
        onPress={toggleChatNotifications}
        style={({ pressed }) => [{
          flexDirection: isRTL ? "row-reverse" : "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingVertical: 12,
          borderBottomWidth: 0.5,
          borderBottomColor: colors.border,
          opacity: pressed ? 0.7 : 1,
        }]}
      >
        <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 10, flex: 1 }}>
          <MaterialIcons name="chat-bubble" size={18} color={colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground, textAlign: isRTL ? "right" : "left" }}>
              {tx("Berichtmeldingen", "Message notifications", "إشعارات الرسائل")}
            </Text>
            <Text style={{ fontSize: 11, color: colors.muted, textAlign: isRTL ? "right" : "left" }}>
              {tx("Push-melding bij nieuw bericht van co-ouder", "Push notification for new co-parent message", "إشعار فوري عند رسالة جديدة من الوالد المشارك")}
            </Text>
          </View>
        </View>
        <View style={{
          width: 46,
          height: 26,
          borderRadius: 13,
          backgroundColor: chatNotifications ? colors.success : colors.muted + "40",
          justifyContent: "center",
          paddingHorizontal: 2,
        }}>
          <View style={{
            width: 22,
            height: 22,
            borderRadius: 11,
            backgroundColor: "#ffffff",
            alignSelf: chatNotifications ? "flex-end" : "flex-start",
          }} />
        </View>
      </Pressable>

      {/* Auto-accept links toggle */}
      <Pressable
        onPress={toggleAutoAcceptLinks}
        style={({ pressed }) => [{
          flexDirection: isRTL ? "row-reverse" : "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingVertical: 12,
          borderBottomWidth: 0.5,
          borderBottomColor: colors.border,
          opacity: pressed ? 0.7 : 1,
        }]}
      >
        <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 10, flex: 1 }}>
          <MaterialIcons name="link" size={18} color={colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground, textAlign: isRTL ? "right" : "left" }}>
              {tx("Auto-accepteren koppelingen", "Auto-accept links", "قبول الروابط تلقائيًا")}
            </Text>
            <Text style={{ fontSize: 11, color: colors.muted, textAlign: isRTL ? "right" : "left" }}>
              {tx("Koppelverzoeken automatisch goedkeuren", "Automatically approve link requests", "الموافقة تلقائيًا على طلبات الربط")}
            </Text>
          </View>
        </View>
        <View style={{
          width: 46,
          height: 26,
          borderRadius: 13,
          backgroundColor: autoAcceptLinks ? colors.success : colors.muted + "40",
          justifyContent: "center",
          paddingHorizontal: 2,
        }}>
          <View style={{
            width: 22,
            height: 22,
            borderRadius: 11,
            backgroundColor: "#ffffff",
            alignSelf: autoAcceptLinks ? "flex-end" : "flex-start",
          }} />
        </View>
      </Pressable>

      {/* Default share fields info */}
      <View style={{ paddingVertical: 12, flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 10 }}>
        <MaterialIcons name="share" size={18} color={colors.primary} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 14, fontWeight: "600", color: colors.foreground, textAlign: isRTL ? "right" : "left" }}>
            {tx("Standaard deelvelden", "Default share fields", "حقول المشاركة الافتراضية")}
          </Text>
          <Text style={{ fontSize: 11, color: colors.muted, textAlign: isRTL ? "right" : "left" }}>
            {tx(
              `${shareDefaults.length} velden geselecteerd — wijzig bij het delen`,
              `${shareDefaults.length} fields selected — change when sharing`,
              `${shareDefaults.length} حقول محددة — التغيير عند المشاركة`
            )}
          </Text>
        </View>
        <View style={{ backgroundColor: colors.primary + "15", borderRadius: 10, paddingVertical: 3, paddingHorizontal: 8 }}>
          <Text style={{ fontSize: 11, color: colors.primary, fontWeight: "600" }}>{shareDefaults.length}</Text>
        </View>
      </View>
      </View>)}
    </View>
  );
}


// ============ UPDATE SECTION ============
function UpdateSection({ colors, language, isRTL, isEn }: { colors: any; language: string; isRTL: boolean; isEn: boolean }) {
  const { isChecking, isDownloading, isUpdateAvailable, currentVersion, lastChecked, downloadProgress, error, checkForUpdate } = useUpdates(language);

  const tx = (nl: string, en: string, ar: string) =>
    language === "ar" ? ar : language === "en" ? en : nl;

  const formatDate = (date: Date | null) => {
    if (!date) return tx("Nooit gecontroleerd", "Never checked", "لم يتم التحقق بعد");
    return date.toLocaleString(language === "ar" ? "ar-SA" : language === "en" ? "en-US" : "nl-NL", {
      dateStyle: "short",
      timeStyle: "short",
    });
  };

  return (
    <View style={{ gap: 16 }}>
      {/* Current Version */}
      <View style={{ backgroundColor: colors.surface, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: colors.border }}>
        <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 12 }}>
          <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primary + "15", alignItems: "center", justifyContent: "center" }}>
            <MaterialIcons name="verified" size={24} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground, textAlign: isRTL ? "right" : "left" }}>
              {tx("Huidige versie", "Current Version", "الإصدار الحالي")}
            </Text>
            <Text style={{ fontSize: 18, fontWeight: "800", color: colors.primary, textAlign: isRTL ? "right" : "left", marginTop: 2 }}>
              v{currentVersion}
            </Text>
          </View>
          {!isUpdateAvailable && (
            <View style={{ backgroundColor: colors.success + "20", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 }}>
              <Text style={{ fontSize: 11, fontWeight: "600", color: colors.success }}>
                {tx("Bijgewerkt", "Up to date", "محدّث")}
              </Text>
            </View>
          )}
          {isUpdateAvailable && (
            <View style={{ backgroundColor: colors.warning + "20", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 }}>
              <Text style={{ fontSize: 11, fontWeight: "600", color: colors.warning }}>
                {tx("Update beschikbaar", "Update available", "تحديث متاح")}
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* Last Checked */}
      <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 8, paddingHorizontal: 4 }}>
        <MaterialIcons name="schedule" size={16} color={colors.muted} />
        <Text style={{ fontSize: 12, color: colors.muted }}>
          {tx("Laatst gecontroleerd:", "Last checked:", "آخر فحص:")} {formatDate(lastChecked)}
        </Text>
      </View>

      {/* Check for Updates Button */}
      <Pressable
        onPress={() => checkForUpdate(false)}
        disabled={isChecking || isDownloading}
        style={({ pressed }) => [{
          backgroundColor: isChecking || isDownloading ? colors.muted + "30" : colors.primary,
          borderRadius: 12,
          paddingVertical: 16,
          paddingHorizontal: 20,
          flexDirection: isRTL ? "row-reverse" : "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
          opacity: pressed ? 0.8 : 1,
        }]}
      >
        {(isChecking || isDownloading) ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : (
          <MaterialIcons name="refresh" size={20} color="#fff" />
        )}
        <Text style={{ fontSize: 15, fontWeight: "700", color: (isChecking || isDownloading) ? colors.muted : "#fff" }}>
          {isChecking
            ? tx("Controleren...", "Checking...", "جارٍ التحقق...")
            : isDownloading
            ? `${tx("Downloaden...", "Downloading...", "جارٍ التنزيل...")}${downloadProgress > 0 ? ` ${Math.round(downloadProgress * 100)}%` : ""}`
            : tx("Controleer op updates", "Check for Updates", "التحقق من التحديثات")}
        </Text>
      </Pressable>

      {/* Last error (persists after the alert is dismissed) */}
      {!!error && !isChecking && !isDownloading && (
        <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 8, paddingHorizontal: 4 }}>
          <MaterialIcons name="error-outline" size={16} color={colors.destructive} />
          <Text style={{ flex: 1, fontSize: 12, color: colors.destructive, textAlign: isRTL ? "right" : "left" }}>
            {tx(
              "Laatste poging is mislukt. Probeer het opnieuw.",
              "The last attempt failed. Please try again.",
              "فشلت المحاولة الأخيرة. يرجى إعادة المحاولة."
            )}
          </Text>
        </View>
      )}

      {/* Info Text */}
      <View style={{ backgroundColor: colors.primary + "08", borderRadius: 10, padding: 12, borderWidth: 1, borderColor: colors.primary + "20" }}>
        <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "flex-start", gap: 8 }}>
          <MaterialIcons name="info-outline" size={16} color={colors.primary} style={{ marginTop: 2 }} />
          <Text style={{ flex: 1, fontSize: 12, color: colors.muted, lineHeight: 18, textAlign: isRTL ? "right" : "left" }}>
            {tx(
              "De app controleert automatisch op updates bij het openen. Wanneer een update beschikbaar is, wordt u gevraagd om bij te werken zonder de app opnieuw te installeren.",
              "The app automatically checks for updates on launch. When an update is available, you'll be prompted to update without reinstalling the app.",
              "يتحقق التطبيق تلقائياً من التحديثات عند فتحه. عند توفر تحديث، ستتم مطالبتك بالتحديث دون الحاجة لإعادة تثبيت التطبيق."
            )}
          </Text>
        </View>
      </View>
    </View>
  );
}

// ============ Widget Settings Section (Full Control) ============
function WidgetSettingsSection({ colors, language, isRTL }: { colors: any; language: string; isRTL: boolean }) {
  const isEn = language === "en";
  const tx = (nl: string, en: string, ar: string) => language === "ar" ? ar : isEn ? en : nl;
  const { loadWidgetSettings, saveWidgetSettings, DEFAULT_WIDGET_SETTINGS, appearanceFor, BACKGROUND_COLORS, TEXT_COLORS, BORDER_COLORS } = require("@/lib/widget-settings");
  type FullWidgetSettings = import("@/lib/widget-settings").FullWidgetSettings;
  type WidgetType = import("@/lib/widget-settings").WidgetType;
  type WidgetAppearanceSettings = import("@/lib/widget-settings").WidgetAppearanceSettings;

  const [ws, setWs] = React.useState<FullWidgetSettings>(DEFAULT_WIDGET_SETTINGS);
  const [activeTab, setActiveTab] = React.useState<"appearance" | "timing" | "content" | "behavior">("content");
  // The appearance tab edits one widget type at a time so each can be styled independently.
  const [activeWidgetType, setActiveWidgetType] = React.useState<WidgetType>("combined");

  React.useEffect(() => {
    loadWidgetSettings().then((s: FullWidgetSettings) => setWs(s));
  }, []);

  const updateSettings = async (patch: Partial<FullWidgetSettings>) => {
    const newWs = { ...ws, ...patch };
    setWs(newWs);
    await saveWidgetSettings(newWs);
    if (newWs.behavior.instantUpdate) {
      try {
        const { refreshAllWidgets } = require("@/widgets/widgetSync");
        await refreshAllWidgets();
      } catch {}
    }
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  // Appearance is edited per widget type. Reads resolve the type's own override (or
  // the global default); writes are scoped to appearanceByType[activeWidgetType].
  const activeAppearance: WidgetAppearanceSettings = appearanceFor(ws, activeWidgetType);
  const updateAppearance = (patch: Partial<WidgetAppearanceSettings>) => {
    const base = ws.appearanceByType?.[activeWidgetType] ?? ws.appearance;
    updateSettings({ appearanceByType: { ...(ws.appearanceByType ?? {}), [activeWidgetType]: { ...base, ...patch } } });
  };

  const widgetTypeLabels: { key: WidgetType; label: string }[] = [
    { key: "prayer", label: tx("Gebed", "Prayer", "الصلاة") },
    { key: "dhikr", label: tx("Dhikr", "Dhikr", "الذكر") },
    { key: "goal", label: tx("Doel", "Goal", "الهدف") },
    { key: "hijri", label: tx("Hijri", "Hijri", "التاريخ") },
    { key: "combined", label: tx("Alles", "Combined", "الشامل") },
  ];

  const ToggleRow = ({ label, value, onToggle }: { label: string; value: boolean; onToggle: () => void }) => (
    <Pressable
      onPress={onToggle}
      style={({ pressed }) => [{
        backgroundColor: value ? colors.primary + "12" : colors.muted + "08",
        borderRadius: 10,
        paddingVertical: 11,
        paddingHorizontal: 14,
        flexDirection: isRTL ? "row-reverse" : "row",
        alignItems: "center",
        justifyContent: "space-between",
        borderWidth: 1,
        borderColor: value ? colors.primary + "30" : colors.border,
        marginBottom: 7,
        opacity: pressed ? 0.8 : 1,
      }]}
    >
      <Text style={{ fontSize: 13, color: colors.foreground, fontWeight: "500", textAlign: isRTL ? "right" : "left", flex: 1 }}>
        {label}
      </Text>
      <View style={{ width: 40, height: 22, borderRadius: 11, backgroundColor: value ? colors.primary : colors.muted + "40", justifyContent: "center", paddingHorizontal: 2 }}>
        <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: "#fff", alignSelf: value ? "flex-end" : "flex-start" }} />
      </View>
    </Pressable>
  );

  const ColorPicker = ({ label, colors: colorOptions, value, onChange }: { label: string; colors: { label: string; value: string }[]; value: string; onChange: (v: string) => void }) => (
    <View style={{ marginBottom: 12 }}>
      <Text style={{ fontSize: 12, fontWeight: "600", color: colors.foreground, marginBottom: 6, textAlign: isRTL ? "right" : "left" }}>{label}</Text>
      <View style={{ flexDirection: isRTL ? "row-reverse" : "row", flexWrap: "wrap", gap: 8 }}>
        {colorOptions.map((c) => (
          <Pressable key={c.value} onPress={() => onChange(c.value)} style={({ pressed }) => [{
            width: 32, height: 32, borderRadius: 16, backgroundColor: c.value,
            borderWidth: value === c.value ? 3 : 1,
            borderColor: value === c.value ? colors.primary : colors.border,
            opacity: pressed ? 0.7 : 1,
          }]} />
        ))}
      </View>
    </View>
  );

  const OptionRow = ({ label, options, value, onChange }: { label: string; options: { key: string; label: string }[]; value: string; onChange: (v: string) => void }) => (
    <View style={{ marginBottom: 12 }}>
      <Text style={{ fontSize: 12, fontWeight: "600", color: colors.foreground, marginBottom: 6, textAlign: isRTL ? "right" : "left" }}>{label}</Text>
      <View style={{ flexDirection: isRTL ? "row-reverse" : "row", gap: 6, flexWrap: "wrap" }}>
        {options.map((opt) => (
          <Pressable key={opt.key} onPress={() => onChange(opt.key)} style={({ pressed }) => [{
            backgroundColor: value === opt.key ? colors.primary : colors.surface,
            borderRadius: 8, paddingVertical: 7, paddingHorizontal: 12,
            borderWidth: 1, borderColor: value === opt.key ? colors.primary : colors.border,
            opacity: pressed ? 0.7 : 1,
          }]}>
            <Text style={{ fontSize: 11, fontWeight: "600", color: value === opt.key ? "#fff" : colors.foreground }}>{opt.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );

  const SliderRow = ({ label, value, min, max, step, onChange }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void }) => (
    <View style={{ marginBottom: 12 }}>
      <View style={{ flexDirection: isRTL ? "row-reverse" : "row", justifyContent: "space-between", marginBottom: 4 }}>
        <Text style={{ fontSize: 12, fontWeight: "600", color: colors.foreground }}>{label}</Text>
        <Text style={{ fontSize: 12, color: colors.primary, fontWeight: "700" }}>{value}{typeof max === "number" && max <= 1 ? "%" : (max >= 80 && max <= 200 ? "%" : "")}</Text>
      </View>
      <View style={{ flexDirection: isRTL ? "row-reverse" : "row", gap: 6, flexWrap: "wrap" }}>
        {Array.from({ length: Math.floor((max - min) / step) + 1 }, (_, i) => min + i * step).map((v) => (
          <Pressable key={v} onPress={() => onChange(v)} style={({ pressed }) => [{
            backgroundColor: value === v ? colors.primary : colors.surface,
            borderRadius: 6, paddingVertical: 5, paddingHorizontal: 10,
            borderWidth: 1, borderColor: value === v ? colors.primary : colors.border,
            opacity: pressed ? 0.7 : 1,
          }]}>
            <Text style={{ fontSize: 11, fontWeight: "600", color: value === v ? "#fff" : colors.foreground }}>{max <= 1 ? Math.round(v * 100) + "%" : (max >= 80 && max <= 200 ? v + "%" : v)}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );

  const tabs = [
    { key: "content" as const, icon: "view-list", label: tx("Inhoud", "Content", "المحتوى") },
    { key: "appearance" as const, icon: "palette", label: tx("Uiterlijk", "Appearance", "المظهر") },
    { key: "timing" as const, icon: "schedule", label: tx("Tijden", "Timing", "الأوقات") },
    { key: "behavior" as const, icon: "touch-app", label: tx("Werking", "Behavior", "الفاعلية") },
  ];

  const widgets: { type: WidgetType; icon: string; name: string; desc: string }[] = [
    { type: "prayer", icon: "schedule", name: tx("Gebedswidget", "Prayer Widget", "ودجت الصلاة"), desc: tx("Volgende gebed en alle tijden", "Next prayer and all times", "الصلاة القادمة وجميع الأوقات") },
    { type: "dhikr", icon: "auto-stories", name: tx("Dhikr-widget", "Dhikr Widget", "ودجت الذكر"), desc: tx("Wisselende dhikr met bron", "Rotating dhikr with source", "ذكر متغير مع المصدر والفضل") },
    { type: "goal", icon: "flag", name: tx("Doel-widget", "Goal Widget", "ودجت الهدف"), desc: tx("Dagelijks opvoeddoel", "Daily parenting goal", "الهدف التربوي اليومي") },
    { type: "hijri", icon: "date-range", name: tx("Hijri-widget", "Hijri Widget", "ودجت التاريخ الهجري"), desc: tx("Hijri datum en evenement", "Hijri date and event", "التاريخ الهجري والمناسبة") },
    { type: "combined", icon: "dashboard", name: tx("Gecombineerde widget", "Combined Widget", "الودجت الشامل"), desc: tx("Alles in één widget", "All in one widget", "صلاة + ذكر + هدف + تاريخ") },
  ];

  return (
    <View>
      {/* How to add info */}
      <Text style={{ fontSize: 12, color: colors.muted, marginBottom: 12, lineHeight: 18, textAlign: isRTL ? "right" : "left" }}>
        {tx(
          "Voeg widgets toe aan je startscherm door lang op het scherm te drukken → Widgets → zoek 'ربّاني'.",
          "Add widgets to your home screen by long-pressing → Widgets → search 'ربّاني'.",
          "أضف الودجت إلى شاشتك الرئيسية بالضغط المطول → الأدوات → ابحث عن 'ربّاني'."
        )}
      </Text>

      {/* Available widgets */}
      <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground, marginBottom: 8, textAlign: isRTL ? "right" : "left" }}>
        {tx("Beschikbare widgets — tik om in te stellen", "Available Widgets — tap to configure", "الودجت المتاحة — انقر لضبط كل نوع")}
      </Text>
      {widgets.map((w, i) => {
        const selected = activeWidgetType === w.type;
        return (
        <Pressable
          key={i}
          onPress={() => { setActiveWidgetType(w.type); setActiveTab("appearance"); }}
          style={({ pressed }) => [{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", gap: 10, backgroundColor: selected ? colors.primary + "18" : colors.surface, borderRadius: 10, padding: 12, marginBottom: 6, borderWidth: 1, borderColor: selected ? colors.primary : colors.border, opacity: pressed ? 0.7 : 1 }]}
        >
          <MaterialIcons name={w.icon as any} size={22} color={colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 13, fontWeight: "600", color: colors.foreground, textAlign: isRTL ? "right" : "left" }}>{w.name}</Text>
            <Text style={{ fontSize: 11, color: colors.muted, textAlign: isRTL ? "right" : "left" }}>{w.desc}</Text>
          </View>
          <MaterialIcons name="tune" size={18} color={selected ? colors.primary : colors.muted} />
        </Pressable>
        );
      })}

      {/* Tab navigation */}
      <View style={{ flexDirection: isRTL ? "row-reverse" : "row", marginTop: 16, marginBottom: 12, backgroundColor: colors.surface, borderRadius: 10, padding: 3 }}>
        {tabs.map((tab) => (
          <Pressable key={tab.key} onPress={() => setActiveTab(tab.key)} style={({ pressed }) => [{
            flex: 1, alignItems: "center", paddingVertical: 8, borderRadius: 8,
            backgroundColor: activeTab === tab.key ? colors.primary : "transparent",
            opacity: pressed ? 0.7 : 1,
          }]}>
            <MaterialIcons name={tab.icon as any} size={16} color={activeTab === tab.key ? "#fff" : colors.muted} />
            <Text style={{ fontSize: 9, fontWeight: "600", color: activeTab === tab.key ? "#fff" : colors.muted, marginTop: 2 }}>{tab.label}</Text>
          </Pressable>
        ))}
      </View>

      {/* ===== CONTENT TAB ===== */}
      {activeTab === "content" && (
        <View>
          <Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground, marginBottom: 8, textAlign: isRTL ? "right" : "left" }}>
            {tx("Gebedswidget", "Prayer Widget", "ودجت الصلاة")}
          </Text>
          <ToggleRow label={tx("Toon alle gebedstijden", "Show all prayer times", "عرض جميع أوقات الصلوات")} value={ws.content.prayerShowAll} onToggle={() => updateSettings({ content: { ...ws.content, prayerShowAll: !ws.content.prayerShowAll } })} />
          <ToggleRow label={tx("Toon aftelling", "Show countdown", "عرض العد التنازلي")} value={ws.content.prayerShowCountdown} onToggle={() => updateSettings({ content: { ...ws.content, prayerShowCountdown: !ws.content.prayerShowCountdown } })} />
          <ToggleRow label={tx("Toon zonsopgang", "Show sunrise", "عرض الشروق")} value={ws.content.prayerShowSunrise} onToggle={() => updateSettings({ content: { ...ws.content, prayerShowSunrise: !ws.content.prayerShowSunrise } })} />
          <ToggleRow label={tx("Toon iqamah", "Show iqamah", "عرض الإقامة")} value={ws.content.prayerShowIqamah} onToggle={() => updateSettings({ content: { ...ws.content, prayerShowIqamah: !ws.content.prayerShowIqamah } })} />

          <Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground, marginTop: 12, marginBottom: 8, textAlign: isRTL ? "right" : "left" }}>
            {tx("Dhikr-widget", "Dhikr Widget", "ودجت الذكر")}
          </Text>
          <ToggleRow label={tx("Toon bron", "Show source", "عرض المصدر")} value={ws.content.dhikrShowSource} onToggle={() => updateSettings({ content: { ...ws.content, dhikrShowSource: !ws.content.dhikrShowSource } })} />
          <ToggleRow label={tx("Toon deugd", "Show virtue", "عرض الفضل")} value={ws.content.dhikrShowVirtue} onToggle={() => updateSettings({ content: { ...ws.content, dhikrShowVirtue: !ws.content.dhikrShowVirtue } })} />
          {/* اختيار سياق الأذكار */}
          <Text style={{ fontSize: 12, color: colors.muted, marginTop: 10, marginBottom: 4, textAlign: isRTL ? "right" : "left" }}>
            {tx("Dhikr context", "Dhikr context", "سياق الأذكار")}
          </Text>
          <View style={{ flexDirection: isRTL ? "row-reverse" : "row", gap: 8, marginBottom: 8 }}>
            <Pressable
              onPress={() => updateSettings({ content: { ...ws.content, dhikrContextMode: "auto" as any } })}
              style={({ pressed }) => [{ flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: "center", backgroundColor: ws.content.dhikrContextMode === "auto" ? colors.primary : colors.surface, opacity: pressed ? 0.8 : 1 }]}
            >
              <Text style={{ color: ws.content.dhikrContextMode === "auto" ? "#fff" : colors.foreground, fontSize: 12, fontWeight: "600" }}>
                {tx("Automatisch", "Automatic", "تلقائي حسب الوقت")}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => updateSettings({ content: { ...ws.content, dhikrContextMode: "manual" as any } })}
              style={({ pressed }) => [{ flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: "center", backgroundColor: ws.content.dhikrContextMode === "manual" ? colors.primary : colors.surface, opacity: pressed ? 0.8 : 1 }]}
            >
              <Text style={{ color: ws.content.dhikrContextMode === "manual" ? "#fff" : colors.foreground, fontSize: 12, fontWeight: "600" }}>
                {tx("Handmatig", "Manual", "يدوي (سياق ثابت)")}
              </Text>
            </Pressable>
          </View>
          {ws.content.dhikrContextMode === "manual" && (
            <View style={{ gap: 6, marginBottom: 8 }}>
              {[
                { key: "أذكار_الصباح", nl: "Ochtend", en: "Morning", ar: "أذكار الصباح" },
                { key: "أذكار_المساء", nl: "Avond", en: "Evening", ar: "أذكار المساء" },
                { key: "أذكار_النوم", nl: "Slaap", en: "Sleep", ar: "أذكار النوم" },
                { key: "أذكار_بعد_الصلاة", nl: "Na gebed", en: "After prayer", ar: "أذكار بعد الصلاة" },
                { key: "أذكار_عامة", nl: "Algemeen", en: "General", ar: "أذكار عامة" },
              ].map((ctx) => (
                <Pressable
                  key={ctx.key}
                  onPress={() => updateSettings({ content: { ...ws.content, dhikrFixedContext: ctx.key as any } })}
                  style={({ pressed }) => [{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, backgroundColor: ws.content.dhikrFixedContext === ctx.key ? colors.primary + "20" : colors.surface, borderWidth: ws.content.dhikrFixedContext === ctx.key ? 1 : 0, borderColor: colors.primary, opacity: pressed ? 0.8 : 1 }]}
                >
                  <Text style={{ flex: 1, fontSize: 13, color: ws.content.dhikrFixedContext === ctx.key ? colors.primary : colors.foreground, fontWeight: ws.content.dhikrFixedContext === ctx.key ? "700" : "400", textAlign: isRTL ? "right" : "left" }}>
                    {tx(ctx.nl, ctx.en, ctx.ar)}
                  </Text>
                  {ws.content.dhikrFixedContext === ctx.key && (
                    <Text style={{ fontSize: 16, color: colors.primary }}>✓</Text>
                  )}
                </Pressable>
              ))}
            </View>
          )}

          <Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground, marginTop: 12, marginBottom: 8, textAlign: isRTL ? "right" : "left" }}>
            {tx("Doel-widget", "Goal Widget", "ودجت الهدف")}
          </Text>
          <ToggleRow label={tx("Toon naam kind", "Show child name", "عرض اسم الطفل")} value={ws.content.goalShowChildName} onToggle={() => updateSettings({ content: { ...ws.content, goalShowChildName: !ws.content.goalShowChildName } })} />
          <ToggleRow label={tx("Toon voortgang", "Show progress", "عرض التقدم")} value={ws.content.goalShowProgress} onToggle={() => updateSettings({ content: { ...ws.content, goalShowProgress: !ws.content.goalShowProgress } })} />

          <Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground, marginTop: 12, marginBottom: 8, textAlign: isRTL ? "right" : "left" }}>
            {tx("Hijri-widget", "Hijri Widget", "ودجت التاريخ")}
          </Text>
          <ToggleRow label={tx("Toon Gregoriaanse datum", "Show Gregorian date", "عرض التاريخ الميلادي")} value={ws.content.hijriShowGregorian} onToggle={() => updateSettings({ content: { ...ws.content, hijriShowGregorian: !ws.content.hijriShowGregorian } })} />
          <ToggleRow label={tx("Toon evenement", "Show event", "عرض المناسبة")} value={ws.content.hijriShowEvent} onToggle={() => updateSettings({ content: { ...ws.content, hijriShowEvent: !ws.content.hijriShowEvent } })} />
          <ToggleRow label={tx("Toon dagnaam", "Show day name", "عرض اسم اليوم")} value={ws.content.hijriShowDayName} onToggle={() => updateSettings({ content: { ...ws.content, hijriShowDayName: !ws.content.hijriShowDayName } })} />

          <Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground, marginTop: 12, marginBottom: 8, textAlign: isRTL ? "right" : "left" }}>
            {tx("Gecombineerde widget secties", "Combined Widget Sections", "أقسام الودجت الشامل")}
          </Text>
          {[
            { key: "prayer", label: tx("Gebed", "Prayer", "الصلاة") },
            { key: "dhikr", label: tx("Dhikr", "Dhikr", "الذكر") },
            { key: "goal", label: tx("Doel", "Goal", "الهدف") },
            { key: "hijri", label: tx("Hijri datum", "Hijri Date", "التاريخ الهجري") },
          ].map((item) => (
            <ToggleRow key={item.key} label={item.label}
              value={ws.content.combinedSections.includes(item.key)}
              onToggle={() => {
                const secs = ws.content.combinedSections;
                const newSecs = secs.includes(item.key) ? secs.filter((s: string) => s !== item.key) : [...secs, item.key];
                if (newSecs.length === 0) return;
                updateSettings({ content: { ...ws.content, combinedSections: newSecs } });
              }}
            />
          ))}
        </View>
      )}

      {/* ===== APPEARANCE TAB ===== */}
      {activeTab === "appearance" && (
        <View>
          {/* Per-widget-type selector — appearance below applies to the chosen type */}
          <Text style={{ fontSize: 12, fontWeight: "600", color: colors.foreground, marginBottom: 6, textAlign: isRTL ? "right" : "left" }}>
            {tx("Widgettype (elk apart)", "Widget type (each separate)", "نوع الودجت (كل نوع على حدة)")}
          </Text>
          <View style={{ flexDirection: isRTL ? "row-reverse" : "row", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
            {widgetTypeLabels.map((wt) => (
              <Pressable key={wt.key} onPress={() => setActiveWidgetType(wt.key)} style={({ pressed }) => [{
                backgroundColor: activeWidgetType === wt.key ? colors.primary : colors.surface,
                borderRadius: 8, paddingVertical: 7, paddingHorizontal: 12,
                borderWidth: 1, borderColor: activeWidgetType === wt.key ? colors.primary : colors.border,
                opacity: pressed ? 0.7 : 1,
              }]}>
                <Text style={{ fontSize: 11, fontWeight: "700", color: activeWidgetType === wt.key ? "#fff" : colors.foreground }}>{wt.label}</Text>
              </Pressable>
            ))}
          </View>
          <OptionRow label={tx("Thema", "Theme Mode", "الوضع")} value={activeAppearance.themeMode}
            options={[
              { key: "light", label: tx("Licht", "Light", "فاتح") },
              { key: "dark", label: tx("Donker", "Dark", "داكن") },
              { key: "system", label: tx("Systeem", "System", "تلقائي") },
            ]}
            onChange={(v) => updateAppearance({ themeMode: v as any })}
          />
          <ColorPicker label={tx("Achtergrondkleur", "Background Color", "لون الخلفية")} colors={BACKGROUND_COLORS} value={activeAppearance.backgroundColor} onChange={(v) => updateAppearance({ backgroundColor: v as `#${string}` })} />
          <ColorPicker label={tx("Tekstkleur", "Text Color", "لون النص")} colors={TEXT_COLORS} value={activeAppearance.textColor} onChange={(v) => updateAppearance({ textColor: v as `#${string}` })} />
          <OptionRow label={tx("Lettergrootte", "Font Size", "حجم الخط")} value={activeAppearance.fontSize}
            options={[
              { key: "auto", label: tx("Automatisch", "Auto", "تلقائي") },
              { key: "small", label: tx("Klein", "Small", "صغير") },
              { key: "large", label: tx("Groot", "Large", "كبير") },
            ]}
            onChange={(v) => updateAppearance({ fontSize: v as any })}
          />
          <SliderRow label={tx("Schaal lettergrootte %", "Font Scale %", "نسبة تكبير الخط %")} value={(activeAppearance.fontScale || 100)} min={80} max={150} step={10} onChange={(v) => updateAppearance({ fontScale: v })} />
          <OptionRow label={tx("Hoeken", "Corners", "الزوايا")} value={activeAppearance.cornerStyle}
            options={[
              { key: "rounded", label: tx("Afgerond", "Rounded", "مستديرة") },
              { key: "sharp", label: tx("Scherp", "Sharp", "حادة") },
            ]}
            onChange={(v) => updateAppearance({ cornerStyle: v as any })}
          />
          <ToggleRow label={tx("Toon rand", "Show border", "عرض الحدود")} value={activeAppearance.showBorder} onToggle={() => updateAppearance({ showBorder: !activeAppearance.showBorder })} />
          {activeAppearance.showBorder && (
            <ColorPicker label={tx("Randkleur", "Border Color", "لون الحد")} colors={BORDER_COLORS} value={activeAppearance.borderColor} onChange={(v) => updateAppearance({ borderColor: v as `#${string}` })} />
          )}
          <SliderRow label={tx("Transparantie", "Opacity", "الشفافية")} value={activeAppearance.opacity} min={0.5} max={1} step={0.1} onChange={(v) => updateAppearance({ opacity: v })} />
        </View>
      )}

      {/* ===== TIMING TAB ===== */}
      {activeTab === "timing" && (
        <View>
          <OptionRow label={tx("Verversingsinterval", "Update Interval", "فترة التحديث")} value={String(ws.timing.updateInterval)}
            options={[
              { key: "15", label: tx("15 min", "15 min", "15 دقيقة") },
              { key: "30", label: tx("30 min", "30 min", "30 دقيقة") },
              { key: "45", label: tx("45 min", "45 min", "45 دقيقة") },
              { key: "60", label: tx("1 uur", "1 hour", "ساعة") },
              { key: "120", label: tx("2 uur", "2 hours", "ساعتين") },
            ]}
            onChange={(v) => {
              const interval = Number(v);
              updateSettings({ timing: { ...ws.timing, updateInterval: interval as any } });
              // Re-register background task with new interval
              import("@/lib/widget-background-task").then(({ registerWidgetBackgroundTask }) => {
                registerWidgetBackgroundTask(interval);
              });
            }}
          />
          <ToggleRow label={tx("Ververs bij adhan", "Update on Adhan", "تحديث عند الأذان")} value={ws.timing.updateOnAdhan} onToggle={() => updateSettings({ timing: { ...ws.timing, updateOnAdhan: !ws.timing.updateOnAdhan } })} />
          <OptionRow label={tx("Dhikr verversing", "Dhikr Change", "تغيير الذكر")} value={ws.timing.dhikrChangeInterval}
            options={[
              { key: "hourly", label: tx("Elk uur", "Every hour", "كل ساعة") },
              { key: "every_prayer", label: tx("Elk gebed", "Every prayer", "كل صلاة") },
              { key: "daily", label: tx("Dagelijks", "Daily", "يومياً") },
            ]}
            onChange={(v) => updateSettings({ timing: { ...ws.timing, dhikrChangeInterval: v as any } })}
          />
          <OptionRow label={tx("Actief vanaf", "Active from", "بداية العمل")} value={String(ws.timing.activeStartHour)}
            options={[
              { key: "0", label: "00:00" },
              { key: "3", label: "03:00" },
              { key: "4", label: "04:00" },
              { key: "5", label: "05:00" },
              { key: "6", label: "06:00" },
            ]}
            onChange={(v) => updateSettings({ timing: { ...ws.timing, activeStartHour: Number(v) } })}
          />
          <OptionRow label={tx("Actief tot", "Active until", "نهاية العمل")} value={String(ws.timing.activeEndHour)}
            options={[
              { key: "0", label: tx("Altijd", "Always", "بلا حد") },
              { key: "22", label: "22:00" },
              { key: "23", label: "23:00" },
              { key: "1", label: "01:00" },
            ]}
            onChange={(v) => updateSettings({ timing: { ...ws.timing, activeEndHour: Number(v) } })}
          />
        </View>
      )}

      {/* ===== BEHAVIOR TAB ===== */}
      {activeTab === "behavior" && (
        <View>
          <OptionRow label={tx("Bij aanraking openen", "Tap opens", "عند الضغط يفتح")} value={ws.behavior.tapAction}
            options={[
              { key: "home", label: tx("Startscherm", "Home", "الرئيسية") },
              { key: "prayer", label: tx("Gebedstijden", "Prayer Times", "الصلاة") },
              { key: "dhikr", label: tx("Dhikr", "Dhikr", "الأذكار") },
              { key: "goals", label: tx("Doelen", "Goals", "الأهداف") },
              { key: "calendar", label: tx("Kalender", "Calendar", "التقويم") },
            ]}
            onChange={(v) => updateSettings({ behavior: { ...ws.behavior, tapAction: v as any } })}
          />
          <ToggleRow label={tx("Direct bijwerken bij wijziging", "Instant update on change", "تحديث فوري عند التغيير")} value={ws.behavior.instantUpdate} onToggle={() => updateSettings({ behavior: { ...ws.behavior, instantUpdate: !ws.behavior.instantUpdate } })} />

          {/* Widget preview */}
          <Text style={{ fontSize: 13, fontWeight: "700", color: colors.foreground, marginTop: 16, marginBottom: 8, textAlign: isRTL ? "right" : "left" }}>
            {tx("Voorbeeld", "Preview", "معاينة")}
          </Text>
          <View style={{
            backgroundColor: ws.appearance.backgroundColor,
            borderRadius: ws.appearance.cornerStyle === "rounded" ? 16 : 4,
            padding: 16,
            borderWidth: ws.appearance.showBorder ? 1 : 0,
            borderColor: ws.appearance.borderColor,
            opacity: ws.appearance.opacity,
            minHeight: 80,
            justifyContent: "center",
            alignItems: "center",
          }}>
            <Text style={{ fontSize: ws.appearance.fontSize === "small" ? 11 : ws.appearance.fontSize === "large" ? 16 : 13, color: ws.appearance.textColor, fontWeight: "700", textAlign: "center" }}>
              {tx("Volgende gebed: Maghrib", "Next prayer: Maghrib", "الصلاة القادمة: المغرب")}
            </Text>
            <Text style={{ fontSize: ws.appearance.fontSize === "small" ? 9 : ws.appearance.fontSize === "large" ? 13 : 11, color: ws.appearance.textColor + "99", marginTop: 4, textAlign: "center" }}>
              {tx("Over 2 uur 15 min", "In 2h 15min", "بعد 2 ساعة و 15 دقيقة")}
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}
