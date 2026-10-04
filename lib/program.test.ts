/**
 * Pure core + storage of the Roznama prayer-anchored "program" (Daa3iyah 3180):
 * a recurring routine item is anchored either to a prayer (shifts with that
 * prayer every day) or to a fixed clock time, and recurs by weekday.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const store = new Map<string, string>();
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn(async (k: string) => store.get(k) ?? null),
    setItem: vi.fn(async (k: string, v: string) => { store.set(k, v); }),
  },
}));

import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  loadProgramItems,
  saveProgramItems,
  addProgramItem,
  updateProgramItem,
  deleteProgramItem,
  getProgramItemById,
  resolveItemMinutes,
  itemRecursOn,
  programForDay,
  type ProgramItem,
} from "./program";
import type { PrayerTimesResult } from "./prayer-data";

const TIMES: PrayerTimesResult = {
  fajr: "05:12", sunrise: "06:40", dhuhr: "13:05", asr: "16:30", maghrib: "19:10", isha: "20:35",
};

function itemData(over: Partial<Omit<ProgramItem, "id">> = {}): Omit<ProgramItem, "id"> {
  return { title: "T", anchor: "fixed", offsetMinutes: 0, days: [], ...over };
}
function item(over: Partial<ProgramItem> = {}): ProgramItem {
  return { id: "x1", ...itemData(over), ...over };
}

describe("program-items storage", () => {
  beforeEach(() => store.clear());

  it("starts empty", async () => {
    expect(await loadProgramItems()).toEqual([]);
  });

  it("saveProgramItems -> loadProgramItems round-trips under @program_items", async () => {
    const list: ProgramItem[] = [item({ id: "a" })];
    await saveProgramItems(list);
    expect(store.get("@program_items")).toBe(JSON.stringify(list));
    expect(await loadProgramItems()).toEqual(list);
  });

  it("add -> load round-trip: generates an id and persists the item", async () => {
    const created = await addProgramItem(itemData({ title: "قيام الليل", anchor: "fajr", offsetMinutes: -60 }));
    expect(created.id).toEqual(expect.any(String));
    expect(created.id.length).toBeGreaterThan(0);
    expect(created).toMatchObject({ title: "قيام الليل", anchor: "fajr" });

    const list = await loadProgramItems();
    expect(list).toEqual([created]);
  });

  it("two items added back-to-back get different ids", async () => {
    const a = await addProgramItem(itemData({ title: "A" }));
    const b = await addProgramItem(itemData({ title: "B" }));
    expect(a.id).not.toBe(b.id);
  });

  it("update -> load round-trip: patches only the given fields", async () => {
    const created = await addProgramItem(itemData({ title: "Old", offsetMinutes: 10 }));
    const updated = await updateProgramItem(created.id, { title: "New" });
    expect(updated).toMatchObject({ id: created.id, title: "New", offsetMinutes: 10 });

    const list = await loadProgramItems();
    expect(list).toHaveLength(1);
    expect(list[0].title).toBe("New");
  });

  it("update on an unknown id is a no-op and returns null", async () => {
    await addProgramItem(itemData());
    const result = await updateProgramItem("does-not-exist", { title: "X" });
    expect(result).toBeNull();
    expect(await loadProgramItems()).toHaveLength(1);
  });

  it("deleteProgramItem -> load round-trip: removes exactly that item", async () => {
    const a = await addProgramItem(itemData({ title: "A" }));
    const b = await addProgramItem(itemData({ title: "B" }));
    await deleteProgramItem(a.id);
    const list = await loadProgramItems();
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(b.id);
  });

  it("getProgramItemById finds the item, or null when absent", async () => {
    const a = await addProgramItem(itemData({ title: "A" }));
    expect(await getProgramItemById(a.id)).toEqual(a);
    expect(await getProgramItemById("nope")).toBeNull();
  });

  it("loadProgramItems recovers from corrupted JSON", async () => {
    store.set("@program_items", "{not json");
    expect(await loadProgramItems()).toEqual([]);
  });

  it("loadProgramItems tolerates valid-JSON-wrong-shape data instead of throwing", async () => {
    for (const bad of ["null", "{}", "[{bad}]"]) {
      store.set("@program_items", bad);
      await expect(loadProgramItems()).resolves.toEqual([]);
    }
  });

  it("loadProgramItems filters out malformed entries (missing field, bad anchor) from an otherwise-valid array", async () => {
    store.set(
      "@program_items",
      JSON.stringify([
        { id: "ok1", title: "Good", anchor: "fajr", offsetMinutes: 0, days: [] },
        { id: "bad1" }, // missing title/anchor/offsetMinutes/days
        { id: "bad2", title: "Bad anchor", anchor: "zuhr", offsetMinutes: 0, days: [] },
      ])
    );
    const list = await loadProgramItems();
    expect(list.map((p) => p.id)).toEqual(["ok1"]);
  });

  it("two interleaved mutations do not lose an item (serialized writes)", async () => {
    const [a, b] = await Promise.all([
      addProgramItem(itemData({ title: "A" })),
      addProgramItem(itemData({ title: "B" })),
    ]);
    const list = await loadProgramItems();
    expect(list).toHaveLength(2);
    expect(list.map((p) => p.id).sort()).toEqual([a.id, b.id].sort());
  });

  it("a getItem rejection during addProgramItem does not overwrite existing stored items", async () => {
    await addProgramItem(itemData({ title: "Existing" }));
    (AsyncStorage.getItem as any).mockRejectedValueOnce(new Error("boom"));
    await expect(addProgramItem(itemData({ title: "New" }))).rejects.toThrow("boom");

    const list = await loadProgramItems();
    expect(list).toHaveLength(1);
    expect(list[0].title).toBe("Existing");
  });
});

describe("resolveItemMinutes — pure, no I/O", () => {
  it("prayer anchor: Fajr 05:12 + 30 -> 342 (05:42)", () => {
    const minutes = resolveItemMinutes(item({ anchor: "fajr", offsetMinutes: 30 }), TIMES);
    expect(minutes).toBe(342);
    expect(Math.floor(minutes! / 60)).toBe(5);
    expect(minutes! % 60).toBe(42);
  });

  it("negative offset lands before the anchor (Maghrib 19:10 - 25 -> 18:45)", () => {
    const minutes = resolveItemMinutes(item({ anchor: "maghrib", offsetMinutes: -25 }), TIMES);
    expect(minutes).toBe(18 * 60 + 45);
  });

  it("fixed anchor uses offsetMinutes as minutes-from-midnight, independent of times", () => {
    const garbled: PrayerTimesResult = { fajr: "bad", sunrise: "bad", dhuhr: "bad", asr: "bad", maghrib: "bad", isha: "bad" };
    const minutes = resolveItemMinutes(item({ anchor: "fixed", offsetMinutes: 375 }), garbled);
    expect(minutes).toBe(375); // 06:15
  });

  it("malformed HH:MM on the anchor prayer -> null (dropped)", () => {
    const bad = { ...TIMES, dhuhr: "99:99" };
    expect(resolveItemMinutes(item({ anchor: "dhuhr", offsetMinutes: 0 }), bad)).toBeNull();
  });

  it("other malformed time shapes also -> null", () => {
    for (const badDhuhr of ["", "5:3", "24:00", "13:5", "13-05"]) {
      const bad = { ...TIMES, dhuhr: badDhuhr };
      expect(resolveItemMinutes(item({ anchor: "dhuhr" }), bad)).toBeNull();
    }
  });

  it("clamps below 0 and above 1439 instead of going out of range", () => {
    expect(resolveItemMinutes(item({ anchor: "fajr", offsetMinutes: -400 }), TIMES)).toBe(0);
    expect(resolveItemMinutes(item({ anchor: "isha", offsetMinutes: 300 }), TIMES)).toBe(1439);
  });
});

describe("itemRecursOn", () => {
  it("empty days[] recurs every weekday", () => {
    for (let w = 0; w <= 6; w++) expect(itemRecursOn(item({ days: [] }), w)).toBe(true);
  });

  it("a Monday-only item (days=[1]) excludes Tuesday, includes Monday", () => {
    const mondayOnly = item({ days: [1] });
    expect(itemRecursOn(mondayOnly, 2)).toBe(false); // Tue
    expect(itemRecursOn(mondayOnly, 1)).toBe(true); // Mon
  });

  it("all 7 weekdays listed behaves like every day", () => {
    const everyDayListed = item({ days: [0, 1, 2, 3, 4, 5, 6] });
    for (let w = 0; w <= 6; w++) expect(itemRecursOn(everyDayListed, w)).toBe(true);
  });
});

describe("programForDay — resolve + recurrence filter + sort", () => {
  const breakfast = item({ id: "breakfast", title: "Breakfast", anchor: "fixed", offsetMinutes: 420, days: [] }); // 07:00 every day
  const qiyam = item({ id: "qiyam", title: "Qiyam", anchor: "fajr", offsetMinutes: -30, days: [] }); // Fajr-30 every day
  const mondayReading = item({ id: "reading", title: "Reading", anchor: "isha", offsetMinutes: 15, days: [1] }); // Isha+15, Monday only
  const items = [breakfast, qiyam, mondayReading];

  it("Monday (weekday 1): all three, sorted morning -> evening", () => {
    const out = programForDay(items, 1, TIMES);
    expect(out.map((r) => r.item.title)).toEqual(["Qiyam", "Breakfast", "Reading"]);
    const q = out[0];
    expect(q.minutes).toBe(312 - 30); // Fajr 05:12 - 30 = 04:42
    expect(q.hour).toBe(4);
    expect(q.minute).toBe(42);
  });

  it("Tuesday (weekday 2): Monday-only item excluded", () => {
    const out = programForDay(items, 2, TIMES);
    expect(out.map((r) => r.item.title)).toEqual(["Qiyam", "Breakfast"]);
  });

  it("an item whose anchor time is malformed is dropped, others remain", () => {
    const badTimes = { ...TIMES, fajr: "bad" };
    const out = programForDay(items, 1, badTimes);
    expect(out.map((r) => r.item.title)).toEqual(["Breakfast", "Reading"]); // qiyam (fajr-anchored) dropped
  });
});
