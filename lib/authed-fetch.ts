import { getApiBaseUrl } from "@/constants/oauth";
import * as Auth from "@/lib/_core/auth";
import { CLIENT_VERSION_HEADERS } from "@/hooks/use-updates";
import { markIfVersionBlocked } from "@/lib/app-version";

/**
 * fetch() against our API with the caller's session attached.
 *
 * Every paid route needs the server to know who is asking — it cannot enforce
 * the membership on an anonymous caller. Attaching the credential in one place
 * is what stops a new call site from silently reintroducing the bug this was
 * written for: the AI and advice endpoints shipped answering anyone at all,
 * because each screen called bare fetch() (see
 * local-docs/FINDING-server-paywall-unenforced.md).
 *
 * Bearer token for native, cookie for web — the same pair subscriptionFetch
 * has used since that identical bug hit /api/subscription/*. Returns the raw
 * Response so callers keep their own status and error handling; use apiCall()
 * in lib/_core/api.ts instead when you want parsed JSON and throw-on-error.
 */
export async function authedFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = await Auth.getSessionToken();
  const base = getApiBaseUrl();
  const url = /^https?:\/\//.test(path)
    ? path
    : `${base}${path.startsWith("/") ? path : `/${path}`}`;

  const response = await fetch(url, {
    ...init,
    credentials: "include",
    headers: {
      ...(init?.headers as Record<string, string> | undefined),
      ...CLIENT_VERSION_HEADERS,
      // Omitted entirely when signed out — "Bearer null" reads as a malformed
      // credential, which the server rejects differently from no credential.
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  markIfVersionBlocked(response.status);
  return response;
}

/**
 * Plain wording for the two rejections the paid routes now return, in the
 * app's three languages. Returns null for anything else so callers keep their
 * existing "network problem" handling.
 *
 * Without this a refused caller gets silence: the screens check for their
 * expected payload shape (`if (data.tips)`, `if (result.plan)`), and an error
 * body matches nothing, so no branch runs and no catch fires — the feature
 * simply appears to do nothing at all.
 */
export function accessDeniedMessage(status: number, lang: string): string | null {
  if (status === 401) {
    if (lang === "ar") return "انتهت جلستك. يرجى تسجيل الدخول مرة أخرى للمتابعة.";
    if (lang === "en") return "Your session has ended. Please sign in again to continue.";
    return "Je sessie is verlopen. Log opnieuw in om verder te gaan.";
  }
  if (status === 403) {
    if (lang === "ar") return "هذه الخدمة متاحة للمشتركين. يرجى تجديد اشتراكك للمتابعة.";
    if (lang === "en") return "This service is for members. Please renew your membership to continue.";
    return "Deze dienst is voor leden. Vernieuw je lidmaatschap om verder te gaan.";
  }
  return null;
}

/**
 * fetch() against our API for the routes a caller reaches BEFORE they have a
 * session: sign-in, registration, password reset, the OAuth handshake, public
 * config. Identical URL handling to authedFetch, deliberately no credential.
 *
 * It exists so that "this call is unauthenticated" is a decision someone wrote
 * down, not the default you get by reaching for bare fetch(). Three separate
 * rounds of the paywall fix each missed a different set of call sites, because
 * 16 files independently decided how to talk to the API and auth was a
 * per-call-site accident. Every API call now goes through one of these two, and
 * tests/api-transport-invariant.test.ts enforces it.
 */
export async function publicFetch(path: string, init?: RequestInit): Promise<Response> {
  const base = getApiBaseUrl();
  const url = /^https?:\/\//.test(path)
    ? path
    : `${base}${path.startsWith("/") ? path : `/${path}`}`;
  const response = await fetch(url, {
    ...init,
    credentials: "include",
    headers: {
      ...(init?.headers as Record<string, string> | undefined),
      ...CLIENT_VERSION_HEADERS,
    },
  });
  markIfVersionBlocked(response.status);
  return response;
}
