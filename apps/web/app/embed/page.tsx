'use client';
import { Suspense } from 'react';
import { IntakeInner } from '../intake/IntakeInner';

export default function EmbedPage() {
  return (
    <Suspense fallback={<main className="p-6 text-center text-slate-500">Loading…</main>}>
      <IntakeInner embed />
    </Suspense>
  );
}
