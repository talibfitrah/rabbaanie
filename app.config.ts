// Load environment variables with proper priority (system > .env)
import "./scripts/load-env.js";
import type { ExpoConfig } from "expo/config";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  AndroidConfig,
  type ConfigPlugin,
  IOSConfig,
  withAndroidManifest,
  withDangerousMod,
  withEntitlementsPlist,
  withInfoPlist,
  withSettingsGradle,
  withXcodeProject,
} from "@expo/config-plugins";
import { ADHAN_SOUND_IDS } from "./lib/adhan-sound-ids.js";
import {
  APP_PACKAGE,
  APP_SCHEME,
  GOOGLE_IOS_CLIENT_ID,
  GOOGLE_WEB_CLIENT_ID,
} from "./constants/app-identity.js";

/**
 * Google client id -> the reversed-domain URL scheme its SDK redirects back on:
 * `abc-xyz.apps.googleusercontent.com` -> `com.googleusercontent.apps.abc-xyz`.
 *
 * Derived rather than written out twice. The previous hard-coded literal was
 * the reversed WEB client id, which no iOS OAuth client will ever redirect to;
 * spelling it out a second time is what let the two drift silently.
 */
function reversedClientId(clientId: string): string {
  const suffix = ".apps.googleusercontent.com";
  if (!clientId.endsWith(suffix)) {
    throw new Error(
      `Google client id must end in "${suffix}", got: ${clientId}`,
    );
  }
  return `com.googleusercontent.apps.${clientId.slice(0, -suffix.length)}`;
}

const env = {
  // App branding - update these values directly (do not use env vars)
  appName: "\u0631\u0628\u0651\u0627\u0646\u064A\u0651",
  // Left at the old value on purpose. The slug is Expo project identity, never
  // shown to users and absent from the Play listing, so renaming it buys nothing
  // for the store submission while touching how the project is identified to
  // Expo tooling right before the first release. Change it separately if ever.
  appSlug: "opvoedadvies_apk",
  // S3 URL of the app logo - set this to the URL returned by generate_image when creating custom logo
  // Leave empty to use the default icon from assets/images/icon.png
  logoUrl:
    "https://d2xsxph8kpxj0f.cloudfront.net/310519663343602506/hDLuUkY85hL92tUfMz5bZ4/logo_hands_circle_notext-6n223JNfdi7RAqyCbpkijv.png",
  scheme: APP_SCHEME,
  iosBundleId: APP_PACKAGE,
  androidPackage: APP_PACKAGE,
};

// Which channel this build is for. Google Play forbids an app distributed on
// Play from updating itself outside Play's own mechanism, so the Play build must
// ship WITHOUT the in-app APK updater and WITHOUT REQUEST_INSTALL_PACKAGES.
// Defaults to "play" so a forgotten env var yields the restricted (safe) build
// rather than silently shipping the forbidden permission to the Play Console.
//
// Namespaced: a bare DISTRIBUTION is commonly set by container images and distro
// tooling, and because an unrecognised value throws, that collision would break
// every expo command (including the config regeneration Gradle runs in preBuild)
// on any machine that happens to define it.
const DISTRIBUTION = process.env.APP_DISTRIBUTION ?? "play";
if (DISTRIBUTION !== "play" && DISTRIBUTION !== "github") {
  throw new Error(
    `APP_DISTRIBUTION must be "play" or "github", got "${DISTRIBUTION}"`,
  );
}
const isGithubBuild = DISTRIBUTION === "github";
const USAGE_STATS_MODULE = "expo-usage-stats";

// Custom schemes the Play artifact must never expose: the sideload navigation
// scheme and the retired OAuth callback scheme. Both are stripped from stale
// prebuild output because expo prebuild reuses an existing android/ directory.
const RETIRED_APP_SCHEMES: Array<string | undefined> = [
  env.scheme,
  `${env.androidPackage}.auth`,
];

// The local usage-stats module declares both PACKAGE_USAGE_STATS and
// isMonitoringTool. Google Play only accepts monitoring apps that are
// exclusively designed and marketed for monitoring; Rabbaanie is a broader
// parenting program. The Play variant excludes the native module at Gradle
// autolinking time and removes stale manifest declarations. The GitHub/sideload
// variant keeps the native capability.
const AUTOLINK_EXCLUSION = `expoAutolinking.exclude = ["${USAGE_STATS_MODULE}"]`;

