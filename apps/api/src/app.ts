import Fastify, { type FastifyInstance } from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyEtag from '@fastify/etag';
import fastifyRateLimit from '@fastify/rate-limit';
import { Redis } from 'ioredis';
import crypto from 'node:crypto';
import { Readable } from 'node:stream';
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
import { registerIntakeRoutes } from './routes/intake.js';
import { registerEventRoutes } from './routes/events.js';
import { registerPublicEventRoutes } from './routes/public-events.js';
import { registerWaitlistRoutes } from './routes/waitlist.js';
import { registerAuditRoutes } from './routes/audit.js';
import { registerNotificationRoutes } from './routes/notifications.js';
import { registerReportRoutes } from './routes/reports.js';
import { registerOrgExportRoutes } from './routes/org-export.js';
import { registerDemoRoutes } from './routes/demo.js';
import { registerManageRoutes } from './routes/manage.js';
import { registerBookingPolicyRoutes } from './routes/booking-policies.js';
import { registerBookingPageRoutes } from './routes/booking-page.js';
import { registerContactRoutes } from './routes/contacts.js';
import { registerMembershipRoutes } from './routes/memberships.js';
import { registerPromoCodeRoutes } from './routes/promo-codes.js';
import { registerBroadcastRoutes } from './routes/broadcasts.js';
import { registerStripeRoutes } from './routes/stripe.js';
import { registerPublicMembershipRoutes } from './routes/public-memberships.js';
import { registerMetricsRoutes } from './plugins/metrics.js';

declare module 'fastify' {
  interface FastifyRequest {
    rawBody?: Buffer;
  }
}

export async function buildApp(): Promise<FastifyInstance> {
  const cfg = getConfig();
  // Explicit annotation: fastify 5.8+ infers the HTTP2 overload from some logger
  // option shapes, which breaks every register*() below because they take the
  // default HTTP1 FastifyInstance. Pinning the type forces the HTTP1 variant.
  const app: FastifyInstance = Fastify({
    logger: buildLoggerOptions(),
    genReqId: () => crypto.randomUUID(),
    trustProxy: true,
    // Manage tokens are ~115 chars (uuid + ts + hmac-hex); default is 100.
    routerOptions: { maxParamLength: 256 },
  });

  await app.register(fastifyCors, {
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (cfg.CORS_ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
      cb(null, false);
    },
    credentials: false,
  });

  // Rate-limit state is in-memory by default (fine for a single-instance
  // deployment). When REDIS_URL is set, use it as a shared store so per-route
  // limits hold across horizontally scaled API instances — otherwise an
  // attacker can fan out 5 login attempts across N instances for 5N total.
  let redisClient: Redis | null = null;
  if (cfg.REDIS_URL && cfg.NODE_ENV !== 'test') {
    redisClient = new Redis(cfg.REDIS_URL, {
      connectTimeout: 500,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    });
    app.addHook('onClose', async () => {
      await redisClient?.quit();
    });
  }

  await app.register(fastifyRateLimit, {
    global: true,
    max: 300,
    timeWindow: '1 minute',
    keyGenerator: (req) => {
      if (req.userId) return `user:${req.userId}`;
      return `ip:${req.ip}`;
    },
    ...(redisClient ? { redis: redisClient } : {}),
    // Tests fan out hundreds of logins from 127.0.0.1 in seconds; the per-route
    // overrides (e.g. /auth/login max:5/min) would trip on every beforeEach and
    // leave the route matrix red. Skip limits entirely when NODE_ENV=test.
    ...(cfg.NODE_ENV === 'test' ? { allowList: () => true } : {}),
  });

  registerSecurityHeaders(app);
  registerErrorHandler(app);
  registerAuthContext(app);

  app.addHook('preParsing', async (req, _reply, payload) => {
    if (req.method !== 'POST' || !req.url.startsWith('/api/v1/stripe/webhook/')) return payload;
    const chunks: Buffer[] = [];
    for await (const chunk of payload) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const raw = Buffer.concat(chunks);
    req.rawBody = raw;
    return Readable.from(raw);
  });

  // Hash-based ETag on every response; @fastify/etag also returns 304 when
  // the incoming If-None-Match matches, so repeat dashboard refetches
  // round-trip with no body.
  await app.register(fastifyEtag);

  // Tell browsers / TanStack that per-org reads are revalidatable but must
  // always check with the server. Paired with the ETag above, a warm
  // navigation issues a conditional GET and gets back a 304.
  // Skip auth/kiosk/public/meta/health — they either have no revalidation
  // semantics or are shared cache-hostile. Skip the streaming export too;
  // it sets its own headers via reply.hijack().
  app.addHook('onSend', async (req, reply, payload) => {
    reply.header('X-Request-Id', req.id);
    if (req.method === 'GET' && req.url.startsWith('/api/v1/orgs/') && !req.url.includes('/export')) {
      // `private`: don't cache in shared proxies (responses are user-scoped).
      // `max-age=0, must-revalidate`: always revalidate via If-None-Match.
      reply.header('Cache-Control', 'private, max-age=0, must-revalidate');
    }
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
  registerIntakeRoutes(app);
  registerEventRoutes(app);
  registerPublicEventRoutes(app);
  registerWaitlistRoutes(app);
  registerAuditRoutes(app);
  registerNotificationRoutes(app);
  registerReportRoutes(app);
  registerOrgExportRoutes(app);
  registerDemoRoutes(app);
  registerManageRoutes(app);
  registerBookingPolicyRoutes(app);
  registerBookingPageRoutes(app);
  registerContactRoutes(app);
  registerMembershipRoutes(app);
  registerPromoCodeRoutes(app);
  registerBroadcastRoutes(app);
  registerStripeRoutes(app);
  registerPublicMembershipRoutes(app);
  registerMetricsRoutes(app);

  return app;
}
