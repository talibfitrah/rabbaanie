#!/usr/bin/env bash
# Gate an App Store artifact (.ipa, or the .app / .xcarchive a developer has on
# hand before an ipa exists) against the things that get an app rejected at
# upload or in review.
#
# Why this exists as a script rather than only as steps in a workflow:
# `ios/` is gitignored, so CI always prebuilds from a clean tree and a
# workflow's own checks are enough THERE. A build run by hand on a developer
# box is not clean — `expo prebuild` MERGES into an existing ios/ rather than
# regenerating it, exactly as it does for android/ (app.config.ts documents
# that for USE_FULL_SCREEN_INTENT). So an Info.plist key written during an
# earlier prebuild — a UIBackgroundModes entry from expo-task-manager, an
# aps-environment entitlement, a usage string that has since been rewritten —
# survives into an artifact built on top of it. Nothing else would catch that.
# This gate reads the SHIPPED artifact, so it does not care how it was made.
#
#   scripts/assert-ios-artifact.sh path/to/Rabbaanie.ipa
#   scripts/assert-ios-artifact.sh path/to/Rabbaanie.app
#   scripts/assert-ios-artifact.sh path/to/Rabbaanie.xcarchive
#
# Exit 0 = safe to upload. Any non-zero = do not upload.
set -uo pipefail

ART="${1:-}"
if [ -z "$ART" ] || [ ! -e "$ART" ]; then
  echo "usage: $0 <path-to-.ipa-or-.app-or-.xcarchive>" >&2
  exit 2
fi

FAILED=0
fail() { echo "FORBIDDEN: $*" >&2; FAILED=1; }
# The other half of the gate. A check that only asserts what must be ABSENT
# lets a capability vanish silently — the artifact still builds, installs and
# runs, it is just missing something Apple or the user needs. Same reasoning as
# the BILLING and device-reach assertions in assert-play-artifact.sh.
missing() { echo "MISSING: $*" >&2; FAILED=1; }

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

# --- 1. Locate the .app payload ----------------------------------------------
# All three accepted containers reduce to one app bundle. Anything else is a
# path we cannot verify, and an unverifiable artifact must not be uploaded.
case "$ART" in
  *.ipa)
    # Exit status checked, not discarded. A truncated or partially-extracted
    # .ipa can still yield a readable Payload/*.app/Info.plist, and everything
    # downstream would then grade an artifact that is missing files — passing an
    # incomplete upload. An archive we cannot fully unpack is unverifiable, and
    # unverifiable must never mean OK.
    if ! unzip -q "$ART" -d "$TMP/x" 2>/dev/null; then
      echo "Could not fully extract $ART — refusing to ship unverified" >&2
      exit 1
    fi
    APP=$(find "$TMP/x/Payload" -maxdepth 1 -name '*.app' 2>/dev/null | head -1)
    ;;
  *.xcarchive)
    APP=$(find "$ART/Products/Applications" -maxdepth 1 -name '*.app' 2>/dev/null | head -1)
    ;;
  *.app)
    APP="$ART"
    ;;
  *)
    echo "Unrecognised artifact type: $ART (expected .ipa, .app or .xcarchive)" >&2
    exit 2
    ;;
esac
if [ -z "${APP:-}" ] || [ ! -d "$APP" ]; then
  echo "Could not find an .app bundle in $ART — refusing to ship unverified" >&2
  exit 1
fi

# --- 2. Info.plist -----------------------------------------------------------
# An Info.plist inside a BUILT app is a binary plist, not text. A plain grep
# silently finds nothing, so every absence check below would pass on an
# artifact that does declare the forbidden key — a clean bill of health on a
# bad artifact, which is worse than having no gate at all. Convert first, and
# treat a failed conversion as a hard stop rather than an empty result.
PLIST="$APP/Info.plist"
if [ ! -f "$PLIST" ]; then
  echo "No Info.plist in $APP — refusing to ship unverified" >&2
  exit 1
fi
INFO="$TMP/Info.xml"
if ! plutil -convert xml1 -o "$INFO" "$PLIST" 2>/dev/null; then
  echo "Could not read $PLIST as a plist — refusing to ship unverified" >&2
  exit 1
