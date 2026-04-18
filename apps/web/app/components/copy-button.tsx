'use client';
import { useState } from 'react';

/**
 * Small "Copy" button with a 1.5s "Copied" confirmation state. Falls back to
 * a text-selection range when the Clipboard API isn't available (e.g. HTTP in dev).
 */
export function CopyButton({
  value,
  label = 'Copy',
  copiedLabel = 'Copied',
  className = 'btn-ghost text-xs',
}: {
  value: string;
  label?: string;
  copiedLabel?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  async function onClick() {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(value);
      } else {
        const ta = document.createElement('textarea');
        ta.value = value;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // swallow — user can still select the text manually
    }
  }
  return (
    <button type="button" onClick={onClick} className={className}>
      {copied ? copiedLabel : label}
    </button>
  );
}
