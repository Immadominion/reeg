import type { Metadata } from 'next';
import { Card } from '@/components/ui/Card';
import { docsNav } from '@/lib/docs';

export const metadata: Metadata = {
  title: 'Documentation',
  description:
    'Reeg makes environments portable. Guides, concepts, architecture, and the CLI reference.',
};

export default function DocsHome() {
  return (
    <div>
      <span className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">Docs</span>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Documentation</h1>
      <p className="mt-4 max-w-2xl text-pretty leading-7 text-muted-foreground">
        Reeg makes environments portable. Start with the introduction, run the loop yourself in the
        quickstart, then go deeper on how it works and the architecture.
      </p>

      <div className="mt-10 flex flex-col gap-10">
        {docsNav.map((section) => (
          <section key={section.title}>
            <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              {section.title}
            </h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {section.pages.map((page) => (
                <a key={page.slug} href={`/docs/${page.slug}`} className="group block">
                  <Card className="h-full p-5 transition-colors hover:border-accent/40">
                    <h3 className="font-semibold tracking-tight transition-colors group-hover:text-accent">
                      {page.title}
                    </h3>
                    {page.blurb && (
                      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                        {page.blurb}
                      </p>
                    )}
                  </Card>
                </a>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
