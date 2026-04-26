import crypto from 'node:crypto';
import type { Tx, OutboxEventInput } from '../db/index.js';
import { ConflictError, ValidationError } from '../errors/index.js';
import { getConfig } from '../config.js';
import { defaultMembershipExpiry, issueGuestPassesForMembershipInTx, selectMembership } from './memberships.js';

const STATE_TTL_MS = 10 * 60 * 1000;
const WEBHOOK_TOLERANCE_SECONDS = 5 * 60;

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

export interface StripeCheckoutSessionInput {
  orgSlug: string;
  stripeAccountId: string;
  membershipId: string;
  visitorId: string;
  tierId: string;
  tierName: string;
  tierDescription: string | null;
  amountCents: number;
  currency: string;
  billingInterval: 'year' | 'month' | 'lifetime' | 'one_time';
  customerEmail: string;
  promoCodeId?: string | undefined;
  promoCode?: string | undefined;
  originalAmountCents?: number | undefined;
  discountCents?: number | undefined;
  successUrl?: string | undefined;
  cancelUrl?: string | undefined;
}

export interface StripeCheckoutSession {
  id: string;
  url: string;
}

export async function createStripeCheckoutSession(input: StripeCheckoutSessionInput): Promise<StripeCheckoutSession> {
  const cfg = getConfig();
  if (!cfg.STRIPE_SECRET_KEY) throw new ConflictError('Stripe secret key is not configured');
  if (input.amountCents <= 0) throw new ConflictError('Stripe checkout requires a paid membership tier');

  const checkoutBase = cfg.APP_BASE_URL.replace(/\/$/, '');
  const successUrl = input.successUrl ?? `${checkoutBase}/join/${encodeURIComponent(input.orgSlug)}?checkout=success&session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = input.cancelUrl ?? `${checkoutBase}/join/${encodeURIComponent(input.orgSlug)}?checkout=cancelled`;
  const isRecurring = input.billingInterval === 'month' || input.billingInterval === 'year';

  const body = new URLSearchParams({
    mode: isRecurring ? 'subscription' : 'payment',
    customer_email: input.customerEmail,
    client_reference_id: input.membershipId,
    success_url: successUrl,
    cancel_url: cancelUrl,
    'line_items[0][quantity]': '1',
    'line_items[0][price_data][currency]': input.currency,
    'line_items[0][price_data][unit_amount]': String(input.amountCents),
    'line_items[0][price_data][product_data][name]': input.tierName,
    'metadata[orgSlug]': input.orgSlug,
    'metadata[membershipId]': input.membershipId,
    'metadata[visitorId]': input.visitorId,
    'metadata[tierId]': input.tierId,
  });
  if (input.promoCodeId && input.promoCode && input.originalAmountCents !== undefined && input.discountCents !== undefined) {
    body.set('metadata[promoCodeId]', input.promoCodeId);
    body.set('metadata[promoCode]', input.promoCode);
    body.set('metadata[originalAmountCents]', String(input.originalAmountCents));
    body.set('metadata[discountCents]', String(input.discountCents));
  }
  if (input.tierDescription) {
    body.set('line_items[0][price_data][product_data][description]', input.tierDescription);
  }
  if (isRecurring) {
    body.set('line_items[0][price_data][recurring][interval]', input.billingInterval);
    body.set('subscription_data[metadata][membershipId]', input.membershipId);
    body.set('subscription_data[metadata][visitorId]', input.visitorId);
    body.set('subscription_data[metadata][tierId]', input.tierId);
    if (input.promoCodeId && input.promoCode && input.originalAmountCents !== undefined && input.discountCents !== undefined) {
      body.set('subscription_data[metadata][promoCodeId]', input.promoCodeId);
      body.set('subscription_data[metadata][promoCode]', input.promoCode);
      body.set('subscription_data[metadata][originalAmountCents]', String(input.originalAmountCents));
      body.set('subscription_data[metadata][discountCents]', String(input.discountCents));
    }
  } else {
    body.set('payment_intent_data[metadata][membershipId]', input.membershipId);
    body.set('payment_intent_data[metadata][visitorId]', input.visitorId);
    body.set('payment_intent_data[metadata][tierId]', input.tierId);
    if (input.promoCodeId && input.promoCode && input.originalAmountCents !== undefined && input.discountCents !== undefined) {
      body.set('payment_intent_data[metadata][promoCodeId]', input.promoCodeId);
      body.set('payment_intent_data[metadata][promoCode]', input.promoCode);
      body.set('payment_intent_data[metadata][originalAmountCents]', String(input.originalAmountCents));
      body.set('payment_intent_data[metadata][discountCents]', String(input.discountCents));
    }
  }

  const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${cfg.STRIPE_SECRET_KEY}`,
      'content-type': 'application/x-www-form-urlencoded',
      'stripe-account': input.stripeAccountId,
    },
    body,
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const message = typeof json.error === 'object' && json.error && 'message' in json.error && typeof json.error.message === 'string'
      ? json.error.message
      : 'Stripe Checkout Session creation failed';
    throw new ConflictError(message);
  }
  const id = typeof json.id === 'string' ? json.id : '';
  const url = typeof json.url === 'string' ? json.url : '';
  if (!id || !url) throw new ConflictError('Stripe Checkout response did not include a session URL');
  return { id, url };
}

