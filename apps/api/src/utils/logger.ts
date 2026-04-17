import pino, { type LoggerOptions } from 'pino';
import { getConfig } from '../config.js';

export function buildLoggerOptions(): LoggerOptions {
  const cfg = getConfig();
  return {
    level: cfg.LOG_LEVEL,
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers["x-kiosk-nonce"]',
        'req.headers.cookie',
        'req.body.password',
        'req.body.newPassword',
        'req.body.currentPassword',
        'req.body.totpCode',
        'req.body.code',
        'req.body.formResponse.name',
        'res.body.token',
        '*.password',
        '*.token',
      ],
      censor: '[REDACTED]',
    },
    base: { service: 'api' },
    timestamp: pino.stdTimeFunctions.isoTime,
  };
}

export const logger = pino(buildLoggerOptions());
