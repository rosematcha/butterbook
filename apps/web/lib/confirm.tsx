'use client';
/**
 * Promise-based confirm dialog. Replaces window.confirm() with a branded modal.
 *
 * Usage:
 *   const confirm = useConfirm();
 *   if (await confirm({ title: 'Delete event?', danger: true })) deleteEvent();
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

export interface ConfirmOptions {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Styles the confirm button as destructive red. */
  danger?: boolean;
}

type Resolver = (result: boolean) => void;

interface Pending extends ConfirmOptions {
  id: string;
  resolve: Resolver;
}

interface ConfirmContextValue {
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
}

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

export function useConfirm(): (opts: ConfirmOptions) => Promise<boolean> {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used inside <ConfirmProvider>');
  return ctx.confirm;
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<Pending[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const confirm = useCallback(
    (opts: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
        setQueue((q) => [...q, { ...opts, id, resolve }]);
      }),
    [],
  );

  const current = queue[0];

  const resolveAndPop = useCallback(
    (result: boolean) => {
      if (!current) return;
      current.resolve(result);
      setQueue((q) => q.slice(1));
    },
    [current],
  );

  useEffect(() => {
    if (!current) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') resolveAndPop(false);
      else if (e.key === 'Enter') resolveAndPop(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [current, resolveAndPop]);

  const value = useMemo(() => ({ confirm }), [confirm]);

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      {mounted && current
        ? createPortal(
            <div
              className="fixed inset-0 z-[70] flex items-center justify-center bg-ink/40 p-6 backdrop-blur-[2px]"
              onClick={() => resolveAndPop(false)}
            >
              <div
                role="dialog"
                aria-modal="true"
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-sm rounded-lg border border-paper-200 bg-white p-5 shadow-[0_12px_32px_rgb(0_0_0/0.18)]"
              >
                <h2 className="font-display text-lg font-medium text-ink">{current.title}</h2>
                {current.description ? (
                  <p className="mt-2 text-sm text-paper-600">{current.description}</p>
                ) : null}
                <div className="mt-5 flex justify-end gap-2">
                  <button className="btn-secondary" onClick={() => resolveAndPop(false)} autoFocus>
                    {current.cancelLabel ?? 'Cancel'}
                  </button>
                  <button
                    className={current.danger ? 'btn-danger' : 'btn'}
                    onClick={() => resolveAndPop(true)}
                  >
                    {current.confirmLabel ?? 'Confirm'}
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </ConfirmContext.Provider>
  );
}
