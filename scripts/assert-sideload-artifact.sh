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

echo "OK: $ART is signed by the sideload key and nothing else."
