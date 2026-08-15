type PlanSectionOwner = { label: string; role: "parent" | "child" };

/**
 * The Arabic treatment plan already separates "مهام الوالد" from "مهام الابن/البنت",
 * but the headings read like any other section, so who-does-what is easy to miss.
 * This picks the owner out of a section title so the UI can show it plainly.
 *
 * The label reuses the plan's own word, so a daughter's plan says البنت and a son's
 * says الابن without guessing gender. Returns null when a title carries no owner
 * marker (the en/nl plans), so those render unchanged.
 */
export function sectionOwner(title: string): PlanSectionOwner | null {
  const ar = title.match(/مهام\s+(الوالدين|الوالد|الأب|الأم|الابن|البنت|الولد)/);
  if (ar) {
    const word = ar[1];
    return {
      label: word,
      role: /^(الابن|البنت|الولد)$/.test(word) ? "child" : "parent",
    };
  }
  if (/what must the parent|parent tasks/i.test(title)) {
    return { label: "Parent", role: "parent" };
  }
  if (/wat moet de ouder|taken van de ouder/i.test(title)) {
    return { label: "Ouder", role: "parent" };
  }
  return null;
}
