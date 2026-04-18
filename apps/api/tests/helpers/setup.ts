import { afterAll } from 'vitest';
import { loadConfig } from '../../src/config.js';
import { closeDb } from '../../src/db/index.js';

// Env must be set at setup-file top level (before any test file is imported),
// because src/utils/logger.ts evaluates getConfig() at module load time. If we
// deferred these to beforeAll, any test file whose imports transitively pull in
// logger.ts would fail suite collection with "Invalid environment config".
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'postgres://postgres:postgres@localhost:5432/butterbook_test';
}
if (!process.env.TOTP_ENCRYPTION_KEY) {
  process.env.TOTP_ENCRYPTION_KEY = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';
}
if (!process.env.SESSION_SECRET) {
  process.env.SESSION_SECRET = 'test_session_secret_must_be_at_least_32_chars';
}
if (!process.env.KIOSK_NONCE_SECRET) {
  process.env.KIOSK_NONCE_SECRET = 'test_kiosk_secret_must_be_at_least_32_chars';
}
if (!process.env.APP_BASE_URL) process.env.APP_BASE_URL = 'http://localhost:3000';
if (!process.env.CORS_ALLOWED_ORIGINS) process.env.CORS_ALLOWED_ORIGINS = 'http://localhost:3000';
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'warn';
loadConfig();

afterAll(async () => {
  await closeDb();
});
