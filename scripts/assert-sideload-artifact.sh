#!/usr/bin/env bash
# Gate a sideload APK on the one property that, when wrong, breaks every user
# at once and cannot be walked back by shipping another build.
#
#   scripts/assert-sideload-artifact.sh rabbaanie-v1.4.83.apk
#
# Exit 0 = safe to publish to api.rabbaanie.com/downloads. Any non-zero = do not.
#
# WHY THE SIGNING KEY IS THE CHECK
#
# The sideload channel's identity is the Expo/RN debug keystore that Gradle
# signs release builds with (android/app/build.gradle wires buildTypes.release
# to signingConfigs.debug). Two independent things are bound to it:
#
#   1. Every sideload install in the wild. Android refuses an update signed by
#      a different key — INSTALL_FAILED_UPDATE_INCOMPATIBLE. The in-app updater
#      downloads 160MB and the install fails; the only way out for a user is to
#      uninstall, losing their session and all local data.
#   2. The Android OAuth client, registered against this key's SHA-1. An APK
#      signed with anything else fails Google sign-in with DEVELOPER_ERROR (10).
#
# Both shipped together on 2026-08-09, from hand-signed builds that used
# release.p12 (the Play upload key) instead. Nothing caught it: the APK builds,
# installs on a clean device, and launches — it only fails for people who
# already have the app, which is everyone.
#
# v1.4.81, v1.4.82 and the first v1.4.83 all went out on release.p12 (verified:
# CN=Rabbaanie, SHA-256 d81a74e9…). v1.4.83 was re-signed and republished on the
# debug key the same day, so whoever installed during that window is stranded on
# the other lineage and has to uninstall before they can take another update.
# That is the cost this gate exists to prevent, not something it can undo.
#
# This mirrors scripts/assert-play-artifact.sh and exists for the same reason:
# a build run by hand on a developer box has no CI gates in front of it, and the
# manual path is the one that actually ships. It reads the SHIPPED file, so it
# does not care how the artifact was produced.
#
# DO NOT "fix" a failure here by updating EXPECTED to whatever the artifact is
# signed with. That inverts the check into a rubber stamp. Moving the sideload
# channel onto another key is possible, but it needs a v3 signing-lineage
# rotation (`apksigner rotate` + `--lineage`) so existing installs still accept
# the update, and it strands anyone below Android 9 regardless.
set -uo pipefail

ART="${1:-}"
if [ -z "$ART" ] || [ ! -f "$ART" ]; then
  echo "usage: $0 <path-to-sideload.apk>" >&2
  exit 2
fi

# The Expo/RN debug certificate. This is a fixed, publicly-known certificate —
# pinning it here leaks nothing, and it is the value every install in the wild
# already trusts.
EXPECTED="fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c"

APKSIGNER=""
if [ -n "${ANDROID_HOME:-}" ] && [ -d "$ANDROID_HOME/build-tools" ]; then
  APKSIGNER="$ANDROID_HOME/build-tools/$(ls "$ANDROID_HOME/build-tools" | sort -V | tail -n1)/apksigner"
fi
if [ ! -x "$APKSIGNER" ]; then
  APKSIGNER=$(command -v apksigner || true)
fi
if [ -z "$APKSIGNER" ] || [ ! -x "$APKSIGNER" ]; then
  echo "apksigner not found (set ANDROID_HOME or put it on PATH) — refusing to ship unverified" >&2
  exit 1
fi

CERTS=$("$APKSIGNER" verify --print-certs "$ART" 2>&1) || {
  echo "$CERTS" >&2
  echo "apksigner could not verify $ART — refusing to ship unverified" >&2
  exit 1
}
echo "$CERTS"

# Anchored on "certificate SHA-256 digest" specifically: --print-certs also
# emits a public-key digest line, and matching either would make the pin weaker
# than it looks.
if ! echo "$CERTS" | grep -qi "certificate SHA-256 digest: $EXPECTED"; then
  echo "" >&2
  echo "FORBIDDEN: $ART is not signed by the sideload key." >&2
  echo "Expected certificate SHA-256 $EXPECTED" >&2
  echo "Publishing this would break the in-app updater AND Google sign-in for every existing user." >&2
  exit 1
fi
# grep -q would pass on "expected cert AND some other signer too", so count as
# well — the invariant is signed by that cert and nothing else.
SIGNERS=$(echo "$CERTS" | grep -ci "certificate SHA-256 digest:" || true)
if [ "$SIGNERS" -ne 1 ]; then
  echo "" >&2
  echo "FORBIDDEN: expected exactly 1 signer, found $SIGNERS" >&2
  exit 1
fi


