// Single source of truth for outbound links, emails, and the nav/footer information
// architecture. Pages that do not exist yet point at honest placeholders ('#') so the site reads
// complete without implying a page is live. Update the marked entries as surfaces come online.
export const site = {
  name: 'Reeg',
  tagline: 'Git tracks code. Reeg tracks the environment where the work happened.',
  positioning:
    "Reeg is infrastructure for portable computing environments. We started with AI agents because they're the fastest-growing source of ephemeral work, but the underlying system can preserve and move any environment.",
  appUrl: 'https://app.reeg.xyz', // the Console (separate deploy)
  docsUrl: '/docs', // the in-site docs (apps/web/app/docs), rendered in the brand style
  github: 'https://github.com/Immadominion/reeg',
  githubStars: '-', // TODO(launch): wire real star count
  email: {
    hello: 'hello@reeg.xyz',
    support: 'support@reeg.xyz',
    security: 'security@reeg.xyz',
  },
} as const;

export type NavLink = { label: string; href: string };

// On-page anchors for the single homepage, plus the Console CTA.
export const navLinks: NavLink[] = [
  { label: 'Product', href: '#product' },
  { label: 'Proof', href: '#proof' },
  { label: 'Pricing', href: '#pricing' },
  { label: 'Docs', href: site.docsUrl },
];

export type FooterColumn = { title: string; links: NavLink[] };

// The full IA a serious developer tool ships (modelled on Vercel/Linear/Daytona). Most are honest
// placeholders today; they establish the shape and are cheap to wire up later.
export const footerColumns: FooterColumn[] = [
  {
    title: 'Product',
    links: [
      { label: 'Overview', href: '#product' },
      { label: 'Proof', href: '#proof' },
      { label: 'Pricing', href: '#pricing' },
      { label: 'Console', href: site.appUrl },
      { label: 'Changelog', href: '#' }, // TODO(launch)
    ],
  },
  {
    title: 'Developers',
    links: [
      { label: 'Docs', href: site.docsUrl },
      { label: 'API reference', href: '#' }, // TODO(launch)
      { label: 'CLI', href: '#' }, // TODO(launch)
      { label: 'SDK', href: '#' }, // TODO(launch)
      { label: 'Status', href: '#' }, // TODO(launch)
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'About', href: '#' }, // TODO(launch)
      { label: 'Customers', href: '#' }, // TODO(launch)
      { label: 'Blog', href: '#' }, // TODO(launch)
      { label: 'Careers', href: '#' }, // TODO(launch)
      { label: 'Contact', href: `mailto:${site.email.hello}` },
    ],
  },
  {
    title: 'Legal',
    links: [
      { label: 'Privacy', href: '#' }, // TODO(launch)
      { label: 'Terms', href: '#' }, // TODO(launch)
      { label: 'Security', href: `mailto:${site.email.security}` },
      { label: 'Trust', href: '#' }, // TODO(launch)
    ],
  },
];

export const socialLinks: NavLink[] = [
  { label: 'GitHub', href: site.github },
  { label: 'X', href: '#' }, // TODO(launch)
  { label: 'Discord', href: '#' }, // TODO(launch)
];
