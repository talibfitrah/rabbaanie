import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  MARITAL_OPTIONS,
  REQUIRED_SUBSCRIBER_FIELDS,
  buildSubscriberInfo,
  isKnownMaritalStatus,
  isSubscriberInfoComplete,
} from "@/lib/subscriber-info";

/**
 * Regression guard for the drift found on 2026-08-13.
 *
 * rabbaanie-api commit 9415b19 (2026-08-08) split the subscriber address into
 * streetHouseNumber/city/country and restricted maritalStatus to four tokens.
 * The website was updated with it; app/subscribe.tsx was not, and kept sending
 * a flat `address` plus English marital keys. Every route that shares the
 * server's one validator then refused: redeem-coupon, checkout, POST /info —
 * and the Play purchase, which awaits persistInfo() before opening Play's
 * sheet. The screen has no branch for `missing_info`, so all of it surfaced as
 * "Invalid coupon" while no coupon was ever looked up.
 *
 * The two literals below mirror the server, which lives in a separate repo
 * with no shared types and its own deploy: rabbaanie-api
 * server/subscriber-validation.ts REQUIRED_SUBSCRIBER_FIELDS and
 * server/web-auth.ts MARITAL_STATUSES. Duplicating them here is the only way
 * to pin the contract from the client side — and pinning it is the point, so
 * that changing either list is a deliberate act rather than a silent outage.
 */
const SERVER_REQUIRED_FIELDS = [
  "firstName",
  "lastName",
  "maritalStatus",
  "streetHouseNumber",
  "city",
  "country",
  "email",
  "phone",
];
const SERVER_MARITAL_STATUSES = [
  "getrouwd",
  "gescheiden",
  "weduwe_weduwnaar",
  "alleenstaand",
];

const COMPLETE = {
  firstName: "Ahmad",
  lastName: "Yusuf",
  maritalStatus: "getrouwd",
  streetHouseNumber: "Kerkstraat 1",
  city: "Amsterdam",
  country: "Nederland",
  email: "ahmad@example.com",
  phone: "0612345678",
};

describe("subscriber info contract", () => {
  it("requires exactly the fields the server requires", () => {
    expect([...REQUIRED_SUBSCRIBER_FIELDS].sort()).toEqual(
      [...SERVER_REQUIRED_FIELDS].sort(),
    );
  });

  it("offers only marital statuses the server accepts", () => {
    expect(MARITAL_OPTIONS.map((o) => o.value).sort()).toEqual(
      [...SERVER_MARITAL_STATUSES].sort(),
    );
  });

  it("sends every field the server requires", () => {
    const payload = buildSubscriberInfo(COMPLETE);
    for (const field of SERVER_REQUIRED_FIELDS) {
      expect(
        payload[field as keyof typeof payload],
        `payload omits ${field}`,
      ).toBeTruthy();
    }
  });

  it("sends no flat address, which the server stopped accepting", () => {
    expect(buildSubscriberInfo(COMPLETE)).not.toHaveProperty("address");
  });

  it("echoes optional details back so saving cannot erase them", () => {
    // saveSubscriberInfo does .set({...data}) and the server's validator turns
    // an omitted optional into null, so anything the app does not send back is
    // deleted from a record the website filled in.
    const payload = buildSubscriberInfo(COMPLETE, {
      kunya: "أبو خالد",
      gender: "man",
      addressLine2: "2 hoog",
      postcode: "1011 AB",
    });
    expect(payload.kunya).toBe("أبو خالد");
    expect(payload.gender).toBe("man");
    expect(payload.addressLine2).toBe("2 hoog");
    expect(payload.postcode).toBe("1011 AB");
  });

  it("trims values so a space-only entry is not sent as real data", () => {
    expect(buildSubscriberInfo({ ...COMPLETE, city: "  Utrecht  " }).city).toBe(
      "Utrecht",
    );
  });

  it("treats a space-only required field as incomplete", () => {
    expect(isSubscriberInfoComplete({ ...COMPLETE, city: "   " })).toBe(false);
  });

  it("treats a fully filled form as complete without the optional fields", () => {
    expect(isSubscriberInfoComplete(COMPLETE)).toBe(true);
  });

  // Every subscriber_info row in production carries a value from the old
  // vocabulary — 8 "married" and 1 "divorced", checked 2026-08-13. Prefilling
  // one of those leaves no chip selected while still reading as complete, so
  // the form would submit a value the server refuses. Screening the loaded
  // value is what makes the fix work for the people who already subscribed,
  // not only for new ones.
  it("rejects the stale vocabulary still stored against existing subscribers", () => {
    for (const stale of ["married", "divorced", "single", "widowed"]) {
      expect(isKnownMaritalStatus(stale), `${stale} must not prefill`).toBe(
        false,
      );
    }
  });

  it("accepts every status the picker itself offers", () => {
    for (const option of MARITAL_OPTIONS) {
      expect(
        isKnownMaritalStatus(option.value),
        `${option.value} must prefill`,
      ).toBe(true);
    }
  });

  it("rejects an absent stored status rather than treating it as chosen", () => {
    expect(isKnownMaritalStatus("")).toBe(false);
    expect(isKnownMaritalStatus(undefined)).toBe(false);
  });
});

