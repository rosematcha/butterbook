import { sql } from 'kysely';
import { getDb } from '../db/index.js';
import { getConfig } from '../config.js';
import { logger } from '../utils/logger.js';
import { getEmailProvider } from '../services/notifications/providers/index.js';
import { nextAvailableAt } from './dispatcher.js';

interface NotifRow {
  id: string;
  org_id: string;
  to_address: string;
  template_key: string;
  rendered_subject: string;
  rendered_html: string;
  rendered_text: string;
  attempts: number;
  max_attempts: number;
}

// Poll notifications_outbox. Same SKIP LOCKED shape as runEventTick, but
// kept separate because email send SLA and retry semantics differ from
// event dispatch — and so notifications back off independently if Resend
// has an outage without stalling other subscribers.
export async function runNotificationsTick(workerId: string): Promise<number> {
  const cfg = getConfig();
  const db = getDb();
  const batch = cfg.WORKER_BATCH_SIZE;
  const lockTtl = `${60} seconds`;

  const claimed = await sql<NotifRow>`
    UPDATE notifications_outbox
    SET status = 'sending',
        locked_by = ${workerId},
        locked_until = now() + ${lockTtl}::interval,
        attempts = attempts + 1
    WHERE id IN (
      SELECT id FROM notifications_outbox
      WHERE status = 'pending' AND scheduled_at <= now()
      ORDER BY scheduled_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT ${batch}
    )
    RETURNING id, org_id, to_address, template_key,
              rendered_subject, rendered_html, rendered_text,
              attempts, max_attempts
  `.execute(db);

  const rows = claimed.rows;
  if (rows.length === 0) return 0;

  const provider = getEmailProvider();
  const from = cfg.EMAIL_FROM_ADDRESS ?? 'no-reply@butterbook.app';

  for (const row of rows) {
    // Re-check suppression at send time — the address may have been suppressed
    // between enqueue and claim (e.g. visitor clicked unsubscribe while pending).
    const suppressed = await db
      .selectFrom('notification_suppressions')
      .select(['address'])
      .where('org_id', '=', row.org_id)
      .where('address', '=', row.to_address.toLowerCase())
      .executeTakeFirst();
    if (suppressed) {
      await db
        .updateTable('notifications_outbox')
        .set({ status: 'suppressed', locked_by: null, locked_until: null })
        .where('id', '=', row.id)
        .execute();
      continue;
    }

    try {
      const result = await provider.send({
        from,
        to: row.to_address,
        subject: row.rendered_subject,
        html: row.rendered_html,
        text: row.rendered_text,
      });
      await db
        .updateTable('notifications_outbox')
        .set({
          status: 'sent',
          sent_at: new Date(),
          provider_message_id: result.id,
          locked_by: null,
          locked_until: null,
        })
        .where('id', '=', row.id)
        .execute();
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      const dead = row.attempts >= row.max_attempts;
      await db
        .updateTable('notifications_outbox')
        .set({
          status: dead ? 'dead' : 'pending',
          last_error: e.message.slice(0, 2000),
          scheduled_at: nextAvailableAt(row.attempts),
          locked_by: null,
          locked_until: null,
        })
        .where('id', '=', row.id)
        .execute();
      if (dead) logger.error({ id: row.id, templateKey: row.template_key }, 'worker.notification_dead');
      else logger.warn({ err: e, id: row.id }, 'worker.notification_retry');
    }
  }
  return rows.length;
}
