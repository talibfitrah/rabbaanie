import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

const mocks = vi.hoisted(() => ({
  configure: vi.fn(),
  hasPlayServices: vi.fn(),
  signIn: vi.fn(),
}));

vi.mock("@react-native-google-signin/google-signin", () => ({
  GoogleSignin: mocks,
  isSuccessResponse: (result: { type: string }) => result.type === "success",
}));
vi.mock("../constants/oauth", () => ({
  getApiBaseUrl: () => "https://api.rabbaanie.com",
}));

import {
  completeNativeGoogleSignIn,
  GoogleSignInError,
} from "../lib/google-oauth";

describe("certificate-bound Android Google sign-in", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    mocks.hasPlayServices.mockResolvedValue(true);
  });

  it("uses the web client audience and checks Play services", async () => {
    mocks.signIn.mockResolvedValue({ type: "cancelled", data: null });

    await expect(completeNativeGoogleSignIn()).resolves.toBeNull();
    expect(mocks.configure).toHaveBeenCalledWith({
      webClientId:
        "546852827424-jchq36r9vu7bjbmn7gg5198ethlk625o.apps.googleusercontent.com",
      offlineAccess: false,
    });
    expect(mocks.hasPlayServices).toHaveBeenCalledWith({
      showPlayServicesUpdateDialog: true,
    });
  });

  it("sends only the signed Google ID token to the production API", async () => {
    mocks.signIn.mockResolvedValue({
      type: "success",
      data: { idToken: "signed-google-id-token" },
    });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ sessionToken: "verified-session" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(completeNativeGoogleSignIn()).resolves.toBe(
      "verified-session",
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.rabbaanie.com/auth/google/native",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ idToken: "signed-google-id-token" }),
      }),
    );
  });

  it("does not call the API after cancellation", async () => {
    mocks.signIn.mockResolvedValue({ type: "cancelled", data: null });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(completeNativeGoogleSignIn()).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("preserves a safe server denial reason for localized UI", async () => {
    mocks.signIn.mockResolvedValue({
      type: "success",
      data: { idToken: "signed-google-id-token" },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: vi.fn().mockResolvedValue({ error: "no_account" }),
      }),
    );

    await expect(completeNativeGoogleSignIn()).rejects.toMatchObject({
      reason: "no_account",
    } satisfies Partial<GoogleSignInError>);
  });

  it("ships no browser callback scheme in the Play configuration", () => {
    const login = readFileSync("app/login.tsx", "utf8");
    const config = readFileSync("app.config.ts", "utf8");
    const identity = readFileSync("constants/app-identity.js", "utf8");

    expect(login).toContain("completeNativeGoogleSignIn()");
    expect(login).not.toContain("openAuthSessionAsync");
    expect(config).toContain("scheme: isGithubBuild ? env.scheme : undefined");
    expect(identity).not.toContain("GOOGLE_AUTH_REDIRECT_URI");
  });

  it("requires server-side Google signature and audience verification", () => {
    const server = readFileSync("server/web-auth.ts", "utf8");
    expect(server).toContain('app.post("/auth/google/native"');
    expect(server).toContain("googleTokenVerifier.verifyIdToken");
    expect(server).toContain("audience");
    expect(server).toContain("payload.email_verified !== true");
  });
});
