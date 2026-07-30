// Load environment variables with proper priority (system > .env)
import "./scripts/load-env.js";
import type { ExpoConfig } from "expo/config";

// Bundle ID format: space.manus.<project_name_dots>.<timestamp>
// e.g., "my-app" created at 2024-01-15 10:30:45 -> "space.manus.my.app.t20240115103045"
// Bundle ID can only contain letters, numbers, and dots
// Android requires each dot-separated segment to start with a letter
const rawBundleId = "com.app.opvoedadvies_apk";
const bundleId =
  rawBundleId
    .replace(/[-_]/g, ".") // Replace hyphens/underscores with dots
    .replace(/[^a-zA-Z0-9.]/g, "") // Remove invalid chars
    .replace(/\.+/g, ".") // Collapse consecutive dots
    .replace(/^\.+|\.+$/g, "") // Trim leading/trailing dots
    .toLowerCase()
    .split(".")
    .map((segment) => {
      // Android requires each segment to start with a letter
      // Prefix with 'x' if segment starts with a digit
      return /^[a-zA-Z]/.test(segment) ? segment : "x" + segment;
    })
    .join(".") || "space.manus.app";
// Extract timestamp from bundle ID and prefix with "manus" for deep link scheme
// e.g., "space.manus.my.app.t20240115103045" -> "manus20240115103045"
const timestamp = bundleId.split(".").pop()?.replace(/^t/, "") ?? "";
const schemeFromBundleId = `manus${timestamp}`;

const env = {
  // App branding - update these values directly (do not use env vars)
  appName: "\u0631\u0628\u0651\u0627\u0646\u064A\u0651",
  appSlug: "opvoedadvies_apk",
  // S3 URL of the app logo - set this to the URL returned by generate_image when creating custom logo
  // Leave empty to use the default icon from assets/images/icon.png
  logoUrl: "https://d2xsxph8kpxj0f.cloudfront.net/310519663343602506/hDLuUkY85hL92tUfMz5bZ4/logo_hands_circle_notext-6n223JNfdi7RAqyCbpkijv.png",
  scheme: schemeFromBundleId,
  iosBundleId: bundleId,
  androidPackage: bundleId,
};

// APP_VERSION comes from the release tag in CI (see release.yml); the fallback
// applies to local dev builds only. Numbering continues from Manus 1.1.29.
// versionCode is ALWAYS derived from the version here, so name and code can
// never diverge and a missing/empty env var can't yield an invalid 0.
const APP_VERSION = process.env.APP_VERSION ?? "1.2.0";
// Same shape the release workflow enforces on the tag: three parts, minor/patch
// 0-999 (the versionCode formula collides beyond that), no leading zeros. This
// makes a bad local APP_VERSION fail loudly instead of shipping a wrong code.
if (!/^(0|[1-9]\d*)\.(0|[1-9]\d{0,2})\.(0|[1-9]\d{0,2})$/.test(APP_VERSION)) {
  throw new Error(`APP_VERSION must be MAJOR.MINOR.PATCH with minor/patch 0-999, got "${APP_VERSION}"`);
}
const [vMajor, vMinor, vPatch] = APP_VERSION.split(".").map(Number);
const APP_VERSION_CODE = vMajor * 1_000_000 + vMinor * 1_000 + vPatch;

const config: ExpoConfig = {
  name: env.appName,
  slug: env.appSlug,
  version: APP_VERSION,
  orientation: "portrait",
  icon: "./assets/images/icon.png",
  scheme: env.scheme,
  userInterfaceStyle: "automatic",
  newArchEnabled: true,
  ios: {
    supportsTablet: true,
    bundleIdentifier: env.iosBundleId,
    "infoPlist": {
        "ITSAppUsesNonExemptEncryption": false
      }
  },
  android: {
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
    permissions: ["POST_NOTIFICATIONS", "USE_FULL_SCREEN_INTENT", "SCHEDULE_EXACT_ALARM", "VIBRATE", "WAKE_LOCK", "REQUEST_INSTALL_PACKAGES"],
    intentFilters: [
      {
        action: "VIEW",
        autoVerify: true,
        data: [
          {
            scheme: env.scheme,
            host: "*",
          },
        ],
        category: ["BROWSABLE", "DEFAULT"],
      },
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
      "react-native-android-widget/app.plugin",
      {
        widgets: [
          {
            name: "PrayerWidget",
            label: "\u0623\u0648\u0642\u0627\u062a \u0627\u0644\u0635\u0644\u0627\u0629",
            description: "\u0627\u0644\u0635\u0644\u0627\u0629 \u0627\u0644\u0642\u0627\u062f\u0645\u0629 \u0648\u062c\u0645\u064a\u0639 \u0627\u0644\u0623\u0648\u0642\u0627\u062a",
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
            description: "\u0630\u0643\u0631 \u0645\u062a\u063a\u064a\u0631 \u0645\u0639 \u0627\u0644\u0645\u0635\u062f\u0631 \u0648\u0627\u0644\u0641\u0636\u0644",
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
            label: "\u0647\u062f\u0641 \u0627\u0644\u064a\u0648\u0645 \u0627\u0644\u062a\u0631\u0628\u0648\u064a",
            description: "\u0627\u0644\u0647\u062f\u0641 \u0627\u0644\u062a\u0631\u0628\u0648\u064a \u0627\u0644\u064a\u0648\u0645\u064a \u0645\u0646 \u0627\u0644\u062e\u0637\u0629 \u0627\u0644\u0623\u0633\u0628\u0648\u0639\u064a\u0629",
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
            label: "\u0627\u0644\u062a\u0627\u0631\u064a\u062e \u0627\u0644\u0647\u062c\u0631\u064a",
            description: "\u0627\u0644\u062a\u0627\u0631\u064a\u062e \u0627\u0644\u0647\u062c\u0631\u064a \u0648\u0627\u0644\u0645\u0646\u0627\u0633\u0628\u0629 \u0627\u0644\u0625\u0633\u0644\u0627\u0645\u064a\u0629",
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
            label: "\u0631\u0628\u0651\u0627\u0646\u064a \u0627\u0644\u0634\u0627\u0645\u0644",
            description: "\u0635\u0644\u0627\u0629 + \u0630\u0643\u0631 + \u0647\u062f\u0641 + \u062a\u0627\u0631\u064a\u062e \u0647\u062c\u0631\u064a",
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
        locationWhenInUsePermission: "Opvoedadvies gebruikt uw locatie voor locatiegebonden adviezen en waarschuwingen.",
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
};

export default config;
