import AsyncStorage from "@react-native-async-storage/async-storage";

// Family life-events log (Daa3iyah 2966/2968): the user records a family event
// and the screen (app/family-events.tsx) both logs it here and routes to the
// feature that handles it (see resolveAction() there for the per-event target).
export const FAMILY_EVENT_TYPES = ["marriage", "divorce", "pregnancy", "birth"] as const;
export type FamilyEventType = (typeof FAMILY_EVENT_TYPES)[number];

export interface FamilyEvent {
  id: string;
  type: FamilyEventType;
  dateISO: string; // "YYYY-MM-DD"
  note?: string;
}

const KEY = "@family_events";

// One module-wide lock so overlapping add/remove don't clobber each other
// (same pattern as calendar-events.ts).
let chain: Promise<unknown> = Promise.resolve();
function serialize<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.then(() => {}, () => {});
  return run;
}

function isValid(e: any): e is FamilyEvent {
  // Validate `type` against the known set so a corrupt/stale blob with an
  // unrecognized type is dropped rather than rendered as the wrong event.
  return e && typeof e.id === "string" && (FAMILY_EVENT_TYPES as readonly string[]).includes(e.type) && typeof e.dateISO === "string";
}

async function readStrict(): Promise<FamilyEvent[]> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isValid) : [];
  } catch {
    return [];
  }
}

export async function loadFamilyEvents(): Promise<FamilyEvent[]> {
  try {
    // newest first
    return (await readStrict()).sort((a, b) => (a.dateISO < b.dateISO ? 1 : a.dateISO > b.dateISO ? -1 : 0));
  } catch {
    return [];
  }
}

export async function addFamilyEvent(data: Omit<FamilyEvent, "id">): Promise<FamilyEvent> {
  return serialize(async () => {
    const list = await readStrict();
    const event: FamilyEvent = { ...data, id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8) };
    await AsyncStorage.setItem(KEY, JSON.stringify([...list, event]));
    return event;
  });
}

export async function removeFamilyEvent(id: string): Promise<void> {
  return serialize(async () => {
    const list = await readStrict();
    await AsyncStorage.setItem(KEY, JSON.stringify(list.filter((e) => e.id !== id)));
  });
}
