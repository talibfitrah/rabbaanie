import {
  GoogleSignin,
  isSuccessResponse,
  type SignInResponse,
} from "@react-native-google-signin/google-signin";

import { GOOGLE_WEB_CLIENT_ID } from "../constants/app-identity";
import { getApiBaseUrl } from "../constants/oauth";

const GOOGLE_SIGN_IN_TIMEOUT_MS = 20_000;

export class GoogleSignInError extends Error {
  constructor(readonly reason: string, options?: ErrorOptions) {
    super(reason, options);
    this.name = "GoogleSignInError";
  }
}

let configured = false;

function configureGoogleSignIn(): void {
  if (configured) return;
  GoogleSignin.configure({
    webClientId: GOOGLE_WEB_CLIENT_ID,
    offlineAccess: false,
  });
  configured = true;
}

/**
 * Authenticate with the Android-native Google SDK and exchange the signed ID
 * token over HTTPS. Google accepts the request only from an Android OAuth
 * client registered for Rabbaanie's package and signing certificate; the API
 * independently verifies the token signature, issuer, expiry, and audience.
 */
export async function completeNativeGoogleSignIn(): Promise<string | null> {
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
    const response = await fetch(`${getApiBaseUrl()}/auth/google/native`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
      signal: controller.signal,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new GoogleSignInError(
        typeof data.error === "string" ? data.error : "google_exchange_failed",
      );
    }
    if (typeof data.sessionToken !== "string" || !data.sessionToken) {
      throw new GoogleSignInError("missing_session_token");
    }
    return data.sessionToken;
  } finally {
    clearTimeout(timeout);
  }
}
