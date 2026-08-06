import { useEffect, useState } from "react";
import { getApiBaseUrl } from "@/constants/oauth";

/**
 * Runtime app config fetched from the server (msg 588) so the donation link and
 * team WhatsApp number can be set/changed server-side (assets/data/app-config.json)
 * without rebuilding the app. Cached module-wide; falls back to empty strings.
 */
export type RemoteConfig = { donateUrl: string; supportWhatsapp: string };
let _cache: RemoteConfig | null = null;

/**
 * Both values below reach `Linking.openURL` (home tab and Settings), and both
 * arrive over the network, so this is the trust boundary and the only place
 * either is checked. On Android `Linking.openURL` honours `intent://`, which
 * can launch an arbitrary component of another installed app, and `file://`,
 * `content://` and `javascript:` are each their own problem — so an https: URL
 * is required rather than a blocklist of the schemes we happen to have thought
 * of. Anything else becomes "", which both call sites already treat as
 * "no link configured" and render inert.
 */
export function safeHttpsUrl(value: unknown): string {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    // Parsed, not prefix-matched: a startsWith("https://") test passes
    // "https:/\/evil.example", which is not the URL it looks like.
    const url = new URL(raw);
    if (url.protocol !== "https:") return "";
    // Return the PARSED form, never the raw input. "https:/\/evil.example"
    // parses to https://evil.example/ — handing the raw string on would mean
    // validating one URL and opening a different one.
    return url.toString();
  } catch {
    return "";
  }
}

/** Digits only — this is interpolated into a wa.me/<number> path. */
export function safePhone(value: unknown): string {
  return String(value || "").replace(/\D/g, "");
}

export function useRemoteConfig(): RemoteConfig {
  const [cfg, setCfg] = useState<RemoteConfig>(_cache || { donateUrl: "", supportWhatsapp: "" });
  useEffect(() => {
    if (_cache) { setCfg(_cache); return; }
    let alive = true;
    fetch(`${getApiBaseUrl()}/api/public/config`)
      .then((r) => r.json())
      .then((c) => { _cache = { donateUrl: safeHttpsUrl(c?.donateUrl), supportWhatsapp: safePhone(c?.supportWhatsapp) }; if (alive) setCfg(_cache); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);
  return cfg;
}
