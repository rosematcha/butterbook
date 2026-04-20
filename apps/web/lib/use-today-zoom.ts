'use client';
import { useCallback, useSyncExternalStore } from 'react';

const KEY = 'butterbook.todayViewZoom';
const MIN = 0.25;
const MAX = 4;
const DEFAULT = 1;

export const ZOOM_MIN = MIN;
export const ZOOM_MAX = MAX;

export function clampZoom(v: number): number {
  if (!Number.isFinite(v)) return DEFAULT;
  const clamped = Math.min(MAX, Math.max(MIN, v));
  return Math.round(clamped * 100) / 100;
}

function readStore(): number {
  if (typeof window === 'undefined') return DEFAULT;
  const raw = window.localStorage.getItem(KEY);
  if (!raw) return DEFAULT;
  const n = parseFloat(raw);
  if (!Number.isFinite(n)) return DEFAULT;
  return clampZoom(n);
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
  const zoom = useSyncExternalStore(subscribe, readStore, () => DEFAULT);

  const setZoom = useCallback((v: number) => {
    const next = clampZoom(v);
    window.localStorage.setItem(KEY, String(next));
    listeners.forEach((l) => l());
  }, []);

  return [zoom, setZoom];
}
