// The hero's atmosphere, lifted to page level so it sits BEHIND the (transparent) header — the body
// reads as one continuous surface that the header floats on, rather than the header being a white
// box. Self-contained overflow-hidden clips the wide glow so it never causes horizontal scroll, and
// it is a sibling of the sticky header (not an ancestor), so sticky positioning keeps working.
export function TopGlow() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[820px] overflow-hidden"
    >
      <div
        className="absolute left-1/2 top-[-120px] h-[600px] w-[1000px] max-w-[140vw] -translate-x-1/2 rounded-full opacity-[0.16]"
        style={{ background: 'radial-gradient(closest-side, var(--accent), transparent)' }}
      />
      <div className="bg-grid absolute inset-0 opacity-[0.55] [mask-image:radial-gradient(ellipse_60%_58%_at_50%_0%,black,transparent)]" />
    </div>
  );
}
