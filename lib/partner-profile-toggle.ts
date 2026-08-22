/**
 * Husband-side proactive control (app/(tabs)/messages.tsx, "صلاحيات الشريكة"
 * section): grant or revoke his wife's access to HIS OWN profile + check-ins
 * without waiting for her to request it — distinct from the reactive
 * request-then-grant flow already in app/spouse-profile.tsx, though both
 * ultimately call the same two server procedures
 * (links.grantPartnerProfileAccess / revokePartnerProfileAccess).
 *
 * Kept in lib/ (no react/react-native import) rather than inline in
 * messages.tsx so it's testable with zero mocking, matching this repo's own
 * convention for pure decision logic (lib/sync-refusal.ts,
 * lib/profile-labels.ts, lib/plan-blocks.ts) — messages.tsx pulls in
 * expo-router/expo-haptics/react-native-qrcode-svg and several hook/
 * component modules that a co-located version would need mocked just to be
 * imported, unlike the small, focused react-native + MaterialIcons mock
 * treatment-plan-renderer.tsx's own extracted functions get away with.
 *
 * `granted` is the CURRENT state (links.getPartnerProfile's
 * grantedToPartner); a tap flips it, so "currently granted" fires revoke and
 * "currently not granted" fires grant — both against the exact `partnerId`
 * passed in (the specific wife's partnership), never an omitted one. Server
 * round-9 P0 (tests/partner-profile-access.test.ts) is exactly the bug an
 * omitted/wrong id would reintroduce on a multi-wife household.
 */
export function toggleProfileAccess(
  granted: boolean,
  partnerId: number,
  mutations: {
    grant: { mutate: (args: { partnerId: number }) => void };
    revoke: { mutate: (args: { partnerId: number }) => void };
  },
): void {
  const target = granted ? mutations.revoke : mutations.grant;
  target.mutate({ partnerId });
}
