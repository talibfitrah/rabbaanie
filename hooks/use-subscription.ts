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
  const { user, loading: authLoading } = useAuth();
  const uid = (user as any)?.id as number | undefined;
  // Only trust the cache when it belongs to the current user.
  const cacheHit = _subCache && _subCache.uid === uid ? _subCache : null;
  const [subscribed, setSubscribed] = useState<boolean>(cacheHit?.subscribed ?? false);
  const [loading, setLoading] = useState<boolean>(cacheHit === null);

  useEffect(() => {
    // Distinguish "auth still hydrating" from "definitely logged out". While
    // auth is loading, uid is briefly undefined — stay in the loading state so
    // consumers don't wrongly paywall a real subscriber. Only once auth has
    // resolved with no user do we settle on not-subscribed (avoids a permanent
    // spinner for a genuinely logged-out user).
    if (!uid) {
      // No user (logged out / hydrating): never report a stale subscribed=true.
      setSubscribed(false);
      if (!authLoading) setLoading(false);
      return;
    }
    // uid changed (account switch without this component unmounting): the
    // useState initializers only ran on mount, so reset to this user's cached
    // value — or to loading if we have nothing for them — before refetching.
    // Otherwise the previous account's subscribed flag lingers until the fetch.
    const hit = _subCache && _subCache.uid === uid ? _subCache : null;
    setSubscribed(hit?.subscribed ?? false);
    setLoading(hit === null);
    let alive = true;
    fetch(`${getApiBaseUrl()}/api/subscription/status?userId=${uid}`)
      .then((r) => r.json())
      .then((d) => {
        const sub = !!(d && d.subscribed);
        _subCache = { uid, subscribed: sub };
        if (alive) { setSubscribed(sub); setLoading(false); }
      })
      .catch(() => {
        // Network failure must NOT downgrade a paying subscriber to the paywall.
        // Keep the last known-good value for this user if we have one; only fall
        // through to not-subscribed when we've never had a successful check.
        if (!alive) return;
        if (_subCache && _subCache.uid === uid) setSubscribed(_subCache.subscribed);
        setLoading(false);
      });
    return () => { alive = false; };
  }, [uid, authLoading]);

  return { subscribed, loading };
}
