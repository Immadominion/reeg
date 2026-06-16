import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Markdown } from '@/components/docs/Markdown';
import { allDocSlugs, docTitle } from '@/lib/docs';
import { getDoc } from '@/lib/docs-content';

// Static-render one page per known slug; anything else 404s.
export function generateStaticParams() {
  return allDocSlugs.map((slug) => ({ slug }));
}

export const dynamicParams = false;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  return { title: docTitle(slug) };
}

export default async function DocPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const doc = getDoc(slug);
  if (!doc) notFound();

  return (
    <article className="min-w-0 max-w-3xl">
      <Markdown>{doc.content}</Markdown>
    </article>
  );
}
