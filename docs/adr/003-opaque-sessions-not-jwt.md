# ADR 003 — Opaque session tokens instead of JWTs

**Status:** Accepted.

## Context

Authenticated API calls need to carry identity. The two common options:

- **JWT** — stateless; trivial revocation is hard (requires a blocklist or short TTL).
- **Opaque tokens** — a random secret the server stores (hashed) and can revoke by flipping a bit.

## Decision

Use **opaque tokens**: 32 random bytes, sent as `base64url`, stored as the `sha256` hash in the `sessions` table. Lookup costs one indexed query per request. Revocation is immediate.

- Sliding expiration: 30-day TTL, extended when `last_used_at` is older than 7 days.
- Password change revokes all other sessions.

## Consequences

- Every authenticated request makes a DB lookup. With a `(token_hash)` unique index and a connection pool, this is cheap and well within our performance budget.
- We do not need to rotate or publish signing keys.
- Audit of active sessions is straightforward (the table is the source of truth).
