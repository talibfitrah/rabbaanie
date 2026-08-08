import AsyncStorage from "@react-native-async-storage/async-storage";

import { authedFetch } from "@/lib/authed-fetch";
const LANGUAGE_STORAGE_KEY = "@app_language";

/**
 * Push the app's language to the server (users.language) so server-originated
 * notifications use it instead of the "nl" default. The language is usually
 * chosen at onboarding BEFORE login, so on its own it never reaches the server —
 * this is called both when the language changes AND when the user authenticates
 * (push-token registration). Best-effort and silent: a missing session token or
 * a network error is a no-op.
 */
export async function syncLanguageToServer(lang?: string): Promise<void> {
  try {
    const { getSessionToken } = require("@/lib/_core/auth");
    const { getApiBaseUrl } = require("@/constants/oauth");
    const token = await getSessionToken();
    if (!token) return;
    let language = lang;
    if (language !== "ar" && language !== "en" && language !== "nl") {
      const stored = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);
      language = stored === "ar" || stored === "en" || stored === "nl" ? stored : undefined;
    }
    if (!language) return;
    await authedFetch(`/api/trpc/profile.updateLanguage`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ json: { language } }),
    });
  } catch {
    /* best-effort */
  }
}
