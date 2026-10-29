// Saved meals: a named group of foods you log as one item ("Usual breakfast").
// Open one to see every food that makes up its calories and macros, and tweak it.
import { useState } from 'react'
import { Plus, Trash, X } from '@phosphor-icons/react'
import { Sheet } from '../components/Sheet'
import { Button, Field, Note } from '../components/ui'
import { MealBubble } from '../components/Pickers'
import { deleteMeal, list, saveMeal, today, useList } from '../lib/store'
import { addEntry } from '../lib/logging'
import { addToTray, trayActive } from '../lib/tray'
import { closeSheet, confirm, openSheet, toast } from '../lib/ui'
import { amountLabel, fmt, r0 } from '../lib/format'
import { loadLibrary, type LibFood } from '../lib/foods'
import { savedBrand } from '../lib/brands'
import { getState } from '../lib/store'
import { customToLib } from '../lib/foods'
import { defaultMeal, openLogForSavedMeal, PortionSheet } from './Log'
import type { FoodTemplate, Meal, SavedMeal } from '../../shared/types'

type Item = Omit<FoodTemplate, 'key' | 'at'>

export const mealTotals = (m: { items: Item[] }) =>
  m.items.reduce((a, i) => ({ cal: a.cal + i.cal, p: a.p + i.p, c: a.c + i.c, f: a.f + i.f }), { cal: 0, p: 0, c: 0, f: 0 })

/** A saved meal logged as one line: "Usual breakfast · 1 meal · 540 cal". */
export function savedMealTemplate(m: SavedMeal): Item {
  const t = mealTotals(m)
  return { foodId: `m:${m.key}`, name: m.name, qty: 1, unit: 'meal', cal: t.cal, p: t.p, c: t.c, f: t.f }
}

/** A saved meal as a food, so a logged meal can be changed to ½ or 2 meals. */
export function savedMealFood(m: SavedMeal): LibFood {
  const t = mealTotals(m)
  return { id: `m:${m.key}`, name: m.name, perServing: t, units: [{ label: 'meal' }], featured: true }
}

export function pushSavedMeal(key: string) {
  openSheet(<SavedMealSheet mealKey={key} />)
}

const newKey = () => Math.random().toString(36).slice(2, 10)

/** Name and save a group of foods. */
export function SaveMealSheet({ items, name: n0 = '' }: { items: Item[]; name?: string }) {
  const [name, setName] = useState(n0)
  const t = mealTotals({ items })
  const save = () => {
    saveMeal({ key: newKey(), name: name.trim() || 'My meal', items, at: new Date().toISOString() })
    toast(`Saved “${name.trim() || 'My meal'}”`)
    closeSheet()
  }
  return (
    <Sheet title="Save as a meal">
      <Field label="Meal name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Usual breakfast" autoFocus />
      <p className="muted small">
        {items.length} food{items.length === 1 ? '' : 's'} · {fmt(r0(t.cal))} cal · P {r0(t.p)} · C {r0(t.c)} · F {r0(t.f)}
      </p>
      <Button onClick={save} className="sheet-cta">
        Save meal
      </Button>
    </Sheet>
  )
}

async function foodFor(foodId: string): Promise<LibFood | undefined> {
  if (foodId.startsWith('b:')) return savedBrand(foodId)
  const custom = getState().customFoods.find((c) => `c:${c.id}` === foodId)
  if (custom) return customToLib(custom)
  try {
    return (await loadLibrary()).find((f) => f.id === foodId)
  } catch {
    return undefined
  }
}

/** See every food in a saved meal, change amounts, remove or add foods, and log it. */
export function SavedMealSheet({ mealKey }: { mealKey: string }) {
  const meals = useList<SavedMeal>('meals')
  const m = meals.find((x) => x.key === mealKey)
  const [name, setName] = useState(m?.name ?? '')
  const [meal, setMeal] = useState<Meal>(defaultMeal())
  const inTray = trayActive()
  if (!m)
    return (
      <Sheet title="Saved meal">
        <Note>This meal was deleted.</Note>
      </Sheet>
    )
  const t = mealTotals(m)
  const update = (patch: Partial<SavedMeal>) => saveMeal({ ...m, ...patch, at: new Date().toISOString() })
  const setItem = (i: number, item: Item | null) => {
    const items = [...m.items]
    if (item) items[i] = item
    else items.splice(i, 1)
    update({ items })
  }
  const log = () => {
    const item = savedMealTemplate(m)
    if (inTray) {
      addToTray(item)
      toast(`${m.name} added to the list`)
    } else addEntry(today(), { ...item, meal }, 'saved_meal')
    closeSheet()
  }
  return (
    <Sheet
      tall
      title="Saved meal"
      right={
        <button
          className="icon-btn pressable"
          aria-label="Delete this saved meal"
          onClick={async () => {
            if (!(await confirm({ title: `Delete “${m.name}”?`, message: 'Meals you already logged stay in your history.', confirm: 'Delete', destructive: true }))) return
            deleteMeal(m.key)
            closeSheet()
            toast('Saved meal deleted')
          }}
        >
          <Trash size={20} />
        </button>
      }
    >
      <Field label="Name" value={name} onChange={(e) => setName(e.target.value)} onBlur={() => name.trim() && name.trim() !== m.name && update({ name: name.trim() })} />
      <div className="meal-total">
        <span className="big-number">{fmt(r0(t.cal))}</span>
        <span className="muted"> cal</span>
        <div className="plan-macros">
          <span>
            <b style={{ color: 'var(--protein)' }}>P</b> {r0(t.p)} g
          </span>
          <span>
            <b style={{ color: 'var(--carbs)' }}>C</b> {r0(t.c)} g
          </span>
          <span>
            <b style={{ color: 'var(--fat)' }}>F</b> {r0(t.f)} g
          </span>
        </div>
      </div>
      <h3 className="list-title">What's in it</h3>
      <ul className="list">
        {m.items.map((it, i) => (
          <li key={`${it.foodId}-${i}`} className="food-row-wrap">
            <button
              className="food-row pressable"
              onClick={async () => {
                const food = await foodFor(it.foodId)
                if (!food) return toast("This food can't be changed here — remove it and add it again", { tone: 'error' })
                openSheet(<PortionSheet food={food} ctx={{ date: today(), meal }} method="saved_meal" initial={{ qty: it.qty, unit: it.unit }} onSave={(next) => setItem(i, next)} />)
              }}
            >
              <span className="food-name">{it.name}</span>
              <span className="food-sub">
                {amountLabel(it.qty, it.unit)} · {r0(it.cal)} cal · P {r0(it.p)} · C {r0(it.c)} · F {r0(it.f)}
              </span>
            </button>
            <button className="icon-btn pressable" onClick={() => setItem(i, null)} aria-label={`Remove ${it.name}`}>
              <X size={18} weight="bold" />
            </button>
          </li>
        ))}
      </ul>
      <Button kind="secondary" onClick={() => openLogForSavedMeal(m.key)}>
        <Plus size={18} weight="bold" aria-hidden /> Add foods
      </Button>
      {!inTray && <MealBubble value={meal} onChange={setMeal} prefix="Log to" />}
      <Button onClick={log} disabled={!m.items.length} className="sheet-cta">
        {inTray ? 'Add to list' : 'Log this meal'}
      </Button>
    </Sheet>
  )
}

/** Every saved meal (Settings → Saved meals). */
export function savedMealsCount() {
  return list<SavedMeal>('meals').items.length
}
