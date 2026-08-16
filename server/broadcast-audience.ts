/**
 * Who an admin broadcast reaches, given a combinable filter (country, city,
 * and three profile-incompleteness flags).
 *
 * A leaf module on purpose, mirroring server/consultation-ownership.ts: the
 * predicate is used twice from server/routers.ts — once to preview the
 * recipient count, once to actually send — so it must be a pure function
 * both call, or the number the admin sees before sending could drift from
 * who gets messaged.
 *
 * The personal-gate check below intentionally duplicates (rather than
 * imports) lib/store.ts's getFirstIncompleteOnboardingStep: that module is
 * client code (imports @react-native-async-storage/async-storage), and no
 * server file has ever imported from lib/. tests/broadcast-audience.test.ts
 * cross-checks the two against isProfileComplete directly so they can't
 * silently drift apart.
 */

export type AudienceUser = {
  id: number;
  name?: string | null;
  deletedAt?: Date | string | null;
  profileData?: unknown;
};

export type AudienceFilter = {
  countries?: string[]; // empty/omitted = every country
  cities?: string[]; // empty/omitted = every city
  incompletePersonal?: boolean;
  incompleteAnalytical?: boolean;
  incompleteChildren?: boolean;
};

type PlainChild = { name?: unknown; profileCompleted?: unknown };

function parentProfileOf(u: AudienceUser): Record<string, unknown> {
  const pd = u.profileData as any;
  return pd && typeof pd === "object" && pd.parentProfile && typeof pd.parentProfile === "object"
    ? pd.parentProfile
    : {};
}

function childrenOf(u: AudienceUser): PlainChild[] {
  const pd = u.profileData as any;
  const children = pd && typeof pd === "object" ? pd.children : null;
  return Array.isArray(children) ? children : [];
}

const filled = (v: unknown) => typeof v === "string" && v.trim().length > 0;

/** Same gate as lib/store.ts's getFirstIncompleteOnboardingStep — see the
 *  file header for why this isn't imported directly. */
function personalProfileIncomplete(u: AudienceUser): boolean {
  const p = parentProfileOf(u) as any;
  const hasDiscreteAddress = filled(p.country) && filled(p.city) && filled(p.street) && filled(p.houseNumber);
  const hasLegacyAddress = !!(p.streetHouseNumber || p.address);
  if (!(p.firstName && p.lastName && p.birthDate && (hasDiscreteAddress || hasLegacyAddress) && p.phoneNumber)) {
    return true;
  }
  if (!(p.gender && p.maritalStatus)) return true;
  if (!(childrenOf(u).length > 0)) return true;
  return false;
}

/** "Analytical profile" = the full 13-step parent-profile wizard (prayer,
 *  hijab, knowledge, the thinking/feeling/speaking/doing self-assessment,
 *  affinities, partner bond) — tracked by AppState.parentProfileCompleted,
 *  set once by completeParentProfile() at the end of that wizard. Distinct
 *  from the personal gate above, which only covers identity + having a
 *  child. See the report for why this mapping, not a literal "analytical"
 *  flag, is what the codebase actually has. */
function analyticalProfileIncomplete(u: AudienceUser): boolean {
  const pd = u.profileData as any;
  return !(pd && typeof pd === "object" && pd.parentProfileCompleted === true);
}

/** Names of this user's children whose own profile isn't complete. Distinct
 *  from personalProfileIncomplete's "no children at all" check — a user with
 *  zero children can't have a named incomplete child. */
export function incompleteChildNames(u: AudienceUser): string[] {
  return childrenOf(u)
    .filter((c) => c && c.profileCompleted !== true)
    .map((c) => (typeof c.name === "string" && c.name.trim()) || "بدون اسم");
}

export function matchesAudience(u: AudienceUser, filter: AudienceFilter): boolean {
  if (u.deletedAt) return false;
  const p = parentProfileOf(u) as any;
  if (filter.countries && filter.countries.length > 0 && !filter.countries.includes(p.country)) return false;
  if (filter.cities && filter.cities.length > 0 && !filter.cities.includes(p.city)) return false;
  if (filter.incompletePersonal && !personalProfileIncomplete(u)) return false;
  if (filter.incompleteAnalytical && !analyticalProfileIncomplete(u)) return false;
  if (filter.incompleteChildren && incompleteChildNames(u).length === 0) return false;
  return true;
}

export function selectAudience<T extends AudienceUser>(users: T[], filter: AudienceFilter): T[] {
  return users.filter((u) => matchesAudience(u, filter));
}
