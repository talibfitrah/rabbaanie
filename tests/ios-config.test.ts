import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

import { ADHAN_SOUND_IDS } from "../lib/adhan-sound-ids.js";

// Why introspection and not `import config from "../app.config"`.
//
// Almost none of the keys below live in app.config.ts's static `ios` block.
// @expo/prebuild-config AUTO-APPLIES a config plugin for every installed
// package (withVersionedExpoSDKPlugins / withLegacyExpoPlugins), whether or not
// the package appears in `plugins` — so expo-camera, expo-notifications,
// expo-location, expo-task-manager and friends inject Info.plist keys and
// entitlements at prebuild time, and app.config.ts removes several of them
// again with mods. A test that asserted against the raw exported object would
// see none of that: it would pass while the shipped archive still carried
// `aps-environment` and an English "Allow $(PRODUCT_NAME)…" purpose string.
// That is the test-that-cannot-fail this file exists to avoid.
//
// `expo config --type introspect` runs the entire mod chain in memory and
// returns what prebuild WOULD write. It never touches ios/ — introspection
// substitutes read-only base mods and drops dangerous mods entirely (see
// mod-compiler.js: "Remove all mods that don't have an introspection base mod,
// for instance `dangerous` mods").
//
// That last point is the known gap. withIosLocalizedPurposeStrings is a
// withXcodeProject mod — it calls IOSConfig.Locales.setLocalesAsync, which has
// to register the files in the pbxproj as well as write them — and xcodeproj
// has no introspection base either, so the ar/nl/en .lproj files it writes are
// NOT covered here. The same is true of withIosAdhanSounds and its .caf files.
//
// CFBundleLocalizations and CFBundleDevelopmentRegion below are the closest
// observable proxy: they prove the app DECLARES the localizations, not that the
// strings landed. scripts/assert-ios-artifact.sh owns that half, by reading the
// built bundle.

const repoRoot = path.resolve(__dirname, "..");

type PrivacyManifests = {
  NSPrivacyTracking?: boolean;
  NSPrivacyTrackingDomains?: string[];
  NSPrivacyAccessedAPITypes?: Array<{
    NSPrivacyAccessedAPIType: string;
    NSPrivacyAccessedAPITypeReasons: string[];
  }>;
  NSPrivacyCollectedDataTypes?: Array<{
    NSPrivacyCollectedDataType: string;
    NSPrivacyCollectedDataTypeLinked: boolean;
    NSPrivacyCollectedDataTypeTracking: boolean;
    NSPrivacyCollectedDataTypePurposes: string[];
  }>;
};

type AppTransportSecurity = {
  NSAllowsArbitraryLoads?: boolean;
  NSAllowsLocalNetworking?: boolean;
  NSExceptionDomains?: Record<
    string,
    { NSExceptionAllowsInsecureHTTPLoads?: boolean }
  >;
};

type Introspected = {
  plugins?: Array<string | [string, Record<string, unknown>]>;
  ios: {
    supportsTablet?: boolean;
    bundleIdentifier?: string;
    infoPlist?: Record<string, unknown>;
    entitlements?: Record<string, unknown>;
    privacyManifests?: PrivacyManifests;
  };
  _internal: {
    modResults: { ios: { podfileProperties: Record<string, string> } };
  };
};

let ios: Introspected["ios"];
let infoPlist: Record<string, unknown>;
let podfileProperties: Record<string, string>;
let plugins: NonNullable<Introspected["plugins"]>;

beforeAll(() => {
  const stdout = execFileSync(
    path.join(repoRoot, "node_modules/.bin/expo"),
    ["config", "--type", "introspect", "--json"],
    {
      cwd: repoRoot,
      encoding: "utf8",
      // Pinned rather than inherited. APP_DISTRIBUTION changes the Android half
      // of the config, and tests/release-channel-config.test.ts flips it in the
      // parent process; "play" is the store-submission channel this file is
      // about, so pin it and keep the subprocess deterministic either way.
      env: { ...process.env, APP_DISTRIBUTION: "play" },
    },
  );
  const config = JSON.parse(stdout) as Introspected;
  ios = config.ios;
  infoPlist = config.ios.infoPlist ?? {};
  podfileProperties = config._internal.modResults.ios.podfileProperties;
  plugins = config.plugins ?? [];
}, 60_000);

