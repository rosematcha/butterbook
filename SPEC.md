# Museum Scheduler — Implementation Specification

**Version:** 1.0 (frozen)
**Status:** Ready for implementation
**Scope:** Full system spec for an Acuity-style reservation system tailored for art museums. Built as a standalone web application; WordPress plugin deferred to a later phase but architecture must accommodate it.

---

## 1. Project Goals & Non-Negotiables

### 1.1 Purpose

A multi-tenant reservation management system for art museums. Manages two kinds of visits:

- **General visits** — low-friction registration for individuals and small groups (typical party size 2, usually under 10). No hard capacity; the booking records presence, not allocation.
- **Special events** — advance sign-up via unique public URLs. Capacity-limited with optional waitlist.

### 1.2 Non-Negotiable Principles ("Kernel-Grade")

These are the correctness contracts. Every design decision must honor them.

1. **All external input is validated by Zod at the boundary before any business logic runs.**
2. **Every mutation runs inside a database transaction that includes its audit log write.** If the audit write fails, the mutation rolls back.
3. **Every route has an explicit, type-checked permission declaration.** No implicit or default access.
4. **No uncaught exceptions reach the client.** All errors pass through a typed error handler and emit RFC 7807 Problem Details responses.
5. **Every query that touches tenant data is protected by both application-level `org_id` filtering AND Postgres Row-Level Security.** RLS is the defense-in-depth backstop.
6. **Soft-deleted records are never returned without an explicit `include_deleted=true` query parameter AND a superadmin caller.**
7. **Every environment variable is validated at startup.** The server refuses to start on bad or missing config.
8. **Every API route has tests covering happy path, auth failure, and permission denial.**
9. **Secrets are never logged.** A log sanitizer strips known sensitive fields before emission.
10. **Dependencies are pinned to exact versions.** `pnpm audit` runs in CI and fails the build on high/critical findings.

Any design choice that would weaken one of these principles must be documented and justified in an ADR.

---

## 2. Tech Stack

| Layer | Choice | Rationale |
|---|---|---|
| Language | TypeScript, `strict: true`, no `any` | Single-language stack, strong typing, shared types across frontend and backend |
| Runtime | Node.js LTS (pin major version in `.nvmrc`) | Stable, well-supported |
| API framework | Fastify | Schema-first request validation, strong TypeScript support, good performance |
| Frontend | Next.js (App Router) | Mature SSR, routing, middleware |
| Database | PostgreSQL 15+ | RLS support, JSONB, mature tooling |
| DB query layer | Kysely | Type-safe query builder, no ORM magic, SQL-shaped queries |
| Migrations | `node-pg-migrate` with plain SQL files | Readable, auditable, no DSL lock-in |
| Validation | Zod | Runtime validation + type inference, shared between apps |
| Password hashing | `argon2` | Current best practice |
| Session tokens | Opaque tokens (random 32-byte, SHA-256 hashed in DB) | Instantly revocable |
| TOTP | `otpauth` | Minimal, well-audited |
| Symmetric encryption | Node `crypto` AES-256-GCM for at-rest secrets | Standard library, no dependency risk |
| Short IDs | `@paralleldrive/cuid2` | Collision-resistant, URL-safe, unpredictable |
| Logging | `pino` with redaction config | Fastify default, fast, structured |
| Monorepo | pnpm workspaces + Turborepo | Fast installs, build caching |
| Testing | `vitest` + `supertest` | Fast, TypeScript-native |
| Styling | Tailwind CSS | Utility-first, predictable |
| Client state | Zustand | Minimal footprint |
| Server state | TanStack Query | Battle-tested caching + refetch logic |
| Forms (frontend) | `react-hook-form` + Zod resolver | Shared schema with backend |

---

## 3. Monorepo Structure

```
/
├── apps/
│   ├── web/                     # Next.js frontend
│   └── api/                     # Fastify backend
├── packages/
│   └── shared/                  # Shared types, Zod schemas, utilities
│       ├── src/
│       │   ├── types/
│       │   ├── schemas/
│       │   ├── permissions/
│       │   └── utils/
│       └── package.json
├── wordpress/                   # Placeholder for future plugin
├── docs/
│   ├── schema.md
│   ├── api.md
│   ├── permissions.md
│   └── adr/
├── .env.example
├── turbo.json
├── pnpm-workspace.yaml
└── package.json
```

The WordPress plugin directory exists as an empty stub with a README noting "deferred to phase 2." The API must be designed assuming a non-browser consumer (the plugin) will eventually call it.

---

## 4. Database Schema

### 4.1 Conventions

- All primary keys are `UUID` generated via `gen_random_uuid()` (requires `pgcrypto` extension).
- All tables have `created_at TIMESTAMPTZ NOT NULL DEFAULT now()` and `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`.
- Tables that support soft delete have `deleted_at TIMESTAMPTZ` (nullable).
- All timestamps are `TIMESTAMPTZ`, stored as UTC.
- Foreign keys use `ON DELETE RESTRICT` unless otherwise noted. Cascading deletes are dangerous with audit logs.
- `updated_at` is maintained via a trigger: `CREATE TRIGGER ... BEFORE UPDATE ... SET NEW.updated_at = now()`.

### 4.2 Extensions

```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;     -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS citext;       -- case-insensitive email
```

### 4.3 Tables

#### `orgs`

```sql
CREATE TABLE orgs (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  TEXT NOT NULL,
  address               TEXT NOT NULL,
  zip                   TEXT NOT NULL,
  timezone              TEXT NOT NULL,                     -- IANA, e.g. "America/New_York"
  slug_prefix           TEXT NOT NULL DEFAULT 'e',         -- user-configurable URL prefix
  slot_rounding         TEXT NOT NULL DEFAULT 'freeform',  -- freeform | 5 | 10 | 15 | 30
  kiosk_reset_seconds   INT NOT NULL DEFAULT 15 CHECK (kiosk_reset_seconds BETWEEN 3 AND 300),
  logo_url              TEXT,
  theme                 JSONB NOT NULL DEFAULT '{}'::jsonb,  -- see Theme schema below
  form_fields           JSONB NOT NULL DEFAULT '[]'::jsonb,  -- default visit form, see Form schema
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at            TIMESTAMPTZ,
  CHECK (slot_rounding IN ('freeform','5','10','15','30'))
);
```

**Theme JSONB shape** (validated by Zod on write):
```ts
{
  primaryColor?: string;      // hex, validated /^#[0-9a-f]{6}$/i
  secondaryColor?: string;
  accentColor?: string;
  fontFamily?: 'system' | 'serif' | 'sans' | 'mono';
  buttonRadius?: 'none' | 'small' | 'medium' | 'large' | 'full';
}
```

No arbitrary CSS accepted. Custom CSS is a deferred feature requiring a security review.