const withPlayMonitoringDisabled: ConfigPlugin = (config) => {
  // The github branch does NOT just skip — it actively undoes what a previous
  // Play prebuild wrote. `android/` is reused unless --clean is passed, so a
  // one-directional plugin that only ADDS the exclusion leaves it behind: run a
  // Play prebuild, then a github one, and the sideload build silently ships
  // with no usage-stats module, no PACKAGE_USAGE_STATS and no isMonitoringTool.
  // That happened for real — a 1.4.85 sideload APK built this way lost the
  // monitoring capability entirely, and neither Gradle nor any test noticed,
  // because everything about it is valid; it is just missing a feature.
  if (isGithubBuild) {
    const withoutStaleExclusion = withSettingsGradle(config, (modConfig) => {
      modConfig.modResults.contents = modConfig.modResults.contents
        .split("\n")
        .filter((line) => line.trim() !== AUTOLINK_EXCLUSION)
        .join("\n");
      return modConfig;
    });

    // Second layer of the same problem. Re-linking the native module is not
    // enough: `blockedPermissions` and the meta-data mod below write
    // tools:node="remove" entries into android/app/src/main/AndroidManifest.xml
    // for a Play build, prebuild MERGES into that file rather than regenerating
    // it, and nothing takes those entries back out when the block list shrinks.
    // So the module compiled in (bytecode present) while its own manifest
    // declarations were stripped on the way through — PACKAGE_USAGE_STATS and
    // isMonitoringTool both absent from an APK that otherwise looked correct.
    // Only the ones github actually needs are undone; SYSTEM_ALERT_WINDOW,
    // RECORD_AUDIO, ACTIVITY_RECOGNITION and USE_FULL_SCREEN_INTENT are blocked
    // on BOTH channels and must stay removed.
    const GITHUB_NEEDS = [
      "android.permission.PACKAGE_USAGE_STATS",
      "android.permission.READ_EXTERNAL_STORAGE",
      "android.permission.WRITE_EXTERNAL_STORAGE",
    ];
    return withAndroidManifest(withoutStaleExclusion, (modConfig) => {
      const manifest = modConfig.modResults.manifest;
      manifest["uses-permission"] = (manifest["uses-permission"] ?? []).filter(
        (item: any) =>
          !(
            item.$?.["tools:node"] === "remove" &&
            GITHUB_NEEDS.includes(item.$?.["android:name"])
          ),
      );
      const app = AndroidConfig.Manifest.getMainApplicationOrThrow(
        modConfig.modResults,
      );
      app["meta-data"] = (app["meta-data"] ?? []).filter(
        (item) =>
          !(
            item.$["tools:node"] === "remove" &&
            item.$["android:name"] === "isMonitoringTool"
          ),
      );
      // The third writer, and it was missing from this undo list. The Play
      // branch pushes a tools:node="remove" for expo-location's
      // LocationTaskService; prebuild MERGES into an existing manifest rather
      // than regenerating it, so a play prebuild followed by a github one
      // without --clean left that entry stripping the service from the sideload
      // build too. Nil impact today — neither channel ever starts it — but this
      // undo list exists precisely because a stale entry survived a channel
      // switch once and shipped a build that could not monitor, and
      // assert-play-artifact.sh only asserts the Play side.
      app.service = (app.service ?? []).filter(
        (item: any) =>
          !(
            // Optional chaining like the uses-permission filter above: a merged
            // manifest can carry a <service> with no attributes, and item.$ then
            // being undefined would throw and fail prebuild on github only.
            (
              item.$?.["tools:node"] === "remove" &&
              item.$?.["android:name"] ===
                "expo.modules.location.services.LocationTaskService"
            )
          ),
      );
      return modConfig;
    });
  }

  const withoutNativeMonitoring = withSettingsGradle(config, (modConfig) => {
    const useExpoModules = "expoAutolinking.useExpoModules()";
    const exclusion = AUTOLINK_EXCLUSION;

    if (!modConfig.modResults.contents.includes(useExpoModules)) {
      throw new Error(
        "Could not locate Expo autolinking in android/settings.gradle",
      );
    }
    if (!modConfig.modResults.contents.includes(exclusion)) {
      modConfig.modResults.contents = modConfig.modResults.contents.replace(
        useExpoModules,
        `${exclusion}\n${useExpoModules}`,
      );
    }
    return modConfig;
  });

  return withAndroidManifest(withoutNativeMonitoring, (modConfig) => {
    AndroidConfig.Manifest.ensureToolsAvailable(modConfig.modResults);
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(
      modConfig.modResults,
    );
    const metadata = application["meta-data"] ?? [];
    application["meta-data"] = metadata.filter(
      (item) => item.$["android:name"] !== "isMonitoringTool",
    );
    application["meta-data"].push({
      $: {
        "android:name": "isMonitoringTool",
        "tools:node": "remove",
      },
    });

    // expo-location ships a LocationTaskService declared with
    // foregroundServiceType="location", and it merges into the manifest whether
    // or not the app uses it. This app never does: only
    // requestForegroundPermissionsAsync and getCurrentPositionAsync, no
    // startLocationUpdatesAsync, no geofencing, and the only TaskManager task
    // is the widget refresh. Leaving it declared would oblige a Play Console
    // foreground-service declaration for the `location` type — the most closely
    // scrutinised of them — and there is no truthful use case to give, because
    // the service is never started. Removing it is not a behaviour change; it
    // deletes an obligation.
    const services = application.service ?? [];
    application.service = services.filter(
      (item) =>
        item.$["android:name"] !==
        "expo.modules.location.services.LocationTaskService",
    );
    application.service.push({
      $: {
        "android:name": "expo.modules.location.services.LocationTaskService",
        "tools:node": "remove",
      },
    } as (typeof services)[number]);

    // Prebuild can reuse an existing native directory, and expo-router does
    // not remove a previously generated scheme filter when `scheme` becomes
    // undefined. Remove it explicitly so a stale prebuild cannot re-expose the
    // legacy navigation scheme in a Play artifact. Google sign-in is the
    // certificate-bound native flow and needs no redirect scheme at all.
    const mainActivity = AndroidConfig.Manifest.getMainActivityOrThrow(
      modConfig.modResults,
    );
    mainActivity["intent-filter"] = (
      mainActivity["intent-filter"] ?? []
    ).filter(
      (filter) =>
        !filter.data?.some((item) =>
          RETIRED_APP_SCHEMES.includes(item.$["android:scheme"]),
        ),
    );
    return modConfig;
  });
};

// expo-notifications can only reference a channel's sound by an Android raw
// resource name, and a channel's sound is immutable once created — so the
// per-adhan-sound MP3s have to exist as res/raw/ files, not just JS assets.
// android/ itself is gitignored and fully regenerated by every `expo
// prebuild` (including the Play release CI), so this has to run as a prebuild
// mod rather than a one-off file copy: anything placed by hand would silently
// vanish the next time prebuild runs.
const withAdhanSoundResources: ConfigPlugin = (config) =>
  withDangerousMod(config, [
    "android",
    (modConfig) => {
      const rawDir = path.join(
        modConfig.modRequest.platformProjectRoot,
        "app/src/main/res/raw",
      );
      fs.mkdirSync(rawDir, { recursive: true });
      for (const id of ADHAN_SOUND_IDS) {
        const source = path.join(
          modConfig.modRequest.projectRoot,
          `assets/sounds/adhan_${id}.mp3`,
        );
        if (!fs.existsSync(source)) {
          throw new Error(
            `withAdhanSoundResources: missing ${source} — expected one MP3 per id in ADHAN_SOUND_IDS`,
          );
        }
        fs.copyFileSync(source, path.join(rawDir, `${id}.mp3`));
      }
      return modConfig;
    },
  ]);

// Google Play filters a device out when the app REQUIRES hardware the device
// lacks, and Play INFERS those requirements — from the permissions declared,
// and from the activities themselves — rather than reading a declaration.
// Every inferred feature defaults to required, so a device missing any one of
// them never sees the listing. Verified with
// `aapt2 dump badging` on the 1.5.7 release APK: camera and location were both
// implied and required, which excluded every camera-less or GPS-less device —
// all mains-powered TV hardware and Wi-Fi-only tablets among them.
//
// Neither is actually required. The app runs with no camera (QR scanning and
// photo attachments are optional paths) and with no GPS (mosques.tsx and
// settings.tsx both offer manual city selection). Declaring that changes no
// behaviour and removes no permission — it only stops Play filtering.
//
// The list is Google's "Permissions that Imply Feature Requirements" table,
// which is broader than what aapt2 prints: aapt2 reports only the parent of
// each pair, while Play filters on the children too. CAMERA implies camera and
// camera.autofocus; ACCESS_FINE_LOCATION implies location.gps;
// ACCESS_COARSE_LOCATION implies location.network; both imply location.
//
// screen.portrait is in the list even though `orientation` is now "default",
// and it has to be. Unlocking MainActivity is NOT sufficient on its own: the
// implication is "one or more activities have specified a portrait
// orientation", and ML Kit merges its own locked activity into the manifest —
//
//   unspecified  com.rabbaanie.app.MainActivity
//   portrait     ...mlkit.vision.codescanner.internal.GmsBarcodeScanningDelegateActivity
//
// which kept screen.portrait implied, and required, on a build where
// MainActivity was already unlocked. Verified with `aapt2 dump badging`; the
// entry below is what actually clears it, because an explicit declaration
// overrides an implied requirement. This is the largest exclusion of the set —
// it alone accounted for all 3,037 TV devices. It costs nothing at runtime and
// does not re-letterbox anything: the bars came from MainActivity, which stays
// unspecified, and tests/device-compatibility.test.ts keeps it that way.
const OPTIONAL_FEATURES = [
  "android.hardware.screen.portrait",
  "android.hardware.camera",
  "android.hardware.camera.autofocus",
  "android.hardware.location",
  "android.hardware.location.gps",
  "android.hardware.location.network",
];

