import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApiBaseUrl } from "@/constants/oauth";

/**
 * Server-managed library books (added at runtime, not bundled). Fetched over HTTP
 * and cached in AsyncStorage so they stay readable offline once seen. Server book
 * ids start at 10000, so they never collide with the bundled books (1-49).
 */

const INDEX_CACHE = "@server_book_index";
const bookCache = (id: number) => `@server_book_${id}`;

export async function fetchServerBookIndex(): Promise<any[]> {
  try {
    const res = await fetch(`${getApiBaseUrl()}/api/library/index`);
    if (res.ok) {
      const data = await res.json();
      const arr = Array.isArray(data) ? data : [];
      await AsyncStorage.setItem(INDEX_CACHE, JSON.stringify(arr));
      return arr;
    }
  } catch {}
  // Offline / error → last cached index.
  try {
    const c = await AsyncStorage.getItem(INDEX_CACHE);
    if (c) return JSON.parse(c);
  } catch {}
  return [];
}

export async function fetchServerBook(id: number): Promise<any | null> {
  try {
    const res = await fetch(`${getApiBaseUrl()}/api/library/book/${id}`);
    if (res.ok) {
      const data = await res.json();
      await AsyncStorage.setItem(bookCache(id), JSON.stringify(data));
      return data;
    }
  } catch {}
  try {
    const c = await AsyncStorage.getItem(bookCache(id));
    if (c) return JSON.parse(c);
  } catch {}
  return null;
}
