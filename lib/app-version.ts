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

/**
 * Evaluate the update manifest served from our own server
 * (api.rabbaanie.com/downloads/latest.json): { version, apkUrl }. Returns what
 * to download when the manifest names a newer version with a download URL.
 */
export function evaluateLatest(
  latest: { version?: string; apkUrl?: string } | null | undefined,
  currentVersion: string
): PendingUpdate | null {
  const version = latest?.version;
  const apkUrl = latest?.apkUrl;
  if (!version || !apkUrl || parseTag(`v${version}`) === null) return null;
  return isNewerVersion(version, currentVersion) ? { version, apkUrl } : null;
}
