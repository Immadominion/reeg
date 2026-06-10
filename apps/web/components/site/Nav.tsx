'use client';

import { Github, Menu, MoveRight, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ButtonLink } from '@/components/ui/Button';
import { Container } from '@/components/ui/Container';
import { Logo } from '@/components/ui/Logo';
import { cn } from '@/lib/cn';
import { navLinks, site } from '@/lib/site';

export function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  // Solidify the bar once the hero starts to scroll under it (a quiet glass + border appears).
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Escape closes the mobile menu.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <header
      className={cn(
        'sticky top-0 z-50 transition-colors duration-200',
        scrolled || open
          ? 'border-b border-border bg-background/80 backdrop-blur-md'
          : 'border-b border-transparent',
      )}
    >
      <Container className="flex h-16 items-center justify-between gap-4">
        <a
          href="#top"
          className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          aria-label="Reeg home"
        >
          <Logo />
        </a>

        <nav className="hidden items-center gap-1 md:flex" aria-label="Primary">
          {navLinks.map((link) => (
            <a
              key={link.label}
              href={link.href}
              className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          <a
            href={site.github}
            target="_blank"
            rel="noreferrer"
            aria-label="Reeg on GitHub"
            className="grid h-10 w-10 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Github className="h-[18px] w-[18px]" />
          </a>
          <ButtonLink href={site.appUrl} size="md">
            Start building
            <MoveRight className="h-[18px] w-[18px]" />
          </ButtonLink>
        </div>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="mobile-menu"
          aria-label={open ? 'Close menu' : 'Open menu'}
          className="grid h-10 w-10 place-items-center rounded-lg text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:hidden"
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </Container>

      {open && (
        <div id="mobile-menu" className="border-t border-border bg-background md:hidden">
          <Container className="flex flex-col gap-1 py-4">
            {navLinks.map((link) => (
              <a
                key={link.label}
                href={link.href}
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-3 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {link.label}
              </a>
            ))}
            <ButtonLink href={site.appUrl} size="lg" className="mt-2 w-full">
              Start building
              <MoveRight className="h-[18px] w-[18px]" />
            </ButtonLink>
          </Container>
        </div>
      )}
    </header>
  );
}
