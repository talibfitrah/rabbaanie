import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * The app is sign-in only: accounts are created on rabbaanie.com behind a paid
 * subscription. syncUser() used to upsert unconditionally, so a first-time
 * Google identity minted a full account and skipped payment entirely.
 */

const getUserByOpenId = vi.fn();
const getUserByEmail = vi.fn();
const upsertUser = vi.fn();

vi.mock("../server/db", () => ({ getUserByOpenId, getUserByEmail, upsertUser }));
vi.mock("../server/_core/cookies", () => ({ getSessionCookieOptions: () => ({}) }));
vi.mock("../server/_core/sdk", () => ({ sdk: {} }));

const { NoAccountError, syncUser } = await import("../server/_core/oauth");

describe("OAuth sign-in gate", () => {
  beforeEach(() => {
    getUserByOpenId.mockReset();
    getUserByEmail.mockReset();
    upsertUser.mockReset();
  });

  it("denies an unknown Google identity and never creates an account", async () => {
    getUserByOpenId.mockResolvedValue(undefined);
    getUserByEmail.mockResolvedValue(undefined);

    await expect(syncUser({ openId: "google_new", email: "stranger@example.com" })).rejects.toThrow(
      NoAccountError
    );
    expect(upsertUser).not.toHaveBeenCalled();
  });

  it("reports email_account when the address exists as a website password account", async () => {
    getUserByOpenId.mockResolvedValue(undefined);
    getUserByEmail.mockResolvedValue({ id: 7, openId: "email_123", email: "paid@example.com" });

    await expect(
      syncUser({ openId: "google_other", email: "paid@example.com" })
    ).rejects.toMatchObject({ reason: "email_account" });
    // Still a denial: the OAuth userinfo has no email-verified flag, so an email
    // match must never grant a session.
    expect(upsertUser).not.toHaveBeenCalled();
  });

  it("signs in an existing account and refreshes lastSignedIn", async () => {
    const user = { id: 1, openId: "google_known", email: "member@example.com" };
    getUserByOpenId.mockResolvedValue(user);

    await expect(syncUser({ openId: "google_known", email: "member@example.com" })).resolves.toBe(
      user
    );
    expect(upsertUser).toHaveBeenCalledTimes(1);
    expect(getUserByEmail).not.toHaveBeenCalled();
  });

  it("still rejects userinfo with no openId", async () => {
    await expect(syncUser({ email: "x@example.com" })).rejects.toThrow(/openId missing/);
    expect(upsertUser).not.toHaveBeenCalled();
  });
});
