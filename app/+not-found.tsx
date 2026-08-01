import { useEffect } from "react";

import { Redirect, usePathname } from "expo-router";

import { useAuthContext } from "@/lib/auth-context";

// Dead routes (e.g. old `rabbaanie:///register` deep links) would otherwise hit
// expo-router's developer-facing "Unmatched Route" page. Redirect straight to the
// right place rather than via /(tabs), which would flash protected chrome for a
// frame before AuthGate corrected it.
export default function NotFoundScreen() {
  const { isAuthenticated } = useAuthContext();
  const pathname = usePathname();

  // Redirecting hides broken internal `router.push("… as any")` links that used to
  // surface as the Unmatched Route screen, so keep them visible in development.
  useEffect(() => {
    if (__DEV__) console.warn(`[NotFound] no route for "${pathname}" — redirecting`);
  }, [pathname]);

  return <Redirect href={isAuthenticated ? "/(tabs)" : "/login"} />;
}
