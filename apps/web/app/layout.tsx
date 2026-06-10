import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { clashDisplay, jetbrainsMono, montserrat } from '@/lib/fonts';
import './globals.css';

// Type system (see lib/fonts.ts): Clash Display for headlines (display), Montserrat for body/UI,
// JetBrains Mono for terminal/numeric. The .variable classes expose CSS variables that globals.css
// maps onto the --font-display / --font-sans / --font-mono tokens.
export const metadata: Metadata = {
  metadataBase: new URL('https://reeg.xyz'),
  title: {
    default: 'Reeg — The computer your AI agents live in',
    template: '%s · Reeg',
  },
  description:
    'Reeg gives every AI agent a real computer you own. Spin one up, own it, share it, move it across hosts, and prove exactly what it did. Everything a sandbox does, plus the one thing it cannot: ownership. Built on Sui and Walrus.',
  applicationName: 'Reeg',
  keywords: [
    'AI agents',
    'agent sandbox',
    'agent environments',
    'verifiable compute',
    'Sui',
    'Walrus',
    'AI OS',
  ],
  authors: [{ name: 'Reeg' }],
  openGraph: {
    type: 'website',
    url: 'https://reeg.xyz',
    siteName: 'Reeg',
    title: 'Reeg — The computer your AI agents live in',
    description:
      'Own it, share it, move it, and prove it. The AI operating system you own, built on Walrus.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Reeg — The computer your AI agents live in',
    description:
      'Own it, share it, move it, and prove it. The AI operating system you own, built on Walrus.',
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${clashDisplay.variable} ${montserrat.variable} ${jetbrainsMono.variable}`}
    >
      <body className="antialiased">{children}</body>
    </html>
  );
}
