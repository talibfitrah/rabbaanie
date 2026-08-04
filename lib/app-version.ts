const TAG_RE = /^v(\d+)\.(\d+)\.(\d+)$/;

/** "v1.2.0" -> "1.2.0"; null for anything that is not exactly vMAJOR.MINOR.PATCH. */
export function parseTag(tag: string): string | null {
  const m = TAG_RE.exec(tag);
  return m ? `${m[1]}.${m[2]}.${m[3]}` : null;
}

function toParts(version: string): number[] | null {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** Numeric semver comparison; false when either side is malformed. */
export function isNewerVersion(latest: string, current: string): boolean {
  const a = toParts(latest);
  const b = toParts(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] > b[i];
  }
  return false;
}

export type PendingUpdate = { version: string; apkUrl: string };

// The updater downloads this URL and hands the resulting APK to Android's
// package installer, so the manifest's apkUrl must be tightly constrained —
// never trusted as "whatever the JSON said". Require our own HTTPS host and the
// exact versioned artifact filename, so a tampered or cache-poisoned manifest
// can't aim the installer at an arbitrary host or file. Matched with a regex
// (React Native's URL parser is incomplete); the host must be followed
// immediately by "/", which rejects look-alikes like "api.rabbaanie.com.evil"
// and userinfo tricks like "api.rabbaanie.com@evil". The filename's version
// must equal the manifest version, so a mismatched artifact name is rejected.
const TRUSTED_APK_URL_RE =
  /^https:\/\/api\.rabbaanie\.com\/[A-Za-z0-9._~\-/]*rabbaanie-v(\d+\.\d+\.\d+)\.apk$/;

export function isTrustedApkUrl(apkUrl: string, version: string): boolean {
  const m = TRUSTED_APK_URL_RE.exec(apkUrl);
  return m !== null && m[1] === version;
}

/**
 * Evaluate the update manifest served from our own server
 * (api.rabbaanie.com/downloads/latest.json): { version, apkUrl }. Returns what
 * to download when the manifest names a newer version with a trusted download
 * URL; null otherwise (including when apkUrl fails the trust check).
 */
export function evaluateLatest(
  latest: { version?: string; apkUrl?: string } | null | undefined,
  currentVersion: string
): PendingUpdate | null {
  const version = latest?.version;
  const apkUrl = latest?.apkUrl;
  if (
    !version ||
    !apkUrl ||
    parseTag(`v${version}`) === null ||
    !isTrustedApkUrl(apkUrl, version)
  ) {
    return null;
  }
  return isNewerVersion(version, currentVersion) ? { version, apkUrl } : null;
}
