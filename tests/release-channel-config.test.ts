import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

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
    // The scheme IS set on Play, and that is deliberate. Leaving it undefined
    // crashed iOS on launch — expo-linking throws "Cannot make a deep link into
    // a standalone app with no custom scheme defined" the moment the bundle
    // starts — and this assertion is what made that look correct, because it
    // pinned the config value rather than the artifact.
    //
    // What Play's policy governs is the intent filter, not a string in the
    // embedded JS manifest, and that is asserted at the two layers that own it:
    // `android.intentFilters` below, and scripts/assert-play-artifact.sh, which
    // fails the build if the scheme survives into the AAB and runs in CI.
    expect(config.scheme).toBe("rabbaanie");
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
    // login.tsx keys the sign-up link off this exact value. If it stops being
    // "play" here, the Play build starts linking to rabbaanie.com, which sells
    // the subscription outside Play billing (anti-steering violation).
    expect(config.extra?.distribution).toBe("play");
  });

  it("defaults to the Play channel when APP_DISTRIBUTION is unset", async () => {
    delete process.env.APP_DISTRIBUTION;
    vi.resetModules();
    const config = (await import("../app.config")).default;
    expect(config.extra?.distribution).toBe("play");
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
    expect(config.extra?.distribution).toBe("github");
  });
});

/**
 * The channel a RUNNING app reports, which is a different question from every
 * describe above — those all read app.config.ts, a build-time artifact.
 *
 * iOS has no APP_DISTRIBUTION of its own and never will have a useful one: an
 * iOS build inherits whatever the Android default produced, which is "play",
 * so on an iPhone the configured value is simply false. Platform.OS is the
 * only source that cannot be forgotten at build time, so lib/distribution.ts
 * derives "apple" from it, and these tests pin that plus the two screens that
 * used to act on the wrong answer.
 *
 * Placed LAST on purpose. vi.doMock overrides for every import that follows
 * and outlives the test that registered it; app.config.ts imports neither
 * react-native nor expo-constants, so the describes above are out of reach —
 * but a describe appended BELOW this one would silently inherit these stubs.
 */
