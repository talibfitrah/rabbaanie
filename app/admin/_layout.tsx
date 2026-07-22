import { Stack } from "expo-router";

export default function AdminLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="content-editor" />
      <Stack.Screen name="newsletter-editor" />
    </Stack>
  );
}
