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
    default: 'Reeg: GitHub for AI agents',
    template: '%s · Reeg',
  },
  description:
    "Snapshot an AI agent's whole environment, prove exactly what it did, then share, fork, or restore it anywhere. The version-control and proof layer for AI agents, with a tamper-proof history you own. Built on Sui and Walrus.",
  applicationName: 'Reeg',
  keywords: [
    'AI agents',
    'AI agent provenance',
    'version control for agents',
    'agent environments',
    'verifiable compute',
    'Sui',
    'Walrus',
  ],
  authors: [{ name: 'Reeg' }],
  openGraph: {
    type: 'website',
    url: 'https://reeg.xyz',
    siteName: 'Reeg',
    title: 'Reeg: GitHub for AI agents',
    description:
      'Snapshot, prove, share, and move what your AI agents do. A tamper-proof history you own, built on Sui and Walrus.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Reeg: GitHub for AI agents',
    description:
      'Snapshot, prove, share, and move what your AI agents do. A tamper-proof history you own, built on Sui and Walrus.',
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
