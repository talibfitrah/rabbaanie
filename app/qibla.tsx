import { useState, useEffect, useCallback, useRef } from "react";
import { Text, View, Platform, Animated, Easing } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useI18n } from "@/lib/i18n";
import { useRouter } from "expo-router";
import * as Location from "expo-location";
import { Magnetometer } from "expo-sensors";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { PRAYER_LOCATION_KEY, type SavedPrayerLocation, getCityAR, getCountryAR } from "@/lib/prayer-data";
import { withTimeout } from "@/lib/location-utils";
import { Pressable, Alert, ActivityIndicator } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import Svg, { Circle, Line, Path, G, Text as SvgText } from "react-native-svg";

// Kaaba coordinates
const KAABA_LAT = 21.4225;
const KAABA_LNG = 39.8262;

// Calculate Qibla direction from a given location
function calculateQiblaAngle(lat: number, lng: number): number {
  const latRad = (lat * Math.PI) / 180;
  const lngRad = (lng * Math.PI) / 180;
  const kaabaLatRad = (KAABA_LAT * Math.PI) / 180;
  const kaabaLngRad = (KAABA_LNG * Math.PI) / 180;

  const dLng = kaabaLngRad - lngRad;
  const x = Math.sin(dLng);
  const y = Math.cos(latRad) * Math.tan(kaabaLatRad) - Math.sin(latRad) * Math.cos(dLng);

  let angle = Math.atan2(x, y) * (180 / Math.PI);
  // Normalize to 0-360
  angle = (angle + 360) % 360;
  return angle;
}

// Get cardinal direction name
function getCardinalDirection(angle: number, language: string): string {
  const directions: Record<string, string[]> = {
    ar: ["شمال", "شمال شرق", "شرق", "جنوب شرق", "جنوب", "جنوب غرب", "غرب", "شمال غرب"],
    nl: ["Noord", "Noordoost", "Oost", "Zuidoost", "Zuid", "Zuidwest", "West", "Noordwest"],
    en: ["North", "Northeast", "East", "Southeast", "South", "Southwest", "West", "Northwest"],
  };
  const index = Math.round(angle / 45) % 8;
  return (directions[language] || directions.en)[index];
}

