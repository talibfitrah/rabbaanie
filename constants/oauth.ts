import * as ReactNative from "react-native";

const configuredApiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL ?? "";

/** Resolve the API endpoint without ever trusting a preview URL in native builds. */
export function getApiBaseUrl(): string {
  if (ReactNative.Platform.OS !== "web") {
    return "https://api.rabbaanie.com";
  }

  if (typeof window !== "undefined" && window.location) {
    const { protocol, hostname } = window.location;
    if (
      hostname.includes("manus.computer") ||
      hostname.includes("manus.space")
    ) {
      const apiHostname = hostname.replace(/^8081-/, "3000-");
      if (apiHostname !== hostname) return `${protocol}//${apiHostname}`;
    }
  }

  if (configuredApiBaseUrl) {
    return configuredApiBaseUrl.replace(/\/$/, "");
  }
  return "https://api.rabbaanie.com";
}

export const SESSION_TOKEN_KEY = "app_session_token";
export const USER_INFO_KEY = "manus-runtime-user-info";