fi
# Self-check: every iOS Info.plist names the bundle identifier. If the key is
# not there, the conversion produced something we do not understand and every
# check below would pass vacuously. Fail loudly instead.
if ! grep -q '<key>CFBundleIdentifier</key>' "$INFO"; then
  echo "Info.plist parsed but has no CFBundleIdentifier — refusing to ship unverified" >&2
  exit 1
fi

has_key() { grep -q "<key>$1</key>" "$INFO"; }
value_of() { /usr/libexec/PlistBuddy -c "Print :$1" "$INFO" 2>/dev/null; }

# --- 3. Keys that must be ABSENT ---------------------------------------------
# aps-environment is an entitlement, not an Info.plist key — checked in step 5.
# UIBackgroundModes is checked by content just below, not here — see there.
# NSMicrophoneUsageDescription  expo-camera, expo-av and expo-image-picker each
#   inject it by default (see withCamera.js / withAV.js / withImagePicker.js).
#   Nothing in this app records: the only expo-av calls are Audio.Sound
#   playback, the same reasoning that blocks RECORD_AUDIO on Android. Removing
#   it needs an explicit `NSMicrophoneUsageDescription: false` in the config,
#   which is exactly the kind of entry a merged prebuild can lose.
# NSLocationAlways*  Location is foreground-only — there is no
#   startLocationUpdatesAsync, watchPositionAsync or geofencing anywhere. An
#   Always string asks review for background location the app never uses.
# NSUserTrackingUsageDescription  No analytics, ads, attribution or IDFA SDK
#   exists. The string alone triggers the tracking review path.
# NSPhotoLibraryUsageDescription  The only ImagePicker calls sit behind
#   ATTACHMENTS_ENABLED (DISTRIBUTION_CHANNEL === "github") in app/ai-chat.tsx,
#   so a store build never opens the photo library, and nothing anywhere writes
#   back to it. app.config.ts passes photosPermission: false to delete the key;
#   its reappearance means that option was lost and the app is asking review for
#   library access it cannot use.
for KEY in NSMicrophoneUsageDescription \
           NSLocationAlwaysUsageDescription \
           NSLocationAlwaysAndWhenInUseUsageDescription \
           NSPhotoLibraryUsageDescription \
           NSUserTrackingUsageDescription; do
  if has_key "$KEY"; then
    fail "$KEY is present in the artifact"
  fi
done

# UIBackgroundModes is checked by CONTENT, not by presence, so this gate agrees
# with the config it guards. app.config.ts's withoutUnusedIosCapabilities
# subtracts the "fetch" entry and keeps the key when anything else remains —
# deliberately, so that adding a legitimate mode later (background "audio" for
# the adhan, say) is not silently erased by a mod that runs last. A gate that
# forbade the key outright would then fail a build the config had produced on
# purpose, and a gate that contradicts its own config gets switched off.
#
# "fetch" specifically is what must never ship: expo-task-manager and
# expo-background-fetch inject it unconditionally whenever they are linked, for
# a task that never registers on iOS — lib/widget-background-task.ts returns
# early on any non-Android platform. Apple asks what the mode is for, and there
# is no truthful answer.
if has_key UIBackgroundModes && value_of UIBackgroundModes | grep -qw fetch; then
  fail "UIBackgroundModes declares \"fetch\" — no iOS background task is ever registered"
fi

# --- 4. Keys that must be PRESENT and correct --------------------------------
BUNDLE_ID=$(value_of CFBundleIdentifier)
if [ "$BUNDLE_ID" != "com.rabbaanie.app" ]; then
  fail "CFBundleIdentifier is \"$BUNDLE_ID\", expected com.rabbaanie.app"
fi

# Apple asks the export-compliance question at every upload unless the answer
# is already in the binary. Absent, each release stalls on a manual prompt;
# true, it demands documentation this app has no need to file.
if ! has_key ITSAppUsesNonExemptEncryption; then
  missing "ITSAppUsesNonExemptEncryption — every upload will stall on the export-compliance prompt"
elif [ "$(value_of ITSAppUsesNonExemptEncryption)" != "false" ]; then
  fail "ITSAppUsesNonExemptEncryption is not false"
fi

