'use client';
import { keepPreviousData, QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import { useState, type ReactNode } from 'react';
import { ToastProvider } from '../lib/toast';
import { ConfirmProvider } from '../lib/confirm';

// In-memory stub for SSR — the persister API is called with it, it no-ops,
// and the real window.localStorage takes over on the client. Keeping the
// provider tree identical between server and client avoids hydration flicker.
const noopStorage: Storage = {
  length: 0,
  clear: () => {},
  getItem: () => null,
  key: () => null,
  removeItem: () => {},
  setItem: () => {},
};

// Keys we never want to restore from localStorage:
//   • 'me'   — auth state must always come from the server on boot.
//   • 'auth' — session/identity routes.
// Restoring these would briefly expose a previous user's identity if a
// different person logs in on the same device, or show stale memberships.
function shouldPersist(queryKey: readonly unknown[]): boolean {
  return !queryKey.some((p) => p === 'me' || p === 'auth');
}

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: 1,
            staleTime: 2 * 60_000,
            gcTime: 30 * 60_000,
            refetchOnMount: false,
            refetchOnWindowFocus: false,
            refetchOnReconnect: 'always',
            placeholderData: keepPreviousData,
          },
        },
      }),
  );

  const [persister] = useState(() =>
    createSyncStoragePersister({
      storage: typeof window === 'undefined' ? noopStorage : window.localStorage,
      key: 'butterbook.qc',
    }),
  );

  return (
    <PersistQueryClientProvider
      client={client}
      persistOptions={{
        persister,
        maxAge: 24 * 60 * 60_000,
        dehydrateOptions: {
          shouldDehydrateQuery: (q) => q.state.status === 'success' && shouldPersist(q.queryKey),
        },
      }}
    >
      <ToastProvider>
        <ConfirmProvider>{children}</ConfirmProvider>
      </ToastProvider>
    </PersistQueryClientProvider>
  );
}
