import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <div className="mx-auto max-w-md">
        <span className="inline-block h-2.5 w-2.5 rounded-full bg-brand-accent" aria-hidden />
        <h1 className="mt-4 font-display text-2xl font-medium tracking-tight-er text-ink">
          Page not found
        </h1>
        <p className="mt-2 text-sm text-paper-600">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <div className="mt-6 flex items-center justify-center gap-3">
          <Link href="/" className="btn-accent">Home</Link>
          <Link href="/app" className="btn-secondary">Dashboard</Link>
        </div>
      </div>
    </main>
  );
}
