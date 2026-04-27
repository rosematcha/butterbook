'use client';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { API_BASE_URL } from '../../lib/env';

interface UnsubData {
  email: string;
  orgName: string;
  alreadySuppressed: boolean;
}

type State =
  | { step: 'loading' }
  | { step: 'confirm'; data: UnsubData }
  | { step: 'done'; orgName: string }
  | { step: 'resubscribed' }
  | { step: 'already'; data: UnsubData }
  | { step: 'error'; message: string };

function UnsubscribeInner() {
  const params = useSearchParams();
  const token = params.get('token');
  const [state, setState] = useState<State>({ step: 'loading' });

  useEffect(() => {
    if (!token) {
      setState({ step: 'error', message: 'Missing unsubscribe token.' });
      return;
    }
    fetch(`${API_BASE_URL}/api/v1/notifications/unsubscribe?token=${encodeURIComponent(token)}`)
      .then(async (r) => {
        if (!r.ok) throw new Error('Invalid or expired link.');
        return r.json() as Promise<UnsubData>;
      })
      .then((data) => {
        if (data.alreadySuppressed) setState({ step: 'already', data });
        else setState({ step: 'confirm', data });
      })
      .catch((e) => setState({ step: 'error', message: e.message }));
  }, [token]);

  async function handleUnsubscribe() {
    if (!token) return;
    setState({ step: 'loading' });
    try {
      const r = await fetch(
        `${API_BASE_URL}/api/v1/notifications/unsubscribe?token=${encodeURIComponent(token)}`,
        { method: 'POST' },
      );
      if (!r.ok) throw new Error('Failed to unsubscribe.');
      const body = await r.json();
      setState({ step: 'done', orgName: body.orgName });
    } catch (e: any) {
      setState({ step: 'error', message: e.message });
    }
  }

  async function handleResubscribe() {
    if (!token) return;
    setState({ step: 'loading' });
    try {
      const r = await fetch(
        `${API_BASE_URL}/api/v1/notifications/resubscribe?token=${encodeURIComponent(token)}`,
        { method: 'POST' },
      );
      if (!r.ok) throw new Error('Failed to resubscribe.');
      setState({ step: 'resubscribed' });
    } catch (e: any) {
      setState({ step: 'error', message: e.message });
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 max-w-md w-full p-8 text-center">
        {state.step === 'loading' && (
          <p className="text-gray-500">Loading...</p>
        )}

        {state.step === 'confirm' && (
          <>
            <h1 className="text-xl font-semibold text-gray-900 mb-2">Unsubscribe</h1>
            <p className="text-gray-600 mb-6">
              Stop receiving emails from <strong>{state.data.orgName}</strong> at{' '}
              <strong>{state.data.email}</strong>?
            </p>
            <button
              onClick={handleUnsubscribe}
              className="w-full rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 transition-colors"
            >
              Unsubscribe
            </button>
          </>
        )}

        {state.step === 'done' && (
          <>
            <h1 className="text-xl font-semibold text-gray-900 mb-2">Unsubscribed</h1>
            <p className="text-gray-600 mb-6">
              You will no longer receive emails from <strong>{state.orgName}</strong>.
            </p>
            <button
              onClick={handleResubscribe}
              className="text-sm text-blue-600 hover:text-blue-800 underline"
            >
              Changed your mind? Resubscribe
            </button>
          </>
        )}

        {state.step === 'already' && (
          <>
            <h1 className="text-xl font-semibold text-gray-900 mb-2">Already unsubscribed</h1>
            <p className="text-gray-600 mb-6">
              You are already unsubscribed from emails by <strong>{state.data.orgName}</strong>.
            </p>
            <button
              onClick={handleResubscribe}
              className="text-sm text-blue-600 hover:text-blue-800 underline"
            >
              Resubscribe
            </button>
          </>
        )}

        {state.step === 'resubscribed' && (
          <>
            <h1 className="text-xl font-semibold text-gray-900 mb-2">Resubscribed</h1>
            <p className="text-gray-600">You will receive emails again.</p>
          </>
        )}

        {state.step === 'error' && (
          <>
            <h1 className="text-xl font-semibold text-gray-900 mb-2">Something went wrong</h1>
            <p className="text-gray-600">{state.message}</p>
          </>
        )}
      </div>
    </div>
  );
}

export default function UnsubscribePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50 flex items-center justify-center"><p className="text-gray-500">Loading...</p></div>}>
      <UnsubscribeInner />
    </Suspense>
  );
}
