/**
 * Single source of truth for the app's Android/iOS identity.
 *
 * Imported by BOTH app.config.ts (build time, Node) and app/runtime code, so the
 * package name and deep link scheme can never drift apart. Keep this file free of
 * React Native / Expo imports — app.config.ts evaluates it in plain Node before
 * any bundler runs.
 *
 * This is .js rather than .ts on purpose: Expo's config loader transpiles
 * app.config.ts to CommonJS and require()s it, and that resolver does not look
 * for sibling .ts files. TypeScript reads this file directly (expo/tsconfig.base
 * sets allowJs), so the literal types survive and no declaration file is needed.
 * It requires Node >= 22 for require(esm); both workflows pin node-version: 22.
 *
 * APP_PACKAGE is permanent once the app is published to Google Play. It cannot
 * be changed afterwards without shipping a different app.
 */

/**
 * The Android applicationId / iOS bundle identifier.
 *
 * DELIBERATE RENAME from "com.app.opvoedadvies.apk" — a Manus template artifact
 * that literally ended in ".apk". Made before the first Play submission because
 * that is the last moment it can be changed at all.
 *
 * Accepted consequence: Android keys installs by package name, so an install of
 * the old package is a DIFFERENT app. Anyone still running a Manus-era build
 * (the 1.1.x line this numbering continues from) keeps it, gets a second icon
 * when they install this one, and starts from empty storage — logged out, local
 * history gone. There is no migration path; Android provides no supported way to
 * carry data across a package rename. The GitHub channel has no installed base
 * to strand, because no release there ever published successfully.
 */
export const APP_PACKAGE = "com.rabbaanie.app";

/** General app deep-link scheme for the sideload distribution only. */
export const APP_SCHEME = "rabbaanie";

/**
 * Public OAuth client identifier used to ask Google Play services for an ID
 * token addressed to the Rabbaanie backend. This is intentionally not a
 * secret: Google binds Android sign-in to APP_PACKAGE and the registered app
 * signing certificate, while the server verifies the signed token audience.
 */
export const GOOGLE_WEB_CLIENT_ID =
  "546852827424-jchq36r9vu7bjbmn7gg5198ethlk625o.apps.googleusercontent.com";
