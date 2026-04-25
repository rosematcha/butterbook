import * as Sentry from '@sentry/node';
import { getConfig } from '../config.js';

let initialized = false;

export function initSentry(): void {
  const cfg = getConfig();
  if (!cfg.SENTRY_DSN) return;

  Sentry.init({
    dsn: cfg.SENTRY_DSN,
    environment: cfg.NODE_ENV,
    beforeSend(event) {
      if (event.request) {
        delete event.request.data;
        delete event.request.cookies;
        if (event.request.headers) {
          delete event.request.headers.authorization;
          delete event.request.headers.cookie;
          delete event.request.headers['x-kiosk-nonce'];
        }
      }
      return event;
    },
  });
  initialized = true;
}

export function captureError(err: unknown, extras?: Record<string, unknown>): void {
  if (!initialized) return;
  Sentry.captureException(err, extras ? { extra: extras } : undefined);
}
