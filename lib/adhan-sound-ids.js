/**
 * The 3 adhan sound ids, as a plain array with zero dependencies — imported
 * by both app.config.ts (build time, Node) and lib/notifications.ts
 * (AdhanSoundOption's literal values), so the two can never drift apart.
 *
 * This is .js rather than .ts on purpose, same reason as
 * constants/app-identity.js: Expo's config loader transpiles app.config.ts
 * to CommonJS and require()s it, and that resolver does not look for
 * sibling .ts files. TypeScript reads this file directly (expo/tsconfig.base
 * sets allowJs), so the literal array type survives with no declaration file.
 *
 * Adding a 4th sound means adding it here, to ADHAN_SOUND_OPTIONS in
 * lib/notifications.ts, and to the withAdhanSoundResources config plugin's
 * expectation that a matching MP3 exists in assets/sounds/.
 */
export const ADHAN_SOUND_IDS = ["takbeer_1", "takbeer_2", "takbeer_3"];
