// "How fast?" — weekly pace for lose/gain goals. Sets the daily calorie gap from maintenance.
import { ChipRow } from './Pickers'
import { GAIN_PACES, LOSE_PACES, paceAllowed, paceToDaily, LB_PER_KG } from '../../shared/calc'
import type { Goal, Units } from '../../shared/types'

export function paceLabel(lb: number, units: Units): string {
  if (units === 'metric') return `${(lb / LB_PER_KG).toFixed(lb < 0.5 ? 2 : 1).replace(/\.0$/, '')} kg`
  return `${lb} lb`
}

export function PacePicker({ goal, value, onChange, kg, units }: { goal: Goal; value: number; onChange: (v: number) => void; kg: number; units: Units }) {
  if (goal === 'maintain') return null
  const paces = (goal === 'lose' ? LOSE_PACES : GAIN_PACES).filter((p) => paceAllowed(goal, p, kg))
  const daily = Math.round(paceToDaily(value) / 10) * 10
  return (
    <div className="pace-picker">
      <span className="field-label">{goal === 'lose' ? 'Lose per week' : 'Gain per week'}</span>
      <ChipRow
        label="Weekly pace"
        value={value}
        onChange={onChange}
        options={paces.map((p) => ({ value: p, label: paceLabel(p, units), sub: p === (goal === 'lose' ? 1 : 0.5) ? 'Steady' : p === paces[paces.length - 1] && goal === 'lose' ? 'Fastest' : undefined }))}
      />
      <p className="muted small">
        {goal === 'lose' ? `About ${daily.toLocaleString()} cal under` : `About ${daily.toLocaleString()} cal over`} your maintenance each day. Workouts and steps add calories on top.
      </p>
    </div>
  )
}
