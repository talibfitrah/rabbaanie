import { describe, expect, it } from "vitest";
import { DONATE_URL, BUNQ_URL, BANK_TRANSFER_DETAILS } from "@/constants/donate";

/**
 * Money-path literals: the card-payment link, the bunq.me link, and the bank-
 * transfer beneficiary/IBAN/SWIFT are baked into the app with no server-side
 * check — a typo here sends a donor's money nowhere, or to the wrong account.
 * constants/donate.ts has no react-native import, so asserting on these needs
 * no mocking (contrast tests/remote-config-safety.test.ts, which mocks 5
 * modules to reach the hook that wraps the SERVER-supplied donate link).
 */
describe("donate constants (money path)", () => {
  it("card-payment fallback is the canonical pay.albunyaan.tv link", () => {
    expect(DONATE_URL).toBe("https://pay.albunyaan.tv/b/6oUeVd4UX5qOdSh0LUbjW0x");
  });

  it("bunq (NL/BE) link is the canonical bunq.me link", () => {
    expect(BUNQ_URL).toBe("https://bunq.me/da3wahprojecten");
  });

  it("both donation links are https — Linking.openURL is handed these with no other check", () => {
    expect(DONATE_URL.startsWith("https://")).toBe(true);
    expect(BUNQ_URL.startsWith("https://")).toBe(true);
  });

  it("bank-transfer details match exactly what Daa3iyah gave", () => {
    expect(BANK_TRANSFER_DETAILS).toEqual({
      beneficiary: "Stichting al-Asr",
      iban: "NL49 BUNQ 2069 8448 38",
      swift: "BUNQNL2A",
    });
  });
});
