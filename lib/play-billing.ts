import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";

import { DISTRIBUTION_CHANNEL } from "@/lib/distribution";
import { invalidateSubscriptionCache, subscriptionFetch } from "@/hooks/use-subscription";

/**
 * Google Play Billing — the Play channel's only payment path.
 *
 * Stripe stays the sideload channel's path. Opening Stripe from a Play build is
 * an in-app link to a payment method outside Play billing, which the payments
 * policy forbids outright; conversely Play billing is unavailable to a sideload
 * install, which has no Play purchase context. So the two never overlap, and
 * every entry point here refuses to do anything off the Play channel.
 *
 * Product identity must match the server's: rabbaanie-api reads
 * PLAY_PRODUCT_ID with the same default, and rejects a purchase whose line item
 * is for any other product.
 *
 * THE SERVER HALF IS NOT IN THIS REPOSITORY. `/api/subscription/verify-play`
 * and the `playAccountTag` field on `/api/subscription/status` live in the
 * separate `rabbaanie-api` repo (server/play-billing.ts and
 * server/_core/index.ts) — grepping `server/` here finds nothing, which reads
 * like a missing endpoint and is not. Both arrive in the same commit there, so
 * they cannot ship apart; deploy that repo BEFORE releasing a Play build. Until
 * it is deployed the tag is absent and the purchase button never renders, which
 * is the intended fail-closed order.
 */
export const PLAY_PRODUCT_ID = "rabbaanie_annual";

/**
 * expo-iap pulls in a native module. It is imported lazily, and only after the
 * channel check, so a sideload build never loads Play Billing at all — and the
 * web bundle, which has no native module to load, never evaluates it either.
 *
 * The dependency is pinned to an exact version, not a range. expo-iap 5.1.0
 * ships openiap-google 3.1.0, which is compiled against kotlin-stdlib 2.4.10,
 * while Expo SDK 54 ships the Kotlin 2.1.0 compiler — and 2.1.0 reads metadata
 * only up to 2.2.0. The result is `:expo:compileReleaseKotlin` failing with
 * "Module was compiled with an incompatible version of Kotlin", five minutes
 * into a Gradle build, with nothing in tsc or vitest to warn first. 5.0.0
 * (openiap-google 3.0.0) uses kotlin-stdlib 2.2.0 and carries the same Play
 * Billing 9.1.0, comfortably past the v8 minimum Play requires from
 * 31 Aug 2026. Raise this only together with the project's Kotlin version, and
 * only with a full `./gradlew bundleRelease` to prove it —
 * tests/play-store-compliance.test.ts pins it so a blind bump fails fast.
 */
type PlayIap = typeof import("expo-iap");
let iapModule: Promise<PlayIap> | null = null;
function loadIap(): Promise<PlayIap> {
  if (!iapModule) {
    iapModule = import("expo-iap").catch((error) => {
      // Never cache a rejection. The promise is reused by every later call
      // including the one behind the Subscribe button, so a single transient
      // failure would leave that button permanently dead until the app is
      // force-restarted, showing only a generic "purchase failed".
      iapModule = null;
      throw error;
    });
  }
  return iapModule;
}

/**
 * Whether this build can transact through Play at all. Fail-closed on both
 * axes: DISTRIBUTION_CHANNEL already defaults to "play" only for a *Play*
 * artifact, and Play Billing exists only on Android.
 */
function isPlayBillingEnabled(): boolean {
  return DISTRIBUTION_CHANNEL === "play" && Platform.OS === "android";
}

type AnnualOffer = { displayPrice: string; offerToken: string };

/**
 * Reasons the server gives when Google has answered clearly and the answer is
 * no. None of these change with a retry, so they must not put the screen into its
 * paid-but-unverified recovery mode — that mode exists for failures that might
 * resolve, and offering it after a definitive no strands a non-buyer in it.
 */
const DEFINITIVE_REJECTIONS = new Set([
  "expired",
  "no_line_items",
  "product_mismatch",
  "no_expiry",
  "empty_response",
]);

/**
 * Pick the offer to buy out of what Play returned for the subscription.
 *
 * Split out as a pure function because it is the only branching logic here that
 * can be wrong in a way no emulator would reveal: Play returns *eligible*
 * offers, so the list differs per user (a returning subscriber sees no free
 * trial, a new one does), and an empty list is a normal state — it means the
 * product exists but this account is eligible for nothing, which must read as
 * "cannot buy" rather than crashing on offers[0].
 */
