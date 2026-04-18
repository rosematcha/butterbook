'use client';
import { useEffect, type ReactNode } from 'react';

export function Modal({
  open,
  onClose,
  title,
  eyebrow,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  eyebrow?: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-ink/30 p-6 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className={`relative mt-16 w-full ${wide ? 'max-w-3xl' : 'max-w-lg'} rounded-lg border border-paper-200 bg-white`}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="border-b border-paper-200 px-6 pb-4 pt-5">
          {eyebrow ? <div className="h-eyebrow">{eyebrow}</div> : null}
          <h2 className="font-display text-2xl font-medium tracking-tight-er">{title}</h2>
        </header>
        <div className="max-h-[70vh] overflow-y-auto px-6 py-5">{children}</div>
        {footer ? <footer className="flex justify-end gap-2 border-t border-paper-200 px-6 py-3">{footer}</footer> : null}
      </div>
    </div>
  );
}
