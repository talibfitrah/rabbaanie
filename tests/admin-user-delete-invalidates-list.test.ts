import { beforeEach, describe, expect, it, vi } from "vitest";

// app/admin/user.tsx is a React Native screen, so every module it imports at
// module scope needs a stub before it can be imported at all — same recipe as
// tests/child-ai-chat-persistence.test.ts. React itself is NOT stubbed: this
// screen calls no useState/useEffect, so calling the component function is a
// faithful stand-in for a first render, and the real jsx runtime builds the
// element tree from the string stubs below.
vi.mock("react-native", () => ({
  View: "View",
  Text: "Text",
  TouchableOpacity: "TouchableOpacity",
  ScrollView: "ScrollView",
  ActivityIndicator: "ActivityIndicator",
  Alert: { alert: vi.fn() },
  Linking: { openURL: vi.fn() },
}));
vi.mock("@expo/vector-icons/MaterialIcons", () => ({ default: "MaterialIcons" }));
vi.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) }));
vi.mock("@/hooks/use-colors", () => ({
  useColors: () =>
    new Proxy({}, { get: (_t, key) => (key === Symbol.toPrimitive ? () => "#000" : "#000") }),
}));
vi.mock("@/lib/i18n", () => ({ useI18n: () => ({ isRTL: true }) }));

const DELETED_ID = 22710041;

// Stands in for the react-query cache behind trpc.admin.users: the screen's own
// query reads it, and the delete path is expected to write through it. Both the
// invalidate log and the cache contents are the behaviour under test, and
// neither is observable from the returned element tree.
const h = vi.hoisted(() => ({
  cache: [] as any[],
  // The rows as production actually holds them after a delete: db.deleteUser is
  // a SOFT delete that anonymises the row and stamps deletedAt, so the row still
  // exists. What keeps it off this list is the deployed API filtering it out of
  // getAllUsers. serverRows models that DB, serverResponse models that filter —
  // so invalidate() below is a real refetch, not a no-op. If the server-side
  // filter is ever dropped, serverResponse is the line that has to change, and
  // the last assertion here fails rather than the bug shipping silently.
  serverRows: [] as any[],
  invalidated: [] as string[],
  deleteOpts: undefined as any,
  backCalls: 0,
}));

const serverResponse = () => h.serverRows.filter((u) => !u.deletedAt);

vi.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: String(22710041) }),
  useRouter: () => ({ back: () => { h.backCalls += 1; } }),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      admin: {
        users: {
          invalidate: async () => {
            h.invalidated.push("admin.users");
            h.cache = serverResponse();
          },
          setData: (_input: unknown, updater: (old: any[]) => any[]) => { h.cache = updater(h.cache); },
        },
      },
    }),
    admin: {
      users: {
        useQuery: () => ({ data: h.cache, isLoading: false, refetch: async () => {} }),
      },
      updateUserRoles: { useMutation: () => ({ mutate: () => {}, isPending: false }) },
      deleteUser: {
        useMutation: (opts: any) => {
          h.deleteOpts = opts;
          return { mutate: () => {}, isPending: false };
        },
      },
    },
  },
}));

import { Alert } from "react-native";
import AdminUserDetailScreen from "@/app/admin/user";

describe("admin user deletion — the list must not keep showing the deleted user", () => {
  beforeEach(() => {
    h.cache = [
      { id: DELETED_ID, name: "Deleted Target", email: "stats.n.free@gmail.com", role: "user" },
      { id: 22710090, name: "Someone Else", email: "lmhaya@proton.me", role: "user" },
    ];
    // Post-delete DB state: the row survives, anonymised and stamped — exactly
    // what production holds (verified live: email/name/pushToken null,
    // profileData {}, deletedAt set).
    h.serverRows = [
      { id: DELETED_ID, name: null, email: null, role: "user", deletedAt: "2026-08-28T23:02:54.138Z" },
      { id: 22710090, name: "Someone Else", email: "lmhaya@proton.me", role: "user", deletedAt: null },
    ];
    h.invalidated = [];
    h.deleteOpts = undefined;
    h.backCalls = 0;
    vi.mocked(Alert.alert).mockClear();
  });

  it("drops the user from the cached list synchronously, so the list is correct the moment it is shown again", async () => {
    AdminUserDetailScreen();
    expect(h.deleteOpts, "deleteUser.useMutation was never configured").toBeDefined();

    // Deliberately NOT awaited: "immediately" means the list is already correct
    // before the refetch resolves. Awaiting here would let a fix that relies
    // purely on the network round-trip pass.
    const pending = h.deleteOpts.onSuccess();

    // The whole reported bug: without a cache write the deleted user is still
    // in the list the user navigates back to, for as long as the query stays
    // fresh (staleTime 5min / gcTime 24h in app/_layout.tsx).
    expect(h.cache.map((u) => u.id)).toEqual([22710090]);
    await pending;
  });

  it("also invalidates admin.users so the cache reconciles with the server", async () => {
    AdminUserDetailScreen();
    await h.deleteOpts.onSuccess();

    expect(h.invalidated).toContain("admin.users");
  });

  it("the refetch that invalidation triggers does not bring the deleted user back", async () => {
    AdminUserDetailScreen();
    await h.deleteOpts.onSuccess();

    // onSuccess already awaited the invalidate above, so h.cache now holds a
    // real server response rather than the optimistic write. The deleted user
    // must still be absent — an optimistic removal that a refetch undoes is
    // the same bug with a longer fuse.
    expect(h.cache.map((u) => u.id)).toEqual([22710090]);
  });

  it("still navigates back after deleting", async () => {
    AdminUserDetailScreen();
    await h.deleteOpts.onSuccess();

    expect(h.backCalls).toBe(1);
  });

  // The server genuinely refuses some deletions — RoleWriteRefused for the
  // owner account or any super_admin target. With no onError those throws
  // produced no alert and no navigation, i.e. the row just stayed put, which
  // is indistinguishable from the stale-cache bug this file exists for.
  it("surfaces the server's refusal instead of failing silently", () => {
    AdminUserDetailScreen();
    expect(h.deleteOpts.onError, "deleteUser has no onError — refusals are silent").toBeDefined();

    h.deleteOpts.onError({ message: "لا يمكن حذف حساب المالك" });

    const [, body] = vi.mocked(Alert.alert).mock.calls.at(-1)!;
    expect(body).toBe("لا يمكن حذف حساب المالك");
    expect(h.backCalls, "a refused delete must not navigate away").toBe(0);
  });

  it("falls back to a readable message when the error carries none", () => {
    AdminUserDetailScreen();
    h.deleteOpts.onError({});

    const [, body] = vi.mocked(Alert.alert).mock.calls.at(-1)!;
    expect(body, "an empty error must not render an empty alert").toBeTruthy();
  });
});
