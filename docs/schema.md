# Schema

The authoritative schema lives in `apps/api/src/db/migrations/*.sql`. Kysely types are in `apps/api/src/db/types.ts`; keep them in sync with migrations.

See `SPEC.md §4` for table-by-table documentation. Notable invariants:

- One primary location per org (partial unique index).
- One+ superadmin per org at all times (application-enforced within a transaction).
- `audit_log` is append-only (DB trigger).
- All tenant-scoped tables have RLS enabled and forced; access must go through `withOrgContext`.
