import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";

import { getDb } from "../db";

let setupPromise: Promise<void> | null = null;

function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function rowsFromResult(result: any): any[] {
  if (Array.isArray(result?.rows)) return result.rows;
  if (Array.isArray(result?.[0])) return result[0];
  if (Array.isArray(result)) return result;
  return [];
}

async function ensureSecurityTables(): Promise<void> {
  if (!setupPromise) {
    setupPromise = (async () => {
      const db = await getDb();
      if (!db) throw new Error("database unavailable for session security");
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS revoked_sessions (
          token_hash CHAR(64) PRIMARY KEY,
          expires_at TIMESTAMP NOT NULL,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS user_session_versions (
          open_id VARCHAR(64) PRIMARY KEY,
          session_version BIGINT NOT NULL DEFAULT 0,
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            ON UPDATE CURRENT_TIMESTAMP
        )
      `);
      await db.execute(
        sql`DELETE FROM revoked_sessions WHERE expires_at <= CURRENT_TIMESTAMP`,
      );
    })().catch((error) => {
      setupPromise = null;
      throw error;
    });
  }
  await setupPromise;
}

export async function revokeSessionToken(
  token: string,
  expiresAt: Date,
): Promise<void> {
  await ensureSecurityTables();
  const db = await getDb();
  if (!db) throw new Error("database unavailable for session revocation");
  const tokenHash = hashToken(token);
  await db.execute(sql`
    INSERT INTO revoked_sessions (token_hash, expires_at)
    VALUES (${tokenHash}, ${expiresAt})
    ON DUPLICATE KEY UPDATE expires_at = VALUES(expires_at)
  `);
}

export async function isSessionTokenRevoked(token: string): Promise<boolean> {
  await ensureSecurityTables();
  const db = await getDb();
  if (!db) throw new Error("database unavailable for session revocation");
  const tokenHash = hashToken(token);
  const result = await db.execute(sql`
    SELECT token_hash
    FROM revoked_sessions
    WHERE token_hash = ${tokenHash} AND expires_at > CURRENT_TIMESTAMP
    LIMIT 1
  `);
  return rowsFromResult(result).length > 0;
}

export async function getSessionVersion(openId: string): Promise<number> {
  await ensureSecurityTables();
  const db = await getDb();
  if (!db) throw new Error("database unavailable for session validation");
  await db.execute(sql`
    INSERT IGNORE INTO user_session_versions (open_id, session_version)
    VALUES (${openId}, 0)
  `);
  const result = await db.execute(sql`
    SELECT session_version
    FROM user_session_versions
    WHERE open_id = ${openId}
    LIMIT 1
  `);
  const version = Number(rowsFromResult(result)[0]?.session_version);
  if (!Number.isSafeInteger(version) || version < 0) {
    throw new Error("invalid stored session version");
  }
  return version;
}

/** Invalidate every session previously issued for this user. */
export async function advanceSessionVersion(openId: string): Promise<number> {
  await ensureSecurityTables();
  const db = await getDb();
  if (!db) throw new Error("database unavailable for session invalidation");
  await db.execute(sql`
    INSERT INTO user_session_versions (open_id, session_version)
    VALUES (${openId}, 1)
    ON DUPLICATE KEY UPDATE session_version = session_version + 1
  `);
  return getSessionVersion(openId);
}