// The refusal these fields can produce has to be visible where the user acted.
describe("a refused purchase is visible where the user pressed", () => {
  // Whitespace collapsed. Every anchor below is a multi-token SOURCE string
  // ("play.purchase(); }}", "onPress={async () =>"), so all of them go red the
  // day prettier breaks those lines differently — on code that is still
  // correct. That happened. Collapsing runs of whitespace keeps each anchor
  // exact and makes it independent of the formatter; the index comparisons
  // below still hold, because collapsing preserves relative order. Loosening
  // the anchors instead would have removed the placement guard, which IS the
  // thing this describe exists to assert.
  const screen = readFileSync(
    join(__dirname, "..", "app/subscribe.tsx"),
    "utf8",
  ).replace(/\s+/g, " ");

  /** The onPress that actually reaches play.purchase(), found from the call
   *  outwards. Anchoring on the handler's opening characters is what let a
   *  statement inserted before its first `if` silently empty this slice. */
  function purchaseHandler(): string {
    const end = screen.indexOf("play.purchase(); }}");
    expect(end, "play.purchase() call moved - anchor is stale").toBeGreaterThan(
      -1,
    );
    const begin = screen.lastIndexOf("onPress={async () =>", end);
    expect(
      begin,
      "no onPress handler encloses play.purchase()",
    ).toBeGreaterThan(-1);
    return screen.slice(begin, end);
  }

  it("reports a refusal beside the button, never to the shared footer", () => {
    // The shared `msg` renders once under the coupon block, ~60 lines of JSX
    // past the Subscribe button, so a refusal reported there is off-screen at
    // the moment of the press and the button reads as dead. Seen on a real
    // device on the Play internal-testing build. Clearing that footer is still
    // allowed — stripped below — so only REPORTING to it fails this.
    const handler = purchaseHandler();
    // Pattern, not literal: prettier inserts a space after the paren when it
    // wraps a long call (`setPurchaseRefusal(\n  L3(` → `setPurchaseRefusal( L3(`),
    // which collapsing whitespace cannot undo. The call and its argument are
    // still asserted exactly; only the spacing between them is free.
    expect(handler).toMatch(/setPurchaseRefusal\(\s*L3\(/);
    expect(
      handler.replace(/setMsg\(""\);/g, ""),
      "a refusal here must not be reported to the distant footer",
    ).not.toContain("setMsg(");
  });

  it("renders it between the button and the renewal terms", () => {
    // Placement is the whole point, so assert it rather than mere presence:
    // state written and rendered somewhere far away is the same dead button.
    const callAt = screen.indexOf("play.purchase(); }}");
    const renewalAt = screen.indexOf("Play requires the renewal terms", callAt);
    expect(renewalAt, "renewal-terms anchor moved").toBeGreaterThan(callAt);
    expect(screen.slice(callAt, renewalAt)).toMatch(/\{!!purchaseRefusal &&/);
  });
});

describe("a redeemed coupon is answered where the user pressed", () => {
  const screen = readFileSync(
    join(__dirname, "..", "app/subscribe.tsx"),
    "utf8",
  );

  it("does not put the subscribe card between Redeem and its own outcome", () => {
    // redeem() reports every verdict through the shared `msg`. When the coupon
    // block moved above the subscribe card, that render stayed at the foot of
    // the screen — the whole card below the button — so a refused code was off
    // screen at the moment of the press and Redeem read as dead, the defect
    // fe9cf3a fixed on the purchase path. Anchored on the card's own renewal
    // notice rather than a line count: "the card is not between them" survives
    // a reformat, which a distance assertion would not.
    const msgAt = screen.indexOf("{!!msg &&");
    const redeemAt = screen.indexOf("onPress={redeem}");
    expect(msgAt, "shared msg render not found").toBeGreaterThan(-1);
    expect(redeemAt, "Redeem button not found").toBeGreaterThan(-1);
    const between = screen.slice(
      Math.min(msgAt, redeemAt),
      Math.max(msgAt, redeemAt),
    );
    expect(
      between,
      "the subscribe card sits between Redeem and its outcome",
    ).not.toContain("Play requires the renewal terms");
  });

  it("keeps it below the details form, not adrift at the top of the page", () => {
    // "Not inside the card" alone is satisfied by hoisting msg to the very top
    // of the ScrollView, above the status card, the tier cards and the whole
    // details form — off screen again, in the other direction. Both controls
    // that report through msg (Save, and Redeem) live after the form, so the
    // render has to as well.
    const msgAt = screen.indexOf("{!!msg &&");
    const saveAt = screen.indexOf("onPress={saveInfo}");
    expect(saveAt, "Save button not found").toBeGreaterThan(-1);
    expect(
      msgAt,
      "msg renders above the details form, far from both controls that write it",
    ).toBeGreaterThan(saveAt);
  });

  it("keeps that outcome mounted when a successful redeem flips the card", () => {
    // Success sets `msg` AND flips status.subscribed, which unmounts the
    // not-subscribed block. Rendering the message inside it would delete the
    // confirmation at the instant it becomes true.
    const msgAt = screen.indexOf("{!!msg &&");
    const gateAt = screen.indexOf("{!status?.subscribed && (");
    expect(gateAt, "not-subscribed gate not found").toBeGreaterThan(-1);
    expect(
      msgAt,
      "render msg outside the !subscribed block, or a successful redeem unmounts its own confirmation",
    ).toBeLessThan(gateAt);
  });
});
