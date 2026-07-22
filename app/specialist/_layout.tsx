import { Stack } from "expo-router";

export default function SpecialistLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="create-plan" />
      <Stack.Screen name="plan/[id]" />
      <Stack.Screen name="family/[id]" />
    </Stack>
  );
}
