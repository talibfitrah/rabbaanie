import * as AppleAuthentication from "expo-apple-authentication";

import { publicFetch } from "@/lib/authed-fetch";
import type { NativeGoogleSignInResult } from "@/lib/google-oauth";

const APPLE_SIGN_IN_TIMEOUT_MS = 20_000;

export class AppleSignInError extends Error {
  constructor(readonly reason: string, options?: ErrorOptions) {
    super(reason, options);
    this.name = "AppleSignInError";
  }
}

// The exact set /auth/apple/native can send as `error`. Allowlisted, not just
// typed, for the same reason the Google lib allowlists its codes: `data.error`
// is server text that reaches a user-visible string (app/login.tsx interpolates
// AppleSignInError.reason into the sign-in-failed message), so a future route
// change returning something with more shape than a status code does not
// quietly become user-visible. Add new codes here when the route adds them.
const KNOWN_APPLE_EXCHANGE_ERRORS = new Set([
  "invalid_apple_token",
  "apple_signin_unavailable",
  "database_unavailable",
  "no_account",
  "email_account",
  "admin_2fa_required",
]);

/**
 * Authenticate with native Sign in with Apple and exchange the signed identity
 * token over HTTPS. Apple issues the JWS to the app's bundle id
 * (com.rabbaanie.app), which is exactly what the server verifies the token's
 * `aud` against — so no Services ID is needed for the native flow.
 *
 * Returns null when the user backs out of the Apple sheet.
 *
 * Mirrors completeNativeGoogleSignIn: the same `{ createAccount?, language? }`
 * options, the same request-body shape (with `identityToken` in place of
 * `idToken`), and the SAME result union, so app/login.tsx reuses the Google
 * result handling unchanged. `createAccount` is opt-in for the same reason: a
 * tap on "Sign in with Apple" must never carry the flag that lets the server
 * mint an account for an identity it has never seen. The default omits the
 * field rather than sending false.
 */
export async function completeNativeAppleSignIn(
  options: { createAccount?: boolean; language?: string } = {},
): Promise<NativeGoogleSignInResult | null> {
  let credential: AppleAuthentication.AppleAuthenticationCredential;
  try {
    credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });
  } catch (err: any) {
    // The one code that means "user backed out", mirroring the Google cancel
    // path that returns null. Anything else is a real failure and must surface.
    if (err?.code === "ERR_REQUEST_CANCELED") return null;
    throw new AppleSignInError(String(err?.code ?? "apple_sdk_error"), {
      cause: err,
    });
  }

  const identityToken = credential.identityToken;
  if (!identityToken) throw new AppleSignInError("missing_apple_identity_token");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), APPLE_SIGN_IN_TIMEOUT_MS);
  try {
    const response = await publicFetch("/auth/apple/native", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        options.createAccount
          ? { identityToken, createAccount: true, language: options.language }
          : { identityToken },
      ),
      signal: controller.signal,
    });
    const data = await response.json().catch(() => ({}));
    // An admin is refused a session (403) but handed a 2FA challenge in the same
    // body — read before the !response.ok throw, or the challenge is discarded
    // and an owner signing in with Apple has no route into the app. Mirrors the
    // Google path exactly; a server that has not shipped the challenge sends the
    // same 403 without these fields and still throws below.
    if (
      data.requires2FA &&
      typeof data.challengeToken === "string" &&
      data.challengeToken
    ) {
      return {
        kind: "twoFactor",
        challengeToken: data.challengeToken,
        factor: data.factor === "email" ? "email" : "app",
      };
    }
    if (!response.ok) {
      throw new AppleSignInError(
        typeof data.error === "string" &&
        KNOWN_APPLE_EXCHANGE_ERRORS.has(data.error)
          ? data.error
          : "apple_exchange_failed",
      );
    }
    if (typeof data.sessionToken !== "string" || !data.sessionToken) {
      throw new AppleSignInError("missing_session_token");
    }
    // Strict true, so a server that predates the field reads as "signed in" —
    // the non-destructive branch, same as the Google lib.
    return {
      kind: "session",
      sessionToken: data.sessionToken,
      created: data.created === true,
    };
  } finally {
    clearTimeout(timeout);
  }
}
