# Butterbook

Multi-tenant reservation management for small art museums, community studios, and solo practitioners. Fastify API plus a Next.js admin UI and public kiosk, built on Postgres with row-level security.

## What's in the box

- **Visit register and public booking.** A shared record of who visited and when, plus a public booking page visitors can use without an account.
- **Kiosk.** A QR-code check-in surface that runs on a tablet at the door. HMAC-protected nonce per check-in, per-kiosk rate limits.
- **Events and waitlist.** Capacity enforcement at registration, manual promotion, and auto-promotion on cancel.
- **Org-configurable forms.** Dynamic Zod-validated form fields at the org and event level, with a live admin editor.
- **Roles and permissions.** Role-based access backed by a named permission registry; every tenant route declares the permission it requires.
- **Audit log.** Append-only, one row per mutation, with actor and reason. Paginated viewer in the admin UI.
- **Reports plus CSV export.** Headcount, booking sources, events, intake.
- **Org data export.** Superadmin-only streaming JSON dump of an org's data inside a read-only RLS-scoped transaction.

## Quick start

```bash
pnpm install

# Postgres 15+ running locally, then:
cp .env.example .env
# edit DATABASE_URL, TOTP_ENCRYPTION_KEY, SESSION_SECRET, KIOSK_NONCE_SECRET

pnpm --filter api migrate up

# Create the first superadmin and org
pnpm --filter api bootstrap \
  --email=admin@example.org \
  --org-name="My Museum" \
  --org-address="123 Art Ln" \
  --org-zip="10001" \
  --timezone="America/New_York"

pnpm dev
```

API listens on `:3001`, web on `:3000`.

## Layout

```
apps/api/                         Fastify backend + integration tests
apps/web/                         Next.js app (landing, auth, admin, kiosk)
packages/shared/                  Zod schemas, permission registry, shared types
packages/eslint-plugin-butterbook/ Local ESLint plugin (no-direct-tenant-db rule)
docs/adr/                         Architecture Decision Records (001–010)
docs/                             Schema, API, and permissions references
wordpress/                        Placeholder for a future plugin
```

## Principles

The ten baseline principles in [docs/adr/001-kernel-grade-definition.md](docs/adr/001-kernel-grade-definition.md) are the non-negotiable contract for every tenant route: Zod-validated input, RLS plus app-level org filter, one transaction per mutation with an audit write, RFC 7807 errors, happy / 401 / 403 tests per route.

## Contributing

Adding a route:

1. Add a Zod schema in `packages/shared/src/schemas/`.
2. Declare the permission with `req.requirePermission` or `req.requireSuperadmin`.
3. Use `withOrgRead(orgId, fn)` for reads and `withOrgContext(orgId, actor, fn)` for mutations.
4. Write one audit row per mutation.
5. Add a row to the parametric matrix in `apps/api/tests/integration/route-matrix.test.ts` (happy path, 401, 403, plus 422 / 404 where applicable).

Adding a migration: new file in `apps/api/src/db/migrations/NNN_description.sql`, enable RLS with the permissive-on-NULL pattern, add the Kysely type in `apps/api/src/db/types.ts`, and add the table name to `TENANT_TABLES` in the ESLint rule. Never modify a merged migration.

Direct `db` access is reserved for cross-tenant bootstrap paths (users, orgs creation, invitation-accept token lookup, kiosk `qrToken` lookup, session resolver). Each is in the ESLint rule's allowlist and documented at its call site.

## Tests and tooling

- `pnpm --filter api test` runs the integration suite (requires a running Postgres).
- `pnpm lint` runs ESLint across the workspace, including the local `no-direct-tenant-db` rule.
- `pnpm audit --audit-level=high` runs in CI; Renovate manages dependency updates on a weekly schedule.
- Prometheus metrics are exposed at `/metrics` behind a `METRICS_TOKEN` bearer (HTTP histogram, DB histogram, pool gauge, rate-limit counter).
