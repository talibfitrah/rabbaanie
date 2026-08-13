/**
 * The subscriber-details contract.
 *
 * Every path that pays for or unlocks a membership POSTs this same object —
 * coupon redemption, Stripe checkout, "save my details", and the Google Play
 * purchase, which saves the details before Play's sheet opens. The server runs
 * all four through one validator, so when this shape drifts they fail together
 * rather than one at a time (rabbaanie-api server/subscriber-validation.ts).
 *
 * That server is a separate repo with its own deploy and no shared types, so
 * the values here are pinned against it by tests/subscriber-info-contract.test.ts.
 * Change either list only together with that server.
 */

export const REQUIRED_SUBSCRIBER_FIELDS = [
  "firstName",
  "lastName",
  "maritalStatus",
  "streetHouseNumber",
  "city",
  "country",
  "email",
  "phone",
] as const;

type SubscriberInfoField = (typeof REQUIRED_SUBSCRIBER_FIELDS)[number];
type SubscriberInfoFields = Record<SubscriberInfoField, string>;

/** The only four the server accepts — the same vocabulary app/onboarding uses. */
export const MARITAL_OPTIONS = [
  { value: "getrouwd", ar: "متزوّج/ة", nl: "Getrouwd", en: "Married" },
  { value: "gescheiden", ar: "مطلّق/ة", nl: "Gescheiden", en: "Divorced" },
  { value: "weduwe_weduwnaar", ar: "أرمل/ة", nl: "Weduwe/Weduwnaar", en: "Widowed" },
  { value: "alleenstaand", ar: "أعزب/عزباء", nl: "Alleenstaand", en: "Single" },
] as const;

/**
 * Whether a stored status is one the picker can show and the server will take.
 *
 * Every subscriber_info row written before the API tightened this holds a value
 * from the old vocabulary, so a stored status cannot be trusted into the form:
 * prefilling one leaves no chip selected while still counting as filled in, and
 * the submit is then refused for a reason the user cannot see or correct.
 */
export function isKnownMaritalStatus(value: string | null | undefined): boolean {
  return MARITAL_OPTIONS.some((option) => option.value === value);
}

/**
 * Details the server stores but this screen does not ask for. They must be sent
 * back untouched: saveSubscriberInfo writes `.set({ ...data })` and the server's
 * validator turns an omitted optional into `null`, so leaving them out deletes
 * what the website's own subscription form recorded.
 */
export type SubscriberInfoExtras = Partial<
  Record<"kunya" | "gender" | "addressLine2" | "postcode", string | null>
>;

/** The POST body for /api/subscription/{info,checkout,redeem-coupon}. */
export function buildSubscriberInfo(
  fields: SubscriberInfoFields,
  extras?: SubscriberInfoExtras,
): Record<string, string> {
  const info: Record<string, string> = {};
  for (const field of REQUIRED_SUBSCRIBER_FIELDS) {
    info[field] = String(fields[field] ?? "").trim();
  }
  for (const [key, value] of Object.entries(extras ?? {})) {
    if (value) info[key] = String(value).trim();
  }
  return info;
}

/**
 * Whether the form may be submitted. Checks the required fields by name rather
 * than every value present, so echoing an optional detail back cannot make an
 * incomplete form look ready — nor an absent one block a complete form.
 */
export function isSubscriberInfoComplete(fields: SubscriberInfoFields): boolean {
  return REQUIRED_SUBSCRIBER_FIELDS.every((field) => !!String(fields[field] ?? "").trim());
}
