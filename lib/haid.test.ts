import { describe, it, expect } from "vitest";
import { addDays, diffDays, bloodRuns, classify, learnHabit, learnCycleLength, DEFAULT_SETTINGS, DEFAULT_CYCLE_LENGTH, type CycleDay, type CycleSettings } from "./haid";
import { rulingsFor, predict, ramadanQadaaDays, isExcusedToday, excusedState } from "./haid";

const S = (p: Partial<CycleSettings> = {}): CycleSettings => ({ ...DEFAULT_SETTINGS, enabled: true, ...p });
const blood = (dates: string[], color?: "black" | "red"): CycleDay[] => dates.map((date) => ({ date, flow: "blood", color }));
const span = (from: string, n: number) => Array.from({ length: n }, (_, i) => addDays(from, i));
const statusOf = (out: ReturnType<typeof classify>, date: string) => out.find((d) => d.date === date)!;

describe("date helpers", () => {
  it("addDays/diffDays cross month ends", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(diffDays("2026-02-01", "2026-03-01")).toBe(28);
  });
});

describe("bloodRuns — decision 4 (one non-blood day inside a run is absorbed)", () => {
  it("joins blood days separated by ONE clean day, splits on two", () => {
    const days = blood(["2026-09-01", "2026-09-02", "2026-09-04", "2026-09-08", "2026-09-09"]);
    const runs = bloodRuns(days);
    expect(runs.map((r) => [r.start, r.end])).toEqual([["2026-09-01", "2026-09-04"], ["2026-09-08", "2026-09-09"]]);
    expect(runs[0].dates).toHaveLength(4); // 1,2,3(absorbed),4
  });
});

describe("classify — haid by habit (decisions 1, 2)", () => {
  it("habit 7: days 1-7 haid, day 8+ istihada, no cap on input (day 20 still classified)", () => {
    const out = classify(blood(span("2026-09-01", 20)), S({ habitLength: 7 }), "2026-09-01", "2026-09-20");
    expect(statusOf(out, "2026-09-07").status).toBe("haid");
    expect(statusOf(out, "2026-09-08").status).toBe("istihada");
    expect(statusOf(out, "2026-09-20").status).toBe("istihada");
  });
  it("advisory see_doctor only from day 16 (decision 1: advisory, never a rule)", () => {
    const out = classify(blood(span("2026-09-01", 17)), S({ habitLength: 7 }), "2026-09-01", "2026-09-17");
    expect(statusOf(out, "2026-09-15").advisories).not.toContain("see_doctor");
    expect(statusOf(out, "2026-09-16").advisories).toContain("see_doctor");
  });
  it("habit beats colour: red days inside the habit are still haid (decision 2-أ)", () => {
    const days = [...blood(span("2026-09-01", 3), "black"), ...blood(span("2026-09-04", 2), "red")];
    const out = classify(days, S({ habitLength: 7 }), "2026-09-01", "2026-09-05");
    expect(statusOf(out, "2026-09-05").status).toBe("haid");
  });
  it("no habit: colour discriminates (black haid, red istihada)", () => {
    const days = [...blood(span("2026-09-01", 3), "black"), ...blood(span("2026-09-04", 2), "red")];
    const out = classify(days, S(), "2026-09-01", "2026-09-05");
    expect(statusOf(out, "2026-09-03").status).toBe("haid");
    expect(statusOf(out, "2026-09-05").status).toBe("istihada");
  });
  it("no habit, no colour: first 7 days haid, then istihada (غالب النساء)", () => {
    const out = classify(blood(span("2026-09-01", 10)), S(), "2026-09-01", "2026-09-10");
    expect(statusOf(out, "2026-09-07").status).toBe("haid");
    expect(statusOf(out, "2026-09-08").status).toBe("istihada");
  });
  it("bug 3: the habit counts CALENDAR run days, not blood days — a spotting day still consumes a day of the habit", () => {
    const days: CycleDay[] = [{ date: "2026-09-01", flow: "blood" }, { date: "2026-09-02", flow: "spotting" }, { date: "2026-09-03", flow: "blood" }];
    const out = classify(days, S({ habitLength: 2 }), "2026-09-01", "2026-09-03");
    expect(statusOf(out, "2026-09-01").status).toBe("haid"); // runDay 1
    expect(statusOf(out, "2026-09-02")).toMatchObject({ status: "tuhr_pending_ghusl" }); // decision 3 override untouched
    expect(statusOf(out, "2026-09-03").status).toBe("istihada"); // runDay 3 > habit 2, even though only 2 blood days were logged
  });
});

