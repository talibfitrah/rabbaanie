import { Stack } from "expo-router";

export default function OnboardingLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, gestureEnabled: true, gestureDirection: "horizontal", animation: "slide_from_right" }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="parent-profile" />
      <Stack.Screen name="add-child" />
    </Stack>
  );
}
