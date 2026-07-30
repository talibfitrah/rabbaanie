export type ReleaseAsset = { name: string; browser_download_url: string };

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

/**
 * Download URL of the exact release APK our workflow publishes
 * (`rabbaanie-v<version>.apk`), or null. Requiring the exact name means a
 * lookalike or stray APK in the release is never installed.
 */
export function pickApkAsset(assets: ReleaseAsset[], version: string): string | null {
  const exact = assets.find((a) => a.name === `rabbaanie-v${version}.apk`);
  return exact ? exact.browser_download_url : null;
}

export type PendingUpdate = { version: string; apkUrl: string };

/**
 * The full update decision: given the GitHub "latest release" payload and the
 * installed version, return what to download — or null when there is nothing
 * newer, the tag is malformed, or the release carries no APK.
 */
export function evaluateRelease(
  release: { tag_name: string; assets?: ReleaseAsset[] },
  currentVersion: string
): PendingUpdate | null {
  const version = parseTag(release.tag_name);
  if (version === null) return null;
  const apkUrl = pickApkAsset(release.assets ?? [], version);
  if (apkUrl === null) return null;
  return isNewerVersion(version, currentVersion) ? { version, apkUrl } : null;
}
