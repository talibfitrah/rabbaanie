import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

const mocks = vi.hoisted(() => ({
  configure: vi.fn(),
  hasPlayServices: vi.fn(),
  signOut: vi.fn(),
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
    mocks.signOut.mockResolvedValue(undefined);
  });

  it("uses the web client audience and checks Play services", async () => {
    // configure() runs once per module load, so re-import on a clean registry
    // instead of relying on this test running first.
    vi.resetModules();
    const { completeNativeGoogleSignIn: freshSignIn } = await import(
      "../lib/google-oauth"
    );
    mocks.signIn.mockResolvedValue({ type: "cancelled", data: null });

    await expect(freshSignIn()).resolves.toBeNull();
    expect(mocks.configure).toHaveBeenCalledWith({
      webClientId:
        "546852827424-jchq36r9vu7bjbmn7gg5198ethlk625o.apps.googleusercontent.com",
      offlineAccess: false,
    });
    expect(mocks.hasPlayServices).toHaveBeenCalledWith({
      showPlayServicesUpdateDialog: true,
    });
  });

  it("clears the cached account before signing in so the picker appears", async () => {
    mocks.signIn.mockResolvedValue({ type: "cancelled", data: null });

    await completeNativeGoogleSignIn();

    expect(mocks.signOut).toHaveBeenCalled();
    expect(mocks.signOut.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.signIn.mock.invocationCallOrder[0],
    );
  });

  it("signs in even when clearing the cached account fails", async () => {
    mocks.signOut.mockRejectedValue(new Error("no user signed in"));
    mocks.signIn.mockResolvedValue({ type: "cancelled", data: null });

    await expect(completeNativeGoogleSignIn()).resolves.toBeNull();
    expect(mocks.signIn).toHaveBeenCalled();
  });

  // DEVELOPER_ERROR arrives as code "10" with the readable name only in the
  // message, so the original error has to survive as `cause` to be diagnosable.
  it("wraps an SDK rejection as GoogleSignInError keeping the original", async () => {
    const native = Object.assign(new Error("DEVELOPER_ERROR: see docs"), {
      code: "10",
    });
    mocks.signIn.mockRejectedValue(native);

    await expect(completeNativeGoogleSignIn()).rejects.toMatchObject({
      reason: "10",
      cause: native,
    });
  });

  it("wraps a Play services failure before sign-in is attempted", async () => {
    mocks.hasPlayServices.mockRejectedValue(
      Object.assign(new Error("Play services not available"), {
        code: "PLAY_SERVICES_NOT_AVAILABLE",
      }),
    );

    await expect(completeNativeGoogleSignIn()).rejects.toMatchObject({
      reason: "PLAY_SERVICES_NOT_AVAILABLE",
    });
    expect(mocks.signIn).not.toHaveBeenCalled();
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

    await expect(completeNativeGoogleSignIn()).resolves.toEqual({
      kind: "session",
      sessionToken: "verified-session",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.rabbaanie.com/auth/google/native",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ idToken: "signed-google-id-token" }),
      }),
    );
  });

  // An admin is refused a session but handed a challenge, in a 403.
  // If the !response.ok throw is ever moved above the requires2FA check the
  // challenge is dropped and the owner has no route into the app with Google —
  // which is exactly how this bug presented.
  it("surfaces the 2FA challenge an admin gets instead of a session", async () => {
    mocks.signIn.mockResolvedValue({
      type: "success",
      data: { idToken: "signed-google-id-token" },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: vi.fn().mockResolvedValue({
          error: "admin_2fa_required",
          requires2FA: true,
          challengeToken: "chal-1",
          factor: "email",
        }),
      }),
    );

    await expect(completeNativeGoogleSignIn()).resolves.toEqual({
      kind: "twoFactor",
      challengeToken: "chal-1",
      factor: "email",
    });
  });

  // A server that sends a challenge but no `factor` predates the email factor,
  // and those only ever challenge admins who DO have an authenticator. So the
  // safe default is "app" — defaulting to email would sit that admin waiting
  // for a mail no server was ever going to send.
  it("defaults an unlabelled challenge to the authenticator factor", async () => {
    mocks.signIn.mockResolvedValue({
      type: "success",
      data: { idToken: "signed-google-id-token" },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: vi
          .fn()
          .mockResolvedValue({ requires2FA: true, challengeToken: "chal-2" }),
      }),
    );

    await expect(completeNativeGoogleSignIn()).resolves.toMatchObject({
      factor: "app",
    });
  });

  // A server that predates the challenge sends the same 403 with only `error`.
  // The app must keep showing the "use email and password" route, not a
  // generic failure, for the whole window before the API is deployed.
  it("keeps the email fallback message when the API sends no challenge", async () => {
    mocks.signIn.mockResolvedValue({
      type: "success",
      data: { idToken: "signed-google-id-token" },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: vi.fn().mockResolvedValue({ error: "admin_2fa_required" }),
      }),
    );

    await expect(completeNativeGoogleSignIn()).rejects.toMatchObject({
      reason: "admin_2fa_required",
    });
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
