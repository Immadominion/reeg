# @reeg/web — marketing site (reeg.xyz)

The public marketing site for Reeg, infrastructure for portable computing
environments — we started with AI agents because they're the fastest-growing
source of ephemeral work, but the underlying system can preserve and move any
environment. Separate from the
Console (`apps/console`, the product at app.reeg.xyz); this is the apex `reeg.xyz`.

## Stack

- Next.js (App Router) + React 19 + TypeScript
- Tailwind v4 (via `@tailwindcss/postcss`) with the brand tokens ported from
  `apps/console/src/index.css` (see [brand.md](../../brand.md) — the source of truth)
- Type: **Clash Display** for headlines (self-hosted in `fonts/`, free for commercial use, a
  Neue-Machina-adjacent display face), **Montserrat** for body/UI, **JetBrains Mono** for the
  terminal/proof panel — wired in `lib/fonts.ts`. To swap in licensed **Neue Machina**, drop its
  woff2 files in `fonts/` and repoint `clashDisplay.src` in `lib/fonts.ts`; nothing else changes.
- Motion (`motion/react`) for choreographed, reduced-motion-aware entrances

Currently a single, deeply-polished homepage: hero + product panel, the problem, the
own/share/move/prove chapters, a dark "Proof" band, a Reeg-vs-sandbox comparison, the ecosystem /
backed-by strip, a pricing teaser, and a final CTA. Light by default with dramatic dark bands.

## Develop

```bash
pnpm --filter @reeg/web dev      # http://localhost:3000
pnpm --filter @reeg/web build    # static production build
pnpm --filter @reeg/web typecheck
pnpm exec biome check apps/web   # lint/format
```

## Deploy

Deploys as its **own Vercel project**, separate from the Console:

- Root Directory: `apps/web`
- Framework preset: Next.js (auto-detected)
- Install command: `pnpm install` (run at the repo root by Vercel for the monorepo)
- Do not reuse the Console's root `vercel.json` (that one builds `apps/console`).

## Things to finish before launch

These are deliberately honest placeholders, not bugs:

- **Aspirational claims** are marked `TODO(claims)` and rendered with an explicit "Applying" label
  (e.g. NVIDIA Inception in `components/sections/Ecosystem.tsx`). Flip them to live, or remove them,
  before launch. Truthful badges (Sui, Walrus, Seal, Sui Overflow 2025) stand on their own.
- **Placeholder links** are `'#'` in `lib/site.ts` (docs, blog, changelog, API, CLI, legal, socials,
  GitHub). Wire each as the page/surface comes online.
- Real GitHub repo URL + star count, an OG image, and a favicon are not set yet.
- Secondary pages (Pricing, Docs, Customers, Company, Terms, Privacy, etc.) are not built yet; the
  nav/footer IA establishes the shape.