const withOptionalHardwareFeatures: ConfigPlugin = (config) =>
  withAndroidManifest(config, (modConfig) => {
    const manifest = modConfig.modResults.manifest as any;
    // Filter first: prebuild MERGES into an existing
    // android/AndroidManifest.xml rather than regenerating it, so appending
    // unconditionally would duplicate every entry on each prebuild. Only our
    // own names are dropped, so a feature a dependency declares survives.
    const existing = (manifest["uses-feature"] ?? []).filter(
      (item: any) => !OPTIONAL_FEATURES.includes(item.$?.["android:name"]),
    );
    manifest["uses-feature"] = [
      ...existing,
      ...OPTIONAL_FEATURES.map((name) => ({
        $: { "android:name": name, "android:required": "false" },
      })),
    ];
    return modConfig;
  });

// APP_VERSION comes from the release tag in CI (see release.yml); the fallback
// applies to local dev builds only. The shipped lineage is ahead of what the
// original updater plan assumed (it said "continues from Manus 1.1.29"): the
// build actually distributed to users is 1.4.69, hosted at
// api.rabbaanie.com/downloads under the legacy com.app.opvoedadvies.apk id.
// Keep this fallback at or above that so a local build never claims to be older
// than what users already run.
// versionCode is ALWAYS derived from the version here, so name and code can
// never diverge and a missing/empty env var can't yield an invalid 0.
const APP_VERSION = process.env.APP_VERSION ?? "1.6.4";
// Same shape the release workflow enforces on the tag: three parts, minor/patch
// 0-999 (the versionCode formula collides beyond that), no leading zeros. This
// makes a bad local APP_VERSION fail loudly instead of shipping a wrong code.
if (!/^(0|[1-9]\d*)\.(0|[1-9]\d{0,2})\.(0|[1-9]\d{0,2})$/.test(APP_VERSION)) {
  throw new Error(
    `APP_VERSION must be MAJOR.MINOR.PATCH with minor/patch 0-999, got "${APP_VERSION}"`,
  );
}
const [vMajor, vMinor, vPatch] = APP_VERSION.split(".").map(Number);
const APP_VERSION_CODE = vMajor * 1_000_000 + vMinor * 1_000 + vPatch;
// Google Play requires 1 <= versionCode <= 2100000000. Both ends are reachable
// from a tag the regex above accepts — v0.0.0 yields 0, and any major >= 2100
// overflows — and Play rejects the upload rather than the build, so catch it here.
if (APP_VERSION_CODE < 1 || APP_VERSION_CODE > 2_100_000_000) {
  throw new Error(
    `APP_VERSION "${APP_VERSION}" yields versionCode ${APP_VERSION_CODE}, outside Play's 1..2100000000`,
  );
}

// CFBundleVersion, derived from APP_VERSION by the same rule and for the same
// reason as android.versionCode above: name and build can never diverge, and a
// missing env var cannot yield an invalid value.
//
// The override is the part Android does not need. Play accepts a re-upload of
// the same versionCode only by bumping it, but App Store Connect additionally
// burns a build number on REJECTION — a rejected 1.6.0 build 1006000 can never
// be uploaded again, and the fix is to re-upload the same marketing version
// 1.6.0 with a HIGHER build number. A purely derived value cannot express that,
// so IOS_BUILD_NUMBER overrides it. It defaults to the derived value, so the
// normal path needs no env var at all and the override only appears when a
// human is recovering from a rejection.
const IOS_BUILD_NUMBER =
  process.env.IOS_BUILD_NUMBER ?? String(APP_VERSION_CODE);
// Bounded at BOTH ends. Below the derived value is guaranteed to be refused, so
// a typo there costs an upload round-trip; above 2^32-1 CFBundleVersion is also
// refused, and past 2^53 the comparison itself stops being sound —
// Number("9007199254740993") === Number("9007199254740992"), so a long digit
// string can compare equal to a different number and slip through.
//
// Be honest about what this does NOT catch: the floor is the value derived for
// the CURRENT marketing version, not the last build actually uploaded. Nothing
// on this machine knows that. So the second rejection of 1.6.0 is still catchable
// only by App Store Connect: 1006001 is used, a fresh shell without the env var
// falls back to 1006000, and 1006000 >= 1006000 passes here. Set
// IOS_BUILD_NUMBER for every re-upload; this guard catches typos, not history.
const IOS_BUILD_NUMBER_MAX = 4_294_967_295;
if (
  !/^[1-9]\d*$/.test(IOS_BUILD_NUMBER) ||
  Number(IOS_BUILD_NUMBER) < APP_VERSION_CODE ||
  Number(IOS_BUILD_NUMBER) > IOS_BUILD_NUMBER_MAX
) {
  throw new Error(
    // IOS_BUILD_NUMBER, not process.env.IOS_BUILD_NUMBER. The validated value
    // falls back to String(APP_VERSION_CODE) when the env var is unset, so
    // reporting the raw env var would print `got "undefined"` for a failure on
    // the derived value — the least helpful thing to read in the one situation
    // this message appears in, which is a human recovering from a rejection.
    `IOS_BUILD_NUMBER must be a whole number between the derived ${APP_VERSION_CODE} and ${IOS_BUILD_NUMBER_MAX}, got "${IOS_BUILD_NUMBER}"`,
  );
}

// Purpose strings. Every one of these is otherwise an ENGLISH PLUGIN DEFAULT —
// literally "Allow $(PRODUCT_NAME) to access your camera" — because
// @expo/prebuild-config auto-applies a config plugin for every installed
// package whether or not it appears in `plugins`, and each one seeds its own
// keys. App Review reads these strings, and so does every user at the moment
// the system dialog appears, so they have to say what the app actually does.
//
// `en` is also the base written into ios.infoPlist below, which is why
// CFBundleDevelopmentRegion is "en": the development region is the language of
// the unlocalised plist, and English is the sanest fallback for a locale that
// is not one of the three shipped here. ar/nl/en all get real .lproj files, so
// the fallback only ever applies to a fourth language.
//
// Scope is deliberately narrow, because a purpose string a reviewer can
// disprove is worse than a generic one:
//   NSCameraUsageDescription  QR scanning only (app/qr-scanner.tsx,
//     app/child-account/login.tsx). The AI-chat photo attachment is NOT a use
//     here — app/ai-chat.tsx gates it on ATTACHMENTS_ENABLED, which is
//     DISTRIBUTION_CHANNEL === "github", so it is unreachable in an App Store
//     build. NSPhotoLibraryUsageDescription is absent for the same reason.
//   NSMotionUsageDescription  Required even though only Magnetometer is used
//     (app/qibla.tsx): expo-sensors implements the iOS magnetometer on
//     CMMotionManager, so the compass will not start without motion access.
//   NSLocationWhenInUseUsageDescription  Foreground only. The app calls
//     requestForegroundPermissionsAsync / getCurrentPositionAsync and has no
//     startLocationUpdatesAsync, watchPositionAsync or geofencing anywhere;
//     both Always variants are deleted via the expo-location options below.
const IOS_PURPOSE_STRINGS: Record<
  "en" | "nl" | "ar",
  Record<string, string>