# Version strings. CFBundleVersion left at the template default of 1 uploads
# once and then collides with itself on the next build, which App Store Connect
# rejects after the artifact has already been produced.
for KEY in CFBundleShortVersionString CFBundleVersion; do
  has_key "$KEY" || missing "$KEY"
done
if [ "$(value_of CFBundleVersion)" = "1" ]; then
  fail "CFBundleVersion is still the default 1"
fi

# Usage strings the app genuinely needs: the camera for QR scanning and child
# login, foreground location for prayer times / qibla / mosque lookup, and
# motion for the qibla compass.
#
# NSPhotoLibraryUsageDescription is deliberately NOT in this list, and belongs
# in the forbidden set above instead. The only ImagePicker calls live in
# app/ai-chat.tsx behind ATTACHMENTS_ENABLED (DISTRIBUTION_CHANNEL ===
# "github"), so a store build never reaches the photo library, and app.config.ts
# passes photosPermission: false to delete the key. Requiring it here made this
# gate impossible to pass: every artifact built from that config failed on a key
# the same config removes on purpose. A gate that can never pass gets switched
# off, which is worse than not having one.
#
# Presence is not enough for the rest. Every Expo permission plugin supplies a
# default of the literal form `Allow $(PRODUCT_NAME) to access your <thing>`,
# and Xcode EXPANDS $(PRODUCT_NAME) at build time — so a regressed build ships
# "Allow Rabbaanie to access your camera" and matching the literal
# "$(PRODUCT_NAME)" alone would never fire on a real artifact. Match the shape
# instead, which catches both the expanded and unexpanded forms. Apple rejects
# these defaults for not explaining what the data is used for, and a config that
# stops setting the real string falls back to them silently.
for KEY in NSCameraUsageDescription \
           NSLocationWhenInUseUsageDescription \
           NSMotionUsageDescription; do
  if ! has_key "$KEY"; then
    missing "$KEY"
    continue
  fi
  if value_of "$KEY" | grep -qE '^Allow (.*) to access your '; then
    fail "$KEY has regressed to the Expo plugin default: \"$(value_of "$KEY")\""
  fi
done

# --- 5. Entitlements ---------------------------------------------------------
# Entitlements are not in Info.plist. Read them from the signature where the
# artifact is signed, and fall back to the copies a build leaves inside the
# bundle otherwise. Say which source was used, and refuse to ship if none can
# be read rather than skipping the check silently.
ENT="$TMP/entitlements.xml"
ENT_SOURCE=""
if codesign -d --entitlements :- "$APP" 2>/dev/null \
     | sed -n '/<?xml/,/<\/plist>/p' > "$ENT" && [ -s "$ENT" ]; then
  ENT_SOURCE="codesign"
elif [ -f "$APP/archived-expanded-entitlements.xcent" ] \
     && plutil -convert xml1 -o "$ENT" "$APP/archived-expanded-entitlements.xcent" 2>/dev/null; then
  ENT_SOURCE="archived-expanded-entitlements.xcent"
fi
# embedded.mobileprovision is deliberately NOT a source here, though it was.
# It holds the entitlements the PROFILE GRANTS, not the ones the binary
# REQUESTS, and those are different sets: a profile carries every capability
# enabled on the App ID, so an App ID with Push switched on hands out a profile
# containing aps-environment whether or not the app asked for it. Reading it
# would fail a perfectly clean artifact, and a gate that cries wolf on a good
# build is one people learn to bypass.
#
# codesign reads the signature actually applied to this binary, and
# archived-expanded-entitlements.xcent is what Xcode wrote for it; both answer
# the question this check asks. If neither can be read on a device or store
# build, the state is genuinely unverifiable and the refusal below is correct.
# The discriminator is the PLATFORM, not whether entitlements happened to be
# readable. Nesting the simulator carve-out inside "could not read them" was
# wrong in a case that only became reachable once rbany.entitlements stopped
# being an empty <dict/>: Xcode ad-hoc-signs a simulator build when the target
# HAS entitlements, so codesign then succeeds, the run falls through to the
# device path, and a simulator .app is graded against store rules — the "gate
# that always fails on the artifact you have to hand" this carve-out exists to
# prevent. A simulator build's entitlements are never the ones that ship, so
# reading them proves nothing either way.
IS_SIMULATOR=0
[ "$(value_of DTPlatformName)" = "iphonesimulator" ] && IS_SIMULATOR=1

