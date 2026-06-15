// The hero's atmosphere, lifted to page level so it sits BEHIND the (transparent) header — the body
// reads as one continuous surface the header floats on. A soft, grainy multi-hue aurora (brand blue
// anchored, with a quiet violet and rose) over a faint blueprint grid, finished with a film-grain
// overlay so the gradient reads as textured "noise" rather than a flat wash. Self-contained
// overflow-hidden clips the wide blooms so they never cause horizontal scroll, and it is a sibling
// of the sticky header (not an ancestor), so sticky positioning keeps working.
export function TopGlow() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[880px] overflow-hidden"
    >
      {/* Aurora blooms — brand blue carries it; violet + rose add the soft colored "noise". */}
      <div
        className="absolute left-1/2 top-[-150px] h-[560px] w-[1100px] max-w-[150vw] -translate-x-1/2 rounded-full opacity-[0.18] blur-[4px]"
        style={{ background: 'radial-gradient(closest-side, var(--accent), transparent)' }}
      />
      <div
        className="absolute right-[8%] top-[-20px] h-[460px] w-[560px] max-w-[80vw] rounded-full opacity-[0.13] blur-[8px]"
        style={{ background: 'radial-gradient(closest-side, #8b5cf6, transparent)' }}
      />
      <div
        className="absolute left-[6%] top-[40px] h-[420px] w-[520px] max-w-[80vw] rounded-full opacity-[0.10] blur-[8px]"
        style={{ background: 'radial-gradient(closest-side, #fb7185, transparent)' }}
      />

      {/* Faint blueprint grid, masked to fade out below the fold and at the edges. */}
      <div className="bg-grid absolute inset-0 opacity-[0.5] [mask-image:radial-gradient(ellipse_60%_56%_at_50%_0%,black,transparent)]" />

      {/* Film grain — a tiny static feTurbulence tile that rasterizes once; turns the gradient into
          textured noise and kills banding. */}
      <svg className="absolute inset-0 h-full w-full opacity-[0.04] mix-blend-soft-light">
        <title>grain</title>
        <filter id="reeg-top-grain">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.9"
            numOctaves="1"
            stitchTiles="stitch"
          />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#reeg-top-grain)" />
      </svg>
    </div>
  );
}
