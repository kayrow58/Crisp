import './StatCardPreview.css'

// Static preview of the Home stat card so the neon look can be checked on a real phone.
// Sample numbers only — the real card (bars/rings, over-target, eaten↔left) is built in M6.

type Bar = { key: string; label: string; value: number; target: number; unit: string; color: string }

const calories = { value: 900, target: 1600 }
const macros: Bar[] = [
  { key: 'p', label: 'P', value: 80, target: 120, unit: 'g', color: 'var(--protein)' },
  { key: 'c', label: 'C', value: 90, target: 160, unit: 'g', color: 'var(--carbs)' },
  { key: 'f', label: 'F', value: 30, target: 53, unit: 'g', color: 'var(--fat)' },
]

function Meter({ value, target, color, label }: { value: number; target: number; color: string; label: string }) {
  const pct = Math.min(100, (value / target) * 100)
  return (
    <div
      className="meter"
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={target}
      aria-valuenow={value}
    >
      <div className="meter-fill" style={{ width: `${pct}%`, background: color, color }} />
    </div>
  )
}

export default function StatCardPreview() {
  return (
    <section className="stat-card" aria-label="Today's totals (sample)">
      <div className="stat-calories">
        <span className="big-number">
          {calories.value.toLocaleString()}
          <span className="big-number-target"> / {calories.target.toLocaleString()}</span>
        </span>
        <span className="stat-caption">calories · sample</span>
      </div>
      <Meter
        value={calories.value}
        target={calories.target}
        color="var(--primary-fill)"
        label={`Calories, ${calories.value} of ${calories.target}`}
      />

      <div className="macro-row">
        {macros.map((m) => (
          <div className="macro" key={m.key}>
            <div className="macro-head">
              <span className="macro-label" style={{ color: m.color }}>
                {m.label}
              </span>
              <span className="macro-value">
                {m.value}/{m.target} {m.unit}
              </span>
            </div>
            <Meter
              value={m.value}
              target={m.target}
              color={m.color}
              label={`${m.label === 'P' ? 'Protein' : m.label === 'C' ? 'Carbs' : 'Fat'}, ${m.value} of ${m.target} grams`}
            />
          </div>
        ))}
      </div>
    </section>
  )
}
