import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Every feature advertised as paid on the subscribe screen must be closed to
 * non-subscribers, not merely shown with a "please subscribe" banner over it.
 *
 * Reported 2026-08-05: the owner could reach personal advice and other paid
 * sections without a subscription. Two of the eight (family hub, network) had
 * no gate at all. This is a source-level check because the alternative is
 * mounting seven screens with their native dependencies.
 */

const root = join(__dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

// The eight paid features from SPECIAL in app/subscribe.tsx, plus add-child,
// which is reached from family management and would otherwise be a deep-link
// route around the family-hub gate.
const PAID_SCREENS = [
  ["advisor", "app/ai-chat.tsx"],
  ["child analysis", "app/child/environment.tsx"],
  ["personal advice", "app/(tabs)/personal-advice.tsx"],
  ["weekly plan", "app/(tabs)/weekly.tsx"],
  ["treatment plans", "app/(tabs)/treatments.tsx"],
  ["family management", "app/(tabs)/family-hub.tsx"],
  ["messages", "app/(tabs)/messages.tsx"],
  ["network", "app/network.tsx"],
  ["add child", "app/add-child.tsx"],
] as const;

describe("paid screens are closed to non-subscribers", () => {
  for (const [label, path] of PAID_SCREENS) {
    it(`${label} (${path}) is behind PremiumGate`, () => {
      const src = read(path);
      expect(src).toContain("PremiumGate");
      // A bare PremiumNotice is the soft banner — it leaves the content visible,
      // which is exactly the bug. Require the real gate element.
      expect(src).toMatch(/<PremiumGate>/);
    });
  }

  it("onboarding's add-child stays open, or sign-up dead-ends", () => {
    // A brand-new user has no subscription yet; gating the onboarding copy
    // would trap them between registering and being able to use the app.
    const src = read("app/onboarding/add-child.tsx");
    expect(src).not.toMatch(/<PremiumGate>/);
  });

  it("the gate denies access while the status is still loading", () => {
    // If it rendered children during the fetch, a non-subscriber would see the
    // paid content flash before the paywall replaced it.
    const src = read("components/premium-notice.tsx");
    expect(src).toMatch(/if \(loading\)/);
    const gate = src.slice(src.indexOf("export function PremiumGate"));
    expect(gate.indexOf("if (loading)")).toBeLessThan(gate.indexOf("if (subscribed)"));
  });
});
