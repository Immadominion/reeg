import { ConnectButton } from '@mysten/dapp-kit';
import { Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';
import { NETWORK } from '../lib/config';
import { navigate } from '../lib/router';
import { useTheme } from '../lib/theme';
import { Container } from './ui/Container';
import { Logo } from './ui/Logo';

/** The product's top bar: the Reeg mark, the live network, a theme toggle, and wallet connect.
 *  Transparent while at the top of the page, it solidifies into a glass bar on scroll — the same
 *  behaviour as the marketing Nav, so the app and the site feel like one product. */
export function Header() {
  const { theme, toggle } = useTheme();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={
        'sticky top-0 z-50 transition-colors duration-200 ' +
        (scrolled
          ? 'border-b border-border bg-background/80 backdrop-blur-md'
          : 'border-b border-transparent')
      }
    >
      <Container className="flex h-16 items-center justify-between gap-4">
        <button
          type="button"
          onClick={() => navigate('/')}
          className="rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Reeg home"
        >
          <Logo />
        </button>

        <div className="flex items-center gap-2 sm:gap-3">
          <span
            className="hidden items-center gap-1.5 text-xs font-medium capitalize text-muted-foreground sm:inline-flex"
            title={`Connected to Sui ${NETWORK}`}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-verified" aria-hidden="true" />
            {NETWORK}
          </span>
          <button
            type="button"
            onClick={toggle}
            aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            className="grid h-10 w-10 place-items-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          {/* dapp-kit's ConnectButton is a stock component with its own styles; normalise its radius
              to our control radius (see .reeg-connect in index.css). It is already 40px tall. */}
          <span className="reeg-connect">
            <ConnectButton />
          </span>
        </div>
      </Container>
    </header>
  );
}
