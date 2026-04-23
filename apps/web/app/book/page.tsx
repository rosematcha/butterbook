'use client';
import { Suspense } from 'react';
import { BookInner } from './BookInner';

export default function BookPage() {
  return (
    <Suspense fallback={<main className="flex min-h-screen items-center justify-center p-8 text-paper-500">Loading…</main>}>
      <BookInner />
    </Suspense>
  );
}
