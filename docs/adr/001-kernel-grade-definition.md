# ADR 001 — Kernel-Grade Definition

**Status:** Accepted.

These are the correctness contracts. Every design decision must honor them. Any design choice that would weaken one of these principles must be documented and justified in a subsequent ADR.

1. All external input is validated by Zod at the boundary before any business logic runs.
2. Every mutation runs inside a database transaction that includes its audit log write. If the audit write fails, the mutation rolls back.
3. Every route has an explicit, type-checked permission declaration. No implicit or default access.
4. No uncaught exceptions reach the client. All errors pass through a typed error handler and emit RFC 7807 Problem Details responses.
5. Every query that touches tenant data is protected by both application-level `org_id` filtering AND Postgres Row-Level Security. RLS is the defense-in-depth backstop.
6. Soft-deleted records are never returned without an explicit `include_deleted=true` query parameter AND a superadmin caller.
7. Every environment variable is validated at startup. The server refuses to start on bad or missing config.
8. Every API route has tests covering happy path, auth failure, and permission denial.
9. Secrets are never logged. A log sanitizer strips known sensitive fields before emission.
10. Dependencies are pinned to exact versions. `pnpm audit` runs in CI and fails the build on high/critical findings.

**Current status:** The codebase enforces 1–5, 7, 9, 10 at all times. #6 (soft-deleted visibility) is implemented via consistent `deleted_at is null` predicates; no `include_deleted` query exists yet because no read endpoint exposes that toggle. #8 is partial — see `CLAUDE.md` follow-ups.
