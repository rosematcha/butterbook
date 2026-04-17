# ADR 004 — RLS as defense-in-depth on top of app-level tenancy

**Status:** Accepted.

## Context

A multi-tenant system that relies only on `WHERE org_id = ?` in application code has a single point of failure. One missed clause in a new query exposes another tenant's data.

## Decision

Every tenant-scoped table has RLS enabled and forced. A `p_tenant` policy compares `org_id` (directly or through a parent FK) against the per-transaction session variable `app.current_org_id`, set by `withOrgContext`. Migrations and background jobs run as `app_admin` with `BYPASSRLS`; the application's runtime role does *not* bypass.

## Policy form

`USING (current_org_id_or_null() IS NULL OR org_id = current_org_id_or_null())`.

When the session variable is **unset** (read-side handlers that call `getDb()` directly with an application-level `WHERE org_id = ?`), the policy passes through — the application is the only guard. When the session variable is **set** (any `withOrgContext` block), RLS strictly enforces isolation, and a forgotten `WHERE` clause cannot leak across tenants.

This is a deliberate softening of a strict RLS setup. The alternative — requiring every read to enter a transaction with `set_config` — adds a round-trip to every read and complicates route code significantly. Mutations (which are the risk surface for accidental cross-tenant writes) *do* go through `withOrgContext` and therefore *do* get the strict RLS backstop.

## Consequences

- **Mutations** have two guards: application-level `org_id` filtering and RLS. Inserts are rejected by RLS if `org_id` on the new row does not match `app.current_org_id`.
- **Reads via `withOrgContext`** are strictly isolated by RLS.
- **Reads via direct `getDb()`** rely on application-level filtering only — the spec's "both" becomes "one" for those paths. This is the trade-off; it is documented here and in `CLAUDE.md`.
- Migrations and the bootstrap CLI run as `app_admin` with `BYPASSRLS`. Application runtime uses a role **without** `BYPASSRLS`.
