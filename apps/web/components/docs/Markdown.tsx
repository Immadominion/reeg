import ReactMarkdown, { type Components } from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import rehypeSlug from 'rehype-slug';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/cn';

// Renders a docs markdown string in the Reeg design system. Every element is mapped to brand
// tokens (orange accent, Clash Display headings via the base layer, hairline borders, mono code),
// so docs read as native reeg.xyz, not a generic prose dump. Raw HTML (centered diagram images)
// is allowed via rehype-raw — the content is our own, not user input.
const components: Components = {
  h1: ({ node, ...p }) => (
    <h1 className="mb-4 mt-2 text-balance text-3xl font-semibold tracking-tight sm:text-4xl" {...p} />
  ),
  h2: ({ node, ...p }) => (
    <h2
      className="mt-12 mb-4 scroll-mt-24 border-t border-border pt-8 text-2xl font-semibold tracking-tight"
      {...p}
    />
  ),
  h3: ({ node, ...p }) => (
    <h3 className="mt-8 mb-3 scroll-mt-24 text-lg font-semibold tracking-tight" {...p} />
  ),
  h4: ({ node, ...p }) => (
    <h4 className="mt-6 mb-2 scroll-mt-24 text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground" {...p} />
  ),
  p: ({ node, ...p }) => <p className="my-4 leading-7 text-foreground/90" {...p} />,
  a: ({ node, ...p }) => (
    <a
      className="font-medium text-accent underline-offset-4 hover:underline"
      {...(typeof p.href === 'string' && p.href.startsWith('http')
        ? { target: '_blank', rel: 'noreferrer' }
        : {})}
      {...p}
    />
  ),
  ul: ({ node, ...p }) => <ul className="my-4 ml-1 flex flex-col gap-2" {...p} />,
  ol: ({ node, ...p }) => <ol className="my-4 ml-5 flex list-decimal flex-col gap-2" {...p} />,
  li: ({ node, children, ...p }) => (
    <li className="leading-7 text-foreground/90 marker:text-muted-foreground" {...p}>
      {children}
    </li>
  ),
  blockquote: ({ node, ...p }) => (
    <blockquote
      className="my-5 rounded-r-md border-l-2 border-accent bg-muted/50 px-4 py-3 text-sm leading-relaxed text-muted-foreground [&>p]:my-1"
      {...p}
    />
  ),
  hr: () => <hr className="my-10 border-border" />,
  strong: ({ node, ...p }) => <strong className="font-semibold text-foreground" {...p} />,
  // Inline code; block code lives inside <pre> and is reset to transparent there.
  code: ({ node, ...p }) => (
    <code
      className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-foreground"
      {...p}
    />
  ),
  pre: ({ node, ...p }) => (
    <pre
      className={cn(
        'my-5 overflow-x-auto rounded-lg border border-border bg-muted/60 p-4 font-mono text-[13px] leading-relaxed text-foreground',
        '[&>code]:border-0 [&>code]:bg-transparent [&>code]:p-0 [&>code]:text-[13px]',
      )}
      {...p}
    />
  ),
  table: ({ node, ...p }) => (
    <div className="my-6 overflow-x-auto rounded-lg border border-border">
      <table className="w-full border-collapse text-sm" {...p} />
    </div>
  ),
  thead: ({ node, ...p }) => <thead className="bg-muted/60" {...p} />,
  th: ({ node, ...p }) => (
    <th className="border-b border-border px-4 py-2.5 text-left font-semibold" {...p} />
  ),
  td: ({ node, ...p }) => (
    <td className="border-b border-border px-4 py-2.5 align-top text-foreground/90" {...p} />
  ),
  // Diagrams and any inline image.
  img: ({ node, ...p }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className="mx-auto my-2 h-auto max-w-full rounded-lg border border-border bg-card"
      alt={p.alt ?? ''}
      {...p}
    />
  ),
};

export function Markdown({ children }: { children: string }) {
  return (
    <div className="text-[15px]">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw, rehypeSlug]}
        components={components}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
