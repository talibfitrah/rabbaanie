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
// publicFetch's module graph reaches lib/_core/auth, which imports react-native
// and native storage — Flow-typed source vitest cannot parse. Stubbing them is
// what let this file route through the transport layer instead of being written
// down as an exception to the transport invariant.
vi.mock("react-native", () => ({ Platform: { OS: "android" } }));
vi.mock("expo-secure-store", () => ({
  getItemAsync: vi.fn().mockResolvedValue(null),
  setItemAsync: vi.fn().mockResolvedValue(undefined),
  deleteItemAsync: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn().mockResolvedValue(null),
    setItem: vi.fn().mockResolvedValue(undefined),
    removeItem: vi.fn().mockResolvedValue(undefined),
  },
}));
// publicFetch also reads the app version from here for X-App-Version — same
// stub the other transport-layer suites use, so this doesn't reach expo-*.
vi.mock("@/hooks/use-updates", () => ({ INSTALLED_VERSION: "1.5.1" }));

import {
  completeNativeGoogleSignIn,
  GoogleSignInError,
  sanitizeErrorDetail,
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
      // A plain sign-in never creates, so this is false regardless of what the
      // server sends — the assertion below still pins the body to {idToken}.
      created: false,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.rabbaanie.com/auth/google/native",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ idToken: "signed-google-id-token" }),
      }),
    );
  });

  it("asks the server to create an account only when the user chose sign-up", async () => {
    // The pairing matters, so read this with the test above it: that one pins
    // the plain sign-in body to exactly {idToken}, which is what stops a tap on
    // "Sign in with Google" from minting an account for someone who only meant
    // to log in. This one proves the capability still exists when asked for —
    // a guard that only checks for absence would let sign-up quietly stop
    // working and still pass.
    mocks.signIn.mockResolvedValue({
      type: "success",
      data: { idToken: "signed-google-id-token" },
    });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi
        .fn()
        .mockResolvedValue({ sessionToken: "new-account-session", created: true }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      completeNativeGoogleSignIn({ createAccount: true, language: "ar" }),
    ).resolves.toEqual({
      kind: "session",
      sessionToken: "new-account-session",
      created: true,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.rabbaanie.com/auth/google/native",
      expect.objectContaining({
        body: JSON.stringify({
          idToken: "signed-google-id-token",
          createAccount: true,
          // Without this the server's normalizeLang(undefined) defaults the
          // account to English, so an Arabic or Dutch user gets English mail
          // and push until they change the setting again.
          language: "ar",
        }),
      }),
    );
  });

  it("reports what the SERVER did, not what the client asked for", () => {
    // The account picker reopens on every call, so a user who taps "Create
    // account with Google" can still pick an account that already exists. The
    // server answers created:false there, and the screen must believe the
    // server — keying an "empty slate" reset on the request flag wipes a real
    // profile and then syncs the empty one back.
    return (async () => {
      mocks.signIn.mockResolvedValue({
        type: "success",
        data: { idToken: "signed-google-id-token" },
      });
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          sessionToken: "existing-account-session",
          created: false,
        }),
      }));

      await expect(
        completeNativeGoogleSignIn({ createAccount: true }),
      ).resolves.toEqual({
        kind: "session",
        sessionToken: "existing-account-session",
        created: false,
      });
    })();
  });

  it("treats a server that omits `created` as NOT having created", () => {
    // Fail closed: an older API answers {sessionToken} with no `created`. The
    // destructive branch is the reset, so absence must mean "signed in".
    return (async () => {
      mocks.signIn.mockResolvedValue({
        type: "success",
        data: { idToken: "signed-google-id-token" },
      });
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ sessionToken: "s" }),
      }));

      const result = await completeNativeGoogleSignIn({ createAccount: true });
      expect(result).toEqual({ kind: "session", sessionToken: "s", created: false });
    })();
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

  it("collapses an unrecognized server error to the generic reason", async () => {
    // The reason ends up interpolated into a user-visible string (app/login.tsx),
    // so an allowlist gap here would let arbitrary server text reach the screen.
    mocks.signIn.mockResolvedValue({
      type: "success",
      data: { idToken: "signed-google-id-token" },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: vi.fn().mockResolvedValue({ error: "not-an-allowlisted-code" }),
      }),
    );

    await expect(completeNativeGoogleSignIn()).rejects.toMatchObject({
      reason: "google_exchange_failed",
    } satisfies Partial<GoogleSignInError>);
  });

  it("ships no browser callback scheme in the Play configuration", () => {
    const login = readFileSync("app/login.tsx", "utf8");
    const config = readFileSync("app.config.ts", "utf8");
    const identity = readFileSync("constants/app-identity.js", "utf8");

    // The call, not its argument list: the invariant is that this screen
    // authenticates through the native SDK rather than a browser redirect, and
    // that is equally true whether or not sign-up options are passed. Pinning
    // the empty parens made a signature change look like a security regression.
    expect(login).toContain("completeNativeGoogleSignIn(");
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

describe("sanitizeErrorDetail", () => {
  it("passes short known-safe codes through unchanged", () => {
    expect(sanitizeErrorDetail("10")).toBe("10");
    expect(sanitizeErrorDetail("missing_google_id_token")).toBe(
      "missing_google_id_token",
    );
    expect(sanitizeErrorDetail("AbortError")).toBe("AbortError");
  });

  it("strips separators so no email or URL shape can survive", () => {
    expect(sanitizeErrorDetail("daa3iyah@gmail.com")).toBe("daa3iyahgmailcom");
    expect(sanitizeErrorDetail("https://evil.example/steal?t=1")).toBe(
      "httpsevilexamplestealt1",
    );
  });

  it("caps length at 40 characters", () => {
    const result = sanitizeErrorDetail("a".repeat(100));
    expect(result).toHaveLength(40);
  });

  it("falls back to a fixed string only when nothing alphanumeric survives", () => {
    expect(sanitizeErrorDetail("   ")).toBe("unknown");
    expect(sanitizeErrorDetail("@@@###")).toBe("unknown");
    // String(undefined) is the literal word "undefined" — itself alnum, so
    // it survives the filter rather than triggering the empty-string fallback.
    expect(sanitizeErrorDetail(undefined)).toBe("undefined");
  });
});
