'use client';
import { Suspense, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import { API_BASE_URL, IS_DEMO, MARKETING_URL } from '../../lib/env';
import { intervalLabel, money, type MembershipTier } from '../app/memberships/types';

interface JoinData {
  org: {
    id: string;
    slug: string;
    name: string;
    logoUrl: string | null;
    theme: unknown;
  };
  tiers: MembershipTier[];
}

async function publicJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: { Accept: 'application/json', ...(init?.headers ?? {}) },
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) as unknown : {};
  if (!res.ok) {
    const problem = body as { detail?: string; title?: string };
    throw new Error(problem.detail ?? problem.title ?? 'Request failed.');
  }
  return body as T;
}

function JoinInner() {
  const search = useSearchParams();
  const orgSlug = search.get('org') ?? '';
  const checkoutState = search.get('checkout');
  const [data, setData] = useState<JoinData | null>(null);
  const [selectedTierId, setSelectedTierId] = useState<string | null>(null);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [promoCode, setPromoCode] = useState('');
  const [appliedPromo, setAppliedPromo] = useState<{ code: string; discountCents: number; finalAmountCents: number } | null>(null);
  const [checkingPromo, setCheckingPromo] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (IS_DEMO) {
      window.location.replace(MARKETING_URL);
      return;
    }
    if (!orgSlug) {
      setError('This membership link is incomplete.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    publicJson<{ data: JoinData }>(`/api/v1/public/orgs/${encodeURIComponent(orgSlug)}/membership-tiers`)
      .then((body) => {
        setData(body.data);
        setSelectedTierId(body.data.tiers[0]?.id ?? null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Memberships are not available.'))
      .finally(() => setLoading(false));
  }, [orgSlug]);

  const selectedTier = useMemo(
    () => data?.tiers.find((tier) => tier.id === selectedTierId) ?? null,
    [data?.tiers, selectedTierId],
  );

  useEffect(() => {
    setAppliedPromo(null);
  }, [selectedTierId]);

  async function validatePromo() {
    if (!orgSlug || !selectedTier || !promoCode.trim()) return;
    setCheckingPromo(true);
    setError(null);
    try {
      const body = await publicJson<{ data: { code: string; discountCents: number; finalAmountCents: number } }>(
        `/api/v1/public/orgs/${encodeURIComponent(orgSlug)}/membership-promo-codes/validate`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tierId: selectedTier.id, code: promoCode.trim() }),
        },
      );
      setAppliedPromo(body.data);
      setPromoCode(body.data.code);
    } catch (err) {
      setAppliedPromo(null);
      setError(err instanceof Error ? err.message : 'Promo code could not be applied.');
    } finally {
      setCheckingPromo(false);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!orgSlug || !selectedTier) return;
    setSubmitting(true);
    setError(null);
    try {
      const origin = window.location.origin;
      const body = await publicJson<{ data: { url: string } }>(
        `/api/v1/public/orgs/${encodeURIComponent(orgSlug)}/memberships/checkout`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tierId: selectedTier.id,
            firstName: firstName.trim() || undefined,
            lastName: lastName.trim() || undefined,
            email: email.trim(),
            phone: phone.trim() || undefined,
            promoCode: appliedPromo?.code,
            successUrl: `${origin}/join?org=${encodeURIComponent(orgSlug)}&checkout=success`,
            cancelUrl: `${origin}/join?org=${encodeURIComponent(orgSlug)}&checkout=cancelled`,
          }),
        },
      );
      window.location.href = body.data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Checkout could not start.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <main className="flex min-h-screen items-center justify-center p-8 text-paper-500">Loading memberships...</main>;
  }

  if (error && !data) {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center px-6 text-center">
        <div className="text-lg text-red-700">{error}</div>
        <p className="mt-2 text-sm text-paper-500">Please check the link or contact the organization directly.</p>
      </main>
    );
  }

  if (!data) return null;

  return (
    <main className="min-h-screen bg-paper-100">
      <section className="border-b border-paper-200 bg-white">
        <div className="mx-auto grid max-w-6xl gap-8 px-6 py-10 md:grid-cols-[1fr_360px] md:px-10">
          <div>
            <div className="flex items-center gap-3">
              {data.org.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={data.org.logoUrl} alt="" className="h-10 w-10 rounded-md object-cover" />
              ) : (
                <span className="inline-block h-3 w-3 rounded-full bg-brand-accent" aria-hidden />
              )}
              <div>
                <div className="h-eyebrow">Membership</div>
                <h1 className="font-display text-4xl font-normal tracking-tight-er text-ink md:text-5xl">
                  Join {data.org.name}
                </h1>
              </div>
            </div>
            {checkoutState === 'success' ? (
              <div className="mt-6 rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                Checkout is complete. A confirmation email will arrive after payment is processed.
              </div>
            ) : null}
            {checkoutState === 'cancelled' ? (
              <div className="mt-6 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                Checkout was cancelled. Choose a tier below when you are ready.
              </div>
            ) : null}
            {error ? <div className="mt-6 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div> : null}
          </div>

          <form onSubmit={onSubmit} className="panel p-5">
            <div className="h-eyebrow">Your details</div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <label className="block text-sm">
                First name
                <input className="input mt-1" value={firstName} onChange={(e) => setFirstName(e.target.value)} autoComplete="given-name" />
              </label>
              <label className="block text-sm">
                Last name
                <input className="input mt-1" value={lastName} onChange={(e) => setLastName(e.target.value)} autoComplete="family-name" />
              </label>
            </div>
            <label className="mt-3 block text-sm">
              Email
              <input className="input mt-1" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
            </label>
            <label className="mt-3 block text-sm">
              Phone
              <input className="input mt-1" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" />
            </label>
            <div className="mt-3">
              <span className="block text-sm">Promo code</span>
              <div className="mt-1 flex gap-2">
                <input
                  className="input font-mono uppercase"
                  value={promoCode}
                  onChange={(e) => { setPromoCode(e.target.value); setAppliedPromo(null); }}
                  autoComplete="off"
                />
                <button type="button" className="btn-ghost shrink-0" disabled={!promoCode.trim() || !selectedTier || checkingPromo} onClick={validatePromo}>
                  {checkingPromo ? 'Checking...' : 'Apply'}
                </button>
              </div>
              {appliedPromo ? (
                <p className="mt-1 text-xs text-emerald-700">{appliedPromo.code} applied: {money(appliedPromo.discountCents)} off</p>
              ) : null}
            </div>
            <button type="submit" disabled={!selectedTier || submitting} className="btn-accent mt-5 w-full justify-center">
              {submitting ? 'Opening checkout...' : 'Continue to checkout'}
            </button>
            {selectedTier ? (
              <p className="mt-3 text-center text-xs text-paper-500">
                {selectedTier.name} · {money(appliedPromo?.finalAmountCents ?? selectedTier.priceCents)} / {intervalLabel(selectedTier.billingInterval)}
              </p>
            ) : null}
          </form>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-10 md:px-10">
        {data.tiers.length === 0 ? (
          <div className="panel p-8 text-center text-paper-600">No public membership tiers are available.</div>
        ) : (
          <div className="grid gap-4 md:grid-cols-3">
            {data.tiers.map((tier) => {
              const active = tier.id === selectedTierId;
              return (
                <button
                  key={tier.id}
                  type="button"
                  onClick={() => setSelectedTierId(tier.id)}
                  className={`panel min-h-[220px] p-5 text-left transition ${
                    active ? 'border-brand-accent shadow-[0_0_0_1px_var(--brand-accent)]' : 'hover:border-paper-300'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-display text-2xl font-normal tracking-tight-er">{tier.name}</div>
                      <div className="mt-1 text-sm text-paper-500">{tier.description || 'Support the organization for the season ahead.'}</div>
                    </div>
                    <span className={active ? 'badge-accent' : 'badge'}>{active ? 'Selected' : 'Tier'}</span>
                  </div>
                  <div className="mt-8 text-3xl font-semibold tracking-tight">
                    {money(tier.priceCents)}
                    <span className="ml-1 text-sm font-normal text-paper-500">/ {intervalLabel(tier.billingInterval)}</span>
                  </div>
                  <div className="mt-4 space-y-1.5 text-sm text-paper-600">
                    {tier.guestPassesIncluded > 0 ? <div>{tier.guestPassesIncluded} guest passes included</div> : null}
                    {tier.memberOnlyEventAccess ? <div>Member event access</div> : null}
                    {tier.maxActive ? <div>{tier.maxActive} active memberships available</div> : null}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}

export default function JoinPage() {
  return (
    <Suspense fallback={<main className="flex min-h-screen items-center justify-center p-8 text-paper-500">Loading memberships...</main>}>
      <JoinInner />
    </Suspense>
  );
}
