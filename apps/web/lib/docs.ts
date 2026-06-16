// The docs information architecture: client-safe (NO node:fs here, since the sidebar is a client
// component). The fs reader lives in docs-content.ts. Adding a page = an entry here + a
// content/docs/<slug>.md file.
export type DocPage = { slug: string; title: string; blurb?: string };
export type DocSection = { title: string; pages: DocPage[] };

export const docsNav: DocSection[] = [
  {
    title: 'Get started',
    pages: [
      { slug: 'introduction', title: 'Introduction', blurb: 'What Reeg is, and why environments are the last thing in computing to become portable.' },
      { slug: 'quickstart', title: 'Quickstart', blurb: 'Create, checkpoint, move, share, and prove an environment from the CLI.' },
    ],
  },
  {
    title: 'Concepts',
    pages: [
      { slug: 'how-it-works', title: 'How it works', blurb: 'The commit boundary, the snapshot, and verification with Reeg switched off.' },
      { slug: 'architecture', title: 'Architecture', blurb: 'The Machine package, the snapshot engine, runtime tiers, and the verification chain.' },
    ],
  },
  {
    title: 'Reference',
    pages: [
      { slug: 'cli-reference', title: 'CLI reference', blurb: 'Every reeg verb, its flags, and the environment variables.' },
      { slug: 'faq', title: 'FAQ', blurb: 'Honest answers: trust, encryption, mainnet vs testnet, and cost.' },
    ],
  },
];

const allPages = docsNav.flatMap((s) => s.pages);
export const allDocSlugs = allPages.map((p) => p.slug);

export function docTitle(slug: string): string {
  return allPages.find((p) => p.slug === slug)?.title ?? slug;
}