describe("classify — spotting and purity (decisions 3, 4)", () => {
  it("spotting is never haid, even right after blood; it ends the run with ghusl due", () => {
    const days: CycleDay[] = [...blood(span("2026-09-01", 5)), { date: "2026-09-06", flow: "spotting" }];
    const out = classify(days, S({ habitLength: 7 }), "2026-09-01", "2026-09-07");
    expect(statusOf(out, "2026-09-06").status).toBe("tuhr_pending_ghusl");
    expect(statusOf(out, "2026-09-06").ghuslDue).toBe(true);
    expect(statusOf(out, "2026-09-07").status).toBe("tuhr_pending_ghusl");
  });
  it("a spotting day ABSORBED inside a blood run is never haid (decision 3); the following blood day resumes haid and clears ghuslDue", () => {
    const days: CycleDay[] = [...blood(["2026-09-01", "2026-09-02"]), { date: "2026-09-03", flow: "spotting" }, ...blood(["2026-09-04", "2026-09-05"])];
    const out = classify(days, S({ habitLength: 7 }), "2026-09-01", "2026-09-05");
    expect(statusOf(out, "2026-09-03")).toMatchObject({ status: "tuhr_pending_ghusl", ghuslDue: true });
    expect(statusOf(out, "2026-09-04")).toMatchObject({ status: "haid", ghuslDue: false });
  });
  it("a single dry day between blood days stays haid; ghusl clears the pending state", () => {
    const days: CycleDay[] = [...blood(["2026-09-01", "2026-09-02"]), { date: "2026-09-03", flow: "dry" }, ...blood(["2026-09-04", "2026-09-05"]), { date: "2026-09-06", flow: "dry", ghusl: true }];
    const out = classify(days, S({ habitLength: 7 }), "2026-09-01", "2026-09-08");
    expect(statusOf(out, "2026-09-03").status).toBe("haid");
    expect(statusOf(out, "2026-09-06").status).toBe("tuhr");
    expect(statusOf(out, "2026-09-06").ghuslDue).toBe(false);
    expect(statusOf(out, "2026-09-08").status).toBe("tuhr");
  });
  it("istihada days after the habit carry ghuslDue until a ghusl is logged", () => {
    const days: CycleDay[] = [...blood(span("2026-09-01", 9)), { date: "2026-09-10", flow: "blood", ghusl: true }];
    const out = classify(days, S({ habitLength: 7 }), "2026-09-01", "2026-09-10");
    expect(statusOf(out, "2026-09-08")).toMatchObject({ status: "istihada", ghuslDue: true });
    expect(statusOf(out, "2026-09-10")).toMatchObject({ status: "istihada", ghuslDue: false });
  });
});

