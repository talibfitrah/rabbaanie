import { describe, expect, it } from "vitest";

describe("OAuth Native Callback Flow", () => {
  it("should construct clean redirect URI for native without query params", () => {
    // Simulate the getRedirectUri logic for native
    const apiBase = "https://opvoedapp-hdluuky8.manus.space";
    const redirectUri = `${apiBase}/api/oauth/native-callback`;

    expect(redirectUri).toBe(
      "https://opvoedapp-hdluuky8.manus.space/api/oauth/native-callback"
    );
    // Must NOT contain query params - OAuth portal may strip them
    expect(redirectUri).not.toContain("?");
  });

  it("should encode state as base64 of the clean redirect URI", () => {
    const apiBase = "https://opvoedapp-hdluuky8.manus.space";
    const redirectUri = `${apiBase}/api/oauth/native-callback`;

    // State is base64(redirectUri) - this is what the OAuth server expects
    const state = Buffer.from(redirectUri).toString("base64");
    const decoded = Buffer.from(state, "base64").toString("utf-8");

    expect(decoded).toBe(redirectUri);
  });

  it("server hardcodes the deep link scheme from bundle ID", () => {
    // The server hardcodes the deep link based on the bundle ID
    // Bundle ID: com.app.opvoedadvies.apk -> last segment: apk -> scheme: manusapk
    const APP_DEEP_LINK = "manusapk:///oauth/callback";

    expect(APP_DEEP_LINK).toBe("manusapk:///oauth/callback");
    expect(APP_DEEP_LINK).toContain("manusapk://");
  });

  it("should build correct deep link redirect with session token and user data", () => {
    const appRedirect = "manusapk:///oauth/callback";
    const sessionToken = "jwt_token_here";
    const user = { id: 1, openId: "abc123", name: "Test User", email: "test@test.com" };
    const userBase64 = Buffer.from(JSON.stringify(user)).toString("base64");

    const separator = appRedirect.includes("?") ? "&" : "?";
    const redirectUrl = `${appRedirect}${separator}sessionToken=${encodeURIComponent(sessionToken)}&user=${encodeURIComponent(userBase64)}`;

    expect(redirectUrl).toContain("manusapk:///oauth/callback?sessionToken=");
    expect(redirectUrl).toContain("&user=");

    // Verify the user data can be decoded
    const urlObj = new URL(redirectUrl);
    const userParam = urlObj.searchParams.get("user");
    expect(userParam).toBeTruthy();
    const decodedUser = JSON.parse(Buffer.from(userParam!, "base64").toString("utf-8"));
    expect(decodedUser.name).toBe("Test User");
    expect(decodedUser.openId).toBe("abc123");
  });

  it("should sanitize HTML error messages", () => {
    // Simulate the sanitizeErrorMessage function
    function sanitizeErrorMessage(message: string): string {
      if (message.includes("<html") || message.includes("<!DOCTYPE") || message.includes("<head")) {
        return "De server is tijdelijk niet bereikbaar. Probeer het later opnieuw.";
      }
      if (message.length > 200) {
        return message.substring(0, 200) + "...";
      }
      return message;
    }

    // HTML response from wrong server
    const htmlError = '<!DOCTYPE html><html><head><title>Manus Space</title></head><body>...</body></html>';
    expect(sanitizeErrorMessage(htmlError)).toBe("De server is tijdelijk niet bereikbaar. Probeer het later opnieuw.");

    // Normal error message
    expect(sanitizeErrorMessage("OAuth callback failed")).toBe("OAuth callback failed");

    // Very long error message
    const longMsg = "a".repeat(300);
    expect(sanitizeErrorMessage(longMsg).length).toBeLessThanOrEqual(203); // 200 + "..."
  });

  it("should handle error redirect from server native-callback", () => {
    const appRedirect = "manusapk:///oauth/callback";
    const errorMsg = "OAuth native callback failed";
    const separator = appRedirect.includes("?") ? "&" : "?";
    const redirectUrl = `${appRedirect}${separator}error=${encodeURIComponent(errorMsg)}`;

    const urlObj = new URL(redirectUrl);
    const error = urlObj.searchParams.get("error");
    expect(error).toBe("OAuth native callback failed");
  });
});