export function pickAnnualOffer(product: unknown): AnnualOffer | null {
  const offers = (product as { subscriptionOffers?: unknown })?.subscriptionOffers;
  if (!Array.isArray(offers)) return null;
  for (const offer of offers) {
    const offerToken = offer?.offerTokenAndroid;
    if (typeof offerToken !== "string" || !offerToken) continue;
    // Empty string, not just null: `??` passes "" straight through, and a
    // truthy offer carrying no price renders a bare "/ year" with no number on
    // the one screen this change exists to make honest.
    const displayPrice =
      offer?.displayPrice ||
      (product as { displayPrice?: string } | null)?.displayPrice ||
      "";
    // ponytail: takes the first usable offer rather than ranking them. Correct
    // while the product has a single base plan and no promotional offers; add
    // ranking here if introductory pricing is ever configured in Play Console.
    return { displayPrice: String(displayPrice), offerToken };
  }
  return null;
}

/**
 * Send one purchase token to the server, which asks Google whether it paid.
 *
 * The reason is returned, not just a boolean, because one of them is not a
 * failure of ours at all: `account_mismatch` means the purchase belongs to a
 * different Rabbaanie account — normal on a shared or resold device — and must
 * not be reported to this user as a payment of theirs that went wrong.
 */
async function verifyWithServer(
  purchaseToken: string,
): Promise<{ ok: boolean; reason: string }> {
  const response = await subscriptionFetch("verify-play", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ purchaseToken }),
  });
  const body = await response.json().catch(() => null);
  return {
    ok: response.ok && !!body?.ok,
    reason: String(body?.error ?? ""),
  };
}

/**
 * Drive the Play purchase flow for the annual membership.
 *
 * The purchase result arrives on an event, not as the resolution of
 * requestPurchase — Play can complete a purchase minutes later (slow payment
 * methods) or replay one the app never finished. So the listener is the source
 * of truth and is mounted for the whole life of the screen.
 */
type Outcome = null | "pending" | "unverified" | "foreign";

