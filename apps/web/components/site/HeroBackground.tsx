// Cinematic dark hero background: the "well/funnel" inspired by the Molithra web3 hero, recast in
// Reeg's cool blue→indigo→violet tones. Pure CSS, no SVG, no JS, no assets.
//
// Technique ("css-perspective-grid"), three stacked decorative layers, back-to-front:
//   1) The lit "rim/horizon": layered radial gradients near the top sweep blue→indigo→violet so the
//      upper edge glows like light spilling over the lip of a pit.
//   2) The receding floor: a single grid plane (repeating linear-gradients) tilted with
//      transform: perspective() rotateX() so the lines converge toward a vanishing point. A
//      mask-image fades the plane out at the far edge and at both sides, so it reads as a floor
//      dropping into darkness rather than a flat sheet, and never spills to cause h-scroll.
//   3) The "pit" vignette: a central radial fade to near-black that keeps the headline area dark
//      enough for white text (WCAG AA) and visually swallows the grid as it recedes.
//
// Placement: drop inside a position:relative hero; content/panel render ABOVE it. Root is absolute
// inset-0, aria-hidden, pointer-events-none, and clips its own overflow. Only paint-cheap props
// (gradients, transform, opacity) are used; nothing animates layout. The lone ambient drift is
// transform/opacity and is disabled under prefers-reduced-motion via the scoped <style>.
export function HeroBackground({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 overflow-hidden bg-[#06070c] ${className ?? ''}`}
    >
      <style>{reegHeroBackgroundCss}</style>

      {/* Layer 1: the lit rim/horizon. Three offset elliptical glows (blue, indigo, violet) hug the
          top edge and bleed down a little. opacity keeps them as light, not paint. The wide negative
          insets let the glow originate just off-canvas so the rim feels lit from beyond the frame. */}
      <div className="reeg-hb-rim absolute inset-x-[-30%] top-[-22%] h-[78%] reeg-hb-drift">
        <div
          className="absolute inset-0"
          style={{
            background: [
              // violet on the right shoulder
              'radial-gradient(58% 70% at 74% 8%, rgba(139,92,246,0.50), transparent 62%)',
              // indigo across the crown
              'radial-gradient(64% 78% at 50% 2%, rgba(99,102,241,0.55), transparent 60%)',
              // blue on the left shoulder
              'radial-gradient(58% 70% at 26% 8%, rgba(59,130,246,0.52), transparent 62%)',
            ].join(','),
          }}
        />
        {/* A tight, brighter hairline of light right at the lip of the well. */}
        <div
          className="absolute inset-x-0 top-0 h-[34%]"
          style={{
            background:
              'radial-gradient(70% 100% at 50% 0%, rgba(165,180,252,0.45), rgba(99,102,241,0.18) 45%, transparent 72%)',
          }}
        />
      </div>

      {/* Layer 2: the receding grid floor. The wrapper sets the 3D perspective; the inner plane is
          rotated back so the parallel grid lines converge. Masked to fade at the far (top) edge and
          at both flanks so it dissolves into the dark instead of ending in a hard line. */}
      <div className="reeg-hb-stage absolute inset-x-0 bottom-0 top-[34%]">
        <div className="reeg-hb-grid reeg-hb-drift-slow absolute inset-x-[-50%] bottom-[-40%] top-0" />
      </div>

      {/* Layer 3a: the central "pit": a radial vignette to near-black that keeps the headline band
          (≈30–55% from top, centered) dark and legible, and deepens the funnel's throat. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(78% 62% at 50% 46%, rgba(6,7,12,0) 0%, rgba(6,7,12,0.55) 38%, rgba(6,7,12,0.9) 66%, #06070c 100%)',
        }}
      />

      {/* Layer 3b: a focused dark core exactly under the headline, so white type always clears AA
          regardless of where the rim glow lands. Multiply-free, just a soft near-black radial. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(46% 34% at 50% 42%, rgba(5,6,10,0.86), rgba(5,6,10,0.35) 55%, transparent 78%)',
        }}
      />

      {/* Layer 3c: bottom grounding fade so the floor melts cleanly into the page below. */}
      <div
        className="absolute inset-x-0 bottom-0 h-[40%]"
        style={{
          background: 'linear-gradient(to bottom, transparent, #06070c 92%)',
        }}
      />

      {/* Faint top edge tint so the very top doesn't clip the rim glow into a hard band. */}
      <div
        className="absolute inset-x-0 top-0 h-[12%]"
        style={{ background: 'linear-gradient(to bottom, rgba(6,7,12,0.55), transparent)' }}
      />
    </div>
  );
}

// Scoped CSS for the perspective grid + ambient drift. Kept here (not in globals) so the component is
// fully self-contained and copy-pasteable. Class names are namespaced (reeg-hb-*) to avoid clashes.
const reegHeroBackgroundCss = `
.reeg-hb-stage {
  perspective: 520px;
  perspective-origin: 50% 0%;
}
.reeg-hb-grid {
  /* Two repeating linear-gradients form the grid; indigo-tinted white at very low alpha keeps it
     "blueprint quiet", never neon. Larger cells so the perspective reads as architecture, not noise. */
  background-image:
    repeating-linear-gradient(
      to right,
      rgba(165, 180, 252, 0.10) 0,
      rgba(165, 180, 252, 0.10) 1px,
      transparent 1px,
      transparent 76px
    ),
    repeating-linear-gradient(
      to bottom,
      rgba(165, 180, 252, 0.085) 0,
      rgba(165, 180, 252, 0.085) 1px,
      transparent 1px,
      transparent 76px
    );
  transform-origin: 50% 0%;
  transform: rotateX(74deg);
  /* Fade the plane: dark at the far horizon (top), solid mid, then gone before the very bottom; and
     taper both flanks so it never reaches the clip edge (no horizontal overflow, centered well). */
  -webkit-mask-image:
    linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.65) 22%, #000 48%, #000 80%, transparent 100%),
    linear-gradient(to right, transparent 0%, #000 26%, #000 74%, transparent 100%);
  mask-image:
    linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.65) 22%, #000 48%, #000 80%, transparent 100%),
    linear-gradient(to right, transparent 0%, #000 26%, #000 74%, transparent 100%);
  -webkit-mask-composite: source-in;
  mask-composite: intersect;
  will-change: transform;
}

/* Ambient breathing: transform/opacity only, glacial and subtle, so the rim feels alive without
   ever drawing attention. Disabled entirely under reduced-motion below. */
@keyframes reeg-hb-breathe {
  0%, 100% { transform: translate3d(0, 0, 0) scale(1); opacity: 1; }
  50%      { transform: translate3d(0, -1.4%, 0) scale(1.03); opacity: 0.92; }
}
@keyframes reeg-hb-breathe-slow {
  0%, 100% { transform: rotateX(74deg) translateY(0); }
  50%      { transform: rotateX(74deg) translateY(-1.2%); }
}
@media (prefers-reduced-motion: no-preference) {
  .reeg-hb-drift { animation: reeg-hb-breathe 16s ease-in-out infinite; }
  .reeg-hb-drift-slow {
    /* re-applies the base rotateX while animating, so the floor gently swells */
    animation: reeg-hb-breathe-slow 22s ease-in-out infinite;
  }
}
@media (prefers-reduced-motion: reduce) {
  .reeg-hb-drift, .reeg-hb-drift-slow { animation: none !important; }
}
`;
