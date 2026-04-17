# ADR 007 — Fastify for API, Next.js for web (two servers)

**Status:** Accepted.

## Decision

`apps/api` is a standalone Fastify server. `apps/web` is a Next.js app that talks to the API over HTTP using bearer tokens. The web app does not hold DB credentials; the API is the only consumer of Postgres.

## Why not put routes inside Next.js?

- The spec requires a non-browser consumer (WordPress plugin, later) to call the same API. A standalone API is the cleanest path.
- Fastify's request validation, rate-limiting, and observability hooks are more mature than Next.js route handlers for this shape of workload.
- Pushing every `/api/*` through Next.js would make operational concerns (graceful shutdown, pool sizing, CORS) harder to reason about.

## Consequences

- Two processes in production. A front-end proxy or an API gateway routes `/api/*` to Fastify and the rest to Next.js.
- Shared types/schemas live in `packages/shared` and are imported by both.