**Form fields JSONB shape** (array of field definitions):
```ts
Array<{
  fieldKey: string;                // e.g. "name", "zip", "party_size"
  label: string;
  fieldType: 'text' | 'number' | 'select' | 'checkbox';
  required: boolean;
  isSystem: boolean;               // system fields cannot be deleted
  displayOrder: number;
  options?: string[];              // for select fields
  validation?: {
    minLength?: number;
    maxLength?: number;
    min?: number;
    max?: number;
    pattern?: string;              // regex
  };
}>
```

System fields that must exist on every org at creation:
- `name` (text, required, system)
- `zip` (text, required, system)
- `party_size` (number, required, system, min: 1, max: 100)

These can be reordered but not deleted.

---

#### `locations`

```sql
CREATE TABLE locations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            UUID NOT NULL REFERENCES orgs(id),
  name              TEXT NOT NULL,
  address           TEXT,
  zip               TEXT,
  qr_token          UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  is_primary        BOOLEAN NOT NULL DEFAULT false,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at        TIMESTAMPTZ
);

CREATE INDEX idx_locations_org ON locations(org_id) WHERE deleted_at IS NULL;
```

**Invariant:** Each org has exactly one `is_primary = true` location at any time. Enforced in application code, with a partial unique index as backstop:
```sql
CREATE UNIQUE INDEX idx_locations_one_primary_per_org
  ON locations(org_id) WHERE is_primary = true AND deleted_at IS NULL;
```

---

#### `location_hours`

Regular weekly hours. Multiple rows per day of week allow split hours (e.g., 10–1, 3–5).

```sql
CREATE TABLE location_hours (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id       UUID NOT NULL REFERENCES locations(id),
  day_of_week       INT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),  -- 0=Sun
  open_time         TIME NOT NULL,
  close_time        TIME NOT NULL,
  is_active         BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (close_time > open_time)
);

CREATE INDEX idx_location_hours_location ON location_hours(location_id);
```

---

#### `location_hour_overrides`

Date-specific hour changes. Overrides the regular weekly hours for that date.

```sql
CREATE TABLE location_hour_overrides (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id       UUID NOT NULL REFERENCES locations(id),
  date              DATE NOT NULL,
  open_time         TIME,        -- NULL = closed all day
  close_time        TIME,
  reason            TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (open_time IS NULL AND close_time IS NULL) OR
    (open_time IS NOT NULL AND close_time IS NOT NULL AND close_time > open_time)
  )
);

CREATE INDEX idx_hour_overrides_location_date ON location_hour_overrides(location_id, date);
```

---

#### `closed_days`

Explicit closed-day markers. Distinct from `location_hour_overrides` with nulled times because they have different semantics in the UI ("marked closed" vs "hours overridden").

```sql
CREATE TABLE closed_days (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id       UUID NOT NULL REFERENCES locations(id),
  date              DATE NOT NULL,
  reason            TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(location_id, date)
);
```

---

#### `users`

```sql
CREATE TABLE users (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email               CITEXT NOT NULL UNIQUE,
  password_hash       TEXT NOT NULL,
  totp_secret_enc     BYTEA,                -- AES-256-GCM encrypted; NULL if disabled
  totp_enabled        BOOLEAN NOT NULL DEFAULT false,
  display_name        TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at          TIMESTAMPTZ
);

CREATE INDEX idx_users_email ON users(email) WHERE deleted_at IS NULL;
```

TOTP secrets are encrypted with AES-256-GCM. The encryption key is loaded from `TOTP_ENCRYPTION_KEY` env var (base64-encoded 32 bytes). The stored format is `iv || ciphertext || tag`, concatenated bytes.

---

#### `sessions`

Opaque session tokens. Replaces JWTs entirely.

```sql
CREATE TABLE sessions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users(id),
  token_hash        TEXT NOT NULL UNIQUE,   -- SHA-256 of the opaque token
  expires_at        TIMESTAMPTZ NOT NULL,
  revoked_at        TIMESTAMPTZ,
  last_used_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip                INET,
  user_agent        TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_token_hash ON sessions(token_hash);
CREATE INDEX idx_sessions_expires ON sessions(expires_at) WHERE revoked_at IS NULL;
```

Session lookup on every authenticated request. Update `last_used_at` on use. Expired/revoked sessions are rejected.

Sessions expire 30 days after creation by default. Refresh extends expiration by 30 days and is transparent to the client — any authenticated request against a session older than 7 days triggers a silent extension.

---

#### `org_members`

```sql
CREATE TABLE org_members (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            UUID NOT NULL REFERENCES orgs(id),
  user_id           UUID NOT NULL REFERENCES users(id),
  is_superadmin     BOOLEAN NOT NULL DEFAULT false,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at        TIMESTAMPTZ,
  UNIQUE(org_id, user_id)
);

CREATE INDEX idx_org_members_org ON org_members(org_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_org_members_user ON org_members(user_id) WHERE deleted_at IS NULL;
```

**Invariant:** At least one `is_superadmin = true` row per org at all times. Enforced in application code within the transaction that would demote or delete the last superadmin — the transaction MUST abort with a typed error.

---

#### `roles`

```sql
CREATE TABLE roles (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            UUID NOT NULL REFERENCES orgs(id),
  name              TEXT NOT NULL,
  description       TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at        TIMESTAMPTZ,
  UNIQUE(org_id, name)
);
```

---

#### `role_permissions`

Permission nodes are stored as strings. The registry of valid nodes lives in `packages/shared/src/permissions/registry.ts` as a typed union. Writes to this table validate against the registry at the application layer.

```sql
CREATE TABLE role_permissions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id           UUID NOT NULL REFERENCES roles(id),
  permission        TEXT NOT NULL,
  scope_type        TEXT,                -- NULL = org-wide; future: 'location'
  scope_id          UUID,                -- FK varies by scope_type; not enforced at DB level
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(role_id, permission, scope_type, scope_id)
);

CREATE INDEX idx_role_permissions_role ON role_permissions(role_id);
```

`scope_type` and `scope_id` are present in the schema but ignored in v1. All permissions are org-wide. This allows future scoping (e.g., "events.edit for location X only") without a migration.

---

#### `member_roles`

```sql
CREATE TABLE member_roles (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_member_id     UUID NOT NULL REFERENCES org_members(id),
  role_id           UUID NOT NULL REFERENCES roles(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_member_id, role_id)
);
```

---

#### `events`

