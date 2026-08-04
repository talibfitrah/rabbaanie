import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";

vi.mock("@/constants/oauth", () => ({
  getApiBaseUrl: () => "https://api.example.test",
}));

vi.mock("@/lib/_core/auth", () => ({}));
vi.mock("../lib/_core/auth", () => ({}));

vi.mock("react-native", () => ({
  Platform: { OS: "android" },
}));

import { verifySessionToken } from "../lib/_core/api";

function jsonResponse(body: unknown, ok = true) {
  return {
    ok,
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response;
}

describe("OAuth session establishment", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each(["", "   "])(
    "rejects a blank callback token before any request",
    async (token) => {
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);

      await expect(verifySessionToken(token)).rejects.toThrow(
        "Session token is missing",
      );
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it("rejects a token the API does not authenticate", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(null, false)),
    );

    await expect(verifySessionToken("invalid-token")).rejects.toThrow(
      "Session verification failed",
    );
  });

  it.each([
    {},
    { result: { data: { json: null } } },
    { result: { data: { json: { id: "7", openId: "member" } } } },
    { result: { data: { json: { id: 7, openId: "" } } } },
  ])("rejects a malformed authenticated-user envelope", async (body) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(body)));

    await expect(
      verifySessionToken("untrusted-callback-token"),
    ).rejects.toThrow();
  });

  it("returns only the server-verified identity", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        result: {
          data: {
            json: {
              id: 7,
              openId: "member-7",
              name: "Verified Member",
              email: "member@example.test",
              loginMethod: "email",
              lastSignedIn: "2026-08-02T00:00:00.000Z",
              ignoredAdminFlag: true,
            },
          },
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(verifySessionToken("server-token")).resolves.toEqual({
      id: 7,
      openId: "member-7",
      name: "Verified Member",
      email: "member@example.test",
      loginMethod: "email",
      lastSignedIn: new Date("2026-08-02T00:00:00.000Z"),
    });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/trpc/auth.me?input="),
      { headers: { Authorization: "Bearer server-token" } },
    );
  });

  it("does not trust user identity from callback parameters", () => {
    const callback = fs.readFileSync("app/oauth/callback.tsx", "utf8");
    expect(callback).toContain("Verouderde inloglink");
    expect(callback).not.toContain("params.code");
    expect(callback).not.toContain("params.sessionToken");
    expect(callback).not.toContain("JSON.parse(userJson)");
    expect(callback).not.toContain("Auth.setSessionToken");
  });

  it("verifies both email and Google tokens before persisting them", () => {
    const login = fs.readFileSync("app/login.tsx", "utf8");
    expect(login).toContain("completeTokenSignIn(sessionToken)");
    expect(login).toContain("completeNativeGoogleSignIn()");
  });

  it("rolls back a token if encrypted user persistence fails", () => {
    const auth = fs.readFileSync("lib/_core/auth.ts", "utf8");
    const context = fs.readFileSync("lib/auth-context.tsx", "utf8");
    expect(auth).toContain('console.error("[Auth] Failed to set user info:"');
    expect(auth).toContain("throw error;");
    expect(context).toContain("await Auth.removeSessionToken()");
    expect(context).toContain("await Auth.clearUserInfo()");
    expect(context).toContain("await Auth.markLogoutPending()");
    expect(context).toContain("await Auth.clearLogoutPending()");
    expect(auth).toContain("throw error;");
  });

  it("fails closed across restart when secure logout cleanup fails", () => {
    const auth = fs.readFileSync("lib/_core/auth.ts", "utf8");
    const context = fs.readFileSync("lib/auth-context.tsx", "utf8");
    expect(auth).toContain("@rabbaanie_logout_pending");
    expect(context).toContain("if (await Auth.isLogoutPending())");
  });

  it("revokes the presented bearer on server logout", () => {
    const oauth = fs.readFileSync("server/_core/oauth.ts", "utf8");
    const sdk = fs.readFileSync("server/_core/sdk.ts", "utf8");
    const revocation = fs.readFileSync(
      "server/_core/session-revocation.ts",
      "utf8",
    );
    expect(oauth).toContain("await sdk.revokeRequestSession(req)");
    expect(sdk).toContain("await revokeSessionToken");
    expect(sdk).toContain("Revoked session rejected");
    expect(revocation).toContain("CREATE TABLE IF NOT EXISTS revoked_sessions");
    expect(revocation).toContain("user_session_versions");
  });
});
