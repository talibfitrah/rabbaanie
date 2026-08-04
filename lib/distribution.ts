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
