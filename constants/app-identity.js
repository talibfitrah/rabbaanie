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

/**
 * Custom URL scheme the app registers for deep links: rabbaanie:///...
 *
 * The live login path is app/login.tsx, which builds its redirect with
 * Linking.createURL() — no explicit scheme — and passes it to the backend as a
 * redirect_uri query parameter. That backend (server/web-auth.ts, deployed at
 * api.rabbaanie.com) redirects to whatever URI the app supplied, so this value
 * carries that flow on its own.
 *
 * It does NOT carry the older Manus-portal flow in constants/oauth.ts, whose
 * server counterpart (server/_core/oauth.ts) hardcodes "manusapk:///oauth/callback"
 * rather than echoing the app's URI. That flow is unreachable — nothing imports
 * startOAuthLogin/getLoginUrl/getRedirectUri, and api.rabbaanie.com returns 404
 * for /api/oauth/native-callback — but if it is ever revived, the server side
 * must be changed to match this scheme or login will fail silently.
 */
export const APP_SCHEME = "rabbaanie";
