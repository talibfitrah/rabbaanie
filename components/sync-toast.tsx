import { useEffect, useRef } from "react";
import { Animated, Text, View, StyleSheet, Platform } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useI18n } from "@/lib/i18n";

interface SyncToastProps {
  visible: boolean;
  message: string;
  type?: "success" | "info" | "error";
  onHide?: () => void;
  duration?: number;
}

export function SyncToast({ visible, message, type = "success", onHide, duration = 3500 }: SyncToastProps) {
  const translateY = useRef(new Animated.Value(100)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const { isRTL } = useI18n();

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(translateY, { toValue: 0, duration: 300, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 300, useNativeDriver: true }),
      ]).start();

      const timer = setTimeout(() => {
        Animated.parallel([
          Animated.timing(translateY, { toValue: 100, duration: 250, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0, duration: 250, useNativeDriver: true }),
        ]).start(() => {
          onHide?.();
        });
      }, duration);

      return () => clearTimeout(timer);
    }
  }, [visible, message]);

  if (!visible) return null;

  const bgColor = type === "success" ? "#1B4332" : type === "error" ? "#B91C1C" : "#1E40AF";
  const iconName = type === "success" ? "cloud-done" : type === "error" ? "error" : "info";

  return (
    <Animated.View
      style={[
        styles.container,
        { backgroundColor: bgColor, transform: [{ translateY }], opacity, flexDirection: isRTL ? "row-reverse" : "row" },
      ]}
      pointerEvents="none"
    >
      <MaterialIcons name={iconName} size={20} color="#FFFFFF" />
      <Text style={[styles.text, { textAlign: isRTL ? "right" : "left" }]} numberOfLines={2}>{message}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    bottom: Platform.OS === "web" ? 30 : 100,
    left: 20,
    right: 20,
    alignItems: "center",
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 14,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
    zIndex: 9999,
  },
  text: {
    flex: 1,
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 20,
  },
});