if [ "$IS_SIMULATOR" -eq 1 ]; then
  # Loud, and it says what still has to be run. This is NOT a licence to skip
  # the check where it matters: a device or store build takes the branches
  # below, and one with unreadable entitlements still refuses outright — that
  # case means the signature or profile could not be read, exactly the
  # unverifiable state this script exists to catch.
  echo "NOTE: simulator build — its entitlements are not the ones that ship, so the entitlement checks cannot run here." >&2
  echo "      Re-run this gate on the .ipa or .xcarchive before uploading; that run covers the entitlements." >&2
elif [ -z "$ENT_SOURCE" ]; then
  echo "Could not read entitlements from $APP via codesign or archived-expanded-entitlements.xcent — refusing to ship unverified" >&2
  exit 1
else
  echo "entitlements read from: $ENT_SOURCE"

  # No iOS push code exists — the push registration path returns early unless
  # Platform.OS is android, because the backend is FCM-only. An aps-environment
  # entitlement with no APNs implementation behind it is a stale-prebuild tell
  # and an avoidable review question.
  if grep -q '<key>aps-environment</key>' "$ENT"; then
    fail "aps-environment is present in the entitlements — the app registers no iOS push"
  fi

  # The mirror, and the one entitlement this app cannot ship without. Every
  # prayer, adhan and iqamah notification is scheduled with interruptionLevel:
  # "timeSensitive"; unentitled, iOS DOWNGRADES that to "active" rather than
  # rejecting it — no error, no log, nothing at build or run time — and the
  # notification silently stops piercing Focus and Do Not Disturb. That is the
  # headline feature failing in exactly the situation it exists for.
  # Read by VALUE, not presence: the entitlement is a boolean, and a <false/>
  # is as inert as an absent key while satisfying any grep for the key.
  TIME_SENSITIVE=$(/usr/libexec/PlistBuddy -c "Print :com.apple.developer.usernotifications.time-sensitive" "$ENT" 2>/dev/null)
  if [ -z "$TIME_SENSITIVE" ]; then
    missing "com.apple.developer.usernotifications.time-sensitive entitlement — iOS will downgrade every timeSensitive notification to active and the adhan will not pierce Focus or Do Not Disturb"
  elif [ "$TIME_SENSITIVE" != "true" ]; then
    fail "com.apple.developer.usernotifications.time-sensitive is \"$TIME_SENSITIVE\", expected true"
  fi

  # Sign in with Apple, and the same reasoning as the time-sensitive entitlement
  # above: it must be PRESENT. Apple's guideline 4.8 requires the Apple button
  # because the app offers Google sign-in, and the button's native flow will not
  # produce a usable credential without this entitlement. A merged prebuild that
  # dropped it would still build and install — the button simply fails on tap —
  # so absence has to fail the gate. The value is the array ["Default"]; presence
  # of the key is the check (PlistBuddy prints "Array {" for it, empty if absent).
  APPLE_SIGNIN=$(/usr/libexec/PlistBuddy -c "Print :com.apple.developer.applesignin" "$ENT" 2>/dev/null)
  if [ -z "$APPLE_SIGNIN" ]; then
    missing "com.apple.developer.applesignin entitlement — Sign in with Apple will not work and App Review rejects the app under guideline 4.8"
  fi
fi

# --- 6. Privacy manifest -----------------------------------------------------
# Apple returns ITMS-91053 at upload when required-reason API declarations are
# missing. Expo's withPrivacyInfo returns the config untouched when
# ios.privacyManifests is absent, so the file is simply never generated and
# there is no build error to notice — the upload is the first thing that fails.
if [ ! -f "$APP/PrivacyInfo.xcprivacy" ]; then
  missing "PrivacyInfo.xcprivacy in the app bundle — Apple will reject the upload with ITMS-91053"
