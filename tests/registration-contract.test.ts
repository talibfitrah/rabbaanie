import { describe, expect, it } from "vitest";
import {
  REQUIRED_REGISTRATION_FIELDS,
  buildRegistrationPayload,
  isRegistrationComplete,
} from "@/lib/registration";

/**
 * Regression guard for the drift found on 2026-08-15.
 *
 * app/register.tsx has POSTed `{name, email, password, language}` at every
 * revision since in-app sign-up landed (97293d6, 2026-08-05). Three days later
 * rabbaanie-api 4cb7908 ("web registration profile capture", 2026-08-08)
 * tightened /auth/register for the website's benefit and stopped reading `name`
 * at all. From that moment every in-app sign-up got
 * 400 {"error":"Please fill in all required fields"} — which register.tsx
 * renders verbatim, so the user saw a fill-in-the-blanks complaint about a form
 * they had completely filled in. Nobody noticed the app shared that endpoint
 * with the website. Verified live against production before this was written.
 *
 * This is the third app/API contract break in ten days (the other two were on
 * subscribe.tsx — see tests/subscriber-info-contract.test.ts). The literal
 * below mirrors the server, which has no shared types with this repo:
 * rabbaanie-api server/web-auth.ts POST /auth/register. Duplicating it here is
 * the only way to pin the contract from the client side, and pinning it is the
 * point — changing either list should be a deliberate act, not a silent outage.
 */
const SERVER_REQUIRED_FIELDS = ["firstName", "lastName", "email", "password"];

const COMPLETE = {
  firstName: "Ahmad",
  lastName: "Yusuf",
  email: "Ahmad@Example.COM",
  password: "hunter2min6",
};

describe("registration contract", () => {
  it("requires exactly the fields the server requires", () => {
    expect([...REQUIRED_REGISTRATION_FIELDS].sort()).toEqual(
      [...SERVER_REQUIRED_FIELDS].sort(),
    );
  });

  it("sends every field the server requires", () => {
    const payload = buildRegistrationPayload(COMPLETE, "nl");
    for (const field of SERVER_REQUIRED_FIELDS) {
      expect(payload[field], `payload omits ${field}`).toBeTruthy();
    }
  });

  it("sends the name split in two, which is what the server reads", () => {
    // The whole bug in one assertion: a single joined `name` is precisely what
    // the server ignores, so a payload carrying only that is indistinguishable
    // from an empty form as far as /auth/register is concerned.
    const payload = buildRegistrationPayload(COMPLETE, "nl");
    expect(payload.firstName).toBe("Ahmad");
    expect(payload.lastName).toBe("Yusuf");
  });

  it("lowercases the email, so one address cannot register twice", () => {
    // The server matches existing accounts with lower(email) = lower(?), but
    // stores what it is given; sending mixed case would persist a login the
    // user cannot reproduce by typing it the way they read it back.
    expect(buildRegistrationPayload(COMPLETE, "nl").email).toBe(
      "ahmad@example.com",
    );
  });

  it("does not trim the password, which would silently change it", () => {
    const payload = buildRegistrationPayload(
      { ...COMPLETE, password: " lead and trail " },
      "nl",
    );
    expect(payload.password).toBe(" lead and trail ");
  });

  it("blocks submission until every required field is filled", () => {
    expect(isRegistrationComplete(COMPLETE)).toBe(true);
    for (const field of SERVER_REQUIRED_FIELDS) {
      expect(
        isRegistrationComplete({ ...COMPLETE, [field]: "   " }),
        `${field} may not be whitespace-only`,
      ).toBe(false);
    }
  });
});
