import { Platform } from "react-native";
import { getApiBaseUrl } from "@/constants/oauth";
import * as Auth from "./auth";

type ApiResponse<T> = {
  data?: T;
  error?: string;
};

export async function apiCall<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((options.headers as Record<string, string>) || {}),
  };

  // Determine the auth method:
  // - Native platform: use stored session token as Bearer auth
  // - Web (including iframe): use cookie-based auth (browser handles automatically)
  //   Cookie is set on backend domain via POST /api/auth/session after receiving token via postMessage
  if (Platform.OS !== "web") {
    const sessionToken = await Auth.getSessionToken();
    console.log("[API] apiCall:", {
      endpoint,
      hasToken: !!sessionToken,
      method: options.method || "GET",
    });
    if (sessionToken) {
      headers["Authorization"] = `Bearer ${sessionToken}`;
      console.log("[API] Authorization header added");
    }
  } else {
    console.log("[API] apiCall:", {
      endpoint,
      platform: "web",
      method: options.method || "GET",
    });
  }

  const baseUrl = getApiBaseUrl();
  // Ensure no double slashes between baseUrl and endpoint
  const cleanBaseUrl = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  const cleanEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  const url = baseUrl ? `${cleanBaseUrl}${cleanEndpoint}` : endpoint;
  // Never log the full URL: trpc GET requests carry user content in ?input=.


  try {
    console.log("[API] Making request...");
    const response = await fetch(url, {
      ...options,
      headers,
      credentials: "include",
    });

    console.log("[API] Response status:", response.status, response.statusText);

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[API] Error response:", errorText);
      let errorMessage = errorText;
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.error || errorJson.message || errorText;
      } catch {
        // Not JSON, use text as is
      }
      throw new Error(
        errorMessage || `API call failed: ${response.statusText}`,
      );
    }

    const contentType = response.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
      const data = await response.json();
      console.log("[API] JSON response received");
      return data as T;
    }

    const text = await response.text();
    console.log("[API] Text response received");
    return (text ? JSON.parse(text) : {}) as T;
  } catch (error) {
    console.error("[API] Request failed:", error);
    if (error instanceof Error) {
      throw error;
    }
    throw new Error("Unknown error occurred");
  }
}

// Logout
export async function logout(): Promise<void> {
  await apiCall<void>("/api/auth/logout", {
    method: "POST",
  });
}

// Get current authenticated user (web uses cookie-based auth)
export async function getMe(): Promise<{
  id: number;
  openId: string;
  name: string | null;
  email: string | null;
  loginMethod: string | null;
  lastSignedIn: string;
} | null> {
  try {
    const result = await apiCall<{ user: any }>("/api/auth/me");
    return result.user || null;
  } catch (error) {
    console.error("[API] getMe failed:", error);
    return null;
  }
}

/**
 * Validate a newly received native session token before it is persisted.
 * The callback URL is attacker-controlled input; only the API may identify the
 * user attached to that token.
 */
export async function verifySessionToken(token: string): Promise<Auth.User> {
  if (!token.trim()) throw new Error("Session token is missing");

  const input = encodeURIComponent(JSON.stringify({ json: null }));
  const response = await fetch(
    `${getApiBaseUrl()}/api/trpc/auth.me?input=${input}`,
    {
      headers: { Authorization: `Bearer ${token}` },
    },
  );
  if (!response.ok) throw new Error("Session verification failed");

  const payload = (await response.json()) as {
    result?: { data?: { json?: unknown } };
  };
  const value = payload.result?.data?.json;
  if (!value || typeof value !== "object")
    throw new Error("Session is invalid or expired");

  const user = value as Record<string, unknown>;
  if (
    typeof user.id !== "number" ||
    typeof user.openId !== "string" ||
    !user.openId
  ) {
    throw new Error("Session user is invalid");
  }

  const lastSignedIn =
    typeof user.lastSignedIn === "string" || user.lastSignedIn instanceof Date
      ? new Date(user.lastSignedIn)
      : new Date();

  return {
    id: user.id,
    openId: user.openId,
    name: typeof user.name === "string" ? user.name : null,
    email: typeof user.email === "string" ? user.email : null,
    loginMethod: typeof user.loginMethod === "string" ? user.loginMethod : null,
    lastSignedIn: Number.isNaN(lastSignedIn.getTime())
      ? new Date()
      : lastSignedIn,
  };
}

// Establish session cookie on the backend (3000-xxx domain)
// Called after receiving token via postMessage to get a proper Set-Cookie from the backend
export async function establishSession(token: string): Promise<boolean> {
  try {
    console.log("[API] establishSession: setting cookie on backend...");
    const baseUrl = getApiBaseUrl();
    const url = `${baseUrl}/api/auth/session`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      credentials: "include", // Important: allows Set-Cookie to be stored
    });

    if (!response.ok) {
      console.error("[API] establishSession failed:", response.status);
      return false;
    }

    console.log("[API] establishSession: cookie set successfully");
    return true;
  } catch (error) {
    console.error("[API] establishSession error:", error);
    return false;
  }
}
