import { ThemedView } from "@/components/themed-view";
import { useRouter } from "expo-router";
import { Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function OAuthCallback() {
  const router = useRouter();
  const handleRetry = () => {
    router.replace("/login");
  };

  return (
    <SafeAreaView className="flex-1" edges={["top", "bottom", "left", "right"]}>
      <ThemedView className="flex-1 items-center justify-center gap-4 p-5">
        <View className="items-center gap-4 px-4">
          <Text className="text-4xl mb-2">⚠️</Text>
          <Text className="text-xl font-bold leading-7 text-error text-center">
            Verouderde inloglink
          </Text>
          <Text className="text-sm leading-5 text-center text-muted max-w-xs">
            Start Google-inloggen opnieuw vanaf het inlogscherm.
          </Text>
          <TouchableOpacity
            onPress={handleRetry}
            className="mt-4 bg-primary px-6 py-3 rounded-full"
          >
            <Text className="text-background font-semibold text-base">
              Naar inloggen
            </Text>
          </TouchableOpacity>
        </View>
      </ThemedView>
    </SafeAreaView>
  );
}