export interface StripeRefundInput {
  stripeAccountId: string;
  paymentReference: string;
  amountCents: number;
  idempotencyKey: string;
}

export interface StripeRefund {
  id: string;
}

export async function createStripeRefund(input: StripeRefundInput): Promise<StripeRefund> {
  const cfg = getConfig();
  if (!cfg.STRIPE_SECRET_KEY) throw new ConflictError('Stripe secret key is not configured');
  if (input.amountCents <= 0) throw new ConflictError('Refund amount must be greater than zero');

  const body = new URLSearchParams({
    amount: String(input.amountCents),
  });
  if (input.paymentReference.startsWith('pi_')) {
    body.set('payment_intent', input.paymentReference);
  } else {
    body.set('charge', input.paymentReference);
  }

  const res = await fetch('https://api.stripe.com/v1/refunds', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${cfg.STRIPE_SECRET_KEY}`,
      'content-type': 'application/x-www-form-urlencoded',
      'stripe-account': input.stripeAccountId,
      'idempotency-key': input.idempotencyKey,
    },
    body,
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const message = typeof json.error === 'object' && json.error && 'message' in json.error && typeof json.error.message === 'string'
      ? json.error.message
      : 'Stripe refund creation failed';
    throw new ConflictError(message);
  }
  const id = typeof json.id === 'string' ? json.id : '';
  if (!id) throw new ConflictError('Stripe refund response did not include a refund id');
  return { id };
}

export async function cancelStripeSubscription(
  stripeAccountId: string,
  subscriptionId: string,
): Promise<void> {
  const cfg = getConfig();
  if (!cfg.STRIPE_SECRET_KEY) throw new ConflictError('Stripe secret key is not configured');
  const res = await fetch(`https://api.stripe.com/v1/subscriptions/${subscriptionId}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${cfg.STRIPE_SECRET_KEY}`,
      'content-type': 'application/x-www-form-urlencoded',
      'stripe-account': stripeAccountId,
    },
    body: new URLSearchParams({ cancel_at_period_end: 'true' }),
  });
  if (!res.ok) {
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    const message =
      typeof json.error === 'object' && json.error && 'message' in json.error && typeof json.error.message === 'string'
        ? json.error.message
        : 'Stripe subscription cancellation failed';
    throw new ConflictError(message);
  }
}

export interface StripeWebhookEvent {
  id: string;
  type: string;
  data?: { object?: Record<string, unknown> };
}