else
  # Existence is NOT enough, and this is the one check the config cannot make
  # for itself. @expo/config-plugins' setPrivacyInfo MERGES into any existing
  # ios/<name>/PrivacyInfo.xcprivacy and the merge is additive only: per-entry
  # NSPrivacyCollectedDataTypeTracking and ...Linked are never overwritten, and
  # NSPrivacyTrackingDomains is unioned, never pruned. So once a wrong value is
  # in that file, NOTHING in app.config.ts can take it back out — not editing
  # the config, not a fresh `expo prebuild` without --clean. It survives, and
  # tests/ios-config.test.ts cannot see it because that reads the CONFIG via
  # introspection, not the merged file.
  #
  # A stale NSPrivacyTracking: true, or a leftover tracking domain from a
  # dependency that was removed, is a compliance failure that ships silently.
  # Read the shipped file.
  PRIV="$TMP/privacy.xml"
  if ! plutil -convert xml1 -o "$PRIV" "$APP/PrivacyInfo.xcprivacy" 2>/dev/null; then
    echo "Could not read $APP/PrivacyInfo.xcprivacy as a plist — refusing to ship unverified" >&2
    exit 1
  fi
  if [ "$(/usr/libexec/PlistBuddy -c 'Print :NSPrivacyTracking' "$PRIV" 2>/dev/null)" != "false" ]; then
    fail "PrivacyInfo.xcprivacy does not declare NSPrivacyTracking as false"
  fi
  # PlistBuddy prints an empty array as "Array {}" across two lines; any entry
  # adds a line between them. Count real entries rather than parse the wrapper.
  if [ "$(/usr/libexec/PlistBuddy -c 'Print :NSPrivacyTrackingDomains' "$PRIV" 2>/dev/null | sed '1d;$d' | grep -c '[^[:space:]]')" -ne 0 ]; then
    fail "PrivacyInfo.xcprivacy lists tracking domains; this app declares no tracking"
  fi
  # Any single collected type marked as tracking contradicts NSPrivacyTracking
  # above, and Apple cross-checks both against the App Store Connect answers.
  if grep -A1 '<key>NSPrivacyCollectedDataTypeTracking</key>' "$PRIV" | grep -q '<true/>'; then
    fail "PrivacyInfo.xcprivacy marks at least one collected data type as used for tracking"
  fi
fi

# --- 7. Localized purpose strings --------------------------------------------
# The .lproj files are written by a withXcodeProject mod (the strings have to be
# registered in the pbxproj, not just written to disk), and introspection has no
# base mod for xcodeproj any more than it does for dangerous mods, so it drops
# both — tests/ios-config.test.ts says so in its own header. So this
# is the only gate that can see them at all. Presence, not just absence: if the
# mod silently stops running, the app still builds and still has valid English
# strings, and only an Arabic-speaking reviewer would ever notice.
for LANG_DIR in ar nl en; do
  STRINGS="$APP/$LANG_DIR.lproj/InfoPlist.strings"
  if [ ! -f "$STRINGS" ]; then
    missing "$LANG_DIR.lproj/InfoPlist.strings — the localized purpose strings did not reach the bundle"
    continue
  fi
  # Built .strings files are usually binary plists, so convert before reading.
  LOC="$TMP/loc-$LANG_DIR.xml"
  if ! plutil -convert xml1 -o "$LOC" "$STRINGS" 2>/dev/null; then
    echo "Could not read $STRINGS as a plist — refusing to ship unverified" >&2
    exit 1
  fi
  for KEY in NSCameraUsageDescription NSLocationWhenInUseUsageDescription NSMotionUsageDescription; do
    VAL=$(/usr/libexec/PlistBuddy -c "Print :$KEY" "$LOC" 2>/dev/null)
    if [ -z "$VAL" ]; then
      missing "$KEY in $LANG_DIR.lproj/InfoPlist.strings"
    elif printf '%s' "$VAL" | grep -qE '^Allow (.*) to access your '; then
      fail "$KEY in $LANG_DIR.lproj has regressed to the Expo plugin default: \"$VAL\""
    fi
  done
done