describe("classify — unlogged days extend a run to the habit (item E-2; `today` param bounds it, not `to`)", () => {
  it("no entry after the last logged blood day is assumed blood, up to today", () => {
    const out = classify(blood(["2026-09-01"]), S({ habitLength: 7 }), "2026-09-01", "2026-09-03", "2026-09-03");
    expect(statusOf(out, "2026-09-02").status).toBe("haid");
    expect(statusOf(out, "2026-09-03").status).toBe("haid");
    expect(isExcusedToday(out, "2026-09-03")).toBe(true);
  });
  it("the assumption stops at the habit cap even when today is later — run ends at day 7", () => {
    const out = classify(blood(["2026-09-01"]), S({ habitLength: 7 }), "2026-09-01", "2026-09-09", "2026-09-09");
    expect(statusOf(out, "2026-09-07").status).toBe("haid"); // day 7, the last habit day
    expect(statusOf(out, "2026-09-08")).toMatchObject({ status: "tuhr_pending_ghusl", ghuslDue: true });
    expect(statusOf(out, "2026-09-09").status).toBe("tuhr_pending_ghusl");
  });
  it("an explicit dry entry ends the assumption right there, before the habit cap", () => {
    const days: CycleDay[] = [{ date: "2026-09-01", flow: "blood" }, { date: "2026-09-04", flow: "dry" }];
    const out = classify(days, S({ habitLength: 7 }), "2026-09-01", "2026-09-09", "2026-09-09");
    expect(statusOf(out, "2026-09-03").status).toBe("haid"); // still assumed, before the dry entry
    expect(statusOf(out, "2026-09-04").status).not.toBe("haid");
    expect(statusOf(out, "2026-09-09").status).not.toBe("haid");
  });
  it("LEARNING keeps using only logged blood days — an unlogged extension never lengthens the learned habit", () => {
    const days = [...blood(span("2026-05-01", 5)), ...blood(span("2026-05-29", 5)), { date: "2026-06-26", flow: "blood" as const }];
    expect(learnHabit(days, S())).toBe(5); // the day-3 run's assumed extension (habit-capped) must not count
  });
});