```sql
CREATE TABLE events (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                UUID NOT NULL REFERENCES orgs(id),
  location_id           UUID NOT NULL REFERENCES locations(id),
  created_by            UUID NOT NULL REFERENCES users(id),
  title                 TEXT NOT NULL,
  description           TEXT,
  slug                  TEXT,                              -- user-set, nullable
  public_id             TEXT NOT NULL UNIQUE,              -- cuid2, always present
  starts_at             TIMESTAMPTZ NOT NULL,
  ends_at               TIMESTAMPTZ NOT NULL,
  capacity              INT CHECK (capacity IS NULL OR capacity > 0),
  waitlist_enabled      BOOLEAN NOT NULL DEFAULT false,
  waitlist_auto_promote BOOLEAN NOT NULL DEFAULT false,
  form_fields           JSONB,                             -- overrides org form; NULL = use org default
  is_published          BOOLEAN NOT NULL DEFAULT false,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at            TIMESTAMPTZ,
  CHECK (ends_at > starts_at)
);

CREATE INDEX idx_events_org ON events(org_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_events_location ON events(location_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_events_starts_at ON events(starts_at) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX idx_events_slug_per_org ON events(org_id, slug) WHERE slug IS NOT NULL AND deleted_at IS NULL;
```

**Slug rules:**
- Must match `^[a-z0-9]+(-[a-z0-9]+)*$` (lowercase alphanumeric with hyphens)
- Length 1–100
- Unique per org
- If unset, event is reachable only via `/{slug_prefix}/{public_id}`

**Public URL:** `/{org.slug_prefix}/{event.slug ?? event.public_id}`

---

#### `visits`

```sql
CREATE TABLE visits (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            UUID NOT NULL REFERENCES orgs(id),
  location_id       UUID NOT NULL REFERENCES locations(id),
  event_id          UUID REFERENCES events(id),          -- NULL = general visit
  booked_by         UUID REFERENCES users(id),           -- NULL when booking_method != 'admin'
  booking_method    TEXT NOT NULL CHECK (booking_method IN ('self','admin','kiosk')),
  scheduled_at      TIMESTAMPTZ NOT NULL,
  form_response     JSONB NOT NULL,                       -- validated against applicable form_fields
  status            TEXT NOT NULL DEFAULT 'confirmed'
                    CHECK (status IN ('confirmed','cancelled','no_show')),
  cancelled_at      TIMESTAMPTZ,
  cancelled_by      UUID REFERENCES users(id),
  pii_redacted      BOOLEAN NOT NULL DEFAULT false,
  idempotency_key   TEXT,                                 -- NULL except for guest-side creations
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_visits_org_scheduled ON visits(org_id, scheduled_at);
CREATE INDEX idx_visits_location_scheduled ON visits(location_id, scheduled_at);
CREATE INDEX idx_visits_event ON visits(event_id) WHERE event_id IS NOT NULL;
CREATE UNIQUE INDEX idx_visits_idempotency ON visits(org_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX idx_visits_form_gin ON visits USING gin (form_response);
```

**Visit type is derived, not stored:** `event_id IS NULL` → general visit; `event_id IS NOT NULL` → event visit.

**Walk-in is derived:** `booking_method = 'kiosk' AND scheduled_at - created_at < interval '5 minutes'` → walk-in.

**PII redaction:** when `pii_redacted = true`, `form_response` is nulled out except for `party_size`. Row retained for historical counts.

---

#### `waitlist_entries`

```sql
CREATE TABLE waitlist_entries (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id          UUID NOT NULL REFERENCES events(id),
  form_response     JSONB NOT NULL,
  sort_order        DOUBLE PRECISION NOT NULL,        -- fractional for cheap reordering
  status            TEXT NOT NULL DEFAULT 'waiting'
                    CHECK (status IN ('waiting','promoted','removed')),
  promoted_at       TIMESTAMPTZ,
  promoted_by       UUID REFERENCES users(id),
  promoted_visit_id UUID REFERENCES visits(id),
  idempotency_key   TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_waitlist_event_order ON waitlist_entries(event_id, sort_order) WHERE status = 'waiting';
CREATE UNIQUE INDEX idx_waitlist_idempotency ON waitlist_entries(event_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
```

**Fractional sort ordering:** new entries get `sort_order = (max(sort_order) + 1000)`. Reordering an entry between two others sets `sort_order = (prev.sort_order + next.sort_order) / 2`. After many reorders, a background rebalance resets integer-spaced values — implement later if needed.

---

#### `invitations`

```sql
CREATE TABLE invitations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            UUID NOT NULL REFERENCES orgs(id),
  email             CITEXT NOT NULL,
  token_hash        TEXT NOT NULL UNIQUE,
  invited_by        UUID NOT NULL REFERENCES users(id),
  role_ids          UUID[] NOT NULL DEFAULT '{}',
  expires_at        TIMESTAMPTZ NOT NULL,
  accepted_at       TIMESTAMPTZ,
  accepted_by       UUID REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_invitations_org ON invitations(org_id) WHERE accepted_at IS NULL;
```

---

#### `idempotency_keys`

Tracks keys across endpoints for 24 hours to return cached responses for retries.

```sql
CREATE TABLE idempotency_keys (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key               TEXT NOT NULL,
  scope             TEXT NOT NULL,                    -- e.g. 'visit.create', 'event.register'
  org_id            UUID REFERENCES orgs(id),
  request_hash      TEXT NOT NULL,                    -- SHA-256 of the request body
  response_status   INT NOT NULL,
  response_body     JSONB NOT NULL,
  expires_at        TIMESTAMPTZ NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(key, scope)
);

CREATE INDEX idx_idempotency_expires ON idempotency_keys(expires_at);
```

If a request arrives with the same `Idempotency-Key` and matching `request_hash`, return the cached response. If the key matches but the `request_hash` differs, return 422 — the key was reused for a different request.

A cleanup job deletes expired rows daily.

---

#### `audit_log`

Append-only. Enforced by DB trigger.

```sql
CREATE TABLE audit_log (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            UUID REFERENCES orgs(id),
  actor_id          UUID REFERENCES users(id),
  actor_type        TEXT NOT NULL,                    -- 'user' | 'guest' | 'kiosk' | 'system'
  action            TEXT NOT NULL,                    -- e.g. 'visit.cancelled'
  target_type       TEXT NOT NULL,
  target_id         UUID NOT NULL,
  diff              JSONB,                            -- { before, after }
  ip_address        INET,
  user_agent        TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_org_created ON audit_log(org_id, created_at DESC);
CREATE INDEX idx_audit_target ON audit_log(target_type, target_id);

CREATE OR REPLACE FUNCTION prevent_audit_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_log_no_update
  BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();
```

Every mutation handler MUST call `writeAuditEntry(tx, { ... })` inside its transaction. A lint rule or code review discipline enforces this; the `withOrgContext` helper's type signature can require an audit entry before commit.

---

### 4.4 Row-Level Security

RLS is enabled on every tenant-scoped table. The connection sets `app.current_org_id` as a session variable at transaction start.

Example policy (applied to every tenant-scoped table):

```sql
ALTER TABLE visits ENABLE ROW LEVEL SECURITY;

CREATE POLICY visits_tenant_isolation ON visits
  USING (org_id = current_setting('app.current_org_id', true)::uuid);
```

