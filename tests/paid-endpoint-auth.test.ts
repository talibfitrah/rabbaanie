import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Regression guard for the finding of 2026-08-06
 * (local-docs/FINDING-server-paywall-unenforced.md): the paid AI and advice
 * endpoints answered anonymous callers, because the client never sent a
 * credential on them — `grep -c Authorization` was 0 in both screens. The
 * server cannot enforce the €12/yr membership on a caller it cannot identify,
 * so this client half is a precondition for the server check, not a nicety.
 *
 * The same class of bug already shipped once on /api/subscription/* (see
 * tests/subscription-auth.test.ts), which is why the fix is one shared helper
 * and the source-level guards below exist: a new bare fetch() to an API path
 * is what reintroduces it.
 */

vi.mock("@/constants/oauth", () => ({
  getApiBaseUrl: () => "https://api.example.com",
}));

const getSessionToken = vi.fn();
vi.mock("@/lib/_core/auth", () => ({ getSessionToken: () => getSessionToken() }));

describe("authedFetch", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);
    getSessionToken.mockResolvedValue("tok-123");
  });
  afterEach(() => vi.unstubAllGlobals());

  const load = async () => (await import("@/lib/authed-fetch")).authedFetch;

  it("sends the bearer token so the server can identify the caller", async () => {
    const authedFetch = await load();
    await authedFetch("/api/advice/general", { method: "POST" });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.example.com/api/advice/general");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok-123");
  });

  it("keeps the caller's headers, method and body when merging", async () => {
    const authedFetch = await load();
    await authedFetch("/api/trpc/aiChat.sendMessage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });

    const init = fetchMock.mock.calls[0][1];
    expect(init.method).toBe("POST");
    expect(init.body).toBe("{}");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok-123");
  });

  it("omits the header rather than sending 'Bearer null' when logged out", async () => {
    getSessionToken.mockResolvedValue(null);
    const authedFetch = await load();
    await authedFetch("/api/advice/general");

    const init = fetchMock.mock.calls[0][1];
    expect("Authorization" in (init.headers as Record<string, string>)).toBe(false);
  });

  it("sends cookies too, so the web build authenticates without a bearer", async () => {
    const authedFetch = await load();
    await authedFetch("/api/advice/general");

    expect(fetchMock.mock.calls[0][1].credentials).toBe("include");
  });

  it("accepts a path with or without the leading slash", async () => {
    const authedFetch = await load();
    await authedFetch("api/advice/general");

    expect(fetchMock.mock.calls[0][0]).toBe("https://api.example.com/api/advice/general");
  });
});

/**
 * Repo-wide, NOT a hand-listed set of screens. An earlier version of this file
 * checked only the two screens the finding doc happened to name; nine other
 * call sites to the same gated endpoints were invisible to it, shipped
 * uncredentialed, and took the paid features down for real subscribers the
 * moment the server started enforcing. The list is the bug — scan instead.
 */
describe("no screen calls a paid API endpoint unauthenticated", () => {
  const ROOT = join(__dirname, "..");
  const DIRS = ["app", "components", "hooks", "lib"];

  /** Endpoints the server gates. A bare fetch() to any of them returns 401. */
  const GATED = [
    "/api/advice/general",
    "/api/advice/quicktips",
    "/api/advice/weekplan",
    "/api/advice/treatment",
    "/api/advice/getSpouseAdvice",
    "/api/advice/translate",
    "/api/trpc/aiChat.",
    "/api/trpc/advice.",
  ];

  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const full = join(dir, e.name);
      if (e.isDirectory()) return e.name === "node_modules" ? [] : walk(full);
      return /\.(ts|tsx)$/.test(e.name) ? [full] : [];
    });

  const sources = DIRS.flatMap((d) => walk(join(ROOT, d)));

  it("scans a non-trivial number of files (guards against a broken walk)", () => {
    expect(sources.length).toBeGreaterThan(50);
  });

  it("finds no bare fetch() to a gated endpoint anywhere in the app", () => {
    const offenders: string[] = [];

    for (const file of sources) {
      const src = readFileSync(file, "utf8");
      const lines = src.split("\n");
      lines.forEach((line, i) => {
        if (!GATED.some((g) => line.includes(g))) return;
        // Walk back to the call that owns this URL: the path may sit on its own
        // line inside a multi-line fetch(...).
        const window = lines.slice(Math.max(0, i - 3), i + 1).join("\n");
        if (/[^a-zA-Z.]fetch\s*\(/.test(window) && !window.includes("authedFetch")) {
          offenders.push(`${file.replace(ROOT + "/", "")}:${i + 1}`);
        }
      });
    }

    expect(offenders).toEqual([]);
  });
});
