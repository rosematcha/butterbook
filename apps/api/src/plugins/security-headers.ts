import type { FastifyInstance } from 'fastify';
import { getConfig } from '../config.js';

export function registerSecurityHeaders(app: FastifyInstance): void {
  // Pin at register time so the hot path doesn't re-call getConfig() on every
  // response. DEMO_MODE is fixed for the life of a process.
  const isDemo = getConfig().DEMO_MODE;
  app.addHook('onSend', async (req, reply, payload) => {
    reply.header('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
    reply.header(
      'Permissions-Policy',
      'geolocation=(), microphone=(), camera=(), payment=()',
    );
    reply.header(
      'Content-Security-Policy',
      [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: https:",
        "connect-src 'self'",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ].join('; '),
    );
    if (isDemo) {
      // Belt-and-suspenders with the web app's <meta> tag — this header also
      // covers any direct-to-API crawling and the ephemeral public event URLs
      // visitors play with inside their demo org.
      reply.header('X-Robots-Tag', 'noindex, nofollow, noarchive');
    }
    return payload;
  });
}