# --- RELEASE CHANNEL ---------------------------------------------------------
#
# The signing key above is what breaks existing users irrecoverably. This second
# half catches the quieter failure: an APK that is signed correctly but was
# built as a PLAY-channel artifact and published to the sideload channel anyway.
#
# It happens because APP_DISTRIBUTION defaults to "play" (app.config.ts), so a
# hand-run `expo prebuild && gradlew assembleRelease` that forgets the env var
# produces a Play build that looks normal. v1.4.81, v1.4.82 and v1.4.83 all
# shipped exactly that (v1.4.72 was the last correct one):
#
#   - CHILD_MONITORING_ENABLED is false, so the child-account button is gone
#     from the home header, messages, weekly and family screens.
#   - REQUEST_INSTALL_PACKAGES is absent, so the in-app updater downloads 160MB
#     and Android then refuses to install it — the channel cannot update itself
#     out of the mistake.
#   - DISTRIBUTION_CHANNEL is "play", so subscribe.tsx hides Stripe checkout and
#     the server rejects sold coupons for these users.
#
# All of this is read from the shipped file, mirroring the signing check above
# and scripts/assert-play-artifact.sh, which asserts the exact inverse.
TMP=$(mktemp -d) || exit 1
trap 'rm -rf "$TMP"' EXIT

if ! unzip -p "$ART" assets/app.config > "$TMP/app.config" 2>/dev/null ||
   [ ! -s "$TMP/app.config" ]; then
  echo "Could not read the embedded Expo config from $ART — refusing to ship unverified" >&2
  exit 1
