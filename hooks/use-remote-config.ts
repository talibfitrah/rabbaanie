import { useEffect, useState } from "react";
import { getApiBaseUrl } from "@/constants/oauth";

/**
 * Runtime app config fetched from the server (msg 588) so the donation link and
 * team WhatsApp number can be set/changed server-side (assets/data/app-config.json)
 * without rebuilding the app. Cached module-wide; falls back to empty strings.
 */
export type RemoteConfig = { donateUrl: string; supportWhatsapp: string };
let _cache: RemoteConfig | null = null;

export function useRemoteConfig(): RemoteConfig {
  const [cfg, setCfg] = useState<RemoteConfig>(_cache || { donateUrl: "", supportWhatsapp: "" });
  useEffect(() => {
    if (_cache) { setCfg(_cache); return; }
    let alive = true;
    fetch(`${getApiBaseUrl()}/api/public/config`)
      .then((r) => r.json())
      .then((c) => { _cache = { donateUrl: String(c?.donateUrl || ""), supportWhatsapp: String(c?.supportWhatsapp || "") }; if (alive) setCfg(_cache); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);
  return cfg;
}
