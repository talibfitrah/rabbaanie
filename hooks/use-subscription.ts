import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { getApiBaseUrl } from "@/constants/oauth";

/**
 * Subscription gate (msg 706/707): the whole app is visible, but non-subscribers
 * may only USE the general/public services (adhkaar, prayer, fitrah, emotion-path,
 * sunnah companion, library). Premium screens show their content but block the
 * interactive actions behind a subscribe prompt. Module-cached so it's fetched once.
 */
let _subCache: boolean | null = null;

/**
 * Clear the module-level subscription cache. MUST be called on logout — the
 * cache outlives React state, so without this the next account to sign in on
 * the same device inherits the previous user's subscribed flag until its own
 * status fetch resolves (a premium-UI leak across accounts).
 */
export function clearSubscriptionCache() {
  _subCache = null;
}

export function useSubscription() {
  const { user } = useAuth();
  const uid = (user as any)?.id as number | undefined;
  const [subscribed, setSubscribed] = useState<boolean>(_subCache ?? false);
  const [loading, setLoading] = useState<boolean>(_subCache === null);

  useEffect(() => {
    if (!uid) { setLoading(false); return; }
    let alive = true;
    fetch(`${getApiBaseUrl()}/api/subscription/status?userId=${uid}`)
      .then((r) => r.json())
      .then((d) => { _subCache = !!(d && d.subscribed); if (alive) { setSubscribed(_subCache); setLoading(false); } })
      .catch(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [uid]);

  return { subscribed, loading };
}
