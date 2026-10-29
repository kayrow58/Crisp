// Opening animation: the three bars fill in turn to draw the squared "C" (pink → cyan → yellow,
// following the letter's stroke), glow, slide away bar by bar, then the splash swipes off to the app.
// Geometry matches the app icon (scripts/build-icons.mjs, 512 canvas). Tap anywhere to skip.
import { useEffect, useState } from 'react'

export const SPLASH_MS = 2600

const pct = (n: number) => `${(n / 512) * 100}%`
const T = 66
const GAP = 16
const X0 = 106
const W = 300
const BARS = [
  { name: 'pink', x: X0, y: X0, w: W, h: T, from: 'right' },
  { name: 'cyan', x: X0, y: X0 + T + GAP, w: T, h: W - 2 * T - 2 * GAP, from: 'top' },
  { name: 'yellow', x: X0, y: X0 + W - T, w: W, h: T, from: 'left' },
] as const

export function Splash({ onDone }: { onDone: () => void }) {
  const [leaving, setLeaving] = useState(false)
  useEffect(() => {
    const t = setTimeout(onDone, SPLASH_MS)
    return () => clearTimeout(t)
  }, [onDone])
  const skip = () => {
    if (leaving) return
    setLeaving(true)
    setTimeout(onDone, 260)
  }
  return (
    <div className={`splash${leaving ? ' splash--skip' : ''}`} onPointerDown={skip} aria-hidden>
      <div className="splash-logo">
        {BARS.map((b, i) => (
          <div
            key={b.name}
            className={`splash-bar splash-bar--${b.name} splash-bar--from-${b.from}`}
            style={{ left: pct(b.x), top: pct(b.y), width: pct(b.w), height: pct(b.h), ['--i' as string]: i }}
          >
            <div className="splash-fill" />
          </div>
        ))}
      </div>
    </div>
  )
}
