import { describe, expect, it } from "vitest";
import {
  buildSendVerificationPayload,
  buildVerifyEmailPayload,
  isValidVerificationCode,
  isEmailNotVerifiedError,
} from "@/lib/verification";

/**
 * Contract for the two live, unauthenticated email-verification endpoints
 * (rabbaanie-api server/web-auth.ts POST /auth/send-verification and
 * POST /auth/verify-email). Mirrors tests/registration-contract.test.ts: the
 * server has no shared types with this repo, so pinning the request shape
 * here is the only guard against a silent drift like the one that broke
 * in-app registration for five days (see that file's docstring).
 */
describe("verification contract", () => {
  describe("buildSendVerificationPayload", () => {
    it("trims and lowercases the email", () => {
      expect(buildSendVerificationPayload(" Ahmad@Example.COM ")).toEqual({
        email: "ahmad@example.com",
      });
    });
  });

  describe("buildVerifyEmailPayload", () => {
    it("trims and lowercases the email, and trims the code", () => {
      expect(buildVerifyEmailPayload(" Ahmad@Example.COM ", " 123456 ")).toEqual({
        email: "ahmad@example.com",
        code: "123456",
      });
    });
  });

  describe("isValidVerificationCode", () => {
    it("accepts a 6-digit code", () => {
      expect(isValidVerificationCode("123456")).toBe(true);
    });

    it("rejects a 5-digit code", () => {
      expect(isValidVerificationCode("12345")).toBe(false);
    });

    it("rejects a 7-digit code", () => {
      expect(isValidVerificationCode("1234567")).toBe(false);
    });

    it("rejects a code containing a letter", () => {
      expect(isValidVerificationCode("12a456")).toBe(false);
    });

    it("accepts a 6-digit code with surrounding whitespace", () => {
      expect(isValidVerificationCode(" 123456 ")).toBe(true);
    });
  });

  describe("isEmailNotVerifiedError", () => {
    it("is true for the server's email_not_verified error shape", () => {
      expect(isEmailNotVerifiedError({ message: "email_not_verified" })).toBe(true);
    });

    it("is false for an unrelated error message", () => {
      expect(isEmailNotVerifiedError({ message: "other" })).toBe(false);
    });

    it("is false for null", () => {
      expect(isEmailNotVerifiedError(null)).toBe(false);
    });

    it("is false for undefined", () => {
      expect(isEmailNotVerifiedError(undefined)).toBe(false);
    });
  });
});