> = {
  en: {
    NSCameraUsageDescription:
      "Rabbaanie uses the camera only to scan a QR code: to link a child's device to your family account, and to sign a child in on their own device.",
    NSMotionUsageDescription:
      "Rabbaanie reads the compass sensor to point the qibla arrow towards the Kaaba. On iOS the magnetometer is provided through motion services, so the qibla screen needs this permission.",
    NSLocationWhenInUseUsageDescription:
      "Rabbaanie uses your location to calculate accurate prayer times, point the qibla towards the Kaaba, and show mosques near you.",
  },
  nl: {
    NSCameraUsageDescription:
      "Rabbaanie gebruikt de camera alleen om een QR-code te scannen: om het toestel van uw kind aan uw gezinsaccount te koppelen, en om uw kind op het eigen toestel aan te melden.",
    NSMotionUsageDescription:
      "Rabbaanie leest de kompassensor om de qibla-pijl naar de Kaaba te richten. Op iOS loopt de magnetometer via de bewegingsdiensten, daarom heeft het qibla-scherm deze toestemming nodig.",
    NSLocationWhenInUseUsageDescription:
      "Rabbaanie gebruikt uw locatie voor nauwkeurige gebedstijden, de qibla-richting naar de Kaaba en moskeeën in de buurt.",
  },
  ar: {
    NSCameraUsageDescription:
      "يستخدم ربّانيّ الكاميرا فقط لمسح رمز QR: لربط جهاز طفلك بحساب عائلتك، ولتسجيل دخول الطفل على جهازه الخاص.",
    NSMotionUsageDescription:
      "يقرأ ربّانيّ حسّاس البوصلة لتوجيه سهم القبلة نحو الكعبة. وعلى iOS يعمل مقياس المغناطيسية عبر خدمات الحركة، ولذلك يلزم هذا الإذن لشاشة القبلة.",
    NSLocationWhenInUseUsageDescription:
      "يستخدم ربّانيّ موقعك لحساب أوقات الصلاة بدقّة، وتحديد اتجاه القبلة نحو الكعبة، وعرض المساجد القريبة منك.",
  },
};

// Same habit as withAdhanSoundResources throwing on a missing MP3, for the same
// reason. Adding a purpose string to the English base and forgetting a
// translation ships silently: the key is present, the plist is valid, and an
// Arabic reviewer simply reads English. No later stage can detect that, so fail
// here, where `expo config` and every prebuild already run.
//
// The expected key set is the UNION of all three languages, not `en`'s keys.
// Anchoring on `en` made the guard blind in the direction that actually ships a
// defect: a key added to `nl` or `ar` but not to `en` produced no `missing`
// entry anywhere, while `ios.infoPlist` — seeded from IOS_PURPOSE_STRINGS.en
// below — would not carry it at all. The auto-applied permission plugin then
// supplies its own `Allow $(PRODUCT_NAME) to access your …` English default as
// the base string for every locale outside the three .lproj files, which is
// precisely the untranslated-boilerplate outcome this check exists to stop.
const ALL_PURPOSE_KEYS = [
  ...new Set(Object.values(IOS_PURPOSE_STRINGS).flatMap((s) => Object.keys(s))),
];
for (const [language, strings] of Object.entries(IOS_PURPOSE_STRINGS)) {
  const missing = ALL_PURPOSE_KEYS.filter((key) => !(key in strings));
  if (missing.length > 0) {
    throw new Error(
      `IOS_PURPOSE_STRINGS.${language} is missing ${missing.join(", ")} — every shipped language needs every purpose string`,
    );
  }
}

// ios.infoPlist sets the BASE language only. The three .lproj/InfoPlist.strings
// files that localise it have to be written into ios/, which prebuild
// regenerates, so this has to be a mod — anything placed by hand would vanish,
// the same argument withAdhanSoundResources makes for android/res/raw.
//
// Writing the files is only half of it, and the half that fails silently: the
// generated project is objectVersion 54, a classic pbxproj with no file-system
// synchronised groups, so a .lproj folder that is not referenced by the Xcode
// project is never copied into the bundle. IOSConfig.Locales.setLocalesAsync is
// Expo's own implementation of exactly this — it writes the files AND registers
// each one, and skips a file already in the group so a second prebuild over a
// reused ios/ cannot duplicate it.
//
// It is called directly rather than via the top-level `locales` config key,
// which would be the obvious route, because AndroidConfig.Locales.withLocales
// is auto-applied too and reads the same key: setting `locales` would also
// write empty values-b+ar/values-b+nl/values-b+en resource folders into the
// Play artifact, changing the APK's advertised locale set for no iOS benefit.
const withIosLocalizedPurposeStrings: ConfigPlugin = (config) =>
  withXcodeProject(config, async (modConfig) => {
    modConfig.modResults = await IOSConfig.Locales.setLocalesAsync(
      { locales: IOS_PURPOSE_STRINGS },
      {
        projectRoot: modConfig.modRequest.projectRoot,
        project: modConfig.modResults,
      },
    );
    return modConfig;
  });

