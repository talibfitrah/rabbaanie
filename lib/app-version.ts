import { useSyncExternalStore } from "react";

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

// Our own website (www.rabbaanie.com / rabbaanie.com / api.rabbaanie.com)
// never sends X-App-Version — only the native app does — so without this
// exemption, turning the gate on would block every browser visitor,
// including the dashboard's own logged-in session checks. Browsers set
// Origin/Referer themselves and page JS cannot forge them, so trusting a
// matching one is safe; the failure direction is deliberately asymmetric
// too — a false positive here just lets an old app slip through
// (annoying), while a false negative breaks the live site for every
// visitor (harmful). Host is parsed via the URL constructor and matched
// exactly against the known set, never by substring, so
// "www.rabbaanie.com.attacker.net" is still refused.
const TRUSTED_WEB_HOSTS = new Set(["www.rabbaanie.com", "rabbaanie.com", "api.rabbaanie.com"]);

/** True when an Origin or Referer header value names one of our own website hosts. */
export function isTrustedWebOrigin(originOrReferer: string | undefined | null): boolean {
  if (!originOrReferer) return false;
  try {
    return TRUSTED_WEB_HOSTS.has(new URL(originOrReferer).hostname);
  } catch {
    return false;
  }
}

/**
 * The server's minimum-client-version gate, mirrored here so the decision is
 * unit-tested before being hand-ported to the deployed server (a separate
 * codebase — see server/_core/index.ts on the VM, not this repo's unused
 * server/). minVersion "" (unset) means enforcement is off: nothing is ever
 * refused. Once a minimum is set, a missing or unparseable reported version
 * is treated the same as "too old" — that is exactly what a pre-rollout
 * build (one that never sends the header at all) looks like — UNLESS the
 * request's Origin/Referer names our own website (see isTrustedWebOrigin).
 */
export function isVersionRefused(
  reportedVersion: string | undefined | null,
  minVersion: string,
  originOrReferer?: string | undefined | null
): boolean {
  if (!minVersion) return false;
  if (isTrustedWebOrigin(originOrReferer)) return false;
  if (!reportedVersion || parseTag(`v${reportedVersion}`) === null) return true;
  return isNewerVersion(minVersion, reportedVersion);
}

// --- Server-refusal detection ---
//
// The deployed server marks a build it refuses with HTTP 426 (see
// server/_core/index.ts on the VM). Checked once here, after every transport
// call, rather than at each of the ~30 call sites across authedFetch,
// publicFetch, apiCall and the tRPC client — a missed call site would leave a
// blocked build limping along on whichever routes forgot the check instead of
// showing the one block screen. Status code only: it never reads the response
// body, so callers still get to parse it exactly once.
const TOO_OLD_STATUS = 426;
let versionBlocked = false;
const versionBlockListeners = new Set<() => void>();

export function markIfVersionBlocked(status: number): void {
  if (status !== TOO_OLD_STATUS || versionBlocked) return;
  versionBlocked = true;
  for (const listener of versionBlockListeners) listener();
}

function subscribeVersionBlocked(listener: () => void): () => void {
  versionBlockListeners.add(listener);
  return () => versionBlockListeners.delete(listener);
}

const getVersionBlocked = () => versionBlocked;

/** True once the server has refused this build for being too old. */
export function useVersionBlocked(): boolean {
  return useSyncExternalStore(subscribeVersionBlocked, getVersionBlocked, getVersionBlocked);
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
