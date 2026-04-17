import type { FastifyInstance } from 'fastify';

export function registerSecurityHeaders(app: FastifyInstance): void {
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
    return payload;
  });
}
