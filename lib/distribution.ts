import Constants from "expo-constants";
import { Platform } from "react-native";

type ReleaseFeatures = {
  childMonitoring?: boolean;
};

const releaseFeatures = (Constants.expoConfig?.extra?.releaseFeatures ??
  {}) as ReleaseFeatures;

// This capability is fail-closed. A missing or malformed release config must
// produce the restricted Play behavior, never silently enable a feature that
// needs a separate policy/security review.
//
// Platform.OS is checked FIRST, for the same reason DISTRIBUTION_CHANNEL below
// checks it first: the flag it reads is `isGithubBuild` (app.config.ts), which
// says nothing about the platform. An iOS build made with
// APP_DISTRIBUTION=github therefore reported "apple" for the channel while
// still enabling child monitoring — and app/child-account/parent-monitor.tsx
// then renders the "apps" tab and fires the `usage` query against
// modules/usage-stats, an Android-only native module that does not exist on
// iOS. An App Store build is unaffected (channel "play" → flag false), so this
// is a dev and TestFlight crash rather than a shipped one, which is exactly the
// kind that reaches a reviewer's TestFlight build and nobody else's.
export const CHILD_MONITORING_ENABLED =
  Platform.OS !== "ios" && releaseFeatures.childMonitoring === true;

/**
 * Which store this build came from. Fail-closed to "play" for the same reason
 * as above: Play's payments policy is the stricter regime, so an unrecognised
 * value must land there rather than silently enabling the sideload behaviour.
 *
 * Two things read this: the server refuses *sold* coupons on "play" (money
 * taken outside Play billing), and the subscribe screen only offers Stripe on
 * "github" — an in-app link to an outside payment page is what the policy
 * actually forbids. Free grant codes stay allowed on both.
 *
 * iOS is derived from Platform.OS, NOT from extra.distribution, and that is the
 * whole point. There is no APP_DISTRIBUTION value an iOS build gets on its own:
 * the config falls back to the Android default, so an iPhone reported "play"
 * and every consumer believed it — components/version-block-screen.tsx put a
 * Google Play button on an undismissable screen with no other exit, and
 * hooks/use-updates.ts told the user updates were Android-only. A build-time
 * flag can be forgotten by whoever runs the build; the platform the code is
 * executing on cannot.
 *
 * The platform is checked FIRST, before the configured value, and that ordering
 * is the fail-closed posture applied to the new channel. "github" on an iPhone
 * would arm the in-app APK updater (an APK cannot install on iOS at all) and
 * the Stripe checkout button (an outside payment link is the single thing App
 * Review looks hardest for). iOS therefore wins over whatever the build was
 * told it was, exactly as an unrecognised value loses to "play".
 */
export const DISTRIBUTION_CHANNEL: "play" | "github" | "apple" =
  Platform.OS === "ios"
    ? "apple"
    : Constants.expoConfig?.extra?.distribution === "github"
      ? "github"
      : "play";

/**
 * Which payments REGIME governs a coupon redemption — not which store the build
 * came from. Sent as the `channel` field to /api/subscription/redeem-coupon.
 *
 * The server refuses a PRICED coupon — money taken outside store billing — only
 * when it is told `"play"`, and its route coerces every other value to
 * undefined, which is the permissive branch. That was safe while "play" and
 * "github" were the only two channels. Adding "apple" silently opted iOS OUT of
 * the refusal: a coupon someone had paid for on the website would redeem inside
 * the App Store build, which is the thing Guideline 3.1.1 forbids outright.
 *
 * The client cannot resolve that by inspecting the coupon. It has no idea
 * whether a code is priced or a free grant, and free grants must keep working —
 * not least because a grant code is how App Review is shown the paid tier.
 *
 * So map to the regime and fail CLOSED: anything that is not the sideload
 * channel gets the strict one. Apple's payments policy and Google's agree on
 * this point, so "play" is the correct bucket for an App Store build even
 * though it is the wrong store NAME, and any channel added later lands in the
 * strict bucket by default instead of by being remembered here.
 *
 * Deliberately independent of the server. rabbaanie-api still needs
 * `redeemCoupon` widened to treat "apple" strictly, and its route to stop
 * coercing unknown channels to undefined; that ships with /verify-apple. Once
 * it does, this can send DISTRIBUTION_CHANNEL straight through and the server
 * gets the real store name for its records. Until then the client does not
 * depend on a deploy in a different repository for its own correctness.
 */
export function couponPolicyChannel(): "play" | "github" {
  return DISTRIBUTION_CHANNEL === "github" ? "github" : "play";
}
