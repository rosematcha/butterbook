'use client';
import type { ReactNode } from 'react';

/**
 * Humanist empty state. Use on pages where the default is "nothing here yet"
 * so the page doesn't feel broken. Keeps language warm, not apologetic.
 */
export function EmptyState({
  title,
  description,
  action,
  className = '',
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`mt-12 max-w-md ${className}`}>
      <h2 className="font-display text-2xl font-medium tracking-tight-er text-ink">{title}</h2>
      {description ? <p className="mt-2 text-paper-600">{description}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