**Tables with RLS enabled:**
`locations`, `location_hours`, `location_hour_overrides`, `closed_days`, `org_members`, `roles`, `role_permissions`, `member_roles`, `events`, `visits`, `waitlist_entries`, `invitations`, `idempotency_keys`, `audit_log`.

**Tables without RLS:** `users`, `sessions`, `orgs`. These are queried by ID directly, and access is controlled by application logic (e.g., a user can only read their own sessions).

**Superuser bypass:** A dedicated `app_admin` role is used for migrations and background jobs. It has `BYPASSRLS` privilege. The application's normal DB role does NOT bypass RLS.

**Setting the context:**
```ts
await tx.executeQuery(sql`SELECT set_config('app.current_org_id', ${orgId}, true)`);
```

This is set inside `withOrgContext()`. All tenant-scoped queries go through it. A utility type prevents direct DB access from route handlers.

---

## 5. Permission Node Registry

Defined in `packages/shared/src/permissions/registry.ts`:

```ts
export const PERMISSIONS = [
  'visits.create',
  'visits.edit',
  'visits.cancel',
  'visits.view_all',

  'events.create',
  'events.edit',
  'events.delete',
  'events.publish',
  'events.manage_waitlist',
  'events.view_registrations',

  'admin.manage_roles',
  'admin.manage_users',
  'admin.manage_locations',
  'admin.manage_hours',
  'admin.manage_closed_days',
  'admin.manage_org',
  'admin.manage_forms',

  'reports.view',
  'reports.export',

  'kiosk.access',
] as const;

export type Permission = typeof PERMISSIONS[number];
```

**Superadmin bypass:** the permission check function returns `true` unconditionally if the caller's `org_members.is_superadmin` is true.

**Permission check signature:**
```ts
function hasPermission(
  ctx: { userId: string; orgId: string; isSuperadmin: boolean; permissions: Set<Permission> },
  permission: Permission,
): boolean;
```

---

## 6. API Surface

### 6.1 Conventions

- Base path: `/api/v1`
- Auth: `Authorization: Bearer <opaque-token>` header
- Content-Type: `application/json` for requests; responses are JSON (except CSV export endpoints)
- Success envelope: `{ data: T, meta?: { ... } }`
- Error envelope: RFC 7807 Problem Details: `{ type, title, status, detail, instance, errors? }`
- Pagination: `?page=1&limit=50` (max 200); response `meta: { page, limit, total, pages }`
- Date/time fields: ISO 8601 with timezone offset (e.g., `2026-04-17T14:30:00-04:00`)
- Idempotency: mutating guest endpoints accept `Idempotency-Key` header (UUID); 24-hour window
- Rate limiting: per-endpoint, see section 8

### 6.2 Route Catalog

The route list below is authoritative. Every route has:
- Method and path
- Auth requirement (`public`, `authenticated`, `superadmin`, or a specific permission node)
- Request body schema (Zod, defined in `packages/shared/src/schemas/`)
- Response schema

Full catalog:

#### Auth
- `POST /auth/register` — public. Body: `{email, password, displayName?}`. Creates user. No org membership.
- `POST /auth/login` — public. Body: `{email, password, totpCode?}`. Returns `{token, user, sessions: []}`.
- `POST /auth/logout` — authenticated. Revokes current session.
- `POST /auth/sessions/revoke-all` — authenticated. Revokes all sessions for current user.
- `GET /auth/me` — authenticated. Returns current user + org memberships.
- `POST /auth/totp/enable` — authenticated. Returns `{secret, qrCodeUrl}`; stores encrypted secret but does not activate.
- `POST /auth/totp/confirm` — authenticated. Body: `{code}`. Activates TOTP if code valid.
- `POST /auth/totp/disable` — authenticated. Body: `{code, password}`. Requires both.
- `POST /auth/password/change` — authenticated. Body: `{currentPassword, newPassword}`.

#### Orgs
- `POST /orgs` — authenticated. Body: `{name, address, zip, timezone}`. Creates org; caller becomes superadmin.
- `GET /orgs/:orgId` — authenticated (must be member).
- `PATCH /orgs/:orgId` — `admin.manage_org`.
- `DELETE /orgs/:orgId` — superadmin only. Soft delete.
- `GET /orgs/:orgId/branding` — public.
- `PATCH /orgs/:orgId/branding` — `admin.manage_org`.
- `GET /orgs/:orgId/form` — `admin.manage_forms`. Returns default form fields.
- `PUT /orgs/:orgId/form` — `admin.manage_forms`. Replaces form fields array (system fields validated).
- `GET /orgs/:orgId/export` — superadmin. Streams full org JSON export.

#### Locations
- `GET /orgs/:orgId/locations` — public.
- `POST /orgs/:orgId/locations` — `admin.manage_locations`.
- `GET /orgs/:orgId/locations/:locId` — public.
- `PATCH /orgs/:orgId/locations/:locId` — `admin.manage_locations`.
- `DELETE /orgs/:orgId/locations/:locId` — `admin.manage_locations`. Blocked if primary and no replacement designated.
- `POST /orgs/:orgId/locations/:locId/set-primary` — `admin.manage_locations`.
- `GET /orgs/:orgId/locations/:locId/qr` — authenticated, org member. Returns PNG.
- `POST /orgs/:orgId/locations/:locId/qr/rotate` — `admin.manage_locations`. Regenerates `qr_token`.

#### Hours & Closed Days
- `GET /orgs/:orgId/locations/:locId/hours` — public.
- `PUT /orgs/:orgId/locations/:locId/hours` — `admin.manage_hours`. Replaces all hours atomically.
- `GET /orgs/:orgId/locations/:locId/hours/overrides` — public. Query: `?from=&to=`.
- `POST /orgs/:orgId/locations/:locId/hours/overrides` — `admin.manage_hours`.
- `PATCH /orgs/:orgId/locations/:locId/hours/overrides/:id` — `admin.manage_hours`.
- `DELETE /orgs/:orgId/locations/:locId/hours/overrides/:id` — `admin.manage_hours`.
- `GET /orgs/:orgId/locations/:locId/closed` — public. Query: `?from=&to=`.
- `POST /orgs/:orgId/locations/:locId/closed` — `admin.manage_closed_days`.
- `DELETE /orgs/:orgId/locations/:locId/closed/:id` — `admin.manage_closed_days`.

#### Availability
- `GET /orgs/:orgId/locations/:locId/availability?date=YYYY-MM-DD` — public.
  - Response: `{ open: bool, reason?: string, openTime?: string, closeTime?: string, slots?: string[] }`
- `GET /orgs/:orgId/locations/:locId/availability/month?year=&month=` — public.
  - Response: `{ days: Array<{ date, open, closed, reason? }> }`

All availability logic (weekly hours → overrides → closed days → slot rounding) lives in one service. Handlers are thin.

