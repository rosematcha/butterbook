'use client';
import { useEffect, useState } from 'react';

/**
 * Renders a timestamp as "relative" text (e.g. "3m ago", "yesterday"), with
 * the full local datetime as a tooltip on hover. The ISO string is also
 * available in `title` so ops staff can copy exact moments from the audit log.
 *
 * Rerenders every 30s so "just now" / "3m ago" stays honest.
 */
export function Timestamp({
  value,
  absolute = false,
  className,
}: {
  value: string | Date;
  /** Skip the relative form and show the locale datetime. */
  absolute?: boolean;
  className?: string;
}) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (absolute) return;
    const h = setInterval(() => setTick((x) => x + 1), 30_000);
    return () => clearInterval(h);
  }, [absolute]);

  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) {
    return <span className={className}>—</span>;
  }
  const full = d.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
  const label = absolute ? full : relative(d);
  return (
    <time dateTime={d.toISOString()} title={full} className={className}>
      {label}
    </time>
  );
}

function relative(d: Date): string {
  const now = Date.now();
  const delta = d.getTime() - now;
  const abs = Math.abs(delta);
  const past = delta < 0;

  const MIN = 60_000;
  const HOUR = 60 * MIN;
  const DAY = 24 * HOUR;

  if (abs < 45 * 1000) return 'just now';
  if (abs < HOUR) {
    const m = Math.round(abs / MIN);
    return past ? `${m}m ago` : `in ${m}m`;
  }
  if (abs < DAY) {
    const h = Math.round(abs / HOUR);
    return past ? `${h}h ago` : `in ${h}h`;
  }
  if (abs < 7 * DAY) {
    const days = Math.round(abs / DAY);
    if (days === 1) return past ? 'yesterday' : 'tomorrow';
    return past ? `${days}d ago` : `in ${days}d`;
  }
  // Older than a week — just show the date.
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}
