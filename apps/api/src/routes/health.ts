import type { FastifyInstance } from 'fastify';
import { sql } from 'kysely';
import { getDb } from '../db/index.js';

export function registerHealthRoutes(app: FastifyInstance): void {
  app.get('/health/live', async () => ({ ok: true }));
  app.get('/health/ready', async (_req, reply) => {
    try {
      await sql`SELECT 1`.execute(getDb());
      return { ok: true };
    } catch {
      reply.status(503);
      return { ok: false };
    }
  });
  app.get('/health', async () => ({ ok: true, version: '0.1.0' }));
}
