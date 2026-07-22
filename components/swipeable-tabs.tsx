import { useRef, useCallback } from "react";
import { Animated, Dimensions, PanResponder, View, Platform } from "react-native";
import { useRouter, usePathname } from "expo-router";

const SCREEN_WIDTH = Dimensions.get("window").width;
const SWIPE_THRESHOLD = SCREEN_WIDTH * 0.25; // 25% of screen width
const VELOCITY_THRESHOLD = 0.3;

/**
 * Ordered list of visible tab routes (in the order they appear in the tab bar).
 * Must match the order in app/(tabs)/_layout.tsx
 */
const TAB_ORDER = [
  "/(tabs)",           // index (home)
  "/(tabs)/fitrah",
  "/(tabs)/prayer-times",
  "/(tabs)/weekly",
  "/(tabs)/family",
  "/(tabs)/messages",
  "/(tabs)/concepts",
];

/**
 * Maps pathname to tab index
 */
function getTabIndex(pathname: string): number {
  if (pathname === "/" || pathname === "/(tabs)" || pathname === "/(tabs)/index") return 0;
  const idx = TAB_ORDER.findIndex((t) => pathname.startsWith(t) && t !== "/(tabs)");
  return idx >= 0 ? idx : 0;
}

/**
 * SwipeableTabs - Wraps tab screen content to enable horizontal swipe navigation between tabs.
 * Uses Animated API for smooth visual transitions (page slides out as you swipe).
 */
export function SwipeableTabs({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const translateX = useRef(new Animated.Value(0)).current;
  const isNavigating = useRef(false);

  const navigateToTab = useCallback((direction: "left" | "right") => {
    if (isNavigating.current) return;
    isNavigating.current = true;

    const currentIndex = getTabIndex(pathname);
    let nextIndex: number;

    if (direction === "left") {
      nextIndex = currentIndex + 1;
    } else {
      nextIndex = currentIndex - 1;
    }

    if (nextIndex >= 0 && nextIndex < TAB_ORDER.length) {
      // Animate the current page out
      const toValue = direction === "left" ? -SCREEN_WIDTH : SCREEN_WIDTH;
      Animated.timing(translateX, {
        toValue,
        duration: 200,
        useNativeDriver: true,
      }).start(() => {
        const route = TAB_ORDER[nextIndex];
        router.replace(route as any);
        // Reset position instantly (new page appears)
        translateX.setValue(0);
        isNavigating.current = false;
      });
    } else {
      // Bounce back if at edge
      Animated.spring(translateX, {
        toValue: 0,
        useNativeDriver: true,
        tension: 100,
        friction: 10,
      }).start(() => {
        isNavigating.current = false;
      });
    }
  }, [pathname, router, translateX]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        // Only respond to horizontal gestures that are clearly horizontal
        const { dx, dy } = gestureState;
        return Math.abs(dx) > 15 && Math.abs(dx) > Math.abs(dy) * 1.5 && !isNavigating.current;
      },
      onMoveShouldSetPanResponderCapture: (_, gestureState) => {
        // Capture horizontal swipes
        const { dx, dy } = gestureState;
        return Math.abs(dx) > 25 && Math.abs(dx) > Math.abs(dy) * 2 && !isNavigating.current;
      },
      onPanResponderGrant: () => {
        // Stop any running animation
        translateX.stopAnimation();
      },
      onPanResponderMove: (_, gestureState) => {
        if (isNavigating.current) return;
        const currentIndex = getTabIndex(pathname);
        const { dx } = gestureState;
        
        // Limit movement at edges
        if ((currentIndex === 0 && dx > 0) || (currentIndex === TAB_ORDER.length - 1 && dx < 0)) {
          // At edge - apply resistance (move at 30% speed)
          translateX.setValue(dx * 0.3);
        } else {
          translateX.setValue(dx);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (isNavigating.current) return;
        const { dx, vx } = gestureState;

        // Determine if swipe should trigger navigation
        if (Math.abs(dx) > SWIPE_THRESHOLD || Math.abs(vx) > VELOCITY_THRESHOLD) {
          if (dx > 0 || vx > VELOCITY_THRESHOLD) {
            navigateToTab("right");
          } else {
            navigateToTab("left");
          }
        } else {
          // Snap back
          Animated.spring(translateX, {
            toValue: 0,
            useNativeDriver: true,
            tension: 100,
            friction: 10,
          }).start();
        }
      },
      onPanResponderTerminate: () => {
        // Snap back on termination
        Animated.spring(translateX, {
          toValue: 0,
          useNativeDriver: true,
          tension: 100,
          friction: 10,
        }).start();
      },
    })
  ).current;

  // On web, disable swipe (not needed)
  if (Platform.OS === "web") {
    return <View style={{ flex: 1 }}>{children}</View>;
  }

  return (
    <Animated.View
      style={{
        flex: 1,
        transform: [{ translateX }],
      }}
      {...panResponder.panHandlers}
    >
      {children}
    </Animated.View>
  );
}
