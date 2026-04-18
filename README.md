# butterbook — Museum Scheduler

Multi-tenant reservation management for art museums. See `CLAUDE.md` for the current implementation status per slice.

## Quick start

```bash
# 1. install
pnpm install

# 2. bring up Postgres (15+), then:
cp .env.example .env
# edit DATABASE_URL, TOTP_ENCRYPTION_KEY, SESSION_SECRET, KIOSK_NONCE_SECRET

# 3. migrate
pnpm --filter api migrate up

# 4. create the first superadmin + org
pnpm --filter api bootstrap \
  --email=admin@example.org \
  --org-name="My Museum" \
  --org-address="123 Art Ln" \
  --org-zip="10001" \
  --timezone="America/New_York"

# 5. run API + web
pnpm dev
```

API listens on `:3001`, web on `:3000`.

## Layout

```
apps/api/            Fastify backend (full API, tests)
apps/web/            Next.js scaffold (admin UI deferred, see CLAUDE.md)
packages/shared/     Zod schemas, permission registry, shared types
wordpress/           Placeholder for phase-2 plugin
docs/adr/            Architecture Decision Records (001–010)
```

## Principles

The ten kernel-grade principles in `docs/adr/001-kernel-grade-definition.md` are the non-negotiable baseline.
