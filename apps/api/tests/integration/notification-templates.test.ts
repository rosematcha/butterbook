import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestOrg, createUser, loginToken, makeApp, truncateAll } from '../helpers/factories.js';
import { getDb } from '../../src/db/index.js';
import { DEFAULT_TEMPLATES } from '../../src/services/notifications/default-templates.js';

describe('notification template editing', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await makeApp();
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    await truncateAll();
  });

  it('updates a template and records customization', async () => {
    const { orgId } = await createTestOrg('notif-edit@example.com');
    const token = await loginToken(app, 'notif-edit@example.com');

    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/orgs/${orgId}/notifications/templates/visit.confirmation`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        subject: 'Updated for {{orgName}}',
        bodyHtml: '<p>Hello {{visitorName}}</p>',
        bodyText: 'Hello {{visitorName}}',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { data: { subject: string; is_customized: boolean } };
    expect(body.data.subject).toBe('Updated for {{orgName}}');
    expect(body.data.is_customized).toBe(true);

    const row = await getDb()
      .selectFrom('notification_templates')
      .select(['subject', 'body_html', 'body_text', 'is_customized'])
      .where('org_id', '=', orgId)
      .where('template_key', '=', 'visit.confirmation')
      .executeTakeFirstOrThrow();
    expect(row).toMatchObject({
      subject: 'Updated for {{orgName}}',
      body_html: '<p>Hello {{visitorName}}</p>',
      body_text: 'Hello {{visitorName}}',
      is_customized: true,
    });

    const audit = await getDb()
      .selectFrom('audit_log')
      .select(['action'])
      .where('org_id', '=', orgId)
      .where('action', '=', 'notification_template.updated')
      .executeTakeFirst();
    expect(audit).toBeTruthy();
  });

  it('rejects templates that cannot render with the supported payload', async () => {
    const { orgId } = await createTestOrg('notif-invalid@example.com');
    const token = await loginToken(app, 'notif-invalid@example.com');

    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/orgs/${orgId}/notifications/templates/visit.confirmation`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        subject: 'Updated {{unknownVariable}}',
        bodyHtml: '<p>Hello {{visitorName}}</p>',
        bodyText: 'Hello {{visitorName}}',
      },
    });

    expect(res.statusCode).toBe(422);
  });

  it('requires authentication and notifications.manage permission', async () => {
    const { orgId } = await createTestOrg('notif-owner@example.com');
    const userId = await createUser('notif-member@example.com');
    await getDb()
      .insertInto('org_members')
      .values({ org_id: orgId, user_id: userId, is_superadmin: false })
      .execute();
    const memberToken = await loginToken(app, 'notif-member@example.com');
    const payload = {
      subject: 'Updated {{orgName}}',
      bodyHtml: '<p>Hello {{visitorName}}</p>',
      bodyText: 'Hello {{visitorName}}',
    };

    const unauth = await app.inject({
      method: 'PUT',
      url: `/api/v1/orgs/${orgId}/notifications/templates/visit.confirmation`,
      payload,
    });
    expect(unauth.statusCode).toBe(401);

    const forbidden = await app.inject({
      method: 'PUT',
      url: `/api/v1/orgs/${orgId}/notifications/templates/visit.confirmation`,
      headers: { authorization: `Bearer ${memberToken}` },
      payload,
    });
    expect(forbidden.statusCode).toBe(403);
  });

  it('reverts a customized seeded template to the current default', async () => {
    const { orgId } = await createTestOrg('notif-revert@example.com');
    const token = await loginToken(app, 'notif-revert@example.com');
    const def = DEFAULT_TEMPLATES.find((t) => t.templateKey === 'visit.confirmation')!;

    await app.inject({
      method: 'PUT',
      url: `/api/v1/orgs/${orgId}/notifications/templates/visit.confirmation`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        subject: 'Custom {{orgName}}',
        bodyHtml: '<p>Custom {{visitorName}}</p>',
        bodyText: 'Custom {{visitorName}}',
      },
    });

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/orgs/${orgId}/notifications/templates/visit.confirmation/revert`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { data: { subject: string; body_html: string; body_text: string; is_customized: boolean } };
    expect(body.data).toMatchObject({
      subject: def.subject,
      body_html: def.bodyHtml,
      body_text: def.bodyText,
      is_customized: false,
    });

    const audit = await getDb()
      .selectFrom('audit_log')
      .select(['action'])
      .where('org_id', '=', orgId)
      .where('action', '=', 'notification_template.reverted')
      .executeTakeFirst();
    expect(audit).toBeTruthy();
  });
});
