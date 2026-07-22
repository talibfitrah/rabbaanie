import { Stack } from "expo-router";

export default function ChildLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, gestureEnabled: true, gestureDirection: "horizontal", animation: "slide_from_right" }}>
      <Stack.Screen name="[id]" />
      <Stack.Screen name="environment" />
      <Stack.Screen name="weekplan" />
    </Stack>
  );
}
