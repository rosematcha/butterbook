import crypto from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { getDb } from '../db/index.js';
import { IdempotencyConflictError } from '../errors/index.js';

const TTL_HOURS = 24;

export interface IdempotentResult {
  status: number;
  body: unknown;
}

// Wrap any handler that may be retried. Pass orgId=null for guest endpoints
// if not yet resolved. Body JSON is hashed to detect key-reuse conflicts.
export async function handleIdempotent(
  req: FastifyRequest,
  reply: FastifyReply,
  scope: string,
  orgId: string | null,
  handler: () => Promise<IdempotentResult>,
): Promise<IdempotentResult> {
  const key = req.headers['idempotency-key'];
  if (!key || typeof key !== 'string') return handler();

  const requestHash = crypto.createHash('sha256').update(JSON.stringify(req.body ?? null)).digest('hex');
  const db = getDb();
  const existing = await db
    .selectFrom('idempotency_keys')
    .selectAll()
    .where('key', '=', key)
    .where('scope', '=', scope)
    .executeTakeFirst();

  if (existing) {
    if (existing.request_hash !== requestHash) {
      throw new IdempotencyConflictError('Idempotency key reused with different payload.');
    }
    return { status: existing.response_status, body: existing.response_body };
  }

  const result = await handler();
  await db
    .insertInto('idempotency_keys')
    .values({
      key,
      scope,
      org_id: orgId,
      request_hash: requestHash,
      response_status: result.status,
      response_body: result.body as never,
      expires_at: new Date(Date.now() + TTL_HOURS * 60 * 60 * 1000),
    })
    .onConflict((oc) => oc.doNothing())
    .execute();
  reply.status(result.status);
  return result;
}
