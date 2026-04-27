import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getDb } from '../db/index.js';
import { verifyUnsubscribeToken } from '../utils/unsubscribe-token.js';
import { AuthenticationError, NotFoundError } from '../errors/index.js';

const tokenQuery = z.object({ token: z.string().min(10) });

// Public, unauthenticated routes gated by HMAC token. The token lookup is a
// bootstrap path (like kiosk qr_token and manage-link token), so it uses
// getDb() directly without org context.

export function registerUnsubscribeRoutes(app: FastifyInstance): void {
  // GET — returns org name + email for the confirmation UI
  app.get('/api/v1/notifications/unsubscribe', async (req, reply) => {
    const { token } = tokenQuery.parse(req.query);
    const payload = verifyUnsubscribeToken(token);
    if (!payload) throw new AuthenticationError('Invalid or expired unsubscribe link.');

    const db = getDb();
    const org = await db
      .selectFrom('orgs')
      .select(['name'])
      .where('id', '=', payload.orgId)
      .executeTakeFirst();
    if (!org) throw new NotFoundError('Organization not found.');

    const existing = await db
      .selectFrom('notification_suppressions')
      .select(['address'])
      .where('org_id', '=', payload.orgId)
      .where('address', '=', payload.email.toLowerCase())
      .executeTakeFirst();

    return reply.send({
      email: payload.email,
      orgName: org.name,
      alreadySuppressed: !!existing,
    });
  });

  // POST — writes the suppression row
  app.post('/api/v1/notifications/unsubscribe', async (req, reply) => {
    const { token } = tokenQuery.parse(req.query);
    const payload = verifyUnsubscribeToken(token);
    if (!payload) throw new AuthenticationError('Invalid or expired unsubscribe link.');

    const db = getDb();
    const org = await db
      .selectFrom('orgs')
      .select(['name'])
      .where('id', '=', payload.orgId)
      .executeTakeFirst();
    if (!org) throw new NotFoundError('Organization not found.');

    await db
      .insertInto('notification_suppressions')
      .values({
        org_id: payload.orgId,
        address: payload.email.toLowerCase(),
        reason: 'unsubscribe',
      })
      .onConflict((oc) => oc.columns(['org_id', 'address']).doNothing())
      .execute();

    return reply.send({ ok: true, orgName: org.name });
  });

  // POST resubscribe — removes the suppression row
  app.post('/api/v1/notifications/resubscribe', async (req, reply) => {
    const { token } = tokenQuery.parse(req.query);
    const payload = verifyUnsubscribeToken(token);
    if (!payload) throw new AuthenticationError('Invalid or expired unsubscribe link.');

    const db = getDb();
    await db
      .deleteFrom('notification_suppressions')
      .where('org_id', '=', payload.orgId)
      .where('address', '=', payload.email.toLowerCase())
      .execute();

    return reply.send({ ok: true });
  });
}
