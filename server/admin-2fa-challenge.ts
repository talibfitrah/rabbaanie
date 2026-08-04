import { randomUUID } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";

import { ENV } from "./_core/env";
import { verify2FALogin } from "./totp";

const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const FAILURE_WINDOW_MS = 10 * 60 * 1000;
const MAX_FAILURES = 5;
const MAX_ACTIVE_CHALLENGES = 1_000;

type ChallengeClaims = {
  jti: string;
  userId: number;
  openId: string;
  name: string | null;
  email: string | null;
  role: string;
};

type ChallengeState = {
  userId: number;
  expiresAt: number;
  attempts: number;
};

type FailureBucket = { count: number; resetsAt: number };

const activeChallenges = new Map<string, ChallengeState>();
const failureBuckets = new Map<string, FailureBucket>();

function secretKey(): Uint8Array {
  return new TextEncoder().encode(ENV.cookieSecret);
}

function prune(now = Date.now()) {
  for (const [jti, state] of activeChallenges) {
    if (state.expiresAt <= now) activeChallenges.delete(jti);
  }
  for (const [key, bucket] of failureBuckets) {
    if (bucket.resetsAt <= now) failureBuckets.delete(key);
  }
}

function failureKey(userId: number, ip: string): string {
  return `${userId}:${ip || "unknown"}`;
}

export async function createAdmin2FAChallenge(user: {
  id: number;
  openId: string;
  name: string | null;
  email: string | null;
  role: string;
}): Promise<string> {
  prune();
  if (activeChallenges.size >= MAX_ACTIVE_CHALLENGES) {
    const oldest = activeChallenges.keys().next().value;
    if (oldest) activeChallenges.delete(oldest);
  }

  const now = Date.now();
  const jti = randomUUID();
  activeChallenges.set(jti, {
    userId: user.id,
    expiresAt: now + CHALLENGE_TTL_MS,
    attempts: 0,
  });

  return new SignJWT({
    purpose: "admin_2fa",
    userId: user.id,
    openId: user.openId,
    name: user.name,
    email: user.email,
    role: user.role,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer("rabbaanie-auth")
    .setAudience("rabbaanie-admin-2fa")
    .setJti(jti)
    .setIssuedAt()
    .setExpirationTime(Math.floor((now + CHALLENGE_TTL_MS) / 1000))
    .sign(secretKey());
}

export async function completeAdmin2FAChallenge(
  challengeToken: string,
  factorCode: string,
  ip: string,
): Promise<
  | { ok: true; claims: ChallengeClaims }
  | { ok: false; reason: "invalid" | "rate_limited" }
> {
  prune();
  if (
    !challengeToken ||
    challengeToken.length > 4_096 ||
    !/^(?:\d{6}|[A-Fa-f0-9]{4}-[A-Fa-f0-9]{4})$/.test(factorCode)
  ) {
    return { ok: false, reason: "invalid" };
  }

  let payload: Record<string, unknown>;
  try {
    ({ payload } = await jwtVerify(challengeToken, secretKey(), {
      algorithms: ["HS256"],
      issuer: "rabbaanie-auth",
      audience: "rabbaanie-admin-2fa",
    }));
  } catch {
    return { ok: false, reason: "invalid" };
  }

  const jti = typeof payload.jti === "string" ? payload.jti : "";
  const userId = typeof payload.userId === "number" ? payload.userId : 0;
  const state = activeChallenges.get(jti);
  if (!state || state.userId !== userId || state.expiresAt <= Date.now()) {
    activeChallenges.delete(jti);
    return { ok: false, reason: "invalid" };
  }

  const bucketKey = failureKey(userId, ip);
  const bucket = failureBuckets.get(bucketKey);
  if (
    state.attempts >= MAX_FAILURES ||
    (bucket && bucket.count >= MAX_FAILURES)
  ) {
    return { ok: false, reason: "rate_limited" };
  }

  if (!(await verify2FALogin(userId, factorCode))) {
    state.attempts += 1;
    failureBuckets.set(bucketKey, {
      count: (bucket?.count || 0) + 1,
      resetsAt: Date.now() + FAILURE_WINDOW_MS,
    });
    return {
      ok: false,
      reason: state.attempts >= MAX_FAILURES ? "rate_limited" : "invalid",
    };
  }

  activeChallenges.delete(jti);
  failureBuckets.delete(bucketKey);
  if (typeof payload.openId !== "string" || typeof payload.role !== "string") {
    return { ok: false, reason: "invalid" };
  }

  return {
    ok: true,
    claims: {
      jti,
      userId,
      openId: payload.openId,
      name: typeof payload.name === "string" ? payload.name : null,
      email: typeof payload.email === "string" ? payload.email : null,
      role: payload.role,
    },
  };
}
