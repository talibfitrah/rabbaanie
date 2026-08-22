// Pure routing logic for app/admin/broadcast.tsx's submit(), split out of that
// file specifically so it has zero react-native/expo-router imports and can be
// unit-tested directly (tests/broadcast-admin-submit.test.ts) -- importing
// broadcast.tsx itself pulls in react-native's Alert submodule, which ships
// Flow syntax vitest's Vite/Rollup pipeline cannot parse (confirmed by
// bisection: `import { Alert } from "react-native"` alone breaks under
// vitest here, independent of anything in this feature). broadcast.tsx keeps
// owning CATEGORIES (with its Arabic preview strings, pinned by
// tests/broadcast-admin-preview.test.ts) and only imports the types/function
// below.

export type CategoryKey = "incompleteAnalytical" | "incompleteChildren" | "incompletePersonal" | "notLinkedSpouse";

export type CategoryConfig = {
  key: CategoryKey;
  label: string;
  description: string;
  /** All four categories are sendable now that sendBroadcast accepts
   *  `category` (see local-docs/BROADCAST-ROUTER-PATCH.md). Kept as a field,
   *  not hardcoded true, so a future category can still be staged here
   *  disabled before its server-side wiring lands. */
  sendReady: boolean;
  pendingNote?: string;
  titleAr?: string;
  bodyAr?: string;
};

export type BroadcastSendPayload =
  | { category: CategoryKey; roles: string[]; audience: unknown }
  | { subject: string; message: string; roles: string[]; audience: unknown };

export type BuildSendResult =
  | { ok: true; payload: BroadcastSendPayload }
  | { ok: false; reason: "not-ready" | "missing-fields" };

// Decides what submit() sends for the current selection. Any selected,
// sendReady category -- all four today -- always routes through `{ category
// }` so the server's broadcastLocalizedPush renders the real trilingual
// template per recipient; the on-screen subject/message fields only matter
// in true manual mode (no category picked).
export function buildSendPayload(
  activeCategory: CategoryConfig | null,
  subject: string,
  message: string,
  roles: string[],
  audience: unknown,
): BuildSendResult {
  if (activeCategory && !activeCategory.sendReady) return { ok: false, reason: "not-ready" };
  if (activeCategory) return { ok: true, payload: { category: activeCategory.key, roles, audience } };
  if (!subject.trim() || !message.trim()) return { ok: false, reason: "missing-fields" };
  return { ok: true, payload: { subject: subject.trim(), message: message.trim(), roles, audience } };
}
