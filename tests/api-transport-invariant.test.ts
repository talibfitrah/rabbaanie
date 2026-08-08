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
        // Both halves are matched over the SAME window. Testing the URL on the
        // current line only meant a file that built `const url = ...` on one
        // line and called `fetch(url)` two lines later tripped neither half —
        // that is how lib/weekly-data.ts kept two bare fetches through the
        // original invariant. A bare "/api/..." path counts as ours too:
        // lib/activity-tracker.ts fetched a relative URL with no base at all.
        // Symmetric: three lines either side. Looking only BACKWARDS caught
        // `const url = …` above a fetch but not the far more ordinary
        // `fetch(\n  `${getApiBaseUrl()}/api/…`,\n)` — the URL sits on the line
        // AFTER the fetch, and neither half of the test saw it.
        const window = lines.slice(Math.max(0, i - 3), i + 4).join("\n");
        const buildsApiUrl =
          /getApiBaseUrl\(\)|getSharedApiBaseUrl\(\)|\$\{(?:baseUrl|apiUrl)\}/.test(window) ||
          /["'`]\/api\//.test(window) ||
          // The base spelled out instead of resolved. getApiBaseUrl() returns
          // exactly this host in native builds, so a hardcoded copy is the same
          // uncredentialed call with the indirection removed — and it matched
          // none of the patterns above.
          /api\.rabbaanie\.com/.test(window);
        const isFetch = /[^a-zA-Z.]fetch\s*\(/.test(line);
        // Judged on the fetch's OWN line. Over the window, one legitimate
        // publicFetch call would vouch for every raw fetch within three lines
        // of it — the wider window that fixed buildsApiUrl weakened this in the
        // same stroke. A routed call names its wrapper on the calling line.
        const routed = /authedFetch|publicFetch|apiCall|trpc\./.test(line);
        if (buildsApiUrl && isFetch && !routed) offenders.push(`${rel}:${i + 1}`);
      });
    }

    expect(offenders).toEqual([]);
  });
});
