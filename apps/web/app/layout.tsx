import type { Metadata } from 'next';
import { Inter, Fraunces, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';
import { IS_DEMO } from '../lib/env';

const inter = Inter({ subsets: ['latin'], variable: '--font-sans', display: 'swap' });
const fraunces = Fraunces({ subsets: ['latin'], variable: '--font-display', display: 'swap', axes: ['opsz', 'SOFT'] });
const jetbrainsMono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono', display: 'swap' });

// On the demo build, flip every page to noindex so Google doesn't pick up the
// thousands of ephemeral orgs a visitor-facing public URL can generate. This
// is in addition to the X-Robots-Tag header the demo API emits.
export const metadata: Metadata = IS_DEMO
  ? {
      title: 'Butterbook · Interactive demo',
      description:
        'A working copy of Butterbook, loaded with fake guests at a fictional museum. Log in as admin, change anything, and come back in twelve hours. The sandbox resets on its own.',
      robots: { index: false, follow: false, nocache: true },
    }
  : {
      title: 'Butterbook · Reservation software for small organizations',
      description:
        "Reservation software for art museums, community studios, and solo practitioners. Bookings, events, payments, and visitor records in one place. Flat-rate pricing.",
    };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${fraunces.variable} ${jetbrainsMono.variable}`}>
      <body className="min-h-screen font-sans text-ink antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
