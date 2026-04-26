#!/usr/bin/env tsx
// Archives audit_log rows older than AUDIT_RETENTION_DAYS to JSONL files in
// AUDIT_ARCHIVE_DIR, then deletes them. Designed to run from cron (nightly).
//
// If AUDIT_ARCHIVE_DIR is not set, the script logs the count and exits 0.
// Idempotent on partial failure: rows are only deleted after a successful write.

import fs from 'node:fs';
import path from 'node:path';
import { loadConfig, getConfig } from '../config.js';
import { closeDb, getDb, sql } from '../db/index.js';

const BATCH_SIZE = 1000;

async function main(): Promise<void> {
  loadConfig();
  const cfg = getConfig();

  if (!cfg.AUDIT_ARCHIVE_DIR) {
    // eslint-disable-next-line no-console
    console.log('AUDIT_ARCHIVE_DIR not set — skipping archive.');
    await closeDb();
    return;
  }

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - cfg.AUDIT_RETENTION_DAYS);

  const countResult = await getDb()
    .selectFrom('audit_log')
    .select((eb) => eb.fn.countAll<number>().as('c'))
    .where('created_at', '<', cutoff)
    .executeTakeFirst();
  const total = Number(countResult?.c ?? 0);

  if (total === 0) {
    // eslint-disable-next-line no-console
    console.log(`No audit rows older than ${cutoff.toISOString()} — nothing to archive.`);
    await closeDb();
    return;
  }

  // eslint-disable-next-line no-console
  console.log(`Archiving ${total} audit rows older than ${cutoff.toISOString()}...`);

  fs.mkdirSync(cfg.AUDIT_ARCHIVE_DIR, { recursive: true });
  const filename = `audit-archive-${cutoff.toISOString().slice(0, 10)}-${Date.now()}.jsonl`;
  const filepath = path.join(cfg.AUDIT_ARCHIVE_DIR, filename);
  const stream = fs.createWriteStream(filepath, { encoding: 'utf-8' });

  let archived = 0;
  let lastId: string | null = null;

  // Page through rows by id to avoid offset-based pagination drift.
  while (true) {
    let query = getDb()
      .selectFrom('audit_log')
      .selectAll()
      .where('created_at', '<', cutoff)
      .orderBy('id')
      .limit(BATCH_SIZE);
    if (lastId) query = query.where('id', '>', lastId);

    const rows = await query.execute();
    if (rows.length === 0) break;

    for (const row of rows) {
      stream.write(JSON.stringify(row) + '\n');
    }
    lastId = rows[rows.length - 1]!.id;
    archived += rows.length;
  }

  stream.end();
  await new Promise<void>((resolve, reject) => {
    stream.on('finish', resolve);
    stream.on('error', reject);
  });

  // eslint-disable-next-line no-console
  console.log(`Wrote ${archived} rows to ${filepath}`);

  // Delete archived rows in batches inside transactions with the archive GUC.
  let deleted = 0;
  while (true) {
    const ids = await getDb()
      .selectFrom('audit_log')
      .select('id')
      .where('created_at', '<', cutoff)
      .orderBy('id')
      .limit(BATCH_SIZE)
      .execute();
    if (ids.length === 0) break;

    await getDb().transaction().execute(async (tx) => {
      await sql`SELECT set_config('app.allow_audit_archive_delete', 'on', true)`.execute(tx);
      await tx
        .deleteFrom('audit_log')
        .where('id', 'in', ids.map((r) => r.id))
        .execute();
    });
    deleted += ids.length;
  }

  // eslint-disable-next-line no-console
  console.log(`Deleted ${deleted} archived rows. Done.`);
  await closeDb();
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
