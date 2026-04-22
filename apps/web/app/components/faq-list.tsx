// Marketing-style FAQ accordion. The styling mirrors MkFAQ on the homepage
// so /, /demo, /pricing, /about all render FAQs identically without a design
// drift between them. Use inside a `<section>` + `<h2>` of your choosing —
// this component renders only the list of `<details>` entries.

import type { ReactNode } from 'react';

export interface FAQItem {
  q: string;
  a: ReactNode;
}

export function FAQList({
  items,
  /** Adds a closing border below the last item, for pages that want the list visually "capped." */
  closing = false,
}: {
  items: FAQItem[];
  closing?: boolean;
}) {
  return (
    <div>
      {items.map(({ q, a }) => (
        <details key={q} className="group border-t border-paper-200 py-[22px]">
          <summary className="flex cursor-pointer list-none items-baseline justify-between gap-6 font-display text-xl tracking-tight-er">
            {q}
            <span className="text-2xl leading-none text-paper-500 transition-transform group-open:rotate-45">
              +
            </span>
          </summary>
          <p className="mt-3.5 max-w-[60ch] text-base leading-relaxed text-paper-600">{a}</p>
        </details>
      ))}
      {closing ? <div className="border-t border-paper-200" /> : null}
    </div>
  );
}