// Two capabilities auto-applied plugins declare for features this app does not
// have. Neither plugin accepts an opt-out, so they are removed after the fact.
//
//   UIBackgroundModes  expo-task-manager and expo-background-fetch both write
//     ["fetch"] unconditionally. The only task, "WIDGET_BACKGROUND_UPDATE", is
//     defined at module scope in lib/widget-background-task.ts but
//     registerWidgetBackgroundTask returns early on any non-Android platform,
//     so BackgroundFetch.registerTaskAsync is unreachable on iOS. Apple rejects
//     a background mode with no justification behind it.
//   aps-environment  expo-notifications writes it unconditionally, defaulting
//     to "development". This is an ARCHIVE BLOCKER, not just a review flag: a
//     "development" aps-environment will not sign against a distribution
//     provisioning profile. There is no iOS push code to justify keeping it —
//     hooks/use-push-notifications.ts returns null on any non-Android platform
//     because the backend has an FCM sender only. expo-notifications itself
//     stays: LOCAL notifications are the app's entire notification feature.
//
// Ordering is load-bearing and inverted from the obvious reading. withMod runs
// its own action FIRST and then delegates to the previously registered mod, so
// the mod registered EARLIEST is the last to touch modResults and therefore
// wins. getPrebuildConfig applies the `plugins` array (via getConfig) before
// withVersionedExpoSDKPlugins, so anything in `plugins` outranks every
// auto-applied plugin; being first in the array outranks the rest of the array
// too. tests/ios-config.test.ts asserts the outcome rather than the reasoning.
const withoutUnusedIosCapabilities: ConfigPlugin = (config) => {
  const withoutBackgroundModes = withInfoPlist(config, (modConfig) => {
    // Subtract "fetch" specifically rather than deleting the whole key.
    //
    // This mod is registered first in `plugins`, and withMod composes so that
    // the earliest registration runs LAST — after every auto-applied plugin and
    // after the static ios.infoPlist block. A blanket `delete` therefore
    // outranks the app's own config: putting UIBackgroundModes: ["audio"] in
    // ios.infoPlist to let the adhan play in the background would be silently
    // erased here, with no error and nothing in any test to catch it. Removing
    // only the entry we object to is identical today and safe tomorrow.
    //
    // "fetch" is injected unconditionally by expo-task-manager's and
    // expo-background-fetch's plugins, neither of which offers an opt-out, for
    // a task that never registers on iOS: the only one is
    // "WIDGET_BACKGROUND_UPDATE", and registerWidgetBackgroundTask returns
    // early on any non-Android platform.
    const modes = modConfig.modResults.UIBackgroundModes;
    if (Array.isArray(modes)) {
      const kept = modes.filter((mode) => mode !== "fetch");
      if (kept.length > 0) modConfig.modResults.UIBackgroundModes = kept;
      else delete modConfig.modResults.UIBackgroundModes;
    }
    return modConfig;
  });
  return withEntitlementsPlist(withoutBackgroundModes, (modConfig) => {
    delete modConfig.modResults["aps-environment"];
    return modConfig;
  });
};

/**
 * The iOS half of the adhan sound, and it must be the iOS half ONLY.
 *
 * The obvious spelling — a `["expo-notifications", { sounds: [...] }]` entry —
 * is a trap. expo-notifications' plugin applies withNotificationsAndroid AND
 * withNotificationsIOS from the same props, and the Android one runs a
 * dangerous mod that copyFileSync's every `sounds` entry into
 * android/app/src/main/res/raw/. So that entry shipped ~1.6 MB of .caf into the
 * Play AAB, next to the MP3s withAdhanSoundResources already copies, for files
 * Android can never play — its sound comes from the channel's raw MP3. Nothing
 * failed: assertValidAndroidAssetName accepts the names, and android/ is
 * gitignored and merged by prebuild, so the dead copies would also have
 * survived in a developer's tree after the config was fixed.
 *
 * Expo exports the iOS implementation on its own, so this reuses it rather than
 * reimplementing the Xcode resource registration. withXcodeProject is an iOS
 * mod, so the mod compiler skips it entirely on an Android prebuild.
 */
const withIosAdhanSounds: ConfigPlugin = (config) =>
  withXcodeProject(config, (modConfig) => {
    for (const id of ADHAN_SOUND_IDS) {
      const source = path.join(
        modConfig.modRequest.projectRoot,
        `assets/sounds/adhan_${id}.caf`,
      );
      // Loud, like withAdhanSoundResources' MP3 check. UNNotificationSound
      // does NOT throw on a name it cannot resolve — iOS quietly plays the
      // system default — so a missing file here would otherwise reach users as
      // "the adhan I picked never plays" with nothing logged anywhere.
      if (!fs.existsSync(source)) {
        throw new Error(
          `withIosAdhanSounds: missing ${source} — expected one CAF per id in ADHAN_SOUND_IDS`,
        );
      }
    }
    // Expo's iOS-only notification-sound implementation. Required HERE, inside
    // an iOS mod, rather than imported at module scope.
    //
    // This is a deep path into expo-notifications' COMPILED plugin output: it
    // is published with a .d.ts and stable within a version, but nothing stops
    // a minor bump from moving or renaming it. expo-notifications is pinned by
    // package.json's ~0.32.17; re-check when that range moves.
    //
    // At module scope the cost of that path vanishing was not iOS-shaped. This
    // file is loaded by `expo start`, `expo run:android`, the PLAY prebuild and
    // `expo config` in CI, so a moved path would have taken down the Android
    // release pipeline over an iOS-only concern. withXcodeProject is an iOS mod
    // and the mod compiler skips it entirely on an Android prebuild, so a lazy
    // require confines the blast radius to the platform that needs the symbol.
    // The trade is losing the failure at config-load time; prebuild is still
    // long before anything is built, and it now fails only where it matters.
    //
    // Introspection (`expo config --type introspect`) drops xcodeproj mods, so
    // tests/ios-config.test.ts does NOT exercise this line — the check that a
    // CAF actually reached the bundle is scripts/assert-ios-artifact.sh's.
    //
    // Wrapped, because the two halves of "moved or renamed" fail on different
    // lines. A RENAME resolves the module and leaves the symbol undefined, so
    // it reaches the check below. A MOVE throws MODULE_NOT_FOUND on the require
    // itself — so the message that says what to do never printed for the very
    // failure the paragraph above describes. Both converge here now.
    let setNotificationSounds:
      | typeof import("expo-notifications/plugin/build/withNotificationsIOS").setNotificationSounds
      | undefined;
    let cause = "";
    try {
      ({ setNotificationSounds } =
        require("expo-notifications/plugin/build/withNotificationsIOS") as typeof import("expo-notifications/plugin/build/withNotificationsIOS"));
    } catch (error) {
      cause = error instanceof Error ? error.message : String(error);
    }
    if (typeof setNotificationSounds !== "function") {
      throw new Error(
        "expo-notifications no longer exports setNotificationSounds from " +
          "plugin/build/withNotificationsIOS — withIosAdhanSounds cannot bundle " +
          "the adhan CAFs, and iOS would silently fall back to the system sound. " +
          "Re-point the require, or reimplement the copy with withXcodeProject." +
          (cause ? `\nThe require itself failed: ${cause}` : ""),
      );
    }
    setNotificationSounds(modConfig.modRequest.projectRoot, {
      sounds: ADHAN_SOUND_IDS.map((id) => `./assets/sounds/adhan_${id}.caf`),
      project: modConfig.modResults,
      projectName: modConfig.modRequest.projectName,
    });
    return modConfig;
  });

