import { ConnectButton } from '@mysten/dapp-kit';
import { navigate } from '../lib/router';
import { useTheme } from '../lib/theme';
import { Button } from './ui/Button';

/** The product's top bar: the Reeg wordmark, theme toggle, and wallet connect. Used both by the
 *  live app and inside the preview sandbox's viewport, so a previewed screen looks like the real
 *  app. */
export function Header() {
  const { theme, toggle } = useTheme();
  return (
    <header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur">
      <div className="mx-auto flex w-full max-w-4xl items-center justify-between px-4 py-3 sm:px-6">
        <button
          type="button"
          onClick={() => navigate('/')}
          className="text-lg font-semibold tracking-tight"
        >
          Reeg
        </button>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={toggle} aria-label="Toggle theme">
            {theme === 'dark' ? 'Light' : 'Dark'}
          </Button>
          <ConnectButton />
        </div>
      </div>
    </header>
  );
}
