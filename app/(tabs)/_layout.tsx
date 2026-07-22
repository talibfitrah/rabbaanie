import { Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { HapticTab } from "@/components/haptic-tab";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { Platform, View, Text } from "react-native";
import { useColors } from "@/hooks/use-colors";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/hooks/use-auth";
import { trpc } from "@/lib/trpc";

export default function TabLayout() {
  const colors = useColors();
  const { t, isRTL } = useI18n();
  const { isAuthenticated } = useAuth();
  const insets = useSafeAreaInsets();
  const bottomPadding = Platform.OS === "web" ? 12 : Math.max(insets.bottom, 8);
  const tabBarHeight = 62 + bottomPadding;

  // Fetch total unread count for badge
  const unreadQuery = trpc.messages.totalUnread.useQuery(undefined, {
    enabled: isAuthenticated,
    refetchInterval: 10000, // Refresh every 10 seconds
  });
  const unreadCount = unreadQuery.data ?? 0;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: "#1B4332",
        tabBarInactiveTintColor: "#9BA6A0",
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarStyle: {
          paddingTop: 6,
          paddingBottom: bottomPadding,
          height: tabBarHeight,
          backgroundColor: "#FFFFFF",
          borderTopColor: "#E2E8E5",
          borderTopWidth: 1,
        },
        tabBarLabelStyle: {
          fontSize: 9,
          fontWeight: "600",
          writingDirection: isRTL ? "rtl" : "ltr",
          textAlign: "center",
          marginTop: 2,
        },
      }}
    >
      {/* الرئيسية - Home */}
      <Tabs.Screen
        name="index"
        options={{
          title: t("tab.home"),
          tabBarIcon: ({ color }) => <IconSymbol size={24} name="house.fill" color={color} />,
        }}
      />
      {/* القرآن - Fitrah/Qur'aan */}
      <Tabs.Screen
        name="fitrah"
        options={{
          title: t("tab.fitrah"),
          tabBarIcon: ({ color }) => <IconSymbol size={24} name="book.fill" color={color} />,
        }}
      />
      {/* الصلاة - Prayer */}
      <Tabs.Screen
        name="prayer-times"
        options={{
          title: t("tab.prayer"),
          tabBarIcon: ({ color }) => <IconSymbol size={24} name="clock.fill" color={color} />,
        }}
      />
      {/* التقويم - Weekly/Calendar */}
      <Tabs.Screen
        name="weekly"
        options={{
          title: t("tab.weekly"),
          tabBarIcon: ({ color }) => <IconSymbol size={24} name="calendar" color={color} />,
        }}
      />
      {/* المجتمع - Family/Community */}
      <Tabs.Screen
        name="family"
        options={{
          title: t("tab.family"),
          tabBarIcon: ({ color }) => <IconSymbol size={24} name="person.3.fill" color={color} />,
        }}
      />
      {/* شبكتي - Network/Communication */}
      <Tabs.Screen
        name="messages"
        options={{
          title: t("tab.network"),
          tabBarIcon: ({ color }) => (
            <View>
              <IconSymbol size={24} name="bubble.left.and.bubble.right.fill" color={color} />
              {unreadCount > 0 && (
                <View style={{
                  position: "absolute",
                  top: -4,
                  right: -8,
                  backgroundColor: "#EF4444",
                  borderRadius: 8,
                  minWidth: 16,
                  height: 16,
                  alignItems: "center",
                  justifyContent: "center",
                  paddingHorizontal: 3,
                }}>
                  <Text style={{ color: "#fff", fontSize: 9, fontWeight: "bold" }}>
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </Text>
                </View>
              )}
            </View>
          ),
        }}
      />
      {/* ذِكري - Dhikri (Qur'aan & Adhkaar) */}
      <Tabs.Screen
        name="dhikri"
        options={{
          title: t("tab.dhikri"),
          tabBarIcon: ({ color }) => <IconSymbol size={24} name="book.fill" color={color} />,
        }}
      />
      {/* Hidden tabs - accessible via router.push only */}
      <Tabs.Screen
        name="concepts"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="treatments"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="mindsets"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="family-hub"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="mosques"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="personal-advice"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="notification-settings"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}
