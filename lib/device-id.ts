import AsyncStorage from "@react-native-async-storage/async-storage";

const DEVICE_ID_KEY = "@device_id";

/**
 * Stable per-install ID that ties anonymous advisor consultations to one device.
 * Both the Q&A advisor and the per-child advisor must resolve the same ID, or a
 * consultation saved by one is invisible in the other's archive.
 */
export async function getDeviceId(): Promise<string> {
  let id = await AsyncStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = `device_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    await AsyncStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}
