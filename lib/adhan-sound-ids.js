/**
 * The 3 adhan sound ids, as a plain array with zero dependencies. This list is
 * what decides what gets BUNDLED: app.config.ts maps over it in both
 * withAdhanSoundResources (Android MP3s) and withIosAdhanSounds (iOS CAFs), and
 * scripts/assert-ios-artifact.sh reads it to check the shipped artifact.
 *
 * lib/notifications.ts imports it in one place — adhanSoundFile validates the
 * stored preference against it, so an id that is no longer bundled falls back
 * to the default instead of resolving to a filename nothing ships (iOS answers
 * an unresolvable sound name with silence, not an error).
 *
 * It does NOT define the pickable list. lib/notifications.ts hardcodes both the
 * AdhanSoundOption union and ADHAN_SOUND_OPTIONS, so the two CAN drift and
 * `tsc --noEmit` will not notice — emptying this array still typechecks. The
 * guard against that is a test, not the compiler: see "the pickable adhan
 * sounds and the bundled adhan sounds are the same set" in
 * tests/adhan-ios-sound.test.ts.
 *
 * This is .js rather than .ts on purpose, same reason as
 * constants/app-identity.js: Expo's config loader transpiles app.config.ts
 * to CommonJS and require()s it, and that resolver does not look for
 * sibling .ts files. TypeScript reads this file directly (expo/tsconfig.base
 * sets allowJs), so the literal array type survives with no declaration file.
 *
 * Adding a 4th sound means FOUR edits, and the prebuild throws if any is missed:
 *   1. this array
 *   2. ADHAN_SOUND_OPTIONS and the AdhanSoundOption union in lib/notifications.ts
 *   3. assets/sounds/adhan_<id>.mp3   — withAdhanSoundResources throws without it
 *   4. assets/sounds/adhan_<id>.caf   — withIosAdhanSounds throws without it,
 *      and it must stay under iOS's 30-second ceiling or iOS silently
 *      substitutes the default sound.
 */
export const ADHAN_SOUND_IDS = ["takbeer_1", "takbeer_2", "takbeer_3"];