export function verifyStripeWebhookSignature(
  rawBody: Buffer,
  signatureHeader: string,
  secret: string,
  now = new Date(),
): StripeWebhookEvent {
  const parts = signatureHeader.split(',').map((part) => part.trim());
  const timestamp = parts.find((part) => part.startsWith('t='))?.slice(2);
  const signatures = parts.filter((part) => part.startsWith('v1=')).map((part) => part.slice(3));
  if (!timestamp || signatures.length === 0) throw new ValidationError('Invalid Stripe webhook signature');
  const timestampSeconds = Number(timestamp);
  if (!Number.isFinite(timestampSeconds)) throw new ValidationError('Invalid Stripe webhook timestamp');
  const ageSeconds = Math.abs(Math.floor(now.getTime() / 1000) - timestampSeconds);
  if (ageSeconds > WEBHOOK_TOLERANCE_SECONDS) throw new ValidationError('Expired Stripe webhook signature');

  const expected = crypto.createHmac('sha256', secret).update(`${timestamp}.${rawBody.toString('utf8')}`).digest('hex');
  const ok = signatures.some((sig) => {
    if (sig.length !== expected.length) return false;
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  });
  if (!ok) throw new ValidationError('Invalid Stripe webhook signature');

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody.toString('utf8')) as unknown;
  } catch {
    throw new ValidationError('Invalid Stripe webhook payload');
  }
  if (!parsed || typeof parsed !== 'object') throw new ValidationError('Invalid Stripe webhook payload');
  const event = parsed as Partial<StripeWebhookEvent>;
  if (!event.id || !event.type) throw new ValidationError('Invalid Stripe webhook payload');
  return event as StripeWebhookEvent;
}

export async function applyStripeWebhookEvent(
  tx: Tx,
  orgId: string,
  event: StripeWebhookEvent,
  emit: (input: OutboxEventInput) => Promise<void>,
): Promise<{ handled: boolean; membershipId: string | null }> {
  switch (event.type) {
    case 'checkout.session.completed':
      return handleCheckoutSessionCompleted(tx, orgId, event, emit);
    case 'invoice.paid':
      return handleInvoicePaid(tx, orgId, event, emit);
    case 'invoice.payment_failed':
      return handleInvoicePaymentFailed(tx, orgId, event, emit);
    case 'customer.subscription.updated':
      return handleSubscriptionUpdated(tx, orgId, event);
    case 'customer.subscription.deleted':
      return handleSubscriptionDeleted(tx, orgId, event, emit);
    default:
      return { handled: false, membershipId: null };
  }
}

async function handleCheckoutSessionCompleted(
  tx: Tx,
  orgId: string,
  event: StripeWebhookEvent,
  emit: (input: OutboxEventInput) => Promise<void>,
) {
  const obj = event.data?.object ?? {};
  const membershipId = stringFromMetadata(obj, 'membershipId') ?? asString(obj.client_reference_id);
  if (!membershipId) return { handled: false, membershipId: null };
  const membership = await membershipWithTier(tx, orgId, membershipId);
  if (!membership) return { handled: false, membershipId };

  const now = new Date();
  const subscriptionId = asString(obj.subscription);
  const customerId = asString(obj.customer);
  const expiresAt = membership.expires_at ?? defaultMembershipExpiry(now, membership.duration_days, membership.billing_interval);
  await tx
    .updateTable('memberships')
    .set({
      status: 'active',
      started_at: membership.started_at ?? now,
      expires_at: expiresAt,
      stripe_subscription_id: subscriptionId,
      auto_renew: subscriptionId !== null || membership.auto_renew,
      metadata: JSON.stringify({ ...asRecord(membership.metadata), checkoutSessionId: event.data?.object?.id ?? event.id, stripeEventId: event.id }),
    })
    .where('org_id', '=', orgId)
    .where('id', '=', membershipId)
    .where('status', 'in', ['pending', 'active'])
    .execute();
  if (customerId) {
    await tx.updateTable('visitors').set({ stripe_customer_id: customerId }).where('org_id', '=', orgId).where('id', '=', membership.visitor_id).execute();
  }
  await upsertStripePayment(tx, orgId, membershipId, {
    amountCents: asNumber(obj.amount_total) ?? membership.price_cents,
    currency: asString(obj.currency) ?? 'usd',
    invoiceId: asString(obj.invoice),
    stripeChargeId: asString(obj.charge) ?? asString(obj.payment_intent),
  });
  await issueGuestPassesForMembershipInTx(tx, orgId, membershipId);
  const row = await selectMembership(tx, orgId, membershipId);
  if (row) {
    await emit({
      eventType: 'membership.created',
      aggregateType: 'membership',
      aggregateId: membershipId,
      payload: { to: row.visitor_email, tierName: row.tier_name, membershipId, expiresAt: row.expires_at?.toISOString() ?? '' },
    });
  }
  return { handled: true, membershipId };
}

