import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Two callers on a fresh install must not mint two device ids.
 *
 * getDeviceId is awaited concurrently from the ai-chat mount effect, the child
 * screen's backfill effect and archiveConsultation. Read-then-write meant all of
 * them saw null, all minted, all wrote — last write won, and any consultation
 * already POSTed under a losing id was orphaned: it can never appear in the
 * archive again, because the device no longer holds the id it was filed under.
 */
const store = new Map<string, string>();
let setItemCalls = 0;
// A barrier, not a setTimeout. The first attempt yielded with setTimeout(0) and
// the race would not reproduce: setTimeout is a MACROtask while the mint path is
// all microtasks, so caller 1 finished and wrote the id before caller 2's timer
// even fired, and the broken read-then-write code passed. This holds every
// caller inside getItem until all of them have arrived, which is the only way
// they all observe "no id yet" — the actual first-install condition.
let arrived = 0;
let release: () => void;
let barrier = new Promise<void>((r) => { release = r; });
let expectedCallers = 1;

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn(async (k: string) => {
      arrived++;
      if (arrived >= expectedCallers) release();
      // Whichever comes first: every caller arriving (the broken code, where
      // they all reach this), or a short delay (the fixed code, where only one
      // does and waiting for the rest would deadlock). Either way nobody has
      // written yet when the reads resolve.
      await Promise.race([barrier, new Promise((r) => setTimeout(r, 25))]);
      return store.get(k) ?? null;
    }),
    setItem: vi.fn(async (k: string, v: string) => {
      setItemCalls++;
      store.set(k, v);
    }),
  },
}));
vi.mock("expo-crypto", () => ({
  getRandomBytes: () => Uint8Array.from({ length: 32 }, () => Math.floor(Math.random() * 256)),
}));

describe("getDeviceId under concurrency", () => {
  beforeEach(() => {
    store.clear();
    setItemCalls = 0;
    arrived = 0;
    barrier = new Promise<void>((r) => { release = r; });
    vi.resetModules();
  });

  it("gives every concurrent caller the same id on a fresh install", async () => {
    expectedCallers = 4;
    const { getDeviceId } = await import("../lib/device-id");
    const ids = await Promise.all([getDeviceId(), getDeviceId(), getDeviceId(), getDeviceId()]);
    expect(new Set(ids).size, `minted ${new Set(ids).size} different ids: ${[...new Set(ids)].join(", ")}`).toBe(1);
    expect(setItemCalls, "wrote the id more than once").toBe(1);
  });

  it("returns the stored id without minting when one already exists", async () => {
    expectedCallers = 2;
    store.set("@device_id", "device_existing");
    const { getDeviceId } = await import("../lib/device-id");
    const ids = await Promise.all([getDeviceId(), getDeviceId()]);
    expect(ids).toEqual(["device_existing", "device_existing"]);
    expect(setItemCalls).toBe(0);
  });
});
