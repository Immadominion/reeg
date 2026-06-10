import { Header } from './components/Header';
import { matchEnvironment, useRoute } from './lib/router';
import { EnvironmentDetail } from './pages/EnvironmentDetail';
import { Home } from './pages/Home';
import { Sandbox } from './pages/Preview';

export function App() {
  const route = useRoute();

  // The screen sandbox is a separate tool that wraps the product screens in its own chrome, so it
  // takes over the whole page. It is on in a preview build (VITE_REEG_PREVIEW, e.g. the deploy we
  // share with a designer) or at #/preview during local dev. A normal build never shows it.
  const sandbox =
    import.meta.env.VITE_REEG_PREVIEW === '1' ||
    (import.meta.env.DEV && route.startsWith('/preview'));
  if (sandbox) {
    return <Sandbox />;
  }

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
