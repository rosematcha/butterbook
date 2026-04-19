'use client';
import { useEffect, useRef, useState } from 'react';
import { useActiveDays } from '../../lib/active-days';
import { useSession } from '../../lib/session';

function pad(n: number): string { return n.toString().padStart(2, '0'); }
function toKey(d: Date): string { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function sameKey(a: Date, b: Date): boolean { return toKey(a) === toKey(b); }

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

export function MonthPicker({
  value,
  onChange,
}: {
  value: Date;
  onChange: (d: Date) => void;
}) {
  const { activeOrgId } = useSession();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<{ y: number; m: number }>(() => ({ y: value.getFullYear(), m: value.getMonth() + 1 }));
  const wrapRef = useRef<HTMLDivElement>(null);

  const active = useActiveDays(activeOrgId, view.y, view.m);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  // Build 6x7 grid
  const firstOfMonth = new Date(view.y, view.m - 1, 1);
  const gridStart = new Date(firstOfMonth);
  gridStart.setDate(1 - firstOfMonth.getDay()); // back up to the Sunday
  const cells: Date[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    cells.push(d);
  }

  const today = new Date();
  const monthLabel = firstOfMonth.toLocaleDateString([], { month: 'long', year: 'numeric' });
  const shiftMonth = (delta: number) => {
    const d = new Date(view.y, view.m - 1 + delta, 1);
    setView({ y: d.getFullYear(), m: d.getMonth() + 1 });
  };

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => { setView({ y: value.getFullYear(), m: value.getMonth() + 1 }); setOpen((o) => !o); }}
        className="input w-auto text-left font-display tabular-nums"
      >
        {value.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
      </button>

      {open ? (
        <div className="absolute right-0 top-full z-30 mt-1 w-[288px] rounded-md border border-paper-200 bg-white p-3 shadow-sm">
          <div className="mb-2 flex items-center justify-between">
            <button onClick={() => shiftMonth(-1)} className="px-2 py-1 text-paper-500 hover:text-ink" aria-label="Previous month">‹</button>
            <div className="font-display text-sm tracking-tight-er">{monthLabel}</div>
            <button onClick={() => shiftMonth(1)} className="px-2 py-1 text-paper-500 hover:text-ink" aria-label="Next month">›</button>
          </div>

          <div className="grid grid-cols-7 gap-0.5 text-center">
            {WEEKDAYS.map((w) => (
              <div key={w} className="py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-paper-400">{w}</div>
            ))}
            {cells.map((d) => {
              const key = toKey(d);
              const inMonth = d.getMonth() + 1 === view.m;
              const isActive = active.isOpen(key);
              const reason = active.reasonFor(key);
              const isToday = sameKey(d, today);
              const isSelected = sameKey(d, value);
              const disabled = !isActive;
              return (
                <button
                  key={key}
                  disabled={disabled}
                  onClick={() => { onChange(new Date(d.getFullYear(), d.getMonth(), d.getDate())); setOpen(false); }}
                  className={[
                    'relative h-9 rounded text-sm tabular-nums transition',
                    !inMonth ? 'text-paper-300' : '',
                    disabled ? 'cursor-not-allowed text-paper-300' : isSelected ? '' : 'hover:bg-paper-100 text-ink',
                    isSelected && !disabled ? 'bg-brand-primary text-brand-on-primary hover:bg-brand-primary' : '',
                    isToday && !isSelected ? 'ring-1 ring-inset ring-brand-accent' : '',
                  ].join(' ')}
                  title={disabled ? 'Closed' : reason === 'event' ? 'Event' : reason === 'both' ? 'Open · event' : 'Open'}
                >
                  {d.getDate()}
                  {reason === 'event' || reason === 'both' ? (
                    <span className={`absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full ${isSelected ? 'bg-brand-on-primary' : 'bg-brand-accent'}`} />
                  ) : null}
                </button>
              );
            })}
          </div>

          <div className="mt-3 flex items-center justify-between text-[11px] text-paper-500">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-brand-accent" /> Event
            </span>
            <button onClick={() => { onChange(new Date()); setOpen(false); }} className="text-paper-600 hover:text-ink">Today</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
