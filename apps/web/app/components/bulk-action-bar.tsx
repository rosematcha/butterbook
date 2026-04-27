'use client';
import type { ReactNode } from 'react';

export function BulkActionBar({
  count,
  onClear,
  children,
}: {
  count: number;
  onClear: () => void;
  children: ReactNode;
}) {
  if (count === 0) return null;
  return (
    <div className="sticky bottom-4 z-30 mx-auto flex w-fit items-center gap-3 rounded-lg border border-paper-200 bg-white px-4 py-2.5 shadow-lg">
      <span className="text-sm font-medium tabular-nums text-ink">
        {count} selected
      </span>
      <div className="h-4 w-px bg-paper-200" />
      {children}
      <div className="h-4 w-px bg-paper-200" />
      <button type="button" className="btn-ghost text-xs" onClick={onClear}>
        Clear
      </button>
    </div>
  );
}
