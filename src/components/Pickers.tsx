// Themed pickers (instead of the iPhone's built-in wheel): unit bubbles and the meal bubble.
import { useState } from 'react'
import { CaretDown } from '@phosphor-icons/react'
import type { Meal } from '../../shared/types'
import { useMeals } from '../lib/meals'

/** A horizontally scrolling row of bubbles; one is selected. */
export function ChipRow<T extends string | number>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string; sub?: string }[]
  value: T
  onChange: (v: T) => void
  label: string
}) {
  return (
    <div className="chip-row" role="radiogroup" aria-label={label}>
      {options.map((o) => {
        const on = o.value === value
        return (
          <button key={String(o.value)} role="radio" aria-checked={on} className={`bubble pressable${on ? ' bubble--on' : ''}`} onClick={() => onChange(o.value)}>
            <span>{o.label}</span>
            {o.sub && <span className="bubble-sub">{o.sub}</span>}
          </button>
        )
      })}
    </div>
  )
}

/** A meal bubble that opens into a set of meal bubbles right where it is. */
export function MealBubble({ value, onChange, prefix = 'Log to' }: { value: Meal; onChange: (m: Meal) => void; prefix?: string }) {
  const meals = useMeals()
  const [open, setOpen] = useState(false)
  const current = meals.find((m) => m.id === value)?.label ?? 'Snacks'
  return (
    <div className="meal-bubble">
      <button className="meal-chip pressable" onClick={() => setOpen(!open)} aria-expanded={open} aria-label={`${prefix}: ${current}. Change meal`}>
        <span>{prefix}:</span> <strong>{current}</strong>
        <CaretDown size={14} weight="bold" className={`meal-caret${open ? ' meal-caret--open' : ''}`} aria-hidden />
      </button>
      {open && (
        <div className="meal-options" role="radiogroup" aria-label="Meal">
          {meals.map((m) => (
            <button
              key={m.id}
              role="radio"
              aria-checked={m.id === value}
              className={`bubble pressable${m.id === value ? ' bubble--on' : ''}`}
              onClick={() => {
                onChange(m.id)
                setOpen(false)
              }}
            >
              {m.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
