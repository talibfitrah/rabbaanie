/**
 * The email-verification contract.
 *
 * app/verify-email.tsx and app/register.tsx POST these to the API, which
 * lives in a separate repo with its own deploy and no shared types
 * (rabbaanie-api server/web-auth.ts POST /auth/send-verification and
 * POST /auth/verify-email). Building the bodies here rather than inline in
 * the screens is what lets tests/verification-contract.test.ts pin the
 * client to the server — see lib/registration.ts for why that guard exists.
 *
 * Change this only together with that server.
 */

/** The POST body for /auth/send-verification. */
export function buildSendVerificationPayload(email: string): { email: string } {
  return { email: email.trim().toLowerCase() };
}

/** The POST body for /auth/verify-email. */
export function buildVerifyEmailPayload(
  email: string,
  code: string,
): { email: string; code: string } {
  return { email: email.trim().toLowerCase(), code: code.trim() };
}

/** Whether a code is submittable — the same ^\d{6}$ the server checks. */
export function isValidVerificationCode(code: string): boolean {
  return /^\d{6}$/.test(code.trim());
}

/**
 * Whether an error is the server's "you must verify your email first" gate.
 *
 * Duck-typed because the caller may hand this a plain fetch-derived error
 * ({message: "email_not_verified"}) or a tRPC error, which nests the same
 * message under a FORBIDDEN code (err.data.code) but still carries it on
 * err.message directly — so checking .message alone catches both shapes.
 */
export function isEmailNotVerifiedError(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  return (err as { message?: unknown }).message === "email_not_verified";
}
