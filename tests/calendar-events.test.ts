import { describe, it, expect, beforeEach, vi } from "vitest";

const store = new Map<string, string>();
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn(async (k: string) => store.get(k) ?? null),
    setItem: vi.fn(async (k: string, v: string) => {
      store.set(k, v);
    }),
  },
}));

import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  loadEvents,
  saveEvents,
  addEvent,
  updateEvent,
  removeEvent,
  eventsForDate,
  type CalendarEvent,
} from "../lib/calendar-events";

describe("calendar-events storage", () => {
  beforeEach(() => {
    store.clear();
  });

  it("starts empty", async () => {
    expect(await loadEvents()).toEqual([]);
  });

  it("saveEvents -> loadEvents round-trips a full list under @calendar_events", async () => {
    const list: CalendarEvent[] = [
      { id: "x1", title: "T", dateISO: "2026-09-10", hour: 9, minute: 0, reminderMinutesBefore: null },
    ];
    await saveEvents(list);
    expect(store.get("@calendar_events")).toBe(JSON.stringify(list));
    expect(await loadEvents()).toEqual(list);
  });

  it("add -> load round-trip: generates an id and persists the event", async () => {
    const created = await addEvent({
      title: "Doctor",
      dateISO: "2026-09-10",
      hour: 9,
      minute: 30,
      note: "bring insurance card",
      reminderMinutesBefore: 30,
    });
    expect(created.id).toEqual(expect.any(String));
    expect(created.id.length).toBeGreaterThan(0);
    expect(created).toMatchObject({ title: "Doctor", note: "bring insurance card" });

    const list = await loadEvents();
    expect(list).toHaveLength(1);
    expect(list[0]).toEqual(created);
  });

  it("two events added back-to-back get different ids", async () => {
    const a = await addEvent({ title: "A", dateISO: "2026-09-10", hour: 9, minute: 0, reminderMinutesBefore: null });
    const b = await addEvent({ title: "B", dateISO: "2026-09-10", hour: 10, minute: 0, reminderMinutesBefore: null });
    expect(a.id).not.toBe(b.id);
  });

  it("update -> load round-trip: patches only the given fields", async () => {
    const created = await addEvent({ title: "Doctor", dateISO: "2026-09-10", hour: 9, minute: 0, reminderMinutesBefore: null });
    const updated = await updateEvent(created.id, { title: "Dentist", hour: 11 });
    expect(updated).toMatchObject({ id: created.id, title: "Dentist", hour: 11, minute: 0, dateISO: "2026-09-10" });

    const list = await loadEvents();
    expect(list).toHaveLength(1);
    expect(list[0].title).toBe("Dentist");
  });

  it("update on an unknown id is a no-op and returns null", async () => {
    await addEvent({ title: "Doctor", dateISO: "2026-09-10", hour: 9, minute: 0, reminderMinutesBefore: null });
    const result = await updateEvent("does-not-exist", { title: "X" });
    expect(result).toBeNull();
    expect(await loadEvents()).toHaveLength(1);
  });

  it("remove -> load round-trip: deletes exactly that event", async () => {
    const a = await addEvent({ title: "A", dateISO: "2026-09-10", hour: 9, minute: 0, reminderMinutesBefore: null });
    const b = await addEvent({ title: "B", dateISO: "2026-09-11", hour: 10, minute: 0, reminderMinutesBefore: null });
    await removeEvent(a.id);
    const list = await loadEvents();
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(b.id);
  });

  it("eventsForDate filters to exactly that day, sorted by time", async () => {
    await addEvent({ title: "Later", dateISO: "2026-09-10", hour: 15, minute: 0, reminderMinutesBefore: null });
    await addEvent({ title: "Other day", dateISO: "2026-09-11", hour: 8, minute: 0, reminderMinutesBefore: null });
    await addEvent({ title: "Earlier", dateISO: "2026-09-10", hour: 9, minute: 0, reminderMinutesBefore: null });

    const day = await eventsForDate("2026-09-10");
    expect(day.map((e) => e.title)).toEqual(["Earlier", "Later"]);
  });

  it("loadEvents recovers from corrupted JSON", async () => {
    store.set("@calendar_events", "{not json");
    expect(await loadEvents()).toEqual([]);
  });

  it("loadEvents tolerates valid-JSON-wrong-shape data instead of throwing", async () => {
    for (const bad of ["null", "{}", "[{bad}]"]) {
      store.set("@calendar_events", bad);
      await expect(loadEvents()).resolves.toEqual([]);
    }
  });

  it("loadEvents filters out malformed entries from an otherwise-valid array", async () => {
    store.set(
      "@calendar_events",
      JSON.stringify([
        { id: "ok1", title: "Good", dateISO: "2026-09-10", hour: 9, minute: 0, reminderMinutesBefore: null },
        { id: "bad1" }, // missing title/dateISO/hour/minute
      ])
    );
    const list = await loadEvents();
    expect(list.map((e) => e.id)).toEqual(["ok1"]);
  });

  it("two interleaved mutations do not lose an event (serialized writes)", async () => {
    const [a, b] = await Promise.all([
      addEvent({ title: "A", dateISO: "2026-09-10", hour: 9, minute: 0, reminderMinutesBefore: null }),
      addEvent({ title: "B", dateISO: "2026-09-10", hour: 10, minute: 0, reminderMinutesBefore: null }),
    ]);
    const list = await loadEvents();
    expect(list).toHaveLength(2);
    expect(list.map((e) => e.id).sort()).toEqual([a.id, b.id].sort());
  });

  it("a getItem rejection during addEvent does not overwrite existing stored events", async () => {
    await addEvent({ title: "Existing", dateISO: "2026-09-10", hour: 9, minute: 0, reminderMinutesBefore: null });

    (AsyncStorage.getItem as any).mockRejectedValueOnce(new Error("boom"));
    await expect(
      addEvent({ title: "New", dateISO: "2026-09-11", hour: 10, minute: 0, reminderMinutesBefore: null })
    ).rejects.toThrow("boom");

    const list = await loadEvents();
    expect(list).toHaveLength(1);
    expect(list[0].title).toBe("Existing");
  });
});
