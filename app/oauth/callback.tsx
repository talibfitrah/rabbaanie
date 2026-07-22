import { ThemedView } from "@/components/themed-view";
import * as Auth from "@/lib/_core/auth";
import { useAuthContext } from "@/lib/auth-context";
import { useAppState } from "@/lib/app-context";
import * as Linking from "expo-linking";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function OAuthCallback() {
  const router = useRouter();
  const { setAuthState } = useAuthContext();
  const { rehydrateFromServer } = useAppState();
  const params = useLocalSearchParams<{
    code?: string;
    state?: string;
    error?: string;
    sessionToken?: string;
    user?: string;
  }>();
  const [status, setStatus] = useState<"processing" | "success" | "error">("processing");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const handleCallback = async () => {
      console.log("[OAuth] Callback handler triggered");
      console.log("[OAuth] Params received:", {
        code: params.code ? "present" : "missing",
        state: params.state ? "present" : "missing",
        error: params.error,
        sessionToken: params.sessionToken ? "present" : "missing",
        user: params.user ? "present" : "missing",
      });

      try {
        // Check for error parameter first
        if (params.error) {
          console.error("[OAuth] Error parameter found:", params.error);
          setStatus("error");
          setErrorMessage(sanitizeErrorMessage(params.error));
          return;
        }

        // Check for sessionToken in params (from server-side redirect flow)
        if (params.sessionToken) {
          console.log("[OAuth] Session token found in params, setting auth state...");

          // Decode user info
          let userInfo: Auth.User | null = null;
          if (params.user) {
            try {
              const userJson =
                typeof atob !== "undefined"
                  ? atob(params.user)
                  : Buffer.from(params.user, "base64").toString("utf-8");
              const userData = JSON.parse(userJson);
              userInfo = {
                id: userData.id,
                openId: userData.openId,
                name: userData.name,
                email: userData.email,
                loginMethod: userData.loginMethod,
                lastSignedIn: new Date(userData.lastSignedIn || Date.now()),
              };
              console.log("[OAuth] User info decoded:", userInfo.name);
            } catch (err) {
              console.error("[OAuth] Failed to parse user data:", err);
            }
          }

          // Use the shared auth context to set state immediately
          // This updates both SecureStore AND the React state in AuthProvider
          if (userInfo) {
            await setAuthState(userInfo, params.sessionToken);
          } else {
            // Fallback: store token directly if user data couldn't be decoded
            await Auth.setSessionToken(params.sessionToken);
          }

          // IMPORTANT: After login, re-fetch user data from server
          // This restores previously saved profile data so the user
          // doesn't get asked for their info again
          await rehydrateFromServer();

          setStatus("success");
          console.log("[OAuth] Authentication successful! AuthGate will redirect to home.");
          // Don't manually navigate - AuthGate will detect isAuthenticated=true
          // and automatically redirect from oauth to /(tabs)
          return;
        }

        // If we have code and state but no sessionToken, this is the old flow
        // (direct deep link from OAuth portal without server-side exchange)
        if (params.code && params.state) {
          console.log("[OAuth] Code and state found, attempting exchange via API...");
          const Api = await import("@/lib/_core/api");
          const result = await Api.exchangeOAuthCode(params.code, params.state);

          if (result.sessionToken) {
            let userInfo: Auth.User | null = null;
            if (result.user) {
              userInfo = {
                id: result.user.id,
                openId: result.user.openId,
                name: result.user.name,
                email: result.user.email,
                loginMethod: result.user.loginMethod,
                lastSignedIn: new Date(result.user.lastSignedIn || Date.now()),
              };
            }

            if (userInfo) {
              await setAuthState(userInfo, result.sessionToken);
            } else {
              await Auth.setSessionToken(result.sessionToken);
            }

            // Re-fetch user data from server after login
            await rehydrateFromServer();

            setStatus("success");
            return;
          } else {
            setStatus("error");
            setErrorMessage("Geen sessie-token ontvangen van de server.");
            return;
          }
        }

        // Try to get URL from Linking as last resort
        const initialUrl = await Linking.getInitialURL();
        console.log("[OAuth] Checking Linking.getInitialURL():", initialUrl);

        if (initialUrl) {
          try {
            const urlObj = new URL(initialUrl);
            const sessionToken = urlObj.searchParams.get("sessionToken");
            const user = urlObj.searchParams.get("user");
            const error = urlObj.searchParams.get("error");

            if (error) {
              setStatus("error");
              setErrorMessage(sanitizeErrorMessage(error));
              return;
            }

            if (sessionToken) {
              let userInfo: Auth.User | null = null;
              if (user) {
                try {
                  const userJson = atob(user);
                  const userData = JSON.parse(userJson);
                  userInfo = {
                    id: userData.id,
                    openId: userData.openId,
                    name: userData.name,
                    email: userData.email,
                    loginMethod: userData.loginMethod,
                    lastSignedIn: new Date(userData.lastSignedIn || Date.now()),
                  };
                } catch {
                  // Not fatal
                }
              }

              if (userInfo) {
                await setAuthState(userInfo, sessionToken);
              } else {
                await Auth.setSessionToken(sessionToken);
              }

              // Re-fetch user data from server after login
              await rehydrateFromServer();

              setStatus("success");
              return;
            }
          } catch {
            // URL parsing failed
          }
        }

        // No valid parameters found
        console.error("[OAuth] No valid callback parameters found");
        setStatus("error");
        setErrorMessage("Geen geldige inloggegevens ontvangen. Probeer opnieuw in te loggen.");
      } catch (error) {
        console.error("[OAuth] Callback error:", error);
        setStatus("error");
        const msg = error instanceof Error ? error.message : "Authenticatie mislukt";
        setErrorMessage(sanitizeErrorMessage(msg));
      }
    };

    handleCallback();
  }, [params.code, params.state, params.error, params.sessionToken, params.user, setAuthState]);

  const handleRetry = () => {
    router.replace("/login");
  };

  return (
    <SafeAreaView className="flex-1" edges={["top", "bottom", "left", "right"]}>
      <ThemedView className="flex-1 items-center justify-center gap-4 p-5">
        {status === "processing" && (
          <>
            <ActivityIndicator size="large" />
            <Text className="mt-4 text-base leading-6 text-center text-foreground">
              Authenticatie voltooien...
            </Text>
          </>
        )}
        {status === "success" && (
          <>
            <Text className="text-4xl mb-2">✓</Text>
            <Text className="text-base leading-6 text-center text-foreground">
              Inloggen gelukt!
            </Text>
            <Text className="text-sm leading-5 text-center text-muted">
              Je wordt doorgestuurd...
            </Text>
          </>
        )}
        {status === "error" && (
          <View className="items-center gap-4 px-4">
            <Text className="text-4xl mb-2">⚠️</Text>
            <Text className="text-xl font-bold leading-7 text-error text-center">
              Inloggen mislukt
            </Text>
            <Text className="text-sm leading-5 text-center text-muted max-w-xs">
              {errorMessage}
            </Text>
            <TouchableOpacity
              onPress={handleRetry}
              className="mt-4 bg-primary px-6 py-3 rounded-full"
            >
              <Text className="text-background font-semibold text-base">
                Opnieuw proberen
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </ThemedView>
    </SafeAreaView>
  );
}

/**
 * Sanitize error messages to avoid showing raw HTML or overly long technical errors.
 */
function sanitizeErrorMessage(message: string): string {
  if (message.includes("<html") || message.includes("<!DOCTYPE") || message.includes("<head")) {
    return "De server is tijdelijk niet bereikbaar. Probeer het later opnieuw.";
  }
  if (message.length > 200) {
    return message.substring(0, 200) + "...";
  }
  return message;
}
