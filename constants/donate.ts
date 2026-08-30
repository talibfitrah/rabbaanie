/**
 * Sadaqah / donation link for the in-app "تصدّق" buttons (msg 564/577).
 * Canonical card/online payment link Daa3iyah provided; used as the fallback
 * when the server's remote-config value (useRemoteConfig().donateUrl) is
 * empty. Set it here once — both the home-screen button and the settings row
 * route to app/donate.tsx, which reads from this single constant.
 */
export const DONATE_URL = "https://pay.albunyaan.tv/b/6oUeVd4UX5qOdSh0LUbjW0x";

/** bunq.me donation link — Netherlands & Belgium residents only. */
export const BUNQ_URL = "https://bunq.me/da3wahprojecten";

/** Bank-transfer destination shown on app/donate.tsx, alongside the two links above. */
export const BANK_TRANSFER_DETAILS = {
  beneficiary: "Stichting al-Asr",
  iban: "NL49 BUNQ 2069 8448 38",
  swift: "BUNQNL2A",
};