const config: ExpoConfig = {
  name: env.appName,
  slug: env.appSlug,
  version: APP_VERSION,
  // Not "portrait". A locked MainActivity is letterboxed on every large screen
  // — measured at 510px of black down each side of a 1920x1200 tablet, with
  // the app reporting itself as a 600x800dp phone. targetSdk 36 also means
  // Android 16 ignores the lock above 600dp regardless, so the wide layout
  // arrives with or without this line.
  //
  // This alone does NOT restore the devices Play filtered out: the implied
  // screen.portrait feature comes from ANY locked activity, and a dependency
  // still merges one in. See OPTIONAL_FEATURES below — that is what clears it.
  orientation: "default",
  icon: "./assets/images/icon.png",
  // Play builds use Google Play services for certificate-bound native sign-in,
  // so they expose no interceptable OAuth custom-scheme intent. The general
  // Rabbaanie navigation scheme remains available only to sideload builds.
  // ALWAYS set, on both channels. Leaving it undefined for Play crashed iOS on
  // launch: expo-linking throws "Cannot make a deep link into a standalone app
  // with no custom scheme defined" as an unhandled JS exception the moment the
  // bundle starts, so the App Store build died on the splash screen. Verified
  // by launching the simulator build — nothing in the config or the test suite
  // could see it, because both were asserting the config value rather than the
  // running app.
  //
  // Play is still protected, at the two layers that actually govern the
  // ARTIFACT rather than the JS manifest:
  //   1. the Android manifest mod above filters every intent-filter carrying a
  //      RETIRED_APP_SCHEMES entry, so no scheme is exposed to other apps;
  //   2. scripts/assert-play-artifact.sh fails the build outright if the
  //      "rabbaanie" scheme survives into the AAB, and CI runs it
  //      (.github/workflows/play-release.yml).
  // A scheme string in the embedded JS manifest exposes nothing on its own —
  // what Play's policy is about is the intent filter, which is still gone.
  scheme: env.scheme,
  userInterfaceStyle: "automatic",
  newArchEnabled: true,
  ios: {
    // Confirmed product decision: iPad is in scope.
    supportsTablet: true,
    bundleIdentifier: env.iosBundleId,
    buildNumber: IOS_BUILD_NUMBER,
    // Without this, every `interruptionLevel: "timeSensitive"` in the app is
    // INERT: iOS silently downgrades an unentitled time-sensitive notification
    // to `active`, so it does not break through Focus or Do Not Disturb. The
    // code has claimed that behaviour for a long time and never had it — a
    // prayer app whose adhan is muted by the user's sleep Focus is failing at
    // the one thing it exists to do, and nothing anywhere reports it.
    //
    // ORDERING HAZARD, the same one aps-environment has: the capability must be
    // enabled on the App ID in the Apple Developer portal BEFORE an archive
    // carrying this entitlement is signed. Sign it first and the archive is
    // rejected outright, which reads like a build failure rather than a missing
    // checkbox. Apple grants Time Sensitive Notifications readily for prayer
    // and reminder apps; scripts/assert-ios-artifact.sh asserts it is present
    // so it cannot silently vanish from a merged prebuild.
    entitlements: {
      "com.apple.developer.usernotifications.time-sensitive": true,
    },
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      // The base language. Each key here is picked up by the auto-applied
      // permission plugins as `existing` (Permissions.js resolves
      // configured || existing || ENGLISH_DEFAULT), so writing them once here
      // overrides every plugin that seeds the same key — which is why the
      // plugin entries below only ever pass `false`, never a string. One
      // source per string, and the .lproj files translate exactly these.
      ...IOS_PURPOSE_STRINGS.en,
      CFBundleDevelopmentRegion: "en",
      CFBundleLocalizations: Object.keys(IOS_PURPOSE_STRINGS),
      // Expo's iOS template ships NSAllowsArbitraryLoads: true so Metro can be
      // reached over cleartext in development. Shipped to the App Store that is
      // a blanket opt-out of App Transport Security, and App Review asks for a
      // justification there is none to give: the app makes no cleartext request
      // at all. Verified — a grep for an http:// literal across app, lib, hooks,
      // components, constants, widgets and modules returns nothing outside
      // tests, and lib/app-version.ts already REFUSES an http APK URL.
      //
      // NSAllowsLocalNetworking keeps development working without the blanket
      // hole: it permits cleartext to LAN hosts only, which is what a dev build
      // needs to reach Metro on the developer's machine. Apple documents it as
      // requiring no justification, unlike NSAllowsArbitraryLoads.
      NSAppTransportSecurity: {
        NSAllowsArbitraryLoads: false,
        NSAllowsLocalNetworking: true,
        NSExceptionDomains: {
          localhost: { NSExceptionAllowsInsecureHTTPLoads: true },
        },
      },
    },
    // Derived from an audit of what this app and its pods actually call, not
    // from a template. Pods that ship their own PrivacyInfo.xcprivacy are
    // deliberately NOT redeclared here (async-storage, expo-file-system,
    // expo-constants, expo-device, React-Core and others self-declare and are
    // wired through resource_bundles). What remains is first-party usage that
    // no bundled manifest covers:
    //   FileTimestamp C617.1 — React-RCTNetwork's RCTFileRequestHandler and
    //     expo-modules-core's PersistentFileLog, neither of which self-declares.
    //   FileTimestamp 0A2A.1 — expo-document-picker reads the modification date
    //     of the user-selected file; that is Apple's exact wording for 0A2A.1.
    //   UserDefaults CA92.1 — React-RCTSettings' RCTSettingsManager.
    // DiskSpace and SystemBootTime are omitted on purpose: their only callers
    // (expo-file-system, expo-device) both self-declare.
    //
    // Tracking is false and the domain list is empty because the app carries no
    // analytics, ads or attribution SDK of any kind, and nothing reads the IDFA.
    // PurchaseHistory is absent because iOS has no purchase path yet — it MUST
    // be added in the same change that lands StoreKit.
    privacyManifests: {
      NSPrivacyTracking: false,
      NSPrivacyTrackingDomains: [],
      NSPrivacyAccessedAPITypes: [
        {
          NSPrivacyAccessedAPIType: "NSPrivacyAccessedAPICategoryFileTimestamp",
          NSPrivacyAccessedAPITypeReasons: ["C617.1", "0A2A.1"],
        },
        {
          NSPrivacyAccessedAPIType: "NSPrivacyAccessedAPICategoryUserDefaults",
          NSPrivacyAccessedAPITypeReasons: ["CA92.1"],
        },
      ],
      // Every type is Linked (all of it hangs off an authenticated account) and
      // none is used for Tracking.
      NSPrivacyCollectedDataTypes: [
        "NSPrivacyCollectedDataTypeEmailAddress",
        "NSPrivacyCollectedDataTypeName",
        "NSPrivacyCollectedDataTypePhoneNumber",
        "NSPrivacyCollectedDataTypePhysicalAddress",
        "NSPrivacyCollectedDataTypePreciseLocation",
        "NSPrivacyCollectedDataTypeCoarseLocation",
        "NSPrivacyCollectedDataTypeUserID",
        "NSPrivacyCollectedDataTypeOtherUserContent",
        // Religious practice: prayer status, Qur'an connection, hijab. In
        // Apple's taxonomy SensitiveInfo covers religious belief — it does NOT
        // cover health, which is its own category below.
        "NSPrivacyCollectedDataTypeSensitiveInfo",
        // Health and medical, and easy to miss because it does not look like a
        // health app. ParentProfile carries psychologist, psychologistDetails,
        // psychologistChildren and psychologistChildrenDetails (lib/store.ts
        // :46-49) — whether the parent and NAMED CHILDREN are in psychological
        // care — and ChildEnvironment carries physicalHealth, mentalHealth and
        // sleepQuality (lib/store.ts:149-151). Both parentProfile and
        // environments go up in the profile.save payload at lib/app-context.ts
        // :112-120 and come back down from profile.get, so this is a full round
        // trip and "collected" under Apple's definition.
        //
        // Under GDPR the same fields are Article 9 special-category data. An
        // app whose declared audience includes children, storing mental-health
        // notes about minors while declaring no health collection, is both an
        // App Review rejection and a disclosure failure.
        "NSPrivacyCollectedDataTypeHealth",
        // lib/activity-tracker.ts POSTs a per-child daily summary — screens
        // visited, app-usage minutes, dhikr and task counts, AI questions asked
        // — with NO platform gate, so it runs on iOS (initialised from
        // app/child-account/home.tsx:299).
        //
        // Declared even though the receiving procedure does not exist yet and
        // every call 404s, which arguably means nothing is collected today.
        // The margin is one server commit wide: the moment
        // childActivity.syncDailySummary is written in rabbaanie-api this
        // becomes collection, in a different repository, with nothing here to
        // prompt anyone to update the manifest. Declaring it now costs a line
        // on the nutrition label and removes a compliance trap wired to a
        // change we would not see.
        "NSPrivacyCollectedDataTypeProductInteraction",
        // Marital status and gender.
        "NSPrivacyCollectedDataTypeOtherDataTypes",
      ].map((type) => ({
        NSPrivacyCollectedDataType: type,
        NSPrivacyCollectedDataTypeLinked: true,
        NSPrivacyCollectedDataTypeTracking: false,
        NSPrivacyCollectedDataTypePurposes: [
          "NSPrivacyCollectedDataTypePurposeAppFunctionality",
        ],
      })),
    },
  },
  android: {
    googleServicesFile: "./google-services.json",
    // Family profiles and generated advice are sensitive. Keep them out of
    // Android's device/cloud backup channel; server sync is the recovery path.
    allowBackup: false,
    adaptiveIcon: {
      backgroundColor: "#0D7C5F",
      foregroundImage: "./assets/images/android-icon-foreground.png",
      backgroundImage: "./assets/images/android-icon-background.png",
      monochromeImage: "./assets/images/android-icon-monochrome.png",
    },
    predictiveBackGestureEnabled: false,
    softwareKeyboardLayoutMode: "pan",
    package: env.androidPackage,
    versionCode: APP_VERSION_CODE,
    permissions: [
      "POST_NOTIFICATIONS",
      // Used for time-sensitive prayer and reminder notifications.
      "SCHEDULE_EXACT_ALARM",
      "VIBRATE",
      "WAKE_LOCK",
      // Sideload channel only — see DISTRIBUTION above.
      ...(isGithubBuild ? ["REQUEST_INSTALL_PACKAGES"] : []),
    ],
    // Permissions pulled in by dependencies that this app never exercises.
    // blockedPermissions emits tools:node="remove", which wins in the manifest
    // merger no matter which library added them — expo-camera's plugin is
    // auto-applied with its defaults, so subtracting via plugin options does
    // not work.
    //
    //   SYSTEM_ALERT_WINDOW  Expo's template adds it for the dev-menu overlay.
    //     Nothing here draws over other apps, and left in it combines with
    //     PACKAGE_USAGE_STATS (child app-usage monitoring) plus a child-inclusive
    //     target audience into the permission set Play screens as stalkerware.
    //   RECORD_AUDIO  expo-camera declares it for video capture. The camera is
    //     used only for QR scanning and still photos, and the only expo-av calls
    //     are Audio.Sound playback, so nothing records. A microphone permission
    //     on an app whose declared audience includes children is a review flag
    //     with no feature behind it.
    //   USE_FULL_SCREEN_INTENT  Notifications never launch full-screen UI.
    //     Blocking it is necessary because prebuild can retain a stale manifest
    //     entry even after it is removed from the permissions allow-list.
    //   ACTIVITY_RECOGNITION  The app uses the magnetometer for Qibla, but does
    //     not read steps or physical-activity state.
    blockedPermissions: [
      "android.permission.SYSTEM_ALERT_WINDOW",
      "android.permission.RECORD_AUDIO",
      "android.permission.USE_FULL_SCREEN_INTENT",
      "android.permission.ACTIVITY_RECOGNITION",
      ...(!isGithubBuild
        ? [
            "android.permission.PACKAGE_USAGE_STATS",
            "android.permission.READ_EXTERNAL_STORAGE",
            "android.permission.WRITE_EXTERNAL_STORAGE",
          ]
        : []),
    ],
  },
  web: {
    bundler: "metro",
    output: "static",
    favicon: "./assets/images/favicon.png",
  },
  plugins: [
    // First on purpose — see the ordering note on withoutUnusedIosCapabilities.
    withoutUnusedIosCapabilities as any,
    withIosLocalizedPurposeStrings as any,
    withIosAdhanSounds as any,
    "expo-router",
    [
      "@react-native-google-signin/google-signin",
      {
        // Google's SDK receives its redirect on the client id reversed into a
        // URL scheme, so this must be the **iOS** client, not the web one.
        //
        // Falls back to the web client while GOOGLE_IOS_CLIENT_ID is empty
        // purely to keep prebuild working: the plugin validates the SHAPE of
        // this string on every prebuild, Android-only ones included, and
        // throws on an empty value. The fallback is a placeholder that
        // authenticates nobody — app/login.tsx hides the button in exactly
        // that state, so no build ever offers a scheme that cannot complete.
        iosUrlScheme: reversedClientId(
          GOOGLE_IOS_CLIENT_ID || GOOGLE_WEB_CLIENT_ID,
        ),
      },
    ],
    // Expo accepts inline config plugins here, while ExpoConfig's public type
    // only lists serializable plugin references.
    withPlayMonitoringDisabled as any,
    withAdhanSoundResources as any,
    withOptionalHardwareFeatures as any,
    [
      "react-native-android-widget/app.plugin",
      {
        widgets: [
          {
            name: "PrayerWidget",
            label:
              "\u0623\u0648\u0642\u0627\u062a \u0627\u0644\u0635\u0644\u0627\u0629",
            description:
              "\u0627\u0644\u0635\u0644\u0627\u0629 \u0627\u0644\u0642\u0627\u062f\u0645\u0629 \u0648\u062c\u0645\u064a\u0639 \u0627\u0644\u0623\u0648\u0642\u0627\u062a",
            minWidth: "110dp",
            minHeight: "110dp",
            targetCellWidth: 2,
            targetCellHeight: 2,
            previewImage: "./assets/images/icon.png",
            resizeMode: "horizontal|vertical",
            updatePeriodMillis: 1800000,
          },
          {
            name: "DhikrWidget",
            label: "\u0630\u0643\u0631 \u0627\u0644\u064a\u0648\u0645",
            description:
              "\u0630\u0643\u0631 \u0645\u062a\u063a\u064a\u0631 \u0645\u0639 \u0627\u0644\u0645\u0635\u062f\u0631 \u0648\u0627\u0644\u0641\u0636\u0644",
            minWidth: "180dp",
            minHeight: "110dp",
            targetCellWidth: 3,
            targetCellHeight: 2,
            previewImage: "./assets/images/icon.png",
            resizeMode: "horizontal|vertical",
            updatePeriodMillis: 3600000,
          },
          {
            name: "GoalWidget",
            label:
              "\u0647\u062f\u0641 \u0627\u0644\u064a\u0648\u0645 \u0627\u0644\u062a\u0631\u0628\u0648\u064a",
            description:
              "\u0627\u0644\u0647\u062f\u0641 \u0627\u0644\u062a\u0631\u0628\u0648\u064a \u0627\u0644\u064a\u0648\u0645\u064a \u0645\u0646 \u0627\u0644\u062e\u0637\u0629 \u0627\u0644\u0623\u0633\u0628\u0648\u0639\u064a\u0629",
            minWidth: "180dp",
            minHeight: "80dp",
            targetCellWidth: 3,
            targetCellHeight: 2,
            previewImage: "./assets/images/icon.png",
            resizeMode: "horizontal|vertical",
            updatePeriodMillis: 3600000,
          },
          {
            name: "HijriWidget",
            label:
              "\u0627\u0644\u062a\u0627\u0631\u064a\u062e \u0627\u0644\u0647\u062c\u0631\u064a",
            description:
              "\u0627\u0644\u062a\u0627\u0631\u064a\u062e \u0627\u0644\u0647\u062c\u0631\u064a \u0648\u0627\u0644\u0645\u0646\u0627\u0633\u0628\u0629 \u0627\u0644\u0625\u0633\u0644\u0627\u0645\u064a\u0629",
            minWidth: "110dp",
            minHeight: "110dp",
            targetCellWidth: 2,
            targetCellHeight: 2,
            previewImage: "./assets/images/icon.png",
            resizeMode: "horizontal|vertical",
            updatePeriodMillis: 3600000,
          },
          {
            name: "CombinedWidget",
            label:
              "\u0631\u0628\u0651\u0627\u0646\u064a \u0627\u0644\u0634\u0627\u0645\u0644",
            description:
              "\u0635\u0644\u0627\u0629 + \u0630\u0643\u0631 + \u0647\u062f\u0641 + \u062a\u0627\u0631\u064a\u062e \u0647\u062c\u0631\u064a",
            minWidth: "250dp",
            minHeight: "180dp",
            targetCellWidth: 4,
            targetCellHeight: 3,
            previewImage: "./assets/images/icon.png",
            resizeMode: "horizontal|vertical",
            updatePeriodMillis: 1800000,
          },
        ],
      },
    ],
    // These four entries exist only to pass `false`, which is the one thing
    // ios.infoPlist cannot express: Permissions.js DELETES a key when the
    // option is false, where an infoPlist entry can only overwrite one. Every
    // real string lives in ios.infoPlist above. All four packages are
    // auto-applied already, so an explicit entry changes nothing except that it
    // can now be given options.
    //
    // Microphone, three times over: expo-camera, expo-image-picker and expo-av
    // each seed NSMicrophoneUsageDescription. Nothing in this app records —
    // a repo-wide search for recording APIs returns nothing, and every expo-av
    // call is Audio.Sound playback (app/(tabs)/settings.tsx,
    // app/(tabs)/notification-settings.tsx). This is the iOS mirror of
    // RECORD_AUDIO sitting in android.blockedPermissions for the same reason.
    //
    // Deliberately NOT passed here: cameraPermission: false on
    // expo-image-picker. It reads as the matching cleanup, but the plugin also
    // calls AndroidConfig.Permissions.withBlockedPermissions(['...CAMERA']) on
    // false, which would emit tools:node="remove" for android.permission.CAMERA
    // and strip the camera from the PLAY build — breaking app/qr-scanner.tsx
    // and app/child-account/login.tsx, both shipping today. The iOS key it
    // would have removed is already handled: expo-camera legitimately owns
    // NSCameraUsageDescription, and ios.infoPlist supplies the text.
    // photosPermission has no such Android side effect, so it is safe.
    ["expo-camera", { microphonePermission: false }],
    // The photo library has no reachable call site in an App Store build: the
    // only ImagePicker calls are in app/ai-chat.tsx behind ATTACHMENTS_ENABLED
    // (DISTRIBUTION_CHANNEL === "github"), and nothing anywhere writes back to
    // the library — no MediaLibrary, no saveToLibraryAsync. So the key is
    // deleted rather than written, which is also why there is no
    // NSPhotoLibraryAddUsageDescription.
    [
      "expo-image-picker",
      { microphonePermission: false, photosPermission: false },
    ],
    ["expo-av", { microphonePermission: false }],
    [
      "expo-location",
      {
        // Both Always variants are seeded by the plugin and would otherwise
        // ship as English defaults for a capability the app does not have.
        locationAlwaysPermission: false,
        locationAlwaysAndWhenInUsePermission: false,
      },
    ],

    [
      "expo-splash-screen",
      {
        image: "./assets/images/splash-icon.png",
        imageWidth: 200,
        resizeMode: "contain",
        backgroundColor: "#ffffff",
        dark: {
          backgroundColor: "#000000",
        },
      },
    ],
    [
      "expo-build-properties",
      {
        ios: {
          // Expo SDK 54's own floor: expo-modules-core's podspec declares
          // :ios => '15.1', so nothing in the project can build below it. It
          // also clears the two dependencies that set their own — expo-iap
          // gates ExpoIapModule.swift on @available(iOS 15.0, *) and
          // react-native-volume-manager's podspec declares :ios => "15.0".
          // Left unset the Podfile picks its own default, which can land under
          // those and fails at archive time rather than at prebuild.
          deploymentTarget: "15.1",
        },
        android: {
          buildArchs: ["armeabi-v7a", "arm64-v8a"],
          minSdkVersion: 24,
          // Left off deliberately. R8 breaks reflection-based code, and this app
          // carries several surfaces that use it: react-native-android-widget,
          // the Kotlin usage-stats module, and Expo's autolinked modules. No
          // release build of this app has ever succeeded, so there is no
          // known-good baseline to compare a minified build against. Turn these
          // on as their own change, then verify the resulting build on a device.
          enableProguardInReleaseBuilds: false,
          enableShrinkResourcesInReleaseBuilds: false,
        },
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: false,
  },
  // Read at runtime by hooks/use-updates.ts so the Play build never offers an
  // in-app update, matching the permission gating above.
  extra: {
    distribution: DISTRIBUTION,
    releaseFeatures: {
      childMonitoring: isGithubBuild,
    },
  },
};

export default config;
