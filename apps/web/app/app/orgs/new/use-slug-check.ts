'use client';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../../../../lib/api';

export interface SlugCheckResult {
  available: boolean;
  suggestion?: string;
  reason?: 'invalid';
}

// Server-side slugSchema: lowercase, a-z0-9-, 1-80 chars. Keep in sync with
// packages/shared/src/schemas/primitives.ts.
const SLUG_REGEX = /^[a-z0-9][a-z0-9-]{0,79}$/;

export function isValidSlug(s: string): boolean {
  return SLUG_REGEX.test(s);
}

// Derives a slug from a name using the same transformation the server uses
// in `generateSlug()` at apps/api/src/routes/orgs.ts.
export function deriveSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

// Debounces the raw slug input before firing the network check.
export function useSlugCheck(slug: string, enabled: boolean): {
  status: 'idle' | 'checking' | 'available' | 'taken' | 'invalid';
  suggestion?: string;
} {
  const [debounced, setDebounced] = useState(slug);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(slug), 400);
    return () => clearTimeout(t);
  }, [slug]);

  const valid = isValidSlug(debounced);
  const q = useQuery({
    queryKey: ['slug-check', debounced],
    queryFn: () => apiGet<{ data: SlugCheckResult }>(`/api/v1/orgs/slug-check?slug=${encodeURIComponent(debounced)}`),
    enabled: enabled && valid && debounced.length > 0,
    staleTime: 10_000,
    retry: false,
  });

  if (!enabled || debounced.length === 0) return { status: 'idle' };
  if (!valid) return { status: 'invalid' };
  if (q.isLoading || q.isFetching) return { status: 'checking' };
  if (q.data?.data.available) return { status: 'available' };
  if (q.data && !q.data.data.available) {
    return { status: 'taken', ...(q.data.data.suggestion ? { suggestion: q.data.data.suggestion } : {}) };
  }
  return { status: 'idle' };
}
