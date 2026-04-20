'use client';
import Link, { type LinkProps } from 'next/link';
import { useRef, type ReactNode } from 'react';

type Props = LinkProps & {
  children: ReactNode;
  className?: string;
  // Fired the first time the user hovers or tabs to this link. Use it to
  // kick off a `qc.prefetchQuery` for the destination page's main data.
  prefetchData?: () => void;
};

// Drop-in replacement for Next's <Link> that ALSO warms TanStack Query's
// cache on hover/focus. We guard with a ref so a user rapidly hovering a
// nav link doesn't fire the same fetch dozens of times.
export function PrefetchLink({ prefetchData, children, ...props }: Props) {
  const fired = useRef(false);
  const fire = () => {
    if (prefetchData && !fired.current) {
      fired.current = true;
      prefetchData();
    }
  };
  return (
    <Link {...props} onMouseEnter={fire} onFocus={fire}>
      {children}
    </Link>
  );
}
