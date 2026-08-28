import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

/**
 * Phase 1-2 of the minimum-app-version rollout (see local-docs handoff):
 * the client now reports its version on every request and knows how to
 * render a block screen, but server-side enforcement stays OFF. This tests
 * the pure refuse/allow decision — the same logic hand-ported into the
 * deployed server's gate (a separate codebase, see server/_core/index.ts on
 * the VM) — plus proves the client actually sends the header, since the app
 * itself cannot be run here.
 */
import { isVersionRefused, isTrustedWebOrigin } from "@/lib/app-version";

describe("isVersionRefused", () => {
  it("refuses a version below the configured minimum", () => {
    expect(isVersionRefused("1.5.1", "1.5.2")).toBe(true);
  });

  it("allows a version exactly at the minimum", () => {
    expect(isVersionRefused("1.5.2", "1.5.2")).toBe(false);
  });

  it("allows a version above the minimum", () => {
    expect(isVersionRefused("1.6.0", "1.5.2")).toBe(false);
  });

  it("refuses a missing version once a minimum is configured", () => {
    expect(isVersionRefused(undefined, "1.5.2")).toBe(true);
  });

  it("refuses a non-semver version once a minimum is configured", () => {
    expect(isVersionRefused("not-a-version", "1.5.2")).toBe(true);
  });

  it("never refuses anyone when enforcement is disabled (no minimum set)", () => {
    expect(isVersionRefused(undefined, "")).toBe(false);
    expect(isVersionRefused("0.0.1", "")).toBe(false);
    expect(isVersionRefused("not-a-version", "")).toBe(false);
    expect(isVersionRefused("9.9.9", "")).toBe(false);
  });
});

describe("isVersionRefused — browser exemption (Origin/Referer from our own website)", () => {
  it("does not refuse a headerless request whose Origin is our website", () => {
    expect(isVersionRefused(undefined, "1.5.2", "https://www.rabbaanie.com")).toBe(false);
  });

  it("does not refuse a headerless request whose Referer is the API host itself (the /dashboard case)", () => {
    expect(isVersionRefused(undefined, "1.5.2", "https://api.rabbaanie.com/dashboard")).toBe(false);
  });

  it("does not refuse when Origin is the bare root domain", () => {
    expect(isVersionRefused(undefined, "1.5.2", "https://rabbaanie.com")).toBe(false);
  });

  it("still refuses a spoofed lookalike Origin", () => {
    expect(isVersionRefused(undefined, "1.5.2", "https://www.rabbaanie.com.attacker.net")).toBe(true);
  });

  it("still refuses when no Origin/Referer is given (the bare app-shaped request)", () => {
    expect(isVersionRefused(undefined, "1.5.2", undefined)).toBe(true);
  });
});

describe("isTrustedWebOrigin", () => {
  it("trusts www.rabbaanie.com, the root domain, and api.rabbaanie.com", () => {
    expect(isTrustedWebOrigin("https://www.rabbaanie.com")).toBe(true);
    expect(isTrustedWebOrigin("https://rabbaanie.com")).toBe(true);
    expect(isTrustedWebOrigin("https://api.rabbaanie.com")).toBe(true);
  });

  it("matches the host exactly, not by substring", () => {
    expect(isTrustedWebOrigin("https://www.rabbaanie.com.attacker.net")).toBe(false);
    expect(isTrustedWebOrigin("https://evil.com/?u=https://www.rabbaanie.com")).toBe(false);
    expect(isTrustedWebOrigin("https://notrabbaanie.com")).toBe(false);
  });

  it("rejects malformed or absent input", () => {
    expect(isTrustedWebOrigin("not a url")).toBe(false);
    expect(isTrustedWebOrigin(undefined)).toBe(false);
    expect(isTrustedWebOrigin(null)).toBe(false);
    expect(isTrustedWebOrigin("")).toBe(false);
  });
});

describe("authedFetch reports the installed app version", () => {
  vi.mock("@/constants/oauth", () => ({
    getApiBaseUrl: () => "https://api.example.com",
  }));
  vi.mock("@/lib/_core/auth", () => ({ getSessionToken: vi.fn().mockResolvedValue(null) }));
  vi.mock("@/hooks/use-updates", () => ({
  INSTALLED_VERSION: "1.5.1",
  CLIENT_VERSION_HEADERS: {
    "X-App-Version": "1.5.1",
    "X-App-Platform": "android",
  },
}));

  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("composes X-App-Version on authedFetch requests", async () => {
    const { authedFetch } = await import("@/lib/authed-fetch");
    await authedFetch("/api/trpc/profile.get");

    const init = fetchMock.mock.calls[0][1];
    expect((init.headers as Record<string, string>)["X-App-Version"]).toBe("1.5.1");
  });

  it("composes X-App-Version on publicFetch requests", async () => {
    const { publicFetch } = await import("@/lib/authed-fetch");
    await publicFetch("/api/auth/login");

    const init = fetchMock.mock.calls[0][1];
    expect((init.headers as Record<string, string>)["X-App-Version"]).toBe("1.5.1");
  });
});
