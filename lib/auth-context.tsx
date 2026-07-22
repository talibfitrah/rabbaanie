import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Platform } from "react-native";
import * as Auth from "@/lib/_core/auth";
import * as Api from "@/lib/_core/api";

type AuthContextType = {
  user: Auth.User | null;
  loading: boolean;
  error: Error | null;
  isAuthenticated: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
  /** Called by OAuth callback to immediately set auth state without re-fetching */
  setAuthState: (user: Auth.User, token: string) => Promise<void>;
};

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
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
        console.log("[AuthProvider] Using cached user:", cachedUser.name);
        setUser(cachedUser);
      } else {
        console.log("[AuthProvider] No cached user info");
        setUser(null);
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error("Failed to fetch user");
      console.error("[AuthProvider] fetchUser error:", error);
      setError(error);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await Api.logout();
    } catch (err) {
      console.error("[AuthProvider] Logout API call failed:", err);
    } finally {
      await Auth.removeSessionToken();
      await Auth.clearUserInfo();
      setUser(null);
      setError(null);
    }
  }, []);

  /**
   * Called by OAuth callback to immediately update auth state.
   * This avoids the race condition where AuthGate checks stale state.
   */
  const setAuthState = useCallback(async (userInfo: Auth.User, token: string) => {
    console.log("[AuthProvider] setAuthState called for user:", userInfo.name);
    // Store in SecureStore
    await Auth.setSessionToken(token);
    await Auth.setUserInfo(userInfo);
    // Update React state immediately
    setUser(userInfo);
    setLoading(false);
    setError(null);
    console.log("[AuthProvider] Auth state updated, isAuthenticated: true");
  }, []);

  const isAuthenticated = useMemo(() => Boolean(user), [user]);

  // Initial auth check on mount
  useEffect(() => {
    console.log("[AuthProvider] Initial mount, checking auth...");
    // Both web and native: check cached user first for instant startup
    Auth.getUserInfo().then((cachedUser) => {
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
          Auth.getSessionToken().then((token) => {
            if (token) {
              console.log("[AuthProvider] Native: cached user + token found");
              setUser(cachedUser);
            } else {
              console.log("[AuthProvider] Native: cached user but no token");
              Auth.clearUserInfo();
              setUser(null);
            }
            setLoading(false);
          });
        }
      } else {
        // No cached user - try fetching from server
        fetchUser();
      }
    });
  }, [fetchUser]);

  const value = useMemo(
    () => ({
      user,
      loading,
      error,
      isAuthenticated,
      refresh: fetchUser,
      logout,
      setAuthState,
    }),
    [user, loading, error, isAuthenticated, fetchUser, logout, setAuthState],
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
