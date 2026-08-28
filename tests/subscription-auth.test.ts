import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

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
vi.mock("@/lib/_core/auth", () => ({
  getSessionToken: () => getSessionToken(),
}));
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: null, loading: false }),
}));
// The real package is shipped untranspiled and vitest cannot parse it.
vi.mock("expo-constants", () => ({
  default: { expoConfig: { extra: { distribution: "play" } } },
}));
// Same reason, and now required: lib/distribution.ts reads Platform.OS, because
// iOS has no configured channel of its own to read. Pinned to "android" so the
// describes below keep testing the axis they were written for — how the
// CONFIGURED value is interpreted. The platform axis is covered in
// tests/release-channel-config.test.ts.
vi.mock("react-native", () => ({ Platform: { OS: "android" } }));
// subscriptionFetch routes through authedFetch, which now reads the app
// version from here for X-App-Version — same stub the other transport-layer
// suites use, so this doesn't reach expo-application.
vi.mock("@/hooks/use-updates", () => ({
  INSTALLED_VERSION: "1.5.1",
  CLIENT_VERSION_HEADERS: {
    "X-App-Version": "1.5.1",
    "X-App-Platform": "android",
  },
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
    expect(url).toBe(
      "https://api.example.com/api/subscription/status?userId=7",
    );
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer tok-123",
    );
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
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe(
      "application/json",
    );
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer tok-123",
    );
  });

  it("omits the header rather than sending 'Bearer null' when logged out", async () => {
    getSessionToken.mockResolvedValue(null);
    const subscriptionFetch = await load();
    await subscriptionFetch("status?userId=7");

    const init = fetchMock.mock.calls[0][1];
    expect("Authorization" in (init.headers as Record<string, string>)).toBe(
      false,
    );
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
    return (await import("@/lib/distribution")).DISTRIBUTION_CHANNEL;
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

/**
 * Google Play's payments policy forbids an in-app link that leads to a payment
 * method outside Play billing. Stripe checkout is exactly that, and the
 * subscribe screen is reachable from the paywall on all nine paid screens, so
 * an ungated button here is grounds for removal from the store.
 *
 * Source-level, like tests/premium-gating.test.ts: mounting the screen would
 * drag in expo-linking and the rest of the native surface. Both halves are
 * asserted — the guard inside subscribe() and the conditional on the button —
 * because either one alone leaves the violation reachable.
 */
describe("Stripe checkout is never offered on the Play channel", () => {
  const src = readFileSync(join(__dirname, "..", "app/subscribe.tsx"), "utf8");

  /**
   * A price with no way to pay is worse than no price on the App Store build.
   *
   * Both price ternaries were written when there were two channels
   * (`github ? "€12" : play.offer`), so adding "apple" routed iOS into the PLAY
   * arm — where `play.offer` is permanently null, because isPlayBillingEnabled
   * requires Platform.OS === "android". An App Store user read the paid tier as
   * priced "—" forever. Worse than cosmetic: a price the app cannot charge
   * invites "where do I pay, then", which is the guideline 3.1.1 conversation
   * this build exists to avoid having.
   *
   * Pinned as a PAIRING rather than a literal, so it survives a reformat and
   * still catches a third price site added without an iOS arm. The presence
   * half matters as much: asserting only "iOS renders no price" would pass if
   * the Play price disappeared too, which would be a different bug reported as
   * a pass.
   */
  it("renders no price on the App Store build, and still prices Play", () => {
    // Whitespace normalised FIRST. The unnormalised form was itself the
    // failure the coding rules warn about: prettier reflowed the ternary to
    // `DISTRIBUTION_CHANNEL ===\n  "apple" ? null` and this assertion went red
    // on correct code. Collapsing runs of whitespace keeps the guard EXACT — it
    // still demands this precise code shape — while making it independent of
    // where the formatter breaks the line. Loosening the pattern until it
    // matched would have deleted the guard instead of fixing it.
    const flat = src.replace(/\s+/g, " ");
    const playPrices =
      flat.match(/play\.offer \? play\.offer\.displayPrice/g) ?? [];
    const appleArms =
      flat.match(/DISTRIBUTION_CHANNEL === "apple" \? null/g) ?? [];
    expect(
      playPrices.length,
      "the Play price stopped rendering — this guard would then pass vacuously",
    ).toBeGreaterThan(0);
    expect(
      appleArms.length,
      "a price site renders without an apple arm, so iOS falls into the Play " +
        'branch and shows "—" forever',
    ).toBe(playPrices.length);
  });

  it("bails out of subscribe() before opening the checkout URL", () => {
    const body = src.slice(src.indexOf("async function subscribe()"));
    // Matched as "returns unless github", not as "returns when play". The
    // earlier form named the one channel to block, so adding "apple" left this
    // assertion green while the guard had stopped firing on it. Apple's
    // payments policy is as strict as Google's, and any channel added later
    // must be refused by default rather than by being remembered here.
    const guard = body.search(
      /if \(DISTRIBUTION_CHANNEL !== "github"\) return;/,
    );
    const open = body.indexOf("Linking.openURL");
    expect(guard).toBeGreaterThan(-1);
    expect(open).toBeGreaterThan(-1);
    // The guard must come first, otherwise it never runs on a store build.
    expect(guard).toBeLessThan(open);
  });

  it("renders the subscribe button only on the sideload channel", () => {
    expect(src).toMatch(
      /DISTRIBUTION_CHANNEL === "github" \?[\s\S]{0,400}onPress=\{subscribe\}/,
    );
  });

  it("reads the channel from the shared module, not a local copy", () => {
    expect(src).toContain('from "@/lib/distribution"');
    expect(src).not.toMatch(/expoConfig\?\.extra\?\.distribution/);
  });
});
