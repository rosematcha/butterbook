# ADR 005 — Append-only audit log enforced by DB trigger

**Status:** Accepted.

## Decision

`audit_log` has a `BEFORE UPDATE OR DELETE` trigger that raises `audit_log is append-only`. Every mutation handler writes an audit entry inside the same transaction as the underlying change; `withOrgContext` exposes an `audit(entry)` function wired to the current `tx`.

## Why

- A compromised application cannot rewrite history; the DB refuses.
- If the audit write fails (e.g., constraint violation), the whole transaction rolls back. There is no "successful change with missing audit row" state.
- Forensic replay and compliance reviews have a single source of truth.

## Consequences

- Retention/purge needs a privileged out-of-band process if ever required (e.g., legal request). We'll add a documented `app_admin`-only routine if and when needed.
- Schema changes to `audit_log` must be additive only. Never rename `action` values — they are a public stable identifier used in reports.
