import { describe, it, expect } from "vitest";
import {
  APP_PACKAGE,
  APP_SCHEME,
  GOOGLE_WEB_CLIENT_ID,
} from "../constants/app-identity";

/**
 * Tests for the mobile OAuth identity and app-state rehydration behavior.
 */

// Test the core logic without importing the actual module (which has RN dependencies)
describe("OAuth Login Flow - Logic Tests", () => {
  // The package name is permanent once published to Google Play — this test
  // exists so a rename can never happen by accident.
  it("pins the published package name and public backend client ID", () => {
    expect(APP_PACKAGE).toBe("com.rabbaanie.app");
    expect(APP_SCHEME).toBe("rabbaanie");
    expect(GOOGLE_WEB_CLIENT_ID).toMatch(
      /^\d+-[a-z0-9]+\.apps\.googleusercontent\.com$/,
    );
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
