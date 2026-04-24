import { getDb, closeDb, sql } from '../db/index.js';
import { upsertVisitorFromFormResponse } from '../services/contacts.js';

async function main(): Promise<void> {
  const db = getDb();
  const rows = await db
    .selectFrom('visits')
    .select(['id', 'org_id', 'form_response'])
    .where('visitor_id', 'is', null)
    .execute();

  for (const row of rows) {
    await db.transaction().execute(async (tx) => {
      await sql`SELECT set_config('app.current_org_id', ${row.org_id}, true)`.execute(tx);
      const visitorId = await upsertVisitorFromFormResponse(tx, row.org_id, row.form_response as Record<string, unknown>);
      if (visitorId) {
        await tx.updateTable('visits').set({ visitor_id: visitorId }).where('id', '=', row.id).execute();
      }
    });
  }

  const waitlist = await db
    .selectFrom('waitlist_entries')
    .select(['id', 'org_id', 'form_response'])
    .where('visitor_id', 'is', null)
    .execute();

  for (const row of waitlist) {
    await db.transaction().execute(async (tx) => {
      await sql`SELECT set_config('app.current_org_id', ${row.org_id}, true)`.execute(tx);
      const visitorId = await upsertVisitorFromFormResponse(tx, row.org_id, row.form_response as Record<string, unknown>);
      if (visitorId) {
        await tx.updateTable('waitlist_entries').set({ visitor_id: visitorId }).where('id', '=', row.id).execute();
      }
    });
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDb();
  });
