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
# Both shipped together as v1.4.83 on 2026-08-09, from a hand-signed build that
# used release.p12 (the Play upload key) instead. Nothing caught it: the APK
# builds, installs on a clean device, and launches — it only fails for people
# who already have the app, which is everyone.
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

# ANDROID_SDK_ROOT as well as ANDROID_HOME: on the box this script exists for,
# only ANDROID_SDK_ROOT is set and apksigner is not on PATH, so looking at
# ANDROID_HOME alone made the gate exit 1 every time. Failing closed is right,
# but an unrunnable gate gets skipped — and a skipped signer check is exactly
# how 1.4.81, 1.4.82 and 1.4.83 shipped with the wrong key.
SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
APKSIGNER=""
if [ -n "$SDK" ] && [ -d "$SDK/build-tools" ]; then
  # Stable versions only. A plain `sort -V | tail -n1` picks 36.1.0-rc1 over
  # 36.0.0 on this machine, which makes the release gate depend on whichever
  # release candidate happens to be installed.
  BT=$(ls "$SDK/build-tools" | grep -E '^[0-9]+(\.[0-9]+)*$' | sort -V | tail -n1)
  [ -n "$BT" ] && APKSIGNER="$SDK/build-tools/$BT/apksigner"
fi
if [ ! -x "$APKSIGNER" ]; then
  APKSIGNER=$(command -v apksigner || true)
fi
if [ -z "$APKSIGNER" ] || [ ! -x "$APKSIGNER" ]; then
  echo "apksigner not found (set ANDROID_HOME/ANDROID_SDK_ROOT or put it on PATH) — refusing to ship unverified" >&2
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

# --- The artifact must also BE a sideload build -----------------------------
# The signing key is necessary but not sufficient. app.config.ts defaults
# APP_DISTRIBUTION to "play", so a hand build that forgets to export
# APP_DISTRIBUTION=github is still Gradle-signed with the debug key and sails
# through every check above. That APK carries "distribution":"play", which
# leaves UPDATER_ENABLED false (hooks/use-updates.ts) and REQUEST_INSTALL_PACKAGES
# absent — so anyone who installs it loses the in-app updater, the ONLY delivery
# mechanism on this channel. It cannot be walked back by publishing a fixed
# build, because the broken install can no longer fetch one. Uninstall and
# reinstall by hand is the only recovery, which is the same unrecoverable class
# of failure the signing pin exists to prevent.
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

if ! unzip -p "$ART" assets/app.config > "$TMP/app.config" 2>/dev/null || [ ! -s "$TMP/app.config" ]; then
  echo "Could not read the embedded Expo config from $ART — refusing to ship unverified" >&2
  exit 1
fi
if ! grep -q '"distribution":"github"' "$TMP/app.config"; then
  echo "" >&2
  echo "FORBIDDEN: $ART is not a sideload-channel build: $(grep -o '"distribution":"[a-z]*"' "$TMP/app.config" || echo 'field absent')" >&2
  echo "Installing it would permanently disable the in-app updater for that user." >&2
  exit 1
fi

# The permission the updater needs. Read from the shipped manifest rather than
# inferred from the channel, because blockedPermissions in app.config.ts emits
# tools:node="remove" and a stale prebuild can strip it even from a correctly
# flagged github build. Binary XML has a UTF-16LE string pool, so a plain grep
# finds nothing and would pass vacuously; extract both encodings and check that
# the extraction itself worked before trusting a negative.
MANTXT="$TMP/manifest.txt"
unzip -p "$ART" AndroidManifest.xml > "$TMP/manifest.bin" 2>/dev/null || true
{ strings -a "$TMP/manifest.bin"; strings -a -e l "$TMP/manifest.bin"; } > "$MANTXT" 2>/dev/null || true
if ! grep -q 'com.rabbaanie.app' "$MANTXT"; then
  echo "Manifest text extraction failed (package name not found) — refusing to ship unverified" >&2
  exit 1
fi
if ! grep -q 'REQUEST_INSTALL_PACKAGES' "$MANTXT"; then
  echo "" >&2
  echo "FORBIDDEN: REQUEST_INSTALL_PACKAGES is missing — the in-app updater cannot install anything." >&2
  exit 1
fi

# The monitoring capability must be PRESENT here, the mirror of the Play gate
# asserting com.android.vending.BILLING is present. Both channels lose a feature
# silently when a check only looks for what must be absent.
#
# This is not hypothetical. app.config.ts writes
# `expoAutolinking.exclude = ["expo-usage-stats"]` into settings.gradle for a
# Play build, `android/` is reused unless --clean is passed, and the plugin used
# to only ADD that line — never remove it. A github prebuild after a play one
# therefore produced a sideload APK with no usage-stats module at all. It built,
# installed and ran perfectly; it simply could not monitor anything.
for REQUIRED in PACKAGE_USAGE_STATS isMonitoringTool; do
  if ! grep -q "$REQUIRED" "$MANTXT"; then
    echo "" >&2
    echo "FORBIDDEN: $REQUIRED is MISSING — this sideload build cannot do app-usage monitoring." >&2
    echo "Most likely a stale Play-channel exclusion in android/settings.gradle; rebuild with --clean." >&2
    exit 1
  fi
done

# And the bytecode, because a permission without the module behind it is the
# stalkerware signature in reverse: declared, unusable.
DEX="$TMP/dex.bin"
if unzip -p "$ART" '*.dex' > "$DEX" 2>/dev/null && [ -s "$DEX" ]; then
  if ! grep -a -qE 'expo/modules/usagestats|UsageStatsModule' "$DEX"; then
    echo "" >&2
    echo "FORBIDDEN: the usage-stats native module is absent from the sideload artifact." >&2
    exit 1
  fi
fi

echo "OK: $ART is a sideload-channel build signed by the sideload key and nothing else, with a working updater."
