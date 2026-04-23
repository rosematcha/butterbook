import { sql } from 'kysely';
import { getDb } from '../db/index.js';
import { hashProvidedToken, randomTokenBase64Url } from '../utils/ids.js';

const SESSION_TTL_DAYS = 30;
const REFRESH_AFTER_DAYS = 7;
const TOUCH_AFTER_MINUTES = 5;

const dayMs = 24 * 60 * 60 * 1000;
const touchMs = TOUCH_AFTER_MINUTES * 60 * 1000;

export async function createSession(params: {
  userId: string;
  ip: string | null;
  userAgent: string | null;
}): Promise<{ token: string; expiresAt: Date }> {
  const { token, hash } = randomTokenBase64Url(32);
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * dayMs);
  await getDb()
    .insertInto('sessions')
    .values({
      user_id: params.userId,
      token_hash: hash,
      expires_at: expiresAt,
      ip: params.ip,
      user_agent: params.userAgent,
    })
    .execute();
  return { token, expiresAt };
}

export interface ResolvedSession {
  sessionId: string;
  userId: string;
  expiresAt: Date;
}

export async function resolveSession(bearer: string): Promise<ResolvedSession | null> {
  const hash = hashProvidedToken(bearer);
  const db = getDb();
  const row = await db
    .selectFrom('sessions')
    .selectAll()
    .where('token_hash', '=', hash)
    .executeTakeFirst();
  if (!row) return null;
  const now = new Date();
  if (row.revoked_at) return null;
  const exp = row.expires_at instanceof Date ? row.expires_at : new Date(row.expires_at as unknown as string);
  if (exp.getTime() <= now.getTime()) return null;

  // Sliding expiration.
  const lastUsed = row.last_used_at instanceof Date ? row.last_used_at : new Date(row.last_used_at as unknown as string);
  const ageSinceUsedMs = now.getTime() - lastUsed.getTime();
  const shouldExtend = ageSinceUsedMs > REFRESH_AFTER_DAYS * dayMs;
  if (shouldExtend) {
    const newExp = new Date(now.getTime() + SESSION_TTL_DAYS * dayMs);
    await db
      .updateTable('sessions')
      .set({ expires_at: newExp, last_used_at: now })
      .where('id', '=', row.id)
      .execute();
    return { sessionId: row.id, userId: row.user_id, expiresAt: newExp };
  }

  // Avoid turning every authenticated read into a write. We only "touch"
  // active sessions when they have been idle for a short interval, while still
  // extending expiry on the longer REFRESH_AFTER_DAYS threshold above.
  if (ageSinceUsedMs > touchMs) {
    await db.updateTable('sessions').set({ last_used_at: now }).where('id', '=', row.id).execute();
  }
  return { sessionId: row.id, userId: row.user_id, expiresAt: exp };
}

export async function revokeSession(sessionId: string): Promise<void> {
  await getDb().updateTable('sessions').set({ revoked_at: new Date() }).where('id', '=', sessionId).execute();
}

export async function revokeAllForUser(userId: string, exceptSessionId?: string): Promise<void> {
  const db = getDb();
  let q = db.updateTable('sessions').set({ revoked_at: new Date() }).where('user_id', '=', userId).where('revoked_at', 'is', null);
  if (exceptSessionId) q = q.where('id', '!=', exceptSessionId);
  await q.execute();
  // Using sql for the "!=" operator in older kysely: keep as-is if it works.
  void sql;
}