async function handleInvoicePaid(
  tx: Tx,
  orgId: string,
  event: StripeWebhookEvent,
  emit: (input: OutboxEventInput) => Promise<void>,
) {
  const obj = event.data?.object ?? {};
  const membershipId = await membershipIdFromObject(tx, orgId, obj);
  if (!membershipId) return { handled: false, membershipId: null };
  const membership = await membershipWithTier(tx, orgId, membershipId);
  if (!membership) return { handled: false, membershipId };
  const wasActive = membership.status === 'active';
  const now = new Date();
  const base = membership.expires_at && membership.expires_at > now ? membership.expires_at : now;
  const expiresAt = defaultMembershipExpiry(base, membership.duration_days, membership.billing_interval);
  await tx
    .updateTable('memberships')
    .set({
      status: 'active',
      started_at: membership.started_at ?? now,
      expires_at: expiresAt,
      stripe_subscription_id: asString(obj.subscription) ?? membership.stripe_subscription_id,
      stripe_latest_invoice_id: asString(obj.id) ?? membership.stripe_latest_invoice_id,
      auto_renew: true,
    })
    .where('org_id', '=', orgId)
    .where('id', '=', membershipId)
    .execute();
  await upsertStripePayment(tx, orgId, membershipId, {
    amountCents: asNumber(obj.amount_paid) ?? asNumber(obj.total) ?? membership.price_cents,
    currency: asString(obj.currency) ?? 'usd',
    invoiceId: asString(obj.id),
    stripeChargeId: asString(obj.charge) ?? asString(obj.payment_intent),
  });
  const row = await selectMembership(tx, orgId, membershipId);
  if (row) {
    await emit({
      eventType: wasActive ? 'membership.renewed' : 'membership.created',
      aggregateType: 'membership',
      aggregateId: membershipId,
      payload: { to: row.visitor_email, tierName: row.tier_name, membershipId, expiresAt: row.expires_at?.toISOString() ?? '' },
    });
  }
  return { handled: true, membershipId };
}

async function handleInvoicePaymentFailed(
  tx: Tx,
  orgId: string,
  event: StripeWebhookEvent,
  emit: (input: OutboxEventInput) => Promise<void>,
) {
  const membershipId = await membershipIdFromObject(tx, orgId, event.data?.object ?? {});
  if (!membershipId) return { handled: false, membershipId: null };
  const row = await selectMembership(tx, orgId, membershipId);
  if (!row) return { handled: false, membershipId };
  await tx
    .updateTable('memberships')
    .set({ stripe_latest_invoice_id: asString(event.data?.object?.id) })
    .where('org_id', '=', orgId)
    .where('id', '=', membershipId)
    .execute();
  await emit({
    eventType: 'membership.payment_failed',
    aggregateType: 'membership',
    aggregateId: membershipId,
    payload: { to: row.visitor_email, tierName: row.tier_name, membershipId },
  });
  return { handled: true, membershipId };
}

async function handleSubscriptionUpdated(tx: Tx, orgId: string, event: StripeWebhookEvent) {
  const obj = event.data?.object ?? {};
  const membershipId = await membershipIdFromObject(tx, orgId, obj);
  if (!membershipId) return { handled: false, membershipId: null };
  const status = asString(obj.status);
  const currentPeriodEnd = asNumber(obj.current_period_end);
  const updates: Record<string, unknown> = {
    stripe_subscription_id: asString(obj.id),
    auto_renew: status !== 'canceled' && status !== 'incomplete_expired',
  };
  if (currentPeriodEnd) updates.expires_at = new Date(currentPeriodEnd * 1000);
  if (status === 'active' || status === 'trialing') updates.status = 'active';
  if (status === 'canceled' || status === 'incomplete_expired') {
    updates.status = 'cancelled';
    updates.cancelled_at = new Date();
  }
  await tx.updateTable('memberships').set(updates).where('org_id', '=', orgId).where('id', '=', membershipId).execute();
  return { handled: true, membershipId };
}

