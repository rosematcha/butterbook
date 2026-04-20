'use client';
import { useCallback, useSyncExternalStore } from 'react';

const KEY = 'butterbook.todayViewZoom';

export const ZOOM_STEPS = [0.75, 1, 1.5, 2, 3] as const;
export const ZOOM_DEFAULT = 1;

export function snapZoom(v: number): number {
  if (!Number.isFinite(v)) return ZOOM_DEFAULT;
  let best = ZOOM_STEPS[0] as number;
  let bestDelta = Math.abs(v - best);
  for (const s of ZOOM_STEPS) {
    const d = Math.abs(v - s);
    if (d < bestDelta) {
      best = s;
      bestDelta = d;
    }
  }
  return best;
}

function readStore(): number {
  if (typeof window === 'undefined') return ZOOM_DEFAULT;
  const raw = window.localStorage.getItem(KEY);
  if (!raw) return ZOOM_DEFAULT;
  const n = parseFloat(raw);
  if (!Number.isFinite(n)) return ZOOM_DEFAULT;
  return snapZoom(n);
}

// Lightweight pub/sub so same-tab writes trigger re-renders (the `storage`
// event only fires in *other* tabs).
const listeners = new Set<() => void>();
function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => { if (e.key === KEY) cb(); };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener('storage', onStorage);
  };
}

export function useTodayZoom(): [number, (v: number) => void] {
  const zoom = useSyncExternalStore(subscribe, readStore, () => ZOOM_DEFAULT);

  const setZoom = useCallback((v: number) => {
    const next = snapZoom(v);
    window.localStorage.setItem(KEY, String(next));
    listeners.forEach((l) => l());
  }, []);

  return [zoom, setZoom];
}
