'use client';
import { useEffect } from 'react';
import type { StepProps } from '../types';
import { deriveSlug, isValidSlug, useSlugCheck } from '../use-slug-check';

export function StepName({ state, patch }: StepProps) {
  // Auto-derive slug from name until the user manually edits the slug.
  useEffect(() => {
    if (state.slugTouched) return;
    const derived = deriveSlug(state.name);
    if (derived !== state.slug) patch({ slug: derived });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.name, state.slugTouched]);

  const check = useSlugCheck(state.slug, state.slug.length > 0);

  return (
    <div className="grid gap-5">
      <label className="block">
        <span className="text-sm font-medium text-ink">Organization name</span>
        <input
          className="input mt-1.5"
          value={state.name}
          onChange={(e) => patch({ name: e.target.value })}
          placeholder="e.g. The Whitman"
          autoFocus
          required
        />
        <span className="mt-1 block text-xs text-paper-500">
          What visitors see on your booking page.
        </span>
      </label>

      <label className="block">
        <span className="text-sm font-medium text-ink">Short URL (slug)</span>
        <div className="mt-1.5 flex items-center gap-2">
          <span id="slug-prefix" className="select-none text-sm text-paper-500">butterbook.app/</span>
          <input
            className="input font-mono"
            value={state.slug}
            onChange={(e) => patch({ slug: e.target.value.toLowerCase(), slugTouched: true })}
            placeholder="the-whitman"
            aria-describedby="slug-prefix"
          />
        </div>
        <div className="mt-2 min-h-[22px] text-xs">
          <SlugStatus status={check.status} suggestion={check.suggestion} onUse={(s) => patch({ slug: s })} />
        </div>
      </label>
    </div>
  );
}

export function stepNameCanContinue(state: { name: string; slug: string }): boolean {
  if (!state.name.trim()) return false;
  if (!isValidSlug(state.slug)) return false;
  return true;
}

function SlugStatus({
  status,
  suggestion,
  onUse,
}: {
  status: 'idle' | 'checking' | 'available' | 'taken' | 'invalid';
  suggestion?: string;
  onUse: (s: string) => void;
}) {
  if (status === 'idle') return <span className="text-paper-500">Letters, numbers, and dashes. Used in your booking URL.</span>;
  if (status === 'invalid') return <span className="text-red-700">Slug must be lowercase letters, numbers, or dashes.</span>;
  if (status === 'checking') return <span className="text-paper-500">Checking availability…</span>;
  if (status === 'available') return <span className="badge-accent">Available</span>;
  return (
    <span className="text-red-700">
      Already taken.
      {suggestion ? (
        <>
          {' '}Try{' '}
          <button
            type="button"
            className="font-mono text-ink underline underline-offset-2"
            onClick={() => onUse(suggestion)}
          >
            {suggestion}
          </button>
          ?
        </>
      ) : null}
    </span>
  );
}
