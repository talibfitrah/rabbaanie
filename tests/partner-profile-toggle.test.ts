import { describe, it, expect, vi } from "vitest";

// toggleProfileAccess has no react/react-native dependency (see
// lib/partner-profile-toggle.ts's own doc comment for why it lives here
// rather than inline in app/(tabs)/messages.tsx) — plain TS, importable
// with zero mocking, same as lib/profile-labels.ts / lib/sync-refusal.ts
// elsewhere in this test suite.
import { toggleProfileAccess } from "@/lib/partner-profile-toggle";

/**
 * Husband-side proactive control (app/(tabs)/messages.tsx, "صلاحيات الشريكة"
 * section): grant/revoke his wife's access to HIS OWN profile + check-ins,
 * reusing links.grantPartnerProfileAccess / revokePartnerProfileAccess.
 * Distinct from the reactive request-then-grant flow already in
 * app/spouse-profile.tsx — this is a single toggle that flips straight to
 * whichever mutation undoes the CURRENT state.
 */
describe("toggleProfileAccess", () => {
  it("calls grant with the partnership context when currently NOT granted (enabling)", () => {
    const grant = { mutate: vi.fn() };
    const revoke = { mutate: vi.fn() };
    toggleProfileAccess(false, 42, { grant, revoke });
    expect(grant.mutate).toHaveBeenCalledWith({ partnerId: 42 });
    expect(revoke.mutate).not.toHaveBeenCalled();
  });

  it("calls revoke with the partnership context when currently granted (disabling)", () => {
    const grant = { mutate: vi.fn() };
    const revoke = { mutate: vi.fn() };
    toggleProfileAccess(true, 42, { grant, revoke });
    expect(revoke.mutate).toHaveBeenCalledWith({ partnerId: 42 });
    expect(grant.mutate).not.toHaveBeenCalled();
  });

  // Round-9 P0 (tests/partner-profile-access.test.ts) burned this exact class
  // of bug on the server side: a husband with 2+ wives acted on whichever
  // partnership an unordered query happened to return first. This client
  // entry point must not reintroduce it — the SPECIFIC wife's id passed in
  // must be what's sent, not a different or omitted one.
  it("threads the exact partnerId passed in, not a different or omitted one", () => {
    const grant = { mutate: vi.fn() };
    const revoke = { mutate: vi.fn() };
    toggleProfileAccess(false, 999, { grant, revoke });
    expect(grant.mutate).toHaveBeenCalledWith({ partnerId: 999 });
    toggleProfileAccess(true, 12, { grant, revoke });
    expect(revoke.mutate).toHaveBeenCalledWith({ partnerId: 12 });
  });
});
