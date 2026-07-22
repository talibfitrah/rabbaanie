import React, { useEffect } from "react";
import { View, Image, Text, StyleSheet, Dimensions } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withSequence,
  Easing,
  runOnJS,
} from "react-native-reanimated";

const { width, height } = Dimensions.get("window");

interface AnimatedSplashProps {
  onFinish: () => void;
}

export function AnimatedSplash({ onFinish }: AnimatedSplashProps) {
  // Animation values
  const logoScale = useSharedValue(0.6);
  const logoOpacity = useSharedValue(0);
  const arabicOpacity = useSharedValue(0);
  const arabicTranslateY = useSharedValue(20);
  const crescentOpacity = useSharedValue(0);
  const crescentScale = useSharedValue(0.5);
  const latinOpacity = useSharedValue(0);
  const latinTranslateY = useSharedValue(10);
  const containerOpacity = useSharedValue(1);

  useEffect(() => {
    // Phase 1: Logo appears and scales up
    logoOpacity.value = withTiming(1, { duration: 600, easing: Easing.out(Easing.cubic) });
    logoScale.value = withTiming(1, { duration: 800, easing: Easing.out(Easing.back(1.1)) });

    // Phase 2: Arabic text slides up and fades in
    arabicOpacity.value = withDelay(500, withTiming(1, { duration: 500, easing: Easing.out(Easing.cubic) }));
    arabicTranslateY.value = withDelay(500, withTiming(0, { duration: 500, easing: Easing.out(Easing.cubic) }));

    // Phase 3: Crescent ornament fades in
    crescentOpacity.value = withDelay(800, withTiming(1, { duration: 400, easing: Easing.out(Easing.cubic) }));
    crescentScale.value = withDelay(800, withTiming(1, { duration: 400, easing: Easing.out(Easing.cubic) }));

    // Phase 4: Latin text fades in
    latinOpacity.value = withDelay(1000, withTiming(1, { duration: 400, easing: Easing.out(Easing.cubic) }));
    latinTranslateY.value = withDelay(1000, withTiming(0, { duration: 400, easing: Easing.out(Easing.cubic) }));

    // Phase 5: Fade out entire splash after delay
    containerOpacity.value = withDelay(2800, withTiming(0, { duration: 400, easing: Easing.in(Easing.cubic) }));

    // Call onFinish after animation completes
    const timer = setTimeout(() => {
      onFinish();
    }, 3200);

    return () => clearTimeout(timer);
  }, []);

  const logoAnimatedStyle = useAnimatedStyle(() => ({
    opacity: logoOpacity.value,
    transform: [{ scale: logoScale.value }],
  }));

  const arabicAnimatedStyle = useAnimatedStyle(() => ({
    opacity: arabicOpacity.value,
    transform: [{ translateY: arabicTranslateY.value }],
  }));

  const crescentAnimatedStyle = useAnimatedStyle(() => ({
    opacity: crescentOpacity.value,
    transform: [{ scale: crescentScale.value }],
  }));

  const latinAnimatedStyle = useAnimatedStyle(() => ({
    opacity: latinOpacity.value,
    transform: [{ translateY: latinTranslateY.value }],
  }));

  const containerAnimatedStyle = useAnimatedStyle(() => ({
    opacity: containerOpacity.value,
  }));

  return (
    <Animated.View style={[styles.container, containerAnimatedStyle]}>
      {/* Logo */}
      <Animated.View style={[styles.logoContainer, logoAnimatedStyle]}>
        <Image
          source={require("@/assets/images/icon.png")}
          style={styles.logo}
          resizeMode="contain"
        />
      </Animated.View>

      {/* Arabic text */}
      <Animated.View style={[styles.arabicContainer, arabicAnimatedStyle]}>
        <Text style={styles.arabicText}>ربّاني</Text>
      </Animated.View>

      {/* Crescent ornament */}
      <Animated.View style={[styles.crescentContainer, crescentAnimatedStyle]}>
        <View style={styles.dividerLine}>
          <View style={styles.lineLeft} />
          <Text style={styles.crescentIcon}>☽</Text>
          <View style={styles.lineRight} />
        </View>
      </Animated.View>

      {/* Latin text */}
      <Animated.View style={[styles.latinContainer, latinAnimatedStyle]}>
        <Text style={styles.latinText}>R A B B A A N I E</Text>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#FAFAFA",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 9999,
  },
  logoContainer: {
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
  },
  logo: {
    width: width * 0.45,
    height: width * 0.45,
    borderRadius: (width * 0.45) / 2,
  },
  arabicContainer: {
    alignItems: "center",
    marginBottom: 12,
  },
  arabicText: {
    fontSize: 48,
    fontWeight: "700",
    color: "#1B5E20",
    letterSpacing: 2,
  },
  crescentContainer: {
    alignItems: "center",
    marginBottom: 12,
  },
  dividerLine: {
    flexDirection: "row",
    alignItems: "center",
    width: width * 0.4,
  },
  lineLeft: {
    flex: 1,
    height: 1,
    backgroundColor: "#B8860B",
  },
  crescentIcon: {
    fontSize: 18,
    color: "#B8860B",
    marginHorizontal: 8,
  },
  lineRight: {
    flex: 1,
    height: 1,
    backgroundColor: "#B8860B",
  },
  latinContainer: {
    alignItems: "center",
  },
  latinText: {
    fontSize: 16,
    fontWeight: "400",
    color: "#555555",
    letterSpacing: 4,
  },
});
