import {
  GoogleSignin,
  isSuccessResponse,
  type SignInResponse,
} from "@react-native-google-signin/google-signin";

import {
  GOOGLE_IOS_CLIENT_ID,
  GOOGLE_WEB_CLIENT_ID,
} from "../constants/app-identity";
import { publicFetch } from "@/lib/authed-fetch";

const GOOGLE_SIGN_IN_TIMEOUT_MS = 20_000;

export class GoogleSignInError extends Error {
  constructor(readonly reason: string, options?: ErrorOptions) {
    super(reason, options);
    this.name = "GoogleSignInError";
  }
}

/**
 * Clamp a sign-in error reason to something safe to interpolate into the
 * user-visible "Google sign-in failed" message (app/login.tsx): short, no
 * separators, never empty. `GoogleSignInError.reason` is already allowlisted
 * at the source below for the server-response case, so this is the second,
 * cheap layer — it mainly guards the one caller-side value that isn't
 * source-constrained (a raw JS error's `.name`, safe by origin, not by
 * allowlist), and keeps a future non-GoogleSignInError source from putting
 * an email/URL shape on screen even if it isn't added to an allowlist.
 * ponytail: the allowed charset (A-Za-z0-9_-) is also base64url's alphabet,
 * so a token-shaped value would pass through unstripped (just truncated to
 * 40 chars) — not reachable today (every current source is a bounded SDK
 * code, a fixed literal, or the allowlisted server codes), but if a future
 * source of `raw` could carry a token, widen this to an allowlist like
 * KNOWN_GOOGLE_EXCHANGE_ERRORS instead of trusting the charset filter alone.
 */
export function sanitizeErrorDetail(raw: unknown): string {
  return String(raw).replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40) || "unknown";
}

// The exact set server/web-auth.ts's /auth/google/native route can send as
// `error` today. Allowlisted, not just type-checked: `data.error` is server
// text reaching a user-visible string (login.tsx interpolates
// GoogleSignInError.reason into the sign-in-failed message), so a future
// route change that starts returning something less generic — a raw
// exception message, an email, anything with more shape than a status code
// — doesn't quietly become user-visible. Add new codes here when the route
// adds them; anything else collapses to the existing generic fallback.
const KNOWN_GOOGLE_EXCHANGE_ERRORS = new Set([
  "invalid_google_token",
  "google_signin_unavailable",
  "database_unavailable",
  "no_account",
  "admin_2fa_required",
]);

let configured = false;

function configureGoogleSignIn(): void {
  if (configured) return;
  GoogleSignin.configure({
    webClientId: GOOGLE_WEB_CLIENT_ID,
    // iOS only, and only when the client id exists. The native module rejects
    // configure() outright when neither `iosClientId` nor a
    // GoogleService-Info.plist is present (RNGoogleSignin.mm:78), and that
    // rejection surfaces at signIn() — GoogleSignin.ts:55 awaits the stored
    // config promise. Passing "" is not the same as omitting it: the native
    // check is `options[@"iosClientId"]` truthiness on the JS bridge value, so
    // an empty string still takes the branch and hands GIDSignIn no client.
    // app/login.tsx keeps the button hidden in that state, so this is the
    // second layer, not the only one.
    ...(GOOGLE_IOS_CLIENT_ID ? { iosClientId: GOOGLE_IOS_CLIENT_ID } : {}),
    offlineAccess: false,
  });
  configured = true;
}

/**
 * Either a finished session, or an admin who still owes a second factor. Google
 * proving the identity is not enough for a privileged account: the API refuses
 * the session (403) and returns a challenge in the same body, and the session
 * that challenge eventually buys is the only one stamped with the 2FA time the
 * admin surfaces check. `factor` says where the code came from — an emailed
 * code for admins with no authenticator, which is most of them.
 */
export type NativeGoogleSignInResult =
  | {
      kind: "session";
      sessionToken: string;
      /**
       * Whether the SERVER created the account on this call — never what the
       * caller asked for. signIn() re-opens the account picker every time, so a
       * user who tapped "Create account with Google" can still select an
       * account that already exists; the server signs them in and answers
       * false. Treating the request flag as the answer wipes a real profile.
       */
      created: boolean;
    }
  | { kind: "twoFactor"; challengeToken: string; factor: "app" | "email" };

