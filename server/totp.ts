/**
 * TOTP (Time-based One-Time Password) implementation for admin 2FA.
 * Uses HMAC-SHA1 as per RFC 6238.
 */
import { createHash, createHmac, randomBytes } from "crypto";
import { getDb } from "./db";
import { admin2fa } from "../drizzle/schema";
import { eq } from "drizzle-orm";

const BASE32_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** Generate a random base32 secret */
export function generateSecret(): string {
  const bytes = randomBytes(20);
  let result = "";
  for (let i = 0; i < bytes.length; i++) {
    result += BASE32_CHARS[bytes[i] % 32];
  }
  return result;
}

/** Decode base32 to buffer */
function base32Decode(encoded: string): Buffer {
  const cleaned = encoded.replace(/[^A-Z2-7]/gi, "").toUpperCase();
  let bits = "";
  for (const char of cleaned) {
    const val = BASE32_CHARS.indexOf(char);
    bits += val.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

/** Generate a TOTP code for a given secret and time */
export function generateTOTP(
  secret: string,
  timeStep: number = 30,
  digits: number = 6,
): string {
  const time = Math.floor(Date.now() / 1000 / timeStep);
  const timeBuffer = Buffer.alloc(8);
  timeBuffer.writeBigUInt64BE(BigInt(time));

  const key = base32Decode(secret);
  const hmac = createHmac("sha1", key).update(timeBuffer).digest();

  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  return (code % Math.pow(10, digits)).toString().padStart(digits, "0");
}

/** Verify a TOTP code (allows 1 step window) */
export function verifyTOTP(secret: string, token: string): boolean {
  const timeStep = 30;
  const time = Math.floor(Date.now() / 1000 / timeStep);

  for (let i = -1; i <= 1; i++) {
    const checkTime = time + i;
    const timeBuffer = Buffer.alloc(8);
    timeBuffer.writeBigUInt64BE(BigInt(checkTime));

    const key = base32Decode(secret);
    const hmac = createHmac("sha1", key).update(timeBuffer).digest();

    const offset = hmac[hmac.length - 1] & 0x0f;
    const code =
      ((hmac[offset] & 0x7f) << 24) |
      ((hmac[offset + 1] & 0xff) << 16) |
      ((hmac[offset + 2] & 0xff) << 8) |
      (hmac[offset + 3] & 0xff);

    const expected = (code % Math.pow(10, 6)).toString().padStart(6, "0");
    if (expected === token) return true;
  }
  return false;
}

/** Generate otpauth:// URI for QR code */
export function generateOTPAuthURI(
  secret: string,
  email: string,
  issuer: string = "Rabbaanie",
): string {
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(email)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

/** Generate backup codes */
export function generateBackupCodes(count: number = 8): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    const code = randomBytes(4).toString("hex").toUpperCase();
    codes.push(code.slice(0, 4) + "-" + code.slice(4));
  }
  return codes;
}

export function hashBackupCode(code: string): string {
  return createHash("sha256").update(code.trim().toUpperCase()).digest("hex");
}

export function normalizeStoredBackupCodes(value: unknown): string[] {
  let parsed = value;
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return [];
    }
  }
  return Array.isArray(parsed)
    ? parsed.filter((code): code is string => typeof code === "string")
    : [];
}

// ============================================================
// Database operations for 2FA
// ============================================================

/** Setup 2FA for a user (generates secret, not yet verified) */
export async function setup2FA(
  userId: number,
  email: string,
): Promise<{ secret: string; uri: string; backupCodes: string[] }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const secret = generateSecret();
  const backupCodes = generateBackupCodes();
  const uri = generateOTPAuthURI(secret, email);

  const [existing] = await db
    .select()
    .from(admin2fa)
    .where(eq(admin2fa.userId, userId));
  if (existing?.verified) {
    throw new Error("Two-factor authentication is already enabled");
  }

  // Replace only an incomplete enrollment. Verified factors must be disabled
  // with a current factor before another setup can begin.
  await db.delete(admin2fa).where(eq(admin2fa.userId, userId));
  await db.insert(admin2fa).values({
    userId,
    secret,
    verified: false,
    backupCodes: backupCodes.map(hashBackupCode),
  });

  return { secret, uri, backupCodes };
}

/** Verify and activate 2FA */
export async function verify2FASetup(
  userId: number,
  token: string,
): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  const [record] = await db
    .select()
    .from(admin2fa)
    .where(eq(admin2fa.userId, userId));
  if (!record) return false;

  if (verifyTOTP(record.secret, token)) {
    await db
      .update(admin2fa)
      .set({ verified: true })
      .where(eq(admin2fa.userId, userId));
    return true;
  }
  return false;
}

/** Check if user has 2FA enabled */
export async function has2FA(userId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  const [record] = await db
    .select()
    .from(admin2fa)
    .where(eq(admin2fa.userId, userId));
  return record?.verified === true;
}

/** Verify 2FA token for login */
export async function verify2FALogin(
  userId: number,
  token: string,
): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  const [record] = await db
    .select()
    .from(admin2fa)
    .where(eq(admin2fa.userId, userId));
  if (!record || !record.verified) return false;

  // Check TOTP
  if (verifyTOTP(record.secret, token)) return true;

  // Check backup codes
  const backupCodes = normalizeStoredBackupCodes(record.backupCodes);
  const normalizedToken = token.trim().toUpperCase();
  const tokenHash = hashBackupCode(normalizedToken);
  const idx = backupCodes.findIndex(
    (stored) =>
      stored === tokenHash || stored.toUpperCase() === normalizedToken,
  );
  if (idx >= 0) {
    backupCodes.splice(idx, 1);
    await db
      .update(admin2fa)
      .set({ backupCodes })
      .where(eq(admin2fa.userId, userId));
    return true;
  }

  return false;
}

/** Disable 2FA for a user */
export async function disable2FA(userId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(admin2fa).where(eq(admin2fa.userId, userId));
}

/** Get 2FA status for a user */
export async function get2FAStatus(
  userId: number,
): Promise<{ enabled: boolean; hasBackupCodes: boolean }> {
  const db = await getDb();
  if (!db) return { enabled: false, hasBackupCodes: false };

  const [record] = await db
    .select()
    .from(admin2fa)
    .where(eq(admin2fa.userId, userId));
  if (!record) return { enabled: false, hasBackupCodes: false };

  const backupCodes = normalizeStoredBackupCodes(record.backupCodes);
  return { enabled: record.verified, hasBackupCodes: backupCodes.length > 0 };
}