describe("classify — pregnancy and nifas (decisions 10, 11)", () => {
  it("pregnant: every blood day is istihada with the pregnancy advisory", () => {
    const out = classify(blood(span("2026-09-01", 3)), S({ pregnantSince: "2026-06-01" }), "2026-09-01", "2026-09-03");
    expect(statusOf(out, "2026-09-02")).toMatchObject({ status: "istihada" });
    expect(statusOf(out, "2026-09-02").advisories).toContain("bleeding_in_pregnancy");
  });
  it("nifas: birth day to day 40 is nifas; day 41 of the same run is istihada (no cycle history to match against)", () => {
    const out = classify(blood(span("2026-09-01", 42)), S({ pregnantSince: "2026-01-01", birthDate: "2026-09-01" }), "2026-09-01", "2026-10-12");
    expect(statusOf(out, "2026-09-01").status).toBe("nifas");
    expect(statusOf(out, "2026-10-10").status).toBe("nifas"); // day 40
    expect(statusOf(out, "2026-10-11").status).toBe("istihada"); // day 41
  });
  it("day 41+ of a nifas run is haid (habit-capped) when it lands within ±3 days of an expected period (item E-3)", () => {
    const priorPeriod = blood(span("2026-01-04", 5)); // establishes the last NORMAL run's start
    const days = [...priorPeriod, ...blood(span("2026-09-01", 41))]; // birth day1=09-01 ... day41=10-11
    const out = classify(days, S({ pregnantSince: "2026-01-10", birthDate: "2026-09-01", cycleLength: 28, habitLength: 5 }), "2026-09-01", "2026-10-11");
    // day 41 = Jan 4 + 10×28 days exactly, so it falls inside the ±3-day window.
    expect(statusOf(out, "2026-10-11").status).toBe("haid");
  });
  it("labour blood up to 3 days before the birth is nifas (decision 10-أ)", () => {
    const out = classify(blood(span("2026-08-29", 6)), S({ pregnantSince: "2026-01-01", birthDate: "2026-09-01" }), "2026-08-28", "2026-09-03");
    expect(statusOf(out, "2026-08-29").status).toBe("nifas");
    expect(statusOf(out, "2026-08-28").status).toBe("tuhr");
  });
  it("purity before day 40 → ghusl due, then tuhr; blood returning before 40 is nifas again", () => {
    const days: CycleDay[] = [...blood(span("2026-09-01", 10)), { date: "2026-09-11", flow: "dry", ghusl: true }, ...blood(["2026-09-20"])];
    const out = classify(days, S({ pregnantSince: "2026-01-01", birthDate: "2026-09-01" }), "2026-09-01", "2026-09-21");
    expect(statusOf(out, "2026-09-11").status).toBe("tuhr");
    expect(statusOf(out, "2026-09-20").status).toBe("nifas");
  });
  it("after a sub-120-day miscarriage the pregnancy is over: the next period 5 weeks later is haid again (decision 10)", () => {
    const days = [...blood(span("2026-09-01", 4)), ...blood(span("2026-10-06", 5))];
    const out = classify(days, S({ pregnantSince: "2026-06-01", miscarriageDate: "2026-09-01", gestationDays: 90, habitLength: 5 }), "2026-09-01", "2026-10-10");
    expect(statusOf(out, "2026-09-02").status).toBe("istihada");
    expect(statusOf(out, "2026-09-02").advisories).not.toContain("bleeding_in_pregnancy");
    expect(statusOf(out, "2026-10-07").status).toBe("haid");
  });
  it("miscarriage at ≥120 days is nifas; below 120 days it is istihada (decision 10: 120)", () => {
    const yes = classify(blood(span("2026-09-01", 3)), S({ pregnantSince: "2026-04-01", miscarriageDate: "2026-09-01", gestationDays: 120 }), "2026-09-01", "2026-09-03");
    const no = classify(blood(span("2026-09-01", 3)), S({ pregnantSince: "2026-06-01", miscarriageDate: "2026-09-01", gestationDays: 90 }), "2026-09-01", "2026-09-03");
    expect(statusOf(yes, "2026-09-02").status).toBe("nifas");
    expect(statusOf(no, "2026-09-02").status).toBe("istihada");
  });
  it("bug 4: a run that only REACHES a birth partway through is still a nifas run — day 41 after birth is istihada, not haid", () => {
    // Blood starts 4 days before birth (outside the 3-day labour window), so run.start itself
    // is never inside the nifas window — only later days in this same run are.
    const days = blood(span("2026-09-01", 50));
    const out = classify(days, S({ birthDate: "2026-09-05" }), "2026-09-01", "2026-10-20");
    expect(statusOf(out, "2026-10-14").status).toBe("nifas"); // day 40 after birth
    expect(statusOf(out, "2026-10-15").status).toBe("istihada"); // day 41 — no cycle history to match against
  });
  it("bug 4: a run that only REACHES a sub-120-day miscarriage partway through is دم فساد there too, and later real periods still recover to haid", () => {
    // Blood starts 4 days before the miscarriage date (outside the 3-day window startedAfterEarlyMiscarriage
    // checks), so run.start alone never qualifies as an early-miscarriage run — only the miscarriage date itself does.
    const days = [...blood(span("2026-08-28", 8)), ...blood(span("2026-10-06", 5))];
    const out = classify(days, S({ pregnantSince: "2026-06-01", miscarriageDate: "2026-09-01", gestationDays: 90, habitLength: 5 }), "2026-08-28", "2026-10-10");
    expect(statusOf(out, "2026-09-01").status).toBe("istihada"); // the miscarriage date itself, mid-run
    expect(statusOf(out, "2026-10-07").status).toBe("haid"); // later real period recovers
  });
});

