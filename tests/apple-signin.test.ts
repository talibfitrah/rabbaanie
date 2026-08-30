import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

const mocks = vi.hoisted(() => ({
  signInAsync: vi.fn(),
}));

vi.mock("expo-apple-authentication", () => ({
  signInAsync: mocks.signInAsync,
  // Same numeric values expo ships (FULL_NAME = 0, EMAIL = 1). The lib asks for
  // both; pinning the request below proves it does.
  AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
}));
// Same transport-layer stubs the Google suite uses — publicFetch's module graph
// reaches lib/_core/auth, react-native and native storage, none of which vitest
// can parse. Stubbing them routes this file through the real transport instead
// of mocking publicFetch.
vi.mock("../constants/oauth", () => ({
  getApiBaseUrl: () => "https://api.rabbaanie.com",
}));
vi.mock("react-native", () => ({ Platform: { OS: "ios" } }));
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
vi.mock("@/hooks/use-updates", () => ({
  INSTALLED_VERSION: "1.6.9",
  CLIENT_VERSION_HEADERS: {
    "X-App-Version": "1.6.9",
    "X-App-Platform": "ios",
  },
}));

import { completeNativeAppleSignIn, AppleSignInError } from "../lib/apple-oauth";

describe("native Sign in with Apple", () => {
  it("requests the name and email scopes", async () => {
    mocks.signInAsync.mockRejectedValue(
      Object.assign(new Error("canceled"), { code: "ERR_REQUEST_CANCELED" }),
    );

    await expect(completeNativeAppleSignIn()).resolves.toBeNull();
    expect(mocks.signInAsync).toHaveBeenCalledWith({
      // FULL_NAME then EMAIL — the two scopes Apple's guideline 4.8 flow needs
      // so the server can look the user up by email on first sign-in.
      requestedScopes: [0, 1],
    });
  });

  it("sends only the signed Apple identity token to the production API", async () => {
    mocks.signInAsync.mockResolvedValue({
      identityToken: "signed-apple-identity-token",
    });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ sessionToken: "verified-session" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(completeNativeAppleSignIn()).resolves.toEqual({
      kind: "session",
      sessionToken: "verified-session",
      // A plain sign-in never creates — false regardless of what the server
      // sends. The body assertion below pins it to exactly {identityToken}.
      created: false,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.rabbaanie.com/auth/apple/native",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ identityToken: "signed-apple-identity-token" }),
      }),
    );
    vi.unstubAllGlobals();
  });

  it("does not call the API after the user cancels the Apple sheet", async () => {
    mocks.signInAsync.mockRejectedValue(
      Object.assign(new Error("The user canceled the authorization attempt"), {
        code: "ERR_REQUEST_CANCELED",
      }),
    );
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(completeNativeAppleSignIn()).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("throws a typed error when Apple returns no identity token", async () => {
    // Mirrors missing_google_id_token: Apple can return a credential whose
    // identityToken is null (a scope was denied, or a stale credential), and
    // there is nothing to verify server-side without it.
    mocks.signInAsync.mockResolvedValue({ identityToken: null });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(completeNativeAppleSignIn()).rejects.toMatchObject({
      reason: "missing_apple_identity_token",
    } satisfies Partial<AppleSignInError>);
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("preserves a safe server denial reason for localized UI", async () => {
    mocks.signInAsync.mockResolvedValue({ identityToken: "signed" });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: vi.fn().mockResolvedValue({ error: "no_account" }),
      }),
    );

    await expect(completeNativeAppleSignIn()).rejects.toMatchObject({
      reason: "no_account",
    } satisfies Partial<AppleSignInError>);
    vi.unstubAllGlobals();
  });

  it("collapses an unrecognized server error to a generic reason", async () => {
    // The reason is interpolated into a user-visible string (app/login.tsx), so
    // an allowlist gap would let arbitrary server text reach the screen.
    mocks.signInAsync.mockResolvedValue({ identityToken: "signed" });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: vi.fn().mockResolvedValue({ error: "not-an-allowlisted-code" }),
      }),
    );

    await expect(completeNativeAppleSignIn()).rejects.toMatchObject({
      reason: "apple_exchange_failed",
    } satisfies Partial<AppleSignInError>);
    vi.unstubAllGlobals();
  });

  it("wraps a non-cancel SDK rejection instead of returning null", async () => {
    // Only ERR_REQUEST_CANCELED means "user backed out". Any other rejection is
    // a real failure and must surface, not be swallowed into a null the caller
    // reads as a silent no-op.
    mocks.signInAsync.mockRejectedValue(
      Object.assign(new Error("not available"), {
        code: "ERR_REQUEST_UNKNOWN",
      }),
    );

    await expect(completeNativeAppleSignIn()).rejects.toBeInstanceOf(
      AppleSignInError,
    );
  });
});