export function usePlayBilling(accountTag: string | undefined, userId: number | undefined) {
  const enabled = isPlayBillingEnabled();
  const [offer, setOffer] = useState<AnnualOffer | null>(null);
  // Distinguishes "still asking Play" from "Play has nothing for you here".
  // Without it the screen shows a loading message forever on iOS, web and any
  // build where Play Billing simply does not apply — worse than the copy it
  // replaced, which at least pointed the user at the coupon field.
  const [loading, setLoading] = useState(enabled);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [purchased, setPurchased] = useState(false);
  // Mirrors outcomeRef for the SCREEN, which needs to know a recovery is
  // possible before it can offer a control that triggers one. A ref alone
  // cannot do that: it does not re-render.
  const [recoverable, setRecoverable] = useState(false);
  // Mirrors `purchased` for the recovery branch in purchase(), which is a
  // useCallback and would otherwise read the value captured at its last render
  // — false, even just after settle() set it true in the same tick.
  const purchasedRef = useRef(false);
  const markPurchased = (value: boolean) => {
    purchasedRef.current = value;
    setPurchased(value);
  };
  // Read inside the listener, which is registered once — a ref keeps it seeing
  // the current tag instead of the value captured when it was first attached.
  const accountTagRef = useRef(accountTag);
  accountTagRef.current = accountTag;
  // True only between tapping Subscribe and that purchase settling. Play flushes
  // every purchase the account already owns into purchaseUpdatedListener the
  // moment the connection opens, so without this flag simply opening this screen
  // with an old or expired purchase on the device would show "Payment went
  // through but could not be confirmed yet" to someone who never tapped anything.
  const buyingRef = useRef(false);
  // Tokens already settled this mount. The connection-open flush and the
  // getAvailablePurchases sweep deliver the same purchases seconds apart;
  // without this each one is verified and acknowledged twice.
  const settledRef = useRef<Set<string>>(new Set());
  const resyncRef = useRef<(() => Promise<void>) | null>(null);
  /**
   * What the last settled purchase left behind, as ONE value rather than a
   * collection of booleans.
   *
   * This started as separate refs and an `errorRef` read, and every review round
   * found another corner where two of them combined into a dead Subscribe
   * button or a silent no-op. A single outcome makes the branches in purchase()
   * exhaustive and forces each new state to declare what a re-tap should do.
   *
   *  "pending"    — Play has the purchase but the money has not moved yet.
   *  "unverified" — Play says this account owns it; our server would not confirm.
   *  "foreign"    — it is owned, but by a different Rabbaanie account.
   */
  const outcomeRef = useRef<Outcome>(null);
  /**
   * The ONE writer for the outcome. `recoverable` mirrors it for the screen,
   * which cannot read a ref — and the two drifted the first time they were
   * maintained as separate statements: a `setRecoverable(false)` that was meant
   * to sit beside `outcomeRef.current = null` in the verify_gone branch simply
   * was not there. `recoverable` stayed true with no outcome behind it, and the
   * next tap took that as "this is a recovery", skipped the subscriber-details
   * check AND the POST that saves them, and bought a real membership with no
   * name, address or phone on record — the exact thing the details guard exists
   * to prevent. Lockstep by convention failed; lockstep by construction cannot.
   */
  const setOutcome = (value: Outcome) => {
    outcomeRef.current = value;
    setRecoverable(value !== null);
  };

  // Account switches must not inherit the previous user's billing verdict:
  // "foreign"/"unverified" would early-return instead of purchasing, and a
  // stale `purchased` would trigger a spurious status refetch. subscribe.tsx
  // clears its own state on uid change; this is the same reset for the hook's.
  useEffect(() => {
    // Keyed on the ACCOUNT, not on the tag. Keying it on the tag meant choosing
    // between two failures: reset on every change and the initial
    // undefined -> tag fill erases a diagnosis the launch sweep just produced;
    // skip undefined -> tag and an account whose /status never succeeded leaves
    // its outcome, settled tokens and purchased flag to the NEXT account, whose
    // tag arrives as the same undefined -> tag transition. The uid changes
    // exactly once per switch and never for a late tag, which is the actual
    // question being asked.
    setOutcome(null);
    settledRef.current.clear();
    buyingRef.current = false;
    markPurchased(false);
    setError(null);
  }, [userId]);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    let cleanup: (() => void) | undefined;

    (async () => {
      const iap = await loadIap();
      if (!alive) return;

      /**
       * Take one purchase from "Play says it exists" to "the server granted
       * access", or leave it untouched for Play to replay later.
       *
       * `restore` marks the launch-time sweep over already-owned purchases.
       * Those must still be acknowledged when they verify — but they must not
       * raise errors at a user who is merely opening the screen, and an old
       * expired purchase failing verification there is normal, not a failure.
       */
      const settle = async (purchase: any, restore = false) => {
        // Every exit from here must release the button. purchaseErrorListener
        // does not fire for a purchase that simply is not actionable yet, so an
        // early return without this leaves Subscribe disabled behind a spinner
        // for the life of the screen — after the user has committed to paying.
        const release = () => {
          if (!restore) buyingRef.current = false;
          if (alive && !restore) setBusy(false);
        };
        const token = purchase?.purchaseToken ?? purchase?.purchaseTokenAndroid;
        if (typeof token !== "string" || !token) {
          release();
          return;
        }
        if (settledRef.current.has(token)) {
          release();
          return;
        }
        // Slow payment methods (cash at a store, some carrier billing) deliver a
        // purchase with a real token BEFORE any money moves. Verifying it would
        // fail server-side and then tell the user their payment "went through"
        // and they "will not be charged again" — both false. Play re-delivers
        // the purchase once it settles, so leave it alone until then — but say
        // so, because this is a normal outcome and not an error.
        if (purchase?.purchaseState === "pending") {
          setOutcome("pending");
          if (alive && !restore) setError("purchase_pending");
          release();
          return;
        }
        // Marked only once the purchase is actually actionable. Doing it above
        // the pending check would dedupe the token forever: Play re-delivers the
        // SAME token once the money clears, and that re-delivery would then be
        // dropped — never verified, never acknowledged, refunded after three days.
        settledRef.current.add(token);
        try {
          const { ok, reason } = await verifyWithServer(token);
          if (!ok) {
            // Someone else's purchase sitting on this device. Not ours to
            // report, and emphatically not "your payment went through" — the
            // user never made one. Leave it deduped so the sweep stops asking.
            if (reason === "account_mismatch") {
              // No add() here: the token was already added unconditionally above,
              // and every other branch's add/delete placement in this function is
              // load-bearing — a redundant one invites the reader to hunt for a
              // meaning it does not have. Leaving it deduped is what stops the
              // sweep asking again, and that is already true.
              setOutcome("foreign");
              // Silent only when this is the launch sweep finding a stranger's
              // purchase. If the user just paid, saying nothing leaves them with
              // a cleared spinner, no message, and a refund in three days.
              if (alive && !restore) setError("purchase_foreign");
              return;
            }
            // Deliberately NOT finished. An unverified purchase stays in Play's
            // queue and is replayed on the next launch, so a transient server
            // failure costs the user a retry rather than the money. Google
            // auto-refunds anything still unacknowledged after three days,
            // which is the correct outcome if it never verifies.
            //
            // Released from the dedupe set for the same reason the
            // acknowledge-failure path releases it: left marked, the next
            // delivery of this token would hit the `has(token)` early return,
            // which clears the spinner without setting an error or a success —
            // the user taps Subscribe and simply nothing happens.
            // A DEFINITIVE verdict is not a recovery. Google told us plainly
            // that this purchase does not entitle anything — expired, cancelled
            // out of its paid period, a different product. Treating those like
            // a transient failure meant the launch sweep, finding an old
            // purchase on the device, offered its recovery control to someone
            // who never paid, and turned their first Subscribe tap into a
            // resync instead of a purchase. Only a failure that might resolve
            // itself is worth re-verifying.
            if (DEFINITIVE_REJECTIONS.has(reason) || reason.startsWith("state_")) {
              if (alive && !restore) setError("verify_gone");
              return;
            }
            settledRef.current.delete(token);
            // setOutcome runs on the silent restore path too, and that is the
            // point: it is the ONLY signal the screen gets that a paid purchase
            // needs re-verifying, and without it a user whose offer never
            // loaded had no control to tap at all. The message below is a
            // different question and stays quiet on restore — someone who just
            // opened the screen has not paid anything to be told about.
            setOutcome("unverified");
            if (alive && !restore) setError("verify_failed");
            return;
          }
          // Acknowledging is what stops that three-day auto-refund. It has to
          // happen on the restore path too: a purchase that failed verification
          // once and succeeds on the retry would otherwise be granted a year of
          // access AND refunded by Google, because nothing ever acknowledged it.
          //
          // Its own try: entitlement is already granted at this point, so a
          // failure here must not be reported as "we could not confirm your
          // payment" — that is false, and it would hide a real success. The
          // token is dropped from settledRef so the next sweep retries the
          // acknowledgement before Google's three-day window closes.
          try {
            await iap.finishTransaction({ purchase, isConsumable: false });
          } catch {
            settledRef.current.delete(token);
          }
          setOutcome(null);
          invalidateSubscriptionCache();
          if (alive) {
            markPurchased(true);
            if (!restore) setError(null);
          }
        } catch {
          // Losing connectivity right after paying is the COMMON failure, not
          // the rare one, and it rejects the fetch rather than returning a
          // status. Without this catch it escapes as an unhandled rejection and
          // the user watches the spinner stop with nothing explaining why.
          //
          // Both lines below mirror the `!ok` branch, and for the same reasons —
          // this path used to set only the message, which made it the one way to
          // reach "verify_failed" without the state that makes the retry work:
          //
          //   outcome stayed null, so a re-tap fell through to requestPurchase()
          //   instead of re-verifying. Play answers ITEM_ALREADY_OWNED, and
          //   someone who has paid is told "the purchase could not be completed".
          //
          //   the token stayed in settledRef, so Play re-delivering it in this
          //   session hit the has(token) early return: spinner off, no message,
          //   no grant.
          settledRef.current.delete(token);
          setOutcome("unverified");
          if (alive && !restore) setError("verify_failed");
        } finally {
          release();
        }
      };

      const updated = iap.purchaseUpdatedListener((purchase) => {
        // Only a purchase the user actually just started is theirs to be told
        // about. Everything else arriving on this listener is Play replaying
        // what the account already owns, which is the restore case.
        void settle(purchase, !buyingRef.current);
      });
      const failed = iap.purchaseErrorListener((purchaseError) => {
        buyingRef.current = false;
        if (!alive) return;
        setBusy(false);
        // A user backing out of Play's sheet is not an error worth showing.
        const code = String((purchaseError as { code?: string })?.code ?? "");
        setError(/cancel/i.test(code) ? null : "purchase_failed");
      });
      cleanup = () => {
        updated.remove();
        failed.remove();
        // endConnection() is deliberately NOT called.
        //
        // It looks like the tidy counterpart to initConnection(), but the
        // BillingClient is process-global while this effect is not. An
        // un-awaited teardown races the next mount's initConnection(): if the
        // stale close resolves last, the new mount has listeners attached and no
        // connection, fetchProducts fails into "unavailable", and a purchase Play
        // tries to flush is delivered to nothing — unacknowledged, so refunded
        // after three days. Unmounting *during* the initial connect is worse
        // still: the close is a no-op against a connection that does not exist
        // yet, and the connection that then opens has no teardown left at all.
        // Leaving one long-lived connection open for the process is benign;
        // the race is not. Serialise init/end behind a shared promise chain if a
        // second screen ever needs billing.
      };

      // Connect only AFTER the listeners exist. Play flushes purchases that
      // completed while the app was closed as soon as the connection opens, so
      // connecting first can emit a completed purchase into no listener at all —
      // and an unheard purchase is an unacknowledged one, which Google refunds
      // after three days.
      await iap.initConnection();
      if (!alive) return;

      const products = await iap.fetchProducts({
        skus: [PLAY_PRODUCT_ID],
        type: "subs",
      });
      if (!alive) return;
      setOffer(pickAnnualOffer(Array.isArray(products) ? products[0] : null));
      setLoading(false);

      // Re-verify what Play already knows this account owns. This is both the
      // "restore purchases" path and the renewal sync: the server stores
      // Google's expiry verbatim, so without re-verifying, a subscription that
      // renewed in year two would still carry year one's expiry and lapse.
      // Same sweep, callable again later: after a failed verification the user
      // owns the subscription, so re-buying is impossible and re-verifying is
      // the only real retry. `restore: false` here on purpose — this run IS the
      // user asking, so its outcome should be reported to them.
      resyncRef.current = async () => {
        try {
          const owned = await iap.getAvailablePurchases();
          for (const purchase of owned ?? []) await settle(purchase, false);
        } finally {
          // settle() clears the spinner, but only if it runs. Play returning an
          // empty list is a real outcome (already auto-refunded, expired, or a
          // different Play account on the device) and would otherwise leave
          // Subscribe disabled behind a spinner for the life of the screen.
          if (alive) setBusy(false);
          buyingRef.current = false;
        }
      };

      try {
        const owned = await iap.getAvailablePurchases();
        for (const purchase of owned ?? []) await settle(purchase, true);
      } catch {
        // Restore is best-effort. A failure here must not block buying.
      }
    })().catch(() => {
      // No Play connection (emulator without Play services, account signed out
      // of Play, product not yet live). The screen keeps the coupon path and
      // simply offers no purchase button.
      if (alive) {
        setError("unavailable");
        setLoading(false);
      }
    });

    return () => {
      alive = false;
      cleanup?.();
    };
  }, [enabled]);

  const purchase = useCallback(async () => {
    if (!enabled) return;
    setBusy(true);
    setError(null);

    // Every state Play can already be in for this product, handled explicitly.
    // requestPurchase() below is only correct when Play holds nothing for this
    // subscription; in every other case it fails with ITEM_ALREADY_OWNED and
    // replaces an accurate message with "the purchase could not be completed",
    // which is the wrong thing to tell someone who has already paid.
    switch (outcomeRef.current) {
      case "pending":
        // Money is in flight through a slow payment method. Nothing to do but
        // say so again; buying a second time is exactly what must not happen.
        setBusy(false);
        setError("purchase_pending");
        return;
      case "foreign":
        // Owned by a different Rabbaanie account on this device. Re-buying is
        // impossible and re-verifying will fail the same way, so name it.
        setBusy(false);
        setError("purchase_foreign");
        return;
      case "unverified": {
        // Paid, but our server would not confirm it. Re-verify — that is the
        // only action that can actually resolve this.
        if (!resyncRef.current) {
          setBusy(false);
          setError("verify_failed");
          return;
        }
        // Cleared BEFORE the resync so that what the ref holds afterwards is
        // produced by this run, not left over from the last one. Reading it
        // without clearing cannot tell "Play has forgotten the purchase" from
        // "Play still has it and the server refused it a second time" — settle()
        // writes the same "unverified" in the second case. That mattered: the
        // stale reading reported verify_gone ("no longer reports that purchase,
        // contact support") to someone whose purchase is very much still there,
        // and then nulled the outcome, so their NEXT tap fell through to
        // requestPurchase(), hit ITEM_ALREADY_OWNED, and told a user who has
        // paid that their purchase could not be completed — the exact sequence
        // this whole outcome ref exists to prevent.
        setOutcome(null);
        try {
          await resyncRef.current();
        } catch {
          setOutcome("unverified");
          setBusy(false);
          setError("verify_failed");
          return;
        }
        // Re-widened deliberately. TypeScript narrows the ref to `null` from the
        // assignment above and cannot see that the awaited resync writes to it
        // through settle(), so without this every case below reads as dead code.
        const afterResync = outcomeRef.current as null | "pending" | "unverified" | "foreign";
        switch (afterResync) {
          case "unverified":
            // Still owned, still refused. Honest retry-later, not "it's gone".
            setBusy(false);
            setError("verify_failed");
            return;
          case "pending":
          case "foreign":
            // settle() already set the matching message for these.
            setBusy(false);
            return;
          default:
            // Nothing came back for this purchase. Either it verified (settle
            // set purchased) or Play no longer reports it at all — refunded,
            // expired, or a different Play account. Either way the button
            // becomes a real Subscribe again rather than looping through an
            // empty resync forever.
            setBusy(false);
            if (!purchasedRef.current) setError("verify_gone");
            return;
        }
      }
    }
    // Only the BUY path needs a live offer and an account tag. The recovery
    // branches above deliberately run without them: a user whose payment failed
    // verification must still be able to retry when Play has stopped offering
    // the product (unreachable store, NO_OFFERS_AVAILABLE, product pulled),
    // which is precisely when they are most stranded.
    const tag = accountTagRef.current;
    if (!offer || !tag) {
      setBusy(false);
      return;
    }
    // From here until this purchase settles, anything the listener receives is
    // the user's own purchase and worth reporting to them. Outside this window
    // the listener is only hearing Play replay what the account already owns.
    buyingRef.current = true;
    try {
      const iap = await loadIap();
      await iap.requestPurchase({
        request: {
          google: {
            skus: [PLAY_PRODUCT_ID],
            subscriptionOffers: [{ sku: PLAY_PRODUCT_ID, offerToken: offer.offerToken }],
            // Without this the server cannot tell whose purchase this is, and
            // rejects it: Google's response says nothing about our user ids, so
            // a token pasted from another account would otherwise entitle this
            // one. The tag is an HMAC the server issues; the client only echoes it.
            obfuscatedAccountId: tag,
          },
        },
        type: "subs",
      });
    } catch {
      buyingRef.current = false;
      setBusy(false);
      setError("purchase_failed");
    }
  }, [enabled, offer]);

  // `enabled` is deliberately not returned: the screen keys its UI off `offer`,
  // which is null on the sideload channel anyway, so a second flag would be one
  // more thing a caller could check instead of the one that matters.
  // `recoverable` is returned separately from `error` because the launch sweep
  // deliberately sets no error — it must not shout at someone who merely opened
  // the screen. But that left a paid, unverified user with NO control when
  // pickAnnualOffer returned null (an empty eligible-offer list, or a product
  // not sold in their country, both documented as normal): the card said
  // "in-app subscribing isn't available here", their money sat with Google, and
  // Google auto-refunded after three days. Ordering the outcome switch above
  // the offer/tag check in purchase() was meant to prevent exactly that, and
  // the UI gate was undoing it.
  return { offer, loading, busy, error, purchased, recoverable, purchase };
}
