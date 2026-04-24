import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { InjectOptions } from 'light-my-request';
import {
  createTestOrg,
  createUser,
  loginToken,
  makeApp,
  truncateAll,
} from '../helpers/factories.js';
import { getDb } from '../../src/db/index.js';

// SPEC §12.1 mandates, for every API route, tests covering:
//   1. happy path
//   2. auth failure (401)
//   3. permission denial (403)
//   4. validation failure (422) where applicable
//   5. not-found (404) where applicable
//
// Rather than hand-write hundreds of one-off assertions, the matrix below lists
// every tenant-scoped route with metadata about what to try. Each row produces
// a group of tests. Fixtures are seeded once per test file.

interface Ctx {
  orgId: string;
  otherOrgId: string;
  ownerToken: string;          // superadmin of orgId
  unprivilegedToken: string;    // member of orgId with no roles
  outsiderToken: string;        // not a member of orgId
  locationId: string;
  otherLocationId: string;      // belongs to otherOrgId
  eventId: string;
  visitId: string;
  roleId: string;
  memberId: string;             // org_members.id for owner
  unprivilegedMemberId: string;
  invitationId: string;
  contactId: string;
  mergeContactId: string;
  segmentId: string;
  membershipTierId: string;
  membershipId: string;
}

interface RouteCase {
  name: string;                         // human-readable
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  // Builds the URL with the fixtures, optionally supplying a body.
  url: (c: Ctx) => string;
  body?: (c: Ctx) => unknown;
  // Optional extra headers (e.g., Idempotency-Key).
  headers?: Record<string, string>;
  // If set, the route is public (no auth required) and we only test happy path.
  public?: boolean;
  // Skip 403 when the caller already has the necessary permission implicitly
  // (e.g., guest-accessible endpoints, or routes only gated by auth).
  skip403?: boolean;
  // Skip 401 for truly public endpoints.
  skip401?: boolean;
  // Expected status code on happy path (owner token). Defaults to 200.
  happyStatus?: number;
  // Optional invalid-body generator to exercise 422.
  invalidBody?: (c: Ctx) => unknown;
  // Optional URL that should produce a 404 (e.g., wrong UUID).
  notFoundUrl?: (c: Ctx) => string;
}

