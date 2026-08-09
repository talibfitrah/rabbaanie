import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

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

// The real package ships untranspiled and vitest cannot parse it.
vi.mock("expo-constants", () => ({
  default: { expoConfig: { extra: { distribution: "play" } } },
}));
vi.mock("react-native", () => ({ Platform: { OS: "android" } }));
vi.mock("@/hooks/use-subscription", () => ({
  invalidateSubscriptionCache: () => {},
  subscriptionFetch: async () => ({ ok: true, json: async () => ({ ok: true }) }),
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
  it("keeps Stripe checkout off the Play build", () => {
    const subscribe = read("app/subscribe.tsx");
    // Linking out to Stripe from a Play build is a link to a payment method
    // other than Play billing — grounds for removal, not just rejection.
    expect(subscribe).toContain('if (DISTRIBUTION_CHANNEL === "play") return;');
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
    expect(billing).toMatch(/for \(const purchase of owned \?\? \[\]\)\s*await settle\(purchase,\s*true\)/);
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
    const okBranch = billing.slice(okStart, billing.indexOf("iap.finishTransaction", okStart));
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
    expect(billing).toContain("usePlayBilling(accountTag: string | undefined, userId: number | undefined)");
    expect(billing).toMatch(/markPurchased\(false\);\s*setError\(null\);\s*\}, \[userId\]\);/);
    expect(read("app/subscribe.tsx")).toContain("usePlayBilling(status?.playAccountTag, uid)");
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
    expect(billing).toContain('DEFINITIVE_REJECTIONS.has(reason) || reason.startsWith("state_")');
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
    const block = billing.slice(catchAt, billing.indexOf("} finally {", catchAt));
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
    for (const state of ['case "pending":', 'case "foreign":', 'case "unverified": {']) {
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
    const screen = read("app/subscribe.tsx");
    expect(screen).toContain('play.error === "verify_failed" || play.recoverable ? (');
    // A live purchase rejected as another account's must not be silent.
    // Bounded by the NEXT branch's marker rather than a character count: the
    // count version broke the moment a comment grew, and the tempting fix is to
    // raise the number, which quietly lets the assertion match a setError from a
    // different branch entirely.
    const foreignAt = billing.indexOf('reason === "account_mismatch"');
    expect(foreignAt).toBeGreaterThan(-1);
    const nextBranchAt = billing.indexOf('setOutcome("unverified")', foreignAt);
    expect(nextBranchAt).toBeGreaterThan(foreignAt);
    expect(billing.slice(foreignAt, nextBranchAt)).toContain('setError("purchase_foreign")');
  });

  it("does not carry one account's subscriber details into another's purchase", () => {
    const subscribe = read("app/subscribe.tsx");
    // These fields gate infoComplete, which authorizes the Play purchase. Left
    // unguarded, a new user inherits the previous account's name/address/phone
    // and their membership is bought against someone else's details.
    expect(subscribe).toContain("infoRequestFor.current !== uid");
    expect(subscribe).toContain('setFirstName(""); setLastName("");');
  });

  it("leaves a not-yet-paid purchase alone", () => {
    // Slow payment methods deliver a real token before money moves. Verifying
    // it fails server-side and then tells the user their payment "went through"
    // and they "will not be charged again" — both false.
    expect(read("lib/play-billing.ts")).toContain('purchase?.purchaseState === "pending"');
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
    const subscribeSrc = read("app/subscribe.tsx");
    expect(subscribeSrc).toContain("async function persistInfo()");
    // The result must be USED: a failed POST that still opens Play's sheet
    // reproduces the exact "membership with no details on record" this prevents.
    expect(subscribeSrc).toContain("const saved = await persistInfo();");
    // The rule has exactly ONE exception, and it is asserted rather than
    // implied: a verify_failed retry starts no purchase, so demanding a details
    // POST there strands the user whose network is the reason verification
    // failed in the first place. Anything else reaching play.purchase() without
    // the details is the bug this test exists for.
    const press = subscribeSrc.slice(
      subscribeSrc.indexOf("onPress={async () => { if (play.error !== "),
      subscribeSrc.indexOf("play.purchase(); }}"),
    );
    expect(press.length).toBeGreaterThan(0);
    // Inside the guarded block: a failed POST must return, never fall through.
    expect(press).toMatch(/if \(!saved\) \{[\s\S]*?return;\s*\}/);
    // And the ONLY thing allowed to skip that block is the retry condition.
    expect(press).toContain('if (play.error !== "verify_failed" && !play.recoverable) {');
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
    const verifyFailureBlock = billing.slice(okAt, billing.indexOf("iap.finishTransaction", okAt));
    expect(verifyFailureBlock).toContain("settledRef.current.delete(token);");
    expect(billing).toMatch(/\}\s*catch\s*\{\s*settledRef\.current\.delete\(token\)/);
  });

  it("gates child-home usage collection on the channel, not on luck", () => {
    const home = read("app/child-account/home.tsx");
    // This is the one that would actually put PACKAGE_USAGE_STATS collection
    // into a Play artifact. With the route-level channel block gone, the only
    // other thing stopping it is the native module being excluded from Gradle
    // autolinking — an accident of app.config.ts, not a stated invariant. Any
    // edit to withPlayMonitoringDisabled would silently switch collection on.
    expect(home).toContain("if (CHILD_MONITORING_ENABLED && isNativeModuleAvailable()) {");
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
    expect(read("app/child-account/parent-monitor.tsx")).toContain("trpc.childAccount.create.useMutation");
    for (const f of ["app/(tabs)/family.tsx", "app/(tabs)/weekly.tsx", "app/(tabs)/messages.tsx"]) {
      const src = read(f);
      // Anchored on the link itself, not on a blanket ban of the flag name:
      // these are three of the app's largest screens and a future
      // monitoring-specific use of the flag in them would be legitimate.
      expect(src).toContain("child-account/parent-monitor?childId=");
      expect(src).not.toMatch(/\{CHILD_MONITORING_ENABLED && \([\s\S]{0,400}child-account\/parent-monitor/);
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
    expect(billing).toContain('if (!ok) {');
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
    const playBranches = [...screen.matchAll(/play\.offer \? play\.offer\.displayPrice : "([^"]*)"/g)];
    expect(playBranches.length).toBeGreaterThan(0);
    for (const branch of playBranches) expect(branch[1]).not.toContain("€");
  });

  it("gives Play subscribers a link to manage their subscription", () => {
    const screen = read("app/subscribe.tsx");
    // Play's subscription guidance: the app "should include a link on a
    // settings or preferences screen that allows users to manage their
    // subscriptions". The purchase card's prose about where to cancel is not
    // that link, and it only renders before buying — a subscriber never sees it.
    expect(screen).toContain("https://play.google.com/store/account/subscriptions");
    // Sideload has no Play subscription to manage; its Stripe membership is
    // cancelled on the website, so the link must not render there.
    const link = screen.slice(0, screen.indexOf("https://play.google.com/store/account/subscriptions"));
    // Android too, not just the Play channel. DISTRIBUTION_CHANNEL fails closed
    // to "play" for anything not built as github, so an iOS or web build was
    // offering subscribers a link to manage a Google Play subscription they
    // cannot possibly hold.
    expect(link.lastIndexOf('DISTRIBUTION_CHANNEL === "github" || Platform.OS !== "android" ? null : (')).toBeGreaterThan(
      link.lastIndexOf("</View>"),
    );
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

  it("declares no location foreground service it never starts", () => {
    const config = read("app.config.ts");
    // expo-location merges a LocationTaskService with
    // foregroundServiceType="location" into every build. This app only calls
    // requestForegroundPermissionsAsync and getCurrentPositionAsync — no
    // startLocationUpdatesAsync, no geofencing, and the only TaskManager task
    // is the widget refresh — so it is never started. Declared, it obliges a
    // Play Console foreground-service declaration for the location type, the
    // most closely scrutinised, with no truthful justification available.
    expect(config).toContain("expo.modules.location.services.LocationTaskService");
    expect(config).toContain('"tools:node": "remove"');
    // And the artifact gate must check the removal actually survived, since a
    // config plugin that stops matching fails silently.
    expect(read("scripts/assert-play-artifact.sh")).toContain("LocationTaskService");
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
    for (let i = monitor.indexOf(opener); i !== -1; i = monitor.indexOf(opener, i + 1)) {
      let depth = 0;
      for (let j = i + opener.length - 1; j < monitor.length; j++) {
        if (monitor[j] === "(") depth++;
        else if (monitor[j] === ")") {
          depth--;
          if (depth === 0) { spans.push([i, j]); break; }
        }
      }
    }
    expect(spans.length).toBeGreaterThan(0);
    const refs = [...monitor.matchAll(/totalAppUsageSeconds/g)].map((m) => m.index!);
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
    const effects = [...screen.matchAll(/useEffect\(\(\) => \{/g)].map((m) => m.index!);
    const probing = effects.filter((at) =>
      /checkPermission\(\)|runNoticeGatedCollection|permissionGranted/.test(screen.slice(at, at + 700)),
    );
    expect(probing.length).toBeGreaterThan(0);
    for (const at of probing) {
      expect(screen.slice(at, at + 700)).toContain("if (!CHILD_MONITORING_ENABLED) return;");
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
    expect(monitor).toMatch(/enabled:\s*CHILD_MONITORING_ENABLED && childAccountId > 0 && activeTab === "apps"/);
    expect(monitor).toContain('CHILD_MONITORING_ENABLED && activeTab === "apps" && renderApps()');
    expect(monitor).not.toContain("if (!CHILD_MONITORING_ENABLED) return <Redirect");
  });

  it("opens child mode on both channels, behind the adult session", () => {
    const gate = read("lib/age-gate.tsx");
    // The blanket channel block on /child-account/* is deliberately gone; what
    // keeps it compliant is that it sits behind isAuthenticated like everything
    // else. Re-adding a per-channel branch here would silently take the feature
    // back off the Play build. Matched on the routing expression rather than
    // the flag name, so the comment explaining the removal does not satisfy it.
    expect(gate).not.toContain('segment === "child-account"');
    expect(gate).toContain('if (!isAuthenticated && !inAuthGroup) return "/login";');
  });
});
