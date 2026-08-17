import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

/**
 * The owner-mandated disclosure shown before a woman links her partner (a
 * husband reads his wife's profile unconditionally, so she must be told before
 * she writes it). It has now been wrong twice in the same way, which is why it
 * gets its own guard:
 *
 * 1. Gated on `userGender === "vrouw"`.
 * 2. Widened to `userGender !== "man"` — which changed NOTHING, because
 *    `userGender` is `state.parentProfile.gender || "man"`, so an unrecorded
 *    local gender had already collapsed to "man" before the gate saw it. The
 *    comment above it claimed it failed open; it did not.
 *
 * The case that matters is precisely the one both versions missed: a woman
 * whose gender lives only in the server's `users.gender` column with the local
 * JSON copy never backfilled — the legacy shape `resolveGender` exists for.
 *
 * So this asserts the invariant that survived: the gate reads a value derived
 * WITHOUT the "man" fallback. Anchored on that derivation rather than on the
 * JSX, so renaming the flag or moving the notice still passes as long as the
 * fallback is not reintroduced into the decision.
 */
const SRC = readFileSync(
  join(__dirname, "..", "app", "(tabs)", "messages.tsx"),
  "utf8",
);

describe("spouse-visibility disclosure covers women whose gender is not in local state", () => {
  it("the gate is not driven by the '|| \"man\"' defaulted value", () => {
    const gate = SRC.match(/\{!?(\w+)\s*(?:!==\s*"man"\s*)?&&\s*<SpouseVisibilityNotice/);
    expect(gate, "SpouseVisibilityNotice gate not found").toBeTruthy();
    const flag = gate![1];
    // Whatever drives it must not be the defaulted userGender.
    expect(flag).not.toBe("userGender");
  });

  it("the flag it IS driven by is derived from the raw profile gender", () => {
    const gate = SRC.match(/\{!?(\w+)\s*&&\s*<SpouseVisibilityNotice/);
    const flag = gate![1];
    const decl = SRC.match(
      new RegExp(`const ${flag}\\s*=\\s*([^;]+);`),
    );
    expect(decl, `no declaration found for ${flag}`).toBeTruthy();
    // Reads parentProfile.gender directly, with no "man" fallback folded in.
    expect(decl![1]).toContain("parentProfile.gender");
    expect(decl![1]).not.toContain('|| "man"');
  });

  it("userGender still keeps its default, so the relationship labels are unaffected", () => {
    // Asserting PRESENCE too: the fix must not have been made by stripping the
    // default that getRelationshipLabel and InvitePartnerForm rely on.
    expect(SRC).toMatch(/const userGender = state\.parentProfile\.gender \|\| "man";/);
  });
});
