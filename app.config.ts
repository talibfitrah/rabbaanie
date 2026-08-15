// Load environment variables with proper priority (system > .env)
import "./scripts/load-env.js";
import type { ExpoConfig } from "expo/config";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  AndroidConfig,
  type ConfigPlugin,
  withAndroidManifest,
  withDangerousMod,
  withSettingsGradle,
} from "@expo/config-plugins";
import { ADHAN_SOUND_IDS } from "./lib/adhan-sound-ids.js";
import {
  APP_PACKAGE,
  APP_SCHEME,
} from "./constants/app-identity.js";

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
        item.$["android:name"] !== "expo.modules.location.services.LocationTaskService",
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
        const source = path.join(modConfig.modRequest.projectRoot, `assets/sounds/adhan_${id}.mp3`);
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

// APP_VERSION comes from the release tag in CI (see release.yml); the fallback
// applies to local dev builds only. The shipped lineage is ahead of what the
// original updater plan assumed (it said "continues from Manus 1.1.29"): the
// build actually distributed to users is 1.4.69, hosted at
// api.rabbaanie.com/downloads under the legacy com.app.opvoedadvies.apk id.
// Keep this fallback at or above that so a local build never claims to be older
// than what users already run.
// versionCode is ALWAYS derived from the version here, so name and code can
// never diverge and a missing/empty env var can't yield an invalid 0.
const APP_VERSION = process.env.APP_VERSION ?? "1.4.91";
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

const config: ExpoConfig = {
  name: env.appName,
  slug: env.appSlug,
  version: APP_VERSION,
  orientation: "portrait",
  icon: "./assets/images/icon.png",
  // Play builds use Google Play services for certificate-bound native sign-in,
  // so they expose no interceptable OAuth custom-scheme intent. The general
  // Rabbaanie navigation scheme remains available only to sideload builds.
  scheme: isGithubBuild ? env.scheme : undefined,
  userInterfaceStyle: "automatic",
  newArchEnabled: true,
  ios: {
    supportsTablet: true,
    bundleIdentifier: env.iosBundleId,
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
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
    "expo-router",
    [
      "@react-native-google-signin/google-signin",
      {
        // Android is the release target. The plugin validates an iOS-shaped
        // reverse client ID even during Android-only prebuilds.
        iosUrlScheme:
          "com.googleusercontent.apps.546852827424-jchq36r9vu7bjbmn7gg5198ethlk625o",
      },
    ],
    // Expo accepts inline config plugins here, while ExpoConfig's public type
    // only lists serializable plugin references.
    withPlayMonitoringDisabled as any,
    withAdhanSoundResources as any,
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
    [
      "expo-location",
      {
        locationWhenInUsePermission:
          "Rabbaanie gebruikt uw locatie voor gebedstijden, qibla-richting en locatiegebonden adviezen.",
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
