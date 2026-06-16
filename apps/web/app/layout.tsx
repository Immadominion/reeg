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
    default: 'Reeg: Dropbox for AI agent environments',
    template: '%s · Reeg',
  },
  description:
    "Reeg is infrastructure for portable computing environments. We started with AI agents because they're the fastest-growing source of ephemeral work, but the underlying system can preserve and move any environment. Live on Sui mainnet.",
  applicationName: 'Reeg',
  keywords: [
    'AI agents',
    'AI agent provenance',
    'version control for agents',
    'agent environments',
    'verifiable compute',
    'computing environments',
    'verifiable environments',
    'version control for environments',
    'Sui',
    'Walrus',
  ],
  authors: [{ name: 'Reeg' }],
  openGraph: {
    type: 'website',
    url: 'https://reeg.xyz',
    siteName: 'Reeg',
    title: 'Reeg: Dropbox for AI agent environments',
    description:
      "Reeg is infrastructure for portable computing environments. We started with AI agents because they're the fastest-growing source of ephemeral work, but the underlying system can preserve and move any environment. Live on Sui mainnet.",
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Reeg: Dropbox for AI agent environments',
    description:
      "Reeg is infrastructure for portable computing environments. We started with AI agents because they're the fastest-growing source of ephemeral work, but the underlying system can preserve and move any environment. Live on Sui mainnet.",
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
