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

/**
 * Public OAuth client identifier for the **iOS** app, in the same Google Cloud
 * project as GOOGLE_WEB_CLIENT_ID above. Also not a secret: its reversed form
 * ships in Info.plist as a URL scheme, readable in any installed .ipa.
 *
 * Two things need it, and neither works without it:
 *   - GoogleSignin.configure() REJECTS on iOS when neither `iosClientId` nor a
 *     GoogleService-Info.plist is present (RNGoogleSignin.mm:78), so the sign-in
 *     button throws on first tap rather than failing gracefully. app/login.tsx
 *     therefore hides the button while this is empty — a visibly broken sign-in
 *     is an App Store 2.1 rejection, an absent one is not.
 *   - The @react-native-google-signin plugin's `iosUrlScheme` (app.config.ts)
 *     puts the reversed id in Info.plist so Google's SDK can receive the
 *     redirect back.
 *
 * The API needs NO change to accept it. GIDSignIn sends the web client id as
 * the OAuth `audience` request parameter (GIDSignIn.m:900-901, kAudienceParameter
 * = "audience"), so the ID token's `aud` is GOOGLE_WEB_CLIENT_ID on iOS exactly
 * as on Android — which is the single value the live API verifies against
 * (rabbaanie-api server/web-auth.ts:1182, "exact web-client audience").
 *
 * A LITERAL, not process.env, and deliberately so on both counts. The runtime
 * half of this file is bundled into the app, where only EXPO_PUBLIC_-prefixed
 * vars survive — so a plain env var reads `undefined` in the app and the button
 * silently disappears. Even prefixed, .env is gitignored: a CI build would get
 * an empty value and ship an iOS binary with no Google sign-in, with nothing
 * failing to say so. GOOGLE_WEB_CLIENT_ID above is a literal for the same
 * reason. (.env also carries a copy for the server side; this one governs the
 * app.)
 *
 * Typed as a plain string rather than left to infer its literal type. Whether
 * this is set is a RUNTIME state — it was empty until the OAuth client existed,
 * and clearing it is how you'd turn the iOS button back off — so the `!== ""`
 * check in app/login.tsx is a real check. Inferred, the literal type makes
 * TypeScript prove that comparison always-true and reject it (TS2367).
 *
 * @type {string}
 */
export const GOOGLE_IOS_CLIENT_ID =
  "546852827424-5c286uv9164gu9pjm03ionqupr11fgpi.apps.googleusercontent.com";
