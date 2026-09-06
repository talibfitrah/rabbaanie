import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { authedFetch } from "@/lib/authed-fetch";
import type { Language } from "@/lib/i18n";

/**
 * Every /api/subscription/* route is session-authenticated — without the bearer
 * token the server answers 401 {"error":"authentication_required"}, which the
 * callers silently read as "not subscribed" / "could not save". Attaching it in
 * one place is what keeps a new call site from reintroducing that bug.
 */
export async function subscriptionFetch(path: string, init?: RequestInit) {
  return authedFetch(`/api/subscription/${path}`, init);
}

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
let _subCache: {
  uid: number;
  subscribed: boolean;
  expiresAt: string | null;
  // Free-trial fields (msg free-trial-reminders): `trial` mirrors the server's
  // own flag rather than being derived from expiresAt, since a paid annual
  // subscriber also carries a future expiresAt and must NOT read as trial.
  trial: boolean;
  daysLeft: number | null;
} | null = null;

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
  const [expiresAt, setExpiresAt] = useState<string | null>(cacheHit?.expiresAt ?? null);
  const [trial, setTrial] = useState<boolean>(cacheHit?.trial ?? false);
  const [daysLeft, setDaysLeft] = useState<number | null>(cacheHit?.daysLeft ?? null);
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
      setExpiresAt(null);
      setTrial(false);
      setDaysLeft(null);
      if (!authLoading) setLoading(false);
      return;
    }
    // uid changed (account switch without this component unmounting): the
    // useState initializers only ran on mount, so reset to this user's cached
    // value — or to loading if we have nothing for them — before refetching.
    // Otherwise the previous account's subscribed flag lingers until the fetch.
    const hit = _subCache && _subCache.uid === uid ? _subCache : null;
    setSubscribed(hit?.subscribed ?? false);
    setExpiresAt(hit?.expiresAt ?? null);
    setTrial(hit?.trial ?? false);
    setDaysLeft(hit?.daysLeft ?? null);
    setLoading(hit === null);
    let alive = true;
    subscriptionFetch(`status?userId=${uid}`)
      .then((r) => r.json())
      .then((d) => {
        const sub = !!(d && d.subscribed);
        const exp = (d && d.expiresAt) || null;
        const isTrial = !!(d && d.trial);
        const days = isTrial && typeof d.daysLeft === "number" ? d.daysLeft : null;
        _subCache = { uid, subscribed: sub, expiresAt: exp, trial: isTrial, daysLeft: days };
        if (alive) { setSubscribed(sub); setExpiresAt(exp); setTrial(isTrial); setDaysLeft(days); setLoading(false); }
      })
      .catch(() => {
        // Network failure must NOT downgrade a paying subscriber to the paywall.
        // Keep the last known-good value for this user if we have one; only fall
        // through to not-subscribed when we've never had a successful check.
        if (!alive) return;
        if (_subCache && _subCache.uid === uid) {
          setSubscribed(_subCache.subscribed);
          setExpiresAt(_subCache.expiresAt);
          setTrial(_subCache.trial);
          setDaysLeft(_subCache.daysLeft);
        }
        setLoading(false);
      });
    return () => { alive = false; };
  }, [uid, authLoading]);

  return { subscribed, expiresAt, trial, daysLeft, loading };
}

// A perpetual grant is stored as a date ~100 years out so every server-side
// entitlement check (`status = active AND expiresAt >= now`) keeps working
// with no nullable column. Anything past half that length was a perpetual
// grant, not a subscriber who happens to be far from expiry.
export const PERPETUAL_DAYS = 36500;
export const PERPETUAL_LABEL_CUTOFF_MS = (PERPETUAL_DAYS / 2) * 86400000;

/** True when an expiry date is far enough out to be a perpetual/"Lifetime" grant. */
export function isPerpetualExpiry(expiresAt: string | Date): boolean {
  return new Date(expiresAt).getTime() - Date.now() > PERPETUAL_LABEL_CUTOFF_MS;
}

/** Arabic numeral-noun agreement: 1/2 have dedicated forms, 3-10 take the
 *  plural noun, 11+ takes the singular accusative (tamyiz) form. */
function arabicDayCount(days: number): string {
  if (days === 0) return "0 أيام";
  if (days === 1) return "يوم واحد";
  if (days === 2) return "يومان";
  if (days >= 3 && days <= 10) return `${days} أيام`;
  return `${days} يومًا`;
}

/** "N days left" / "Lifetime" in the app's three languages, from an expiry date. */
export function formatSubscriptionRemaining(expiresAt: string | Date, language: Language): string {
  if (isPerpetualExpiry(expiresAt)) {
    return language === "ar" ? "مدى الحياة" : language === "en" ? "Lifetime" : "Levenslang toegang";
  }
  const ms = new Date(expiresAt).getTime() - Date.now();
  const days = Math.max(0, Math.ceil(ms / 86400000));
  return language === "ar" ? `${arabicDayCount(days)} متبقيًا` : language === "en" ? `${days} day${days === 1 ? "" : "s"} left` : `${days} dag${days === 1 ? "" : "en"} resterend`;
}
