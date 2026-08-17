import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/server/routers";

/**
 * links.getPartnerProfile returns a union: a restricted payload omits
 * parentProfile/children/issues/dailyCheckins/etc. entirely (the security
 * boundary — see server/routers.ts). TypeScript's control-flow narrowing on
 * `.access === "full"` doesn't reach into nested closures (e.g. an IIFE
 * reading partner data in its own callback scope), so re-checking access
 * inline at each read site doesn't actually protect them. Narrow once
 * through this guard instead and read full-only fields off its result.
 */
export type PartnerProfileData = inferRouterOutputs<AppRouter>["links"]["getPartnerProfile"];
export type FullPartnerProfile = Extract<NonNullable<PartnerProfileData>, { access: "full" }>;
export function isFullPartnerProfile(
  data: PartnerProfileData | undefined,
): data is FullPartnerProfile {
  return !!data && data.access === "full";
}

/**
 * links.listPartners' output shape, mirrored by hand rather than pulled from
 * inferRouterOutputs like PartnerProfileData above — it's a flat array with
 * no union to narrow, so an inferred type buys nothing beyond what this
 * literal already states.
 */
export type PartnerListEntry = {
  id: number;
  name: string | null;
  gender: string | null;
  partnershipId: number;
  confirmed: boolean;
};
