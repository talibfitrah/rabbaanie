import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("mobile OAuth callback security", () => {
  it("retires the old app callback without accepting credentials", () => {
    const source = readFileSync("app/oauth/callback.tsx", "utf8");
    expect(source).toContain("Verouderde inloglink");
    expect(source).not.toContain("sessionToken");
    expect(source).not.toContain("params.code");
    expect(source).not.toContain("JSON.parse");
  });

  it("retires legacy native OAuth endpoints that exposed bearer sessions", () => {
    const source = readFileSync("server/_core/oauth.ts", "utf8");
    expect(source).toContain(
      '"/api/oauth/native-callback", "/api/oauth/mobile"',
    );
    expect(source).toContain("oauth_flow_retired");
    expect(source).not.toContain("?sessionToken=");
    expect(source).not.toContain("app_session_id: sessionToken");
  });
});
