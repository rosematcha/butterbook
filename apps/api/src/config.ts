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
  APP_BASE_URL: z.string().url(),
  CORS_ALLOWED_ORIGINS: z.string().transform((s) =>
    s
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean),
  ),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),

  FEATURE_EMAIL_NOTIFICATIONS: z.coerce.boolean().default(false),
  FEATURE_PII_AUTO_PURGE: z.coerce.boolean().default(false),
  FEATURE_WORDPRESS_API: z.coerce.boolean().default(false),

  // Optional. If set, GET /metrics requires `Authorization: Bearer <METRICS_TOKEN>`.
  // If unset, /metrics is unavailable (returns 404). Do not expose publicly.
  METRICS_TOKEN: z.string().min(16).optional(),

  // Optional. If set, @fastify/rate-limit uses Redis as its shared store so
  // per-route quotas (e.g. login 5/min) hold across horizontally scaled API
  // instances. If unset, the default in-memory store is used — fine for a
  // single-instance deployment, unsafe for multi-instance.
  REDIS_URL: z.string().url().optional(),
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
