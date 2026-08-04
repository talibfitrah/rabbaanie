/**
 * Beautiful animated loading screen that shows while the app is initializing.
 * Features a pulsing logo, animated progress dots, and a subtle gradient background.
 */
import React, { useEffect } from "react";
import { View, Text, StyleSheet, Dimensions } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  withDelay,
  Easing,
  interpolate,
} from "react-native-reanimated";
import { useColors } from "@/hooks/use-colors";
import { useI18n } from "@/lib/i18n";

const { width } = Dimensions.get("window");

function PulsingDot({ delay, colors }: { delay: number; colors: any }) {
  const scale = useSharedValue(0.4);

  useEffect(() => {
    scale.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 600, easing: Easing.bezier(0.4, 0, 0.2, 1) }),
          withTiming(0.4, { duration: 600, easing: Easing.bezier(0.4, 0, 0.2, 1) })
        ),
        -1,
        false
      )
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: interpolate(scale.value, [0.4, 1], [0.3, 1]),
  }));

  return (
    <Animated.View
      style={[
        {
          width: 10,
          height: 10,
          borderRadius: 5,
          backgroundColor: colors.primary,
          marginHorizontal: 4,
        },
        animatedStyle,
      ]}
    />
  );
}

export function LoadingScreen() {
  const colors = useColors();
  const { language } = useI18n();
  const logoScale = useSharedValue(0.9);
  const logoOpacity = useSharedValue(0);

  useEffect(() => {
    // Fade in
    logoOpacity.value = withTiming(1, { duration: 500 });
    // Gentle pulse
    logoScale.value = withRepeat(
      withSequence(
        withTiming(1.05, { duration: 1200, easing: Easing.bezier(0.4, 0, 0.2, 1) }),
        withTiming(0.95, { duration: 1200, easing: Easing.bezier(0.4, 0, 0.2, 1) })
      ),
      -1,
      true
    );
  }, []);

  const logoAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: logoScale.value }],
    opacity: logoOpacity.value,
  }));

  const loadingText =
    language === "ar"
      ? "جارٍ التحميل..."
      : language === "en"
      ? "Loading..."
      : "Laden...";

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Decorative circles in background */}
      <View style={[styles.bgCircle1, { backgroundColor: colors.primary + "08" }]} />
      <View style={[styles.bgCircle2, { backgroundColor: colors.primary + "05" }]} />

      {/* Logo area */}
      <Animated.View style={[styles.logoContainer, logoAnimatedStyle]}>
        <View style={[styles.logoCircle, { backgroundColor: colors.primary + "15", borderColor: colors.primary + "30" }]}>
          <Text style={styles.logoEmoji}>🌱</Text>
        </View>
      </Animated.View>

      {/* App name */}
      <Text style={[styles.appName, { color: colors.foreground }]}>
        Rabbaanie
      </Text>
      <Text style={[styles.subtitle, { color: colors.muted }]}>
        {language === "ar"
          ? "برنامج تربوي إسلامي"
          : language === "en"
          ? "Islamic parenting program"
          : "Islamitisch opvoedingsprogramma"}
      </Text>

      {/* Loading dots */}
      <View style={styles.dotsContainer}>
        <PulsingDot delay={0} colors={colors} />
        <PulsingDot delay={200} colors={colors} />
        <PulsingDot delay={400} colors={colors} />
      </View>

      {/* Loading text */}
      <Text style={[styles.loadingText, { color: colors.muted }]}>
        {loadingText}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  bgCircle1: {
    position: "absolute",
    width: width * 1.5,
    height: width * 1.5,
    borderRadius: width * 0.75,
    top: -width * 0.5,
    right: -width * 0.3,
  },
  bgCircle2: {
    position: "absolute",
    width: width * 1.2,
    height: width * 1.2,
    borderRadius: width * 0.6,
    bottom: -width * 0.4,
    left: -width * 0.3,
  },
  logoContainer: {
    marginBottom: 24,
  },
  logoCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
  },
  logoEmoji: {
    fontSize: 48,
  },
  appName: {
    fontSize: 28,
    fontWeight: "700",
    letterSpacing: -0.5,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    fontWeight: "500",
    marginBottom: 40,
  },
  dotsContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  loadingText: {
    fontSize: 13,
    fontWeight: "500",
  },
});
