import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

/**
 * Guards for the iOS StoreKit purchase path, mirroring
 * tests/play-store-compliance.test.ts. Most are source-level for the same reason
 * that suite is: mounting the subscribe screen or the billing hook needs native
 * modules. pickAppleOffer is the one pure function, unit-tested directly.
 *
 * This file uses only file-level vi.mock (hoisted, auto-restored between files),
 * NOT vi.doMock — so it carries none of the leak/teardown hazard the update-path
 * describe in play-store-compliance.test.ts has to clean up in afterAll. The
 * react-native stub here is Platform.OS === "ios", which makes
 * DISTRIBUTION_CHANNEL resolve to "apple".
 */

const root = join(__dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");
const readFlat = (p: string) => read(p).replace(/\s+/g, " ");

vi.mock("expo-constants", () => ({
  default: { expoConfig: { extra: {} } },
}));
vi.mock("react-native", () => ({ Platform: { OS: "ios" } }));
vi.mock("@/hooks/use-subscription", () => ({
  invalidateSubscriptionCache: () => {},
  subscriptionFetch: async () => ({ ok: true, json: async () => ({ ok: true }) }),
}));

describe("Apple StoreKit offer selection", () => {
  it("returns the product's own price on iOS, and null when it has none", async () => {
    const { pickAppleOffer } = await import("../lib/play-billing");
    // iOS subscriptions have no per-user offer token: the product carries the
    // localized, tax-inclusive price string directly, and StoreKit needs no
    // offerToken to buy the base plan. Empty offerToken is the honest shape.
    expect(pickAppleOffer({ displayPrice: "€12,00" })).toEqual({
      displayPrice: "€12,00",
      offerToken: "",
    });
    // No price = not purchasable in this storefront, same "cannot buy" state the
    // Android empty-offer list produces. Must read as null, not crash.
    expect(pickAppleOffer({})).toBeNull();
    expect(pickAppleOffer(null)).toBeNull();
  });
});

describe("Apple StoreKit purchase path", () => {
  const billing = read("lib/play-billing.ts");
  const billingFlat = billing.replace(/\s+/g, " ");
  const screen = read("app/subscribe.tsx");
  const screenFlat = readFlat("app/subscribe.tsx");

  it("verifies an iOS purchase against verify-apple with exactly the JWS", () => {
    // The Apple analog of verify-play: bearer session, JSON { jwsRepresentation }.
    expect(billing).toContain('"verify-apple"');
    expect(billingFlat).toContain("{ jwsRepresentation: token }");
    // Presence of the Android path too — verify-apple must be ADDED, not swapped
    // in. verify-play and its purchaseToken body must both survive.
    expect(billing).toContain('"verify-play"');
    expect(billingFlat).toContain("{ purchaseToken: token }");
  });

  it("requests the iOS purchase through the apple object with an app account token", () => {
    // RequestSubscriptionIosProps carries sku + appAccountToken; the tag the
    // server issues rides in appAccountToken, the Apple analog of Android's
    // obfuscatedAccountId, so the server can bind the purchase to this account.
    expect(billingFlat).toMatch(
      /apple: \{ sku: PLAY_PRODUCT_ID, appAccountToken: tag \}/,
    );
    // The Android request object is untouched: still google + obfuscatedAccountId.
    expect(billing).toContain("obfuscatedAccountId: tag");
  });

  it("arms billing on iOS while the Play arm still fails closed on Android", () => {
    // Presence: the iOS arm exists and is armed.
    expect(billing).toContain(
      'DISTRIBUTION_CHANNEL === "apple" && Platform.OS === "ios"',
    );
    // No regression: the Play arm still requires the Play channel AND Android,
    // fail-closed on both axes exactly as before.
    expect(billing).toContain(
      'DISTRIBUTION_CHANNEL === "play" && Platform.OS === "android"',
    );
  });

  it("feeds the Apple app-account token to the hook through playAccountTag", () => {
    // Two pinned tests forbid changing the hook signature or its call site
    // (play-store-compliance.test.ts), so the server's appleAccountToken reaches
    // the hook by being folded into playAccountTag on iOS at the status boundary.
    expect(screenFlat).toContain("appleAccountToken?: string");
    expect(screenFlat).toMatch(
      /DISTRIBUTION_CHANNEL === "apple" && data\?\.appleAccountToken/,
    );
    // The pinned hook call must remain byte-identical.
    expect(screen).toContain("usePlayBilling(status?.playAccountTag, uid)");
  });

  it("shows the StoreKit price on iOS instead of a permanent dash", () => {
    // The apple->null guards that hid both price cards on iOS are gone; iOS now
    // reaches the play.offer branch, whose price comes from StoreKit.
    expect(screenFlat).not.toContain(
      '"apple" ? null : DISTRIBUTION_CHANNEL === "github"',
    );
    // And still no euro literal on the store price — a hardcoded €12 shown to an
    // App Store buyer is the Stripe price, the discrepancy this path removes.
    const playBranches = [
      ...screen.matchAll(/play\.offer \? play\.offer\.displayPrice : "([^"]*)"/g),
    ];
    expect(playBranches.length).toBeGreaterThan(0);
    for (const b of playBranches) expect(b[1]).not.toContain("€");
  });

  it("links iOS subscribers to App Store subscription management", () => {
    expect(screen).toContain("https://apps.apple.com/account/subscriptions");
    // Android's Google Play manage link is untouched.
    expect(screen).toContain(
      "https://play.google.com/store/account/subscriptions",
    );
  });
});
