import { useState, useEffect, useCallback, useRef } from "react";
import { Text, View, Platform, Animated, Easing } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { useColors } from "@/hooks/use-colors";
import { useI18n } from "@/lib/i18n";
import { useRouter } from "expo-router";
import { Magnetometer } from "expo-sensors";
import * as Location from "expo-location";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { PRAYER_LOCATION_KEY, type SavedPrayerLocation, getCityAR, getCountryAR } from "@/lib/prayer-data";
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
  const [calibrating, setCalibrating] = useState(false);
  const animatedHeading = useRef(new Animated.Value(0)).current;
  const lastHeading = useRef(0);
  const subscriptionRef = useRef<ReturnType<typeof Magnetometer.addListener> | null>(null);

  // GPS refresh location
  const handleGpsRefresh = async () => {
    setGpsLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          language === "ar" ? "الإذن مطلوب" : "Permission Required",
          language === "ar" ? "يرجى السماح بالوصول للموقع" : "Please allow location access"
        );
        setGpsLoading(false);
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const [geo] = await Location.reverseGeocodeAsync({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
      const newLocation: SavedPrayerLocation = {
        country: geo?.country || savedLocation?.country || "",
        city: geo?.city || geo?.subregion || savedLocation?.city || "",
        lat: loc.coords.latitude,
        lng: loc.coords.longitude,
        tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
      };
      await AsyncStorage.setItem(PRAYER_LOCATION_KEY, JSON.stringify(newLocation));
      setSavedLocation(newLocation);
    } catch (err) {
      Alert.alert(
        language === "ar" ? "خطأ" : "Error",
        language === "ar" ? "تعذر تحديد الموقع" : "Could not get location"
      );
    } finally {
      setGpsLoading(false);
    }
  };

  // Calibrate compass
  const handleCalibrate = () => {
    setCalibrating(true);
    // Remove old subscription and re-subscribe
    if (subscriptionRef.current) {
      subscriptionRef.current.remove();
      subscriptionRef.current = null;
    }
    lastHeading.current = 0;
    animatedHeading.setValue(0);
    setHeading(0);

    if (Platform.OS !== "web") {
      Magnetometer.setUpdateInterval(50);
      subscriptionRef.current = Magnetometer.addListener(({ x, y }) => {
        let angle = Math.atan2(y, x) * (180 / Math.PI);
        angle = (90 - angle + 360) % 360;
        setHeading(angle);
        const diff = angle - lastHeading.current;
        let shortDiff = diff;
        if (Math.abs(diff) > 180) shortDiff = diff > 0 ? diff - 360 : diff + 360;
        const newVal = lastHeading.current + shortDiff;
        lastHeading.current = newVal;
        Animated.timing(animatedHeading, {
          toValue: newVal,
          duration: 100,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }).start();
      });
      // Reset interval after 2 seconds
      setTimeout(() => {
        Magnetometer.setUpdateInterval(100);
        setCalibrating(false);
      }, 2000);
    } else {
      setCalibrating(false);
    }
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

  // Subscribe to magnetometer
  useEffect(() => {
    if (Platform.OS === "web") {
      setSensorAvailable(false);
      return;
    }

    let subscription: ReturnType<typeof Magnetometer.addListener> | null = null;

    Magnetometer.isAvailableAsync().then((available) => {
      if (!available) {
        setSensorAvailable(false);
        return;
      }

      Magnetometer.setUpdateInterval(100);
      subscription = Magnetometer.addListener(({ x, y }) => {
        // Calculate heading from magnetometer data
        let angle = Math.atan2(y, x) * (180 / Math.PI);
        // Convert to compass heading (0 = North)
        angle = (90 - angle + 360) % 360;
        setHeading(angle);

        // Smooth animation
        const diff = angle - lastHeading.current;
        let shortDiff = diff;
        if (Math.abs(diff) > 180) {
          shortDiff = diff > 0 ? diff - 360 : diff + 360;
        }
        const newVal = lastHeading.current + shortDiff;
        lastHeading.current = newVal;

        Animated.timing(animatedHeading, {
          toValue: newVal,
          duration: 150,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }).start();
      });
    });

    return () => {
      if (subscription) subscription.remove();
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
            disabled={calibrating}
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
            {calibrating ? (
              <ActivityIndicator size="small" color="#C4A35A" />
            ) : (
              <MaterialIcons name="explore" size={18} color="#C4A35A" />
            )}
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
          <View style={{ flexDirection: "row", alignItems: "center", marginTop: 12, gap: 8 }}>
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
