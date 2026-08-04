import React from "react";
import { View, Pressable, Text, StyleSheet, Platform } from "react-native";
import { useRouter, usePathname } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/use-colors";
import { IconSymbol } from "@/components/ui/icon-symbol";
import * as Haptics from "expo-haptics";

// Screens where the tab bar should NOT appear
const HIDDEN_ROUTES = [
  "/age-check",
  "/login",
  "/language-select",
  "/onboarding",
  "/permissions-setup",
  "/oauth",
  "/child-account",
];

// All 7 tab definitions matching the main tab bar exactly
const TABS = [
  { route: "/(tabs)", icon: "house.fill" as const, label: "\u0627\u0644\u0631\u0626\u064a\u0633\u0629" },
  { route: "/(tabs)/fitrah", icon: "book.fill" as const, label: "\u0627\u0644\u0641\u0637\u0631\u0629" },
  { route: "/(tabs)/prayer-times", icon: "clock.fill" as const, label: "\u0627\u0644\u0635\u0644\u0627\u0629" },
  { route: "/(tabs)/weekly", icon: "calendar" as const, label: "\u0627\u0644\u0623\u0633\u0628\u0648\u0639\u064a" },
  { route: "/(tabs)/family", icon: "person.3.fill" as const, label: "\u0627\u0644\u0639\u0627\u0626\u0644\u0629" },
  { route: "/(tabs)/messages", icon: "bubble.left.and.bubble.right.fill" as const, label: "\u0634\u0628\u0643\u062a\u064a" },
  { route: "/(tabs)/dhikri", icon: "book.fill" as const, label: "\u0630\u0643\u0631\u064a" },
];

export function PersistentTabBar() {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const colors = useColors();

  // Don't show on hidden routes
  const shouldHide = HIDDEN_ROUTES.some((r) => pathname.startsWith(r));
  if (shouldHide) return null;

  // Don't show on screens that are inside (tabs) - the native tab bar handles those
  const isInsideTabs = pathname === "/" || pathname === "/index" ||
    pathname === "/fitrah" || pathname === "/prayer-times" ||
    pathname === "/weekly" || pathname === "/family" ||
    pathname === "/messages" || pathname === "/dhikri" ||
    pathname === "/concepts" || pathname === "/treatments" ||
    pathname === "/settings" || pathname === "/mindsets" ||
    pathname === "/family-hub" || pathname === "/mosques" ||
    pathname === "/personal-advice" || pathname === "/notification-settings";
  if (isInsideTabs) return null;

  const bottomPadding = Platform.OS === "web" ? 12 : Math.max(insets.bottom, 8);
  const tabBarHeight = 56 + bottomPadding;

  return (
    <View
      style={[
        styles.container,
        {
          height: tabBarHeight,
          paddingBottom: bottomPadding,
          backgroundColor: colors.background,
          borderTopColor: colors.border,
        },
      ]}
    >
      {TABS.map((tab) => {
        const isActive = pathname === tab.route || (tab.route === "/(tabs)" && pathname === "/");
        return (
          <Pressable
            key={tab.route}
            onPress={() => {
              if (Platform.OS !== "web") {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }
              router.navigate(tab.route as any);
            }}
            style={({ pressed }) => [
              styles.tab,
              pressed && { opacity: 0.7 },
            ]}
          >
            <IconSymbol
              size={20}
              name={tab.icon}
              color={isActive ? colors.primary : colors.muted}
            />
            <Text
              style={[
                styles.label,
                { color: isActive ? colors.primary : colors.muted },
              ]}
              numberOfLines={1}
            >
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 8,
    borderTopWidth: 0.5,
    zIndex: 9999,
    elevation: 10,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  label: {
    fontSize: 9,
    fontWeight: "500",
  },
});
