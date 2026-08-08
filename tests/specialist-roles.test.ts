import { describe, it, expect } from "vitest";
import { FUNCTION_ROLES, getFunctionRoleLabel } from "../lib/specialist-roles";

describe("specialist-roles", () => {
  it("has a label for every server-defined functionRole", () => {
    const ids = FUNCTION_ROLES.map((r) => r.id);
    expect(ids).toEqual([
      "arts",
      "imam",
      "kennisdrager",
      "leraar",
      "maatschappelijk_werker",
      "moeder",
      "opvoedkundige_begeleider",
      "specialist",
      "therapeut",
      "vader",
    ]);
  });

  it("returns the label in the requested language", () => {
    expect(getFunctionRoleLabel("imam", "en")).toBe("Imam");
    expect(getFunctionRoleLabel("imam", "ar")).toBe("إمام");
    expect(getFunctionRoleLabel("imam", "nl")).toBe("Imam");
  });

  it("falls back to the raw id for an unknown role", () => {
    expect(getFunctionRoleLabel("unknown_role" as any, "en")).toBe("unknown_role");
  });
});
