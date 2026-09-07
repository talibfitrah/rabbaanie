import { describe, it, expect } from "vitest";
import { getIslamicDate } from "@/lib/prayer-data";
import { getDayOccasions, type Occasion } from "@/lib/islamic-calendar";

/** Scans forward from `start` for the first Gregorian date whose Hijri date matches `predicate`. */
function findDate(predicate: (h: { month: number; day: number }) => boolean, start = new Date("2026-01-01T00:00:00Z")): Date {
  let d = new Date(start);
  for (let i = 0; i < 400; i++) {
    if (predicate(getIslamicDate(d, null))) return d;
    d = new Date(d.getTime() + 86400000);
  }
  throw new Error("no matching date found within 400 days of " + start.toISOString());
}

function findWeekday(dow: number, start = new Date("2026-01-01T00:00:00Z")): Date {
  let d = new Date(start);
  for (let i = 0; i < 7; i++) {
    if (d.getDay() === dow) return d;
    d = new Date(d.getTime() + 86400000);
  }
  throw new Error("unreachable");
}

const byId = (list: Occasion[], id: string) => list.find((o) => o.id === id);

describe("getDayOccasions", () => {
  it("a Friday includes the jumuah fadila", () => {
    const friday = findWeekday(5);
    const occ = byId(getDayOccasions(friday).day, "jumuah");
    expect(occ).toBeTruthy();
    expect(occ!.kind).toBe("fadila");
  });

  it("13/14/15 of a non-prohibited month includes the white-day fadila", () => {
    // Exclude month 12 -- the 13th there is a Tashreeq (fasting-prohibited) day,
    // so white-day correctly does NOT fire (mirrors isFastingProhibited gating).
    const date = findDate((h) => h.month !== 12 && (h.day === 13 || h.day === 14 || h.day === 15));
    const occ = byId(getDayOccasions(date).day, "white-day");
    expect(occ).toBeTruthy();
    expect(occ!.fasting).toBe("recommended");
  });

  it("13 Dhul-Hijjah (Tashreeq, fasting-prohibited) does NOT get a white-day fadila", () => {
    const date = findDate((h) => h.month === 12 && h.day === 13);
    expect(byId(getDayOccasions(date).day, "white-day")).toBeUndefined();
    expect(byId(getDayOccasions(date).day, "tashreeq")).toBeTruthy();
  });

  it("10 Muharram has BOTH the ashura fadila and the bidah-ashura warning", () => {
    const date = findDate((h) => h.month === 1 && h.day === 10);
    const day = getDayOccasions(date).day;
    const ashura = byId(day, "ashura");
    const bidah = byId(day, "bidah-ashura");
    expect(ashura).toBeTruthy();
    expect(ashura!.kind).toBe("fadila");
    expect(bidah).toBeTruthy();
    expect(bidah!.kind).toBe("bidah");
  });

  it("27 Rajab includes the bidah-isra-miraj warning", () => {
    const date = findDate((h) => h.month === 7 && h.day === 27);
    expect(byId(getDayOccasions(date).day, "bidah-isra-miraj")).toBeTruthy();
  });

  it("15 Sha'ban includes the bidah-mid-shaban warning", () => {
    const date = findDate((h) => h.month === 8 && h.day === 15);
    expect(byId(getDayOccasions(date).day, "bidah-mid-shaban")).toBeTruthy();
  });

  it("1 Muharram includes the bidah-hijri-new-year warning", () => {
    const date = findDate((h) => h.month === 1 && h.day === 1);
    expect(byId(getDayOccasions(date).day, "bidah-hijri-new-year")).toBeTruthy();
  });

  it("any day in month 9 (Ramadan) includes the ramadan month-scope fadila", () => {
    const date = findDate((h) => h.month === 9);
    const occ = byId(getDayOccasions(date).month, "ramadan");
    expect(occ).toBeTruthy();
    expect(occ!.scope).toBe("month");
    expect(occ!.kind).toBe("fadila");
  });

  it("ported fadail keep their real, verbatim evidence (guards reuse, not fabrication)", () => {
    const ashuraDate = findDate((h) => h.month === 1 && h.day === 10);
    const ashura = byId(getDayOccasions(ashuraDate).day, "ashura")!;
    expect(ashura.proofs.length).toBeGreaterThan(0);
    expect(ashura.proofs[0].text.ar).toBe("«يكفّر السنة التي قبله» — مسلم");

    const arafahDate = findDate((h) => h.month === 12 && h.day === 9);
    const arafah = byId(getDayOccasions(arafahDate).day, "arafah")!;
    expect(arafah.proofs.length).toBeGreaterThan(0);
    expect(arafah.proofs[0].text.ar).toBe("«يكفّر السنة التي قبله والسنة التي بعده» — مسلم");
  });

  it("a NEW slot (Ramadan, Mawlid) has no proofs yet -- guards against fabricated content", () => {
    const ramadanDate = findDate((h) => h.month === 9);
    const ramadan = byId(getDayOccasions(ramadanDate).month, "ramadan")!;
    expect(ramadan.proofs).toEqual([]);

    const mawlidDate = findDate((h) => h.month === 3 && h.day === 12);
    const mawlid = byId(getDayOccasions(mawlidDate).day, "bidah-mawlid")!;
    expect(mawlid.proofs).toEqual([]);
  });
});
