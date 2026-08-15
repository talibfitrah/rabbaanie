/**
 * The registration contract.
 *
 * app/register.tsx POSTs this to /auth/register on the API, which lives in a
 * separate repo with its own deploy and no shared types (rabbaanie-api
 * server/web-auth.ts). Building the body here rather than inline in the screen
 * is what lets tests/registration-contract.test.ts pin the two together — the
 * guard that was missing when the server tightened this endpoint on 2026-08-08
 * and in-app sign-up died silently for five days.
 *
 * Change this only together with that server.
 */

export const REQUIRED_REGISTRATION_FIELDS = [
  "firstName",
  "lastName",
  "email",
  "password",
] as const;

type RegistrationField = (typeof REQUIRED_REGISTRATION_FIELDS)[number];
type RegistrationFields = Record<RegistrationField, string>;

/** The POST body for /auth/register. */
export function buildRegistrationPayload(
  fields: RegistrationFields,
  language: string,
): Record<string, string> {
  return {
    firstName: fields.firstName.trim(),
    lastName: fields.lastName.trim(),
    email: fields.email.trim().toLowerCase(),
    password: fields.password,
    language,
  };
}

/**
 * Whether the form may be submitted. Checks the required fields by name, so a
 * field the server stops requiring cannot keep blocking the button.
 */
export function isRegistrationComplete(fields: RegistrationFields): boolean {
  return REQUIRED_REGISTRATION_FIELDS.every((field) =>
    !!String(fields[field] ?? "").trim(),
  );
}
