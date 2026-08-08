import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
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
 * Source-level, like tests/premium-gating.test.ts: mounting these screens would
 * drag in the native surface. What matters is that no API call in them goes out
 * as a bare fetch() — that is the exact shape of the bug.
 */
describe("the paid screens never call an API endpoint unauthenticated", () => {
  const SCREENS = ["app/ai-chat.tsx", "app/(tabs)/personal-advice.tsx"];

  for (const screen of SCREENS) {
    const src = readFileSync(join(__dirname, "..", screen), "utf8");

    it(`${screen} routes every API call through authedFetch`, () => {
      expect(src).toContain("authed-fetch");
      // A bare fetch() against the API base is what left these routes anonymous.
      expect(src).not.toMatch(/[^a-zA-Z]fetch\(\s*`\$\{baseUrl\}/);
      expect(src).not.toMatch(/[^a-zA-Z]fetch\(\s*`\$\{getApiBaseUrl\(\)\}/);
      expect(src).not.toMatch(/[^a-zA-Z]fetch\(\s*`\$\{getBaseUrl\(\)\}/);
    });
  }

  it("ai-chat no longer claims the caller is anonymous", () => {
    const src = readFileSync(join(__dirname, "..", "app/ai-chat.tsx"), "utf8");
    // The server derives identity from the session; a client-asserted user id
    // is exactly what made these routes impossible to gate.
    expect(src).not.toContain('userId: "anonymous"');
  });
});
