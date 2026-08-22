import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

/**
 * Item 5 (2010): "end partnership" (links.dissolvePartner) must appear ONLY
 * in Settings — removed from every partner-profile/network view. Source-text
 * assertions, same style as tests/spouse-visibility-disclosure.test.ts:
 * asserts absence in the views it was removed from AND presence in Settings
 * (a gate that only checks what must be ABSENT lets the capability vanish
 * silently — see coding-rules.txt).
 *
 * Note: server/routers.ts's `links.removeLink` (a parent-child link /
 * pending-invite remover) is a DIFFERENT procedure and out of scope here —
 * the actual "end an established partnership" control is links.dissolvePartner
 * (see app/spouse-profile.tsx's own renderDissolveAction, pre-change).
 */
const read = (...segments: string[]) => readFileSync(join(__dirname, "..", ...segments), "utf8");

const SPOUSE_PROFILE_SRC = read("app", "spouse-profile.tsx");
const FAMILY_SRC = read("app", "(tabs)", "family.tsx");
const MESSAGES_SRC = read("app", "(tabs)", "messages.tsx");
const SETTINGS_SRC = read("app", "(tabs)", "settings.tsx");

describe("links.dissolvePartner (end-partnership control) lives only in Settings", () => {
  it("removed from spouse-profile.tsx (the partner-profile view it used to render on)", () => {
    expect(SPOUSE_PROFILE_SRC).not.toMatch(/dissolvePartner/);
  });

  it("not present in family.tsx (the co-parents/network view)", () => {
    expect(FAMILY_SRC).not.toMatch(/dissolvePartner/);
  });

  it("not present in messages.tsx (its removeLink is a pending-request accept/reject, a different control)", () => {
    expect(MESSAGES_SRC).not.toMatch(/dissolvePartner/);
  });

  it("IS present in settings.tsx, so the capability still exists somewhere", () => {
    expect(SETTINGS_SRC).toMatch(/trpc\.links\.dissolvePartner\.useMutation/);
  });
});
