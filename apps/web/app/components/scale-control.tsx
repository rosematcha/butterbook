'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { clampZoom, ZOOM_MAX, ZOOM_MIN } from '../../lib/use-today-zoom';

const STOPS = [0.5, 1, 1.5, 2, 3];

function formatZoom(v: number): string {
  const s = (Math.round(v * 100) / 100).toString();
  return `${s}×`;
}

export function ScaleControl({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(String(value));
  const wrapRef = useRef<HTMLDivElement>(null);
  const sliderId = useId();
  const numberId = useId();

  useEffect(() => {
    setText(String(value));
  }, [value]);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function commitText() {
    const n = parseFloat(text);
    if (Number.isFinite(n)) {
      const next = clampZoom(n);
      onChange(next);
      setText(String(next));
    } else {
      setText(String(value));
    }
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="rounded-md border border-paper-200 bg-white px-3 py-1.5 text-sm text-paper-700 hover:text-ink"
        aria-label="Scale"
        aria-expanded={open}
      >
        {formatZoom(value)}
      </button>
      {open ? (
        <div className="absolute right-0 top-full z-30 mt-1 w-64 rounded-md border border-paper-200 bg-white p-3 shadow-lg">
          <div className="mb-2 flex items-center justify-between">
            <label htmlFor={sliderId} className="h-eyebrow">Scale</label>
            <button
              type="button"
              className="text-xs text-paper-500 hover:text-ink"
              onClick={() => onChange(1)}
            >
              Reset
            </button>
          </div>
          <input
            id={sliderId}
            type="range"
            min={ZOOM_MIN}
            max={ZOOM_MAX}
            step={0.05}
            list={`${sliderId}-stops`}
            value={value}
            onChange={(e) => onChange(parseFloat(e.target.value))}
            className="w-full"
          />
          <datalist id={`${sliderId}-stops`}>
            {STOPS.map((s) => (
              <option key={s} value={s} label={`${s}×`} />
            ))}
          </datalist>
          <div className="mt-1 flex justify-between px-0.5 font-mono text-[10px] text-paper-400">
            {STOPS.map((s) => (
              <span key={s}>{s}×</span>
            ))}
          </div>
          <div className="mt-3 flex items-center gap-2">
            <input
              id={numberId}
              type="number"
              min={ZOOM_MIN}
              max={ZOOM_MAX}
              step={0.01}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onBlur={commitText}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  commitText();
                  (e.target as HTMLInputElement).blur();
                }
              }}
              className="input w-24"
              aria-label="Scale (precise)"
            />
            <span className="text-xs text-paper-500">
              {ZOOM_MIN}–{ZOOM_MAX}× · 2 decimals
            </span>
          </div>
          <p className="mt-2 text-[11px] text-paper-500">
            Applies to the Today timeline on this device only.
          </p>
        </div>
      ) : null}
    </div>
  );
}
