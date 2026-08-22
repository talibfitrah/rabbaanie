import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Platform } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import * as Auth from "@/lib/_core/auth";
import * as Api from "@/lib/_core/api";
import { clearPersistedQueryCache } from "@/lib/query-persistence";

type AuthContextType = {
  user: Auth.User | null;
  loading: boolean;
  error: Error | null;
  isAuthenticated: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
  /** Verifies a native session token with the API before persisting auth state. */
  completeTokenSignIn: (token: string) => Promise<void>;
};

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<Auth.User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchUser = useCallback(async () => {
    console.log("[AuthProvider] fetchUser called");
    try {
      setLoading(true);
      setError(null);

      if (Platform.OS === "web") {
        console.log("[AuthProvider] Web platform: fetching user from API...");
        const apiUser = await Api.getMe();
        if (apiUser) {
          const userInfo: Auth.User = {
            id: apiUser.id,
            openId: apiUser.openId,
            name: apiUser.name,
            email: apiUser.email,
            loginMethod: apiUser.loginMethod,
            lastSignedIn: new Date(apiUser.lastSignedIn),
          };
          setUser(userInfo);
          await Auth.setUserInfo(userInfo);
        } else {
          // Only clear if we don't already have a cached user (don't log out on network failure)
          const cachedUser = await Auth.getUserInfo();
          if (!cachedUser) {
            setUser(null);
          }
        }
        return;
      }

      // Native platform: use token-based auth
      console.log("[AuthProvider] Native: checking for session token...");
      const sessionToken = await Auth.getSessionToken();
      if (!sessionToken) {
        console.log("[AuthProvider] No session token, user is null");
        setUser(null);
        return;
      }

      // Use cached user info for native
      const cachedUser = await Auth.getUserInfo();
      if (cachedUser) {
        console.log("[AuthProvider] Using cached native user");
        setUser(cachedUser);
      } else {
        console.log("[AuthProvider] No cached user info");
        setUser(null);
      }
    } catch (err) {
      const error =
        err instanceof Error ? err : new Error("Failed to fetch user");
      console.error("[AuthProvider] fetchUser error:", error);
      setError(error);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    await Auth.markLogoutPending();
    try {
      // Bound the server call: a hung connection must not delay the local
      // credential wipe. The pending marker above covers the crash path.
      await Promise.race([
        Api.logout(),
        new Promise((resolve) => setTimeout(resolve, 5_000)),
      ]);
    } catch (err) {
      console.error("[AuthProvider] Logout API call failed:", err);
    }

    try {
      await Auth.removeSessionToken();
      await Auth.clearUserInfo();
      await Auth.clearLogoutPending();
      // Cached query results are device-global (one "rq_offline_cache" key,
      // no account scoping) and outlive the session by up to 7 days, and
      // restoreQueryCache reloads them into whoever opens the app next. The
      // next account on this device would otherwise render the previous
      // one's data — now including full partner profiles behind the access
      // gate: psychologist notes, children, issues. In-memory first, then
      // the persisted copy, so a re-persist triggered by the clear can only
      // ever write an already-empty cache.
      queryClient.clear();
      await clearPersistedQueryCache();
      setUser(null);
      setError(null);
    } catch (err) {
      const cleanupError =
        err instanceof Error ? err : new Error("Secure logout failed");
      setError(cleanupError);
      throw cleanupError;
    }
  }, [queryClient]);

  const completeTokenSignIn = useCallback(async (token: string) => {
    const userInfo = await Api.verifySessionToken(token);
    await Auth.markLogoutPending();
    try {
      // Cached query results are device-global (one "rq_offline_cache" key,
      // no account scoping — see logout()'s own wipe above) and outlive a
      // session by up to 7 days. logout() only wipes them when a session
      // ENDS cleanly through this app; a session that just stops (killed,
      // backgrounded, token expiry) never calls it, so the stale cache
      // survives and app/_layout.tsx's restoreQueryCache injects it into the
      // query client at next launch — before this function, or any auth
      // check, ever runs. Wiping here as well means a NEW session starts
      // clean regardless of how the previous one ended, not only when it
      // ended through logout(). In-memory first, then the persisted copy,
      // matching logout()'s own order.
      queryClient.clear();
      await clearPersistedQueryCache();
      await Auth.setSessionToken(token);
      await Auth.setUserInfo(userInfo);
      await Auth.clearLogoutPending();
      setUser(userInfo);
      setLoading(false);
      setError(null);
    } catch (error) {
      await Promise.allSettled([
        Auth.removeSessionToken(),
        Auth.clearUserInfo(),
      ]);
      setUser(null);
      throw error;
    }
  }, [queryClient]);

  const isAuthenticated = useMemo(() => Boolean(user), [user]);

  // Initial auth check on mount
  useEffect(() => {
    console.log("[AuthProvider] Initial mount, checking auth...");
    let cancelled = false;

    const restoreAuth = async () => {
      if (await Auth.isLogoutPending()) {
        try {
          await Auth.removeSessionToken();
          await Auth.clearUserInfo();
          await Auth.clearLogoutPending();
          // The same wipe logout() does, for the logout that never finished
          // it. restoreQueryCache has already reloaded the previous account's
          // data by the time this runs, so skipping it here would leak by the
          // crash path exactly what logout() closes by the normal one.
          queryClient.clear();
          await clearPersistedQueryCache();
        } catch (err) {
          if (!cancelled) {
            setError(
              err instanceof Error ? err : new Error("Secure logout failed"),
            );
          }
        }
        if (!cancelled) {
          setUser(null);
          setLoading(false);
        }
        return;
      }

      // Both web and native: check cached user first for instant startup
      const cachedUser = await Auth.getUserInfo();
      if (cancelled) return;
      if (cachedUser) {
        if (Platform.OS === "web") {
          // Web: trust cached user info (cookie may still be valid)
          console.log("[AuthProvider] Web: cached user found, using it");
          setUser(cachedUser);
          setLoading(false);
          // Optionally verify in background without blocking
          fetchUser().catch(() => {});
        } else {
          // Native: also verify we have a token
          const token = await Auth.getSessionToken();
          if (!cancelled) {
            if (token) {
              console.log("[AuthProvider] Native: cached user + token found");
              setUser(cachedUser);
            } else {
              console.log("[AuthProvider] Native: cached user but no token");
              Auth.clearUserInfo();
              setUser(null);
            }
            setLoading(false);
          }
        }
      } else {
        // No cached user - try fetching from server
        fetchUser();
      }
    };

    void restoreAuth();
    return () => {
      cancelled = true;
    };
  }, [fetchUser, queryClient]);

  const value = useMemo(
    () => ({
      user,
      loading,
      error,
      isAuthenticated,
      refresh: fetchUser,
      logout,
      completeTokenSignIn,
    }),
    [
      user,
      loading,
      error,
      isAuthenticated,
      fetchUser,
      logout,
      completeTokenSignIn,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Hook to access the shared auth context.
 * Must be used within an AuthProvider.
 */
export function useAuthContext(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuthContext must be used within an AuthProvider");
  }
  return context;
}
