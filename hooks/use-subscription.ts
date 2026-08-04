import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { getApiBaseUrl } from "@/constants/oauth";

/**
 * Subscription gate (msg 706/707): the whole app is visible, but non-subscribers
 * may only USE the general/public services (adhkaar, prayer, fitrah, emotion-path,
 * sunnah companion, library). Premium screens show their content but block the
 * interactive actions behind a subscribe prompt. Module-cached so it's fetched once.
 */
// Keyed by user id so a hit for a different account is ignored. The cache
// outlives React state and is not tied to any logout path, so without the uid
// guard the next account to sign in on this device would inherit the previous
// user's subscribed flag until its own status fetch resolves (a premium leak
// across accounts). Storing the uid makes that leak structurally impossible,
// regardless of how many sign-out entry points exist now or later.
let _subCache: { uid: number; subscribed: boolean } | null = null;

/**
 * Drop the cached status so the next useSubscription() refetches. Call after an
 * action that changes entitlement (coupon redeemed, Stripe checkout returned) —
 * otherwise the premium screens keep showing the paywall until a cold restart,
 * even though the user just paid.
 */
export function invalidateSubscriptionCache() {
  _subCache = null;
}

export function useSubscription() {
  const { user } = useAuth();
  const uid = (user as any)?.id as number | undefined;
  // Only trust the cache when it belongs to the current user.
  const cacheHit = _subCache && _subCache.uid === uid ? _subCache : null;
  const [subscribed, setSubscribed] = useState<boolean>(cacheHit?.subscribed ?? false);
  const [loading, setLoading] = useState<boolean>(cacheHit === null);

  useEffect(() => {
    if (!uid) { setLoading(false); return; }
    let alive = true;
    fetch(`${getApiBaseUrl()}/api/subscription/status?userId=${uid}`)
      .then((r) => r.json())
      .then((d) => {
        const sub = !!(d && d.subscribed);
        _subCache = { uid, subscribed: sub };
        if (alive) { setSubscribed(sub); setLoading(false); }
      })
      .catch(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [uid]);

  return { subscribed, loading };
}
