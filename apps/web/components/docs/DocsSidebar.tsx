'use client';

import { usePathname } from 'next/navigation';
import { cn } from '@/lib/cn';
import { docsNav } from '@/lib/docs';

// The docs navigation. Sections with their pages; the current page is highlighted off the path.
// Reused by the desktop sidebar and the mobile disclosure (onNavigate closes the mobile menu).
export function DocsSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Documentation" className="flex flex-col gap-7">
      {docsNav.map((section) => (
        <div key={section.title} className="flex flex-col gap-2">
          <span className="px-3 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            {section.title}
          </span>
          <ul className="flex flex-col gap-0.5">
            {section.pages.map((page) => {
              const href = `/docs/${page.slug}`;
              const active = pathname === href;
              return (
                <li key={page.slug}>
                  <a
                    href={href}
                    onClick={onNavigate}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'block rounded-md px-3 py-1.5 text-sm transition-colors',
                      active
                        ? 'bg-accent/10 font-medium text-accent'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                    )}
                  >
                    {page.title}
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
