type Lang = "nl" | "en" | "ar";
const tx = (l: Lang, nl: string, en: string, ar: string) =>
  l === "ar" ? ar : l === "en" ? en : nl;

/**
 * Count-aware spouse-section title (Daa3iyah 2026-09-04, "same principle
 * across the whole app"): a husband sees الزوجة / الزوجتان / الزوجات for
 * 1 / 2 / 3+ current wives, a wife sees الزوج, and 0 confirmed spouses (or
 * unknown viewer gender) falls back to the neutral الشريك/ة. `count` is the
 * number of CURRENT confirmed spouses (listPartners filtered on confirmed),
 * never coParents — the latter also includes a divorced ex.
 */
export function spouseSectionTitle(
  lang: string,
  viewerGender: string | null | undefined,
  count: number,
): string {
  const l = lang as Lang;
  if (count > 0 && viewerGender === "man")
    return tx(
      l,
      count > 1 ? "Echtgenotes" : "Echtgenote",
      count > 1 ? "Wives" : "Wife",
      count === 1 ? "الزوجة" : count === 2 ? "الزوجتان" : "الزوجات",
    );
  if (count > 0 && viewerGender === "vrouw")
    return tx(l, "Echtgenoot", "Husband", "الزوج");
  return tx(l, "Partner", "Partner", "الشريك/ة");
}
