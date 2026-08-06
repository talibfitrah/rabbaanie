# Subscription Management & Time-Remaining Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a subscriber see their own time-remaining, and let an admin see any user's time-remaining and move any user to an exact target plan (1 year or lifetime) at any time, in either direction, from the primary admin view.

**Architecture:** One new server-side procedure (`setSubscription`, rabbaanie-api) that sequences two already-correct primitives (revoke, then grant-or-extend) to land on an exact target date regardless of current state. One new shared client-side formatter (`formatSubscriptionRemaining`) consumed by three existing screens: the end-user subscribe screen, the end-user settings card, and the admin per-user card (whose button set also gets rebuilt to always offer the full action set for the user's current state, instead of hiding everything but cancel once subscribed).

**Tech Stack:** Expo/React Native + TypeScript (client, this repo), Node/Express/tRPC + Drizzle/Postgres (server, `~/Development/rabbaanie-api`, branch `master`), Vitest (server tests).

**Repos touched — two separate git histories:**
- Client: `/home/farouq/Development/rabbanieserver/repo` (this repo, branch `main`)
- Server: `/home/farouq/Development/rabbaanie-api` (branch `master`, remote `talibfitrah/rabbaanie-api`, deployed to api.rabbaanie.com)

This repo's own `server/` directory is dead code, never deployed — no task in this plan touches it.

## Global Constraints

- Never change `grantOrExtendSubscription`'s or the existing `grantSubscription` tRPC procedure's extend-only semantics — Stripe renewal and coupon redemption both depend on "adds days on top of existing expiry," not "replaces."
- Do not restructure the "subs" (raw audit list) or "coupons" tabs in `app/admin/subscriptions.tsx` — not broken, out of scope. Their existing `fmt()`/`PERPETUAL_LABEL_CUTOFF_MS` logic must keep working unchanged.
- No new subscription plan types beyond the existing 1-year (365 days) / lifetime (36500-day convention).
- No test harness exists for screen components in the client repo — server-side logic gets real Vitest unit tests; client-side changes get a manual verification checklist per task, matching the precedent set by the admin-2FA-verification-screen sub-project.
- The perpetual/"Lifetime" label threshold is always `PERPETUAL_DAYS / 2` days out (currently 36500 / 2 = 18250 days ≈ 50 years) — one shared constant, never a second hardcoded copy.
- **Deviation from the spec's illustrative code, discovered during planning:** the spec (`docs/superpowers/specs/2026-08-06-subscription-management-design.md`, §2) treated `listSubscribersOverview` gaining `expiresAt` as an open question ("one-line addition" vs. "needs a join added"). Direct read of `rabbaanie-api/server/db.ts:3348-3369` confirms it **already returns `expiresAt`** per user (line 3364: `expiresAt: act?.expiresAt || null`) — the client (`app/admin/subscriptions.tsx`) simply never reads that field today. No server change is needed for this piece; Task 5 below only adds client-side reads of a field that already exists on the wire.

---

### Task 1: Server — `setSubscription` procedure (rabbaanie-api)

**Files:**
- Modify: `/home/farouq/Development/rabbaanie-api/server/db.ts` (add function after `revokeSubscription`, currently ending at line 3337)
- Modify: `/home/farouq/Development/rabbaanie-api/server/routers.ts` (add procedure after `revokeSubscription`, currently lines 820-822)
- Create: `/home/farouq/Development/rabbaanie-api/tests/subscription-management.test.ts`

**Interfaces:**
- Produces: `setSubscription(opts: { userId: number; days: number; grantedBy: number; note?: string }, deps?: { getActive?, revoke?, grantOrExtend? }): Promise<number>` — exported from `server/db.ts`, consumed by Task 5's admin UI via the tRPC procedure `admin.setSubscription`.
- Consumes: existing `getActiveSubscription(userId): Promise<Subscription | undefined>`, `revokeSubscription(id: number): Promise<void>`, `grantOrExtendSubscription(opts): Promise<number>` — all three already defined in `server/db.ts`, unchanged by this task.

`setSubscription` takes an optional second `deps` parameter purely so it can be unit-tested by substituting the three primitives directly — no `vi.mock` needed. This repo has no test-database infrastructure (`getDb()` returns `null` when `DATABASE_URL` is unset, confirmed by reading `server/db.ts:64-73`, and no `.env`/`vitest.config` exists in the checkout), and the three primitives it composes live in the *same* module, so a `vi.mock("../server/db", ...)` partial mock would not intercept `setSubscription`'s internal calls to them (ESM modules call their own siblings by direct closure reference, not through the mockable exports object). Dependency injection with real defaults sidesteps both problems at zero cost to the real caller: `routers.ts` calls `db.setSubscription({ userId, days, grantedBy, note })` with no second argument, so the defaults (the real functions) are exactly what runs in production.

- [ ] **Step 1: Write the failing tests**

Create `/home/farouq/Development/rabbaanie-api/tests/subscription-management.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { setSubscription } from "../server/db";

describe("setSubscription", () => {
  it("grants fresh when no subscription exists (same result as grantSubscription)", async () => {
    const getActive = vi.fn().mockResolvedValue(null);
    const revoke = vi.fn();
    const grantOrExtend = vi.fn().mockResolvedValue(99);

    const id = await setSubscription(
      { userId: 5, days: 365, grantedBy: 1, note: "test" },
      { getActive, revoke, grantOrExtend },
    );

    expect(id).toBe(99);
    expect(revoke).not.toHaveBeenCalled();
    expect(grantOrExtend).toHaveBeenCalledWith({ userId: 5, days: 365, source: "granted", grantedBy: 1, note: "test" });
  });

  it("revokes an existing 1-year subscription before setting to lifetime", async () => {
    const getActive = vi.fn().mockResolvedValue({ id: 42, expiresAt: new Date(Date.now() + 30 * 86400000) });
    const order: string[] = [];
    const revoke = vi.fn().mockImplementation(async () => { order.push("revoke"); });
    const grantOrExtend = vi.fn().mockImplementation(async () => { order.push("grantOrExtend"); return 42; });

    const id = await setSubscription(
      { userId: 5, days: 36500, grantedBy: 1 },
      { getActive, revoke, grantOrExtend },
    );

    expect(id).toBe(42);
    expect(revoke).toHaveBeenCalledWith(42);
    expect(grantOrExtend).toHaveBeenCalledWith({ userId: 5, days: 36500, source: "granted", grantedBy: 1, note: undefined });
    expect(order).toEqual(["revoke", "grantOrExtend"]);
  });

  it("revokes an existing lifetime subscription before setting to 1 year (the case grantOrExtendSubscription alone cannot handle)", async () => {
    const getActive = vi.fn().mockResolvedValue({ id: 7, expiresAt: new Date(Date.now() + 36000 * 86400000) });
    const revoke = vi.fn().mockResolvedValue(undefined);
    const grantOrExtend = vi.fn().mockResolvedValue(7);

    const id = await setSubscription(
      { userId: 9, days: 365, grantedBy: 2 },
      { getActive, revoke, grantOrExtend },
    );

    expect(id).toBe(7);
    expect(revoke).toHaveBeenCalledWith(7);
    expect(grantOrExtend).toHaveBeenCalledWith({ userId: 9, days: 365, source: "granted", grantedBy: 2, note: undefined });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd /home/farouq/Development/rabbaanie-api && npx vitest run tests/subscription-management.test.ts`
Expected: FAIL — `setSubscription` is not exported from `../server/db` yet.

- [ ] **Step 3: Add `setSubscription` to `server/db.ts`**

In `/home/farouq/Development/rabbaanie-api/server/db.ts`, insert immediately after the existing `revokeSubscription` function (currently ends at line 3337, right before `export async function listSubscriptions`):

```ts
/**
 * Move a user to an exact target plan, regardless of current state — the
 * admin-only complement to grantOrExtendSubscription's extend-only semantics.
 * Revoking first means the subsequent grant always starts counting from now,
 * so it lands on exactly `opts.days` out whether that's further or nearer
 * than what was there before.
 */
export async function setSubscription(
  opts: { userId: number; days: number; grantedBy: number; note?: string },
  deps: {
    getActive?: typeof getActiveSubscription;
    revoke?: typeof revokeSubscription;
    grantOrExtend?: typeof grantOrExtendSubscription;
  } = {},
): Promise<number> {
  const getActive = deps.getActive ?? getActiveSubscription;
  const revoke = deps.revoke ?? revokeSubscription;
  const grantOrExtend = deps.grantOrExtend ?? grantOrExtendSubscription;
  const existing = await getActive(opts.userId);
  if (existing) await revoke(existing.id);
  return grantOrExtend({ userId: opts.userId, days: opts.days, source: "granted", grantedBy: opts.grantedBy, note: opts.note });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd /home/farouq/Development/rabbaanie-api && npx vitest run tests/subscription-management.test.ts`
Expected: PASS — all 3 tests green.

- [ ] **Step 5: Register the `setSubscription` tRPC procedure**

In `/home/farouq/Development/rabbaanie-api/server/routers.ts`, insert immediately after the existing `revokeSubscription` procedure (currently lines 820-822, right before `couponsList`):

```ts
  setSubscription: ownerAdminProcedure
    .input(z.object({ userId: z.number(), days: z.number().min(1).max(36500), note: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const id = await db.setSubscription({ userId: input.userId, days: input.days, grantedBy: ctx.user.id, note: input.note });
      return { id };
    }),
```

- [ ] **Step 6: Run the full server test suite**

Run: `cd /home/farouq/Development/rabbaanie-api && npx vitest run`
Expected: PASS — no regressions in `tests/admin-2fa-email-factor.test.ts` or the new file.

- [ ] **Step 7: Commit**

```bash
cd /home/farouq/Development/rabbaanie-api
git add server/db.ts server/routers.ts tests/subscription-management.test.ts
git commit -m "feat: add setSubscription for exact-target admin plan changes"
```

---

### Task 2: Client — shared formatter + `useSubscription()` hook extension

**Files:**
- Modify: `/home/farouq/Development/rabbanieserver/repo/hooks/use-subscription.ts` (currently 95 lines, full content read and reproduced below)

**Interfaces:**
- Produces: `export const PERPETUAL_DAYS = 36500`; `export function formatSubscriptionRemaining(expiresAt: string | Date, language: Language): string`; `useSubscription()` return value gains `expiresAt: string | null` alongside the existing `subscribed: boolean` and `loading: boolean`.
- Consumes: `Language` type from `@/lib/i18n` (`"nl" | "en" | "ar"`, confirmed at `lib/i18n.tsx:8`).

Confirmed via `grep -rn "useSubscription("` across the whole client repo: all 5 existing call sites (`app/details/personal-advice.tsx:495`, `app/(tabs)/settings.tsx:205`, `components/premium-notice.tsx:13,39,73`) destructure only `{ subscribed }` or `{ subscribed, loading }` — adding `expiresAt` to the return object is purely additive and cannot break any of them.

- [ ] **Step 1: Replace the file's cache type, `useSubscription`, and add the new exports**

Read the current file first (`/home/farouq/Development/rabbanieserver/repo/hooks/use-subscription.ts`) to confirm it still matches — then replace its full contents with:

```ts
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { getApiBaseUrl } from "@/constants/oauth";
import * as Auth from "@/lib/_core/auth";
import type { Language } from "@/lib/i18n";

/**
 * Every /api/subscription/* route is session-authenticated — without the bearer
 * token the server answers 401 {"error":"authentication_required"}, which the
 * callers silently read as "not subscribed" / "could not save". Attaching it in
 * one place is what keeps a new call site from reintroducing that bug.
 */
export async function subscriptionFetch(path: string, init?: RequestInit) {
  const token = await Auth.getSessionToken();
  return fetch(`${getApiBaseUrl()}/api/subscription/${path}`, {
    ...init,
    credentials: "include",
    headers: {
      ...(init?.headers as Record<string, string> | undefined),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
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
let _subCache: { uid: number; subscribed: boolean; expiresAt: string | null } | null = null;

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
    setLoading(hit === null);
    let alive = true;
    subscriptionFetch(`status?userId=${uid}`)
      .then((r) => r.json())
      .then((d) => {
        const sub = !!(d && d.subscribed);
        const exp = (d && d.expiresAt) || null;
        _subCache = { uid, subscribed: sub, expiresAt: exp };
        if (alive) { setSubscribed(sub); setExpiresAt(exp); setLoading(false); }
      })
      .catch(() => {
        // Network failure must NOT downgrade a paying subscriber to the paywall.
        // Keep the last known-good value for this user if we have one; only fall
        // through to not-subscribed when we've never had a successful check.
        if (!alive) return;
        if (_subCache && _subCache.uid === uid) { setSubscribed(_subCache.subscribed); setExpiresAt(_subCache.expiresAt); }
        setLoading(false);
      });
    return () => { alive = false; };
  }, [uid, authLoading]);

  return { subscribed, expiresAt, loading };
}

// A perpetual grant is stored as a date ~100 years out so every server-side
// entitlement check (`status = active AND expiresAt >= now`) keeps working
// with no nullable column. Anything past half that length was a perpetual
// grant, not a subscriber who happens to be far from expiry.
export const PERPETUAL_DAYS = 36500;
const PERPETUAL_LABEL_CUTOFF_MS = (PERPETUAL_DAYS / 2) * 86400000;

/** "N days left" / "Lifetime" in the app's three languages, from an expiry date. */
export function formatSubscriptionRemaining(expiresAt: string | Date, language: Language): string {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms > PERPETUAL_LABEL_CUTOFF_MS) {
    return language === "ar" ? "مدى الحياة" : language === "en" ? "Lifetime" : "Levenslang";
  }
  const days = Math.max(0, Math.ceil(ms / 86400000));
  return language === "ar" ? `${days} يومًا متبقيًا` : language === "en" ? `${days} days left` : `${days} dagen resterend`;
}
```

- [ ] **Step 2: Type-check**

Run: `cd /home/farouq/Development/rabbanieserver/repo && npx tsc --noEmit`
Expected: no new errors attributable to `hooks/use-subscription.ts` (Tasks 3-4 below will still show errors for `app/subscribe.tsx`/`app/(tabs)/settings.tsx` until those tasks land — that's expected at this point).

- [ ] **Step 3: Commit**

```bash
cd /home/farouq/Development/rabbanieserver/repo
git add hooks/use-subscription.ts
git commit -m "feat: expiresAt + formatSubscriptionRemaining on the subscription hook"
```

---

### Task 3: Client — `app/subscribe.tsx` time-remaining display

**Files:**
- Modify: `/home/farouq/Development/rabbanieserver/repo/app/subscribe.tsx:9` (import), `:171-176` (subscribed banner)

**Interfaces:**
- Consumes: `formatSubscriptionRemaining` from Task 2 (`@/hooks/use-subscription`); the screen's existing `language` (from `useI18n()`, already in scope at line 18) and `status.expiresAt` (already fetched, already typed `expiresAt?: string`, line 26).

- [ ] **Step 1: Add the import**

In `/home/farouq/Development/rabbanieserver/repo/app/subscribe.tsx`, change line 9 from:

```tsx
import { invalidateSubscriptionCache, subscriptionFetch } from "@/hooks/use-subscription";
```

to:

```tsx
import { formatSubscriptionRemaining, invalidateSubscriptionCache, subscriptionFetch } from "@/hooks/use-subscription";
```

- [ ] **Step 2: Add the time-remaining line to the subscribed banner**

Change (currently lines 171-176):

```tsx
            {status?.subscribed ? (
              <View style={{ backgroundColor: colors.primary + "12", borderColor: colors.primary, borderWidth: 1.5, borderRadius: 16, padding: 18, alignItems: "center", marginBottom: 14 }}>
                <MaterialIcons name="verified" size={40} color={colors.primary} />
                <Text style={{ fontSize: 17, fontWeight: "800", color: colors.foreground, marginTop: 8, textAlign: "center" }}>{L3("أنت مشترك", "U bent geabonneerd", "You are subscribed")}</Text>
                <Text style={{ fontSize: 13, color: colors.muted, marginTop: 6, textAlign: "center" }}>{L3("ساري إلى", "Geldig tot", "Valid until")} {fmtDate(status.expiresAt)}</Text>
              </View>
            ) : (
```

to:

```tsx
            {status?.subscribed ? (
              <View style={{ backgroundColor: colors.primary + "12", borderColor: colors.primary, borderWidth: 1.5, borderRadius: 16, padding: 18, alignItems: "center", marginBottom: 14 }}>
                <MaterialIcons name="verified" size={40} color={colors.primary} />
                <Text style={{ fontSize: 17, fontWeight: "800", color: colors.foreground, marginTop: 8, textAlign: "center" }}>{L3("أنت مشترك", "U bent geabonneerd", "You are subscribed")}</Text>
                <Text style={{ fontSize: 13, color: colors.muted, marginTop: 6, textAlign: "center" }}>{L3("ساري إلى", "Geldig tot", "Valid until")} {fmtDate(status.expiresAt)}</Text>
                {status.expiresAt ? <Text style={{ fontSize: 13, color: colors.primary, fontWeight: "800", marginTop: 4, textAlign: "center" }}>{formatSubscriptionRemaining(status.expiresAt, language)}</Text> : null}
              </View>
            ) : (
```

- [ ] **Step 3: Type-check**

Run: `cd /home/farouq/Development/rabbanieserver/repo && npx tsc --noEmit`
Expected: no errors attributable to `app/subscribe.tsx`.

- [ ] **Step 4: Manual verification**

Start the app (`npx expo start`), sign in as a subscribed user, open the Subscribe screen. Confirm the "Valid until {date}" line now has a second line beneath it reading "N days left" (or "Lifetime" for a perpetual grant) in the active language. Switch language and confirm all three translations render correctly (no missing-key blank text).

- [ ] **Step 5: Commit**

```bash
cd /home/farouq/Development/rabbanieserver/repo
git add app/subscribe.tsx
git commit -m "feat: show days-remaining alongside the expiry date on Subscribe"
```

---

### Task 4: Client — `app/(tabs)/settings.tsx` time-remaining display

**Files:**
- Modify: `/home/farouq/Development/rabbanieserver/repo/app/(tabs)/settings.tsx:67` (import), `:205` (hook call), `:1222-1227` (subscription card)

**Interfaces:**
- Consumes: `formatSubscriptionRemaining` from Task 2 (`@/hooks/use-subscription`); the screen's existing `language`/`isRTL` (from `useI18n()`) and the now-extended `useSubscription()` hook.

- [ ] **Step 1: Add the import**

In `/home/farouq/Development/rabbanieserver/repo/app/(tabs)/settings.tsx`, change line 67 from:

```tsx
import { useSubscription } from "@/hooks/use-subscription";
```

to:

```tsx
import { formatSubscriptionRemaining, useSubscription } from "@/hooks/use-subscription";
```

- [ ] **Step 2: Read `expiresAt` from the hook**

Change line 205 from:

```tsx
  const { subscribed } = useSubscription();
```

to:

```tsx
  const { subscribed, expiresAt } = useSubscription();
```

- [ ] **Step 3: Add the time-remaining line to the subscription card**

Change (currently lines 1222-1227):

```tsx
          <Text style={{ color: "#ffffffcc", fontSize: 12, marginTop: 2, textAlign: isRTL ? "right" : "left" }}>
            {subscribed
              ? (language === "ar" ? "أنت مشترك ✓ — اطّلع على التفاصيل" : isEn ? "Subscribed ✓ — view details" : "Geabonneerd ✓ — details")
              : (language === "ar" ? "اطّلع على اشتراكك والخدمات" : isEn ? "View your subscription & services" : "Bekijk uw abonnement en diensten")}
          </Text>
        </View>
```

to:

```tsx
          <Text style={{ color: "#ffffffcc", fontSize: 12, marginTop: 2, textAlign: isRTL ? "right" : "left" }}>
            {subscribed
              ? (language === "ar" ? "أنت مشترك ✓ — اطّلع على التفاصيل" : isEn ? "Subscribed ✓ — view details" : "Geabonneerd ✓ — details")
              : (language === "ar" ? "اطّلع على اشتراكك والخدمات" : isEn ? "View your subscription & services" : "Bekijk uw abonnement en diensten")}
          </Text>
          {subscribed && expiresAt ? (
            <Text style={{ color: "#ffffffcc", fontSize: 11, marginTop: 2, textAlign: isRTL ? "right" : "left", fontWeight: "700" }}>
              {formatSubscriptionRemaining(expiresAt, language)}
            </Text>
          ) : null}
        </View>
```

- [ ] **Step 4: Type-check**

Run: `cd /home/farouq/Development/rabbanieserver/repo && npx tsc --noEmit`
Expected: no errors attributable to `app/(tabs)/settings.tsx`.

- [ ] **Step 5: Manual verification**

Open the Settings tab as a subscribed user. Confirm the "My subscription" card (the primary-colored pill near the top) now shows a third line with the days-remaining/Lifetime text beneath the existing "Subscribed ✓ — view details" line. Confirm a non-subscribed user's card shows no such line (only the existing "View your subscription & services" text).

- [ ] **Step 6: Commit**

```bash
cd /home/farouq/Development/rabbanieserver/repo
git add "app/(tabs)/settings.tsx"
git commit -m "feat: show days-remaining on the settings subscription card"
```

---

### Task 5: Client — `app/admin/subscriptions.tsx` full action set + time-remaining

**Files:**
- Modify: `/home/farouq/Development/rabbanieserver/repo/app/admin/subscriptions.tsx` (259 lines total; import block, mutation definitions, `PERPETUAL_DAYS` constant, a new confirm helper, the per-user card)

**Interfaces:**
- Consumes: `formatSubscriptionRemaining`, `PERPETUAL_DAYS` from Task 2 (`@/hooks/use-subscription`); the new `admin.setSubscription` tRPC mutation from Task 1 (reached through this screen's existing untyped `(trpc as any).admin` proxy — no type-generation step needed, matching the screen's existing comment "Uses the runtime tRPC proxy").
- Produces: nothing consumed elsewhere — this is the terminal task in the chain, depends on both Task 1 (the procedure must exist) and Task 2 (the formatter/constant must exist).

- [ ] **Step 1: Import the shared formatter and constant**

In `/home/farouq/Development/rabbanieserver/repo/app/admin/subscriptions.tsx`, change lines 8-9 from:

```tsx
import { trpc } from "@/lib/trpc";
import * as Clipboard from "expo-clipboard";
```

to:

```tsx
import { trpc } from "@/lib/trpc";
import * as Clipboard from "expo-clipboard";
import { formatSubscriptionRemaining, PERPETUAL_DAYS } from "@/hooks/use-subscription";
```

- [ ] **Step 2: Drop the now-duplicate local `PERPETUAL_DAYS`**

Change (currently lines 58-59):

```tsx
  const PERPETUAL_DAYS = 36500;
  const PERPETUAL_LABEL_CUTOFF_MS = (PERPETUAL_DAYS / 2) * 86400000;
```

to:

```tsx
  const PERPETUAL_LABEL_CUTOFF_MS = (PERPETUAL_DAYS / 2) * 86400000;
```

(`PERPETUAL_DAYS` now comes from the Step 1 import; `PERPETUAL_LABEL_CUTOFF_MS` and the existing `fmt()` function that uses it — the "subs" tab's date formatter — are otherwise unchanged.)

- [ ] **Step 3: Add the `setSubscription` mutation**

Change (currently line 39):

```tsx
  const revoke = admin.revokeSubscription.useMutation({ onSuccess: refetchAll });
```

to:

```tsx
  const revoke = admin.revokeSubscription.useMutation({ onSuccess: refetchAll });
  const setSub = admin.setSubscription.useMutation({
    onSuccess: refetchAll,
    onError: (e: any) => Alert.alert("تعذّر التعديل", e?.message || ""),
  });
```

- [ ] **Step 4: Add a confirm dialog for "set to lifetime"**

Change (currently lines 84-93, the existing `confirmPerpetual` function — add the new function immediately after it, before `function doCreateCoupon()`):

```tsx
  function confirmPerpetual(userId: number, label: string) {
    Alert.alert(
      "اشتراكٌ دائم",
      `منح اشتراكٍ دائم لـ ${label}؟ لن ينتهيَ تلقائيًّا.`,
      [
        { text: "إلغاء", style: "cancel" },
        { text: "منح", onPress: () => grant.mutate({ userId, days: PERPETUAL_DAYS }) },
      ],
    );
  }
  function confirmSetLifetime(userId: number, label: string) {
    Alert.alert(
      "ضبط اشتراكٍ دائم",
      `ضبط اشتراك ${label} إلى دائم؟ سيحلّ محلّ الاشتراك الحاليّ ولن ينتهيَ تلقائيًّا.`,
      [
        { text: "إلغاء", style: "cancel" },
        { text: "ضبط", onPress: () => setSub.mutate({ userId, days: PERPETUAL_DAYS }) },
      ],
    );
  }
```

- [ ] **Step 5: Compute `isLifetime` per user**

Change (currently lines 214-217, inside the "info" tab's `list.map`):

```tsx
                  {list.map((u: any) => {
                    const isSpecial = !!u.special;
                    const displayName = (u.firstName || u.lastName) ? `${u.firstName || ""} ${u.lastName || ""}`.trim() : (u.name || "—");
                    const idText = u.publicId || `#${u.id}`;
```

to:

```tsx
                  {list.map((u: any) => {
                    const isSpecial = !!u.special;
                    const isLifetime = isSpecial && !!u.expiresAt && (new Date(u.expiresAt).getTime() - Date.now() > PERPETUAL_LABEL_CUTOFF_MS);
                    const displayName = (u.firstName || u.lastName) ? `${u.firstName || ""} ${u.lastName || ""}`.trim() : (u.name || "—");
                    const idText = u.publicId || `#${u.id}`;
```

- [ ] **Step 6: Add the time-remaining line to the per-user card**

Change (currently lines 230-232):

```tsx
                        {u.email ? <Text style={{ fontSize: 12, color: colors.muted, textAlign: align, marginTop: 2 }}>{u.email}</Text> : null}
                        {u.phone ? <Text style={{ fontSize: 12, color: colors.muted, textAlign: align, marginTop: 2 }}>{u.phone}</Text> : null}
                        <View style={{ flexDirection: isRTL ? "row-reverse" : "row", marginTop: 10, gap: 8, flexWrap: "wrap" }}>
```

to:

```tsx
                        {u.email ? <Text style={{ fontSize: 12, color: colors.muted, textAlign: align, marginTop: 2 }}>{u.email}</Text> : null}
                        {u.phone ? <Text style={{ fontSize: 12, color: colors.muted, textAlign: align, marginTop: 2 }}>{u.phone}</Text> : null}
                        {isSpecial && u.expiresAt ? <Text style={{ fontSize: 12, color: colors.primary, fontWeight: "700", textAlign: align, marginTop: 4 }}>{formatSubscriptionRemaining(u.expiresAt, "ar")}</Text> : null}
                        <View style={{ flexDirection: isRTL ? "row-reverse" : "row", marginTop: 10, gap: 8, flexWrap: "wrap" }}>
```

- [ ] **Step 7: Replace the button block with the full three-state action set**

Change (currently lines 233-246):

```tsx
                          {isSpecial ? (
                            <TouchableOpacity onPress={() => u.subscriptionId && revoke.mutate({ id: u.subscriptionId })} disabled={revoke.isPending} style={{ backgroundColor: "#c0392b", borderRadius: 9, paddingVertical: 9, paddingHorizontal: 16 }}>
                              <Text style={{ color: "#fff", fontWeight: "700", fontSize: 12 }}>إلغاء الاشتراك الخاصّ</Text>
                            </TouchableOpacity>
                          ) : (
                            <>
                              <TouchableOpacity onPress={() => grant.mutate({ userId: u.id, days: 365 })} disabled={grant.isPending} style={{ backgroundColor: colors.primary, borderRadius: 9, paddingVertical: 9, paddingHorizontal: 16 }}>
                                <Text style={{ color: "#fff", fontWeight: "700", fontSize: 12 }}>ترقية إلى اشتراكٍ خاصّ (سنة)</Text>
                              </TouchableOpacity>
                              <TouchableOpacity onPress={() => confirmPerpetual(u.id, displayName)} disabled={grant.isPending} style={{ backgroundColor: "#7C3AED", borderRadius: 9, paddingVertical: 9, paddingHorizontal: 16 }}>
                                <Text style={{ color: "#fff", fontWeight: "700", fontSize: 12 }}>اشتراكٌ دائم</Text>
                              </TouchableOpacity>
                            </>
                          )}
```

to:

```tsx
                          {!isSpecial ? (
                            <>
                              <TouchableOpacity onPress={() => grant.mutate({ userId: u.id, days: 365 })} disabled={grant.isPending} style={{ backgroundColor: colors.primary, borderRadius: 9, paddingVertical: 9, paddingHorizontal: 16 }}>
                                <Text style={{ color: "#fff", fontWeight: "700", fontSize: 12 }}>ترقية إلى اشتراكٍ خاصّ (سنة)</Text>
                              </TouchableOpacity>
                              <TouchableOpacity onPress={() => confirmPerpetual(u.id, displayName)} disabled={grant.isPending} style={{ backgroundColor: "#7C3AED", borderRadius: 9, paddingVertical: 9, paddingHorizontal: 16 }}>
                                <Text style={{ color: "#fff", fontWeight: "700", fontSize: 12 }}>اشتراكٌ دائم</Text>
                              </TouchableOpacity>
                            </>
                          ) : (
                            <>
                              <TouchableOpacity onPress={() => setSub.mutate({ userId: u.id, days: 365 })} disabled={setSub.isPending} style={{ backgroundColor: colors.primary, borderRadius: 9, paddingVertical: 9, paddingHorizontal: 16 }}>
                                <Text style={{ color: "#fff", fontWeight: "700", fontSize: 12 }}>ضبط: سنة واحدة</Text>
                              </TouchableOpacity>
                              {!isLifetime ? (
                                <>
                                  <TouchableOpacity onPress={() => confirmSetLifetime(u.id, displayName)} disabled={setSub.isPending} style={{ backgroundColor: "#7C3AED", borderRadius: 9, paddingVertical: 9, paddingHorizontal: 16 }}>
                                    <Text style={{ color: "#fff", fontWeight: "700", fontSize: 12 }}>ضبط: دائم</Text>
                                  </TouchableOpacity>
                                  <TouchableOpacity onPress={() => grant.mutate({ userId: u.id, days: 365 })} disabled={grant.isPending} style={{ backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.primary, borderRadius: 9, paddingVertical: 9, paddingHorizontal: 16 }}>
                                    <Text style={{ color: colors.primary, fontWeight: "700", fontSize: 12 }}>تمديد سنة</Text>
                                  </TouchableOpacity>
                                </>
                              ) : null}
                              <TouchableOpacity onPress={() => u.subscriptionId && revoke.mutate({ id: u.subscriptionId })} disabled={revoke.isPending} style={{ backgroundColor: "#c0392b", borderRadius: 9, paddingVertical: 9, paddingHorizontal: 16 }}>
                                <Text style={{ color: "#fff", fontWeight: "700", fontSize: 12 }}>إلغاء الاشتراك الخاصّ</Text>
                              </TouchableOpacity>
                            </>
                          )}
```

This produces exactly the three states the spec calls for:
- **No active subscription** (`!isSpecial`): "ترقية إلى اشتراكٍ خاصّ (سنة)" / "اشتراكٌ دائم" — byte-for-byte unchanged from today.
- **Active, not yet Lifetime** (`isSpecial && !isLifetime`): "ضبط: سنة واحدة" / "ضبط: دائم" / "تمديد سنة" / "إلغاء الاشتراك الخاصّ" — four buttons.
- **Active, already Lifetime** (`isSpecial && isLifetime`): "ضبط: سنة واحدة" / "إلغاء الاشتراك الخاصّ" only — "ضبط: دائم" and "تمديد سنة" are both meaningless no-ops here (push an already-~100-year date further out, or set to the label it already shows) and are omitted, matching the spec exactly.

- [ ] **Step 8: Type-check**

Run: `cd /home/farouq/Development/rabbanieserver/repo && npx tsc --noEmit`
Expected: no errors attributable to `app/admin/subscriptions.tsx`.

- [ ] **Step 9: Manual verification**

Open the admin Subscriptions screen as an owner/admin, "المستخدمون" (info) tab:
1. Find a user with no active subscription ("عامّ" badge) — confirm the two original buttons still appear and still work.
2. Grant that user a 1-year subscription — confirm the card now shows the time-remaining line and four buttons: "ضبط: سنة واحدة", "ضبط: دائم", "تمديد سنة", "إلغاء الاشتراك الخاصّ".
3. Tap "ضبط: دائم", confirm the dialog, confirm — the card should now show "مدى الحياة" (via the time-remaining line) and only two buttons remain ("ضبط: سنة واحدة", "إلغاء الاشتراك الخاصّ"); "ضبط: دائم" and "تمديد سنة" should no longer be offered.
4. Tap "ضبط: سنة واحدة" on that now-lifetime user — confirm the card updates to show a real ~1-year-out date/day-count, not "مدى الحياة" anymore, and the four-button state reappears.
5. Confirm "إلغاء الاشتراك الخاصّ" still cancels immediately with no confirm dialog, as before.
6. Switch to the "الاشتراكات" (subs) and "الكوبونات" (coupons) tabs — confirm both are visually and functionally identical to before this task (no shared code was touched other than the `PERPETUAL_DAYS` source).

- [ ] **Step 10: Commit**

```bash
cd /home/farouq/Development/rabbanieserver/repo
git add app/admin/subscriptions.tsx
git commit -m "feat: full set/extend/cancel action set and time-remaining on admin subscriptions"
```
