// Weight graph: line (default) or bar, with touch-and-drag scrubber (spec §4.6).
import { useMemo, useRef, useState } from 'react'
import { fmt, shortDate } from '../lib/format'

export function WeightChart({ points, unit, style }: { points: { date: string; value: number }[]; unit: string; style: 'line' | 'bar' }) {
  const [active, setActive] = useState<number | null>(null)
  const ref = useRef<SVGSVGElement>(null)
  const W = 340
  const H = 180
  const pad = { l: 8, r: 8, t: 16, b: 22 }

  const geom = useMemo(() => {
    if (!points.length) return null
    const vals = points.map((p) => p.value)
    let min = Math.min(...vals)
    let max = Math.max(...vals)
    if (max - min < 2) {
      min -= 1
      max += 1
    }
    const span = max - min
    min -= span * 0.1
    max += span * 0.1
    const n = points.length
    const x = (i: number) => (n === 1 ? W / 2 : pad.l + (i * (W - pad.l - pad.r)) / (n - 1))
    const y = (v: number) => pad.t + ((max - v) * (H - pad.t - pad.b)) / (max - min)
    return { x, y, min, max }
  }, [points])

  if (!geom) return null
  const { x, y } = geom
  const pick = (clientX: number) => {
    const r = ref.current?.getBoundingClientRect()
    if (!r) return
    const px = ((clientX - r.left) / r.width) * W
    let best = 0
    for (let i = 1; i < points.length; i++) if (Math.abs(x(i) - px) < Math.abs(x(best) - px)) best = i
    setActive(best)
  }
  const sel = active != null ? points[active] : null
  const barW = Math.max(2, Math.min(18, ((W - pad.l - pad.r) / points.length) * 0.6))
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ')

  return (
    <div className="chart">
      <div className="chart-readout" aria-live="polite">
        {sel ? (
          <>
            <strong>
              {fmt(sel.value, 1)} {unit}
            </strong>{' '}
            · {shortDate(sel.date)}
          </>
        ) : (
          <span className="muted">Touch the graph to see a day</span>
        )}
      </div>
      <svg
        ref={ref}
        viewBox={`0 0 ${W} ${H}`}
        className="chart-svg"
        role="img"
        aria-label={`Weight graph, ${points.length} entries, from ${fmt(points[0].value, 1)} to ${fmt(points[points.length - 1].value, 1)} ${unit}`}
        onPointerDown={(e) => {
          ;(e.currentTarget as Element).setPointerCapture?.(e.pointerId)
          pick(e.clientX)
        }}
        onPointerMove={(e) => e.buttons && pick(e.clientX)}
        onPointerUp={() => setTimeout(() => setActive(null), 1500)}
      >
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1={pad.l} x2={W - pad.r} y1={pad.t + f * (H - pad.t - pad.b)} y2={pad.t + f * (H - pad.t - pad.b)} className="chart-grid" />
        ))}
        {style === 'line' ? (
          <>
            <path d={path} className="chart-line" />
            {points.length <= 40 && points.map((p, i) => <circle key={p.date + i} cx={x(i)} cy={y(p.value)} r={3} className="chart-dot" />)}
          </>
        ) : (
          points.map((p, i) => (
            <rect
              key={p.date + i}
              x={x(i) - barW / 2}
              y={y(p.value)}
              width={barW}
              height={H - pad.b - y(p.value)}
              rx={Math.min(4, barW / 2)}
              className={`chart-bar${active === i ? ' chart-bar--on' : ''}`}
            />
          ))
        )}
        {sel && active != null && (
          <>
            <line x1={x(active)} x2={x(active)} y1={pad.t} y2={H - pad.b} className="chart-scrub" />
            <circle cx={x(active)} cy={y(sel.value)} r={6} className="chart-scrub-dot" />
          </>
        )}
        <text x={pad.l} y={H - 6} className="chart-label">
          {shortDate(points[0].date)}
        </text>
        <text x={W - pad.r} y={H - 6} className="chart-label" textAnchor="end">
          {shortDate(points[points.length - 1].date)}
        </text>
      </svg>
    </div>
  )
}
