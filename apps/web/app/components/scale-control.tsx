'use client';
import { useEffect, useRef, useState } from 'react';
import { ZOOM_DEFAULT, ZOOM_STEPS } from '../../lib/use-today-zoom';

function formatZoom(v: number): string {
  const s = (Math.round(v * 100) / 100).toString();
  return `${s}×`;
}

export function ScaleControl({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

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

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="input w-auto text-left font-display tabular-nums"
        aria-label="Scale"
        aria-expanded={open}
      >
        {formatZoom(value)}
      </button>
      {open ? (
        <div className="absolute right-0 top-full z-30 mt-1 rounded-md border border-paper-200 bg-white p-3 shadow-sm">
          <div className="mb-2 flex items-center justify-between gap-6">
            <span className="h-eyebrow">Scale</span>
            {value !== ZOOM_DEFAULT ? (
              <button
                type="button"
                className="text-xs text-paper-500 hover:text-ink"
                onClick={() => onChange(ZOOM_DEFAULT)}
              >
                Reset
              </button>
            ) : null}
          </div>
          <div
            role="group"
            aria-label="Scale"
            className="inline-flex items-center gap-0.5 rounded-md border border-paper-200 bg-paper-50 p-0.5"
          >
            {ZOOM_STEPS.map((step) => {
              const active = step === value;
              return (
                <button
                  key={step}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onChange(step)}
                  className={[
                    'rounded px-2.5 py-1 text-sm tabular-nums transition',
                    active
                      ? 'bg-brand-primary text-brand-on-primary shadow-[0_1px_0_rgb(0_0_0/0.08)]'
                      : 'text-paper-600 hover:bg-white hover:text-ink',
                  ].join(' ')}
                >
                  {step}×
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-[11px] text-paper-500">
            Applies to the Today timeline on this device only.
          </p>
        </div>
      ) : null}
    </div>
  );
}
