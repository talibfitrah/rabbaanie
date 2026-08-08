/**
 * Pure redirect-selection logic for AuthGate (app/_layout.tsx), extracted so
 * it's unit-testable the same way lib/age-gate.tsx's getGateRedirect is —
 * this class of inline, component-only boolean logic is exactly what let a
 * redirect-loop regression (and a follow-up race condition) ship undetected
 * earlier in this feature's development. gateRedirect (age/auth) always
 * takes priority; onboarding is checked before permissions-setup so an
 * incomplete profile is never skipped past.
 */

export type PendingRedirectInput = {
  gateRedirect: string | null;
  ageLoading: boolean;
  loading: boolean;
  timedOut: boolean;
  ageStatus: "adult" | "minor" | null;
  isAuthenticated: boolean;
  profileDone: boolean;
  permissionsSetupDone: boolean;
  inSetup: boolean;
};

export function resolvePendingRedirect(input: PendingRedirectInput): string | null {
  const {
    gateRedirect,
    ageLoading,
    loading,
    timedOut,
    ageStatus,
    isAuthenticated,
    profileDone,
    permissionsSetupDone,
    inSetup,
  } = input;

  const authResolved = !ageLoading && !(loading && !timedOut);
  const eligible = !gateRedirect && authResolved && ageStatus === "adult" && isAuthenticated && !inSetup;

  if (eligible && !profileDone) return "/onboarding";
  if (eligible && profileDone && !permissionsSetupDone) return "/permissions-setup";
  return gateRedirect;
}
