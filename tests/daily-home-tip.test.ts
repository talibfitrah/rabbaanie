import { describe, it, expect } from "vitest";
import { selectDailyHomeTip } from "../lib/daily-home-tip";

// dayOfWeek follows Date.getDay(): 0=Sun,1=Mon,2=Tue,3=Wed,4=Thu,5=Fri,6=Sat

describe("selectDailyHomeTip", () => {
  it("returns the al-Kahf tip on Friday, regardless of a weak-prayer/low-mood check-in", () => {
    const tip = selectDailyHomeTip({
      dayOfWeek: 5,
      checkin: { prayer: "sommige_gemist", mood: "gestrest" },
      lang: "en",
    });
    expect(tip).toContain("Kahf");
  });

  it("returns the Monday fasting tip, regardless of check-in", () => {
    const tip = selectDailyHomeTip({
      dayOfWeek: 1,
      checkin: { prayer: "fajr_gemist", mood: "moe" },
      lang: "en",
    });
    expect(tip).toContain("Monday");
  });

  it("returns the Thursday fasting tip, regardless of check-in", () => {
    const tip = selectDailyHomeTip({
      dayOfWeek: 4,
      checkin: { prayer: "fajr_gemist", mood: "moe" },
      lang: "en",
    });
    expect(tip).toContain("Thursday");
  });

  it("returns a prayer-encouragement tip for a weak-prayer check-in on a non-special day", () => {
    const tip = selectDailyHomeTip({
      dayOfWeek: 2, // Tuesday
      checkin: { prayer: "fajr_gemist", mood: "rustig" },
      lang: "en",
    });
    expect(tip.toLowerCase()).toContain("prayer");
    expect(tip).not.toContain("adhkaar"); // not the generic default
  });

  it("nudges 'some missed' with the missed-prayer tip", () => {
    const tip = selectDailyHomeTip({ dayOfWeek: 2, checkin: { prayer: "sommige_gemist", mood: "rustig" }, lang: "en" });
    expect(tip.toLowerCase()).toContain("missed");
  });

  it("affirms 'working on it' as effort, not a miss", () => {
    const tip = selectDailyHomeTip({ dayOfWeek: 2, checkin: { prayer: "werk_eraan", mood: "rustig" }, lang: "en" });
    expect(tip.toLowerCase()).toContain("working on");
    expect(tip.toLowerCase()).not.toContain("missed");
  });

  it("returns a comfort tip for a low-mood check-in (tired or stressed) on a non-special day", () => {
    for (const mood of ["moe", "gestrest"]) {
      const tip = selectDailyHomeTip({
        dayOfWeek: 2,
        checkin: { prayer: "alle_5_op_tijd", mood },
        lang: "en",
      });
      expect(tip).not.toContain("adhkaar"); // not the generic default
      expect(tip).not.toContain("Kahf");
    }
  });

  it("returns the generic default when there is no check-in yet", () => {
    const tip = selectDailyHomeTip({ dayOfWeek: 2, checkin: undefined, lang: "en" });
    expect(tip).toContain("adhkaar");
  });

  it("returns the generic default when the check-in signal is neutral (all 5 on time, calm mood)", () => {
    const tip = selectDailyHomeTip({
      dayOfWeek: 2,
      checkin: { prayer: "alle_5_op_tijd", mood: "rustig" },
      lang: "en",
    });
    expect(tip).toContain("adhkaar");
  });

  it("is trilingual — nl/en/ar all produce non-empty, language-appropriate text for the default tip", () => {
    const nl = selectDailyHomeTip({ dayOfWeek: 2, checkin: null, lang: "nl" });
    const en = selectDailyHomeTip({ dayOfWeek: 2, checkin: null, lang: "en" });
    const ar = selectDailyHomeTip({ dayOfWeek: 2, checkin: null, lang: "ar" });
    expect(nl).toContain("adhkaar");
    expect(en).toContain("adhkaar");
    expect(ar).toMatch(/[؀-ۿ]/); // contains Arabic script
    expect(nl).not.toBe(en);
    expect(ar).not.toBe(en);
  });
});