export default function QiblaScreen() {
  const colors = useColors();
  const { t, language, isRTL } = useI18n();
  const router = useRouter();
  const [heading, setHeading] = useState(0);
  const [savedLocation, setSavedLocation] = useState<SavedPrayerLocation | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [sensorAvailable, setSensorAvailable] = useState(true);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [headingAccuracy, setHeadingAccuracy] = useState(3);
  const animatedHeading = useRef(new Animated.Value(0)).current;
  const lastHeading = useRef(0);

  // GPS refresh location. Every native call is bounded so the spinner can never
  // hang: services check → last-known fast-path → bounded fresh fix → bounded
  // reverse-geocode. The `finally` always clears gpsLoading.
  const handleGpsRefresh = async () => {
    setGpsLoading(true);
    try {
      // Bail early if the device's location services are OFF, otherwise the
      // native position request can wait indefinitely for a fix.
      let servicesEnabled = true;
      try { servicesEnabled = await Location.hasServicesEnabledAsync(); } catch (_) {}
      if (!servicesEnabled) {
        Alert.alert(
          language === "ar" ? "خدمة الموقع متوقفة" : "Location is off",
          language === "ar"
            ? "يرجى تفعيل خدمة الموقع (GPS) من إعدادات الهاتف ثم إعادة المحاولة"
            : "Please turn on Location (GPS) in your device settings and try again"
        );
        return;
      }

      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          language === "ar" ? "الإذن مطلوب" : "Permission Required",
          language === "ar" ? "يرجى السماح بالوصول للموقع" : "Please allow location access"
        );
        return;
      }

      // Last-known position is instant when available; only fall back to a fresh
      // fix if there is none, and always bound it.
      let loc = await Location.getLastKnownPositionAsync({
        maxAge: 30 * 60 * 1000,
        requiredAccuracy: 10000,
      });
      if (!loc) {
        try {
          loc = await withTimeout(
            Location.getCurrentPositionAsync({
              accuracy: Location.Accuracy.Balanced,
              mayShowUserSettingsDialog: true,
            }),
            20000
          );
        } catch (_) {
          loc = await withTimeout(
            Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Lowest }),
            15000
          );
        }
      }
      if (!loc) throw new Error("no-location");

      let geo: Location.LocationGeocodedAddress | null = null;
      try {
        const results = await withTimeout(
          Location.reverseGeocodeAsync({
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
          }),
          8000
        );
        geo = results?.[0] ?? null;
      } catch (_) {}

      const newLocation: SavedPrayerLocation = {
        country: geo?.country || savedLocation?.country || "",
        city:
          geo?.city ||
          geo?.subregion ||
          savedLocation?.city ||
          `${loc.coords.latitude.toFixed(2)}, ${loc.coords.longitude.toFixed(2)}`,
        lat: loc.coords.latitude,
        lng: loc.coords.longitude,
        tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
      };
      await AsyncStorage.setItem(PRAYER_LOCATION_KEY, JSON.stringify(newLocation));
      setSavedLocation(newLocation);
    } catch (err) {
      Alert.alert(
        language === "ar" ? "خطأ" : "Error",
        language === "ar"
          ? "تعذر تحديد الموقع. حاول في مكان مفتوح أو تحقق من الاتصال."
          : "Could not get location. Try outdoors or check your connection."
      );
    } finally {
      setGpsLoading(false);
    }
  };

  // Guide the user through the physical calibration the OS needs. A phone's
  // magnetometer is calibrated by moving it through a figure-8; there is no API
  // to force it, so we show the instruction — the OS heading recovers on its own.
  const handleCalibrate = () => {
    Alert.alert(
      language === "ar" ? "معايرة البوصلة" : language === "nl" ? "Kompas kalibreren" : "Calibrate Compass",
      language === "ar"
        ? "حرّك هاتفك في الهواء على شكل الرقم ٨ عدّة مرّات، بعيدًا عن المعادن والأجهزة الإلكترونية، حتى تستقرّ الإبرة."
        : language === "nl"
        ? "Beweeg je telefoon een paar keer in een 8-vorm door de lucht, weg van metaal en elektronica, tot de naald stabiel is."
        : "Move your phone through a figure-8 in the air a few times, away from metal and electronics, until the needle settles.",
    );
  };

  // Load saved location
  useEffect(() => {
    AsyncStorage.getItem(PRAYER_LOCATION_KEY).then((val) => {
      if (val) {
        try {
          setSavedLocation(JSON.parse(val));
        } catch (_) {}
      }
      setLoaded(true);
    });
  }, []);

  // Subscribe to device heading. expo-location's watchHeadingAsync uses the OS
  // sensor-fusion (magnetometer + accelerometer + gyro): the reading is
  // tilt-compensated (correct even when the phone is held upright, not only when
  // flat) and trueHeading is corrected for magnetic declination. The old raw
  // Magnetometer atan2(y,x) was neither — it assumed a flat phone and pointed at
  // magnetic north, so it drifted by the tilt error plus the local declination.
  // qiblaAngle is a true-north bearing, so trueHeading lines up with it directly.
  useEffect(() => {
    if (Platform.OS === "web") {
      setSensorAvailable(false);
      return;
    }

    let sub: Location.LocationSubscription | null = null;
    let magSub: ReturnType<typeof Magnetometer.addListener> | null = null;
    let cancelled = false;

    // Smooth the rotation along the shortest arc — shared by both heading sources.
    const applyHeading = (angle: number) => {
      if (cancelled) return; // a queued native event can land after unmount
      setHeading(angle);
      const diff = angle - lastHeading.current;
      let shortDiff = diff;
      if (Math.abs(diff) > 180) shortDiff = diff > 0 ? diff - 360 : diff + 360;
      const newVal = lastHeading.current + shortDiff;
      lastHeading.current = newVal;
      Animated.timing(animatedHeading, {
        toValue: newVal,
        duration: 150,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start();
    };

    (async () => {
      // No magnetometer means no heading by EITHER source (sensor fusion needs
      // it too) — keep the old up-front detection so those devices get the
      // honest "sensor unavailable" message instead of a frozen needle.
      try {
        if (!(await Magnetometer.isAvailableAsync())) {
          if (!cancelled) setSensorAvailable(false);
          return;
        }
      } catch {
        if (!cancelled) setSensorAvailable(false);
        return;
      }
      try {
        // trueHeading needs location for the declination; harmless if already granted.
        // Android's watchDeviceHeading resolves and then never delivers a sample when
        // location is denied (iOS throws), so treat a denial as the throw ourselves —
        // otherwise the fallback below never runs and the needle freezes at north.
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") throw new Error("location permission not granted");
        sub = await Location.watchHeadingAsync((data) => {
          // trueHeading is -1 when the OS can't resolve declination (no location);
          // fall back to magHeading, which the OS still tilt-compensates.
          const raw =
            typeof data.trueHeading === "number" && data.trueHeading >= 0
              ? data.trueHeading
              : data.magHeading;
          // magHeading is also negative when the OS marks it invalid — dropping
          // the sample beats rendering (-1+360)%360 as a confident 359°.
          if (!Number.isFinite(raw) || raw < 0) return;
          if (typeof data.accuracy === "number") setHeadingAccuracy(data.accuracy);
          applyHeading((raw + 360) % 360);
        });
        if (cancelled && sub) {
          sub.remove();
          sub = null;
        }
      } catch (_) {
        // iOS's watchDeviceHeading throws when location permission is denied — and
        // a user with a manually saved city never needs to grant it. Fall back to
        // the raw magnetometer: tilt-sensitive and magnetic-north (the pre-fix
        // behavior), but a working compass beats a "sensor unavailable" screen.
        try {
          if (cancelled) return;
          Magnetometer.setUpdateInterval(100);
          magSub = Magnetometer.addListener(({ x, y }) => {
            if (!Number.isFinite(x) || !Number.isFinite(y)) return;
            let angle = Math.atan2(y, x) * (180 / Math.PI);
            angle = (90 - angle + 360) % 360;
            applyHeading(angle);
          });
          if (cancelled && magSub) {
            magSub.remove();
            magSub = null;
          }
        } catch {
          if (!cancelled) setSensorAvailable(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      if (sub) sub.remove();
      if (magSub) magSub.remove();
    };
  }, []);

  const qiblaAngle = savedLocation
    ? calculateQiblaAngle(savedLocation.lat, savedLocation.lng)
    : 0;

  const qiblaDirection = getCardinalDirection(qiblaAngle, language);

  // Rotation for the compass: rotate opposite to heading so north stays at top relative to device
  const compassRotation = animatedHeading.interpolate({
    inputRange: [-360, 360],
    outputRange: ["360deg", "-360deg"],
  });

  if (!loaded) return null;

  if (!savedLocation) {
    return (
      <ScreenContainer edges={["top", "bottom", "left", "right"]} className="px-4">
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 20 }}>
          <Text style={{ fontSize: 48, marginBottom: 16 }}>🧭</Text>
          <Text style={{ fontSize: 20, fontWeight: "700", color: colors.foreground, textAlign: "center", marginBottom: 8 }}>
            {language === "ar" ? "اتجاه القبلة" : language === "nl" ? "Qibla Richting" : "Qibla Direction"}
          </Text>
          <Text style={{ fontSize: 14, color: colors.muted, textAlign: "center", marginBottom: 24, lineHeight: 20 }}>
            {language === "ar" ? "يرجى تحديد موقعك أولاً في الإعدادات" : language === "nl" ? "Stel eerst je locatie in bij Instellingen" : "Please set your location in Settings first"}
          </Text>
          <Pressable
            onPress={() => router.push("/(tabs)/settings")}
            style={({ pressed }) => [{
              backgroundColor: pressed ? colors.primary + "CC" : colors.primary,
              borderRadius: 12,
              paddingVertical: 14,
              paddingHorizontal: 32,
              alignItems: "center",
            }]}
          >
            <Text style={{ color: "#fff", fontSize: 16, fontWeight: "700" }}>
              {language === "ar" ? "الإعدادات" : language === "nl" ? "Instellingen" : "Settings"}
            </Text>
          </Pressable>
        </View>
      </ScreenContainer>
    );
  }

  const COMPASS_SIZE = 280;
  const CENTER = COMPASS_SIZE / 2;
  const RADIUS = COMPASS_SIZE / 2 - 20;

  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]} className="px-4">
      <View style={{ flex: 1 }}>
        {/* Header */}
        <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 12 }}>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1, padding: 8 }]}
          >
            <Text style={{ fontSize: 24, color: colors.primary }}>{isRTL ? "→" : "←"}</Text>
          </Pressable>
          <Text style={{ fontSize: 20, fontWeight: "800", color: colors.foreground }}>
            {language === "ar" ? "اتجاه القبلة" : language === "nl" ? "Qibla Richting" : "Qibla Direction"}
          </Text>
          <View style={{ width: 40 }} />
        </View>

        {/* GPS + Calibrate buttons */}
        <View style={{ flexDirection: isRTL ? "row-reverse" : "row", justifyContent: "center", gap: 16, marginBottom: 12 }}>
          <Pressable
            onPress={handleGpsRefresh}
            disabled={gpsLoading}
            style={({ pressed }) => [{
              flexDirection: isRTL ? "row-reverse" : "row",
              alignItems: "center",
              gap: 6,
              backgroundColor: pressed ? colors.primary + "20" : colors.surface,
              borderRadius: 10,
              paddingVertical: 8,
              paddingHorizontal: 14,
              borderWidth: 1,
              borderColor: colors.border,
            }]}
          >
            {gpsLoading ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <MaterialIcons name="my-location" size={18} color={colors.primary} />
            )}
            <Text style={{ fontSize: 13, fontWeight: "600", color: colors.primary }}>
              {language === "ar" ? "تحديث الموقع" : language === "nl" ? "Locatie vernieuwen" : "Update Location"}
            </Text>
          </Pressable>

          <Pressable
            onPress={handleCalibrate}
            style={({ pressed }) => [{
              flexDirection: isRTL ? "row-reverse" : "row",
              alignItems: "center",
              gap: 6,
              backgroundColor: pressed ? "#C4A35A20" : colors.surface,
              borderRadius: 10,
              paddingVertical: 8,
              paddingHorizontal: 14,
              borderWidth: 1,
              borderColor: colors.border,
            }]}
          >
            <MaterialIcons name="explore" size={18} color="#C4A35A" />
            <Text style={{ fontSize: 13, fontWeight: "600", color: "#C4A35A" }}>
              {language === "ar" ? "معايرة البوصلة" : language === "nl" ? "Kompas kalibreren" : "Calibrate Compass"}
            </Text>
          </Pressable>
        </View>

        {/* Location */}
        <Text style={{ fontSize: 14, color: colors.muted, textAlign: "center", marginBottom: 20 }}>
          {language === "ar"
            ? `${getCityAR(savedLocation.city)}، ${getCountryAR(savedLocation.country)}`
            : `${savedLocation.city}, ${savedLocation.country}`}
        </Text>

        {Platform.OS === "android" && headingAccuracy <= 1 && (
          <Text style={{ fontSize: 12, color: colors.error, textAlign: "center", marginBottom: 10 }}>
            {language === "ar"
              ? "دقّة البوصلة منخفضة — اضغط «معايرة البوصلة» وحرّك هاتفك على شكل ٨"
              : language === "nl"
              ? "Kompasnauwkeurigheid laag — tik op 'Kompas kalibreren'"
              : "Compass accuracy is low — tap 'Calibrate Compass'"}
          </Text>
        )}

        {/* Compass */}
        <View style={{ alignItems: "center", justifyContent: "center", flex: 1 }}>
          {sensorAvailable ? (
            <Animated.View style={{ transform: [{ rotate: compassRotation }] }}>
              <Svg width={COMPASS_SIZE} height={COMPASS_SIZE} viewBox={`0 0 ${COMPASS_SIZE} ${COMPASS_SIZE}`}>
                {/* Outer circle */}
                <Circle cx={CENTER} cy={CENTER} r={RADIUS} stroke={colors.border} strokeWidth={2} fill="none" />
                <Circle cx={CENTER} cy={CENTER} r={RADIUS - 10} stroke={colors.border} strokeWidth={0.5} fill="none" />

                {/* Degree marks */}
                {Array.from({ length: 72 }, (_, i) => {
                  const angle = (i * 5 * Math.PI) / 180;
                  const isMajor = i % 18 === 0;
                  const isMinor = i % 9 === 0;
                  const len = isMajor ? 12 : isMinor ? 8 : 4;
                  const x1 = CENTER + (RADIUS - 2) * Math.sin(angle);
                  const y1 = CENTER - (RADIUS - 2) * Math.cos(angle);
                  const x2 = CENTER + (RADIUS - 2 - len) * Math.sin(angle);
                  const y2 = CENTER - (RADIUS - 2 - len) * Math.cos(angle);
                  return (
                    <Line
                      key={i}
                      x1={x1}
                      y1={y1}
                      x2={x2}
                      y2={y2}
                      stroke={isMajor ? colors.foreground : colors.muted}
                      strokeWidth={isMajor ? 2 : 1}
                    />
                  );
                })}

                {/* Cardinal directions */}
                <SvgText x={CENTER} y={40} textAnchor="middle" fontSize={14} fontWeight="bold" fill={colors.primary}>
                  {language === "ar" ? "شمال" : "N"}
                </SvgText>
                <SvgText x={COMPASS_SIZE - 30} y={CENTER + 5} textAnchor="middle" fontSize={12} fontWeight="600" fill={colors.foreground}>
                  {language === "ar" ? "شرق" : "E"}
                </SvgText>
                <SvgText x={CENTER} y={COMPASS_SIZE - 28} textAnchor="middle" fontSize={12} fontWeight="600" fill={colors.foreground}>
                  {language === "ar" ? "جنوب" : "S"}
                </SvgText>
                <SvgText x={30} y={CENTER + 5} textAnchor="middle" fontSize={12} fontWeight="600" fill={colors.foreground}>
                  {language === "ar" ? "غرب" : "W"}
                </SvgText>

                {/* Qibla arrow */}
                <G rotation={qiblaAngle} origin={`${CENTER}, ${CENTER}`}>
                  {/* Arrow body */}
                  <Line
                    x1={CENTER}
                    y1={CENTER}
                    x2={CENTER}
                    y2={CENTER - RADIUS + 30}
                    stroke="#C4A35A"
                    strokeWidth={3}
                    strokeLinecap="round"
                  />
                  {/* Arrow head */}
                  <Path
                    d={`M ${CENTER} ${CENTER - RADIUS + 25} L ${CENTER - 8} ${CENTER - RADIUS + 45} L ${CENTER + 8} ${CENTER - RADIUS + 45} Z`}
                    fill="#C4A35A"
                  />
                  {/* Kaaba icon circle */}
                  <Circle cx={CENTER} cy={CENTER - RADIUS + 20} r={10} fill="#C4A35A" />
                  <SvgText x={CENTER} y={CENTER - RADIUS + 24} textAnchor="middle" fontSize={10} fill="#fff">
                    🕋
                  </SvgText>
                </G>

                {/* Center dot */}
                <Circle cx={CENTER} cy={CENTER} r={6} fill={colors.primary} />
                <Circle cx={CENTER} cy={CENTER} r={3} fill="#fff" />
              </Svg>
            </Animated.View>
          ) : (
            /* Web fallback - static compass */
            <View style={{ alignItems: "center" }}>
              <Svg width={COMPASS_SIZE} height={COMPASS_SIZE} viewBox={`0 0 ${COMPASS_SIZE} ${COMPASS_SIZE}`}>
                <Circle cx={CENTER} cy={CENTER} r={RADIUS} stroke={colors.border} strokeWidth={2} fill="none" />
                {Array.from({ length: 72 }, (_, i) => {
                  const angle = (i * 5 * Math.PI) / 180;
                  const isMajor = i % 18 === 0;
                  const len = isMajor ? 12 : 4;
                  const x1 = CENTER + (RADIUS - 2) * Math.sin(angle);
                  const y1 = CENTER - (RADIUS - 2) * Math.cos(angle);
                  const x2 = CENTER + (RADIUS - 2 - len) * Math.sin(angle);
                  const y2 = CENTER - (RADIUS - 2 - len) * Math.cos(angle);
                  return <Line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={isMajor ? colors.foreground : colors.muted} strokeWidth={isMajor ? 2 : 1} />;
                })}
                <SvgText x={CENTER} y={40} textAnchor="middle" fontSize={14} fontWeight="bold" fill={colors.primary}>N</SvgText>
                <G rotation={qiblaAngle} origin={`${CENTER}, ${CENTER}`}>
                  <Line x1={CENTER} y1={CENTER} x2={CENTER} y2={CENTER - RADIUS + 30} stroke="#C4A35A" strokeWidth={3} strokeLinecap="round" />
                  <Path d={`M ${CENTER} ${CENTER - RADIUS + 25} L ${CENTER - 8} ${CENTER - RADIUS + 45} L ${CENTER + 8} ${CENTER - RADIUS + 45} Z`} fill="#C4A35A" />
                  <Circle cx={CENTER} cy={CENTER - RADIUS + 20} r={10} fill="#C4A35A" />
                  <SvgText x={CENTER} y={CENTER - RADIUS + 24} textAnchor="middle" fontSize={10} fill="#fff">🕋</SvgText>
                </G>
                <Circle cx={CENTER} cy={CENTER} r={6} fill={colors.primary} />
              </Svg>
              <Text style={{ fontSize: 12, color: colors.muted, marginTop: 8, textAlign: "center" }}>
                {language === "ar" ? "البوصلة التفاعلية متاحة فقط على الهاتف" : "Interactive compass only available on device"}
              </Text>
            </View>
          )}
        </View>

        {/* Qibla info */}
        <View style={{ alignItems: "center", paddingBottom: 40 }}>
          <Text style={{ fontSize: 42, fontWeight: "800", color: "#C4A35A" }}>
            {qiblaAngle.toFixed(1)}°
          </Text>
          <Text style={{ fontSize: 18, fontWeight: "600", color: colors.foreground, marginTop: 4 }}>
            {qiblaDirection}
          </Text>
          <View style={{ flexDirection: isRTL ? "row-reverse" : "row", alignItems: "center", marginTop: 12, gap: 8 }}>
            <View style={{ height: 1, flex: 1, backgroundColor: "#C4A35A", maxWidth: 80 }} />
            <Text style={{ fontSize: 12, color: "#C4A35A" }}>🕋</Text>
            <View style={{ height: 1, flex: 1, backgroundColor: "#C4A35A", maxWidth: 80 }} />
          </View>
          <Text style={{ fontSize: 13, color: colors.muted, marginTop: 12, textAlign: "center" }}>
            {language === "ar"
              ? "وجّه هاتفك نحو السهم الذهبي"
              : language === "nl"
              ? "Richt je telefoon naar de gouden pijl"
              : "Point your phone toward the golden arrow"}
          </Text>
        </View>
      </View>
    </ScreenContainer>
  );
}
