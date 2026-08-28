import { createTRPCReact } from "@trpc/react-query";
import { httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import type { AppRouter } from "@/server/routers";
import { getApiBaseUrl } from "@/constants/oauth";
import * as Auth from "@/lib/_core/auth";
import { CLIENT_VERSION_HEADERS } from "@/hooks/use-updates";
import { markIfVersionBlocked } from "@/lib/app-version";

/**
 * tRPC React client for type-safe API calls.
 *
 * IMPORTANT (tRPC v11): The `transformer` must be inside `httpBatchLink`,
 * NOT at the root createClient level. This ensures client and server
 * use the same serialization format (superjson).
 */
export const trpc = createTRPCReact<AppRouter>();

/**
 * Creates the tRPC client with proper configuration.
 * Call this once in your app's root layout.
 */
export function createTRPCClient() {
  return trpc.createClient({
    links: [
      httpBatchLink({
        url: `${getApiBaseUrl()}/api/trpc`,
        // tRPC v11: transformer MUST be inside httpBatchLink, not at root
        transformer: superjson,
        async headers() {
          const token = await Auth.getSessionToken();
          return {
            ...CLIENT_VERSION_HEADERS,
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          };
        },
        // Custom fetch to include credentials for cookie-based auth
        async fetch(url, options) {
          const response = await fetch(url, {
            ...options,
            credentials: "include",
          });
          markIfVersionBlocked(response.status);
          return response;
        },
      }),
    ],
  });
}
