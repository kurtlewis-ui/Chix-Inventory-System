import type { Metadata } from 'next';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import './globals.css';
import { Providers } from './providers';

// Geist Sans for the UI, Geist Mono for numeric/tabular data (prices, stock
// counts, totals). Loaded via the official `geist` package (which works on
// Next 14 — Geist isn't in next/font/google on this version). The fonts are
// self-hosted with no layout shift. Both objects expose a `.variable` CSS
// class, wired into Tailwind (font-sans / font-mono) and globals.css.

export const metadata: Metadata = {
  title: 'CHX Inventory System',
  description: 'Inventory and sales management dashboard',
  icons: {
    icon: '/logo.svg',
    apple: '/logo.svg',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
