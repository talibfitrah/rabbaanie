import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// constants/oauth pulls in react-native, which ships Flow-typed source that
// vitest cannot parse. Same stub the other suites use.
vi.mock("@/constants/oauth", () => ({
  getApiBaseUrl: () => "https://api.example.com",
}));
// publicFetch's module graph reaches lib/_core/auth, which imports react-native
// and native storage. Stubbing them is what let this hook route through the
// transport layer instead of being written down as an exception to it.
vi.mock("react-native", () => ({ Platform: { OS: "android" } }));
vi.mock("expo-secure-store", () => ({
  getItemAsync: vi.fn().mockResolvedValue(null),
  setItemAsync: vi.fn().mockResolvedValue(undefined),
  deleteItemAsync: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn().mockResolvedValue(null),
    setItem: vi.fn().mockResolvedValue(undefined),
    removeItem: vi.fn().mockResolvedValue(undefined),
  },
}));
// publicFetch also reads the app version from here for X-App-Version — same
// stub the other transport-layer suites use, so this doesn't reach expo-*.
vi.mock("@/hooks/use-updates", () => ({ INSTALLED_VERSION: "1.5.1" }));

const { safeHttpsUrl, safePhone } = await import("@/hooks/use-remote-config");

/**
 * GET /api/public/config supplies two values that end up as arguments to
 * `Linking.openURL` on the home tab and in Settings. They are attacker-relevant
 * because they arrive over the network *after* the build ships: nothing about
 * them is reviewed by Play, pinned in the APK, or re-checked at the call sites.
 *
 * The donate link is live in production today
 * (https://pay.albunyaan.tv/b/... — a Stripe payment link), so this is not a
 * hypothetical field, and it renders on BOTH release channels.
 */
describe("remote config is validated at the network trust boundary", () => {
  it("keeps a normal https link", () => {
    const live = "https://pay.albunyaan.tv/b/6oUeVd4UX5qOdSh0LUbjW0x";
    expect(safeHttpsUrl(live)).toBe(live);
  });

  const REJECTED: unknown[] = [
    // Android resolves intent:// through Linking.openURL, which can start an
    // arbitrary exported component of any installed app.
    "intent://scan/#Intent;scheme=zxing;package=com.evil.app;end",
    "javascript:alert(1)",
    "file:///data/data/com.rabbaanie.app/databases/app.db",
    "content://com.android.contacts/contacts",
    // Plain http is downgradeable on a hostile network, and the donate link is
    // a payment page, so it is exactly the one that must not be.
    "http://pay.albunyaan.tv/b/x",
    "not a url at all",
    "",
    null,
    undefined,
  ];
  it.each(REJECTED)("rejects %o", (input) => {
    expect(safeHttpsUrl(input)).toBe("");
  });

  it("returns the parsed URL, not the raw input", () => {
    // "https:/\/evil.example" parses to https://evil.example/ — returning the
    // raw string would mean the URL that was validated and the URL that gets
    // opened are different strings.
    expect(safeHttpsUrl("https:/\\/evil.example")).toBe("https://evil.example/");
    expect(safeHttpsUrl("  https://pay.albunyaan.tv/x  ")).toBe(
      "https://pay.albunyaan.tv/x",
    );
  });

  it("does NOT allowlist the host — documented limitation", () => {
    // Userinfo puts the real host after the "@": this resolves to
    // evil.example, and it is allowed through because the protocol genuinely
    // is https:. That is deliberate. The value is served by our own API over
    // TLS, so a hostile value means the API is already compromised, and at
    // that point a host allowlist buys nothing. What this guard exists to stop
    // is scheme abuse — intent://, file://, content:// — which is reachable
    // without compromising anything else and escalates outside the app.
    expect(safeHttpsUrl("https://pay.albunyaan.tv@evil.example/x")).toBe(
      "https://pay.albunyaan.tv@evil.example/x",
    );
  });

  it("reduces the WhatsApp number to digits", () => {
    expect(safePhone("212783490852")).toBe("212783490852");
    expect(safePhone("+212 783-490-852")).toBe("212783490852");
    // It is interpolated into `https://wa.me/${wa}?text=...`, so anything that
    // could add path or query segments has to go.
    // Every "/", ".", "?", "=" and letter is gone, so nothing can add a path
    // or query segment. The trailing 1 is the digit from "x=1".
    expect(safePhone("212783490852/../../evil?x=1")).toBe("2127834908521");
    expect(safePhone(null)).toBe("");
  });

  it("routes both call sites through the validated hook, not the raw response", () => {
    // The guard is only worth anything while nothing re-reads the endpoint.
    for (const p of ["app/(tabs)/index.tsx", "app/(tabs)/settings.tsx"]) {
      const src = readFileSync(join(__dirname, "..", p), "utf8");
      expect(src).toContain("useRemoteConfig");
      expect(src).not.toContain("/api/public/config");
    }
  });
});
