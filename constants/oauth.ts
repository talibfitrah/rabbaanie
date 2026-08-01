import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import * as ReactNative from "react-native";

import { APP_SCHEME } from "./app-identity";

const env = {
  portal: process.env.EXPO_PUBLIC_OAUTH_PORTAL_URL ?? "",
  server: process.env.EXPO_PUBLIC_OAUTH_SERVER_URL ?? "",
  appId: process.env.EXPO_PUBLIC_APP_ID ?? "",
  ownerId: process.env.EXPO_PUBLIC_OWNER_OPEN_ID ?? "",
  ownerName: process.env.EXPO_PUBLIC_OWNER_NAME ?? "",
  apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL ?? "",
  deepLinkScheme: APP_SCHEME,
};

export const OAUTH_PORTAL_URL = env.portal;
export const OAUTH_SERVER_URL = env.server;
export const APP_ID = env.appId;
export const OWNER_OPEN_ID = env.ownerId;
export const OWNER_NAME = env.ownerName;
export const API_BASE_URL = env.apiBaseUrl;

/**
 * Get the API base URL, deriving from current hostname if not set.
 * Metro runs on 8081, API server runs on 3000.
 * URL pattern: https://PORT-sandboxid.region.domain
 */
export function getApiBaseUrl(): string {
  // PRODUCTION: Always use api.rabbaanie.com for native builds
  if (ReactNative.Platform.OS !== "web") {
    return "https://api.rabbaanie.com";
  }

  // On web during development, derive from current hostname by replacing port 8081 with 3000
  if (typeof window !== "undefined" && window.location) {
    const { protocol, hostname } = window.location;
    // If we're on manus.computer (sandbox dev), use port-swap pattern
    if (hostname.includes("manus.computer") || hostname.includes("manus.space")) {
      const apiHostname = hostname.replace(/^8081-/, "3000-");
      if (apiHostname !== hostname) {
        return `${protocol}//${apiHostname}`;
      }
    }
  }

  // If API_BASE_URL env var is set (dev sandbox), use it
  if (API_BASE_URL) {
    return API_BASE_URL.replace(/\/$/, "");
  }

  // Final fallback: always api.rabbaanie.com
  return "https://api.rabbaanie.com";
}

export const SESSION_TOKEN_KEY = "app_session_token";
export const USER_INFO_KEY = "manus-runtime-user-info";

const encodeState = (value: string) => {
  if (typeof globalThis.btoa === "function") {
    return globalThis.btoa(value);
  }
  const BufferImpl = (globalThis as Record<string, any>).Buffer;
  if (BufferImpl) {
    return BufferImpl.from(value, "utf-8").toString("base64");
  }
  return value;
};

/**
 * Get the deep link URI for the OAuth callback screen.
 * This is the URI the app registers to handle (manusapk:///oauth/callback).
 */
export const getDeepLinkUri = () => {
  return Linking.createURL("/oauth/callback", {
    scheme: env.deepLinkScheme,
  });
};

/**
 * Get the redirect URI for OAuth callback.
 *
 * Native flow (server-side redirect pattern):
 * 1. OAuth portal redirects to: API_SERVER/api/oauth/native-callback?code=xxx&state=yyy
 * 2. Server exchanges code for token
 * 3. Server redirects to: manusapk:///oauth/callback?sessionToken=xxx&user=base64(json)
 * The deep link scheme is hardcoded on the server (derived from bundle ID).
 * This avoids the native app needing to call the API server after receiving the deep link.
 *
 * Web flow:
 * 1. OAuth portal redirects to: API_SERVER/api/oauth/callback?code=xxx&state=yyy
 * 2. Server exchanges code, sets cookie, redirects to frontend
 */
export const getRedirectUri = () => {
  if (ReactNative.Platform.OS === "web") {
    return `${getApiBaseUrl()}/api/oauth/callback`;
  } else {
    // Native: redirect to our API server's native-callback endpoint
    // The redirect URI must be CLEAN (no query params) because the OAuth portal
    // may not preserve existing query parameters when appending code/state.
    // The server hardcodes the deep link scheme (manusapk) to redirect back to the app.
    const apiBase = getApiBaseUrl();
    if (apiBase) {
      return `${apiBase}/api/oauth/native-callback`;
    }
    // Fallback to direct deep link if no API base URL (shouldn't happen in production)
    return getDeepLinkUri();
  }
};

export const getLoginUrl = () => {
  const redirectUri = getRedirectUri();
  // State is always base64(redirectUri) - this is what the OAuth server expects
  const state = encodeState(redirectUri);

  const url = new URL(`${OAUTH_PORTAL_URL}/app-auth`);
  url.searchParams.set("appId", APP_ID);
  url.searchParams.set("redirectUri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("type", "signIn");

  return url.toString();
};

/**
 * Start OAuth login flow.
 *
 * On native platforms (iOS/Android), use WebBrowser.openAuthSessionAsync
 * which opens an in-app browser (Chrome Custom Tabs / SFSafariViewController)
 * and automatically handles the deep link redirect back to the app.
 * This prevents the "HTML page" issue where the external browser can't handle
 * the custom scheme redirect.
 *
 * On web, this simply redirects to the login URL.
 *
 * @returns The deep link URL with auth params, or null if cancelled/web.
 */
export async function startOAuthLogin(): Promise<string | null> {
  const loginUrl = getLoginUrl();

  if (ReactNative.Platform.OS === "web") {
    // On web, use openAuthSessionAsync to keep user in-app (opens popup/new tab)
    // Falls back to redirect if openAuthSessionAsync is not available
    try {
      const redirectUrl = `${getApiBaseUrl()}/api/oauth/callback`;
      const result = await WebBrowser.openAuthSessionAsync(loginUrl, redirectUrl);
      if (result.type === "success" && result.url) {
        return result.url;
      }
      // If popup was blocked or dismissed, fall back to redirect
      if (result.type === "cancel" || result.type === "dismiss") {
        return null;
      }
    } catch {
      // Fallback: redirect (some web environments don't support auth session)
      if (typeof window !== "undefined") {
        window.location.href = loginUrl;
      }
    }
    return null;
  }

  // Native: use openAuthSessionAsync which handles the deep link redirect
  // This opens Chrome Custom Tabs (Android) or SFSafariViewController (iOS)
  // and automatically catches the redirect back to our app's deep link scheme
  try {
    const redirectUrl = getDeepLinkUri();
    console.log("[OAuth] Opening auth session...");
    console.log("[OAuth] Login URL:", loginUrl);
    console.log("[OAuth] Expected redirect URL:", redirectUrl);

    const result = await WebBrowser.openAuthSessionAsync(loginUrl, redirectUrl);

    console.log("[OAuth] Auth session result:", result.type);

    if (result.type === "success" && result.url) {
      console.log("[OAuth] Got redirect URL:", result.url);
      // The URL contains the deep link with sessionToken and user params
      // Expo Router will handle this via the oauth/callback screen
      // But we also handle it here as a fallback
      return result.url;
    } else if (result.type === "cancel" || result.type === "dismiss") {
      console.log("[OAuth] User cancelled or dismissed auth session");
      return null;
    }

    return null;
  } catch (error) {
    console.error("[OAuth] openAuthSessionAsync failed:", error);
    // Fallback: try opening with Linking.openURL
    try {
      console.log("[OAuth] Falling back to Linking.openURL...");
      await Linking.openURL(loginUrl);
    } catch (linkError) {
      console.error("[OAuth] Linking.openURL also failed:", linkError);
    }
    return null;
  }
}
