# ADR 008 — Idempotency keys scoped by endpoint, 24-hour retention

**Status:** Accepted.

## Decision

Mutating guest endpoints (`visit.create.self`, `visit.create.kiosk`, `event.register`, `waitlist.join`) accept an `Idempotency-Key` header. The server stores `(key, scope)` along with a SHA-256 of the request body. On retry:

- matching body → return cached status + response;
- mismatched body → `422 idempotency_conflict`.

Rows expire 24 hours after creation; a periodic cleanup job (not yet implemented) removes expired rows.

## Why scope-per-endpoint

The same UUID could plausibly collide between unrelated flows. Scoping prevents a kiosk-checkin key from matching a later event-registration key.

## Why hash the body

Some retries are legitimately different (user fixed a typo). A plain key match would silently return the old response. Requiring body-hash equality makes accidental reuse loud.
