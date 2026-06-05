# Reeg brand

The source of truth for how Reeg looks and sounds in the product. Frontend work reads this
file. It implements the design brief ([docs/06-design/design-brief.md](docs/06-design/design-brief.md))
and brand voice ([docs/05-business/brand-and-domain.md](docs/05-business/brand-and-domain.md)).

## Feel

A serious developer tool with taste: the calm and polish of Vercel, Linear, and GitHub. Light
and airy by default, with a real dark mode. Quiet color, generous whitespace, confident
typography, fast first paint. Not neon, not "crypto," not playful. Density closer to Linear
than a trading terminal.

The hard rule: hide the blockchain. The UI never shows a hash, address, or chain term in the
main flow. Raw values live only behind an optional "Technical details" disclosure.

## Color

Neutral-led, with one calm interactive accent and a dedicated trust green for "Verified". The
tokens below are the contract; components use the semantic names, never raw hex. Defined as
CSS variables in `apps/console/src/index.css` and mapped into Tailwind v4 via `@theme inline`.

Light:

- background `#ffffff`, foreground `#0a0a0a`
- muted `#f4f4f5`, muted-foreground `#71717a`, border `#e4e4e7`
- primary `#18181b` (near-black), primary-foreground `#fafafa`
- accent (links, focus, interactive) `#2563eb`
- verified / success `#16a34a`; warning `#b45309`; destructive `#dc2626`

Dark:

- background `#0a0a0b`, foreground `#fafafa`
- muted `#18181b`, muted-foreground `#a1a1aa`, border `#27272a`
- primary `#fafafa`, primary-foreground `#18181b`
- accent `#3b82f6`; verified / success `#22c55e`; warning `#d97706`; destructive `#ef4444`

Radius: `--radius: 0.625rem`. Contrast meets WCAG AA. Respect `prefers-reduced-motion`.

## Typography

A clean system sans for UI, a mono only for the optional technical disclosure. Inter or Geist
is the intended display upgrade; until it is self-hosted, the system stack keeps first paint
instant.

- sans: `ui-sans-serif, -apple-system, "Segoe UI", Roboto, Inter, Helvetica, Arial, sans-serif`
- mono: `ui-monospace, "SF Mono", "JetBrains Mono", Menlo, monospace`

Scale is calm and consistent: a large but quiet page title, comfortable body, small muted
metadata. Weight does the emphasis, not size jumps.

## The Verified badge

The single most important visual. It must feel like a trustworthy verified checkmark, not a
crypto seal: the verified green, a check glyph, plain label ("Verified"). It has earned and
unverified states, and reads as reassurance. Microcopy on success:
"Verified independently. Nothing here was changed after the fact."

## Voice

Plain, confident, honest. No hype, no em dashes. Microcopy sounds like a calm senior engineer.

- Good: "Saved. You can resume this on any machine."
- Good: "Verified independently. Nothing here was changed after the fact."
- Avoid: "Your run is now immutably anchored on-chain."

Call a Machine an "Environment" in the UI. Call a checkpoint a "Snapshot". A wallet address is
a person (name, avatar). A restore is "Resume on another machine".