describe("Apple sign-in button visibility", () => {
  it("shows the Apple button on iOS only", () => {
    // Whitespace-normalised for the reason the Google scanners give: a multi-
    // token source match goes red on correct code the day prettier breaks the
    // line differently, and the tempting fix is to loosen the pattern, which
    // deletes the guard.
    const login = readFileSync("app/login.tsx", "utf8").replace(/\s+/g, " ");

    // Apple requires the button on iOS 13+ because the app offers Google
    // sign-in (guideline 4.8); it must not appear on Android or web.
    expect(login).toContain("const APPLE_SIGN_IN_AVAILABLE =");
    expect(login).toContain('Platform.OS === "ios"');
    expect(login).toContain("{APPLE_SIGN_IN_AVAILABLE && (");
    // The handler exists and terminates in the shared session path.
    expect(login).toContain("completeNativeAppleSignIn(");
    expect(login).toContain("handleAppleAuth");
  });

  it("renders no Apple sign-up affordance", () => {
    // Sign in with Apple is sign-in only: the server returns 403 no_account and
    // never creates an account, so a SIGN_UP button is a guaranteed dead end.
    // Only the SIGN_IN button may render, and no createAccount path may survive.
    const login = readFileSync("app/login.tsx", "utf8");
    expect(login).toContain("AppleAuthenticationButtonType.SIGN_IN");
    expect(login).not.toContain("SIGN_UP");
    expect(login).not.toContain("offerAppleSignup");
  });
});

describe("Apple sign-in native entitlement config", () => {
  it("declares usesAppleSignIn and the applesignin entitlement", () => {
    const config = readFileSync("app.config.ts", "utf8");
    // The Expo config plugin wires the entitlement into the native project on
    // prebuild; usesAppleSignIn flips the capability on the target.
    expect(config).toContain("expo-apple-authentication");
    expect(config).toContain("usesAppleSignIn: true");
    expect(config).toContain("com.apple.developer.applesignin");
  });

  it("asserts the applesignin entitlement is PRESENT in the shipped artifact", () => {
    // A gate that only forbids lets a capability vanish silently from a merged
    // prebuild. The guard must read the applesignin entitlement and fail (via
    // missing()) when it is absent — not merely mention the word "missing", which
    // the script uses in a dozen unrelated checks. Pin the entitlement key inside
    // the block that reads it and calls missing(), so removing that check fails here.
    const gate = readFileSync("scripts/assert-ios-artifact.sh", "utf8");
    const applesignin = gate.match(
      /Print :com\.apple\.developer\.applesignin[\s\S]*?missing "com\.apple\.developer\.applesignin/,
    );
    expect(applesignin).not.toBeNull();
  });
});

describe("Apple sign-in server contract", () => {
  // The server half is built to the same contract in this repo's
  // server/web-auth.ts, next to /auth/google/native. These pin the route,
  // Apple's JWS verification, and the no-account denial so the client's result
  // mapping cannot silently drift from what the endpoint returns.
  it("verifies Apple's signed token server-side and denies unknown accounts", () => {
    const server = readFileSync("server/web-auth.ts", "utf8");
    const serverFlat = server.replace(/\s+/g, " ");
    expect(server).toContain('app.post("/auth/apple/native"');
    // The token is actually VERIFIED (not merely decoded): jose's jwtVerify
    // checks the JWS signature against Apple's published JWKS.
    expect(serverFlat).toContain("jwtVerify(identityToken, appleJwks,");
    // Audience is pinned to this app's bundle id — a token minted for any other
    // audience is rejected, which is what stops a stolen token from another app.
    expect(server).toContain('const APPLE_BUNDLE_ID = "com.rabbaanie.app"');
    expect(serverFlat).toContain("audience: APPLE_BUNDLE_ID");
    // And the algorithm is pinned, closing the alg-confusion / "none" hole.
    expect(serverFlat).toContain('algorithms: ["RS256"]');
    expect(server).toContain("no_account");
  });
});
