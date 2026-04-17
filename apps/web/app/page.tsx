import Link from 'next/link';

export default function Home() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">Museum Scheduler</h1>
      <p className="mt-4 text-slate-600">
        Reservation management for art museums. Sign in to manage your org.
      </p>
      <div className="mt-8 flex gap-3">
        <Link
          href="/login"
          className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          Sign in
        </Link>
        <Link
          href="/register"
          className="rounded border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900 hover:bg-slate-100"
        >
          Create an account
        </Link>
      </div>
    </main>
  );
}
