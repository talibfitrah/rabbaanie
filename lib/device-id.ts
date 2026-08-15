import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";

const DEVICE_ID_KEY = "@device_id";

/**
 * Stable per-install ID that ties anonymous advisor consultations to one device.
 * Both the Q&A advisor and the per-child advisor must resolve the same ID, or a
 * consultation saved by one is invisible in the other's archive.
 *
 * The server uses this to decide whether a caller may open or delete a stored
 * consultation, so it is a capability token, not just a cache key: it is
 * generated with a CSPRNG. Math.random() would not do — it is predictable, and a
 * guessed ID would expose another family's consultation.
 *
 * An ID already on the device is kept as-is. Regenerating would orphan that
 * install's archive, and the weaker legacy IDs are not worth that cost.
 */
/**
 * In-flight read-or-mint, so concurrent callers share one result.
 *
 * getDeviceId is awaited from several places at once — the ai-chat screen's
 * mount effect, the child screen's backfill effect and archiveConsultation all
 * call it. On a first-ever install every one of them saw `null`, every one
 * minted its own id, and every one wrote it: last write wins, and a
 * consultation already POSTed under a losing id belongs to a device id that no
 * longer exists on the device. It cannot appear in the archive again, ever.
 *
 * A module-level promise collapses that to a single read-and-write. Not a
 * lock — the second caller simply awaits the first caller's promise.
 */
let pending: Promise<string> | null = null;

export async function getDeviceId(): Promise<string> {
  if (pending) return pending;
  pending = (async () => {
    const existing = await AsyncStorage.getItem(DEVICE_ID_KEY);
    if (existing) return existing;
    const bytes = Crypto.getRandomBytes(32);
    const id =
      "device_" +
      Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    await AsyncStorage.setItem(DEVICE_ID_KEY, id);
    return id;
  })();
  try {
    return await pending;
  } catch (err) {
    // Never cache a rejected promise: a transient storage failure would
    // otherwise make every later call fail for the lifetime of the process.
    pending = null;
    throw err;
  }
}
