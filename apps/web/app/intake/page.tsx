'use client';
import { Suspense } from 'react';
import { IntakeInner } from './IntakeInner';

export default function IntakePage() {
  return (
    <Suspense fallback={<main className="flex min-h-screen items-center justify-center p-8 text-lg text-slate-500">Loading…</main>}>
      <IntakeInner />
    </Suspense>
  );
}
