'use client';
import { keepPreviousData, QueryClient } from '@tanstack/react-query';
import { QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { ToastProvider } from '../lib/toast';
import { ConfirmProvider } from '../lib/confirm';

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

  useEffect(() => {
    // Clear the legacy persisted TanStack cache so old tenant data does not
    // linger on shared browsers after we stop persisting org responses.
    try {
      window.localStorage.removeItem('butterbook.qc');
    } catch {
      /* ignore */
    }
  }, []);

  return (
    <QueryClientProvider client={client}>
      <ToastProvider>
        <ConfirmProvider>{children}</ConfirmProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
}
