import { Container } from '@/components/ui/Container';
import { Logo } from '@/components/ui/Logo';
import { footerColumns, site, socialLinks } from '@/lib/site';

// A full-depth footer so the site reads like a serious tool (Vercel/Linear/Daytona scale of IA).
// Rendered as a dark band: the `dark` class flips the design tokens for everything inside.
export function Footer() {
  return (
    <footer className="dark border-t border-border bg-background text-foreground">
      <Container className="py-16">
        <div className="grid gap-12 lg:grid-cols-[1.5fr_repeat(4,1fr)]">
          <div className="flex flex-col gap-4">
            <Logo />
            <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">
              {site.positioning}
            </p>
            <a
              href={`mailto:${site.email.hello}`}
              className="w-fit rounded text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {site.email.hello}
            </a>
          </div>

          {footerColumns.map((col) => (
            <nav key={col.title} aria-label={col.title} className="flex flex-col gap-3">
              <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                {col.title}
              </h3>
              <ul className="flex flex-col gap-2.5">
                {col.links.map((link) => {
                  const external = link.href.startsWith('http');
                  return (
                    <li key={link.label}>
                      <a
                        href={link.href}
                        {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}
                        className="rounded text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {link.label}
                      </a>
                    </li>
                  );
                })}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-14 flex flex-col items-start justify-between gap-6 border-t border-border pt-8 sm:flex-row sm:items-center">
          <p className="text-sm text-muted-foreground">
            <span className="text-foreground">© 2026 Reeg.</span> Owned on Sui · stored on Walrus ·
            encrypted with Seal · verifiable by anyone.
          </p>
          <div className="flex items-center gap-1">
            {socialLinks.map((link) => (
              <a
                key={link.label}
                href={link.href}
                {...(link.href.startsWith('http') ? { target: '_blank', rel: 'noreferrer' } : {})}
                className="rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {link.label}
              </a>
            ))}
          </div>
        </div>
      </Container>
    </footer>
  );
}