# --- 8. Adhan notification sounds --------------------------------------------
# The capability that actually vanished silently once, and the reason this
# section exists. lib/notifications.ts names `adhan_<id>.caf` in content.sound;
# withIosAdhanSounds is what copies those files in and registers them in the
# Xcode project. When that mod was missing, a full prebuild produced a bundle
# with zero .caf in it and NOTHING reported it — UNNotificationSound does not
# throw on an unresolvable name, iOS just plays the system default, so the
# user's chosen adhan silently never plays. tests/ios-config.test.ts pins the
# config side, but introspection drops withXcodeProject mods, so only a real
# artifact can prove the files arrived.
#
# The id list is read from the same source the app and the config use, so this
# gate cannot drift from them.
# stderr is KEPT, not discarded. lib/adhan-sound-ids.js is ESM (`export const`)
# and require() only resolves it on Node >= 20.19 / 22.12. Swallowing the error
# left an empty $IDS and the message below blamed the working directory — so on
# an older Node the operator debugs the wrong thing, on the one run that stands
# between them and a submission. It still fails closed either way; what changes
# is that the reason is now on screen.
IDS_ERR="$TMP/ids-err.txt"
IDS=$(node -e 'const {ADHAN_SOUND_IDS}=require("./lib/adhan-sound-ids.js");process.stdout.write(ADHAN_SOUND_IDS.join("\n"))' 2>"$IDS_ERR")
if [ -z "$IDS" ]; then
  echo "Could not read ADHAN_SOUND_IDS from ./lib/adhan-sound-ids.js — refusing to ship unverified" >&2
  echo "  Run this from the repo root. If the error below mentions 'Cannot use import statement' or" >&2
  echo "  'require() of an ES Module', the Node here is too old to require() ESM — needs >= 20.19 or >= 22.12." >&2
  [ -s "$IDS_ERR" ] && sed 's/^/  node: /' "$IDS_ERR" >&2
  exit 1
fi
#
# Presence alone was not enough, and that hole was real: `[ ! -f ... ]` passes
# on a ZERO-BYTE file, so a copy step that created the files and then failed to
# fill them scored a clean sweep here. The runtime symptom is identical to the
# missing-file one this section was written for — UNNotificationSound resolves
# the name, plays nothing, and reports nothing. So read the content too: the
# `caff` magic every Core Audio File starts with, and a floor of 16 KiB, which
# is about two seconds at the lowest bitrate any of these files uses (8 kHz
# ima4, ~8.6 KB/s) and an order of magnitude under the smallest real one. Low
# enough never to cry wolf on a short takbeer clip, high enough that an empty,
# header-only or badly truncated file cannot pass.
for ID in $IDS; do
  CAF="$APP/adhan_$ID.caf"
  SIZE=$(wc -c < "$CAF" 2>/dev/null | tr -d ' ')
  if [ ! -f "$CAF" ]; then
    missing "adhan_$ID.caf in the app bundle — iOS would silently play the system default instead of this adhan"
  elif [ "${SIZE:-0}" -lt 16384 ]; then
    fail "adhan_$ID.caf is only $SIZE bytes — empty or truncated, so this adhan would play as silence"
  elif ! head -c 4 "$CAF" | grep -qa 'caff'; then
    fail "adhan_$ID.caf does not begin with the CAF magic \"caff\" — it is not a Core Audio File and iOS cannot play it"
  fi
done

if [ "$FAILED" -ne 0 ]; then
  echo "" >&2
  echo "$ART is NOT safe to upload to the App Store." >&2
  exit 1
fi
# The success line has to claim only what was actually read. Reaching here with
# IS_SIMULATOR means the skip in step 5 fired and NO entitlement
# was examined — yet the wording was unconditional, asserting "declares no
# forbidden keys or entitlements" on a run where neither entitlement check
# executed. The NOTE explaining the skip goes to stderr, so a reader capturing
# stdout — a log, a CI summary, `| tail -1` — saw an unqualified clean bill and
# nothing else. Exit stays 0: a simulator .app is one of the three inputs this
# script advertises and it did pass everything it could run. What changes is
# that the partial result now says so on the same stream as the verdict.
if [ "$IS_SIMULATOR" -eq 1 ]; then
  echo "PARTIAL OK: $ART declares no forbidden Info.plist keys, and carries the required identity, version, usage, privacy, localization and sound resources."
  echo "PARTIAL OK: entitlements were NOT examined — simulator build. aps-environment and com.apple.developer.usernotifications.time-sensitive remain UNVERIFIED; re-run on the .ipa or .xcarchive before uploading."
else
  echo "OK: $ART declares no forbidden keys or entitlements, and carries the required identity, version, usage, privacy, localization and sound resources."
fi
