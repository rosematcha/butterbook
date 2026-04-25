'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { captureException } from '../../lib/sentry';

export default function JoinError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { captureException(error); }, [error]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <div className="mx-auto max-w-md">
        <span className="inline-block h-2.5 w-2.5 rounded-full bg-brand-accent" aria-hidden />
        <h1 className="mt-4 font-display text-2xl font-medium tracking-tight-er text-ink">
          Something went wrong
        </h1>
        <p className="mt-2 text-sm text-paper-600">
          We couldn&apos;t load the membership page. Please try again or contact the organization directly.
        </p>
        <div className="mt-6 flex items-center justify-center gap-3">
          <button onClick={reset} className="btn-accent">Try again</button>
          <Link href="/" className="btn-secondary">Home</Link>
        </div>
      </div>
    </main>
  );
}
