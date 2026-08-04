import { afterEach, describe, expect, it, vi } from "vitest";

const originalDistribution = process.env.APP_DISTRIBUTION;

afterEach(() => {
  if (originalDistribution === undefined) delete process.env.APP_DISTRIBUTION;
  else process.env.APP_DISTRIBUTION = originalDistribution;
  vi.resetModules();
});

async function loadConfig(distribution: "play" | "github") {
  process.env.APP_DISTRIBUTION = distribution;
  vi.resetModules();
  return (await import("../app.config")).default;
}

describe("release channel policy gates", () => {
  it("fails closed for Google Play", async () => {
    const config = await loadConfig("play");
    // No redirect scheme at all: native Google sign-in is certificate-bound,
    // and the retired browser OAuth flow must stay unreachable.
    expect(config.scheme).toBeUndefined();
    expect(config.android?.intentFilters).toBeUndefined();
    expect(config.android?.blockedPermissions).toContain(
      "android.permission.PACKAGE_USAGE_STATS",
    );
    expect(config.android?.blockedPermissions).toContain(
      "android.permission.READ_EXTERNAL_STORAGE",
    );
    expect(config.android?.blockedPermissions).toContain(
      "android.permission.WRITE_EXTERNAL_STORAGE",
    );
    expect(config.extra?.releaseFeatures).toEqual({
      childMonitoring: false,
    });
  });

  it("retains the sideload-only capabilities for GitHub builds", async () => {
    const config = await loadConfig("github");
    // Sideload builds keep the general navigation scheme only; the tombstoned
    // OAuth callback consumes no auth deep link in either channel.
    expect(config.scheme).toBe("rabbaanie");
    expect(config.android?.intentFilters).toBeUndefined();
    expect(config.android?.blockedPermissions).not.toContain(
      "android.permission.PACKAGE_USAGE_STATS",
    );
    expect(config.extra?.releaseFeatures).toEqual({
      childMonitoring: true,
    });
  });
});