#### Members & Roles
- `GET /orgs/:orgId/members` — `admin.manage_users`. Includes roles and superadmin flag.
- `DELETE /orgs/:orgId/members/:memberId` — `admin.manage_users`. Blocked if removing would leave zero superadmins.
- `PATCH /orgs/:orgId/members/:memberId/superadmin` — superadmin only. Body: `{isSuperadmin}`. Blocked on last superadmin demotion.
- `GET /orgs/:orgId/roles` — `admin.manage_roles`.
- `POST /orgs/:orgId/roles` — `admin.manage_roles`.
- `GET /orgs/:orgId/roles/:roleId` — `admin.manage_roles`.
- `PATCH /orgs/:orgId/roles/:roleId` — `admin.manage_roles`.
- `DELETE /orgs/:orgId/roles/:roleId` — `admin.manage_roles`. Detaches from members automatically in same tx.
- `GET /orgs/:orgId/roles/:roleId/permissions` — `admin.manage_roles`.
- `PUT /orgs/:orgId/roles/:roleId/permissions` — `admin.manage_roles`. Body: `{permissions: Permission[]}`. Replaces set atomically.
- `POST /orgs/:orgId/members/:memberId/roles` — `admin.manage_users`. Body: `{roleId}`.
- `DELETE /orgs/:orgId/members/:memberId/roles/:roleId` — `admin.manage_users`.

#### Invitations
- `POST /orgs/:orgId/invitations` — `admin.manage_users`. Body: `{email, roleIds}`. Returns invite URL (for now, since no email).
- `GET /orgs/:orgId/invitations` — `admin.manage_users`.
- `DELETE /orgs/:orgId/invitations/:id` — `admin.manage_users`.
- `POST /invitations/:token/accept` — public or authenticated. If no account, creates one.

#### Events
- `GET /orgs/:orgId/events` — `events.view_registrations`. Query: `?from=&to=&location_id=&published=`.
- `POST /orgs/:orgId/events` — `events.create`.
- `GET /orgs/:orgId/events/:eventId` — `events.view_registrations`.
- `PATCH /orgs/:orgId/events/:eventId` — `events.edit`.
- `DELETE /orgs/:orgId/events/:eventId` — `events.delete`. Soft delete. Refuses if confirmed visits exist unless `?cascade=true` and superadmin.
- `POST /orgs/:orgId/events/:eventId/publish` — `events.publish`.
- `POST /orgs/:orgId/events/:eventId/unpublish` — `events.publish`.
- `PATCH /orgs/:orgId/events/:eventId/slug` — `events.edit`. Body: `{slug: string | null}`.

#### Public event routes (guest-facing)
- `GET /{slug_prefix}/:slugOrPublicId` — public. Resolves event by slug-or-public-id, scoped by org (inferred from host or path param — see notes).
  - Note: since we're multi-tenant, the public URL also needs an org discriminator. Resolution options:
    - Subdomain: `museum.scheduler.app/e/morning-meditation`
    - Path: `/:orgSlug/:slug_prefix/:slugOrPublicId`
  - **Decision for v1:** path-based. Org is identified by a unique `org.public_slug` field (add migration). Public URLs: `/museum/e/morning-meditation`.
- `GET /:orgSlug/:slug_prefix/:slugOrPublicId/form` — public. Returns form fields for rendering.
- `POST /:orgSlug/:slug_prefix/:slugOrPublicId/register` — public. Accepts `Idempotency-Key`. Body: form response. Returns visit or waitlist entry.

#### Event Waitlist
- `GET /orgs/:orgId/events/:eventId/waitlist` — `events.manage_waitlist`.
- `POST /orgs/:orgId/events/:eventId/waitlist/:entryId/promote` — `events.manage_waitlist`. Creates a visit, marks entry promoted.
- `DELETE /orgs/:orgId/events/:eventId/waitlist/:entryId` — `events.manage_waitlist`. Marks removed.
- `PATCH /orgs/:orgId/events/:eventId/waitlist/:entryId/order` — `events.manage_waitlist`. Body: `{afterEntryId?, beforeEntryId?}`. Recomputes `sort_order`.

#### Visits (admin)
- `GET /orgs/:orgId/visits` — `visits.view_all`. Query: `?from=&to=&location_id=&event_id=&method=&status=&page=&limit=`.
- `POST /orgs/:orgId/visits` — `visits.create`. Admin creates on behalf of guest.
- `GET /orgs/:orgId/visits/:visitId` — `visits.view_all`.
- `PATCH /orgs/:orgId/visits/:visitId` — `visits.edit`.
- `POST /orgs/:orgId/visits/:visitId/cancel` — `visits.cancel`.
- `POST /orgs/:orgId/visits/:visitId/no-show` — `visits.edit`.
- `POST /orgs/:orgId/visits/:visitId/redact-pii` — superadmin. Sets `pii_redacted=true`, nulls personal fields in `form_response`.

#### Visits (guest self-booking, general)
- `GET /:orgSlug/book/:locId/form` — public.
- `GET /:orgSlug/book/:locId/availability?date=` — public. Same as availability endpoint but with org resolved from `orgSlug`.
- `POST /:orgSlug/book/:locId` — public. Accepts `Idempotency-Key`. Body: `{scheduledAt, formResponse}`.

#### Kiosk
- `GET /kiosk/:qrToken/config` — public. Returns `{orgId, locationId, orgName, locationName, theme, resetSeconds, nonce}`.
- `GET /kiosk/:qrToken/form` — public. Returns form fields.
- `POST /kiosk/:qrToken/checkin` — public, rate-limited, requires `nonce` and `Idempotency-Key`. Stamps `scheduled_at = now()`.

#### Calendar views
- `GET /orgs/:orgId/locations/:locId/calendar/day?date=` — `visits.view_all`. Returns visits + events for date.
- `GET /orgs/:orgId/locations/:locId/calendar/month?year=&month=` — `visits.view_all`. Returns per-day counts + open/closed status.

#### Reports
- `GET /orgs/:orgId/reports/visits?from=&to=&location_id=&type=&method=` — `reports.view`.
- `GET /orgs/:orgId/reports/headcount?from=&to=&location_id=&group_by=day|week|month` — `reports.view`.
- `GET /orgs/:orgId/reports/booking-sources?from=&to=&location_id=` — `reports.view`.
- `GET /orgs/:orgId/reports/events?from=&to=&location_id=` — `reports.view`.
- `GET /orgs/:orgId/reports/intake?field_key=&from=&to=` — `reports.view`. Aggregates values of a given form field.
- `GET /orgs/:orgId/reports/<name>/export` — `reports.export`. CSV response for each report above.

#### Audit Log
- `GET /orgs/:orgId/audit?from=&to=&actor_id=&action=&target_type=&page=&limit=` — superadmin.

#### System / Meta
- `GET /health` — public. Returns `{ok: true, version}`.
- `GET /api/v1/permissions` — authenticated. Returns the permission registry.

---

## 7. Core Business Logic

### 7.1 The `availability` Service

Single source of truth for whether a given datetime is bookable at a given location. Signature:

