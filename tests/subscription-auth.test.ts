import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

/**
 * Regression guard for the bug report of 2026-08-05: every /api/subscription/*
 * call went out as a bare fetch(), so the server answered
 * 401 {"error":"authentication_required"} and the app read that as
 * "you are not subscribed" / "could not save" — for every user, forever.
 */

vi.mock("@/constants/oauth", () => ({
  getApiBaseUrl: () => "https://api.example.com",
}));

const getSessionToken = vi.fn();
vi.mock("@/lib/_core/auth", () => ({ getSessionToken: () => getSessionToken() }));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: null, loading: false }) }));
// The real package is shipped untranspiled and vitest cannot parse it.
vi.mock("expo-constants", () => ({
  default: { expoConfig: { extra: { distribution: "play" } } },
}));

describe("subscriptionFetch", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue({ json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);
    getSessionToken.mockResolvedValue("tok-123");
  });
  afterEach(() => vi.unstubAllGlobals());

  const load = async () =>
    (await import("@/hooks/use-subscription")).subscriptionFetch;

  it("sends the bearer token so the server does not answer 401", async () => {
    const subscriptionFetch = await load();
    await subscriptionFetch("status?userId=7");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.example.com/api/subscription/status?userId=7");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok-123");
  });

  it("keeps caller headers and method when posting", async () => {
    const subscriptionFetch = await load();
    await subscriptionFetch("info", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });

    const init = fetchMock.mock.calls[0][1];
    expect(init.method).toBe("POST");
    expect(init.body).toBe("{}");
    // Both the caller's header and the injected one must survive the merge.
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok-123");
  });

  it("omits the header rather than sending 'Bearer null' when logged out", async () => {
    getSessionToken.mockResolvedValue(null);
    const subscriptionFetch = await load();
    await subscriptionFetch("status?userId=7");

    const init = fetchMock.mock.calls[0][1];
    expect("Authorization" in (init.headers as Record<string, string>)).toBe(false);
  });
});

/**
 * The channel decides whether a *sold* coupon may be redeemed: the server
 * refuses one when the caller says "play", because money taken outside Play
 * billing violates its payments policy. An unrecognised value must therefore
 * resolve to "play" — the stricter side — not to the permissive one.
 */
describe("DISTRIBUTION_CHANNEL", () => {
  const channelFor = async (distribution: unknown) => {
    vi.resetModules();
    vi.doMock("expo-constants", () => ({
      default: { expoConfig: { extra: { distribution } } },
    }));
    return (await import("@/hooks/use-subscription")).DISTRIBUTION_CHANNEL;
  };

  it("reports the sideload channel only for an explicit 'github'", async () => {
    expect(await channelFor("github")).toBe("github");
  });

  it("fails closed to 'play' for anything else", async () => {
    expect(await channelFor("play")).toBe("play");
    expect(await channelFor(undefined)).toBe("play");
    expect(await channelFor("something-new")).toBe("play");
  });
});