describe("iOS config — capabilities the app does not have", () => {
  // Each of these is injected by an auto-applied plugin for a feature this app
  // never exercises. Apple rejects unjustified declarations, and a `development`
  // aps-environment additionally fails to sign against a distribution profile.
  // Checked by CONTENT, not by presence, so this agrees with the config it
  // guards. withoutUnusedIosCapabilities subtracts "fetch" and KEEPS the key
  // when another mode remains — deliberately, so a legitimate mode added later
  // (background "audio" for the adhan, say) is not silently erased by a mod
  // that runs last over everything. Asserting the key is absent would fail a
  // build the config produced on purpose, and the tempting fix for that failure
  // is to delete the assertion.
  //
  // "fetch" is the one that must never ship: expo-task-manager and
  // expo-background-fetch inject it unconditionally whenever linked, for a task
  // that never registers on iOS (lib/widget-background-task.ts returns early on
  // any non-Android platform). Apple asks what it is for; there is no answer.
  it("declares no background fetch mode", () => {
    const modes = infoPlist.UIBackgroundModes as string[] | undefined;
    expect(modes ?? []).not.toContain("fetch");
  });

  it("requests no push entitlement", () => {
    // The object itself first. `ios.entitlements ?? {}` made this pass on a
    // config that declares no entitlements at all — the absence check would
    // have been green on exactly the regression that deletes the block, and
    // the time-sensitive entitlement with it.
    expect(ios.entitlements).toBeTruthy();
    expect(ios.entitlements).not.toHaveProperty("aps-environment");
  });

  it("requests no microphone access", () => {
    expect(infoPlist).not.toHaveProperty("NSMicrophoneUsageDescription");
  });

  // The only ImagePicker calls sit behind ATTACHMENTS_ENABLED in
  // app/ai-chat.tsx, which is false unless DISTRIBUTION_CHANNEL is "github" —
  // so an App Store build has no reachable photo-library path at all. Nothing
  // writes back to the library either, which is why there is no
  // NSPhotoLibraryAddUsageDescription to check for.
  it("requests no photo library access", () => {
    expect(infoPlist).not.toHaveProperty("NSPhotoLibraryUsageDescription");
    expect(infoPlist).not.toHaveProperty("NSPhotoLibraryAddUsageDescription");
  });

  it("requests no background location access", () => {
    expect(infoPlist).not.toHaveProperty("NSLocationAlwaysUsageDescription");
    expect(infoPlist).not.toHaveProperty(
      "NSLocationAlwaysAndWhenInUseUsageDescription",
    );
  });
});

