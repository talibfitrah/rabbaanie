import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

// lib/notification-settings reaches AsyncStorage only inside its functions; a
// stub lets the pure export import in vitest (same recipe as advice-prefs).
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} },
}));

import { rulingLabel } from "@/lib/notification-settings";

const modal = readFileSync(join(__dirname, "..", "components", "prayer-popup-modal.tsx"), "utf8");
const adhkar = readFileSync(join(__dirname, "..", "app", "details", "adhkar.tsx"), "utf8");

/**
 * Bug: the prayer popup's ruling badge (and the per-dhikr badge on the adhkar
 * list) rendered the ruling verbatim, and that value is one of three Arabic
 * literals («واجب» | «سنة مؤكدة» | «مستحب») — so a Dutch/English user got an
 * Arabic badge on every reminder and every dhikr.
 *
 * The modal is rendered in app/_layout.tsx AFTER </I18nProvider> closes, so
 * useI18n()/t() would throw there. The mapper is therefore pure and takes the
 * language; it lives beside RULING_COLORS, which keys on the same literals.
 */
describe("ruling badge in the user's language", () => {
  it("translates the three known rulings", () => {
    expect(rulingLabel("واجب", "nl")).toBe("Verplicht");
    expect(rulingLabel("واجب", "en")).toBe("Obligatory");
    expect(rulingLabel("واجب", "ar")).toBe("واجب");
    expect(rulingLabel("سنة مؤكدة", "nl")).toBe("Bevestigde sunnah");
    expect(rulingLabel("سنة مؤكدة", "en")).toBe("Confirmed sunnah");
    expect(rulingLabel("سنة مؤكدة", "ar")).toBe("سنة مؤكدة");
    expect(rulingLabel("مستحب", "nl")).toBe("Aanbevolen");
    expect(rulingLabel("مستحب", "en")).toBe("Recommended");
    expect(rulingLabel("مستحب", "ar")).toBe("مستحب");
  });

  it("renders an unknown ruling value as-is", () => {
    expect(rulingLabel("فرض كفاية", "nl")).toBe("فرض كفاية");
  });

  it("both badges go through the mapper, never the raw value", () => {
    expect(modal).toContain("rulingLabel(notification.ruling");
    expect(modal).not.toContain("{notification.ruling}");
    // No Arabic first frame in a Dutch/English popup: the language starts unknown.
    expect(modal).not.toMatch(/useState<[^>]*>\("ar"\)/);
    expect(adhkar).toContain("rulingLabel(item.ruling");
    expect(adhkar).not.toContain("{item.ruling}");
  });
});
