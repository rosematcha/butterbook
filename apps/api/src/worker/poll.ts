import { sql } from 'kysely';
import { getDb } from '../db/index.js';
import { logger } from '../utils/logger.js';
import { getConfig } from '../config.js';
import { dispatch, nextAvailableAt, type OutboxRow } from './dispatcher.js';

// One tick of the event_outbox poll loop. Claims up to BATCH_SIZE rows via
// FOR UPDATE SKIP LOCKED, dispatches to registered handlers, then marks them
// dispatched / available_at bumped / dead.
export async function runEventTick(workerId: string): Promise<number> {
  const db = getDb();
  const batch = getConfig().WORKER_BATCH_SIZE;
  const lockTtl = `${60} seconds`;

  // Claim in one UPDATE … RETURNING. The inner SELECT uses SKIP LOCKED so two
  // workers never grab the same row.
  const claimed = await sql<OutboxRow>`
    UPDATE event_outbox
    SET locked_by = ${workerId},
        locked_until = now() + ${lockTtl}::interval,
        attempts = attempts + 1
    WHERE id IN (
      SELECT id FROM event_outbox
      WHERE status = 'pending' AND available_at <= now()
      ORDER BY available_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT ${batch}
    )
    RETURNING id, org_id, event_type, aggregate_type, aggregate_id,
              payload, attempts, max_attempts
  `.execute(db);

  const rows = claimed.rows;
  if (rows.length === 0) return 0;

  for (const row of rows) {
    const result = await dispatch(row);
    if (result.ok) {
      await db
        .updateTable('event_outbox')
        .set({
          status: 'dispatched',
          dispatched_at: new Date(),
          locked_by: null,
          locked_until: null,
        })
        .where('id', '=', row.id)
        .execute();
      continue;
    }
    const dead = row.attempts >= row.max_attempts;
    await db
      .updateTable('event_outbox')
      .set({
        status: dead ? 'dead' : 'pending',
        last_error: result.error?.message.slice(0, 2000) ?? 'unknown',
        available_at: nextAvailableAt(row.attempts),
        locked_by: null,
        locked_until: null,
      })
      .where('id', '=', row.id)
      .execute();
    if (dead) logger.error({ id: row.id, eventType: row.event_type }, 'worker.event_dead');
  }
  return rows.length;
}
