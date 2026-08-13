import { describe, expect, it } from "vitest";
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
    expect([...REQUIRED_SUBSCRIBER_FIELDS].sort()).toEqual([...SERVER_REQUIRED_FIELDS].sort());
  });

  it("offers only marital statuses the server accepts", () => {
    expect(MARITAL_OPTIONS.map((o) => o.value).sort()).toEqual([...SERVER_MARITAL_STATUSES].sort());
  });

  it("sends every field the server requires", () => {
    const payload = buildSubscriberInfo(COMPLETE);
    for (const field of SERVER_REQUIRED_FIELDS) {
      expect(payload[field as keyof typeof payload], `payload omits ${field}`).toBeTruthy();
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
    expect(buildSubscriberInfo({ ...COMPLETE, city: "  Utrecht  " }).city).toBe("Utrecht");
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
      expect(isKnownMaritalStatus(stale), `${stale} must not prefill`).toBe(false);
    }
  });

  it("accepts every status the picker itself offers", () => {
    for (const option of MARITAL_OPTIONS) {
      expect(isKnownMaritalStatus(option.value), `${option.value} must prefill`).toBe(true);
    }
  });

  it("rejects an absent stored status rather than treating it as chosen", () => {
    expect(isKnownMaritalStatus("")).toBe(false);
    expect(isKnownMaritalStatus(undefined)).toBe(false);
  });
});