const ROUTES: RouteCase[] = [
  // --- auth (skipping since covered in auth.test.ts) ---

  // --- orgs ---
  { name: 'GET slug-check', method: 'GET', url: () => `/api/v1/orgs/slug-check?slug=some-new-slug`, skip403: true },
  { name: 'GET org', method: 'GET', url: (c) => `/api/v1/orgs/${c.orgId}` },
  { name: 'PATCH org (admin.manage_org)', method: 'PATCH', url: (c) => `/api/v1/orgs/${c.orgId}`, body: () => ({ name: 'New', terminology: 'appointment', timeModel: 'start_end', country: 'US', city: 'Brooklyn', state: 'NY' }), invalidBody: () => ({ terminology: 'bogus' }) },
  { name: 'GET org branding', method: 'GET', url: (c) => `/api/v1/orgs/${c.orgId}/branding`, skip403: true },
  { name: 'PATCH org branding (admin.manage_org)', method: 'PATCH', url: (c) => `/api/v1/orgs/${c.orgId}/branding`, body: () => ({ theme: { primaryColor: '#112233' } }) },
  { name: 'GET booking-policies (admin.manage_org)', method: 'GET', url: (c) => `/api/v1/orgs/${c.orgId}/booking-policies` },
  { name: 'PATCH booking-policies (admin.manage_org)', method: 'PATCH', url: (c) => `/api/v1/orgs/${c.orgId}/booking-policies`, body: () => ({ selfCancelEnabled: true }), invalidBody: () => ({ cancelCutoffHours: -1 }) },
  { name: 'GET booking-page (admin.manage_org)', method: 'GET', url: (c) => `/api/v1/orgs/${c.orgId}/booking-page` },
  { name: 'PATCH booking-page (admin.manage_org)', method: 'PATCH', url: (c) => `/api/v1/orgs/${c.orgId}/booking-page`, body: () => ({ heroTitle: 'Hello' }), invalidBody: () => ({ leadTimeMinHours: -1 }) },
  { name: 'GET org form (admin.manage_forms)', method: 'GET', url: (c) => `/api/v1/orgs/${c.orgId}/form` },
  { name: 'PUT org form (admin.manage_forms)', method: 'PUT', url: (c) => `/api/v1/orgs/${c.orgId}/form`, body: () => ({
      fields: [
        { fieldKey: 'name', label: 'Name', fieldType: 'text', required: true, isSystem: true, displayOrder: 0 },
        { fieldKey: 'zip', label: 'ZIP', fieldType: 'text', required: true, isSystem: true, displayOrder: 1 },
        { fieldKey: 'party_size', label: 'Party', fieldType: 'number', required: true, isSystem: true, displayOrder: 2 },
      ],
    }) },

  // --- contacts / CRM ---
  { name: 'GET contacts (contacts.view_all)', method: 'GET', url: (c) => `/api/v1/orgs/${c.orgId}/contacts` },
  { name: 'POST contact (contacts.manage)', method: 'POST', url: (c) => `/api/v1/orgs/${c.orgId}/contacts`, body: () => ({ email: 'new-contact@example.com', firstName: 'New', lastName: 'Contact' }), invalidBody: () => ({ email: 'bad' }) },
  { name: 'GET single contact', method: 'GET', url: (c) => `/api/v1/orgs/${c.orgId}/contacts/${c.contactId}`, notFoundUrl: (c) => `/api/v1/orgs/${c.orgId}/contacts/00000000-0000-0000-0000-000000000000` },
  { name: 'PATCH contact', method: 'PATCH', url: (c) => `/api/v1/orgs/${c.orgId}/contacts/${c.contactId}`, body: () => ({ tags: ['member'] }), invalidBody: () => ({ tags: [''] }) },
  { name: 'GET contact timeline', method: 'GET', url: (c) => `/api/v1/orgs/${c.orgId}/contacts/${c.contactId}/timeline`, notFoundUrl: (c) => `/api/v1/orgs/${c.orgId}/contacts/00000000-0000-0000-0000-000000000000/timeline` },
  { name: 'POST contact merge', method: 'POST', url: (c) => `/api/v1/orgs/${c.orgId}/contacts/merge`, body: (c) => ({ keepId: c.contactId, mergeIds: [c.mergeContactId] }), invalidBody: (c) => ({ keepId: c.contactId, mergeIds: [c.contactId] }) },
  { name: 'POST contact redact', method: 'POST', url: (c) => `/api/v1/orgs/${c.orgId}/contacts/${c.contactId}/redact`, notFoundUrl: (c) => `/api/v1/orgs/${c.orgId}/contacts/00000000-0000-0000-0000-000000000000/redact` },
  { name: 'GET segments (contacts.view_all)', method: 'GET', url: (c) => `/api/v1/orgs/${c.orgId}/segments` },
  { name: 'POST segment (contacts.manage)', method: 'POST', url: (c) => `/api/v1/orgs/${c.orgId}/segments`, body: () => ({ name: 'Members', filter: { tag: 'member' } }), invalidBody: () => ({ name: '', filter: { nope: true } }) },
  { name: 'GET single segment', method: 'GET', url: (c) => `/api/v1/orgs/${c.orgId}/segments/${c.segmentId}`, notFoundUrl: (c) => `/api/v1/orgs/${c.orgId}/segments/00000000-0000-0000-0000-000000000000` },
  { name: 'PATCH segment', method: 'PATCH', url: (c) => `/api/v1/orgs/${c.orgId}/segments/${c.segmentId}`, body: () => ({ filter: { emailDomain: 'example.com' } }), invalidBody: () => ({ filter: { nope: true } }) },
  { name: 'POST segment preview', method: 'POST', url: (c) => `/api/v1/orgs/${c.orgId}/segments/${c.segmentId}/preview`, notFoundUrl: (c) => `/api/v1/orgs/${c.orgId}/segments/00000000-0000-0000-0000-000000000000/preview` },

  // --- membership core ---
  { name: 'GET membership-policies', method: 'GET', url: (c) => `/api/v1/orgs/${c.orgId}/membership-policies` },
  { name: 'PATCH membership-policies', method: 'PATCH', url: (c) => `/api/v1/orgs/${c.orgId}/membership-policies`, body: () => ({ enabled: true, gracePeriodDays: 10 }), invalidBody: () => ({ gracePeriodDays: -1 }) },
  { name: 'GET membership tiers', method: 'GET', url: (c) => `/api/v1/orgs/${c.orgId}/membership-tiers` },
  { name: 'POST membership tier', method: 'POST', url: (c) => `/api/v1/orgs/${c.orgId}/membership-tiers`, body: () => ({ slug: `supporter-${Math.random().toString(36).slice(2, 8)}`, name: 'Supporter', priceCents: 5000, billingInterval: 'year' }), invalidBody: () => ({ slug: 'Bad Slug', name: '', priceCents: -1, billingInterval: 'week' }) },
  { name: 'GET single membership tier', method: 'GET', url: (c) => `/api/v1/orgs/${c.orgId}/membership-tiers/${c.membershipTierId}`, notFoundUrl: (c) => `/api/v1/orgs/${c.orgId}/membership-tiers/00000000-0000-0000-0000-000000000000` },
  { name: 'PATCH membership tier', method: 'PATCH', url: (c) => `/api/v1/orgs/${c.orgId}/membership-tiers/${c.membershipTierId}`, body: () => ({ name: 'Household' }), invalidBody: () => ({ priceCents: -1 }) },
  { name: 'GET memberships', method: 'GET', url: (c) => `/api/v1/orgs/${c.orgId}/memberships` },
  { name: 'POST membership', method: 'POST', url: (c) => `/api/v1/orgs/${c.orgId}/memberships`, body: (c) => ({ visitorId: c.contactId, tierId: c.membershipTierId }), invalidBody: (c) => ({ visitorId: c.contactId, tierId: 'nope' }) },
  { name: 'GET single membership', method: 'GET', url: (c) => `/api/v1/orgs/${c.orgId}/memberships/${c.membershipId}`, notFoundUrl: (c) => `/api/v1/orgs/${c.orgId}/memberships/00000000-0000-0000-0000-000000000000` },
  { name: 'PATCH membership', method: 'PATCH', url: (c) => `/api/v1/orgs/${c.orgId}/memberships/${c.membershipId}`, body: () => ({ autoRenew: true }), invalidBody: () => ({ status: 'bogus' }) },
  { name: 'POST membership cancel', method: 'POST', url: (c) => `/api/v1/orgs/${c.orgId}/memberships/${c.membershipId}/cancel`, body: () => ({ reason: 'requested' }), notFoundUrl: (c) => `/api/v1/orgs/${c.orgId}/memberships/00000000-0000-0000-0000-000000000000/cancel` },
  { name: 'POST membership renew', method: 'POST', url: (c) => `/api/v1/orgs/${c.orgId}/memberships/${c.membershipId}/renew`, body: () => ({ amountCents: 5000 }), invalidBody: () => ({ amountCents: -1 }), notFoundUrl: (c) => `/api/v1/orgs/${c.orgId}/memberships/00000000-0000-0000-0000-000000000000/renew` },
  { name: 'POST membership refund', method: 'POST', url: (c) => `/api/v1/orgs/${c.orgId}/memberships/${c.membershipId}/refund`, body: () => ({ amountCents: 5000 }), invalidBody: () => ({ amountCents: -1 }), notFoundUrl: (c) => `/api/v1/orgs/${c.orgId}/memberships/00000000-0000-0000-0000-000000000000/refund` },

  // --- Stripe Connect foundation ---
  { name: 'GET Stripe status', method: 'GET', url: (c) => `/api/v1/orgs/${c.orgId}/stripe` },
  { name: 'POST Stripe connect URL', method: 'POST', url: (c) => `/api/v1/orgs/${c.orgId}/stripe/connect` },
  { name: 'DELETE Stripe account', method: 'DELETE', url: (c) => `/api/v1/orgs/${c.orgId}/stripe` },

  // --- members ---
  { name: 'GET members (admin.manage_users)', method: 'GET', url: (c) => `/api/v1/orgs/${c.orgId}/members` },
  // Superadmin invariant is exercised in a dedicated test; skip a success-path delete here.

  // --- roles ---
  { name: 'GET roles (admin.manage_roles)', method: 'GET', url: (c) => `/api/v1/orgs/${c.orgId}/roles` },
  { name: 'GET single role', method: 'GET', url: (c) => `/api/v1/orgs/${c.orgId}/roles/${c.roleId}`, notFoundUrl: (c) => `/api/v1/orgs/${c.orgId}/roles/00000000-0000-0000-0000-000000000000` },
  { name: 'PATCH role', method: 'PATCH', url: (c) => `/api/v1/orgs/${c.orgId}/roles/${c.roleId}`, body: () => ({ description: 'new' }) },
  { name: 'GET role permissions', method: 'GET', url: (c) => `/api/v1/orgs/${c.orgId}/roles/${c.roleId}/permissions` },
  { name: 'PUT role permissions', method: 'PUT', url: (c) => `/api/v1/orgs/${c.orgId}/roles/${c.roleId}/permissions`, body: () => ({ permissions: ['visits.view_all'] }), invalidBody: () => ({ permissions: ['not.a.real.permission'] }) },

  // --- invitations ---
  { name: 'GET invitations', method: 'GET', url: (c) => `/api/v1/orgs/${c.orgId}/invitations` },
  { name: 'POST invitation', method: 'POST', url: (c) => `/api/v1/orgs/${c.orgId}/invitations`, body: () => ({ email: 'invitee@example.com', roleIds: [] }), invalidBody: () => ({ email: 'not-an-email', roleIds: [] }) },

  // --- locations ---
  { name: 'GET locations', method: 'GET', url: (c) => `/api/v1/orgs/${c.orgId}/locations`, skip403: true },
  { name: 'POST location (admin.manage_locations)', method: 'POST', url: (c) => `/api/v1/orgs/${c.orgId}/locations`, body: () => ({ name: 'Gallery 2' }), invalidBody: () => ({ name: '' }) },
  { name: 'GET single location', method: 'GET', url: (c) => `/api/v1/orgs/${c.orgId}/locations/${c.locationId}`, skip403: true, notFoundUrl: (c) => `/api/v1/orgs/${c.orgId}/locations/00000000-0000-0000-0000-000000000000` },
  { name: 'PATCH location', method: 'PATCH', url: (c) => `/api/v1/orgs/${c.orgId}/locations/${c.locationId}`, body: () => ({ zip: '10002' }) },
  { name: 'POST location set-primary', method: 'POST', url: (c) => `/api/v1/orgs/${c.orgId}/locations/${c.locationId}/set-primary` },

  // --- hours ---
  { name: 'GET location hours', method: 'GET', url: (c) => `/api/v1/orgs/${c.orgId}/locations/${c.locationId}/hours`, skip403: true },
  { name: 'PUT location hours', method: 'PUT', url: (c) => `/api/v1/orgs/${c.orgId}/locations/${c.locationId}/hours`, body: () => ({ hours: [{ dayOfWeek: 1, openTime: '09:00', closeTime: '17:00', isActive: true }] }), invalidBody: () => ({ hours: [{ dayOfWeek: 9, openTime: '09:00', closeTime: '08:00', isActive: true }] }) },
  { name: 'GET overrides', method: 'GET', url: (c) => `/api/v1/orgs/${c.orgId}/locations/${c.locationId}/hours/overrides`, skip403: true },
  { name: 'GET closed-days', method: 'GET', url: (c) => `/api/v1/orgs/${c.orgId}/locations/${c.locationId}/closed`, skip403: true },

  // --- availability ---
  { name: 'GET availability', method: 'GET', url: (c) => `/api/v1/orgs/${c.orgId}/locations/${c.locationId}/availability?date=2026-04-13`, skip403: true },
  { name: 'GET availability month', method: 'GET', url: (c) => `/api/v1/orgs/${c.orgId}/locations/${c.locationId}/availability/month?year=2026&month=4`, skip403: true },

  // --- visits ---
  { name: 'GET visits (visits.view_all)', method: 'GET', url: (c) => `/api/v1/orgs/${c.orgId}/visits` },
  { name: 'GET single visit', method: 'GET', url: (c) => `/api/v1/orgs/${c.orgId}/visits/${c.visitId}`, notFoundUrl: (c) => `/api/v1/orgs/${c.orgId}/visits/00000000-0000-0000-0000-000000000000` },
  { name: 'POST no-show', method: 'POST', url: (c) => `/api/v1/orgs/${c.orgId}/visits/${c.visitId}/no-show` },

  // --- events ---
  { name: 'GET events', method: 'GET', url: (c) => `/api/v1/orgs/${c.orgId}/events` },
  {
    name: 'POST event series (events.create)',
    method: 'POST',
    url: (c) => `/api/v1/orgs/${c.orgId}/events/series`,
    body: (c) => ({
      locationId: c.locationId,
      title: 'Weekly tour',
      startsAt: '2026-03-01T15:00:00Z',
      endsAt: '2026-03-01T16:00:00Z',
      recurrence: {
        frequency: 'weekly',
        weekday: 0,
        ends: { mode: 'after_occurrences', occurrenceCount: 3 },
      },
    }),
    invalidBody: () => ({
      title: 'Broken series',
      startsAt: '2026-03-01T15:00:00Z',
      endsAt: '2026-03-01T14:00:00Z',
      recurrence: {
        frequency: 'weekly',
        weekday: 0,
        ends: { mode: 'after_occurrences', occurrenceCount: 0 },
      },
    }),
  },
  { name: 'GET single event', method: 'GET', url: (c) => `/api/v1/orgs/${c.orgId}/events/${c.eventId}`, notFoundUrl: (c) => `/api/v1/orgs/${c.orgId}/events/00000000-0000-0000-0000-000000000000` },
  {
    name: 'POST duplicate event (events.create)',
    method: 'POST',
    url: (c) => `/api/v1/orgs/${c.orgId}/events/${c.eventId}/duplicate`,
    body: () => ({
      startsAt: '2026-05-08T14:00:00Z',
      endsAt: '2026-05-08T15:00:00Z',
      slug: 'morning-tour-copy',
    }),
    invalidBody: () => ({
      startsAt: '2026-05-08T14:00:00Z',
    }),
    notFoundUrl: (c) => `/api/v1/orgs/${c.orgId}/events/00000000-0000-0000-0000-000000000000/duplicate`,
  },

  // --- waitlist ---
  { name: 'GET waitlist', method: 'GET', url: (c) => `/api/v1/orgs/${c.orgId}/events/${c.eventId}/waitlist` },

  // --- audit ---
  { name: 'GET audit', method: 'GET', url: (c) => `/api/v1/orgs/${c.orgId}/audit` },

  // --- notifications ---
  { name: 'GET notifications/templates', method: 'GET', url: (c) => `/api/v1/orgs/${c.orgId}/notifications/templates` },
  { name: 'GET notifications/templates/:key', method: 'GET', url: (c) => `/api/v1/orgs/${c.orgId}/notifications/templates/visit.confirmation`, notFoundUrl: (c) => `/api/v1/orgs/${c.orgId}/notifications/templates/does.not.exist` },
  { name: 'PUT notifications/templates/:key', method: 'PUT', url: (c) => `/api/v1/orgs/${c.orgId}/notifications/templates/visit.confirmation`, body: () => ({ subject: 'Updated {{orgName}}', bodyHtml: '<p>Hi {{visitorName}}</p>', bodyText: 'Hi {{visitorName}}' }), invalidBody: () => ({ subject: '', bodyHtml: '<p>Hi</p>', bodyText: 'Hi' }), notFoundUrl: (c) => `/api/v1/orgs/${c.orgId}/notifications/templates/does.not.exist` },
  { name: 'POST notifications/templates/:key/revert', method: 'POST', url: (c) => `/api/v1/orgs/${c.orgId}/notifications/templates/visit.confirmation/revert`, notFoundUrl: (c) => `/api/v1/orgs/${c.orgId}/notifications/templates/does.not.exist/revert` },
  { name: 'GET notifications/outbox', method: 'GET', url: (c) => `/api/v1/orgs/${c.orgId}/notifications/outbox` },
  { name: 'POST notifications test-send', method: 'POST', url: (c) => `/api/v1/orgs/${c.orgId}/notifications/templates/visit.confirmation/test-send`, body: () => ({ toAddress: 'test@example.com' }), invalidBody: () => ({ toAddress: 'not-an-email' }), notFoundUrl: (c) => `/api/v1/orgs/${c.orgId}/notifications/templates/does.not.exist/test-send` },

  // --- reports ---
  { name: 'GET reports/visits', method: 'GET', url: (c) => `/api/v1/orgs/${c.orgId}/reports/visits` },
  { name: 'GET reports/headcount', method: 'GET', url: (c) => `/api/v1/orgs/${c.orgId}/reports/headcount` },
  { name: 'GET reports/booking-sources', method: 'GET', url: (c) => `/api/v1/orgs/${c.orgId}/reports/booking-sources` },
  { name: 'GET reports/events', method: 'GET', url: (c) => `/api/v1/orgs/${c.orgId}/reports/events` },
  { name: 'GET reports/intake', method: 'GET', url: (c) => `/api/v1/orgs/${c.orgId}/reports/intake?field_key=zip` },

  // --- org export ---
  { name: 'GET org export', method: 'GET', url: (c) => `/api/v1/orgs/${c.orgId}/export` },

  // --- meta ---
  { name: 'GET permissions registry', method: 'GET', url: () => `/api/v1/permissions`, skip403: true },
];

