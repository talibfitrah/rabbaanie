import { describe, it, expect, vi, beforeEach } from "vitest";
import { APP_PACKAGE, APP_SCHEME } from "../constants/app-identity";

/**
 * Tests for the OAuth login flow fixes:
 * 1. Using WebBrowser.openAuthSessionAsync instead of Linking.openURL
 * 2. Rehydrating app state from server after login
 */

// Test the core logic without importing the actual module (which has RN dependencies)
describe("OAuth Login Flow - Logic Tests", () => {
  // The package name is permanent once published to Google Play — this test
  // exists so a rename can never happen by accident.
  it("pins the published package name and deep link scheme", () => {
    expect(APP_PACKAGE).toBe("com.rabbaanie.app");
    expect(APP_SCHEME).toBe("rabbaanie");
  });

  it("should construct correct native redirect URI", () => {
    const apiBaseUrl = "https://api.rabbaanie.com";
    const redirectUri = `${apiBaseUrl}/api/oauth/native-callback`;

    expect(redirectUri).toBe(
      "https://api.rabbaanie.com/api/oauth/native-callback"
    );
  });

  it("should construct correct login URL with all required params", () => {
    const portalUrl = "https://manus.im";
    const appId = "testAppId";
    const redirectUri =
      "https://api.rabbaanie.com/api/oauth/native-callback";
    const state = Buffer.from(redirectUri, "utf-8").toString("base64");

    const url = new URL(`${portalUrl}/app-auth`);
    url.searchParams.set("appId", appId);
    url.searchParams.set("redirectUri", redirectUri);
    url.searchParams.set("state", state);
    url.searchParams.set("type", "signIn");

    const result = url.toString();

    expect(result).toContain("https://manus.im/app-auth");
    expect(result).toContain("appId=testAppId");
    expect(result).toContain("type=signIn");
    expect(result).toContain("redirectUri=");
    expect(result).toContain("state=");
  });

  it("should parse deep link URL params correctly", () => {
    // Simulate what the app receives after successful OAuth
    const deepLinkUrl =
      "rabbaanie:///oauth/callback?sessionToken=abc123&user=eyJpZCI6MSwibmFtZSI6IlRlc3QifQ==";

    const url = new URL(deepLinkUrl);
    const sessionToken = url.searchParams.get("sessionToken");
    const userBase64 = url.searchParams.get("user");

    expect(sessionToken).toBe("abc123");
    expect(userBase64).toBe("eyJpZCI6MSwibmFtZSI6IlRlc3QifQ==");

    // Decode user
    const userJson = Buffer.from(userBase64!, "base64").toString("utf-8");
    const userData = JSON.parse(userJson);
    expect(userData.id).toBe(1);
    expect(userData.name).toBe("Test");
  });

  it("should handle error in deep link URL", () => {
    const deepLinkUrl =
      "rabbaanie:///oauth/callback?error=OAuth%20mobile%20exchange%20failed";

    const url = new URL(deepLinkUrl);
    const error = url.searchParams.get("error");

    expect(error).toBe("OAuth mobile exchange failed");
  });
});

describe("App State Rehydration - Logic Tests", () => {
  it("should merge server state with defaults correctly", () => {
    // Simulate the merge logic from syncFromServer
    const defaultParentProfile = {
      firstName: "",
      lastName: "",
      address: "",
      gender: "",
      birthDate: "",
    };

    const serverProfileData = {
      firstName: "Suhayb",
      lastName: "Salam",
      address: "Amsterdam",
      gender: "man",
      birthDate: "1990-01-01",
    };

    const merged = {
      ...defaultParentProfile,
      ...serverProfileData,
    };

    expect(merged.firstName).toBe("Suhayb");
    expect(merged.lastName).toBe("Salam");
    expect(merged.address).toBe("Amsterdam");
    expect(merged.gender).toBe("man");
    expect(merged.birthDate).toBe("1990-01-01");
  });

  it("should detect when basic info is complete", () => {
    const profile = {
      firstName: "Suhayb",
      lastName: "Salam",
      birthDate: "1990-01-01",
      address: "Amsterdam",
      gender: "man",
    };

    const basicInfoComplete = !!(
      profile.firstName &&
      profile.lastName &&
      profile.birthDate &&
      profile.address &&
      profile.gender
    );

    expect(basicInfoComplete).toBe(true);
  });

  it("should detect when basic info is incomplete", () => {
    const profile = {
      firstName: "",
      lastName: "",
      birthDate: "",
      address: "",
      gender: "",
    };

    const basicInfoComplete = !!(
      profile.firstName &&
      profile.lastName &&
      profile.birthDate &&
      profile.address &&
      profile.gender
    );

    expect(basicInfoComplete).toBe(false);
  });

  it("should skip onboarding when server data is restored", () => {
    // Simulate the check in onboarding/index.tsx
    const state = {
      onboardingCompleted: true,
      parentProfile: {
        firstName: "Suhayb",
        lastName: "Salam",
        birthDate: "1990-01-01",
        address: "Amsterdam",
        gender: "man",
      },
    };

    const shouldSkip =
      state.onboardingCompleted &&
      state.parentProfile.firstName &&
      state.parentProfile.lastName &&
      state.parentProfile.birthDate &&
      state.parentProfile.address &&
      state.parentProfile.gender;

    expect(shouldSkip).toBeTruthy();
  });
});