describe("iOS config — capabilities the app does have", () => {
  // The mirror of the block above, and the more important half: a mod that
  // strips keys can strip one key too many, and a plugin option of `false`
  // deletes rather than overrides. Without these, the whole permission surface
  // could vanish and every test above would still be green.
  const PURPOSE_STRINGS = [
    "NSCameraUsageDescription",
    "NSMotionUsageDescription",
    "NSLocationWhenInUseUsageDescription",
  ];

  it.each(PURPOSE_STRINGS)("%s is a real, written purpose string", (key) => {
    const value = infoPlist[key];
    expect(typeof value).toBe("string");
    expect((value as string).trim()).not.toBe("");
    // The plugin defaults are "Allow $(PRODUCT_NAME) to access your camera"
    // and friends. They satisfy "key is present" while telling an App Review
    // reader nothing, in a language most of this app's users do not read, so
    // presence alone is not the invariant — authorship is.
    //
    // Matched by SHAPE, not by the literal token. Xcode expands
    // $(PRODUCT_NAME) at build time, so the artifact a regression actually
    // ships reads "Allow Rabbaanie to access your camera" — a guard anchored
    // on the literal "$(PRODUCT_NAME)" would pass on exactly the build that
    // matters most.
    expect(value).not.toMatch(/^Allow .* to access your /);
  });

  it("declares the three shipped languages for those strings", () => {
    expect(infoPlist.CFBundleLocalizations).toEqual(
      expect.arrayContaining(["ar", "nl", "en"]),
    );
    expect(typeof infoPlist.CFBundleDevelopmentRegion).toBe("string");
  });

  it("declares export compliance", () => {
    expect(infoPlist.ITSAppUsesNonExemptEncryption).toBe(false);
  });

  it("keeps the shipped bundle identifier", () => {
    expect(ios.bundleIdentifier).toBe("com.rabbaanie.app");
  });

  it("supports iPad", () => {
    expect(ios.supportsTablet).toBe(true);
  });

  /**
   * Every prayer, adhan and iqamah notification is scheduled with
   * interruptionLevel: "timeSensitive". Unentitled, iOS does NOT reject that —
   * it downgrades the notification to "active", with no error, no log and no
   * build failure, and the adhan quietly stops piercing Focus and Do Not
   * Disturb. The one situation the feature exists for is the one it fails in.
   *
   * Read by VALUE. The entitlement is a boolean and a `false` is as inert as a
   * missing key, so presence is not the invariant; `toBe(true)` also refuses
   * the `undefined` a missing key reads as, which an `=== undefined`-shaped
   * comparison would have accepted as agreement.
   *
   * Paired with "requests no push entitlement" above: one key present, one
   * absent, in the same object, and neither passes if that object is gone.
   */
  it("requests the time-sensitive notification entitlement", () => {
    expect(
      ios.entitlements?.[
        "com.apple.developer.usernotifications.time-sensitive"
      ],
      "unentitled, iOS silently downgrades timeSensitive to active",
    ).toBe(true);
  });

  it("carries a build number App Store Connect will accept", () => {
    // "1" is what Expo defaults CFBundleVersion to when ios.buildNumber is
    // unset. App Store Connect refuses a build number already used for this
    // marketing version, so the default is a one-shot value: it works for the
    // very first upload and blocks every one after it.
    expect(typeof infoPlist.CFBundleVersion).toBe("string");
    expect(infoPlist.CFBundleVersion).not.toBe("1");
  });

  it("pins an iOS deployment target the native dependencies can build against", () => {
    // The pinned value, not merely a truthy one: "13.4" satisfies toBeTruthy()
    // and does not build against these native deps. Belt-and-braces only —
    // ios/Podfile falls back to '15.1' on its own when the property is absent,
    // so what this actually catches is the config drifting BELOW the Podfile's
    // floor, which the fallback cannot.
    expect(podfileProperties["ios.deploymentTarget"]).toBe("15.1");
  });

  /**
   * The seam that broke once, and the reason it is pinned here rather than in
   * tests/adhan-ios-sound.test.ts.
   *
   * Two halves must agree for a custom adhan to play on iOS: lib/
   * notifications.ts NAMES a file in content.sound, and something has to COPY
   * that file into the bundle and register it in the Xcode project. Both halves
   * were written by different people, each believing the other did the copying,
   * and neither had. The sound test passed (it only checks assets/), the config
   * test passed (it did not look), and a real prebuild produced an app with zero
   * .caf files in it. Nothing reports that at runtime — UNNotificationSound
   * does not throw on a name it cannot resolve, iOS plays the system default.
   *
   * The obvious repair, a ["expo-notifications", { sounds }] entry, was then
   * ALSO wrong: that plugin applies its Android half from the same props and
   * copies every file into android/res/raw, putting ~1.6 MB of .caf into the
   * shipping Play AAB for files Android can never play. So the copy runs
   * through withIosAdhanSounds, an iOS-only mod, and this test pins both
   * directions — the iOS plugin present, the both-platform entry absent.
   *
   * Note what is NOT covered: withIosAdhanSounds is a withXcodeProject mod, and
   * introspection drops mods with no introspection base. That the files reach
   * the built bundle is scripts/assert-ios-artifact.sh's half.
   */
  it("bundles a sound file for every adhan the app can name", () => {
    const names = plugins.map((p) => (Array.isArray(p) ? p[0] : p));
    expect(
      names,
      "withIosAdhanSounds must be registered or no .caf reaches the bundle",
    ).toContain("withIosAdhanSounds");

    // The both-platform entry must not come back: it is the spelling that
    // silently pollutes the Android release.
    const notifEntry = plugins.find(
      (p): p is [string, Record<string, unknown>] =>
        Array.isArray(p) && p[0] === "expo-notifications",
    );
    expect(
      notifEntry?.[1]?.sounds,
      "expo-notifications { sounds } copies into android/res/raw too — use the iOS-only mod",
    ).toBeUndefined();

    // And the files the mod will look for must exist, or prebuild throws.
    for (const id of ADHAN_SOUND_IDS) {
      const rel = `assets/sounds/adhan_${id}.caf`;
      expect(
        fs.existsSync(path.join(repoRoot, rel)),
        `${rel} is named by adhanSoundFile() but absent from the repo`,
      ).toBe(true);
    }
  });

  /**
   * Expo's iOS template ships NSAllowsArbitraryLoads: true for Metro. Left in,
   * a release build opts out of App Transport Security wholesale and App Review
   * asks why — with no answer available, because the app makes no cleartext
   * request at all.
   *
   * Asserted in both directions on purpose. Deleting NSAppTransportSecurity
   * outright would satisfy "arbitrary loads must be off" while silently
   * removing the localhost and local-networking allowances a dev build needs,
   * and nobody would notice until Metro stopped connecting.
   */

  it("does not opt out of App Transport Security", () => {
    const ats = infoPlist.NSAppTransportSecurity as
      | AppTransportSecurity
      | undefined;
    expect(ats).toBeTruthy();
    expect(ats?.NSAllowsArbitraryLoads).toBe(false);
    expect(ats?.NSAllowsLocalNetworking).toBe(true);
    expect(
      ats?.NSExceptionDomains?.localhost?.NSExceptionAllowsInsecureHTTPLoads,
    ).toBe(true);
  });

  /**
   * Missing entirely, a privacy manifest is ITMS-91053 at upload. Present but
   * wrong is its own rejection, so this pins the shape rather than merely that
   * the key exists — and pins tracking as FALSE, which is the claim Apple
   * actually cross-checks against the binary.
   */
  it("ships a privacy manifest that declares no tracking", () => {
    const pm = ios.privacyManifests;
    expect(pm).toBeTruthy();
    expect(pm?.NSPrivacyTracking).toBe(false);
    expect(pm?.NSPrivacyTrackingDomains).toEqual([]);

    // Required-reason APIs: the categories first-party code actually reaches,
    // each with at least one reason code. A category declared with an empty
    // reason list is rejected by Apple, and would pass a mere-presence check.
    const apiTypes = pm?.NSPrivacyAccessedAPITypes ?? [];
    expect(apiTypes.map((e) => e.NSPrivacyAccessedAPIType).sort()).toEqual([
      "NSPrivacyAccessedAPICategoryFileTimestamp",
      "NSPrivacyAccessedAPICategoryUserDefaults",
    ]);
    for (const entry of apiTypes) {
      expect(entry.NSPrivacyAccessedAPITypeReasons.length).toBeGreaterThan(0);
    }

    // Collected data: nothing may claim to be used for tracking, and every
    // entry needs a purpose. Both are cross-checked by App Review against the
    // privacy answers given in App Store Connect.
    const collected = pm?.NSPrivacyCollectedDataTypes ?? [];
    expect(collected.length).toBeGreaterThan(0);
    for (const entry of collected) {
      expect(entry.NSPrivacyCollectedDataTypeTracking).toBe(false);
      expect(entry.NSPrivacyCollectedDataTypePurposes.length).toBeGreaterThan(
        0,
      );
    }
  });
});

