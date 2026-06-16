import type { ReactNode } from 'react';
import { DocsSidebar } from '@/components/docs/DocsSidebar';
import { Footer } from '@/components/site/Footer';
import { Nav } from '@/components/site/Nav';
import { Container } from '@/components/ui/Container';

// The docs shell: the site nav on top, a sticky sidebar on desktop (a disclosure on mobile), the
// page content, and the shared footer, so /docs reads as the same product as the rest of reeg.xyz.
export default function DocsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Nav />
      <Container className="py-10 sm:py-14">
        <div className="flex flex-col gap-8 lg:flex-row lg:gap-14">
          <aside className="lg:w-60 lg:shrink-0">
            <details className="rounded-lg border border-border bg-card p-3 lg:hidden">
              <summary className="cursor-pointer select-none px-1 text-sm font-medium">
                Documentation menu
              </summary>
              <div className="mt-3">
                <DocsSidebar />
              </div>
            </details>
            <div className="sticky top-20 hidden lg:block">
              <DocsSidebar />
            </div>
          </aside>
          <main className="min-w-0 flex-1">{children}</main>
        </div>
      </Container>
      <Footer />
    </>
  );
}
