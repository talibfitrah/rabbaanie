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
export async function getDeviceId(): Promise<string> {
  let id = await AsyncStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    const bytes = Crypto.getRandomBytes(32);
    id =
      "device_" +
      Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    await AsyncStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}
