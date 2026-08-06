# Subscription Management & Time-Remaining Display — Design

Date: 2026-08-06
Status: Approved, not yet implemented
Repos touched: **both** — `rabbanieserver/repo` (Expo client, this repo) and `~/Development/rabbaanie-api` (production backend, separate git history, deployed to api.rabbaanie.com)

## Problem

Three related gaps in the subscription system:

1. **No end-user visibility**: a subscriber has no way to see how much time is left on their subscription anywhere in the app — only a binary "subscribed / not subscribed" state.
2. **Admin can't change an existing subscription's plan.** The backend (`grantOrExtendSubscription`, `server/db.ts`, rabbaanie-api) has always allowed granting a subscription on top of an existing one — it's an upsert with EXTEND semantics, no blocking logic anywhere. The actual restriction is entirely client-side: `app/admin/subscriptions.tsx`'s primary "info" tab hides all grant/upgrade buttons once a user has any active subscription, showing only a cancel button. A separate "subs" tab has an ungated manual grant form that technically already works around this, but it isn't discoverable from the per-user card, which is why this reads as broken. Separately, EXTEND-only semantics can push a subscription further out (fine for "upgrade to lifetime") but can never pull it back in (no way to "downgrade" a lifetime grant to a 1-year one — extending only ever adds time).
3. **Admin can't see time-remaining for other users either.** The "info" tab shows a subscribed/not-subscribed badge per user but no expiry date or countdown anywhere in that view (a raw date exists only in the separate "subs" tab's flat list, disconnected from the per-user card).

Cancellation itself is not broken: `revokeSubscription` already operates uniformly on any row regardless of plan or how far out `expiresAt` is, so cancelling a lifetime grant already works today — it was just easy to miss given the same UI gating.

## Goals

- A subscriber can see their own time-remaining (or "Lifetime") somewhere in the app.
- An admin can see any user's time-remaining from the primary admin view, not a separate tab.
- An admin can move any user's subscription to an exact target plan (1 year or lifetime) at any time, in either direction, from that same primary view.
- An admin can still extend an existing subscription by a year on top, when that (not a full replace) is what's actually wanted.
- Cancellation stays available for every subscribed user, unchanged.

## Non-goals

- No change to the existing extend-only `grantSubscription`/`grantOrExtendSubscription` used by Stripe renewal and coupon redemption — those must keep extending, not resetting, and are out of scope here.
- No restructuring of the "subs" (raw audit list) or "coupons" tabs — not broken, not touched.
- No new subscription plan types beyond the existing 1-year / lifetime (36500-day convention) — same two options used everywhere else in this screen today.

## Design

### 1. Server — new `setSubscription` procedure (rabbaanie-api)

A new `ownerAdminProcedure` mutation, `setSubscription({ userId, days, note? })`, that moves a user to an exact target plan regardless of current state:

```ts
export async function setSubscription(opts: {
  userId: number; days: number; grantedBy: number; note?: string;
}): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const existing = await getActiveSubscription(opts.userId);
  if (existing) await revokeSubscription(existing.id);
  return grantOrExtendSubscription({
    userId: opts.userId, days: opts.days, source: "granted",
    grantedBy: opts.grantedBy, note: opts.note,
  });
}
```

No new database semantics — this sequences the two existing, already-tested primitives (`revokeSubscription`, `grantOrExtendSubscription`). Once `existing` is revoked (status becomes `"canceled"`), `getActiveSubscription` inside the subsequent `grantOrExtendSubscription` call finds nothing, so it inserts a fresh row starting from now — correctly landing on exactly `days` from today regardless of what was there before. For a user with no existing subscription, this is behaviorally identical to the existing `grantSubscription`.

### 2. Server — admin overview query gains `expiresAt`

`listSubscribersOverview` (backing the `subscribersOverview` query the info tab reads) needs to carry `expiresAt` (and effectively `plan`, derivable from how far out `expiresAt` is) per subscribed user, alongside the `special`/`subscriptionId` fields it already returns. Exact current shape to be confirmed during planning — if the join already fetches the subscription row and just doesn't surface this field, it's a one-line addition; if not, it needs a join added.

### 3. Client — shared time-remaining formatter

One small helper, used by every surface below, mirroring the perpetual-detection logic that already exists in `app/admin/subscriptions.tsx`'s `fmt()`:

```ts
const PERPETUAL_DAYS = 36500;
const PERPETUAL_LABEL_CUTOFF_MS = (PERPETUAL_DAYS / 2) * 86400000;

function formatSubscriptionRemaining(expiresAt: string | Date, tx: (nl: string, en: string, ar: string) => string): string {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms > PERPETUAL_LABEL_CUTOFF_MS) return tx("Levenslang", "Lifetime", "مدى الحياة");
  const days = Math.max(0, Math.ceil(ms / 86400000));
  return tx(`${days} dagen resterend`, `${days} days left`, `${days} يومًا متبقيًا`);
}
```

Exact placement (a shared `lib/` file vs. colocated per-screen) decided during planning — used by both `app/subscribe.tsx` and `app/(tabs)/settings.tsx` on the client, and adapted for `app/admin/subscriptions.tsx`'s Arabic-only admin UI (that screen doesn't use the 3-language `tx()` pattern the rest of the app does — it's Arabic-only throughout, so the admin-side usage returns just the Arabic string directly, not through `tx()`).

### 4. Client — end-user display

- `hooks/use-subscription.ts`: `useSubscription()`'s return gains `expiresAt` (currently fetched in the underlying response but discarded at the point the hook reads only `d.subscribed`). Additive — existing callers destructuring only `{ subscribed }` are unaffected.
- `app/subscribe.tsx`: the existing "Valid until {date}" banner (already computed from `status.expiresAt`, fetched directly rather than through the hook) gains the formatter's output alongside it.
- `app/(tabs)/settings.tsx`: the "My subscription" card, today a bare "Subscribed ✓ — view details" with no date, gains the same line, sourced from the now-extended `useSubscription()` hook.

### 5. Client — admin display and actions (`app/admin/subscriptions.tsx`, info tab only)

- Every subscribed user's card gains the time-remaining line via the shared formatter, using the `expiresAt` now included in `subscribersOverview`'s response.
- Button set changes from "hide everything except cancel once subscribed" to always offering the full action set, adjusted by current state:
  - **No active subscription**: Grant 1 year / Grant Lifetime (unchanged from today).
  - **Has an active subscription, not yet past the perpetual threshold**: Set to 1 year / Set to Lifetime (new, calls `setSubscription` — replaces, handles both upgrade and downgrade) / Extend +1 year (existing `grantSubscription` behavior, kept — adds a year on top for the case where that, not a full reset, is what's wanted) / Cancel.
  - **Has an active subscription, already past the perpetual threshold (i.e. already "Lifetime")**: Set to 1 year (the only meaningful downgrade target) / Cancel. Both "Set to Lifetime" and "Extend +1 year" are omitted here — pushing an already-~100-year date out further is a no-op-looking action with no observable effect on the displayed "Lifetime" status, so offering it would just be confusing.

## Error handling

`setSubscription` surfaces through the same tRPC error path `grantSubscription` already does — the client's existing `onError` handler (`Alert.alert` on failure) covers it with no new pattern needed.

## Testing

- Server: unit tests for `setSubscription` covering all three transitions — no existing subscription (same result as `grantSubscription`), existing 1-year → set to lifetime (lands ~100 years out), existing lifetime → set to 1-year (actually shortens it, the case `grantOrExtendSubscription` alone cannot handle).
- Client: no screen-component test harness exists in this codebase (same as the 2FA sub-project) — verified manually.