```ts
function isTimeAvailable(
  location: Location,
  hours: LocationHours[],
  overrides: LocationHourOverride[],
  closedDays: ClosedDay[],
  when: Date,
  orgTimezone: string,
): { available: boolean; reason?: string };
```

Resolution order:
1. If `closedDays` contains the date → `{available: false, reason: 'closed_day'}`.
2. If `overrides` contains the date with null times → `{available: false, reason: 'override_closed'}`.
3. If `overrides` contains the date with times → check `when` against override window.
4. Otherwise, use the `hours` rows for that day-of-week (multiple rows = split hours; any matching window qualifies).
5. Apply slot rounding if `slot_rounding != 'freeform'`: check `when` is on a valid slot boundary.

Used by: booking validation, calendar availability endpoints, admin booking UI.

### 7.2 The `booking` Service

Creates a visit. Enforces all invariants.

```ts
async function createVisit(
  tx: Transaction,
  params: {
    orgId: string;
    locationId: string;
    eventId?: string;
    bookedBy?: string;
    bookingMethod: 'self' | 'admin' | 'kiosk';
    scheduledAt: Date;
    formResponse: Record<string, unknown>;
    idempotencyKey?: string;
    actorContext: ActorContext;
  },
): Promise<Visit>;
```

Validation steps, in order:
1. Load org, location, event (if any). Verify all belong together.
2. Validate `formResponse` against the applicable form (event's override or org's default) via Zod.
3. If `eventId` is set:
   a. Verify event is published (unless caller has `events.view_registrations`).
   b. Verify `scheduledAt` matches event start time.
   c. Count existing confirmed visits for the event. If capacity reached, branch to waitlist logic.
4. If `eventId` is null (general visit):
   a. Verify `scheduledAt` passes `availability.isTimeAvailable`.
   b. If `bookingMethod = 'kiosk'`, additionally verify `scheduledAt` is within 60 seconds of `now()`.
5. Insert visit.
6. Write audit log entry.
7. Return visit.

All steps inside one transaction. If any step fails, nothing persists.

### 7.3 Waitlist Auto-Promotion

Triggered on visit cancellation for event visits:
1. Load event; check `waitlist_auto_promote`.
2. If enabled, find the lowest `sort_order` waitlist entry with `status='waiting'`.
3. In the same transaction:
   a. Create a visit from the waitlist entry's `form_response`.
   b. Update waitlist entry: `status='promoted'`, `promoted_at=now()`, `promoted_visit_id=<new visit id>`.
   c. Write audit log for both actions.

### 7.4 Session Lifecycle

- **Creation:** random 32 bytes via `crypto.randomBytes(32)`. Token sent to client is base64url-encoded. Stored hash is `sha256(rawBytes)` hex.
- **Validation:** on each authenticated request, hash the token, look up session, check not revoked and not expired. Update `last_used_at`.
- **Sliding expiration:** if `last_used_at` is more than 7 days after `created_at` (or more than 7 days since last extension), extend `expires_at` by another 30 days.
- **Explicit logout:** set `revoked_at = now()`. Token immediately invalid.
- **Password change:** revoke all sessions for the user except the current one.
- **Suspicious activity (future):** revoke all sessions on password reset or superadmin action.

### 7.5 TOTP Encryption

```ts
// Encrypt
const key = Buffer.from(process.env.TOTP_ENCRYPTION_KEY!, 'base64');  // 32 bytes
const iv = crypto.randomBytes(12);
const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
const tag = cipher.getAuthTag();
const stored = Buffer.concat([iv, ciphertext, tag]);  // 12 + N + 16 bytes

// Decrypt
const iv = stored.subarray(0, 12);
const tag = stored.subarray(stored.length - 16);
const ciphertext = stored.subarray(12, stored.length - 16);
const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
decipher.setAuthTag(tag);
const secret = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
```

TOTP verification accepts `currentWindow`, `previousWindow`, and `nextWindow` to handle ±30s clock skew.

### 7.6 Idempotency

Middleware runs before the route handler on endpoints that opt in.

```ts
async function handleIdempotent(req, scope, handler) {
  const key = req.headers['idempotency-key'];
  if (!key) return handler();

  const requestHash = sha256(JSON.stringify(req.body));
  const existing = await db.selectFrom('idempotency_keys')
    .where('key', '=', key)
    .where('scope', '=', scope)
    .executeTakeFirst();

  if (existing) {
    if (existing.request_hash !== requestHash) {
      throw new IdempotencyConflictError();
    }
    return { status: existing.response_status, body: existing.response_body };
  }

  const result = await handler();
  await db.insertInto('idempotency_keys').values({
    key, scope,
    request_hash: requestHash,
    response_status: result.status,
    response_body: result.body,
    expires_at: addHours(now(), 24),
  }).execute();
  return result;
}
```

Scopes:
- `visit.create.self`
- `visit.create.kiosk`
- `event.register`
- `waitlist.join`

### 7.7 Kiosk Mode

**Flow:**
1. Staff prints a QR code containing `https://museum.scheduler.app/kiosk/<qrToken>?kiosk=true`.
2. Guest scans, loads page.
3. Page calls `GET /kiosk/<qrToken>/config`; server returns a short-lived signed nonce (HMAC of `qrToken + ip + expiresAt`, 10-minute TTL).
4. Guest fills form, submits. Client sends `POST /kiosk/<qrToken>/checkin` with `X-Kiosk-Nonce` header and `Idempotency-Key`.
5. Server validates nonce (HMAC + IP match + not expired), creates visit with `scheduled_at = now()`.
6. UI shows confirmation for `kiosk_reset_seconds` with countdown and manual "New Visitor" button. Resets form.

**Threat mitigation:**
- Rate limits: 10 submissions/min per IP; 60 submissions/min per `qrToken`.
- Anomaly logged to audit log with `actor_type='kiosk'`.
- `qrToken` rotation via admin UI invalidates old token immediately.

---

## 8. Rate Limiting Policy

Implemented with `@fastify/rate-limit`, keyed per-endpoint:

| Endpoint group | Limit |
|---|---|
| `POST /auth/login` | 5/min per IP, 10/min per email |
| `POST /auth/register` | 3/min per IP |
| `POST /auth/password/*` | 3/min per IP |
| Guest booking (`POST /:orgSlug/book/...`) | 5/min per IP |
| Event register (`POST /.../register`) | 5/min per IP |
| Kiosk checkin | 10/min per IP, 60/min per qrToken |
| Authenticated API (default) | 300/min per user |
| Report exports | 10/min per user |
| Public availability reads | 120/min per IP |

Rate limit response: `429 Too Many Requests` with RFC 7807 body and `Retry-After` header.

---

## 9. Security Requirements

### 9.1 Headers

