import type { FastifyInstance } from 'fastify';
import { PERMISSIONS } from '@butterbook/shared';

export function registerMetaRoutes(app: FastifyInstance): void {
  app.get('/api/v1/permissions', async (req) => {
    req.requireAuth();
    return { data: PERMISSIONS };
  });
}
