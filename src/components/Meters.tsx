// Calorie + macro bars and rings (spec §4.1). Over target shows a striped orange tip + "+N over".
import { fmt, r0 } from '../lib/format'

export function Bar({ value, target, color, label, thick }: { value: number; target: number; color: string; label: string; thick?: boolean }) {
  const pct = target > 0 ? Math.min(1, value / target) : 0
  const over = Math.max(0, value - target)
  const overPct = target > 0 && over > 0 ? Math.min(0.35, over / target) : 0
  return (
    <div
      className={`bar${thick ? ' bar--thick' : ''}`}
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={Math.round(target)}
      aria-valuenow={Math.round(value)}
    >
      <div className="bar-fill" style={{ width: `${(overPct ? 1 - overPct : pct) * 100}%`, background: color, color }} />
      {overPct > 0 && <div className="bar-over" style={{ width: `${overPct * 100}%` }} />}
    </div>
  )
}

const MACROS = [
  { key: 'p', letter: 'P', name: 'Protein', color: 'var(--protein)' },
  { key: 'c', letter: 'C', name: 'Carbs', color: 'var(--carbs)' },
  { key: 'f', letter: 'F', name: 'Fat', color: 'var(--fat)' },
] as const

type Totals = { cal: number; p: number; c: number; f: number }
type Goals = { calories: number; protein: number; carbs: number; fat: number }

export function StatCard({
  totals,
  allowance,
  goals,
  mode,
  display,
  onToggle,
}: {
  totals: Totals
  allowance: number
  goals: Goals
  mode: 'eaten' | 'left'
  display: 'bars' | 'rings'
  onToggle: () => void
}) {
  const left = allowance - totals.cal
  const over = left < 0
  const goalFor = { p: goals.protein, c: goals.carbs, f: goals.fat }
  return (
    <button
      className="card stat-card pressable"
      onClick={onToggle}
      aria-label={`Calories, ${r0(totals.cal)} of ${fmt(allowance)}, ${over ? `${fmt(-left)} over` : `${fmt(left)} left`}. Tap to switch view.`}
    >
      <div className="stat-top" key={mode}>
        {mode === 'eaten' ? (
          <span className="big-number">
            {fmt(r0(totals.cal))}
            <span className="big-target"> / {fmt(allowance)}</span>
          </span>
        ) : (
          <span className="big-number">
            {fmt(Math.abs(r0(left)))}
            <span className="big-target"> {over ? 'over' : 'left'}</span>
          </span>
        )}
        <span className="stat-caption">{over ? <span className="over-text">+{fmt(-r0(left))} over</span> : 'calories'}</span>
      </div>
      {display === 'bars' ? (
        <>
          <Bar thick value={totals.cal} target={allowance} color="var(--primary-fill)" label={`Calories, ${r0(totals.cal)} of ${allowance}`} />
          <div className="macro-grid">
            {MACROS.map((m) => {
              const v = totals[m.key]
              const g = goalFor[m.key]
              const shown = mode === 'eaten' ? `${r0(v)}/${r0(g)} g` : v > g ? `+${r0(v - g)} g over` : `${r0(g - v)} g left`
              return (
                <div className="macro" key={m.key}>
                  <div className="macro-head">
                    <span className="macro-letter" style={{ color: m.color }}>
                      {m.letter}
                    </span>
                    <span className="macro-value">{shown}</span>
                  </div>
                  <Bar value={v} target={g} color={m.color} label={`${m.name}, ${r0(v)} of ${r0(g)} grams`} />
                </div>
              )
            })}
          </div>
        </>
      ) : (
        <Rings totals={totals} allowance={allowance} goals={goalFor} mode={mode} />
      )}
    </button>
  )
}

function Rings({ totals, allowance, goals, mode }: { totals: Totals; allowance: number; goals: { p: number; c: number; f: number }; mode: 'eaten' | 'left' }) {
  const rings = [
    { v: totals.cal, g: allowance, color: 'var(--primary-fill)', label: 'Calories' },
    { v: totals.p, g: goals.p, color: 'var(--protein)', label: 'Protein' },
    { v: totals.c, g: goals.c, color: 'var(--carbs)', label: 'Carbs' },
    { v: totals.f, g: goals.f, color: 'var(--fat)', label: 'Fat' },
  ]
  const size = 150
  return (
    <div className="rings">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        {rings.map((r, i) => {
          const radius = 66 - i * 15
          const circ = 2 * Math.PI * radius
          const pct = r.g > 0 ? Math.min(1, r.v / r.g) : 0
          const over = r.v > r.g
          return (
            <g key={r.label} transform={`rotate(-90 ${size / 2} ${size / 2})`}>
              <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--raised)" strokeWidth={11} />
              <circle
                className="ring-arc"
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={over ? 'var(--warning)' : r.color}
                strokeWidth={11}
                strokeLinecap="round"
                strokeDasharray={`${circ * pct} ${circ}`}
              />
            </g>
          )
        })}
      </svg>
      <ul className="ring-legend">
        {rings.slice(1).map((r) => (
          <li key={r.label}>
            <span className="macro-letter" style={{ color: r.color }}>
              {r.label[0]}
            </span>{' '}
            {mode === 'eaten' ? `${r0(r.v)}/${r0(r.g)} g` : r.v > r.g ? `+${r0(r.v - r.g)} g over` : `${r0(r.g - r.v)} g left`}
          </li>
        ))}
      </ul>
    </div>
  )
}

export function MiniCalorieBar({ eaten, allowance }: { eaten: number; allowance: number }) {
  return (
    <div className="mini-bar">
      <Bar value={eaten} target={allowance} color="var(--primary-fill)" label={`Calories, ${r0(eaten)} of ${allowance}`} />
      <span className="mini-bar-text">
        {fmt(r0(eaten))} / {fmt(allowance)}
      </span>
    </div>
  )
}