Every response includes:
- `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
- `X-Frame-Options: DENY` (override to `SAMEORIGIN` only on kiosk routes if needed)
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: geolocation=(), microphone=(), camera=(), payment=()`
- `Content-Security-Policy`:
  - `default-src 'self'`
  - `script-src 'self'` with per-request nonce for any inline script
  - `style-src 'self' 'unsafe-inline'` (or nonce-based if feasible)
  - `img-src 'self' data: https:`
  - `connect-src 'self'`
  - `frame-ancestors 'none'`
  - `base-uri 'self'`
  - `form-action 'self'`

### 9.2 CORS

API rejects cross-origin requests by default. The Next.js frontend is same-origin. Specific origins (future WordPress plugin) must be explicitly allowlisted per-env in config.

### 9.3 CSRF

Because authentication uses `Authorization: Bearer` headers (not cookies), CSRF is not applicable. Enforce via documentation: the frontend MUST NOT store tokens in cookies.

### 9.4 Password Requirements

- Minimum 12 characters
- Checked against a bundled common-passwords list (top 10,000)
- Argon2id with parameters: `memoryCost: 19456 KiB, timeCost: 2, parallelism: 1` (OWASP recommendation as of spec freeze)
- Rehash on login if parameters have been upgraded

### 9.5 Logging & PII

`pino` configured with redaction paths:
- `req.headers.authorization`
- `req.body.password`
- `req.body.newPassword`
- `req.body.currentPassword`
- `req.body.totpCode`
- `req.body.formResponse.name`
- `res.body.token`

Each log entry includes a request ID (`X-Request-Id` header, generated if absent).

### 9.6 Dependency Policy

- All dependencies pinned to exact versions.
- `pnpm audit --audit-level=high` runs in CI; build fails on high/critical.
- Renovate configured for weekly update PRs; security patches are auto-mergeable after CI passes.
- New dependencies require a one-line justification in the PR description.

### 9.7 Secrets

All secrets loaded from environment variables:
- `DATABASE_URL`
- `TOTP_ENCRYPTION_KEY` (base64, 32 bytes)
- `SESSION_SECRET` (for nonce HMAC, 32+ bytes)
- `KIOSK_NONCE_SECRET` (32+ bytes)
- `APP_BASE_URL`
- `CORS_ALLOWED_ORIGINS` (comma-separated)

All validated at startup by `config.ts` Zod schema. Server refuses to start on missing/malformed.

Production deployment loads these from a secrets manager (AWS Secrets Manager, GCP Secret Manager, HashiCorp Vault). Local development uses `.env` (gitignored).

---

## 10. Error Handling

### 10.1 Error Response Format (RFC 7807)

```json
{
  "type": "https://scheduler.app/errors/validation_failed",
  "title": "Validation Failed",
  "status": 422,
  "detail": "One or more fields failed validation.",
  "instance": "/api/v1/orgs/abc/visits",
  "errors": [
    { "path": "formResponse.party_size", "message": "Must be between 1 and 100" }
  ]
}
```

### 10.2 Error Class Hierarchy

```
AppError (abstract)
├── ValidationError         (422)
├── AuthenticationError     (401)
├── PermissionError         (403)
├── NotFoundError           (404)
├── ConflictError           (409)
├── IdempotencyConflictError(422)
├── RateLimitError          (429)
├── CapacityError           (409)  — event at capacity
├── AvailabilityError       (409)  — requested time not bookable
├── SuperadminInvariantError(409)  — would leave zero superadmins
└── InternalError           (500)
```

All handlers throw typed errors. A single Fastify error handler converts these to RFC 7807 responses. Unknown errors → 500 with a generic message; full details logged with the request ID.

### 10.3 Validation

All request bodies/params/queries validated by Zod via `fastify-zod` integration. Validation failures automatically produce 422 with field-level errors.

---

## 11. Database Access Pattern

### 11.1 `withOrgContext` Helper

```ts
async function withOrgContext<T>(
  orgId: string,
  actor: ActorContext,
  fn: (ctx: TenantContext) => Promise<T>,
): Promise<T> {
  return db.transaction().execute(async (tx) => {
    await sql`SELECT set_config('app.current_org_id', ${orgId}, true)`.execute(tx);
    const ctx: TenantContext = {
      tx,
      orgId,
      actor,
      audit: (entry) => writeAudit(tx, { orgId, actor, ...entry }),
    };
    return fn(ctx);
  });
}
```

Every handler that touches tenant data calls this. Direct `db` access outside this helper is forbidden for tenant-scoped tables (enforced by code review and a lint rule scanning for `db.selectFrom('visits')` etc.).

### 11.2 Query Organization

Queries live in `apps/api/src/db/queries/<domain>.ts`. Each exports pure functions taking a `tx` as the first argument:

```ts
export async function findVisitById(tx: TxLike, id: string): Promise<Visit | null> { ... }
export async function insertVisit(tx: TxLike, data: NewVisit): Promise<Visit> { ... }
```

No business logic in queries. They are thin wrappers around SQL.

### 11.3 Migrations

- Plain `.sql` files in `apps/api/src/db/migrations/`.
- Naming: `NNN_description.sql` (e.g., `001_init.sql`, `002_add_closed_days.sql`).
- Each migration is idempotent where possible (use `IF NOT EXISTS`).
- `node-pg-migrate` handles the migration table and ordering.
- Migrations run under the `app_admin` role (bypasses RLS).
- Never modify an existing migration after it has been merged; always add a new one.

---

## 12. Testing Requirements

### 12.1 Coverage Minimums

- Every route: happy path, auth failure (401), permission denial (403), validation failure (422), not-found (404 where applicable).
- Every service function: unit tests for all branches.
- Every migration: tested by running against a fresh DB in CI.

### 12.2 Test DB

Each test file gets a dedicated schema in a shared test database, created and dropped per run. Parallel test workers get parallel schemas. Migrations applied to each schema before tests.

### 12.3 Test Helpers

`apps/api/tests/helpers/`:
- `createTestOrg()` — creates org + superadmin + primary location + default form.
- `createTestUser(org, permissions[])` — creates user with a role bundling given permissions.
- `authedRequest(user)` — returns a Supertest agent pre-authenticated as the user.
- `assertAuditEntry(orgId, action, targetId)` — asserts an audit log row exists.

### 12.4 Required Test Cases

For every mutation:
1. Happy path creates expected DB state.
2. Audit entry written.
3. Transaction rolls back on failure (test by forcing an error in the service).
4. Idempotency: repeated call with same key returns cached response; different body returns 422.

---

## 13. Observability

### 13.1 Logs

Structured JSON via `pino`. Required fields on every entry:
- `time`
- `level`
- `msg`
- `reqId`
- `userId` (if authenticated)
- `orgId` (if tenant-scoped)
- `route`
- `method`
- `statusCode`
- `durationMs`

### 13.2 Metrics

