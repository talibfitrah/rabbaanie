/**
 * Race a promise against a timeout so a native call that never settles — e.g.
 * expo-location's getCurrentPositionAsync on a weak/indoor GPS signal, or
 * reverseGeocodeAsync on a device without Google Play Services — can never
 * strand a loading spinner forever. Rejects with an Error("timeout") when the
 * deadline passes; the original promise's own result/rejection wins if it
 * settles first.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race<T>([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms)),
  ]);
}
