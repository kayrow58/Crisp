// The Crisp "C" (three neon bars) used as the AI icon. Still when idle; while the AI works it
// turns slowly in 3D with the bars at different depths and a soft glow (replaces the old star).
export function CrispMark({ size = 20, working = false }: { size?: number; working?: boolean }) {
  return (
    <span className={`cmark${working ? ' cmark--working' : ''}`} style={{ width: size, height: size }} aria-hidden>
      <span className="cmark-inner">
        <span className="cmark-bar cmark-bar--pink" />
        <span className="cmark-bar cmark-bar--cyan" />
        <span className="cmark-bar cmark-bar--yellow" />
      </span>
    </span>
  )
}
