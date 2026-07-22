import { useAuthContext } from "@/lib/auth-context";

type UseAuthOptions = {
  autoFetch?: boolean;
};

/**
 * Hook to access auth state. Delegates to the shared AuthProvider context.
 * All consumers share the same auth state, so when OAuth callback updates it,
 * all screens immediately see the change.
 */
export function useAuth(_options?: UseAuthOptions) {
  const { user, loading, error, isAuthenticated, refresh, logout } = useAuthContext();

  return {
    user,
    loading,
    error,
    isAuthenticated,
    refresh,
    logout,
  };
}
