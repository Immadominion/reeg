import { JetBrains_Mono, Montserrat } from 'next/font/google';
import localFont from 'next/font/local';

// Display: Clash Display (Fontshare, free for commercial use), self-hosted in /fonts. A distinctive
// geometric/mechanical face in the spirit of Neue Machina. To swap in licensed Neue Machina later,
// drop its woff2 files in /fonts and point this `src` at them — nothing else changes.
export const clashDisplay = localFont({
  src: [
    { path: '../fonts/ClashDisplay-400.woff2', weight: '400', style: 'normal' },
    { path: '../fonts/ClashDisplay-500.woff2', weight: '500', style: 'normal' },
    { path: '../fonts/ClashDisplay-600.woff2', weight: '600', style: 'normal' },
    { path: '../fonts/ClashDisplay-700.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--font-clash-display',
  display: 'swap',
});

// Body + UI: Montserrat (variable). Mono: JetBrains Mono for the terminal/proof panel and timestamps.
export const montserrat = Montserrat({
  subsets: ['latin'],
  variable: '--font-montserrat',
  display: 'swap',
});

export const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
});