/**
 * Everything above reads the CONFIG. Three of the things that matter most —
 * the .lproj strings, the .caf sounds, and the merged PrivacyInfo.xcprivacy —
 * are written by mods introspection cannot see, so only
 * scripts/assert-ios-artifact.sh can check them, by reading the built bundle.
 *
 * That script has no CI to live in: the iOS release is a local Xcode archive,
 * unlike the Play build which runs assert-play-artifact.sh from
 * .github/workflows/play-release.yml. An unreferenced script rots — a check
 * gets deleted to make a build pass and nobody notices until a submission.
 *
 * So pin its COVERAGE here, the same way tests/play-store-compliance.test.ts
 * pins assert-play-artifact.sh's. This asserts the gate still looks for each
 * thing, not how it spells the looking; a check that is removed outright fails
 * this test, which is the rot it exists to catch.
 */
describe("the iOS artifact gate still covers what the config cannot", () => {
  // Comment-only lines are dropped before matching. The script explains most
  // of these tokens in prose, so grepping its full text made 9 of the 15 rows
  // below vacuous — deleting the executable `aps-environment` block left four
  // comments still naming it and the row stayed green, which is the rot this
  // describe block exists to catch rather than an instance of it.
  //
  // Measured by deleting each row's executable lines in turn: every row is red
  // under its own mutation now, and exactly one row per mutation.
  //
  // Only WHOLE-LINE comments go: a `#` further along a line can sit inside a
  // quoted string or a grep pattern, where it is not a comment at all, so
  // those lines are left intact rather than half-parsed.
  const gate = fs
    .readFileSync(path.join(repoRoot, "scripts/assert-ios-artifact.sh"), "utf8")
    .split("\n")
    .filter((line) => !/^\s*#/.test(line))
    .join("\n");

  // Matched as whole words, not substrings. `toContain("NSPrivacyTracking")` is
  // satisfied by `NSPrivacyTrackingDomains`, so two of these assertions would
  // have been checking each other rather than the gate — and deleting the
  // tracking check would have stayed green because the domains check spells it
  // as a prefix. Caught by watching the red case fail to fail.
  const checks = (token: string) =>
    new RegExp(`\\b${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(
      gate,
    );

  it.each([
    // Written by mods introspection drops — nothing else can see these.
    ["localized purpose strings", "InfoPlist.strings"],
    ["bundled adhan sounds", "ADHAN_SOUND_IDS"],
    // Merged additively by setPrivacyInfo, so a stale value survives every
    // config edit and only the shipped file tells the truth.
    ["privacy manifest tracking flag", "NSPrivacyTracking"],
    ["tracking domains", "NSPrivacyTrackingDomains"],
    ["per-type tracking flags", "NSPrivacyCollectedDataTypeTracking"],
    // Keys the config removes, which a merged prebuild can silently restore.
    ["microphone", "NSMicrophoneUsageDescription"],
    ["always-location", "NSLocationAlwaysUsageDescription"],
    ["photo library", "NSPhotoLibraryUsageDescription"],
    ["tracking string", "NSUserTrackingUsageDescription"],
    ["background fetch", "UIBackgroundModes"],
    ["push entitlement", "aps-environment"],
    // The mirror of the line above: a capability that must be PRESENT. Without
    // it iOS silently DOWNGRADES every interruptionLevel: "timeSensitive"
    // notification to "active" — no error, no log — so the adhan stops piercing
    // Focus and Do Not Disturb. Entitlements are not in Info.plist, so only the
    // gate can see whether one survived into the artifact.
    [
      "time-sensitive entitlement",
      "com.apple.developer.usernotifications.time-sensitive",
    ],
    // Identity and version, where a wrong value is rejected at upload.
    ["bundle id", "com.rabbaanie.app"],
    ["export compliance", "ITSAppUsesNonExemptEncryption"],
    ["build number", "CFBundleVersion"],
  ])("checks %s", (_label, token) => {
    expect(checks(token)).toBe(true);
  });

  it("refuses an artifact it cannot read rather than passing it", () => {
    // The failure mode that makes a gate worse than no gate. A built
    // Info.plist is a BINARY plist, so a plain grep finds nothing in it and an
    // unparsed artifact would score a clean sweep of every absence check.
    expect(gate).toContain("plutil");
    expect(gate).toContain("refusing to ship unverified");
  });
});

/**
 * The two mods introspection provably cannot see, pinned as REGISTERED.
 *
 * withIosLocalizedPurposeStrings and withIosAdhanSounds are withXcodeProject
 * mods, and withIntrospectionBaseMods deletes every mod without an introspective
 * base — which is why the rest of this file cannot observe their effects and why
 * scripts/assert-ios-artifact.sh exists to read the built bundle instead.
 *
 * But that script is wired into no workflow: unlike its Play sibling
 * (.github/workflows/play-release.yml), it runs only when a human remembers
 * `pnpm assert:ios`. So if either mod stops being applied, every automated check
 * still passes — the build succeeds, the chosen adhan silently falls back to the
 * system sound, and the Arabic and Dutch purpose strings become English
 * boilerplate in front of a reviewer.
 *
 * This cannot verify that the mods WORKED — only the artifact gate can, and this
 * comment is not a substitute for running it. What it verifies is the failure
 * mode nothing else covers and that costs nothing to check: that they are still
 * plugged in. Registration is necessary, not sufficient.
 */
describe("the iOS-only mods are still registered", () => {
  // Whitespace collapsed: `plugins` entries are formatted as a list and a
  // reformat moves them. See tests/subscription-auth.test.ts for why matching
  // source text without normalising is a guard that dies on its own formatter.
  const configSource = fs
    .readFileSync(path.join(repoRoot, "app.config.ts"), "utf8")
    .replace(/\s+/g, " ");

  it.each([
    ["localized purpose strings", "withIosLocalizedPurposeStrings"],
    ["bundled adhan CAFs", "withIosAdhanSounds"],
    ["the unused-capability removal", "withoutUnusedIosCapabilities"],
  ])("still applies the mod for %s", (_label, mod) => {
    // Declared AND applied. Matching the name alone would be satisfied by the
    // declaration that remains after someone deletes it from the plugins list —
    // the exact regression this exists to catch.
    expect(
      configSource,
      `${mod} is no longer declared in app.config.ts`,
    ).toContain(`const ${mod}: ConfigPlugin`);
    expect(
      configSource,
      `${mod} is declared but no longer applied — the mod silently stops running ` +
        "and only scripts/assert-ios-artifact.sh, which no workflow runs, would notice",
    ).toContain(`${mod} as any`);
  });
});
