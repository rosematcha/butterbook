'use client';

import { useEffect } from 'react';
import { captureException } from '../../lib/sentry';

export default function KioskError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { captureException(error); }, [error]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-paper-50 px-6 text-center">
      <div className="mx-auto max-w-sm">
        <div className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-red-50">
          <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="text-red-600" aria-hidden="true">
            <circle cx={12} cy={12} r={10} />
            <line x1={12} y1={8} x2={12} y2={12} />
            <line x1={12} y1={16} x2={12.01} y2={16} />
          </svg>
        </div>
        <h1 className="mt-5 font-display text-xl font-medium tracking-tight-er text-ink">
          Check-in unavailable
        </h1>
        <p className="mt-2 text-sm text-paper-600">
          Something went wrong loading the check-in form. Tap below to try again.
        </p>
        <button
          onClick={reset}
          className="mt-6 w-full rounded-lg bg-brand-accent px-6 py-4 text-base font-medium text-brand-on-accent shadow-[0_1px_0_rgb(0_0_0/0.08)] transition active:scale-[0.98]"
        >
          Tap to retry
        </button>
      </div>
    </main>
  );
}