Prometheus-compatible `/metrics` endpoint (not publicly exposed; behind internal-only auth or network ACL):
- `http_request_duration_seconds` histogram, labeled by route and status
- `http_requests_total` counter
- `db_query_duration_seconds` histogram
- `db_pool_connections_active` gauge
- `rate_limit_hits_total` counter

### 13.3 Health Checks

- `GET /health/live` — process is up, returns 200.
- `GET /health/ready` — DB reachable, migrations applied, returns 200 or 503.

---

## 14. Configuration

### 14.1 Environment Variables

Defined and validated in `apps/api/src/config.ts`:

```ts
const Config = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']),
  PORT: z.coerce.number().default(3001),
  DATABASE_URL: z.string().url(),
  DATABASE_POOL_SIZE: z.coerce.number().default(10),
  TOTP_ENCRYPTION_KEY: z.string().regex(/^[A-Za-z0-9+/=]+$/).refine(
    s => Buffer.from(s, 'base64').length === 32,
    'Must decode to exactly 32 bytes',
  ),
  SESSION_SECRET: z.string().min(32),
  KIOSK_NONCE_SECRET: z.string().min(32),
  APP_BASE_URL: z.string().url(),
  CORS_ALLOWED_ORIGINS: z.string().transform(s => s.split(',').map(x => x.trim())),
  LOG_LEVEL: z.enum(['trace','debug','info','warn','error','fatal']).default('info'),
});
```

### 14.2 Feature Flags

One boolean per deferred feature, default off:
- `FEATURE_EMAIL_NOTIFICATIONS` — email delivery
- `FEATURE_PII_AUTO_PURGE` — scheduled PII redaction
- `FEATURE_WORDPRESS_API` — enables additional CORS origins for the plugin

---

## 15. Deployment & Operations

### 15.1 First-Run Bootstrap

A CLI command, not a web flow, creates the first superadmin:

```bash
pnpm --filter api bootstrap \
  --email=admin@museum.org \
  --org-name="My Museum" \
  --org-address="123 Art Lane" \
  --org-zip="10001" \
  --timezone="America/New_York"
```

Prompts for password interactively (never on argv). Exits if any superadmin already exists, unless `--force` is passed. Only runnable with direct DB access (i.e., by an operator).

### 15.2 Backups

- Postgres point-in-time recovery enabled in production.
- Daily logical backups (`pg_dump`) retained 30 days.
- Monthly backups retained 1 year.
- Backup restore tested at least quarterly in a staging environment.

### 15.3 Zero-Downtime Migrations

- Always backwards-compatible: new columns nullable or with defaults; drops are multi-step (deploy no-read code, then drop column in next migration).
- Never lock large tables during deploy. Long migrations run manually in maintenance windows.

---

## 16. Phased Build Order

Build in vertical slices. Each slice ends with a working, tested feature.

**Slice 1: Foundation**
- Monorepo setup, linting, CI
- DB connection, migrations, RLS setup
- Config validation
- Error handling middleware
- Logging
- Health endpoints

**Slice 2: Auth**
- User registration
- Session-based login
- Logout and session revocation
- Password change
- TOTP enable/disable/verify

**Slice 3: Orgs & Membership**
- Create org (bootstrap CLI + API)
- Org read/update
- Invitations and acceptance
- Members listing, superadmin management
- Roles and permissions CRUD
- Permission check decorator

**Slice 4: Locations & Hours**
- Location CRUD
- Hours, overrides, closed days
- Availability service + endpoints
- Month calendar endpoint

**Slice 5: General Visits**
- Admin-initiated visit creation
- Guest self-booking flow
- Day view endpoint
- Visit listing with filters
- Cancellation, no-show

**Slice 6: Kiosk**
- QR token generation and rotation
- Kiosk config and form endpoints
- Nonce-based checkin
- Kiosk UI (countdown, reset, "New Visitor")

**Slice 7: Events**
- Event CRUD
- Slug management
- Public event pages
- Event registration
- Capacity enforcement

**Slice 8: Waitlist**
- Waitlist entry creation
- Reordering (fractional sort)
- Manual promotion
- Auto-promotion on cancellation

**Slice 9: Forms**
- Org-level form fields CRUD
- Event-level form overrides
- Dynamic form rendering
- Response validation

**Slice 10: Reports**
- Visits, headcount, booking sources, events, intake
- CSV export

**Slice 11: Admin UI**
- All admin screens in Next.js
- Calendar day and month views
- Branding customization

**Slice 12: Audit Log UI + Data Export**
- Audit log viewer
- Org data export endpoint
- PII redaction endpoint

**Deferred (not v1):**
- Email notifications
- WordPress plugin
- Custom CSS per org
- Scoped permissions (schema ready, not exercised)
- Multi-org per user UX polish

---

## 17. Architecture Decision Records (starter list)

Write each as `docs/adr/NNN-title.md`:

- `001-kernel-grade-definition.md` — what "kernel-grade" means concretely (section 1.2 verbatim)
- `002-no-orm-kysely-choice.md` — why Kysely over raw SQL or Prisma
- `003-opaque-sessions-not-jwt.md` — revocability over statelessness
- `004-rls-defense-in-depth.md` — RLS + app-level filtering
- `005-append-only-audit-log.md` — DB trigger enforces immutability
- `006-jsonb-form-responses.md` — single column vs. EAV rows
- `007-fastify-plus-nextjs.md` — two servers, one proxy
- `008-idempotency-keys.md` — scope-based caching, 24h retention
- `009-pii-redaction-model.md` — retain row, null identifying fields
- `010-bootstrap-via-cli.md` — first-run must be operator-initiated

---

## 18. Glossary

- **Org** — tenant; the museum. Top-level container.
- **Location** — a physical site within an org. One is primary.
- **General visit** — a visit with no associated event.
- **Event visit** — a visit tied to a specific event.
- **Walk-in** — a visit booked via kiosk where `scheduled_at ≈ created_at`.
- **Slot** — a discrete bookable time within open hours when `slot_rounding` is set.
- **Public ID** — cuid2-generated URL-safe identifier for events.
- **Slug** — optional human-readable identifier for events, unique per org.
- **Superadmin** — org-level role bypass; at least one per org at all times.
- **Kiosk mode** — front-desk tablet UI at `?kiosk=true`; cyclical walk-in registration.
- **Actor context** — the `{userId, orgId, isSuperadmin, permissions, ip, userAgent}` passed through request handling.

---

## 19. Out of Scope (v1)

- Payments, refunds, or any financial flows.
- Email or SMS delivery (architecture-ready, not built).
- Mobile apps.
- Multi-language / i18n.
- Real-time updates (WebSockets, SSE) — clients poll.
- Analytics integrations (Google Analytics, etc.).
- Offline mode — explicitly deferred.
- WordPress plugin — phase 2.
- Booking-on-behalf workflows for schools/large groups beyond the standard admin visit creation.

---

**End of spec.** Any implementation detail not specified here is at the implementer's discretion, provided it does not violate the Kernel-Grade principles in section 1.2.
