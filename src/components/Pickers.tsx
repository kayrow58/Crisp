// Themed pickers (instead of the iPhone's built-in wheel): unit bubbles and the meal bubble.
import { useEffect, useRef, useState } from 'react'
import { CaretDown, Check } from '@phosphor-icons/react'
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

/** Themed dropdown (instead of the iPhone wheel): shows the choice, opens a list right below it. */
export function Dropdown<T extends string | number>({
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
  const [open, setOpen] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)
  const current = options.find((o) => o.value === value) ?? options[0]
  // Open with the current choice in view (e.g. "6:00 PM", not the top of a 24-hour list).
  useEffect(() => {
    const list = listRef.current
    const sel = list?.querySelector<HTMLElement>('[aria-selected="true"]')
    if (list && sel) list.scrollTop = sel.offsetTop - list.clientHeight / 2 + sel.clientHeight / 2
  }, [open])
  return (
    <div className="dropdown">
      <span className="dropdown-label">{label}</span>
      <button className={`dropdown-btn pressable${open ? ' dropdown-btn--open' : ''}`} onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="listbox" aria-label={`${label}: ${current?.label}`}>
        <span className="dropdown-value">
          {current?.label}
          {current?.sub && <span className="dropdown-sub"> · {current.sub}</span>}
        </span>
        <CaretDown size={16} weight="bold" className={`meal-caret${open ? ' meal-caret--open' : ''}`} aria-hidden />
      </button>
      {open && (
        <div className="dropdown-list" role="listbox" aria-label={label} ref={listRef}>
          {options.map((o) => {
            const on = o.value === value
            return (
              <button
                key={String(o.value)}
                role="option"
                aria-selected={on}
                className={`dropdown-item${on ? ' dropdown-item--on' : ''}`}
                onClick={() => {
                  onChange(o.value)
                  setOpen(false)
                }}
              >
                <span>{o.label}</span>
                {o.sub && <span className="dropdown-sub">{o.sub}</span>}
                {on && <Check size={16} weight="bold" className="dropdown-check" aria-hidden />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

/** Unit dropdown for a food: grams, ounces and the food's own servings. */
export function unitOptions(units: { label: string; grams?: number }[]) {
  return units.map((u, i) => ({
    value: i,
    label: u.label === 'g' ? 'grams' : u.label === 'oz' ? 'ounces' : u.label,
    sub: u.grams && u.label !== 'g' && u.label !== 'oz' ? `${Math.round(u.grams * 10) / 10} g` : undefined,
  }))
}
