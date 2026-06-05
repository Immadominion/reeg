# Design Brief (for the designer)

This is the handoff for designing Reeg's Console and marketing site. It assumes no
crypto background. If a sentence here uses a blockchain word, it is a mistake; tell
us and we will fix it. The goal is a product that feels like a modern web2 developer
tool, not a crypto app.

Read [brand-and-domain.md](../05-business/brand-and-domain.md) for name, voice, and
tone. This brief covers what to design and how it should feel.

## What Reeg is, in one breath

Reeg is the computer your AI agents live in: a real workspace you can own, share,
fork, move to another machine, and prove what happened inside. Think "GitHub for an
AI agent's environment." A user spins up an environment, an agent works in it, and
the user can snapshot it, hand it to a teammate, branch it, or restore it elsewhere.

## The feel we want

Aim for the polish and calm of tools developers already trust:

- Vercel: clean dashboards, generous whitespace, confident typography, fast.
- Linear: crisp lists, keyboard-friendly, quiet color, no clutter.
- GitHub: timelines, diffs, commits, branches, sharing, all legible at a glance.

It should feel like a serious tool made by people with taste. Light and airy by
default, with an optional dark mode. Not neon, not "crypto," not playful, not heavy.

## The hard rule: hide the blockchain

Reeg runs on Sui and Walrus under the hood, but the user should almost never see
that. Translate every technical concept into a plain-English, web2 equivalent:

| Under the hood (never show raw) | What the user sees |
| --- | --- |
| A hash / blob id / content digest | A green "Verified" checkmark, a short label like "Snapshot #14" |
| A wallet address | A person: name, avatar, email-style handle ("shared with Dana") |
| "On-chain object" / "Sui object" | "Your environment," "owned by you" |
| "Seal policy / allowlist" | "Who has access" with avatars and Add/Remove |
| Gas / WAL cost | A normal price in dollars, or "storage used" |
| "Provenance chain entry" | A timeline event ("Ran tests", "Saved snapshot") |
| "Restore from checkpoint on host B" | "Resume on another machine" |
| Transaction signing | A normal Confirm button (wallet prompt handled quietly) |

Show a hash only in an optional "Technical details" disclosure for the curious, never
in the main flow. The default experience must read like Linear, not like a block
explorer.

## Surfaces to design

### A. The Console (app.reeg.xyz)

The product. A logged-in dashboard for managing agent environments. Note: the Console
is a fully static site (no traditional backend), so design for fast first paint and
states that load progressively.

Screens:

1. **Environments list (home).** A clean list/grid of the user's environments
   ("Machines," but call them Environments in the UI). Each row: name, what it is
   running, last activity ("Saved 3 min ago"), an owner/shared indicator, and a
   Verified badge. Primary action: New environment. Empty state matters (see below).

2. **Environment detail.** The heart of the product. Layout like a GitHub repo page:
   - Header: environment name, status (Running / Idle / Restoring), owner, who it is
     shared with (avatars), and a prominent Verified badge.
   - A **timeline** down the page: every meaningful event as a card (created, ran a
     command, saved a snapshot, shared with someone, forked, restored). This is the
     "history" and it should feel like a commit history, readable to a non-engineer.
   - Each snapshot event has actions: Restore, Fork, Share, View details.
   - A quiet "Verify" affordance (see below).

3. **Snapshot / restore flow.** Saving a snapshot and restoring one. Make "Resume on
   another machine" feel safe and obvious: pick a snapshot, confirm, watch a progress
   state, land on a working environment. The emotional beat: "my work is safe and
   movable."

4. **Share / access.** A simple panel: who has access (avatars + name + role:
   Viewer / Can restore), an Add person field, and Remove. No addresses. When you add
   someone, it should feel like sharing a Google Doc.

5. **Fork.** "Branch this environment from this snapshot." Show the parent/child
   relationship visually, like a git branch. Result is a new environment in the list.

6. **Verify.** A reassurance feature, not a crypto feature. A "Verify" button that,
   when clicked, shows a calm success state: "Verified independently. This history has
   not been tampered with." Plus an optional "How we check" / "Technical details"
   expander for the proof. The point is trust, conveyed simply. This must work even
   when Reeg's own servers are down, but the user never needs to know that detail;
   just make "Verified" feel solid and earned.

### B. Marketing site (reeg.xyz)

A developer-tool landing page. Sections, in order:

1. Hero: the one-liner ("The computer your AI agents live in: one you own, and can
   share"), a sharp subhead, a primary CTA (Start building / Get early access), and a
   product visual (the Console timeline or the restore moment).
2. The problem, in three plain lines: agent environments are rented, vanish, and
   cannot be shared, moved, or trusted.
3. The product, as a sequence of three or four visuals: Own it, Share and fork it,
   Move it, Prove it.
4. A "why this is different" strip: we do everything a normal sandbox does, plus the
   one thing it cannot (you own it).
5. Social proof / ecosystem (Sui, Walrus) shown lightly, as logos, not as the pitch.
6. Footer with docs, contact (<hello@reeg.xyz>), security (<security@reeg.xyz>).

Keep crypto branding minimal on the marketing site too. Lead with the developer
value; mention the chain only where it earns trust.

## Components to define

- Buttons (primary, secondary, ghost), inputs, dropdowns, modals, toasts.
- Cards: environment card, timeline event card, snapshot card.
- The Verified badge (the single most important visual; design it to feel
  trustworthy, like a verified checkmark, not a crypto seal).
- Avatars and the "shared with" stack.
- Status pills (Running, Idle, Restoring, Verified, Shared).
- The timeline component (vertical, scannable, with icons per event type).

## States to design (do not skip these)

For every screen, design:

- **Empty state**: first-time users with no environments. Warm, instructive, with one
  obvious next action. This is most of the first impression; treat it as a feature.
- **Loading state**: because the Console is static and reads data progressively,
  design graceful skeletons, not spinners-on-blank.
- **Error state**: something failed (a restore could not complete, a share could not
  be saved). Plain-language, calm, with a clear retry.
- **Success / confirmation**: snapshot saved, environment shared, verified. Small,
  satisfying moments.

## Accessibility and craft

- Meet WCAG AA contrast. Keyboard navigable. Sensible focus states.
- Respect reduced-motion. Animations are subtle and functional, never decorative
  noise.
- Type and spacing scale should be consistent and calm. Density closer to Linear than
  to a dense trading terminal.

## What to hand back

- A Figma file with the Console screens (all states), the marketing page, and a small
  component library.
- A short notes doc on any place our language leaked blockchain terms into the UI, so
  we can keep the "hide the chain" rule honest.

## Voice in the UI

Same voice as the brand: plain, confident, honest. No hype, no em dashes. Microcopy
should sound like a calm senior engineer, not a marketer. Examples:

- Good: "Saved. You can resume this on any machine."
- Good: "Verified independently. Nothing here was changed after the fact."
- Avoid: "Your run is now immutably anchored on-chain."
</content>

</invoke>
