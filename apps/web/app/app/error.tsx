'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { captureException } from '../../lib/sentry';

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { captureException(error); }, [error]);

  return (
    <div className="mx-auto max-w-lg py-16 text-center">
      <div className="panel p-8">
        <h1 className="font-display text-xl font-medium tracking-tight-er text-ink">
          Something went wrong
        </h1>
        <p className="mt-2 text-sm text-paper-600">
          This page ran into an error. You can try again, or go back to the dashboard.
        </p>
        <div className="mt-6 flex items-center justify-center gap-3">
          <button onClick={reset} className="btn-accent">Try again</button>
          <Link href="/app" className="btn-secondary">Dashboard</Link>
        </div>
      </div>
    </div>
  );
}
