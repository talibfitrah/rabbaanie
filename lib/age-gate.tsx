import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export type AgeGateStatus = "adult" | "minor";

const AGE_GATE_STORAGE_KEY = "@rabbaanie_age_gate_status";

type BirthDateParts = {
  day: number;
  month: number;
  year: number;
};

type AgeGateContextValue = {
  status: AgeGateStatus | null;
  loading: boolean;
  setStatus: (status: AgeGateStatus) => Promise<void>;
};

const AgeGateContext = createContext<AgeGateContextValue | null>(null);

type GateRedirectInput = {
  status: AgeGateStatus | null;
  isAuthenticated: boolean;
  segment?: string;
};

/**
 * The child profile mode is deliberately NOT gated here by release channel.
 *
 * It used to be, via a `childMonitoringEnabled` flag — but that one flag stood
 * for two unrelated things: the child's own profile experience, and the
 * PACKAGE_USAGE_STATS app-usage tracking. Only the second is what Play screens
 * as stalkerware, and it is already absent from the Play build three ways over
 * (permission blocked in app.config.ts, native module excluded from Gradle
 * autolinking, both asserted against the shipped artifact by
 * scripts/assert-play-artifact.sh). Blocking the profile mode too cost the Play
 * build a whole feature for no policy benefit.
 *
 * What keeps this compliant is below, and none of it depends on the channel.
 * Stated precisely, because the loose version ("a child never has an account")
 * is not what the code does: a child DOES have a `childAccounts` row with an
 * access code. What they do not have is any way to authenticate on their own.
 * `/child-account/*` sits behind the same `isAuthenticated` check as everything
 * else, and `childAccount.login` is a protectedProcedure that resolves an access
 * code only among `ctx.user.id`'s own children — so the child area is reachable
 * only from inside a signed-in parent's session, on the parent's device. That
 * session is the adult action Play's Families policy asks for.
 *
 * Do NOT count the "parent confirmation" PIN in child-account/login.tsx as part
 * of that argument: it is generated client-side and rendered on the same screen
 * as the field it is typed into. It is a speed bump, not an authorization
 * control.
 *
 * The one genuinely monitoring-specific screen guards itself; see
 * app/child-account/usage-permission.tsx.
 */
export function getGateRedirect({
  status,
  isAuthenticated,
  segment,
}: GateRedirectInput): "/age-check" | "/login" | "/(tabs)" | null {
  const inAgeGate = segment === "age-check";
  // "register" belongs here for the same reason as "login": these are the
  // screens a signed-out visitor is *supposed* to reach. Leaving it out sends
  // anyone opening sign-up straight back to /login, making the screen
  // unreachable. The age check above still runs first, so a minor never gets here.
  const inAuthGroup =
    segment === "login" ||
    segment === "register" ||
    segment === "oauth" ||
    segment === "forgot-password";

  if (status !== "adult") return inAgeGate ? null : "/age-check";
  if (inAgeGate) return isAuthenticated ? "/(tabs)" : "/login";
  // "support" is reachable both signed-in (Settings' "Contact the technical
  // team" row) and signed-out (the login screen's "need help?" link) — unlike
  // inAuthGroup above, it must NOT bounce a signed-in visitor back to /(tabs),
  // so it gets its own unconditional carve-out rather than joining that list.
  if (segment === "support") return null;
  if (!isAuthenticated && !inAuthGroup) return "/login";
  if (isAuthenticated && inAuthGroup) return "/(tabs)";
  return null;
}

export function canUseNotifications(
  status: AgeGateStatus | null,
  isAuthenticated: boolean,
): boolean {
  return status === "adult" && isAuthenticated;
}

export async function readStoredAgeGateStatus(): Promise<AgeGateStatus | null> {
  const stored = await AsyncStorage.getItem(AGE_GATE_STORAGE_KEY);
  return stored === "adult" || stored === "minor" ? stored : null;
}

export async function persistAgeGateStatus(
  status: AgeGateStatus,
): Promise<void> {
  await AsyncStorage.setItem(AGE_GATE_STORAGE_KEY, status);
}

export function classifyBirthDate(
  { day, month, year }: BirthDateParts,
  today = new Date(),
): AgeGateStatus | null {
  if (
    !Number.isInteger(day) ||
    !Number.isInteger(month) ||
    !Number.isInteger(year)
  ) {
    return null;
  }
  if (
    year < 1900 ||
    year > today.getFullYear() ||
    month < 1 ||
    month > 12 ||
    day < 1
  ) {
    return null;
  }

  const birthDate = new Date(year, month - 1, day);
  if (
    birthDate.getFullYear() !== year ||
    birthDate.getMonth() !== month - 1 ||
    birthDate.getDate() !== day ||
    birthDate > today
  ) {
    return null;
  }

  let age = today.getFullYear() - year;
  const birthdayHasPassed =
    today.getMonth() > month - 1 ||
    (today.getMonth() === month - 1 && today.getDate() >= day);
  if (!birthdayHasPassed) age -= 1;

  return age >= 18 ? "adult" : "minor";
}

export function AgeGateProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatusState] = useState<AgeGateStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    readStoredAgeGateStatus()
      .then(setStatusState)
      .catch((error) => {
        console.warn("[AgeGate] Could not restore age status:", error);
        setStatusState(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const setStatus = useCallback(async (nextStatus: AgeGateStatus) => {
    await persistAgeGateStatus(nextStatus);
    setStatusState(nextStatus);
  }, []);

  const value = useMemo(
    () => ({ status, loading, setStatus }),
    [status, loading, setStatus],
  );

  return (
    <AgeGateContext.Provider value={value}>{children}</AgeGateContext.Provider>
  );
}

export function useAgeGate(): AgeGateContextValue {
  const context = useContext(AgeGateContext);
  if (!context)
    throw new Error("useAgeGate must be used within AgeGateProvider");
  return context;
}
