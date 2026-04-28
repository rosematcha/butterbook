import { z } from 'zod';

const ConfigSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3001),
  DATABASE_URL: z.string().url(),
  DATABASE_POOL_SIZE: z.coerce.number().default(20),
  TOTP_ENCRYPTION_KEY: z
    .string()
    .regex(/^[A-Za-z0-9+/=]+$/)
    .refine((s) => Buffer.from(s, 'base64').length === 32, 'Must decode to exactly 32 bytes'),
  SESSION_SECRET: z.string().min(32),
  KIOSK_NONCE_SECRET: z.string().min(32),
  // Signs visitor manage-link tokens embedded in confirmation/waitlist-promo
  // emails. Rotating this invalidates every outstanding manage link.
  MANAGE_TOKEN_SECRET: z.string().min(32),
  APP_BASE_URL: z.string().url(),
  CORS_ALLOWED_ORIGINS: z.string().transform((s) =>
    s
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean),
  ),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),

  FEATURE_PII_AUTO_PURGE: z.coerce.boolean().default(false),

  // Master switch for the notifications subsystem. When false, subscribers
  // no-op (no outbox rows written) and the worker loops sleep idle. When true
  // and RESEND_API_KEY is set, the worker sends via Resend; when true and the
  // key is missing, the noop provider is used (logs the message, returns a
  // fake id) — useful for staging.
  NOTIFICATIONS_ENABLED: z.coerce.boolean().default(false),
  RESEND_API_KEY: z.string().min(10).optional(),
  EMAIL_FROM_ADDRESS: z.string().email().optional(),

  // Worker loop knobs. Defaults tuned for a single-instance deployment.
  WORKER_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(1000),
  WORKER_BATCH_SIZE: z.coerce.number().int().positive().default(25),

  // Optional. If set, GET /metrics requires `Authorization: Bearer <METRICS_TOKEN>`.
  // If unset, /metrics is unavailable (returns 404). Do not expose publicly.
  METRICS_TOKEN: z.string().min(16).optional(),

  // Optional. If set, @fastify/rate-limit uses Redis as its shared store so
  // per-route quotas (e.g. login 5/min) hold across horizontally scaled API
  // instances. If unset, the default in-memory store is used — fine for a
  // single-instance deployment, unsafe for multi-instance.
  REDIS_URL: z.string().url().optional(),

  // Stripe Connect. Optional until Phase 3 is enabled for a deployment; routes
  // that need these values return 409 when they are missing.
  STRIPE_SECRET_KEY: z.string().min(10).optional(),
  STRIPE_CONNECT_CLIENT_ID: z.string().min(5).optional(),
  STRIPE_WEBHOOK_SIGNING_SECRET: z.string().min(10).optional(),

  // Optional. If set, 5xx errors are reported to Sentry. 4xx are not.
  // If unset, Sentry is not initialized and all error handling is unchanged.
  SENTRY_DSN: z.string().url().optional(),

  // Audit log archival. The archive script exports rows older than
  // AUDIT_RETENTION_DAYS to AUDIT_ARCHIVE_DIR as JSONL, then deletes them.
  // If AUDIT_ARCHIVE_DIR is unset, the script logs and exits 0.
  AUDIT_RETENTION_DAYS: z.coerce.number().int().positive().default(730),
  AUDIT_ARCHIVE_DIR: z.string().min(1).optional(),

  // Demo deployment flags.
  // DEMO_MODE=true turns on: the /demo/session provisioning route, the
  // X-Robots-Tag: noindex response header, and the requireNotDemo() guard on
  // destructive actions. On prod API instances it must stay false.
  // Master switch for plan-based feature gating and billing routes.
  // When false (default), every feature check passes and /billing/* returns 404.
  // Hosted deploys set this to true; self-hosters leave it unset.
  BILLING_GATING_ENABLED: z.coerce.boolean().default(false),

  DEMO_MODE: z.coerce.boolean().default(false),
  // Hard cap on concurrent demo orgs. New provision requests above this are
  // rejected with 429. Tune from the `demo_orgs_active` metric.
  DEMO_MAX_ORGS: z.coerce.number().int().positive().default(512),
  // Hours of inactivity before the prune cron hard-deletes a demo org.
  DEMO_SESSION_TTL_HOURS: z.coerce.number().int().positive().default(12),
});

export type AppConfig = z.infer<typeof ConfigSchema>;

let cached: AppConfig | null = null;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = ConfigSchema.safeParse(env);
  if (!parsed.success) {
    const details = parsed.error.errors
      .map((e) => `  ${e.path.join('.')}: ${e.message}`)
      .join('\n');
    throw new Error(`Invalid environment config:\n${details}`);
  }
  cached = parsed.data;
  return parsed.data;
}

export function getConfig(): AppConfig {
  if (!cached) return loadConfig();
  return cached;
}

// Test-only: drops the cache so the next loadConfig()/getConfig() re-reads env.
export function __resetConfigForTests(): void {
  cached = null;
}
