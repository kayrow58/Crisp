import { useMemo } from 'react'
import { prefersReducedMotion } from '../lib/format'

const COLORS = ['var(--primary)', 'var(--protein)', 'var(--carbs)', 'var(--fat)']

export function Confetti({ pieces = 60 }: { pieces?: number }) {
  const bits = useMemo(
    () =>
      Array.from({ length: pieces }, (_, i) => ({
        left: Math.random() * 100,
        delay: Math.random() * 0.4,
        dur: 1.6 + Math.random() * 1.2,
        rot: Math.random() * 360,
        color: COLORS[i % COLORS.length],
        size: 6 + Math.random() * 6,
      })),
    [pieces],
  )
  if (prefersReducedMotion()) return null
  return (
    <div className="confetti" aria-hidden>
      {bits.map((b, i) => (
        <span
          key={i}
          style={{
            left: `${b.left}%`,
            background: b.color,
            width: b.size,
            height: b.size * 0.45,
            animationDelay: `${b.delay}s`,
            animationDuration: `${b.dur}s`,
            transform: `rotate(${b.rot}deg)`,
          }}
        />
      ))}
    </div>
  )
}
