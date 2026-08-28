import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";

/**
 * Guards for the Google Play policy requirements that live in client code.
 *
 * Each one exists because removing it is invisible in review — the app still
 * builds, still runs, and still passes every other test, while the Play
 * submission becomes rejectable. They are source-level for the same reason
 * tests/premium-gating.test.ts is: mounting these screens needs native modules.
 */

const root = join(__dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");
// Whitespace-collapsed variant, for assertions that match a multi-token SOURCE
// pattern. Those go red the day prettier breaks a line differently — on code
// that is still correct — and the tempting fix, loosening the pattern until it
// matches, deletes the guard instead. Collapsing runs of whitespace keeps the
// pattern exact and makes it formatter-independent.
//
// NOT applied to read() itself: several assertions here strip `//` comments
// line by line, and removing the newlines breaks that. Use readFlat only where
// the assertion is about a code shape rather than about line structure.
const readFlat = (p: string) => read(p).replace(/\s+/g, " ");

// The real package ships untranspiled and vitest cannot parse it.
vi.mock("expo-constants", () => ({
  default: { expoConfig: { extra: { distribution: "play" } } },
}));
vi.mock("react-native", () => ({ Platform: { OS: "android" } }));
vi.mock("@/hooks/use-subscription", () => ({
  invalidateSubscriptionCache: () => {},
  subscriptionFetch: async () => ({
    ok: true,
    json: async () => ({ ok: true }),
  }),
}));

describe("Play Billing offer selection", () => {
  it("returns nothing when the account is eligible for no offer", async () => {
    const { pickAnnualOffer } = await import("../lib/play-billing");
    // Play returns only offers this account may buy, so an empty list is a
    // normal state (product live, user not eligible) and must read as "cannot
    // buy" rather than crashing on offers[0].
    expect(pickAnnualOffer({ subscriptionOffers: [] })).toBeNull();
    expect(pickAnnualOffer({})).toBeNull();
    expect(pickAnnualOffer(null)).toBeNull();
  });

  it("skips offers with no usable token rather than buying a broken one", async () => {
    const { pickAnnualOffer } = await import("../lib/play-billing");
    expect(
      pickAnnualOffer({
        subscriptionOffers: [
          { offerTokenAndroid: null, displayPrice: "€12.00" },
          { offerTokenAndroid: "", displayPrice: "€12.00" },
          { offerTokenAndroid: "tok-real", displayPrice: "€12,00" },
        ],
      }),
    ).toEqual({ displayPrice: "€12,00", offerToken: "tok-real" });
  });

  it("falls back to the product price when the offer carries none", async () => {
    const { pickAnnualOffer } = await import("../lib/play-billing");
    expect(
      pickAnnualOffer({
        displayPrice: "R$ 60,00",
        subscriptionOffers: [{ offerTokenAndroid: "tok" }],
      }),
    ).toEqual({ displayPrice: "R$ 60,00", offerToken: "tok" });
  });

  it("pins expo-iap to a version Expo SDK 54's Kotlin can compile", () => {
    // 5.1.0 ships openiap-google 3.1.0 (kotlin-stdlib 2.4.10). Expo SDK 54's
    // Kotlin 2.1.0 compiler reads metadata only to 2.2.0, so that combination
    // fails :expo:compileReleaseKotlin five minutes into a Gradle build and is
    // invisible to every other check in this repo. Exact pin, no caret.
    const pkg = JSON.parse(read("package.json"));
    expect(pkg.dependencies["expo-iap"]).toBe("5.0.0");
  });

  it("names the same product id the server verifies against", async () => {
    const { PLAY_PRODUCT_ID } = await import("../lib/play-billing");
    // rabbaanie-api/server/play-billing.ts defaults PLAY_PRODUCT_ID to this and
    // rejects a purchase whose line item is any other product. A rename on one
    // side only would make every purchase fail with "product_mismatch".
    expect(PLAY_PRODUCT_ID).toBe("rabbaanie_annual");
  });
});

describe("payment channel separation", () => {
  it("keeps Stripe checkout off every store build", () => {
    const subscribe = read("app/subscribe.tsx");
    // Linking out to Stripe from a store build is a link to a payment method
    // other than that store's billing — grounds for removal under both
    // Google's and Apple's payments policies, not just rejection.
    //
    // Asserted as "denies unless github", never as "denies when play". The
    // earlier spelling pinned `=== "play"` and was correct for exactly as long
    // as those were the only two channels: adding "apple" left this assertion
    // green while the guard it protects had stopped firing on the strictest
    // platform of the three. A guard that cannot fail is not a guard, so pin
    // the property — default-deny — rather than one enumerated channel.
    expect(subscribe).toMatch(
      /if \(DISTRIBUTION_CHANNEL !== "github"\) return;/,
    );
    // The fail-open spelling must not come back, in any channel's name.
    expect(subscribe).not.toMatch(
      /if \(DISTRIBUTION_CHANNEL === "[a-z]+"\) return;/,
    );
    // Presence too: the sideload build must KEEP its Stripe button. A check
    // that only forbids would pass just as happily if the button were deleted.
    expect(subscribe).toContain('DISTRIBUTION_CHANNEL === "github" ? (');
  });

  it("keeps Play Billing off the sideload build", () => {
    const billing = read("lib/play-billing.ts");
    expect(billing).toContain('DISTRIBUTION_CHANNEL === "play"');
    // The native module must be reached only through a lazy import, so a
    // sideload build never loads Play Billing at all.
    expect(billing).toContain('import("expo-iap")');
    expect(billing).not.toMatch(/^import .* from "expo-iap"/m);
  });

  it("sends the server-issued account tag with every purchase", () => {
    const billing = read("lib/play-billing.ts");
    // Without this the server cannot tell whose purchase it is and rejects it
    // with account_mismatch; a token from another account would otherwise
    // entitle this one.
    expect(billing).toContain("obfuscatedAccountId");
    expect(read("app/subscribe.tsx")).toContain("playAccountTag");
  });

  it("acknowledges restored purchases too, or Google refunds them", () => {
    const billing = read("lib/play-billing.ts");
    // The launch-time sweep must run through settle(), not a bare verify call.
    // A purchase that failed verification once and succeeds on the retry would
    // otherwise be granted a year of access AND auto-refunded by Google after
    // three days, because nothing ever acknowledged it.
    expect(billing).toMatch(
      /for \(const purchase of owned \?\? \[\]\)\s*await settle\(purchase,\s*true\)/,
    );
  });

  it("survives a network failure between paying and verifying", () => {
    const billing = read("lib/play-billing.ts");
    // Losing connectivity right after paying REJECTS the fetch rather than
    // returning a status. Without a catch it escapes as an unhandled rejection
    // and the user watches the spinner stop with nothing explaining why.
    expect(billing).toMatch(/}\s*catch\s*{[\s\S]*?setError\("verify_failed"\)/);
    // Both distinct failure modes must surface it: a rejected fetch (above) and
    // a server that answered but refused the purchase (below). Asserted as two
    // patterns rather than a count of occurrences — a count breaks the moment a
    // third, legitimate call site is added, which is exactly what happened when
    // the retry path landed.
    // Sliced, not regex-matched, for the same reason as the delete assertion
    // below: [\s\S]*? runs past the block and matches the outer catch's
    // setError instead, staying green with this one deleted.
    const okStart = billing.indexOf("if (!ok) {");
    expect(okStart).toBeGreaterThan(-1);
    const okBranch = billing.slice(
      okStart,
      billing.indexOf("iap.finishTransaction", okStart),
    );
    expect(okBranch).toContain('setError("verify_failed")');
  });

  it("keeps the purchase outcome and its UI mirror impossible to drift apart", () => {
    const billing = read("lib/play-billing.ts");
    // `recoverable` exists so the screen can offer a recovery control the ref
    // cannot expose. Maintained as two statements, they drifted immediately: a
    // setRecoverable(false) meant to accompany the verify_gone clear was simply
    // absent, so the flag stayed true with no outcome behind it. The next tap
    // read that as a recovery, skipped the subscriber-details check AND the POST
    // that saves them, and bought a real membership with nothing on record.
    //
    // One writer, enforced here: every assignment goes through setOutcome.
    expect(billing).toContain("const setOutcome = (value: Outcome) => {");
    // Comments stripped first: the explanation above names both symbols, and
    // counting prose as code made this assertion fail on its own documentation.
    const body = billing
      .slice(billing.indexOf("export function usePlayBilling"))
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
    const rawWrites = body.match(/outcomeRef\.current\s*=/g) ?? [];
    // Exactly one: the assignment inside setOutcome itself.
    expect(rawWrites.length).toBe(1);
    // And nothing else may poke the mirror directly either.
    const rawFlag = body.match(/setRecoverable\(/g) ?? [];
    expect(rawFlag.length).toBe(1);
  });

  it("resets on the account, not on the tag's arrival", () => {
    const billing = read("lib/play-billing.ts");
    // Keying the reset on the tag forced a choice between two failures: reset on
    // every change and the initial undefined -> tag fill erases a diagnosis the
    // launch sweep just produced; skip that transition and an account whose
    // /status never succeeded hands its outcome, settled tokens and purchased
    // flag to the NEXT account, whose tag arrives as the same transition. The
    // uid changes exactly once per switch and never for a late tag.
    expect(billing).toContain(
      "usePlayBilling(accountTag: string | undefined, userId: number | undefined)",
    );
    expect(billing).toMatch(
      /markPurchased\(false\);\s*setError\(null\);\s*\}, \[userId\]\);/,
    );
    expect(read("app/subscribe.tsx")).toContain(
      "usePlayBilling(status?.playAccountTag, uid)",
    );
  });

  it("offers recovery only for failures that could actually resolve", () => {
    const billing = read("lib/play-billing.ts");
    // Google saying "expired" or "wrong product" is a definitive no. Treating
    // those like a transient failure made the launch sweep offer its
    // paid-but-unverified recovery to someone who never paid, and turned their
    // first Subscribe tap into a resync instead of a purchase.
    expect(billing).toContain("const DEFINITIVE_REJECTIONS = new Set([");
    for (const reason of ["expired", "product_mismatch", "no_line_items"]) {
      expect(billing).toContain(`"${reason}"`);
    }
    expect(billing).toContain(
      'DEFINITIVE_REJECTIONS.has(reason) || reason.startsWith("state_")',
    );
  });

  it("treats a verify that never answered like one that refused", () => {
    const billing = read("lib/play-billing.ts");
    // A rejected fetch and a server that says no leave the user in the same
    // place — paid, unverified — so they must leave the SAME state behind, not
    // just the same message. Setting only the message (which this path did) is
    // the one way to reach "verify_failed" with a null outcome, and then:
    //   a re-tap skips the resync, calls requestPurchase for a subscription
    //   Play already owns, and answers ITEM_ALREADY_OWNED as "the purchase
    //   could not be completed" — to someone who has paid;
    //   the token stays deduped, so Play re-delivering it in this session hits
    //   the has(token) early return and nothing happens at all.
    const catchAt = billing.indexOf("Losing connectivity right after paying");
    expect(catchAt).toBeGreaterThan(-1);
    const block = billing.slice(
      catchAt,
      billing.indexOf("} finally {", catchAt),
    );
    expect(block).toContain("settledRef.current.delete(token);");
    expect(block).toContain('setOutcome("unverified");');
    expect(block).toContain('setError("verify_failed")');
  });

  it("can always recover a paid-but-unverified purchase", () => {
    const billing = read("lib/play-billing.ts");
    // The silent launch sweep sets no error, so after a remount the only signal
    // that a paid purchase never verified is this ref. Without it a Subscribe
    // tap falls through to requestPurchase for a subscription Play already owns
    // — ITEM_ALREADY_OWNED, shown as "purchase could not be completed", to
    // someone who has paid.
    expect(billing).toContain('setOutcome("unverified");');
    expect(billing).toContain('case "unverified": {');
    // purchase() must handle every state Play can already be in. requestPurchase
    // is only correct when Play holds nothing: in any other state it fails with
    // ITEM_ALREADY_OWNED and overwrites an accurate message with a wrong one.
    for (const state of [
      'case "pending":',
      'case "foreign":',
      'case "unverified": {',
    ]) {
      expect(billing).toContain(state);
    }
    // A resync that finds nothing must clear the state, or the button loops
    // through an empty resync forever with no way left to buy.
    expect(billing).toContain('setError("verify_gone");');
    // And it must release the spinner even when Play reports nothing owned —
    // an empty list never enters settle(), which is what clears it.
    const resyncAt = billing.indexOf("resyncRef.current = async () => {");
    expect(resyncAt).toBeGreaterThan(-1);
    expect(billing.slice(resyncAt, resyncAt + 900)).toContain("} finally {");
    // Recovery must not depend on Play still offering the product: a user whose
    // payment failed verification is most stranded exactly when the store is
    // unreachable or the product was pulled. The offer/tag requirement belongs
    // to the buy path, below the outcome switch.
    const purchaseAt = billing.indexOf("const purchase = useCallback");
    const switchAt = billing.indexOf("switch (outcomeRef.current)", purchaseAt);
    const tagCheckAt = billing.indexOf("if (!offer || !tag)", purchaseAt);
    expect(switchAt).toBeGreaterThan(-1);
    expect(tagCheckAt).toBeGreaterThan(switchAt);
    // Ordering alone is not enough — an *additional* early return above the
    // switch re-strands the user while leaving the original check in place.
    // Assert nothing between the function head and the switch mentions `offer`.
    expect(billing.slice(purchaseAt, switchAt)).not.toMatch(/\boffer\b/);
    // And the control that triggers it has to be on screen in that state —
    // including the silent one. The launch sweep sets no error, so gating the
    // button on the error string alone left a paid user with no control at all
    // whenever pickAnnualOffer returned null (empty eligible-offer list, or the
    // product not sold in their country — both normal). `recoverable` is the
    // hook's separate signal for exactly that case.
    expect(billing).toContain("recoverable");
    const screen = readFlat("app/subscribe.tsx");
    expect(screen).toContain(
      'play.error === "verify_failed" || play.recoverable ? (',
    );
    // A live purchase rejected as another account's must not be silent.
    // Bounded by the NEXT branch's marker rather than a character count: the
    // count version broke the moment a comment grew, and the tempting fix is to
    // raise the number, which quietly lets the assertion match a setError from a
    // different branch entirely.
    const foreignAt = billing.indexOf('reason === "account_mismatch"');
    expect(foreignAt).toBeGreaterThan(-1);
    const nextBranchAt = billing.indexOf('setOutcome("unverified")', foreignAt);
    expect(nextBranchAt).toBeGreaterThan(foreignAt);
    expect(billing.slice(foreignAt, nextBranchAt)).toContain(
      'setError("purchase_foreign")',
    );
  });

  it("does not carry one account's subscriber details into another's purchase", () => {
    const subscribe = readFlat("app/subscribe.tsx");
    // These fields gate infoComplete, which authorizes the Play purchase. Left
    // unguarded, a new user inherits the previous account's name/address/phone
    // and their membership is bought against someone else's details.
    expect(subscribe).toContain("infoRequestFor.current !== uid");
    expect(subscribe).toContain('setFirstName(""); setLastName("");');
    // Assert the reset clears EVERY carried field, not just the two it began
    // with. `extras` holds the previous account's kunya/gender; for a next user
    // with no stored record the `if (d)` branch never runs, so anything left
    // here is written into THEIR subscriber record on the first save. Checking
    // only the name fields let that pass with every test green.
    // Scoped to the [uid] effect, and asserted one statement at a time. Both
    // matter: searching the whole file would stay green if these moved out of
    // the reset (where they no longer guard an account switch at all), and
    // pinning the block as one string would fail on a harmless reorder — after
    // which the tempting fix is to loosen it and lose the guard entirely.
    // The end marker is searched FROM the start index, not from 0: `}, [uid]);`
    // also closes the loadStatus callback further up, so an unanchored search
    // slices backwards and yields an empty string that matches nothing.
    const resetStart = subscribe.indexOf("setStatus(null);");
    const resetEnd = subscribe.indexOf("}, [uid]);", resetStart);
    // Both indices asserted before slicing: a missing end marker yields -1, and
    // slice(start, -1) then spans the rest of the file — the scoping this test
    // depends on would vanish while every assertion below still passed.
    expect(resetStart).toBeGreaterThan(-1);
    expect(resetEnd).toBeGreaterThan(resetStart);
    const reset = subscribe.slice(resetStart, resetEnd);
    // Every field carried across an account switch, including maritalStatus:
    // a stale value there reads as filled in while selecting no chip, so the
    // next user submits a status the server refuses.
    // setCoupon is in the list because a code typed under one account stayed in
    // the box across a switch and could be redeemed into the next one.
    for (const cleared of [
      'setFirstName("")',
      'setLastName("")',
      'setMaritalStatus("")',
      'setStreetHouseNumber("")',
      'setCity("")',
      'setCountry("")',
      "setExtras({})",
      "setInfoLoaded(false)",
      'setCoupon("")',
    ]) {
      expect(reset, `account switch must clear ${cleared}`).toContain(cleared);
    }
  });

  it("leaves a not-yet-paid purchase alone", () => {
    // Slow payment methods deliver a real token before money moves. Verifying
    // it fails server-side and then tells the user their payment "went through"
    // and they "will not be charged again" — both false.
    expect(read("lib/play-billing.ts")).toContain(
      'purchase?.purchaseState === "pending"',
    );
  });

  it("requires subscriber details before opening Play's payment sheet", () => {
    // The Stripe and coupon paths both refuse without them; a Play membership
    // bought without them leaves an account that cannot be serviced.
    //
    // Anchored on the call it guards, not on "if (!infoComplete) { setMsg(" —
    // that string appears four times in this file (saveInfo, subscribe, redeem,
    // and here), so matching it alone passed even with the Play check deleted.
    // Caught by deliberately removing the guard and watching this test stay green.
    // The Play path must both CHECK the details and PERSIST them: verify-play
    // posts only the purchase token, so unlike the Stripe and coupon paths
    // nothing else carries the fields to the server. Typing them and tapping
    // Subscribe without tapping Save used to buy a membership with no name,
    // address or phone on record.
    const subscribeSrc = readFlat("app/subscribe.tsx");
    expect(subscribeSrc).toContain("async function persistInfo()");
    // The erasure protection: persistInfo must consult what is already stored
    // and bail when that is unknown. Asserted inside persistInfo's own body and
    // as two independent facts rather than one pinned line — a formatting-exact
    // regex would break on a behaviour-preserving edit, and the tempting repair
    // is to loosen it until it guards nothing.
    const persistStart = subscribeSrc.indexOf("async function persistInfo()");
    const persistEnd = subscribeSrc.indexOf(
      "async function saveInfo()",
      persistStart,
    );
    expect(persistEnd).toBeGreaterThan(persistStart);
    const persist = subscribeSrc.slice(persistStart, persistEnd);
    expect(persist).toContain("await currentExtras()");
    expect(persist).toMatch(/if \(!ex\)\s*return/);
    // The retry must read the stored record WITHOUT refilling the inputs.
    // Letting it refill replaced what the user had just typed while the POST
    // still sent the typed values, so they saw "saved ✓" beside a reverted
    // form — and a stale stored status cleared the chip, so the next Save
    // wrote the old details back over the ones just persisted.
    const extrasStart = subscribeSrc.indexOf("async function currentExtras()");
    expect(extrasStart).toBeGreaterThan(-1);
    expect(subscribeSrc.slice(extrasStart, persistStart)).toContain(
      "loadInfo(false)",
    );
    // All three submits must build their body through the shared builder, and
    // none may reintroduce a flat `address`. Hand-building one of these bodies
    // is the precise drift that refused every payment path for five days, and
    // nothing else in the suite would notice it coming back.
    expect(
      (subscribeSrc.match(/buildSubscriberInfo\(fields,/g) || []).length,
    ).toBe(3);
    expect(subscribeSrc).not.toMatch(/\baddress:/);
    // The result must be USED: a failed POST that still opens Play's sheet
    // reproduces the exact "membership with no details on record" this prevents.
    expect(subscribeSrc).toContain("const saved = await persistInfo();");
    // The rule has exactly ONE exception, and it is asserted rather than
    // implied: a verify_failed retry starts no purchase, so demanding a details
    // POST there strands the user whose network is the reason verification
    // failed in the first place. Anything else reaching play.purchase() without
    // the details is the bug this test exists for.
    // Anchored from the call outwards, not on the handler's opening characters.
    // Pinning "onPress={async () => { if (play.error !== " meant any statement
    // added before that `if` silently emptied this slice, and every assertion
    // below then passed against "" — the guard reporting success having checked
    // nothing. Found when a refusal message was routed to a different state.
    const pressEnd = subscribeSrc.indexOf("play.purchase(); }}");
    expect(
      pressEnd,
      "play.purchase() call moved - anchor is stale",
    ).toBeGreaterThan(-1);
    const pressStart = subscribeSrc.lastIndexOf(
      "onPress={async () =>",
      pressEnd,
    );
    expect(
      pressStart,
      "no onPress handler encloses play.purchase()",
    ).toBeGreaterThan(-1);
    const press = subscribeSrc.slice(pressStart, pressEnd);
    expect(press.length).toBeGreaterThan(0);
    // Inside the guarded block: a failed POST must return, never fall through.
    // persistInfo returns { ok, message } rather than a bare boolean, so that
    // a refusal can carry the server's reason to the buyer. `.ok` is asserted
    // here deliberately: `if (!saved)` on an object is never true, so the old
    // spelling would have read as a guard while letting every failed save
    // through to Play's payment sheet.
    expect(press).toMatch(/if \(!saved\.ok\) \{[\s\S]*?return;\s*\}/);
    // And the ONLY thing allowed to skip that block is the retry condition.
    // Matched as a pattern, not a literal: collapsing whitespace is not enough
    // here because prettier ADDS spaces inside the parens when it wraps a long
    // condition (`if (\n  a && b\n)` → `if ( a && b )`). The content is still
    // asserted exactly — both operands, the negation and the conjunction — only
    // the spacing is free.
    expect(press).toMatch(
      /if \(\s*play\.error !== "verify_failed" && !play\.recoverable\s*\) \{/,
    );
    expect(press).toContain("if (!infoComplete)");
  });

  it("treats Play's connection-open flush as a restore, not a live purchase", () => {
    const billing = read("lib/play-billing.ts");
    // Play replays every purchase the account already owns into
    // purchaseUpdatedListener the moment the connection opens. Passing those
    // through the live path shows "Payment went through but could not be
    // confirmed yet" to someone who merely opened the screen.
    expect(billing).toContain("void settle(purchase, !buyingRef.current);");
    // The flush and the getAvailablePurchases sweep deliver the same tokens
    // seconds apart; without the dedupe each is verified and acknowledged twice.
    expect(billing).toContain("settledRef.current.has(token)");
  });

  it("does not close the billing connection on unmount", () => {
    const billing = read("lib/play-billing.ts");
    // An un-awaited endConnection() races the next mount's initConnection().
    // If the stale close lands last, the new mount has listeners and no
    // connection, and a flushed purchase is delivered to nothing —
    // unacknowledged, so refunded after three days. A leaked connection is
    // benign; the race is not.
    expect(billing).not.toMatch(/iap\.endConnection\(\)/);
  });

  it("does not report a failed acknowledgement as a failed payment", () => {
    const billing = read("lib/play-billing.ts");
    // Entitlement is already granted by then, so "we could not confirm your
    // payment" would be false. The token is released so the next sweep retries
    // the acknowledgement before Google's three-day refund window closes.
    //
    // BOTH failure paths must release it, asserted separately: the string
    // appears twice, so a plain toContain stays green when either one is
    // deleted. Left marked, a re-delivered token hits the dedupe early return,
    // which clears the spinner and shows nothing at all.
    // Sliced to the block rather than matched with [\s\S]*? — that pattern runs
    // straight past the closing brace and matches the OTHER path's delete, so it
    // stayed green with this one removed. Found by baiting it.
    const okAt = billing.indexOf("if (!ok) {");
    expect(okAt).toBeGreaterThan(-1);
    const verifyFailureBlock = billing.slice(
      okAt,
      billing.indexOf("iap.finishTransaction", okAt),
    );
    expect(verifyFailureBlock).toContain("settledRef.current.delete(token);");
    expect(billing).toMatch(
      /\}\s*catch\s*\{\s*settledRef\.current\.delete\(token\)/,
    );
  });

  it("gates child-home usage collection on the channel, not on luck", () => {
    const home = read("app/child-account/home.tsx");
    // This is the one that would actually put PACKAGE_USAGE_STATS collection
    // into a Play artifact. With the route-level channel block gone, the only
    // other thing stopping it is the native module being excluded from Gradle
    // autolinking — an accident of app.config.ts, not a stated invariant. Any
    // edit to withPlayMonitoringDisabled would silently switch collection on.
    expect(home).toContain(
      "if (CHILD_MONITORING_ENABLED && isNativeModuleAvailable()) {",
    );
  });

  it("does not dedupe a pending purchase's token before it can settle", () => {
    const billing = read("lib/play-billing.ts");
    // Play re-delivers the SAME token once a slow payment clears. Marking it
    // settled before the pending check would drop that re-delivery: never
    // verified, never acknowledged, refunded after three days. The add must sit
    // after the pending guard.
    const pendingAt = billing.indexOf('purchase?.purchaseState === "pending"');
    const addAt = billing.indexOf("settledRef.current.add(token);");
    expect(pendingAt).toBeGreaterThan(-1);
    expect(addAt).toBeGreaterThan(pendingAt);
  });

  it("keeps the child-mode setup path reachable on Play", () => {
    // parent-monitor is the only client call site of childAccount.create and the
    // only screen that shows a child's access code / QR. If its three entry
    // points are ever channel-gated again, a Play parent can open the child
    // login and be asked for a code nothing in that build can issue.
    expect(read("app/child-account/parent-monitor.tsx")).toContain(
      "trpc.childAccount.create.useMutation",
    );
    for (const f of [
      "app/(tabs)/family.tsx",
      "app/(tabs)/weekly.tsx",
      "app/(tabs)/messages.tsx",
    ]) {
      const src = read(f);
      // Anchored on the link itself, not on a blanket ban of the flag name:
      // these are three of the app's largest screens and a future
      // monitoring-specific use of the flag in them would be legitimate.
      expect(src).toContain("child-account/parent-monitor?childId=");
      expect(src).not.toMatch(
        /\{CHILD_MONITORING_ENABLED && \([\s\S]{0,400}child-account\/parent-monitor/,
      );
    }
  });

  it("only finishes a transaction after the server verified it", () => {
    const billing = read("lib/play-billing.ts");
    const verifyAt = billing.indexOf("await verifyWithServer(token)");
    const finishAt = billing.indexOf("iap.finishTransaction");
    expect(verifyAt).toBeGreaterThan(-1);
    expect(finishAt).toBeGreaterThan(verifyAt);
    // Finishing an unverified purchase acknowledges it to Google, which stops
    // the automatic refund and hands out entitlement the server never confirmed.
    expect(billing).toContain("if (!ok) {");
  });
});

describe("Play policy surfaces", () => {
  it("discloses AI generation in all three languages", () => {
    const component = read("components/report-ai-content.tsx");
    // Play requires apps that generate content with AI to say so in-app, not
    // only in the listing. Paired with the report control so a new AI surface
    // cannot ship with one and not the other.
    expect(component).toContain("disclosure:");
    expect(component).toContain("{text.disclosure}");
    expect(component.match(/disclosure:/g)?.length).toBe(3);
  });

  it("offers AI reporting on the home tab's generated check-in", () => {
    const card = read("components/daily-diagnostic-card.tsx");
    // server/daily-diagnostic.ts puts these questions through the model
    // whenever source is "generated", and this card renders q.text and every
    // option label verbatim — on the home tab, the first screen a reviewer
    // sees after login. Play's AI-Generated Content policy requires in-app
    // reporting on AI output. The test above only proves the control CAN
    // disclose in three languages; it never checked that a given surface
    // actually mounts one, which is how this shipped without it.
    expect(card).toContain("ReportAiContent");
    expect(card).toContain('surface="daily-diagnostic"');
    // Gated on the generated source on purpose: the fallback question set is
    // ours, and inviting a report on our own copy as "AI output" is wrong.
    expect(card).toMatch(/source === "generated"/);
  });

  it("discloses the partner sharing before the check-in is answered", () => {
    const card = read("components/daily-diagnostic-card.tsx");
    // These answers cover prayer, psychological and physical state, and they
    // feed the advice the OTHER spouse receives. Play's User Data policy
    // expects that secondary use disclosed in-app at the point of collection.
    // It shipped stated only in a source comment, which no user ever reads.
    expect(card).toContain("s.notice");
    // In all three languages, like every other user-facing string in this card.
    expect(card).toMatch(/uw partner/i);
    expect(card).toMatch(/your partner/i);
    expect(card).toContain("شريكك");
  });

  it("reaches the privacy policy from inside the app", () => {
    const settings = read("app/(tabs)/settings.tsx");
    // Mandatory in-app, not only on the store listing, for any app collecting
    // personal or sensitive data — which this one does extensively.
    expect(settings).toContain('path: "privacy"');
    expect(settings).toContain('path: "terms"');
    expect(settings).toContain('path: "account-deletion"');
    expect(settings).toContain("openBrowserAsync");
  });

  it("never prints a euro price on Play that Play did not supply", () => {
    const screen = read("app/subscribe.tsx");
    // Play sets the price per country and folds in local tax, so a hardcoded
    // €12 shown while the offer loads — or permanently, when it cannot load —
    // is the Stripe price quoted to a Play user. That is the discrepancy this
    // whole change exists to remove, and a fallback quietly reintroduced it.
    const playBranches = [
      ...screen.matchAll(
        /play\.offer \? play\.offer\.displayPrice : "([^"]*)"/g,
      ),
    ];
    expect(playBranches.length).toBeGreaterThan(0);
    for (const branch of playBranches) expect(branch[1]).not.toContain("€");
  });

  it("gives Play subscribers a link to manage their subscription", () => {
    const screen = readFlat("app/subscribe.tsx");
    // Play's subscription guidance: the app "should include a link on a
    // settings or preferences screen that allows users to manage their
    // subscriptions". The purchase card's prose about where to cancel is not
    // that link, and it only renders before buying — a subscriber never sees it.
    expect(screen).toContain(
      "https://play.google.com/store/account/subscriptions",
    );
    // Sideload has no Play subscription to manage; its Stripe membership is
    // cancelled on the website, so the link must not render there.
    const link = screen.slice(
      0,
      screen.indexOf("https://play.google.com/store/account/subscriptions"),
    );
    // Android too, not just the Play channel. DISTRIBUTION_CHANNEL fails closed
    // to "play" for anything not built as github, so an iOS or web build was
    // offering subscribers a link to manage a Google Play subscription they
    // cannot possibly hold.
    expect(
      link.lastIndexOf(
        'DISTRIBUTION_CHANNEL === "github" || Platform.OS !== "android" ? null : (',
      ),
    ).toBeGreaterThan(link.lastIndexOf("</View>"));
  });

  it("carries the not-a-medical-device disclaimer", () => {
    // Play's Health Content policy: an app with health-adjacent features that
    // is not a cleared medical device must say so.
    expect(read("app/(tabs)/settings.tsx")).toContain(
      "not a medical device and does not diagnose, treat, cure, or prevent any medical condition",
    );
  });

  it("undoes the Play autolinking exclusion on the sideload channel", () => {
    const config = read("app.config.ts");
    // The plugin used to `return config` on github, which only looks like a
    // no-op. android/ is reused unless --clean is passed, so a Play prebuild
    // followed by a github one left `expoAutolinking.exclude` behind and the
    // sideload APK shipped with no usage-stats module, no PACKAGE_USAGE_STATS
    // and no isMonitoringTool. It built, installed and ran; it just could not
    // monitor. Confirmed against a real artifact, not imagined.
    const githubBranch = config.slice(
      config.indexOf("if (isGithubBuild) {"),
      config.indexOf("const withoutNativeMonitoring"),
    );
    expect(githubBranch).toContain("withSettingsGradle");
    expect(githubBranch).toContain("filter");
    expect(githubBranch).toContain("AUTOLINK_EXCLUSION");
    // And the sideload gate must assert the capability is PRESENT — the mirror
    // of the Play gate asserting BILLING is present. A gate that only checks
    // what must be absent lets a feature disappear silently.
    const gate = read("scripts/assert-sideload-artifact.sh");
    expect(gate).toContain("PACKAGE_USAGE_STATS");
    expect(gate).toContain("isMonitoringTool");
    expect(gate).toContain("usagestats");
  });

  it("never sends a Play user to an APK download outside Play", () => {
    const screen = read("components/version-block-screen.tsx");
    // AuthGate mounts this ahead of every other gate and it cannot be
    // dismissed, so its single button is the only way out. Pointed at the APK
    // page it is a sideload funnel shown to every Play user the server
    // refuses — the same Device-and-Network-Abuse policy that keeps
    // UPDATER_ENABLED off on this channel (hooks/use-updates.ts).
    expect(screen).toContain('DISTRIBUTION_CHANNEL === "play"');
    expect(screen).toContain("https://play.google.com/store/apps/details");
    // Presence too, not only absence: the sideload build must KEEP its APK
    // link. Deleting the URL would satisfy a Play-only check while stranding
    // every github user with no way to update.
    expect(screen).toContain("https://rabbaanie.com/?p=app");
    // And the APK page must sit on the github side of the branch — never the
    // value a Play build resolves to.
    const playBranch = screen.slice(
      screen.indexOf('DISTRIBUTION_CHANNEL === "play"'),
      screen.indexOf("https://rabbaanie.com/?p=app"),
    );
    expect(playBranch).toContain("https://play.google.com/store/apps/details");
  });

  it("declares no location foreground service it never starts", () => {
    const config = read("app.config.ts");
    // expo-location merges a LocationTaskService with
    // foregroundServiceType="location" into every build. This app only calls
    // requestForegroundPermissionsAsync and getCurrentPositionAsync — no
    // startLocationUpdatesAsync, no geofencing, and the only TaskManager task
    // is the widget refresh — so it is never started. Declared, it obliges a
    // Play Console foreground-service declaration for the location type, the
    // most closely scrutinised, with no truthful justification available.
    expect(config).toContain(
      "expo.modules.location.services.LocationTaskService",
    );
    expect(config).toContain('"tools:node": "remove"');
    // And the artifact gate must check the removal actually survived, since a
    // config plugin that stops matching fails silently.
    expect(read("scripts/assert-play-artifact.sh")).toContain(
      "LocationTaskService",
    );
  });

  it("shows no screen-time figures anywhere on the Play build", () => {
    const monitor = read("app/child-account/parent-monitor.tsx");
    // Not just the Apps tab. `totalAppUsageSeconds` also fed a usage-time tile,
    // a 7-day screen-time bar chart and a weekly minutes total on the DEFAULT
    // tab of parent-monitor, so removing the route-level channel block put a
    // screen-time dashboard in front of every Play user and every Play
    // reviewer while the Console declaration says the build has no monitoring
    // UI. Nothing collects the numbers on Play either, so it rendered 0 min and
    // an empty chart: a surveillance surface that is also broken.
    //
    // Enclosure is computed, not guessed. Proximity ("is there a gate above
    // this line?") passed when a gate was deleted, because it found the
    // PREVIOUS block's gate. Counting does not work either — one line names the
    // identifier twice. So: find each gate's real span by matching its
    // parenthesis, then require every reference to fall inside one.
    const spans: Array<[number, number]> = [];
    const opener = "CHILD_MONITORING_ENABLED && (";
    for (
      let i = monitor.indexOf(opener);
      i !== -1;
      i = monitor.indexOf(opener, i + 1)
    ) {
      let depth = 0;
      for (let j = i + opener.length - 1; j < monitor.length; j++) {
        if (monitor[j] === "(") depth++;
        else if (monitor[j] === ")") {
          depth--;
          if (depth === 0) {
            spans.push([i, j]);
            break;
          }
        }
      }
    }
    expect(spans.length).toBeGreaterThan(0);
    const refs = [...monitor.matchAll(/totalAppUsageSeconds/g)].map(
      (m) => m.index!,
    );
    expect(refs.length).toBeGreaterThan(0);
    const ungated = refs
      .filter((at) => !spans.some(([open, close]) => at > open && at < close))
      .map((at) => `line ${monitor.slice(0, at).split("\n").length}`);
    expect(ungated).toEqual([]);
  });

  it("keeps the app-usage monitoring screen out of the Play build", () => {
    const screen = read("app/child-account/usage-permission.tsx");
    // The <Redirect> alone is not enough: hooks cannot be skipped, so both
    // effects run BEFORE it — probing the native module and attaching an
    // AppState listener. On Play they were inert only because the module is
    // absent, which is an accident of the autolinking exclusion rather than a
    // decision, and child-account/home.tsx explicitly refuses to rely on it.
    // Each effect states the channel invariant itself.
    const effects = [...screen.matchAll(/useEffect\(\(\) => \{/g)].map(
      (m) => m.index!,
    );
    const probing = effects.filter((at) =>
      /checkPermission\(\)|runNoticeGatedCollection|permissionGranted/.test(
        screen.slice(at, at + 700),
      ),
    );
    expect(probing.length).toBeGreaterThan(0);
    for (const at of probing) {
      expect(screen.slice(at, at + 700)).toContain(
        "if (!CHILD_MONITORING_ENABLED) return;",
      );
    }
    // Child mode itself ships on both channels — the child holds no account and
    // enters from a signed-in adult's session. Only PACKAGE_USAGE_STATS
    // monitoring is sideload-only, and a Play reviewer finding a "grant usage
    // access" flow is the exact stalkerware signature the build avoids.
    expect(screen).toContain("if (!CHILD_MONITORING_ENABLED) return <Redirect");
    // parent-monitor gates the app-usage tab ONLY. Gating the whole screen was
    // tried and reverted: it is also the only screen that creates a child
    // account and shows its access code, so blocking it left the Play build
    // advertising child mode with no way to set it up.
    const monitor = read("app/child-account/parent-monitor.tsx");
    expect(monitor).toMatch(
      /enabled:\s*CHILD_MONITORING_ENABLED && childAccountId > 0 && activeTab === "apps"/,
    );
    expect(monitor).toContain(
      'CHILD_MONITORING_ENABLED && activeTab === "apps" && renderApps()',
    );
    expect(monitor).not.toContain(
      "if (!CHILD_MONITORING_ENABLED) return <Redirect",
    );
  });

  it("opens child mode on both channels, behind the adult session", () => {
    const gate = read("lib/age-gate.tsx");
    // The blanket channel block on /child-account/* is deliberately gone; what
    // keeps it compliant is that it sits behind isAuthenticated like everything
    // else. Re-adding a per-channel branch here would silently take the feature
    // back off the Play build. Matched on the routing expression rather than
    // the flag name, so the comment explaining the removal does not satisfy it.
    expect(gate).not.toContain('segment === "child-account"');
    expect(gate).toContain(
      'if (!isAuthenticated && !inAuthGroup) return "/login";',
    );
  });
});

describe("AI chat attachments are sideload-only and actually send the image", () => {
  const chat = readFileSync("app/ai-chat.tsx", "utf8");

  it("gates both the attach trigger and the attach menu on the channel", () => {
    // Two gates, not one: hiding only the trigger leaves the menu renderable if
    // showAttachMenu is ever set by another path, and the menu is what holds
    // the camera and library actions.
    // Asserted on a named symbol, not on how far apart two strings sit. The
    // first version measured a byte distance between the gate and
    // styles.attachButton, which is exactly the formatting-coupled assertion
    // that breaks on a reformat and tempts someone to loosen it.
    expect(chat).toMatch(
      /const ATTACHMENTS_ENABLED = DISTRIBUTION_CHANNEL === "github"/,
    );
    expect(chat, "the attach MENU must be gated").toContain(
      "{ATTACHMENTS_ENABLED && showAttachMenu &&",
    );
    // Ordering, not layout. The previous regex required a newline and specific
    // indentation between the gate and <Pressable>, so a reformat would have
    // "failed" correct code — the coupled-to-formatting assertion this codebase
    // keeps warning about. What must hold is that a gate opens before the
    // attach button and there are exactly two gates, one per element.
    // Both specific elements, not a count. toBe(2) failed the moment a third
    // legitimately-gated element was added, which turns a guard into an
    // obstacle and invites someone to relax it.
    expect(chat, "the attach MENU must be gated").toContain(
      "{ATTACHMENTS_ENABLED && showAttachMenu &&",
    );
    expect(chat, "the attach TRIGGER must be gated").toContain(
      "{ATTACHMENTS_ENABLED && (",
    );
    expect(chat.indexOf("styles.attachButton")).toBeGreaterThan(
      chat.indexOf("{ATTACHMENTS_ENABLED && ("),
    );
    expect(chat).toContain("import { DISTRIBUTION_CHANNEL }");
  });

  it("sends the picture, not its filename", () => {
    // The defect this replaces: every attachment was flattened to
    // `[صورة مرفقة: <name>]` and the model received a filename, so any answer
    // about an attached photo was invented. Assert the real payload exists.
    expect(chat).toMatch(/images:\s*imageDataUrls\.length > 0/);
    expect(chat).toContain("base64: true");
    // The filename text may still be produced, but only for attachments that
    // carry no bytes — never as the sole representation of an image.
    expect(chat).toMatch(/undescribed|!a\.dataUrl/);
  });

  it("never persists or re-uploads the image bytes", () => {
    // The picture is transient input to the model, not conversation history.
    // cleanMessages feeds BOTH the AsyncStorage write and the POST to
    // saveConversationToDb, and it stripped `uri` but not the new `dataUrl` —
    // so a multi-MB base64 image was written to a store capped at 6 MB for the
    // whole app (shared with the weekplan caches and the device id) and
    // re-uploaded on every later message of the conversation. Photographs of
    // children are the last thing to retain by accident.
    // Anchored on the mapping expression, not on a byte window from
    // "const cleanMessages" — the explanatory comment above it is long enough
    // to push the real line out of any fixed window, which is how the first
    // version of this test failed on correct code.
    const from = chat.indexOf("attachments: m.attachments?.map(");
    expect(
      from,
      "the attachment sanitiser moved - anchor is stale",
    ).toBeGreaterThan(-1);
    const mapping = chat.slice(from, chat.indexOf("\n", from));
    expect(mapping, "must clear uri").toMatch(/uri:\s*""/);
    expect(mapping, "must clear dataUrl as well as uri").toMatch(
      /dataUrl:\s*undefined/,
    );
  });
});

/**
 * "No in-app updater on Play" is not the same as "no way to update on Play".
 *
 * Two entry points ask this app to update itself and only one of them was ever
 * gated. Settings hides its button (UPDATER_ENABLED), but a push notification
 * of type app_update calls checkForUpdate() directly
 * (hooks/use-push-notifications.ts) — so on the Play build the call fell into
 * the branch meant for non-Android platforms and told an Android user
 * "Updates are only available in the Android app", with no way forward.
 *
 * Play's own listing is the sanctioned route, and the one this app already
 * uses when the server refuses a build as too old
 * (components/version-block-screen.tsx). Both entry points open it now.
 */
describe("Play-friendly update path", () => {
  const loadUpdates = async (distribution: string, os = "android") => {
    vi.resetModules();
    vi.stubGlobal("__DEV__", false);
    const openURL = vi.fn(async (_url: string) => true);
    const alert = vi.fn();
    vi.doMock("expo-constants", () => ({
      default: { expoConfig: { extra: { distribution }, version: "1.6.0" } },
    }));
    vi.doMock("react-native", () => ({
      Alert: { alert },
      Linking: { openURL },
      Platform: { OS: os },
    }));
    vi.doMock("expo-application", () => ({
      nativeApplicationVersion: "1.6.0",
    }));
    // Nothing on the Play path touches the filesystem or the installer intent;
    // these exist only so the module's imports resolve.
    vi.doMock("expo-file-system/legacy", () => ({}));
    vi.doMock("expo-intent-launcher", () => ({}));
    return { mod: await import("@/hooks/use-updates"), openURL, alert };
  };

  // loadUpdates' doMock of "react-native" OVERRIDES the file-level vi.mock at
  // the top of this file, and a doMock outlives the test that registered it.
  // Today that is invisible only because this describe is last — a describe
  // appended below would silently receive this three-property stub instead of
  // the file's, and fail for a reason that has nothing to do with it.
  afterAll(() => {
    // Restored, not unmocked: vi.doUnmock disables the file-level vi.mock too,
    // and the real react-native package ships untranspiled, so the next import
    // dies on a parse error instead of falling back. These two factories
    // deliberately mirror the ones at the top of this file — vi.mock is hoisted
    // above every declaration, so there is no shared const to point both at.
    vi.doMock("react-native", () => ({ Platform: { OS: "android" } }));
    vi.doMock("expo-constants", () => ({
      default: { expoConfig: { extra: { distribution: "play" } } },
    }));
    // These three have no file-level mock, so removing them outright is right.
    for (const m of [
      "expo-application",
      "expo-file-system/legacy",
      "expo-intent-launcher",
    ]) {
      vi.doUnmock(m);
    }
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("sends a Play user to the store listing instead of a dead end", async () => {
    const { mod, openURL, alert } = await loadUpdates("play");
    expect(mod.UPDATER_ENABLED).toBe(false);
    await mod.checkForUpdate(false);
    // The exact listing URL, not merely one containing the package id:
    // "https://example.com/com.rabbaanie.app.apk" satisfies a substring match
    // while being precisely the off-Play download this channel must never open.
    expect(openURL).toHaveBeenCalledTimes(1);
    expect(openURL.mock.calls[0][0]).toBe(
      "market://details?id=com.rabbaanie.app",
    );
    // And no alert: the message it used to show was factually wrong on the
    // very platform it was shown on.
    expect(alert).not.toHaveBeenCalled();
  });

  it("does not yank a Play user into the store from a background check", async () => {
    const { mod, openURL } = await loadUpdates("play");
    await mod.checkForUpdate(true);
    expect(openURL).not.toHaveBeenCalled();
  });

  it("falls back to the web listing when the Play app cannot take the intent", async () => {
    // Linking.openURL REJECTS an unhandled scheme rather than resolving false,
    // so the catch IS the fallback. Without this test the whole second openURL
    // could be deleted and every other test here would still pass — verified
    // by deleting it.
    const { mod, openURL } = await loadUpdates("play");
    openURL.mockImplementation(async (url: string) => {
      if (url.startsWith("market:")) throw new Error("no activity found");
      return true;
    });
    await mod.openPlayStoreListing();
    expect(openURL).toHaveBeenCalledTimes(2);
    expect(openURL.mock.calls[1][0]).toBe(
      "https://play.google.com/store/apps/details?id=com.rabbaanie.app",
    );
  });

  it("says so when neither Play nor a browser can open the listing", async () => {
    // A button that silently does nothing is the same dead end this change
    // exists to remove, only quieter. Reachable for real: a Play-flavoured
    // build sideloaded onto a device with no Play services and no browser.
    const { mod, openURL, alert } = await loadUpdates("play");
    openURL.mockImplementation(async () => {
      throw new Error("no activity found");
    });
    await mod.openPlayStoreListing();
    expect(openURL).toHaveBeenCalledTimes(2);
    expect(alert).toHaveBeenCalledTimes(1);
  });

  it("leaves the sideload updater intact", async () => {
    // Presence, not only absence. A Play-only fix that switched the updater
    // off everywhere would satisfy every check above and strand the sideload
    // channel, whose ONLY update path is the in-app APK download.
    const { mod, openURL } = await loadUpdates("github");
    expect(mod.UPDATER_ENABLED).toBe(true);
    // And the Play hand-off must not leak onto this channel: a sideload user
    // sent to a Play listing for an app Play does not carry is a dead end, and
    // the APK updater is their only route. 404 = "no manifest yet", the
    // cheapest path through checkForUpdate that touches no network.
    vi.stubGlobal("fetch", async () => ({ status: 404, ok: false }));
    await mod.checkForUpdate(false);
    expect(openURL).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("offers the hand-off on the Play build and nowhere it cannot work", async () => {
    // The invariant, not a spelling of it: asserting the JSX condition as a
    // string breaks the day Prettier wraps it and the tempting fix is to
    // loosen the string, which deletes the guard. So the gate is an exported
    // boolean and this reads the boolean.
    expect((await loadUpdates("play", "android")).mod.PLAY_UPDATE_HANDOFF).toBe(
      true,
    );
    // Not merely "not the sideload channel": `expo export --platform web`
    // builds with distribution "play" too, and there market:// resolves to
    // nothing while react-native-web's openURL does not even reject, so not
    // even the https fallback fires.
    expect((await loadUpdates("play", "web")).mod.PLAY_UPDATE_HANDOFF).toBe(
      false,
    );
    expect(
      (await loadUpdates("github", "android")).mod.PLAY_UPDATE_HANDOFF,
    ).toBe(false);
  });

  it("gives the Play build a visible control, not just a version number", () => {
    // Whitespace-stripped before matching, so a Prettier reflow of these
    // deeply-indented JSX expressions cannot fail a test whose behaviour has
    // not changed — that failure has exactly one tempting fix, loosening the
    // string, which deletes the guard. Reordering the operands would still
    // fail, but that is a deliberate edit, not something a formatter does.
    const settings = read("app/(tabs)/settings.tsx").replace(/\s+/g, "");

    // A control has to actually RENDER. One occurrence of the identifier is
    // just the import, which proves nothing; a SECOND is a use. Counted rather
    // than matched against `onPress={()=>openPlayStoreListing()}`, because
    // `onPress={openPlayStoreListing}` is a behaviour-preserving refactor that
    // would fail a spelling match — and the tempting fix for that failure is to
    // loosen the string, which removes the guard. Not the button's label
    // either: coupling a policy guard to a translation breaks on a copy edit.
    expect(
      settings.split("openPlayStoreListing").length - 1,
      "openPlayStoreListing is imported but never used - no control renders",
    ).toBeGreaterThanOrEqual(2);

    // And the section TITLE must read the same flag as the control. Gating the
    // button on Android while leaving the title unconditional puts "App
    // Updates" over a bare version number on web and iOS, which is what the
    // title's original conditional existed to prevent.
    expect(settings).toContain("UPDATER_ENABLED||PLAY_UPDATE_HANDOFF");
    expect(settings).toContain("{PLAY_UPDATE_HANDOFF&&(");
  });
});

/**
 * This describe exists to be LAST, and to fail if the one above it leaks.
 *
 * loadUpdates() calls vi.doMock("react-native", ...), which overrides the
 * file-level vi.mock for every import that follows and outlives the test that
 * registered it. Without the afterAll above, a describe appended below this
 * point silently receives loadUpdates' Alert/Linking/Platform stub instead of
 * the file's, and fails for a reason that has nothing to do with it.
 */
describe("react-native mock does not leak past the update tests", () => {
  it("restores the file-level mock for anything appended below", async () => {
    const RN: any = await import("react-native");
    expect(RN.Platform.OS).toBe("android");
    // vitest throws on an export the mock does not define, rather than
    // returning undefined — so the throw IS the assertion that loadUpdates'
    // richer stub is gone.
    expect(
      () => RN.Linking,
      "loadUpdates' react-native stub leaked past its own describe",
    ).toThrow(/No "Linking" export/);
  });
});
