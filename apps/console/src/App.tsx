import { ConnectButton } from '@mysten/dapp-kit';
import { Button } from './components/ui/Button';
import { matchEnvironment, navigate, useRoute } from './lib/router';
import { useTheme } from './lib/theme';
import { EnvironmentDetail } from './pages/EnvironmentDetail';
import { Home } from './pages/Home';

export function App() {
  const route = useRoute();
  const envId = matchEnvironment(route);

  return (
    <div className="min-h-dvh">
      <Header />
      <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
        {envId ? <EnvironmentDetail id={envId} /> : <Home />}
      </main>
    </div>
  );
}

function Header() {
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
