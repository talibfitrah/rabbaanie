import { Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { HapticTab } from "@/components/haptic-tab";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { Platform, View, Text } from "react-native";
import { useColors } from "@/hooks/use-colors";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/hooks/use-auth";
import { trpc } from "@/lib/trpc";

// The visible tabs are reversed for Arabic below; without this the first
// entry (dhikri) would become the default route on a cold deep link.
export const unstable_settings = { initialRouteName: "index" };

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

  // Native RTL is off (lib/i18n.tsx), so the bar lays out left-to-right
  // regardless of language; reverse the visible order for Arabic instead.
  const visible = [
    // الرئيسية - Home
    <Tabs.Screen
      key="index"
      name="index"
      options={{
        title: t("tab.home"),
        tabBarIcon: ({ color }) => <IconSymbol size={24} name="house.fill" color={color} />,
      }}
    />,
    // القرآن - Fitrah/Qur'aan
    <Tabs.Screen
      key="fitrah"
      name="fitrah"
      options={{
        title: t("tab.fitrah"),
        tabBarIcon: ({ color }) => <IconSymbol size={24} name="book.fill" color={color} />,
      }}
    />,
    // الصلاة - Prayer
    <Tabs.Screen
      key="prayer-times"
      name="prayer-times"
      options={{
        title: t("tab.prayer"),
        tabBarIcon: ({ color }) => <IconSymbol size={24} name="clock.fill" color={color} />,
      }}
    />,
    // التقويم - Weekly/Calendar
    <Tabs.Screen
      key="weekly"
      name="weekly"
      options={{
        title: t("tab.weekly"),
        tabBarIcon: ({ color }) => <IconSymbol size={24} name="calendar" color={color} />,
      }}
    />,
    // المجتمع - Family/Community
    <Tabs.Screen
      key="family"
      name="family"
      options={{
        title: t("tab.family"),
        tabBarIcon: ({ color }) => <IconSymbol size={24} name="person.3.fill" color={color} />,
      }}
    />,
    // شبكتي - Network/Communication
    <Tabs.Screen
      key="messages"
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
    />,
    // ذِكري - Dhikri (Qur'aan & Adhkaar)
    <Tabs.Screen
      key="dhikri"
      name="dhikri"
      options={{
        title: t("tab.dhikri"),
        tabBarIcon: ({ color }) => <IconSymbol size={24} name="book.fill" color={color} />,
      }}
    />,
  ];

  return (
    <Tabs
      // The visible order is reversed for Arabic; Android back must still land on Home.
      initialRouteName="index"
      backBehavior="initialRoute"
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
      {isRTL ? visible.slice().reverse() : visible}
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
