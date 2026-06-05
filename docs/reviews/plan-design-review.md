# Plan Design Review

A design-quality review of the Reeg plan and docs, in the spirit of `/plan-design-review`.
This rates the product and experience direction (not code) across dimensions, scores
each 0-10, says what a 10 looks like, and lists concrete actions. Actions marked
[done] were applied in this pass; the rest are queued for the build and the designer.

Scope reviewed: the docs suite, the positioning, and the planned Console/marketing
experience described in [design-brief.md](design-brief.md) and
[product-vision.md](../00-overview/product-vision.md).

## Scores

| Dimension | Score | One-line reason |
| --- | --- | --- |
| Positioning clarity | 8/10 | Now leads with own + share; verifiability demoted to a free benefit |
| Web2 legibility | 7/10 | Brief mandates hiding the chain; needs the Figma to prove it |
| Emotional payoff of the demo | 9/10 | The kill-and-restore moment is genuinely strong |
| Differentiation honesty | 8/10 | We now say plainly we do what sandboxes do, plus ownership |
| Onboarding / empty states | 6/10 | Called out in the brief, not yet designed |
| Visual system maturity | 5/10 | Direction set (Vercel/Linear/GitHub), no comps yet |
| Information architecture | 8/10 | Environment list -> detail -> timeline mirrors GitHub, easy to learn |

## Dimension notes

### Positioning clarity (8/10)

- What a 10 looks like: a stranger reads the hero and the first Console screen and can
  explain the product in one sentence without the word "blockchain."
- Was: every doc led with "verifiable," which is the benefit, not the reason to adopt.
- [done] Reframed vision, whitepaper, README, brand, business model, SWOT, and AGENTS
  to lead with own + share; verifiability is now framed as a free consequence of being
  on Sui.
- Remaining: pressure-test the one-liner on a non-crypto developer; iterate wording.

### Web2 legibility (7/10)

- What a 10 looks like: nothing in the main flow reveals a hash, address, or gas cost;
  the app feels like Linear.
- [done] The design brief sets a hard "hide the blockchain" rule with a translation
  table (hash -> Verified badge, address -> person, gas -> price).
- Remaining: the Figma must honor it; review comps specifically for leaked jargon.

### Emotional payoff of the demo (9/10)

- What a 10 looks like: a non-technical judge gasps at the kill-and-restore and gets
  why proof matters without a crypto explainer.
- [done] [demo-script.md](../demo/demo-script.md) is built entirely around the one
  undeniable moment and maps each beat to a judging weight.
- Remaining: rehearse until effortless; record a fallback.

### Differentiation honesty (8/10)

- What a 10 looks like: we never sound defensive about Daytona/E2B/Blackbox; we say we
  do what they do and add ownership, and it lands as confidence.
- [done] SWOT T1, business model, and vision now state plainly that we match the
  sandbox feature set and win on ownership, instead of underselling ourselves.

### Onboarding / empty states (6/10)

- What a 10 looks like: a brand-new user with zero environments knows exactly what to
  do and feels the product is for them.
- [done] The brief flags empty/loading/error/success states as first-class.
- Remaining: design them; this is most of the first impression.

### Visual system maturity (5/10)

- What a 10 looks like: a tight component library and two polished hero screens.
- Remaining: the designer produces the system. Direction is set; execution pending.

### Information architecture (8/10)

- What a 10 looks like: users navigate by intuition because it mirrors tools they know.
- [done] The brief structures the Console as list -> detail -> timeline, GitHub-style,
  with share/fork/restore as row actions.

## Top actions

1. [done] Lead every surface with own + share; demote verifiability to a benefit.
2. [done] Write the "hide the blockchain" translation rule into the design brief.
3. [done] Center the demo on the kill-and-restore moment.
4. [queued, designer] Produce Console comps for all states, especially empty states.
5. [queued, designer] Design the Verified badge to feel trustworthy and non-crypto.
6. [queued] User-test the one-liner on a non-crypto developer and iterate.
</content>
