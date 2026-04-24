import crypto from 'node:crypto';
import { ConflictError, ValidationError } from '../errors/index.js';
import { getConfig } from '../config.js';

const STATE_TTL_MS = 10 * 60 * 1000;

function hmac(input: string): string {
  return crypto.createHmac('sha256', getConfig().SESSION_SECRET).update(input).digest('hex');
}

export function makeStripeConnectState(orgId: string, now = new Date()): string {
  const expiresAt = now.getTime() + STATE_TTL_MS;
  const payload = `${orgId}.${expiresAt}`;
  return `${payload}.${hmac(payload)}`;
}

export function verifyStripeConnectState(state: string, now = new Date()): { orgId: string } {
  const parts = state.split('.');
  if (parts.length !== 3) throw new ValidationError('Invalid Stripe Connect state');
  const [orgId, expiresAtRaw, mac] = parts;
  if (!orgId || !expiresAtRaw || !mac) throw new ValidationError('Invalid Stripe Connect state');
  const expiresAt = Number(expiresAtRaw);
  if (!Number.isFinite(expiresAt) || expiresAt < now.getTime()) {
    throw new ValidationError('Expired Stripe Connect state');
  }
  const payload = `${orgId}.${expiresAtRaw}`;
  const expected = hmac(payload);
  if (mac.length !== expected.length) throw new ValidationError('Invalid Stripe Connect state');
  if (!crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) {
    throw new ValidationError('Invalid Stripe Connect state');
  }
  return { orgId };
}

export function buildStripeConnectUrl(orgId: string): string {
  const cfg = getConfig();
  if (!cfg.STRIPE_CONNECT_CLIENT_ID) {
    throw new ConflictError('Stripe Connect is not configured');
  }
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: cfg.STRIPE_CONNECT_CLIENT_ID,
    scope: 'read_write',
    state: makeStripeConnectState(orgId),
    redirect_uri: `${cfg.APP_BASE_URL.replace(/\/$/, '')}/api/v1/stripe/connect/callback`,
  });
  return `https://connect.stripe.com/oauth/authorize?${params.toString()}`;
}

export interface StripeOauthAccount {
  stripeAccountId: string;
  defaultCurrency: string;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
}

export async function exchangeStripeConnectCode(code: string): Promise<StripeOauthAccount> {
  const cfg = getConfig();
  if (!cfg.STRIPE_SECRET_KEY) throw new ConflictError('Stripe secret key is not configured');
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
  });
  const res = await fetch('https://connect.stripe.com/oauth/token', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${cfg.STRIPE_SECRET_KEY}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body,
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const message = typeof json.error_description === 'string' ? json.error_description : 'Stripe Connect OAuth exchange failed';
    throw new ConflictError(message);
  }
  const stripeAccountId = typeof json.stripe_user_id === 'string' ? json.stripe_user_id : '';
  if (!stripeAccountId) throw new ConflictError('Stripe Connect response did not include an account id');
  const status = await fetchStripeAccountStatus(stripeAccountId);
  return {
    stripeAccountId,
    defaultCurrency: status.defaultCurrency ?? (typeof json.stripe_user_default_currency === 'string' ? json.stripe_user_default_currency.toLowerCase() : 'usd'),
    chargesEnabled: status.chargesEnabled,
    payoutsEnabled: status.payoutsEnabled,
  };
}

async function fetchStripeAccountStatus(stripeAccountId: string): Promise<{
  defaultCurrency: string | null;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
}> {
  const res = await fetch(`https://api.stripe.com/v1/accounts/${encodeURIComponent(stripeAccountId)}`, {
    headers: { authorization: `Bearer ${getConfig().STRIPE_SECRET_KEY}` },
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const message = typeof json.error === 'object' && json.error && 'message' in json.error && typeof json.error.message === 'string'
      ? json.error.message
      : 'Stripe account status lookup failed';
    throw new ConflictError(message);
  }
  return {
    defaultCurrency: typeof json.default_currency === 'string' ? json.default_currency.toLowerCase() : null,
    chargesEnabled: json.charges_enabled === true,
    payoutsEnabled: json.payouts_enabled === true,
  };
}
