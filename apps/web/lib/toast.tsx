'use client';
/**
 * Toast notifications.
 *
 * Usage:
 *   const toast = useToast();
 *   toast.push({ kind: 'success', message: 'Saved' });
 *   toast.push({
 *     kind: 'info',
 *     message: 'Visit cancelled',
 *     action: { label: 'Undo', onClick: () => reverseCancel() },
 *   });
 *
 * `duration: 0` makes a toast sticky (click to dismiss).
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

export type ToastKind = 'success' | 'error' | 'info';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastOptions {
  kind?: ToastKind;
  message: string;
  /** Optional caption line under the message. */
  description?: string;
  action?: ToastAction;
  /** Milliseconds until auto-dismiss. 0 = sticky. Default 4000 (6000 with action). */
  duration?: number;
}

interface Toast extends Required<Pick<ToastOptions, 'message'>> {
  id: string;
  kind: ToastKind;
  description?: string;
  action?: ToastAction;
  duration: number;
}

interface ToastContextValue {
  push: (opts: ToastOptions) => string;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [mounted, setMounted] = useState(false);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    setMounted(true);
    return () => {
      timers.current.forEach(clearTimeout);
      timers.current.clear();
    };
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const t = timers.current.get(id);
    if (t) {
      clearTimeout(t);
      timers.current.delete(id);
    }
  }, []);

  const push = useCallback(
    (opts: ToastOptions) => {
      const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
      const kind: ToastKind = opts.kind ?? 'info';
      const duration = opts.duration ?? (opts.action ? 6000 : 4000);
      const toast: Toast = {
        id,
        kind,
        message: opts.message,
        ...(opts.description !== undefined ? { description: opts.description } : {}),
        ...(opts.action ? { action: opts.action } : {}),
        duration,
      };
      setToasts((prev) => [...prev, toast]);
      if (duration > 0) {
        const h = setTimeout(() => dismiss(id), duration);
        timers.current.set(id, h);
      }
      return id;
    },
    [dismiss],
  );

  const value = useMemo<ToastContextValue>(() => ({ push, dismiss }), [push, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {mounted
        ? createPortal(
            <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(92vw,22rem)] flex-col gap-2">
              {toasts.map((t) => (
                <ToastCard key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
              ))}
            </div>,
            document.body,
          )
        : null}
    </ToastContext.Provider>
  );
}

function ToastCard({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const tone =
    toast.kind === 'success'
      ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
      : toast.kind === 'error'
        ? 'border-red-300 bg-red-50 text-red-900'
        : 'border-paper-300 bg-white text-ink';
  const iconBg =
    toast.kind === 'success' ? 'bg-emerald-500' : toast.kind === 'error' ? 'bg-red-500' : 'bg-brand-accent';
  return (
    <div
      role="status"
      className={`pointer-events-auto flex items-start gap-3 rounded-lg border ${tone} p-3 shadow-[0_6px_24px_rgb(0_0_0/0.08)]`}
    >
      <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${iconBg}`} aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{toast.message}</div>
        {toast.description ? <div className="mt-0.5 text-xs opacity-75">{toast.description}</div> : null}
      </div>
      {toast.action ? (
        <button
          onClick={() => {
            toast.action!.onClick();
            onDismiss();
          }}
          className="shrink-0 rounded border border-current/20 px-2 py-0.5 text-xs font-medium hover:bg-current/5"
        >
          {toast.action.label}
        </button>
      ) : null}
      <button
        onClick={onDismiss}
        aria-label="Dismiss"
        className="shrink-0 rounded px-1 text-sm opacity-50 hover:opacity-100"
      >
        ×
      </button>
    </div>
  );
}