async function handleSubscriptionDeleted(
  tx: Tx,
  orgId: string,
  event: StripeWebhookEvent,
  emit: (input: OutboxEventInput) => Promise<void>,
) {
  const membershipId = await membershipIdFromObject(tx, orgId, event.data?.object ?? {});
  if (!membershipId) return { handled: false, membershipId: null };
  await tx
    .updateTable('memberships')
    .set({ status: 'cancelled', cancelled_at: new Date(), cancelled_reason: 'Stripe subscription ended', auto_renew: false })
    .where('org_id', '=', orgId)
    .where('id', '=', membershipId)
    .where('status', 'in', ['pending', 'active', 'expired', 'lapsed'])
    .execute();
  const row = await selectMembership(tx, orgId, membershipId);
  if (row) {
    await emit({
      eventType: 'membership.cancelled',
      aggregateType: 'membership',
      aggregateId: membershipId,
      payload: { to: row.visitor_email, tierName: row.tier_name, membershipId },
    });
  }
  return { handled: true, membershipId };
}

async function membershipWithTier(tx: Tx, orgId: string, membershipId: string) {
  return tx
    .selectFrom('memberships')
    .innerJoin('membership_tiers', 'membership_tiers.id', 'memberships.tier_id')
    .select([
      'memberships.id',
      'memberships.visitor_id',
      'memberships.status',
      'memberships.started_at',
      'memberships.expires_at',
      'memberships.auto_renew',
      'memberships.stripe_subscription_id',
      'memberships.stripe_latest_invoice_id',
      'memberships.metadata',
      'membership_tiers.duration_days',
      'membership_tiers.billing_interval',
      'membership_tiers.price_cents',
    ])
    .where('memberships.org_id', '=', orgId)
    .where('memberships.id', '=', membershipId)
    .executeTakeFirst();
}

async function membershipIdFromObject(tx: Tx, orgId: string, obj: Record<string, unknown>): Promise<string | null> {
  const fromMetadata = stringFromMetadata(obj, 'membershipId');
  if (fromMetadata) return fromMetadata;
  const subscriptionId = asString(obj.subscription) ?? asString(obj.id);
  if (!subscriptionId) return null;
  const row = await tx
    .selectFrom('memberships')
    .select(['id'])
    .where('org_id', '=', orgId)
    .where('stripe_subscription_id', '=', subscriptionId)
    .executeTakeFirst();
  return row?.id ?? null;
}

async function upsertStripePayment(
  tx: Tx,
  orgId: string,
  membershipId: string,
  input: { amountCents: number; currency: string; invoiceId: string | null; stripeChargeId?: string | null },
) {
  if (input.invoiceId) {
    const existing = await tx
      .selectFrom('membership_payments')
      .select(['id'])
      .where('org_id', '=', orgId)
      .where('stripe_invoice_id', '=', input.invoiceId)
      .executeTakeFirst();
    if (existing) return;
  }
  await tx
    .insertInto('membership_payments')
    .values({
      membership_id: membershipId,
      org_id: orgId,
      amount_cents: input.amountCents,
      currency: input.currency.toLowerCase(),
      source: 'stripe',
      stripe_invoice_id: input.invoiceId,
      stripe_charge_id: input.stripeChargeId ?? null,
      paid_at: new Date(),
    })
    .execute();
}

function stringFromMetadata(obj: Record<string, unknown>, key: string): string | null {
  const metadata = obj.metadata;
  if (!metadata || typeof metadata !== 'object') return null;
  return asString((metadata as Record<string, unknown>)[key]);
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
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