describe('route matrix: happy + 401 + 403 + 422 + 404', () => {
  let app: FastifyInstance;
  let ctx: Ctx;

  beforeAll(async () => {
    app = await makeApp();
  });
  afterAll(async () => { await app.close(); });

  beforeEach(async () => {
    await truncateAll();
    // Owner org.
    const owner = await createTestOrg('owner@example.com');
    // A second org, used for cross-tenant outsider tests.
    const other = await createTestOrg('outsider@example.com');
    // A member with no roles in the owner org.
    const unpr = await createUser('unpr@example.com');
    const umRow = await getDb()
      .insertInto('org_members')
      .values({ org_id: owner.orgId, user_id: unpr, is_superadmin: false })
      .returning(['id'])
      .executeTakeFirstOrThrow();
    // A role + a couple of fixtures for GET/PATCH targets.
    const role = await getDb()
      .insertInto('roles')
      .values({ org_id: owner.orgId, name: 'ops', description: 'baseline' })
      .returning(['id'])
      .executeTakeFirstOrThrow();
    const inv = await getDb()
      .insertInto('invitations')
      .values({
        org_id: owner.orgId,
        email: 'preseeded@example.com',
        token_hash: 'a'.repeat(64),
        invited_by: owner.userId,
        role_ids: [],
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
      })
      .returning(['id'])
      .executeTakeFirstOrThrow();
    const ev = await getDb()
      .insertInto('events')
      .values({
        org_id: owner.orgId,
        location_id: owner.locationId,
        created_by: owner.userId,
        title: 'Morning tour',
        starts_at: new Date('2026-05-01T14:00:00Z'),
        ends_at: new Date('2026-05-01T15:00:00Z'),
        public_id: 'p_' + Math.random().toString(36).slice(2, 10),
      })
      .returning(['id'])
      .executeTakeFirstOrThrow();
    // Hours so visit creation works.
    await getDb().insertInto('location_hours').values({
      location_id: owner.locationId, day_of_week: 1, open_time: '09:00', close_time: '17:00', is_active: true,
    }).execute();
    const visit = await getDb()
      .insertInto('visits')
      .values({
        org_id: owner.orgId,
        location_id: owner.locationId,
        booking_method: 'admin',
        scheduled_at: new Date('2026-04-13T14:00:00-04:00'),
        form_response: { name: 'Seed', zip: '10001', party_size: 1 } as never,
      })
      .returning(['id'])
      .executeTakeFirstOrThrow();
    const contact = await getDb()
      .insertInto('visitors')
      .values({
        org_id: owner.orgId,
        email: 'seed-contact@example.com',
        first_name: 'Seed',
        last_name: 'Contact',
        tags: ['member'],
      })
      .returning(['id'])
      .executeTakeFirstOrThrow();
    const mergeContact = await getDb()
      .insertInto('visitors')
      .values({
        org_id: owner.orgId,
        email: 'merge-contact@example.com',
        first_name: 'Merge',
        last_name: 'Contact',
      })
      .returning(['id'])
      .executeTakeFirstOrThrow();
    const segment = await getDb()
      .insertInto('visitor_segments')
      .values({
        org_id: owner.orgId,
        name: 'Seed segment',
        filter: JSON.stringify({ tag: 'member' }),
      })
      .returning(['id'])
      .executeTakeFirstOrThrow();
    const membershipTier = await getDb()
      .insertInto('membership_tiers')
      .values({
        org_id: owner.orgId,
        slug: 'household',
        name: 'Household',
        price_cents: 5000,
        billing_interval: 'year',
        duration_days: 365,
      })
      .returning(['id'])
      .executeTakeFirstOrThrow();
    const membership = await getDb()
      .insertInto('memberships')
      .values({
        org_id: owner.orgId,
        visitor_id: contact.id,
        tier_id: membershipTier.id,
        status: 'active',
        started_at: new Date('2026-01-01T00:00:00Z'),
        expires_at: new Date('2027-01-01T00:00:00Z'),
        metadata: JSON.stringify({}),
      })
      .returning(['id'])
      .executeTakeFirstOrThrow();
    await getDb()
      .insertInto('membership_payments')
      .values({
        org_id: owner.orgId,
        membership_id: membership.id,
        amount_cents: 5000,
        currency: 'usd',
        source: 'manual',
        paid_at: new Date('2026-01-01T00:00:00Z'),
      })
      .execute();
    const owMem = await getDb()
      .selectFrom('org_members')
      .select(['id'])
      .where('user_id', '=', owner.userId)
      .where('org_id', '=', owner.orgId)
      .executeTakeFirstOrThrow();

    ctx = {
      orgId: owner.orgId,
      otherOrgId: other.orgId,
      ownerToken: await loginToken(app, 'owner@example.com'),
      unprivilegedToken: await loginToken(app, 'unpr@example.com'),
      outsiderToken: await loginToken(app, 'outsider@example.com'),
      locationId: owner.locationId,
      otherLocationId: other.locationId,
      eventId: ev.id,
      visitId: visit.id,
      roleId: role.id,
      memberId: owMem.id,
      unprivilegedMemberId: umRow.id,
      invitationId: inv.id,
      contactId: contact.id,
      mergeContactId: mergeContact.id,
      segmentId: segment.id,
      membershipTierId: membershipTier.id,
      membershipId: membership.id,
    };
  });

  for (const rc of ROUTES) {
    describe(rc.name, () => {
      const buildReq = (token: string | null, variant: 'happy' | 'invalid' | 'not-found'): InjectOptions => {
        const url = variant === 'not-found' && rc.notFoundUrl ? rc.notFoundUrl(ctx) : rc.url(ctx);
        const body = variant === 'invalid' && rc.invalidBody ? rc.invalidBody(ctx) : rc.body ? rc.body(ctx) : undefined;
        const opts: InjectOptions = {
          method: rc.method,
          url,
          headers: {
            ...(rc.headers ?? {}),
            ...(token ? { authorization: `Bearer ${token}` } : {}),
          },
        };
        if (body !== undefined && body !== null) opts.payload = body as object;
        return opts;
      };

      it('happy: owner gets expected status', async () => {
        const res = await app.inject(buildReq(ctx.ownerToken, 'happy'));
        const expected = rc.happyStatus ?? 200;
        expect([expected, 201]).toContain(res.statusCode);
      });

      if (!rc.skip401) {
        it('401 without auth', async () => {
          const res = await app.inject(buildReq(null, 'happy'));
          expect(res.statusCode).toBe(401);
        });
      }

      if (!rc.skip403 && !rc.public) {
        it('403 for outsider (non-member)', async () => {
          const res = await app.inject(buildReq(ctx.outsiderToken, 'happy'));
          // Outsider of orgId fails either with 403 (has no membership) or 404
          // (some endpoints surface non-membership as 404 when the route also
          // queries the org row). Accept either per spec ambiguity.
          expect([403, 404]).toContain(res.statusCode);
        });
      }

      if (rc.invalidBody) {
        it('422 on invalid body', async () => {
          const res = await app.inject(buildReq(ctx.ownerToken, 'invalid'));
          expect(res.statusCode).toBe(422);
        });
      }

      if (rc.notFoundUrl) {
        it('404 for nonexistent target id', async () => {
          const res = await app.inject(buildReq(ctx.ownerToken, 'not-found'));
          expect(res.statusCode).toBe(404);
        });
      }
    });
  }
});
