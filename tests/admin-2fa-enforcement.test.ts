import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const verify2FALogin = vi.hoisted(() => vi.fn());

vi.mock("../server/_core/env", () => ({
  ENV: { cookieSecret: "release-test-cookie-secret-at-least-32-bytes" },
}));
vi.mock("../server/totp", () => ({ verify2FALogin }));

import {
  completeAdmin2FAChallenge,
  createAdmin2FAChallenge,
} from "../server/admin-2fa-challenge";
import {
  ADMIN_FACTOR_MAX_AGE_MS,
  hasFreshAdminFactor,
} from "../server/_core/trpc";

function admin(id: number) {
  return {
    id,
    openId: `admin-${id}`,
    name: "Release Admin",
    email: `admin-${id}@example.test`,
    role: "admin",
  };
}

describe("admin two-factor enforcement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("accepts a valid factor exactly once", async () => {
    verify2FALogin.mockResolvedValue(true);
    const challenge = await createAdmin2FAChallenge(admin(101));

    const result = await completeAdmin2FAChallenge(
      challenge,
      "123456",
      "192.0.2.1",
    );
    expect(result).toMatchObject({
      ok: true,
      claims: { userId: 101, openId: "admin-101", role: "admin" },
    });
    await expect(
      completeAdmin2FAChallenge(challenge, "123456", "192.0.2.1"),
    ).resolves.toEqual({ ok: false, reason: "invalid" });
  });

  it("rate-limits repeated invalid factors across a challenge", async () => {
    verify2FALogin.mockResolvedValue(false);
    const challenge = await createAdmin2FAChallenge(admin(102));

    for (let attempt = 0; attempt < 4; attempt += 1) {
      await expect(
        completeAdmin2FAChallenge(challenge, "000000", "192.0.2.2"),
      ).resolves.toEqual({ ok: false, reason: "invalid" });
    }
    await expect(
      completeAdmin2FAChallenge(challenge, "000000", "192.0.2.2"),
    ).resolves.toEqual({ ok: false, reason: "rate_limited" });
  });

  it("rejects a forged challenge before checking a factor", async () => {
    await expect(
      completeAdmin2FAChallenge("forged", "123456", "192.0.2.3"),
    ).resolves.toEqual({ ok: false, reason: "invalid" });
    expect(verify2FALogin).not.toHaveBeenCalled();
  });

  it("accepts only a recent, non-future factor timestamp", () => {
    const now = Date.now();
    expect(hasFreshAdminFactor(now, now)).toBe(true);
    expect(hasFreshAdminFactor(now - ADMIN_FACTOR_MAX_AGE_MS, now)).toBe(true);
    expect(hasFreshAdminFactor(now - ADMIN_FACTOR_MAX_AGE_MS - 1, now)).toBe(
      false,
    );
    expect(hasFreshAdminFactor(now + 1, now)).toBe(false);
    expect(hasFreshAdminFactor(null, now)).toBe(false);
  });

  it("requires a recent factor for privileged routes and current code to disable", () => {
    const auth = readFileSync("server/web-auth.ts", "utf8");
    const adminPanel = readFileSync("server/admin-panel.ts", "utf8");
    const trpc = readFileSync("server/_core/trpc.ts", "utf8");
    const routers = readFileSync("server/routers.ts", "utf8");
    expect(auth).toContain("requires2FA: true");
    expect(auth).toContain('app.post("/auth/2fa/verify"');
    expect(auth).toContain("twoFactorVerifiedAt: Date.now()");
    expect(adminPanel).toContain("Two-factor verification required");
    expect(adminPanel).toContain("Date.now() - verifiedAt <= 10 * 60 * 1000");
    expect(adminPanel).toContain("await verify2FALogin(user.id, token)");
    expect(trpc).toContain("const enrolled = await has2FA(ctx.user.id)");
    expect(trpc).toContain("Administrator two-factor enrollment required");
    expect(trpc).toContain("hasFreshAdminFactor(ctx.user.twoFactorVerifiedAt)");
    expect(adminPanel).toContain('res.redirect("/admin-panel/2fa-setup")');
    expect(adminPanel).toContain("if (await has2FA(user.id))");
    expect(routers).toContain(
      "const adminRouter = router({\n  /** Get dashboard statistics */\n  dashboard: adminProcedure",
    );
    expect(routers).toContain("generateCodes: adminProcedure");
    expect(routers).toContain(
      "const contentRouter = router({\n  /** Create content (admin only) */\n  create: adminProcedure",
    );
    expect(routers).toContain(
      "/** Update content (admin only) */\n  update: adminProcedure",
    );
    expect(routers).toContain(
      "/** Delete content (admin only) */\n  delete: adminProcedure",
    );
  });
});