fi
if ! grep -q '"distribution":"github"' "$TMP/app.config"; then
  echo "" >&2
  echo "FORBIDDEN: $ART is not a sideload-channel build." >&2
  echo "Expected \"distribution\":\"github\", found: $(grep -o '"distribution":"[^"]*"' "$TMP/app.config" || echo 'field absent')" >&2
  echo "Rebuild with APP_DISTRIBUTION=github (prebuild AND gradle — both read it)." >&2
  exit 1
fi
# The sideload-only capability flag rides along with the channel; assert it
# directly so a future edit that decouples the two still fails here.
if ! grep -q '"childMonitoring":true' "$TMP/app.config"; then
  echo "" >&2
  echo "FORBIDDEN: childMonitoring is not enabled in $ART — the child-account button would be missing." >&2
  exit 1
fi

# A compiled AndroidManifest is binary XML, so grepping the extracted bytes only
# tells you a string is in the pool — not that an active <uses-permission> node
# references it. Parse it instead. aapt2 ships in the same build-tools directory
# as apksigner, so anything able to run the check above can run this one; refuse
# rather than fall back to a weaker test, for the same reason as apksigner.
AAPT2="$(dirname "$APKSIGNER")/aapt2"
if [ ! -x "$AAPT2" ]; then
  AAPT2=$(command -v aapt2 || true)
fi
if [ -z "$AAPT2" ] || [ ! -x "$AAPT2" ]; then
  echo "aapt2 not found next to apksigner or on PATH — refusing to ship unverified" >&2
  exit 1
fi
"$AAPT2" dump permissions "$ART" > "$TMP/perms.txt" 2>&1
# Self-check: the dump always opens with the package line. Without it the parse
# failed and every check below would pass vacuously.
if ! grep -q "^package: com.rabbaanie.app$" "$TMP/perms.txt"; then
  cat "$TMP/perms.txt" >&2
  echo "aapt2 could not parse the manifest of $ART — refusing to ship unverified" >&2
  exit 1
fi
# Not anchored at the end: aapt2 appends attributes to this line for some
# permissions (READ_EXTERNAL_STORAGE already carries maxSdkVersion), and a
# trailing $ would turn a future attribute into a bogus "permission missing".
if ! grep -q "^uses-permission: name='android.permission.REQUEST_INSTALL_PACKAGES'" "$TMP/perms.txt"; then
  echo "" >&2
  echo "FORBIDDEN: REQUEST_INSTALL_PACKAGES is missing from $ART." >&2
  echo "The in-app updater would download the next release and fail to install it." >&2
  echo "A stale android/ survives prebuild — rebuild with 'expo prebuild --clean'." >&2
  exit 1
fi
# Child monitoring needs this permission as much as it needs the native module
# checked below: modules/usage-stats contributes it, and a play prebuild's
# tools:node="remove" markers can survive into a later github build (the same
# stale-entry mechanism app.config.ts documents for USE_FULL_SCREEN_INTENT).
# Without it UsageStatsManager is permission-denied and the child screens report
# nothing while looking enabled.
if ! grep -q "^uses-permission: name='android.permission.PACKAGE_USAGE_STATS'" "$TMP/perms.txt"; then
  echo "" >&2
  echo "FORBIDDEN: PACKAGE_USAGE_STATS is missing from $ART." >&2
  echo "Child monitoring would look enabled and report nothing." >&2
  echo "A stale android/ survives prebuild — rebuild with 'expo prebuild --clean'." >&2
  exit 1
fi

# One xmltree dump serves the two checks below: the stalkerware-policy metadata
# (not in `dump permissions`, not in `dump badging`) and versionName.
# To a file, not a variable piped into grep: the tree runs to tens of KB, and
# `grep -q` on a pipe exits at the first match, which SIGPIPEs the writer and
# makes `set -o pipefail` report 141 for a good artifact.
"$AAPT2" dump xmltree --file AndroidManifest.xml "$ART" > "$TMP/xmltree.txt" 2>&1
if ! grep -q "E: manifest" "$TMP/xmltree.txt"; then
  cat "$TMP/xmltree.txt" >&2
  echo "aapt2 could not dump the manifest tree of $ART — refusing to ship unverified" >&2
  exit 1
fi
# modules/usage-stats/android/src/main/AndroidManifest.xml declares the two
# together and says why: PACKAGE_USAGE_STATS without this flag is the exact
# signature Play's stalkerware review looks for, and Play Protect scans
# sideloaded APKs on device too. They must never drift apart.
if ! grep -q '"isMonitoringTool"' "$TMP/xmltree.txt"; then
  echo "" >&2
  echo "FORBIDDEN: $ART declares PACKAGE_USAGE_STATS without the isMonitoringTool flag." >&2
  echo "That pair is the stalkerware signature; modules/usage-stats ships them together." >&2
  echo "A stale android/ survives prebuild — rebuild with 'expo prebuild --clean'." >&2
  exit 1
fi

# The config flag says the capability is ON; this says the native module that
# implements it actually shipped. They can disagree: a prebuild run with
# APP_DISTRIBUTION=play writes `expoAutolinking.exclude = ["expo-usage-stats"]`
# into settings.gradle, and that survives a later github-channel gradle build
# which regenerates assets/app.config. The result passes every check above with
# the child screens silently reporting no usage data, because
# modules/usage-stats swallows a missing native module. assert-play-artifact.sh
# asserts the exact inverse on the same bytecode.
# Extracted to a file rather than piped into grep: `grep -q` exits on the first
# match, unzip takes SIGPIPE, and `set -o pipefail` then reports 141 for a
# perfectly good artifact. Same shape as assert-play-artifact.sh.
if ! unzip -p "$ART" '*.dex' > "$TMP/dex.bin" 2>/dev/null || [ ! -s "$TMP/dex.bin" ]; then
  echo "Could not inspect bytecode in $ART — refusing to ship unverified" >&2
  exit 1
fi
if ! grep -a -q -E 'expo/modules/usagestats|UsageStatsModule' "$TMP/dex.bin"; then
  echo "" >&2
  echo "FORBIDDEN: the native usage-stats module is not in $ART." >&2
  echo "Child monitoring would look enabled and report nothing." >&2
  echo "settings.gradle is excluding it — rebuild with 'expo prebuild --clean'." >&2
  exit 1
fi

# Last, so that running this against an unnamed build (android/app/build/…/
# app-release.apk) still reports everything above before complaining about the
# name. The filename is what latest.json advertises and what the download URL is
# built from; versionName is what the installed app reports back through
# Application.nativeApplicationVersion (hooks/use-updates.ts). If they disagree,
# the updater sees a pending update forever: every check offers the "new"
# version, every user downloads 160MB, installs it, and is still behind.
BASE=$(basename "$ART")
case "$BASE" in
  rabbaanie-v*.apk) FILE_VERSION=${BASE#rabbaanie-v}; FILE_VERSION=${FILE_VERSION%.apk} ;;
  *)
    echo "" >&2
    echo "FORBIDDEN: $BASE does not follow the publish convention." >&2
    echo "Rename it to rabbaanie-v<version>.apk — latest.json and the download URL are built from that name." >&2
    exit 1
    ;;
esac
MANIFEST_VERSION=$(sed -n 's/.*:versionName([^)]*)="\([^"]*\)".*/\1/p' "$TMP/xmltree.txt")
if [ "$MANIFEST_VERSION" != "$FILE_VERSION" ]; then
  echo "" >&2
  echo "FORBIDDEN: $BASE reports versionName '${MANIFEST_VERSION:-none}', not '$FILE_VERSION'." >&2
  echo "Publishing this would leave every user in a permanent update loop." >&2
  echo "Rebuild with APP_VERSION=$FILE_VERSION, or publish it under its real name." >&2
  exit 1
fi

echo "OK: $ART is signed by the sideload key and nothing else, and is a github-channel build with a working updater."