describe("classify — contraception (decision 12)", () => {
  it("with contraception, bleeding far from the expected start is istihada; bleeding at the expected start is haid", () => {
    // 3 historical runs = only 2 start-to-start intervals — too thin to auto-learn (bug 2), so the
    // "known cycle length" decision 12 requires is supplied explicitly, as a real settings override would.
    const history = [...blood(span("2026-06-01", 5)), ...blood(span("2026-06-29", 5)), ...blood(span("2026-07-27", 5))];
    const onTime = classify([...history, ...blood(span("2026-08-24", 3))], S({ contraception: true, habitLength: 5, cycleLength: 28 }), "2026-08-24", "2026-08-26");
    const offTime = classify([...history, ...blood(span("2026-08-12", 3))], S({ contraception: true, habitLength: 5, cycleLength: 28 }), "2026-08-12", "2026-08-14");
    expect(statusOf(onTime, "2026-08-25").status).toBe("haid");
    expect(statusOf(offTime, "2026-08-13").status).toBe("istihada");
  });
});

describe("learning", () => {
  it("habit = median of the last three UNCAPPED run lengths; cycle = median of start intervals", () => {
    // The 4th run is closed by a logged dry day after it, so all four count as complete (bug 1).
    const days = [...blood(span("2026-05-01", 6)), ...blood(span("2026-05-29", 8)), ...blood(span("2026-06-26", 7)), ...blood(span("2026-07-24", 9)), { date: "2026-08-02", flow: "dry" as const }];
    expect(learnHabit(days, S())).toBe(8);
    expect(learnCycleLength(days, S())).toBe(28);
    expect(learnHabit(days, S(), "2026-05-20")).toBe(6);
    expect(learnHabit([], S())).toBeUndefined();
  });
  it("bug 1: the current run (nothing logged after it yet) is excluded from learning; predict agrees with classify", () => {
    const days = blood(["2026-09-01"]);
    expect(learnHabit(days, S())).toBeUndefined(); // one day is not a learned habit
    const p = predict(days, S(), "2026-09-03");
    expect(p.habit).toBeUndefined();
    expect(p.expectedPurity).toBeUndefined(); // nothing learned yet to project a purity date from
    const cls = classify(days, S(), "2026-09-01", "2026-09-03", "2026-09-03");
    expect(isExcusedToday(cls, "2026-09-03")).toBe(true); // classify still assumes haid (DEFAULT_HAID_DAYS window)
    expect(excusedState(cls, p, "2026-09-03")).toEqual({ excused: true, until: "2026-09-03" }); // safe "at least today" — agrees with classify, asserts nothing further
  });
  it("bug 2: needs at least 3 start-to-start intervals (4 complete runs) before learning a cycle length", () => {
    const closedRun = (start: string) => [...blood([start]), { date: addDays(start, 1), flow: "dry" as const }];
    const twoRuns = [...closedRun("2026-07-21"), ...closedRun("2026-09-01")]; // 1 interval — too thin
    expect(learnCycleLength(twoRuns, S())).toBeUndefined();
    expect(predict(twoRuns, S(), "2026-09-05").cycleLength).toBe(DEFAULT_CYCLE_LENGTH); // falls back
    expect(predict(twoRuns, S({ cycleLength: 21 }), "2026-09-05").cycleLength).toBe(21); // manual override always wins

    const fourRuns = [...closedRun("2026-06-01"), ...closedRun("2026-06-29"), ...closedRun("2026-07-27"), ...closedRun("2026-08-24")]; // 3 intervals of 28 — enough
    expect(learnCycleLength(fourRuns, S())).toBe(28);
  });
});

