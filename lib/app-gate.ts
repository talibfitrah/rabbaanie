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

/**
 * Segments exempt from the profile / permissions-setup redirect. verify-email
 * joins the setup flows: a just-registered user (profileDone=false) is sent
 * here by app/register.tsx, and without this exemption AuthGate would bounce
 * them straight to /onboarding, so the verify screen would never show — and
 * with EMAIL_VERIFICATION_GATE off, that means it would never show at all.
 * Extracted and tested for the same reason resolvePendingRedirect is (header).
 */
export function isSetupRoute(segment: string | undefined): boolean {
  return (
    segment === "onboarding" ||
    segment === "language-select" ||
    segment === "permissions-setup" ||
    segment === "verify-email"
  );
}
