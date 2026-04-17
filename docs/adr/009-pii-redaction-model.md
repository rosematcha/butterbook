# ADR 009 — PII redaction: retain row, null identifying fields

**Status:** Accepted.

## Decision

`visits.pii_redacted = true` means `form_response` has been nulled out except for `party_size`. The row itself is retained so headcount, booking-method, and event-attendance reports remain accurate.

## Why not delete?

Deletes leave gaps in historical metrics. Privacy requests typically call for *removal of identifying information*, not deletion of statistical facts. Retaining an anonymized row is a common middle ground.

## Why keep `party_size`?

Headcount is the primary museum metric. Dropping it would break the primary use of the data.

## Consequences

- The `form_response` edit path refuses to write to a redacted visit.
- A separate endpoint (`POST /orgs/:id/visits/:id/redact-pii`) is superadmin-only and writes an audit entry.