describe("rulingsFor (decisions 5, 6, 7, 8, 9; his book on ghusl)", () => {
  it("haid/nifas: prayer excused, fasting forbidden with qadaa, intercourse forbidden, all three disputed acts permitted, kaffarah only as info", () => {
    for (const status of ["haid", "nifas"] as const) {
      const r = rulingsFor({ status, ghuslDue: false });
      expect(r).toMatchObject({ prayer: "excused", fasting: "forbidden_qadaa", intercourse: "forbidden", ghusl: "none" });
      expect(r.permitted).toEqual(expect.arrayContaining(["quran_recitation", "touching_mushaf", "staying_in_mosque"]));
      expect(r.notes).toContain("kaffarah_info");
      expect(r.notes).toContain("qadaa_prayer_if_missed_at_onset");
    }
  });
  it("istihada: prays with wudu per prayer (may combine), fasts, intercourse permitted with a note", () => {
    const r = rulingsFor({ status: "istihada", ghuslDue: false });
    expect(r).toMatchObject({ prayer: "obligatory", fasting: "allowed", intercourse: "permitted_with_note", ghusl: "none" });
    expect(r.notes).toContain("istihada_wudu_per_prayer_may_combine");
  });
  it("purity before ghusl: prayer due after ghusl, fasting allowed, intercourse only after ghusl", () => {
    expect(rulingsFor({ status: "tuhr_pending_ghusl", ghuslDue: true })).toMatchObject({ prayer: "due_after_ghusl", fasting: "allowed", intercourse: "after_ghusl", ghusl: "due" });
    expect(rulingsFor({ status: "istihada", ghuslDue: true })).toMatchObject({ prayer: "due_after_ghusl", intercourse: "after_ghusl", ghusl: "due" });
  });
  it("tuhr: everything normal", () => {
    expect(rulingsFor({ status: "tuhr", ghuslDue: false })).toMatchObject({ prayer: "obligatory", fasting: "allowed", intercourse: "permitted", ghusl: "none" });
  });
});

describe("predict", () => {
  const history = [...blood(span("2026-06-01", 5)), ...blood(span("2026-06-29", 5)), ...blood(span("2026-07-27", 5))];
  it("next start, ovulation −14, fertile window −5…+1, rolled forward past today", () => {
    const p = predict(history, S(), "2026-08-30");
    expect(p.cycleLength).toBe(28);
    expect(p.nextStart).toBe("2026-09-21");
    expect(p.ovulation).toBe("2026-09-07");
    expect(p.fertile).toEqual(["2026-09-02", "2026-09-08"]);
  });
  it("expected purity during a run = start + habit; during nifas = birth + 40", () => {
    const p = predict([...history, ...blood(span("2026-08-24", 3))], S(), "2026-08-26");
    expect(p.expectedPurity).toBe("2026-08-29");
    const n = predict(blood(span("2026-09-01", 5)), S({ pregnantSince: "2026-01-01", birthDate: "2026-09-01" }), "2026-09-05");
    expect(n.expectedPurity).toBe("2026-10-11");
  });
  it("no predictions while pregnant; defaults to 28 with no history", () => {
    expect(predict(history, S({ pregnantSince: "2026-08-01" }), "2026-08-30").nextStart).toBeUndefined();
    expect(predict([], S(), "2026-08-30")).toMatchObject({ cycleLength: 28 });
  });
});

describe("ramadan + excused state (decision 14)", () => {
  it("counts haid/nifas days in Ramadan of the latest year only", () => {
    const cls = classify(blood(span("2026-03-01", 5)), S({ habitLength: 5 }), "2026-03-01", "2026-03-10");
    const hijriOf = (d: string) => ({ month: d <= "2026-03-03" ? 9 : 10, year: 1447 });
    expect(ramadanQadaaDays(cls, hijriOf)).toEqual({ year: 1447, days: 3 });
    expect(ramadanQadaaDays(cls, () => ({ month: 1, year: 1447 }))).toBeNull();
  });
  it("excusedState: until = day before expected purity, at least today", () => {
    const days = blood(span("2026-09-01", 2));
    const cls = classify(days, S({ habitLength: 7 }), "2026-08-01", "2026-09-02");
    expect(isExcusedToday(cls, "2026-09-02")).toBe(true);
    expect(excusedState(cls, predict(days, S({ habitLength: 7 }), "2026-09-02"), "2026-09-02")).toEqual({ excused: true, until: "2026-09-07" });
    expect(excusedState(cls, predict(days, S(), "2026-09-02"), "2026-08-15")).toEqual({ excused: false });
  });
});
