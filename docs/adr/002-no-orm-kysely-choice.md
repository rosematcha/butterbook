# ADR 002 — Kysely over ORM or raw SQL

**Status:** Accepted.

## Context

We need typed DB access with predictable SQL shape. The options:

- **Prisma** — great DX but emits its own query builder AST; the generated SQL is not obvious and migrations compete with `node-pg-migrate`. Not compatible with RLS-first tenancy without workarounds.
- **Raw SQL** — maximum control, but no type safety on rows/columns and easy to drift.
- **Kysely** — TypeScript query builder that produces SQL we can read. Types come from a hand-written `DB` interface we keep honest with migrations.

## Decision

Use **Kysely** plus **node-pg-migrate** with plain SQL migrations.

- Migrations remain readable, auditable, and idempotent where possible.
- Kysely gives us typed row shapes without hiding the underlying SQL.
- RLS plays well because we can run `set_config('app.current_org_id', ...)` at the start of each transaction via `withOrgContext`.

## Consequences

- The `DB` interface must be kept in sync by hand. A failed query type-checks against what we *believe* the schema to be — discipline matters.
- No magic N+1 resolvers, which is fine for our workload (it is not a graph-heavy app).
