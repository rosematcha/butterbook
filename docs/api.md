# API

Conventions:

- Base path: `/api/v1`
- Auth: `Authorization: Bearer <opaque-token>`
- Success: `{ data, meta? }`
- Errors: RFC 7807 Problem Details
- Idempotency: mutating guest/kiosk endpoints accept `Idempotency-Key` (24h TTL)

Each route's Zod schema lives in `packages/shared/src/schemas/` and is imported by the Fastify handler.