describe("runtime distribution channel", () => {
  afterAll(() => {
    for (const m of [
      "react-native",
      "expo-constants",
      "expo-application",
      "expo-file-system/legacy",
      "expo-intent-launcher",
      "@/hooks/use-colors",
      "@/lib/i18n",
    ]) {
      vi.doUnmock(m);
    }
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  const loadChannel = async (os: string, distribution: unknown) => {
    vi.resetModules();
    vi.doMock("react-native", () => ({ Platform: { OS: os } }));
    vi.doMock("expo-constants", () => ({
      default: { expoConfig: { extra: { distribution } } },
    }));
    return (await import("@/lib/distribution")).DISTRIBUTION_CHANNEL;
  };

  it("reports the App Store channel on iOS", async () => {
    expect(await loadChannel("ios", "play")).toBe("apple");
  });

  it("never lets an iOS build inherit the sideload channel", async () => {
    // Ordering, not a coincidence: the runtime platform is checked before the
    // configured value. "github" on an iPhone would arm the in-app APK
    // updater and the Stripe checkout button — an APK cannot install on iOS
    // at all, and an outside payment link is the one thing App Review looks
    // for. Fail-closed here means iOS wins over whatever the build was told.
    expect(await loadChannel("ios", "github")).toBe("apple");
  });

  it("leaves the Android and web channels exactly as they were", async () => {
    // Presence, not only absence: the sideload channel must KEEP reporting
    // "github", or the iOS fix silently switches off the APK updater that is
    // that channel's only way to update.
    expect(await loadChannel("android", "github")).toBe("github");
    expect(await loadChannel("android", "play")).toBe("play");
    expect(await loadChannel("android", "something-new")).toBe("play");
    expect(await loadChannel("android", undefined)).toBe("play");
    expect(await loadChannel("web", "play")).toBe("play");
  });

  const loadCouponChannel = async (os: string, distribution: unknown) => {
    vi.resetModules();
    vi.doMock("react-native", () => ({ Platform: { OS: os } }));
    vi.doMock("expo-constants", () => ({
      default: { expoConfig: { extra: { distribution } } },
    }));
    return (await import("@/lib/distribution")).couponPolicyChannel();
  };

  /**
   * The coupon endpoint refuses a PRICED coupon — money taken outside store
   * billing — only when the client says "play", and coerces every other value
   * to the permissive branch. So an honest "apple" here would quietly opt the
   * App Store build OUT of the refusal, which is Guideline 3.1.1.
   *
   * The invariant is therefore the REGIME, not the store name: everything that
   * is not the sideload channel must land in the strict bucket, including a
   * channel nobody has invented yet.
   */
  it("puts every store build in the strict coupon regime", async () => {
    expect(await loadCouponChannel("ios", "play")).toBe("play");
    expect(await loadCouponChannel("ios", "github")).toBe("play");
    expect(await loadCouponChannel("android", "play")).toBe("play");
    expect(await loadCouponChannel("android", "something-new")).toBe("play");
    expect(await loadCouponChannel("android", undefined)).toBe("play");
    // Presence too: the sideload channel must KEEP its own bucket, or paid
    // coupons stop working for the one channel that is allowed to sell them.
    expect(await loadCouponChannel("android", "github")).toBe("github");
  });

  /**
   * components/version-block-screen.tsx is undismissable and its single button
   * is the only way out. On iOS that button opened Google Play — a store an
   * iPhone cannot install from — which is both a dead end for the user and a
   * guaranteed App Review rejection.
   *
   * Reading the exported constant rather than matching the source: a string
   * match on the JSX breaks the day Prettier reflows it, and the tempting fix
   * for that failure is to loosen the string, which deletes the guard.
   */
  const loadBlockScreenUrl = async (os: string, distribution: string) => {
    vi.resetModules();
    vi.doMock("react-native", () => ({
      Platform: { OS: os },
      View: () => null,
      Text: () => null,
      TouchableOpacity: () => null,
      StyleSheet: { create: (s: unknown) => s },
      Linking: { openURL: async () => true },
    }));
    vi.doMock("expo-constants", () => ({
      default: { expoConfig: { extra: { distribution } } },
    }));
    vi.doMock("@/hooks/use-colors", () => ({ useColors: () => ({}) }));
    vi.doMock("@/lib/i18n", () => ({ useI18n: () => ({ language: "en" }) }));
    return (await import("@/components/version-block-screen")).DOWNLOAD_URL;
  };

  it("gives a blocked iOS user a destination that exists and offers no APK", async () => {
    // Two invariants, and the second was missed the first time round.
    //
    // A WORKING destination, not merely "no Play URL" — a check for absence
    // alone passes just as happily when the button loses its link entirely and
    // the only exit from this undismissable screen becomes a no-op.
    //
    // And not the SIDELOAD page. `?p=app` is where the Android APK is offered
    // (assert-sideload-artifact.sh treats it as the distribution point), so
    // reusing it for iOS swapped a wrong-store link for an in-app route to
    // obtain the app outside the App Store — on the one screen a user cannot
    // leave, in front of a reviewer. Worse than the bug it replaced.
    const url = await loadBlockScreenUrl("ios", "play");
    expect(url).toBe("https://rabbaanie.com/");
    expect(url).not.toContain("?p=app");
    expect(url).not.toContain("play.google.com");
  });

  it("still sends a blocked Play user to Play", async () => {
    expect(await loadBlockScreenUrl("android", "play")).toBe(
      "https://play.google.com/store/apps/details?id=com.rabbaanie.app",
    );
  });

  it("still sends a blocked sideload user to the download page", async () => {
    expect(await loadBlockScreenUrl("android", "github")).toBe(
      "https://rabbaanie.com/?p=app",
    );
  });

  /**
   * hooks/use-updates.ts told iOS users "Updates are only available in the
   * Android app". Settings renders no update control on iOS, but that was
   * never the only caller: a push of type app_update calls checkForUpdate(false)
   * directly (hooks/use-push-notifications.ts, whose response listener guards
   * only web), so the message was reachable on an iPhone.
   */
  const loadUpdates = async (os: string, distribution: string) => {
    vi.resetModules();
    vi.stubGlobal("__DEV__", false);
    const openURL = vi.fn(async (_url: string) => true);
    const alert = vi.fn();
    vi.doMock("react-native", () => ({
      Alert: { alert },
      Linking: { openURL },
      Platform: { OS: os },
    }));
    vi.doMock("expo-constants", () => ({
      default: { expoConfig: { extra: { distribution }, version: "1.6.0" } },
    }));
    vi.doMock("expo-application", () => ({
      nativeApplicationVersion: "1.6.0",
    }));
    // Nothing on the iOS path touches the filesystem or the installer intent;
    // these exist only so the module's imports resolve.
    vi.doMock("expo-file-system/legacy", () => ({}));
    vi.doMock("expo-intent-launcher", () => ({}));
    return { mod: await import("@/hooks/use-updates"), openURL, alert };
  };

  /**
   * The invariant that makes an iOS-specific update message unnecessary.
   *
   * This replaced a test that called checkForUpdate("ios") directly and asserted
   * the alert named the App Store. That assertion covered an `else if
   * (DISTRIBUTION_CHANNEL === "apple")` arm which NOTHING invokes in production:
   * Settings wraps its updater control in `UPDATER_ENABLED &&`, false on iOS,
   * and the app_update push returns before calling because
   * registerForPushNotificationsAsync yields null on any non-Android platform.
   * Eight lines of unreachable code and a test that only reached them by
   * bypassing both gates — the "just in case" leftover the Bloat Audit names.
   * Both are gone.
   *
   * What is pinned instead is the reason they were unnecessary, and unlike the
   * assertion it replaces this one is about a path that actually runs: iOS is
   * never offered an in-app updater at all. If that ever changes, this test
   * fails and whoever changed it has to decide what iOS should be told —
   * which is the decision the deleted arm was pre-empting on their behalf.
   */
  it("never offers an in-app updater on iOS, on any channel", async () => {
    // Both channels: "play" is the App Store build, and "github" proves the
    // gate is the PLATFORM, not the channel — a flag flipped in the build
    // environment must not arm an updater iOS cannot use.
    expect((await loadUpdates("ios", "play")).mod.UPDATER_ENABLED).toBe(false);
    expect((await loadUpdates("ios", "github")).mod.UPDATER_ENABLED).toBe(
      false,
    );
  });

  it("stays silent on a background iOS check", async () => {
    const { mod, openURL, alert } = await loadUpdates("ios", "play");
    await mod.checkForUpdate(true);
    expect(alert).not.toHaveBeenCalled();
    expect(openURL).not.toHaveBeenCalled();
  });

  it("cannot arm the APK updater on iOS, whatever the build was configured as", async () => {
    // Structural, not incidental. UPDATER_ENABLED used to read
    // extra.distribution directly, so an iOS build made with
    // APP_DISTRIBUTION=github turned the APK updater on — and Settings gates
    // its download controls on this flag alone, with no platform check.
    expect((await loadUpdates("ios", "github")).mod.UPDATER_ENABLED).toBe(
      false,
    );
    expect((await loadUpdates("ios", "github")).mod.PLAY_UPDATE_HANDOFF).toBe(
      false,
    );
    // Presence: Android's sideload updater must survive the iOS fix.
    expect((await loadUpdates("android", "github")).mod.UPDATER_ENABLED).toBe(
      true,
    );
    expect((await loadUpdates("android", "play")).mod.UPDATER_ENABLED).toBe(
      false,
    );
  });
});
