# ADR 006 — JSONB for form responses, not EAV

**Status:** Accepted.

## Context

Org-configurable forms mean each visit's response shape varies by org (and, optionally, by event). The choice is between:

- **EAV** — `visit_field_values(visit_id, field_key, value)`. Arbitrary queries; heavy to read back as a whole row.
- **JSONB** — one column; fast read; GIN-indexable.

## Decision

Store responses in `visits.form_response JSONB`, validated by a Zod schema built dynamically from the applicable `form_fields` list. A GIN index enables filtering / reports by field later.

## Consequences

- Read-back is a single row; payload shape is self-describing.
- Report queries that need to group by a specific field use `form_response->>'field_key'` with the GIN index.
- Because validation is dynamic, changing a form field's constraints applies to *new* responses only. Historic rows are not retroactively invalidated — this is desirable.
