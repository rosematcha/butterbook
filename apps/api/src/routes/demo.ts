// Demo-instance provisioning route.
//
// Mounted only when DEMO_MODE=true (wired in app.ts). Each POST seeds a fresh
// Whitman org, provisions an ephemeral superadmin session, and returns the
// session token so the web app can drop the visitor straight into /app.
//
// The companion GET exposes the display credentials for the landing page —
// always admin/password, but surfacing them via the API keeps the web app from
// hard-coding them if we ever rotate them.

import type { FastifyInstance } from 'fastify';
import { getConfig } from '../config.js';
import { countDemoOrgs, DEMO_PASSWORD, seedDemoOrg } from '../services/demo-seed.js';
import { RateLimitError } from '../errors/index.js';

export function registerDemoRoutes(app: FastifyInstance): void {
  const cfg = getConfig();
  if (!cfg.DEMO_MODE) return;

  app.get('/api/v1/demo/info', async () => {
    return {
      data: {
        ttlHours: cfg.DEMO_SESSION_TTL_HOURS,
        credentials: { username: 'admin', password: DEMO_PASSWORD },
      },
    };
  });

  // Tight per-IP rate limit sits in front of the cap check so a loop hammering
  // this endpoint can't exhaust DEMO_MAX_ORGS before hitting its own limit.
  // 3/hour is enough for real "try again after page refresh" patterns without
  // giving an attacker a meaningful foothold.
  app.post(
    '/api/v1/demo/session',
    { config: { rateLimit: { max: 3, timeWindow: '1 hour' } } },
    async (req) => {
      const active = await countDemoOrgs();
      if (active >= cfg.DEMO_MAX_ORGS) {
        throw new RateLimitError('Demo is at capacity. Try again in a few minutes.');
      }
      const { orgId, sessionToken, expiresAt } = await seedDemoOrg();
      req.log.info({ orgId, active: active + 1 }, 'demo.session.created');
      return {
        data: {
          token: sessionToken,
          expiresAt: expiresAt.toISOString(),
          orgId,
        },
      };
    },
  );
}
