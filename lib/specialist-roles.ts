/**
 * Specialist function-role labels (ar/en/nl). The ids must stay in sync with
 * functionRoleEnum in the server repos' drizzle schemas — this is a display
 * layer over data the server already owns, not a place to invent new roles.
 */

export type FunctionRoleId =
  | "arts"
  | "imam"
  | "kennisdrager"
  | "leraar"
  | "maatschappelijk_werker"
  | "moeder"
  | "opvoedkundige_begeleider"
  | "specialist"
  | "therapeut"
  | "vader";

export const FUNCTION_ROLES: { id: FunctionRoleId; ar: string; en: string; nl: string }[] = [
  { id: "arts", ar: "طبيب", en: "Doctor", nl: "Arts" },
  { id: "imam", ar: "إمام", en: "Imam", nl: "Imam" },
  { id: "kennisdrager", ar: "حامل معرفة", en: "Knowledge bearer", nl: "Kennisdrager" },
  { id: "leraar", ar: "معلم", en: "Teacher", nl: "Leraar" },
  { id: "maatschappelijk_werker", ar: "أخصائي اجتماعي", en: "Social worker", nl: "Maatschappelijk werker" },
  { id: "moeder", ar: "أم", en: "Mother", nl: "Moeder" },
  { id: "opvoedkundige_begeleider", ar: "مرشد تربوي", en: "Parenting guide", nl: "Opvoedkundige begeleider" },
  { id: "specialist", ar: "مشرف تربوي", en: "Educational Supervisor", nl: "Pedagogisch begeleider" },
  { id: "therapeut", ar: "معالج", en: "Therapist", nl: "Therapeut" },
  { id: "vader", ar: "أب", en: "Father", nl: "Vader" },
];

export function getFunctionRoleLabel(
  id: FunctionRoleId | string,
  language: "ar" | "en" | "nl",
): string {
  const role = FUNCTION_ROLES.find((r) => r.id === id);
  return role ? role[language] : id;
}
