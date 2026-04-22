import { getConfig } from '../../../config.js';
import { noopProvider } from './noop.js';
import { createResendProvider } from './resend.js';
import type { EmailProvider } from './types.js';

let cached: EmailProvider | null = null;

export function getEmailProvider(): EmailProvider {
  if (cached) return cached;
  const cfg = getConfig();
  cached = cfg.RESEND_API_KEY ? createResendProvider(cfg.RESEND_API_KEY) : noopProvider;
  return cached;
}

export function __resetEmailProviderForTests(): void {
  cached = null;
}

export type { EmailProvider } from './types.js';
