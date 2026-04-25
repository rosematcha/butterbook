import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { AppError, InternalError, RateLimitError, ValidationError } from '../errors/index.js';
import { captureError } from '../utils/sentry.js';

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((err: unknown, req: FastifyRequest, reply: FastifyReply) => {
    const instance = req.url;

    if (err instanceof AppError) {
      reply
        .status(err.status)
        .type('application/problem+json')
        .send(err.toProblem(instance));
      return;
    }

    if (err instanceof ZodError) {
      const v = new ValidationError(
        'One or more fields failed validation.',
        err.errors.map((e) => ({ path: e.path.join('.'), message: e.message })),
      );
      reply.status(v.status).type('application/problem+json').send(v.toProblem(instance));
      return;
    }

    const fe = err as { statusCode?: number; code?: string; validation?: unknown; message?: string };

    // Fastify built-in validation failure (schema-level).
    if (fe?.validation) {
      const v = new ValidationError(
        'Request failed schema validation.',
        Array.isArray(fe.validation)
          ? fe.validation.map((x: { instancePath?: string; message?: string }) => ({
              path: x.instancePath ?? '',
              message: x.message ?? 'invalid',
            }))
          : undefined,
      );
      reply.status(v.status).type('application/problem+json').send(v.toProblem(instance));
      return;
    }

    // @fastify/rate-limit throws with statusCode 429.
    if (fe?.statusCode === 429) {
      const r = new RateLimitError(fe.message ?? 'Too many requests.');
      reply.status(r.status).type('application/problem+json').send(r.toProblem(instance));
      return;
    }

    if (fe?.statusCode && fe.statusCode >= 400 && fe.statusCode < 500) {
      reply
        .status(fe.statusCode)
        .type('application/problem+json')
        .send({
          type: 'about:blank',
          title: fe.message ?? 'Error',
          status: fe.statusCode,
          instance,
        });
      return;
    }

    req.log.error({ err }, 'unhandled error');
    captureError(err, {
      requestId: req.id,
      route: req.routeOptions?.url ?? req.url,
      method: req.method,
      orgId: (req as { orgId?: string }).orgId,
    });
    const internal = new InternalError('An unexpected error occurred.');
    reply.status(500).type('application/problem+json').send(internal.toProblem(instance));
  });
}
