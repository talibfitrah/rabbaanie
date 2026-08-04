import {
  GoogleSignin,
  isSuccessResponse,
} from "@react-native-google-signin/google-signin";

import { GOOGLE_WEB_CLIENT_ID } from "../constants/app-identity";
import { getApiBaseUrl } from "../constants/oauth";

const GOOGLE_SIGN_IN_TIMEOUT_MS = 20_000;

export class GoogleSignInError extends Error {
  constructor(readonly reason: string) {
    super(reason);
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
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  const result = await GoogleSignin.signIn();
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

/** Retained for logout-state cleanup call sites; no bearer is cached here. */
export function clearGoogleOAuthExchange(): void {}
