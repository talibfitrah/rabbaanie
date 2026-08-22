import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

/**
 * React Query results are persisted to ONE device-global AsyncStorage key
 * ("rq_offline_cache", lib/query-persistence.ts) with no account scoping, for
 * up to 7 days, and restoreQueryCache loads them into whoever opens the app
 * next. Logout cleared the session token and the cached user info, but never
 * the query cache — and clearPersistedQueryCache existed with no caller at
 * all. The next account on a shared device rendered the previous account's
 * data, which now includes full partner profiles from behind the access gate:
 * psychologist notes, children, issues.
 *
 * There are TWO paths that end a session and both must wipe both caches: the
 * normal logout(), and the isLogoutPending() recovery on the next app start
 * for a logout that crashed part-way.
 *
 * Anchored on the identifiers rather than on copy or call order, so renaming a
 * local or reordering the two wipes still passes. Asserts PRESENCE: a gate that
 * only checked these were absent would let the whole capability vanish
 * silently.
 *
 * WHAT THIS DOES NOT CHECK, stated because the obvious refactor defeats it:
 * it is lexical. Extracting the pair into a shared `wipeSession()` helper and
 * calling that from both paths preserves the invariant but fails this test,
 * and the tempting fix then is to loosen the regex, which removes the guard.
 * If you do extract it, re-point these two assertions at the helper's own body
 * and assert both paths call it — do not soften them into a whole-file search,
 * which would pass even if one path stopped wiping.
 */
const AUTH = readFileSync(
  join(__dirname, "..", "lib", "auth-context.tsx"),
  "utf8",
);

/** The body of the function/branch starting at `from`, by brace depth. */
function blockAfter(src: string, from: number): string {
  const start = src.indexOf("{", from);
  if (start === -1) return "";
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  return src.slice(start);
}

describe("ending a session wipes cached query data, not just credentials", () => {
  it("logout() clears the in-memory cache and the persisted copy", () => {
    const at = AUTH.indexOf("const logout = useCallback");
    expect(at).toBeGreaterThan(-1);
    const body = blockAfter(AUTH, at);

    expect(body).toMatch(/queryClient\s*\.\s*clear\s*\(/);
    expect(body).toMatch(/clearPersistedQueryCache\s*\(/);
  });

  it("the crash-recovery path (isLogoutPending) wipes them too", () => {
    const at = AUTH.indexOf("isLogoutPending()");
    expect(at).toBeGreaterThan(-1);
    const body = blockAfter(AUTH, at);

    expect(body).toMatch(/queryClient\s*\.\s*clear\s*\(/);
    expect(body).toMatch(/clearPersistedQueryCache\s*\(/);
  });

  it("clearPersistedQueryCache is still exported and still targets the shared key", () => {
    // The wipe above is only real if the function it calls still removes the
    // key restoreQueryCache reads. Both sides asserted so renaming the key in
    // one place alone cannot pass.
    const persistence = readFileSync(
      join(__dirname, "..", "lib", "query-persistence.ts"),
      "utf8",
    );
    expect(persistence).toMatch(
      /export async function clearPersistedQueryCache/,
    );
    const key = persistence.match(
      /const QUERY_CACHE_KEY\s*=\s*"([^"]+)"/,
    )?.[1];
    expect(key).toBeTruthy();
    expect(
      blockAfter(
        persistence,
        persistence.indexOf("export async function clearPersistedQueryCache"),
      ),
    ).toContain("QUERY_CACHE_KEY");
    expect(persistence).toContain(`getItem(QUERY_CACHE_KEY)`);
  });
});

/**
 * The two paths above only wipe a session that ENDS cleanly through this
 * app's own logout()/crash-recovery. Neither one runs when a session simply
 * stops (the app is force-closed, backgrounded and killed by the OS, or the
 * token just expires) with no logout() call at all — the persisted cache
 * survives untouched, and restoreQueryCache (app/_layout.tsx, fired once at
 * app boot, before any auth check) injects it into the query client
 * regardless of who signs in next.
 *
 * completeTokenSignIn (lib/auth-context.tsx) is the ONLY place a session
 * actually starts — app/login.tsx calls it after both password and Google
 * sign-in, and app/register.tsx calls it after registration — so it is the
 * one place a NEW session can guarantee a clean cache regardless of how the
 * previous one ended. It currently does not: it writes the new token/user
 * info straight into the existing queryClient, so a stale
 * links.getPartnerProfile entry from whoever was last signed in on this
 * device (tRPC's query key carries no user id) is served to the new account
 * until its own refetch happens to land. On the family screen that entry
 * carries private fields — gender, and for an ungated husband the wife's
 * full profile (psychologist notes, children, issues) — shown as if it were
 * the new account's own partner.
 *
 * Same lexical-anchoring approach and same caveat as the block above: this
 * is a presence check on completeTokenSignIn's own body, not a call-graph
 * search — extracting the wipe into a shared helper preserves the invariant
 * but fails this test, and the fix then is to re-point it at the helper.
 */
describe("starting a session wipes any stale cached query data left on the device", () => {
  it("completeTokenSignIn() clears the in-memory cache and the persisted copy before the new session is live", () => {
    const at = AUTH.indexOf("const completeTokenSignIn = useCallback");
    expect(at).toBeGreaterThan(-1);
    const body = blockAfter(AUTH, at);

    expect(body).toMatch(/queryClient\s*\.\s*clear\s*\(/);
    expect(body).toMatch(/clearPersistedQueryCache\s*\(/);
  });
});
