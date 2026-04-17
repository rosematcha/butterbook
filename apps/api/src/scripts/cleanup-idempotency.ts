#!/usr/bin/env tsx
// Deletes expired idempotency_keys. Designed to run from cron once per day.
// This is a privileged maintenance task; it should be run under the app_admin
// role (the runtime app role cannot see other orgs' rows). The script is
// intentionally unscoped — idempotency keys are not tenant-sensitive data,
// just a cache with TTL.

import { loadConfig } from '../config.js';
import { closeDb, getDb } from '../db/index.js';

async function main(): Promise<void> {
  loadConfig();
  const res = await getDb()
    .deleteFrom('idempotency_keys')
    .where('expires_at', '<', new Date())
    .executeTakeFirst();
  // eslint-disable-next-line no-console
  console.log(`deleted ${Number(res.numDeletedRows ?? 0)} expired idempotency keys`);
  await closeDb();
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
