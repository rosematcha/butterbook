import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_FORM_FIELDS } from '@butterbook/shared';
import { createTestOrg, loginToken, makeApp, truncateAll } from '../helpers/factories.js';
import { getDb } from '../../src/db/index.js';

describe('contacts CRM', () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it('upserts and links a visitor when creating visits with the same email', async () => {
    const app = await makeApp();
    try {
      const org = await createTestOrg('owner-contacts@example.com');
      const token = await loginToken(app, 'owner-contacts@example.com');
      await getDb()
        .updateTable('orgs')
        .set({
          form_fields: JSON.stringify([
            ...DEFAULT_FORM_FIELDS,
            {
              fieldKey: 'email',
              label: 'Email',
              fieldType: 'email',
              required: false,
              isSystem: false,
              isPrimaryLabel: false,
              displayOrder: 3,
            },
          ]),
        })
        .where('id', '=', org.orgId)
        .execute();

      await getDb()
        .insertInto('location_hours')
        .values({
          location_id: org.locationId,
          day_of_week: 1,
          open_time: '09:00',
          close_time: '17:00',
          is_active: true,
        })
        .execute();

      for (const scheduledAt of ['2026-04-13T14:00:00-04:00', '2026-04-13T15:00:00-04:00']) {
        const res = await app.inject({
          method: 'POST',
          url: `/api/v1/orgs/${org.orgId}/visits`,
          headers: { authorization: `Bearer ${token}` },
          payload: {
            locationId: org.locationId,
            scheduledAt,
            formResponse: {
              name: 'Ada Lovelace',
              email: 'Ada@Example.com',
              zip: '10001',
              party_size: 1,
            },
          },
        });
        expect(res.statusCode).toBe(200);
      }

      const visitors = await getDb().selectFrom('visitors').selectAll().where('org_id', '=', org.orgId).execute();
      expect(visitors).toHaveLength(1);
      expect(visitors[0]!.email).toBe('ada@example.com');
      expect(visitors[0]!.first_name).toBe('Ada');
      expect(visitors[0]!.last_name).toBe('Lovelace');

      const visits = await getDb().selectFrom('visits').select(['visitor_id']).where('org_id', '=', org.orgId).execute();
      expect(new Set(visits.map((v) => v.visitor_id))).toEqual(new Set([visitors[0]!.id]));
    } finally {
      await app.close();
    }
  });
});
