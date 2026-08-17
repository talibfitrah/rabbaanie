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
 * Anchored on the identifiers, not on copy or call order, so extracting the
 * pair into a shared helper or reordering the wipe still passes — as long as
 * both paths still perform it. Asserts PRESENCE: a gate that only checked
 * these were absent would let the whole capability vanish silently.
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
