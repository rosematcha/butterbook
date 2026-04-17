import Fastify, { type FastifyInstance } from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyRateLimit from '@fastify/rate-limit';
import crypto from 'node:crypto';
import { getConfig } from './config.js';
import { buildLoggerOptions } from './utils/logger.js';
import { registerErrorHandler } from './plugins/error-handler.js';
import { registerSecurityHeaders } from './plugins/security-headers.js';
import { registerAuthContext } from './plugins/auth-context.js';
import { registerHealthRoutes } from './routes/health.js';
import { registerMetaRoutes } from './routes/meta.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerOrgRoutes } from './routes/orgs.js';
import { registerMemberRoutes } from './routes/members.js';
import { registerRoleRoutes } from './routes/roles.js';
import { registerInvitationRoutes } from './routes/invitations.js';
import { registerLocationRoutes } from './routes/locations.js';
import { registerHoursRoutes } from './routes/hours.js';
import { registerAvailabilityRoutes } from './routes/availability.js';
import { registerVisitRoutes } from './routes/visits.js';
import { registerPublicBookingRoutes } from './routes/public-booking.js';
import { registerKioskRoutes } from './routes/kiosk.js';
import { registerEventRoutes } from './routes/events.js';
import { registerPublicEventRoutes } from './routes/public-events.js';
import { registerWaitlistRoutes } from './routes/waitlist.js';
import { registerAuditRoutes } from './routes/audit.js';
import { registerReportRoutes } from './routes/reports.js';
import { registerOrgExportRoutes } from './routes/org-export.js';
import { registerMetricsRoutes } from './plugins/metrics.js';

export async function buildApp(): Promise<FastifyInstance> {
  const cfg = getConfig();
  const app = Fastify({
    logger: buildLoggerOptions(),
    genReqId: () => crypto.randomUUID(),
    trustProxy: true,
  });

  await app.register(fastifyCors, {
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (cfg.CORS_ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
      cb(null, false);
    },
    credentials: false,
  });

  await app.register(fastifyRateLimit, {
    global: true,
    max: 300,
    timeWindow: '1 minute',
    keyGenerator: (req) => {
      if (req.userId) return `user:${req.userId}`;
      return `ip:${req.ip}`;
    },
  });

  registerSecurityHeaders(app);
  registerErrorHandler(app);
  registerAuthContext(app);

  // Request-id echo.
  app.addHook('onSend', async (req, reply, payload) => {
    reply.header('X-Request-Id', req.id);
    return payload;
  });

  registerHealthRoutes(app);
  registerMetaRoutes(app);
  registerAuthRoutes(app);
  registerOrgRoutes(app);
  registerMemberRoutes(app);
  registerRoleRoutes(app);
  registerInvitationRoutes(app);
  registerLocationRoutes(app);
  registerHoursRoutes(app);
  registerAvailabilityRoutes(app);
  registerVisitRoutes(app);
  registerPublicBookingRoutes(app);
  registerKioskRoutes(app);
  registerEventRoutes(app);
  registerPublicEventRoutes(app);
  registerWaitlistRoutes(app);
  registerAuditRoutes(app);
  registerReportRoutes(app);
  registerOrgExportRoutes(app);
  registerMetricsRoutes(app);

  return app;
}
