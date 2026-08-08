import { getApiBaseUrl } from "@/constants/oauth";
import * as Auth from "@/lib/_core/auth";

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

  return fetch(url, {
    ...init,
    credentials: "include",
    headers: {
      ...(init?.headers as Record<string, string> | undefined),
      // Omitted entirely when signed out — "Bearer null" reads as a malformed
      // credential, which the server rejects differently from no credential.
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
}
