import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * ONE invariant, no maintained list of endpoints or screens.
 *
 * Three consecutive attempts to fix the paywall each missed a different set of
 * client call sites (2 screens, then 9, then 2 more), and each time the guard
 * that was supposed to catch the omission was itself a hand-written list with
 * the same defect. The root cause was never a forgotten file: it was that 16
 * files independently built API URLs and called fetch(), so whether a request
 * carried a credential was a per-call-site accident, and gating a route
 * server-side silently 401'd whichever callers nobody remembered to audit.
 *
 * The fix is structural. Only the transport layer may call fetch() against the
 * API; everything else goes through authedFetch (has a session) or publicFetch
 * (deliberately pre-session). That makes an uncredentialed call site something
 * you have to write on purpose, rather than something you get by default.
 */

const ROOT = join(__dirname, "..");

/**
 * The transport layer itself — these legitimately construct requests, and each
 * attaches the session in its own documented way. Adding a file here means
 * claiming it owns transport; that should be rare and obvious in review.
 */
const TRANSPORT = [
  "lib/authed-fetch.ts", // authedFetch / publicFetch
  "lib/trpc.ts", // the typed tRPC client
  "lib/_core/api.ts", // apiCall(): parsed JSON, throws on !ok

  // KNOWN EXCEPTIONS, not transport. Both are pre-session routes, so routing
  // them changes nothing about auth -- but importing authed-fetch pulls in
  // lib/_core/auth, and tests/google-pkce-signin.test.ts and
  // tests/remote-config-safety.test.ts fail to parse that import chain
  // (rollup: "Expected 'from', got 'typeOf'"). Convert these two once those
  // tests mock @/lib/authed-fetch; until then the exception is written down
  // rather than silently passing.
  "lib/google-oauth.ts", // POST /auth/google/native -- pre-session
  "hooks/use-remote-config.ts", // GET /api/public/config -- public by design
];

const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = join(dir, e.name);
    if (e.isDirectory()) return e.name === "node_modules" ? [] : walk(full);
    return /\.(ts|tsx)$/.test(e.name) ? [full] : [];
  });

describe("only the transport layer talks to the API directly", () => {
  const sources = ["app", "components", "hooks", "lib", "constants"].flatMap((d) =>
    walk(join(ROOT, d)),
  );

  it("scans a meaningful number of files (guards a broken walk)", () => {
    expect(sources.length).toBeGreaterThan(50);
  });

  it("has no fetch() against the API base outside the transport layer", () => {
    const offenders: string[] = [];

    for (const file of sources) {
      const rel = file.replace(ROOT + "/", "");
      if (TRANSPORT.includes(rel)) continue;

      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, i) => {
        // OUR base only: it arrives as getApiBaseUrl() or a variable holding it.
        // Third-party bases (concepts.tsx talks to a Qur'an API via API_BASE) are
        // deliberately out of scope — this invariant is about our own auth.
        const window = lines.slice(Math.max(0, i - 3), i + 1).join("\n");
        const buildsApiUrl =
          /getApiBaseUrl\(\)|getSharedApiBaseUrl\(\)|\$\{(?:baseUrl|apiUrl)\}/.test(line);
        const isFetch = /[^a-zA-Z.]fetch\s*\(/.test(window);
        const routed = /authedFetch|publicFetch|apiCall|trpc\./.test(window);
        if (buildsApiUrl && isFetch && !routed) offenders.push(`${rel}:${i + 1}`);
      });
    }

    expect(offenders).toEqual([]);
  });
});
