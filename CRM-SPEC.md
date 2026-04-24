# Plan — CRM + Membership System

## Context

butterbook currently has no visitor identity layer: PII lives inside `visits.form_response` / `waitlist_entries.form_response` JSONB, a repeat visitor shows up as two unrelated rows, and there is no notion of a paying member. The competitive set (Altru, Tessitura, Cuseum, Doubleknot, Wild Apricot) all treat a unified CRM + membership stack as table stakes — it is the single biggest gap versus "we are a better small-museum scheduler."

This plan introduces:
1. A **contacts/visitors layer** that deduplicates people across bookings and gives admins a profile view.
2. A **membership tier system** with status, expiry, renewals, and reminders wired into the existing notification outbox.
3. **Stripe Connect** so each org collects money into their own Stripe account for paid memberships and (later) paid ticketing.
4. **Segments + broadcasts** so the CRM is usable for outreach, not just reporting.
5. **Member-only events, promo codes, guest passes** as differentiators vs. "Excel + Eventbrite."

Work is phased so each phase ships independently and is valuable on its own. User selected: Stripe in this plan, backfill existing visits, phased rollout.

Non-goals (deferred, spec'd separately): Apple/Google Wallet pass files, per-member mobile app, SMS marketing, donation processing beyond membership fees, abandoned-cart recovery.

---

## Implementation Status

Updated 2026-04-24.

### Done in this pass — Phase 1 backend foundation
- Added migration `013_contacts_crm.sql` for `visitors`, `visitor_segments`, `visits.visitor_id`, and `waitlist_entries.visitor_id`, including RLS policies, indexes, triggers, and SQL backfill from existing visit/waitlist form responses.
- Added `apps/api/src/scripts/backfill-visitors.ts` for repeatable visitor-link backfills after the migration.
- Added shared Zod schemas for contacts, contact merge/redaction, segment CRUD, and segment preview filters.
- Added CRM permissions to the shared registry: contacts, memberships, promo codes, broadcasts, and Stripe permissions. Only contacts permissions are exercised by routes so far.
- Added contact extraction/upsert during visit creation, so admin, public booking, kiosk, intake, and event booking paths now attach `visitor_id` when an email is present.
- Preserved `visitor_id` when waitlist entries are promoted manually or automatically.
- Added admin API routes for:
  - `GET/POST /api/v1/orgs/:orgId/contacts`
  - `GET/PATCH/DELETE /api/v1/orgs/:orgId/contacts/:id`
  - `GET /api/v1/orgs/:orgId/contacts/:id/timeline`
  - `POST /api/v1/orgs/:orgId/contacts/merge`
  - `POST /api/v1/orgs/:orgId/contacts/:id/redact`
  - `GET/POST /api/v1/orgs/:orgId/segments`
  - `GET/PATCH/DELETE /api/v1/orgs/:orgId/segments/:id`
  - `POST /api/v1/orgs/:orgId/segments/:id/preview`
- Added `visitors` and `visitor_segments` to the org JSON export.
- Added the new tenant tables to the local ESLint guardrail table list.
- Added route-matrix coverage for the new contacts and segment routes.

### Done in this pass — Phase 1 admin UI
- Added `/app/contacts` with search, tag filtering, pagination, manual contact creation, and links into contact profiles.
- Added `/app/contacts/profile?id=...` with editable identity fields, tags, notes, timeline, merge-by-contact-ID, soft delete, and superadmin redaction action wired to the Phase 1 API. This uses a query param instead of `/app/contacts/[id]` because the web app is statically exported and contact IDs are runtime data.
- Added `/app/contacts/segments` with segment listing, create/edit/delete for the currently supported simple filter types, and preview of matching contacts.
- Added sidebar, command palette, and hover prefetch entries for contacts and segments.

### Verified in this pass
- `corepack pnpm --filter @butterbook/shared typecheck`
- `corepack pnpm --filter @butterbook/shared build`
- `corepack pnpm --filter api typecheck`
- `corepack pnpm --filter api lint` (currently a placeholder script)
- `corepack pnpm --filter api test -- contacts.test.ts` — 1 passing
- `corepack pnpm --filter api test -- route-matrix.test.ts` — 212 passing

### Done in this pass — Phase 2 backend membership core
- Added migration `014_membership_core.sql` for `org_membership_policies`, `membership_tiers`, `memberships`, `membership_payments`, `guest_passes`, and `events.membership_required_tier_id`, including RLS policies, indexes, triggers, existing-org policy backfill, and membership notification template backfill.
- Added shared Zod schemas for membership policies, tier CRUD, membership list/create/update/cancel/renew/refund, and related params/query validation.
- Added Kysely table types for all Phase 2 membership tables and the event member-only tier field.
- Added `apps/api/src/services/memberships.ts` with tier/member serializers, manual enrollment, cancel, renew, active-tier eligibility checks, and status sweep logic.
- Added `apps/api/src/routes/memberships.ts` for:
  - `GET/PATCH /api/v1/orgs/:orgId/membership-policies`
  - `GET/POST /api/v1/orgs/:orgId/membership-tiers`
  - `GET/PATCH/DELETE /api/v1/orgs/:orgId/membership-tiers/:tierId`
  - `GET/POST /api/v1/orgs/:orgId/memberships`
  - `GET/PATCH /api/v1/orgs/:orgId/memberships/:membershipId`
  - `POST /api/v1/orgs/:orgId/memberships/:membershipId/cancel`
  - `POST /api/v1/orgs/:orgId/memberships/:membershipId/renew`
  - `POST /api/v1/orgs/:orgId/memberships/:membershipId/refund`
- Wired membership defaults into org creation and org JSON export.
- Updated saved-segment `hasMembership` matching to use active, unexpired memberships instead of the Phase 1 placeholder.
- Added membership notification templates and subscribers for welcome/renewed, cancelled, expired, lapsed, and payment-failed events.
- Added `apps/api/src/scripts/membership-sweep.ts` and `pnpm --filter api membership:sweep` for active→expired and expired→lapsed status transitions with an audit row.
- Added member-only event gate support to admin event create/update/series/duplicate payloads and public event registration. Public registration now requires an active membership at the required tier sort order or higher.
- Added the membership tables to the ESLint tenant-table guardrail list.
- Added route-matrix fixtures and coverage for Phase 2 membership policy, tier, membership, cancel, renew, and refund routes. Local route matrix now has 263 tests.

### Verified in this pass — Phase 2 backend membership core
- `corepack pnpm --filter @butterbook/shared typecheck`
- `corepack pnpm --filter @butterbook/shared build`
- `corepack pnpm --filter api typecheck`
- `DATABASE_URL=postgres://postgres:postgres@localhost:5432/butterbook_test corepack pnpm --filter api migrate up`
- `corepack pnpm --filter api test -- route-matrix.test.ts` — 263 passing

### Done in this pass — Phase 2 admin UI
- Added `/app/memberships` with status/tier filtering, pagination, manual enrollment against existing contacts and tiers, and links into membership detail.
- Added `/app/memberships/profile?id=...` for static-export-compatible membership detail, with status/expiry/auto-renew editing, renewal recording, admin cancellation, refund marking for users with `memberships.refund`, and a link back to the contact profile.
- Added `/app/memberships/tiers` with tier list, create/edit, active toggle, member-event access toggle, pricing interval/duration fields, guest-pass/cap/sort fields, and archive action.
- Added `/app/memberships/policies` mirroring the booking-policy settings pattern for enablement, grace period, renewal reminder days, public page visibility, and self-serve flags.
- Added sidebar, hover prefetch, and command-palette entries for memberships, tiers, and membership policies.
- Added the member-only tier picker to event creation/duplication/series composer and a members-only badge in the events list.
- Fixed an existing audit-log hook-order violation so static export builds can complete.

### Verified in this pass — Phase 2 admin UI
- `corepack pnpm --filter web typecheck`
- `corepack pnpm --filter web build` — passes; existing warnings remain in notifications/timeline/toast and the existing Next config still warns that `experimental.typedRoutes` moved to `typedRoutes`.

### Done in this pass — Phase 3 backend foundation
- Added migration `015_stripe_connect.sql` for `org_stripe_accounts` and `stripe_events`, including RLS policies, indexes, a Stripe account updated-at trigger, and webhook-event idempotency storage.
- Added Stripe Connect config validation placeholders: `STRIPE_SECRET_KEY`, `STRIPE_CONNECT_CLIENT_ID`, and `STRIPE_WEBHOOK_SIGNING_SECRET`; `.env.example` now documents them as optional until Phase 3 checkout is enabled.
- Added shared Stripe schemas for org params and Connect callback query validation.
- Added `apps/api/src/services/stripe.ts` with signed 10-minute OAuth state, Connect authorization URL generation, and OAuth code exchange through Stripe's token endpoint.
- Added admin API routes for:
  - `GET /api/v1/orgs/:orgId/stripe`
  - `POST /api/v1/orgs/:orgId/stripe/connect`
  - `DELETE /api/v1/orgs/:orgId/stripe`
  - `GET /api/v1/stripe/connect/callback`
- Added Stripe account data to org JSON export, intentionally excluding encrypted `webhook_secret` from exported account rows.
- Added `org_stripe_accounts` and `stripe_events` to the local ESLint tenant-table guardrail list and local test cleanup.
- Added route-matrix coverage for Stripe status, Connect URL, and disconnect routes.
- Added unit coverage for Stripe Connect OAuth state signing, tamper rejection, and expiry rejection.

### Verified in this pass — Phase 3 backend foundation
- `corepack pnpm --filter @butterbook/shared typecheck`
- `corepack pnpm --filter @butterbook/shared build`
- `corepack pnpm --filter api typecheck`
- `DATABASE_URL=postgres://postgres:postgres@localhost:5432/butterbook_test corepack pnpm --filter api migrate up`
- `corepack pnpm --filter api test -- stripe-connect.test.ts` — 3 passing
- `corepack pnpm --filter api test -- route-matrix.test.ts` — 272 passing

### Done in this pass — Phase 3 public checkout API
- Added shared public membership checkout schemas for public org slug params and checkout payload validation.
- Added `createStripeCheckoutSession` to `apps/api/src/services/stripe.ts`, using Stripe Checkout Sessions against the connected account via the `Stripe-Account` header. It supports recurring `month`/`year` tiers as subscription checkout and `one_time`/`lifetime` tiers as payment checkout.
- Added `apps/api/src/routes/public-memberships.ts` with:
  - `GET /api/v1/public/orgs/:orgSlug/membership-tiers` — returns public org identity and active tiers only when membership policy is enabled and public page visibility is on.
  - `POST /api/v1/public/orgs/:orgSlug/memberships/checkout` — validates the tier, requires a connected Stripe account with charges enabled, upserts the visitor by email, creates a pending membership row, creates a Stripe Checkout Session, stores the Checkout Session ID in membership metadata, and writes a `membership.checkout_started` audit row.
- Wired public membership routes into the Fastify app.
- Added `public-memberships.test.ts` covering public tier listing and checkout session creation without calling Stripe over the network.
- Added route-matrix coverage for the public membership tier listing route. Local route matrix now has 273 tests.

### Verified in this pass — Phase 3 public checkout API
- `corepack pnpm --filter @butterbook/shared typecheck`
- `corepack pnpm --filter @butterbook/shared build`
- `corepack pnpm --filter api typecheck`
- `corepack pnpm --filter api test -- public-memberships.test.ts` — 2 passing
- `corepack pnpm --filter api test -- route-matrix.test.ts` — 273 passing

### Still not done
- Event registration has no separate `event_registrations` table in this codebase, so no column was added there.
- Segment DSL currently supports `and`, `or`, `tag`, `emailDomain`, `visitedAfter`, `visitedBefore`, and `hasMembership`. `hasMembership` now checks active, unexpired memberships.
- The Phase 1 segments UI can create/edit the simple single-filter cases only; compound `and`/`or` filters remain API-only until a richer builder is needed.
- The original `/app/contacts/[id]` route shape is not used in the web build; Cloudflare Pages static export cannot pre-render arbitrary runtime contact IDs, so the profile page is `/app/contacts/profile?id=...`.
- Phase 2 reminder queuing is not complete: the sweep updates expired/lapsed statuses, but it does not yet enqueue T-30/T-7 reminder emails.
- Guest pass issuance/redemption is schema-only in this pass; kiosk acceptance of `guest_pass_code` / `member_email` is still not built.
- Phase 3 is still partially implemented: Stripe account storage, Connect URL/callback, status, disconnect, public tier listing, and Checkout Session creation are built. Webhook event handlers, Stripe refund execution, Stripe settings UI, `/join/[orgSlug]`, and manage-token membership self-serve remain unimplemented. Public checkout creates pending memberships only; activation still depends on the future webhook handler.
- Phase 4 (promo codes, broadcasts, and full guest-pass workflows) remains unimplemented.

---

## Data Model

All new tables follow the butterbook kernel pattern: `org_id` FK, RLS with permissive-on-NULL context var, soft-delete where sensible, audit trail via `withOrgContext`.

### Phase 1 — Contacts CRM

**`visitors`** — canonical person per org.
```
id                UUID PK
org_id            UUID FK orgs(id) ON DELETE CASCADE
email             CITEXT NOT NULL            -- dedup key
first_name        TEXT
last_name         TEXT
phone             TEXT
address           JSONB                       -- {line1, city, region, postal, country}
tags              TEXT[] NOT NULL DEFAULT '{}'
notes             TEXT
stripe_customer_id TEXT                       -- populated in Phase 3
pii_redacted      BOOLEAN NOT NULL DEFAULT false
deleted_at        TIMESTAMPTZ
created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
UNIQUE(org_id, email) WHERE deleted_at IS NULL
```

**`visits.visitor_id`** — new nullable FK `REFERENCES visitors(id) ON DELETE SET NULL`. Same column added to `waitlist_entries` and `event_registrations`. Nullable to preserve anonymous kiosk check-ins.

**Backfill migration**: for each org, scan `visits.form_response` + `waitlist_entries.form_response`, extract `email`/`name`, upsert into `visitors` (lowercased email as dedup key, split name on last space for first/last), set `visitor_id` on source rows. Script lives at `apps/api/scripts/backfill-visitors.ts`; migration invokes it via `CALL`. `form_response` is **not** modified — reversible.

**`visitor_segments`** — saved filters.
```
id, org_id, name, filter TEXT NOT NULL,   -- JSON DSL: {and: [{tag: "lapsed"}, {visitedAfter: "2025-01-01"}]}
visitor_count INT, last_computed_at, created_at, updated_at
```

### Phase 2 — Memberships

**`org_membership_policies`** — one row per org (mirrors `org_booking_policies`).
```
org_id PK FK orgs(id)
enabled BOOLEAN DEFAULT false
grace_period_days INT DEFAULT 14              -- active → lapsed after expiry
renewal_reminder_days INT[] DEFAULT '{30,7}'  -- when to queue reminders
self_cancel_enabled BOOLEAN DEFAULT true
self_update_enabled BOOLEAN DEFAULT true
public_page_enabled BOOLEAN DEFAULT true      -- /join/:orgSlug visibility
updated_at
```

**`membership_tiers`**
```
id, org_id, slug UNIQUE(org_id,slug), name, description,
price_cents INT NOT NULL,
billing_interval TEXT NOT NULL,     -- 'year' | 'month' | 'lifetime' | 'one_time'
duration_days INT,                   -- NULL for stripe-subscription-driven
guest_passes_included INT DEFAULT 0,
member_only_event_access BOOLEAN DEFAULT true,
stripe_price_id TEXT,                -- populated on create in Phase 3
max_active INT,                      -- optional cap (e.g. "50 Patron slots")
sort_order INT,
active BOOLEAN DEFAULT true,
deleted_at, created_at, updated_at
```

**`memberships`** — one per (visitor, tier, period).
```
id, org_id, visitor_id FK, tier_id FK,
status TEXT NOT NULL,                -- 'pending' | 'active' | 'expired' | 'lapsed' | 'cancelled' | 'refunded'
started_at TIMESTAMPTZ,
expires_at TIMESTAMPTZ,              -- NULL for lifetime / active stripe sub
auto_renew BOOLEAN DEFAULT false,
stripe_subscription_id TEXT,
stripe_latest_invoice_id TEXT,
cancelled_at, cancelled_reason,
metadata JSONB NOT NULL DEFAULT '{}',
created_at, updated_at
INDEX(org_id, visitor_id, status)
INDEX(org_id, expires_at) WHERE status = 'active'    -- drives reminder sweep
```

**`membership_payments`** — ledger row per charge (manual or Stripe).
```
id, membership_id FK, org_id,
amount_cents, currency CHAR(3),
source TEXT,                         -- 'manual' | 'stripe'
stripe_charge_id, stripe_invoice_id,
paid_at, refunded_at, refunded_amount_cents,
notes, created_at
```

**`guest_passes`**
```
id, membership_id FK, org_id,
code TEXT UNIQUE,                    -- short human code, e.g. "MH-F1-A2B7"
qr_token UUID UNIQUE,                -- scanned at kiosk
issued_at, expires_at,
redeemed_at, redeemed_by_visit_id FK visits(id)
```

### Phase 3 — Stripe Connect

**`org_stripe_accounts`**
```
org_id PK FK,
stripe_account_id TEXT UNIQUE,
charges_enabled BOOLEAN, payouts_enabled BOOLEAN,
default_currency CHAR(3),
connected_at, disconnected_at,
webhook_secret TEXT                  -- per-account webhook endpoint secret (encrypted)
```

Stripe secrets stored AES-256-GCM encrypted via the existing helper used for TOTP.

### Phase 4 — Engagement

**`promo_codes`**
```
id, org_id, code UNIQUE(org_id,code), description,
percent_off INT, amount_off_cents INT,    -- one or the other
applies_to TEXT NOT NULL,                 -- 'membership' | 'event' | 'both'
min_tier_id FK membership_tiers NULL,     -- "must be Patron to redeem"
expires_at, max_redemptions INT, redemptions_count INT DEFAULT 0,
active, created_at, updated_at
```

**`broadcasts`**
```
id, org_id, segment_id FK visitor_segments NULL, -- NULL = all contacts
template_key TEXT, subject, body,
status TEXT,                              -- 'draft' | 'queued' | 'sending' | 'sent'
scheduled_for, sent_at, recipient_count,
created_by FK users, created_at
```

**`events.membership_required_tier_id`** — nullable FK on existing `events` table. If set, registration requires active membership at ≥ that tier (ordered by `sort_order`).

---

## Permissions

Add to `packages/shared/src/permissions/registry.ts`:
```
'contacts.view_all'
'contacts.manage'
'memberships.view_all'
'memberships.manage'
'memberships.refund'        // higher bar; defaults to superadmin in bootstrap role
'promo_codes.manage'
'broadcasts.send'
'stripe.manage'             // connect/disconnect account
```

Notification template management stays under the existing `notifications.manage`.

---

## Routes

All admin routes follow the kernel: Zod body/param/query, `requirePermission`, `withOrgContext` for mutations with single audit entry, `withOrgRead` for reads. Route matrix entry for each (happy / 401 / 403 / 422 / 404).

### Admin (Phase 1)
- `GET/POST /api/v1/orgs/:orgId/contacts` — list (search q, filter tags, include_deleted gated), create
- `GET/PATCH/DELETE /api/v1/orgs/:orgId/contacts/:id` — profile, edit, soft-delete
- `GET /api/v1/orgs/:orgId/contacts/:id/timeline` — unified visit + event + membership + notification history
- `POST /api/v1/orgs/:orgId/contacts/merge` — `{ keepId, mergeIds[] }`; audit every merge
- `POST /api/v1/orgs/:orgId/contacts/:id/redact` — PII scrub; sets `pii_redacted`
- `GET/POST /api/v1/orgs/:orgId/segments`, `GET/PATCH/DELETE /:id`, `POST /:id/preview`

### Admin (Phase 2)
- `GET/POST /api/v1/orgs/:orgId/membership-tiers`, `GET/PATCH /:id`, `DELETE /:id` (soft)
- `GET /api/v1/orgs/:orgId/memberships` — list with filter (status, tier, expiring_before)
- `POST /api/v1/orgs/:orgId/memberships` — admin manually enroll a visitor (source=manual)
- `GET/PATCH /:id`, `POST /:id/cancel`, `POST /:id/renew`, `POST /:id/refund`
- `GET/PATCH /api/v1/orgs/:orgId/membership-policies`

### Admin (Phase 3 — Stripe)
- `POST /api/v1/orgs/:orgId/stripe/connect` — returns Stripe OAuth URL
- `GET /api/v1/stripe/connect/callback` — completes Connect handshake
- `DELETE /api/v1/orgs/:orgId/stripe` — disconnect
- `GET /api/v1/orgs/:orgId/stripe` — status (charges_enabled, default_currency)
- `POST /api/v1/stripe/webhook/:orgId` — per-org endpoint; verifies signature against `webhook_secret`; handles `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.updated`, `customer.subscription.deleted`. Idempotent via `stripe_event_id` table.

### Admin (Phase 4)
- `GET/POST /api/v1/orgs/:orgId/promo-codes`, `GET/PATCH/DELETE /:id`
- `GET/POST /api/v1/orgs/:orgId/broadcasts`, `POST /:id/send`, `POST /:id/test-send`
- `POST /api/v1/orgs/:orgId/guest-passes/:code/verify` (for kiosk scan) — validates and optionally marks redeemed

### Public / visitor-facing
- `GET /api/v1/public/orgs/:slug/membership-tiers` — list active tiers
- `POST /api/v1/public/orgs/:slug/memberships/checkout` — creates Stripe Checkout Session (Connect); returns URL. Visitor identity via email; upsert into `visitors` before checkout.
- Extend existing `manage.ts` token scope: the HMAC-signed token now also authorizes membership self-view and self-cancel when issued for a visitor. New endpoint `GET /api/v1/manage/:token/memberships`, `POST /api/v1/manage/:token/memberships/:id/cancel`.
- `POST /api/v1/public/orgs/:slug/promo-codes/validate` — pre-checkout validation

### Kiosk
- Existing kiosk `/kiosk/:qrToken/checkin` extended to accept `guest_pass_code` or `member_email`; when present, look up visitor + mark visit as member-attended. Registration gates for member-only events enforce on `events.register`.

---

## Notification Templates (seeded)

Added to `apps/api/src/services/notifications/default-templates.ts`:
- `membership.welcome` — on payment success / manual enroll
- `membership.renewal_reminder` — parameterized by days-out (renders differently at T-30 vs T-7)
- `membership.expired` — at expiry (status transitions active → expired)
- `membership.lapsed` — at expiry + grace_period_days
- `membership.cancelled` — on cancel
- `membership.payment_failed` — from Stripe webhook
- `broadcast.generic` — used by the broadcast composer; subject/body come from the broadcast row

New subscribers in `apps/api/src/services/notifications/subscribers.ts` hook into the event bus already used by visit subscribers. Demo-org gate still applies.

A new periodic job `apps/api/scripts/membership-sweep.ts` (cron) does three things: status transitions (active → expired → lapsed), queues reminder emails per `renewal_reminder_days`, and closes memberships whose Stripe subscription ended. Reuses `idempotency_keys` to avoid double-queueing reminders on the same day.

---

## Admin UI

New sidebar group "Members & CRM" in `apps/web/app/app/layout.tsx`:

**Phase 1**
- `/app/contacts` — searchable table (email, name, tags, last_visit, membership_status)
- `/app/contacts/profile?id=...` — profile: identity block, tag editor, notes, timeline (visits/events/memberships/emails), "Merge into..." action. Query-param route is intentional for static export.
- `/app/contacts/segments` — segment list + builder (simple filter DSL UI)

**Phase 2**
- `/app/memberships` — list of memberships with status filter
- `/app/memberships/tiers` — tier editor
- `/app/memberships/policies` — policy form (mirrors `/app/booking-policies`)

**Phase 3**
- `/app/settings/stripe` — Connect / Disconnect + status
- `/app/memberships/[id]` — detail view with refund/cancel/renew

**Phase 4**
- `/app/memberships/promo-codes`
- `/app/broadcasts` — composer (segment picker, template, preview, test-send, send)

**Public**
- `/join/[orgSlug]` — tier cards → Stripe Checkout redirect
- `/manage/:token` extended with a "Your membership" section

All pages follow the existing TanStack Query + Zustand + Tailwind patterns; reuse `SubPage` wrapper in `apps/web/app/components/sub-page.tsx`.

---

## Critical files to create / modify

**Migrations** (new, numbered sequentially after current highest):
- `NNN_contacts.sql` — visitors table + RLS + indexes + visitor_id FK on visits/waitlist/event_registrations
- `NNN_contacts_backfill.sql` — invokes `apps/api/scripts/backfill-visitors.ts`
- `NNN_segments.sql`
- `NNN_membership_tiers.sql`
- `NNN_memberships.sql`
- `NNN_membership_payments.sql`
- `NNN_membership_policies.sql`
- `NNN_guest_passes.sql`
- `NNN_org_stripe_accounts.sql`
- `NNN_stripe_events.sql` — idempotency table for webhook
- `NNN_promo_codes.sql`
- `NNN_broadcasts.sql`
- `NNN_events_member_tier.sql` — adds `membership_required_tier_id` FK

**Backend new files**:
- `apps/api/src/services/contacts.ts`
- `apps/api/src/services/memberships.ts` (incl. `createMembershipInTx`, `cancelMembershipInTx`, `sweepMembershipStatus`)
- `apps/api/src/services/stripe.ts` (client factory per org, Connect helpers)
- `apps/api/src/services/segments.ts` (DSL → Kysely)
- `apps/api/src/services/broadcasts.ts`
- `apps/api/src/routes/contacts.ts`, `memberships.ts`, `membership-tiers.ts`, `membership-policies.ts`, `promo-codes.ts`, `broadcasts.ts`, `stripe.ts`, `public-memberships.ts`
- `apps/api/scripts/backfill-visitors.ts`
- `apps/api/scripts/membership-sweep.ts`

**Backend modified**:
- `apps/api/src/db/types.ts` — add Kysely types for all new tables
- `packages/shared/src/permissions/registry.ts` — new permissions
- `packages/shared/src/schemas/` — Zod schemas for all new payloads
- `apps/api/src/routes/visits.ts`, `waitlist.ts`, `event-registrations.ts` — upsert `visitor_id` on create; member-only event gate
- `apps/api/src/services/notifications/default-templates.ts` — new templates
- `apps/api/src/services/notifications/subscribers.ts` — membership subscribers
- `apps/api/src/routes/manage.ts` — membership self-view/cancel
- `apps/api/src/routes/kiosk.ts` — guest pass / member_email acceptance
- `apps/api/src/config.ts` — `STRIPE_SECRET_KEY`, `STRIPE_CONNECT_CLIENT_ID`, `STRIPE_WEBHOOK_SIGNING_SECRET`
- `apps/api/src/plugins/errorHandler.ts` — map Stripe errors to RFC 7807
- `eslint-plugin-butterbook/lib/rules/no-direct-tenant-db.js` — add new table names to `TENANT_TABLES`
- `apps/api/tests/integration/route-matrix.test.ts` — new rows

**Frontend new**:
- `apps/web/app/app/contacts/page.tsx`, `apps/web/app/app/contacts/profile/page.tsx`, `apps/web/app/app/contacts/segments/page.tsx`
- `apps/web/app/app/memberships/{page,tiers,policies,promo-codes}/page.tsx`, `[id]/page.tsx`
- `apps/web/app/app/broadcasts/page.tsx`
- `apps/web/app/app/settings/stripe/page.tsx`
- `apps/web/app/join/[orgSlug]/page.tsx`
- `apps/web/app/manage/membership-section.tsx` (embedded in existing manage page)

**Frontend modified**:
- `apps/web/app/app/layout.tsx` — sidebar entries
- `apps/web/app/app/events/**` — member-only-tier picker on event edit
- `apps/web/lib/api-client.ts` — new client methods

---

## Reused patterns

- **`withOrgContext` / `withOrgRead`** — all new mutation/read routes (per CLAUDE.md kernel §1.2 rule 2 + 5).
- **`org_booking_policies` shape** — direct template for `org_membership_policies`.
- **HMAC manage-token** at `apps/api/src/utils/manage-token.ts` — extend for membership self-serve; no new token format.
- **Notification outbox + Handlebars templates** — all membership mail goes through existing pipeline; the demo-org gate in `subscribers.ts` automatically protects demo.
- **AES-256-GCM helper** used for TOTP secrets — reused for Stripe webhook secret encryption.
- **CITEXT** already used for `users.email` — same type for `visitors.email`.
- **Idempotency table pattern** used for visits — reused for `stripe_events`.
- **Route matrix** at `apps/api/tests/integration/route-matrix.test.ts` — every new route gets an entry.
- **`allowIncludeDeleted` gate** — applied to `/contacts` and `/membership-tiers` (soft-delete aware).
- **Cloudflare `_redirects`** in `apps/web/public/_redirects` — add `/join/:slug` if needed.
- **`SubPage` component** at `apps/web/app/components/sub-page.tsx` — wrapper for all new admin pages.

---

## Phasing & milestones

Each phase is a shippable increment. Ship order matches the phase numbers.

**Phase 1 — Contacts CRM** (foundation; no new revenue but instant reporting value)
1. Migrations: `visitors`, `visitor_id` FKs, backfill, `visitor_segments`
2. API: `contacts.*`, `segments.*` routes + services
3. Modify visit/waitlist/event_registration create paths to upsert visitor
4. Admin UI: `/app/contacts`, `/app/contacts/profile?id=...`, `/app/contacts/segments`
5. Tests + route matrix

**Phase 2 — Membership core** (tiers, manual enrollment, status machine — usable without Stripe)
1. Migrations: tiers, memberships, payments, policies, guest_passes, events.member_tier
2. API: CRUD + manual enroll + cancel/renew + policies
3. Sweep script: status transitions + reminder queuing
4. Notification templates + subscribers
5. Admin UI: tiers, memberships list + detail, policies
6. Member-only event gating in events.register + UI
7. Tests

**Phase 3 — Stripe Connect + self-serve purchase**
1. Migration: `org_stripe_accounts`, `stripe_events`
2. Stripe client factory + Connect OAuth
3. Public tier list + Checkout Session creation
4. Webhook handler (idempotent, per-org)
5. Stripe settings UI + `/join/[orgSlug]` page
6. Membership self-serve via extended manage token
7. Refund flow (permissioned)
8. Tests (Stripe test mode + webhook simulator)

**Phase 4 — Engagement**
1. Promo codes (API + UI + Checkout integration)
2. Broadcasts (segment-scoped, via outbox)
3. Guest pass issuance on tier purchase + kiosk redemption
4. Tests

---

## Verification

**Per phase:**
- `pnpm --filter api test` — unit + integration pass
- `pnpm --filter api lint` — ESLint `no-direct-tenant-db` passes (confirms new tables routed through helpers)
- `pnpm --filter web build` — typechecks
- Route matrix has a row per new route with happy/401/403 coverage

**End-to-end (after each phase, in a local dev stack):**
- Phase 1: create 2 visits with same email via different orgs → confirm single visitor per org, two rows across orgs; merge two contacts; create segment "lapsed visitors" and preview.
- Phase 2: create tier, manually enroll a visitor, run sweep script with clock-mocked time → reminder rows in `notifications_outbox`; cancel membership → status = cancelled + email queued.
- Phase 3: Stripe test mode — connect a test account via Connect OAuth, buy a membership via `/join/[slug]`, confirm webhook marks membership active, `membership.welcome` queued; trigger `invoice.payment_failed` via `stripe trigger` → status + notification handled; refund via admin UI → `membership_payments.refunded_at` set, status=refunded.
- Phase 4: create promo code, apply at `/join`, verify redeemed count increments; create broadcast to segment, test-send to self, then send → N outbox rows with correct `template_key`; issue guest pass on purchase, redeem at kiosk → `redeemed_at` set.

**Prod verification** (after each phase deploys to `api.butterbook.app`):
- Confirm we're on the prod Coolify API container (not demo) before running `pnpm --filter api migrate up` — per CLAUDE.md, both containers look identical.
- Spot-check: `/metrics` shows new route histograms; `audit_log` has rows for a manual admin action.
- `CORS_ALLOWED_ORIGINS` unchanged (no new web hostnames).

**Open risks flagged for review before Phase 3 starts:**
- Stripe Connect requires platform onboarding + a live `STRIPE_CONNECT_CLIENT_ID`; confirm we are on Connect (not Standard) and that platform fees (if any) are set.
- Webhook endpoints per-org (`/stripe/webhook/:orgId`) simplify signature verification but require each org to register its endpoint in Stripe dashboard — alternative is a single endpoint that dispatches by `account` field. Decide at Phase 3 kickoff.
- Backfill (Phase 1) runs inline in the migration; for large orgs it may need to chunk. Verify row counts in prod before running.