/**
 * Authenticate with the Android-native Google SDK and exchange the signed ID
 * token over HTTPS. Google accepts the request only from an Android OAuth
 * client registered for Rabbaanie's package and signing certificate; the API
 * independently verifies the token signature, issuer, expiry, and audience.
 *
 * Returns null when the user backed out of the Google picker.
 *
 * `createAccount` is the sign-up path and is opt-in for a reason: the flag is
 * what lets the server mint an account for an identity it has never seen, so a
 * tap on "Sign in with Google" must never carry it. The default omits the field
 * entirely rather than sending false, so a server that predates it behaves
 * identically for sign-in.
 */
export async function completeNativeGoogleSignIn(
  options: { createAccount?: boolean; language?: string } = {},
): Promise<NativeGoogleSignInResult | null> {
  configureGoogleSignIn();
  let result: SignInResponse;
  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    // Drop the account the SDK cached from the last session. Without this,
    // signIn() silently reuses it and someone who logged out can never reach
    // the account picker to choose a different Google account.
    await GoogleSignin.signOut().catch((err: unknown) => {
      // Never block sign-in on this, but don't hide it either: if clearing
      // fails, the picker will not appear and the original bug is back.
      console.warn("[GoogleSignIn] could not clear cached account:", err);
    });
    result = await GoogleSignin.signIn();
  } catch (err: any) {
    // Play services rejected the app itself, before any token exists — most
    // often the package + signing certificate is not registered as an Android
    // OAuth client under GOOGLE_WEB_CLIENT_ID's project. The native module
    // reports that one as code "10" with the readable name only in the message
    // (RNGoogleSigninModule.java:169), so keep the original as `cause` — the
    // console log is where this gets diagnosed, not the user-facing banner.
    throw new GoogleSignInError(String(err?.code ?? "google_sdk_error"), {
      cause: err,
    });
  }
  if (!isSuccessResponse(result)) return null;

  const idToken = result.data.idToken;
  if (!idToken) throw new GoogleSignInError("missing_google_id_token");

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    GOOGLE_SIGN_IN_TIMEOUT_MS,
  );
  try {
    const response = await publicFetch("/auth/google/native", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        options.createAccount
          ? { idToken, createAccount: true, language: options.language }
          : { idToken },
      ),
      signal: controller.signal,
    });
    const data = await response.json().catch(() => ({}));
    // An admin is refused a session (403) but handed a 2FA challenge
    // in the same body. This has to be read before the !response.ok throw, or
    // the challenge is discarded and an owner signing in with Google has no
    // route into the app at all. A server that has not shipped the challenge
    // yet sends the same 403 without these fields and still throws below.
    // Length-checked, not just typed: an empty string would set the challenge
    // to a falsy value, so the code field never renders and the admin is left
    // with a "we sent you a code" message and nothing to type it into.
    if (data.requires2FA && typeof data.challengeToken === "string" && data.challengeToken) {
      return {
        kind: "twoFactor",
        challengeToken: data.challengeToken,
        // Default to "app", not "email": a server that omits `factor` predates
        // the email factor, and those only ever challenge admins who DO have an
        // authenticator enrolled. Defaulting to email would sit that admin
        // waiting for a mail that is never sent.
        factor: data.factor === "email" ? "email" : "app",
      };
    }
    if (!response.ok) {
      throw new GoogleSignInError(
        typeof data.error === "string" && KNOWN_GOOGLE_EXCHANGE_ERRORS.has(data.error)
          ? data.error
          : "google_exchange_failed",
      );
    }
    if (typeof data.sessionToken !== "string" || !data.sessionToken) {
      throw new GoogleSignInError("missing_session_token");
    }
    // Strict true, so a server that predates the field, or sends anything but
    // a real boolean, reads as "signed in" — the non-destructive branch.
    return {
      kind: "session",
      sessionToken: data.sessionToken,
      created: data.created === true,
    };
  } finally {
    clearTimeout(timeout);
  }
}
