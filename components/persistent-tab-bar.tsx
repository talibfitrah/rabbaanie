import React from "react";
import { View, Pressable, Text, StyleSheet, Platform } from "react-native";
import { useRouter, usePathname } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/use-colors";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useI18n } from "@/lib/i18n";
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
  // Modal-presented screens: the bar is part of the base layer, so without
  // this it shows as a strip under the modal sheet.
  "/details",
  "/ai-chat",
  "/chat-notes",
  // Full-screen chat like /ai-chat above, so hidden for signed-in visitors
  // the same way — plus reachable signed-out now that lib/age-gate.tsx gives
  // it its own carve-out (the login screen's "need help?" link), where a
  // floating tab bar implying access to Family/Messages/etc. would be
  // actively misleading for a visitor who was never signed in.
  "/support",
];

// All 7 tab definitions matching the main tab bar exactly: same t("tab.*")
// keys as app/(tabs)/_layout.tsx, so the labels follow the app language here
// too (exported for tests/persistent-tab-bar-i18n.test.ts).
export const TABS = [
  { route: "/(tabs)", icon: "house.fill" as const, key: "tab.home" },
  { route: "/(tabs)/fitrah", icon: "book.fill" as const, key: "tab.fitrah" },
  { route: "/(tabs)/prayer-times", icon: "clock.fill" as const, key: "tab.prayer" },
  { route: "/(tabs)/weekly", icon: "calendar" as const, key: "tab.weekly" },
  { route: "/(tabs)/family", icon: "person.3.fill" as const, key: "tab.family" },
  { route: "/(tabs)/messages", icon: "bubble.left.and.bubble.right.fill" as const, key: "tab.network" },
  { route: "/(tabs)/dhikri", icon: "book.fill" as const, key: "tab.dhikri" },
];

export function PersistentTabBar() {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const { t } = useI18n();

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
              {t(tab.key)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  // Rendered in flow below the Stack (see app/_layout.tsx) so scrollable
  // screens can never slide their content under the bar.
  container: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 8,
    borderTopWidth: 0.5,
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
