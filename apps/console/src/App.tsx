import { lazy, Suspense } from 'react';
import { Header } from './components/Header';
import { Container } from './components/ui/Container';
import { matchEnvironment, useRoute } from './lib/router';
import { EnvironmentDetail } from './pages/EnvironmentDetail';
import { Home } from './pages/Home';

// The design sandbox is a dev/preview-only tool with its own chrome and mock data. Lazy-load it so
// it ships as a separate chunk that a normal production build never fetches.
const Sandbox = lazy(() => import('./pages/Preview').then((m) => ({ default: m.Sandbox })));

export function App() {
  const route = useRoute();

  // The screen sandbox is a separate tool that wraps the product screens in its own chrome, so it
  // takes over the whole page. It is on in a preview build (VITE_REEG_PREVIEW, e.g. the deploy we
  // share with a designer) or at #/preview during local dev. A normal build never shows it.
  const sandbox =
    import.meta.env.VITE_REEG_PREVIEW === '1' ||
    (import.meta.env.DEV && route.startsWith('/preview'));
  if (sandbox) {
    return (
      <Suspense fallback={null}>
        <Sandbox />
      </Suspense>
    );
  }

  const envId = matchEnvironment(route);
  return (
    <div className="flex min-h-dvh flex-col">
      <Header />
      <main className="flex-1">
        {envId ? (
          <Container className="py-8 sm:py-10">
            <EnvironmentDetail id={envId} />
          </Container>
        ) : (
          <Home />
        )}
      </main>
    </div>
  );
}
