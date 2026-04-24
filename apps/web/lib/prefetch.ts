import type { QueryClient } from '@tanstack/react-query';
import { apiGet } from './api';

// Returns a set of prefetchers for the routes in the sidebar, keyed by the
// query keys each page's useQuery uses. Matching keys precisely is the
// whole point — TanStack dedupes on identical keys, so a hover-prefetch
// populates the cache entry the target page will read on mount.
//
// Returns a stable `noop` everywhere when `orgId` is null so callers can
// always wire up the prefetcher without null-checking at every site.
export function makePrefetchers(qc: QueryClient, orgId: string | null) {
  if (!orgId) return EMPTY;

  const prefetch = <T,>(queryKey: readonly unknown[], url: string) =>
    qc.prefetchQuery({
      queryKey,
      queryFn: () => apiGet<T>(url),
    });

  // Today view and /app/visits both land on today's date by default.
  const today = new Date().toISOString().slice(0, 10);
  const from = new Date(`${today}T00:00:00Z`).toISOString();
  const to = new Date(`${today}T23:59:59Z`).toISOString();

  return {
    today: () =>
      Promise.all([
        prefetch(['visits', orgId, today], `/api/v1/orgs/${orgId}/visits?from=${from}&to=${to}&limit=200`),
        prefetch(['form-fields', orgId], `/api/v1/orgs/${orgId}/form`),
      ]),
    visits: () =>
      prefetch(['visits', orgId, today], `/api/v1/orgs/${orgId}/visits?from=${from}&to=${to}&limit=200`),
    events: () =>
      Promise.all([
        prefetch(['events', orgId], `/api/v1/orgs/${orgId}/events`),
        prefetch(['locations', orgId], `/api/v1/orgs/${orgId}/locations`),
      ]),
    contacts: () => prefetch(['contacts', orgId, 'page=1&limit=50'], `/api/v1/orgs/${orgId}/contacts?page=1&limit=50`),
    segments: () => prefetch(['segments', orgId], `/api/v1/orgs/${orgId}/segments`),
    locations: () => prefetch(['locations', orgId], `/api/v1/orgs/${orgId}/locations`),
    form: () => prefetch(['form-fields', orgId], `/api/v1/orgs/${orgId}/form`),
    members: () =>
      Promise.all([
        prefetch(['members', orgId], `/api/v1/orgs/${orgId}/members`),
        prefetch(['roles', orgId], `/api/v1/orgs/${orgId}/roles`),
        prefetch(['invites', orgId], `/api/v1/orgs/${orgId}/invitations`),
      ]),
    roles: () => prefetch(['roles', orgId], `/api/v1/orgs/${orgId}/roles`),
    branding: () => prefetch(['branding', orgId], `/api/v1/orgs/${orgId}/branding`),
    audit: () =>
      prefetch(['audit', orgId, 1], `/api/v1/orgs/${orgId}/audit?page=1&limit=50`),
  };
}

const noop = () => Promise.resolve();
const EMPTY = {
  today: noop,
  visits: noop,
  events: noop,
  contacts: noop,
  segments: noop,
  locations: noop,
  form: noop,
  members: noop,
  roles: noop,
  branding: noop,
  audit: noop,
};
