import Constants from "expo-constants";

type ReleaseFeatures = {
  childMonitoring?: boolean;
};

const releaseFeatures = (Constants.expoConfig?.extra?.releaseFeatures ??
  {}) as ReleaseFeatures;

// This capability is fail-closed. A missing or malformed release config must
// produce the restricted Play behavior, never silently enable a feature that
// needs a separate policy/security review.
export const CHILD_MONITORING_ENABLED =
  releaseFeatures.childMonitoring === true;

/**
 * Which store this build came from. Fail-closed to "play" for the same reason
 * as above: Play's payments policy is the stricter regime, so an unrecognised
 * value must land there rather than silently enabling the sideload behaviour.
 *
 * Two things read this: the server refuses *sold* coupons on "play" (money
 * taken outside Play billing), and the subscribe screen only offers Stripe on
 * "github" — an in-app link to an outside payment page is what the policy
 * actually forbids. Free grant codes stay allowed on both.
 */
export const DISTRIBUTION_CHANNEL: "play" | "github" =
  Constants.expoConfig?.extra?.distribution === "github" ? "github" : "play";
