// Recipes: describe a meal once (by search or AI), save it, and log it by the serving after that —
// no new AI search each time. Meal prep: "makes 5" → macros per container.
// (Stored as the 'meals' list; older "saved meals" are recipes with 1 serving.)
import { useState } from 'react'
import { Minus, Plus, PlusCircle, Trash, X } from '@phosphor-icons/react'
import { Sheet } from '../components/Sheet'
import { Button, Field, Note } from '../components/ui'
import { MealBubble } from '../components/Pickers'
import { CrispMark } from '../components/CrispMark'
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
import { AiMealSheet } from './AiMeal'
import type { FoodTemplate, Meal, SavedMeal } from '../../shared/types'

type Item = Omit<FoodTemplate, 'key' | 'at'>

export const mealTotals = (m: { items: Item[] }) =>
  m.items.reduce((a, i) => ({ cal: a.cal + i.cal, p: a.p + i.p, c: a.c + i.c, f: a.f + i.f }), { cal: 0, p: 0, c: 0, f: 0 })

const servingsOf = (m: SavedMeal) => Math.max(1, m.servings ?? 1)

/** Macros for one serving of a recipe. */
export function perServing(m: SavedMeal) {
  const t = mealTotals(m)
  const n = servingsOf(m)
  return { cal: t.cal / n, p: t.p / n, c: t.c / n, f: t.f / n }
}

/** A recipe logged as one line: "Chicken rice bowl · 1 serving · 540 cal". */
export function savedMealTemplate(m: SavedMeal, qty = 1): Item {
  const s = perServing(m)
  return { foodId: `m:${m.key}`, name: m.name, qty, unit: 'serving', cal: s.cal * qty, p: s.p * qty, c: s.c * qty, f: s.f * qty }
}

/** A recipe as a food, so a logged serving can be changed to ½ or 2 servings. */
export function savedMealFood(m: SavedMeal): LibFood {
  return { id: `m:${m.key}`, name: m.name, perServing: perServing(m), units: [{ label: 'serving' }], featured: true }
}

export function pushSavedMeal(key: string) {
  openSheet(<SavedMealSheet mealKey={key} />)
}

export function openRecipes() {
  openSheet(<RecipesSheet />)
}

const newKey = () => Math.random().toString(36).slice(2, 10)

/** Name and save a group of foods as a recipe. */
export function SaveMealSheet({ items, name: n0 = '', onSaved }: { items: Item[]; name?: string; onSaved?: () => void }) {
  const [name, setName] = useState(n0)
  const [servings, setServings] = useState(1)
  const t = mealTotals({ items })
  const save = () => {
    const nm = name.trim() || 'My recipe'
    saveMeal({ key: newKey(), name: nm, items, servings, at: new Date().toISOString() })
    toast(`Saved “${nm}” to Recipes`)
    closeSheet()
    onSaved?.()
  }
  return (
    <Sheet title="Save as a recipe">
      <Field label="Recipe name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Chicken rice bowl" autoFocus />
      <ServingsStepper value={servings} onChange={setServings} />
      <p className="muted small">
        {items.length} food{items.length === 1 ? '' : 's'} · per serving {fmt(r0(t.cal / servings))} cal · P {r0(t.p / servings)} · C {r0(t.c / servings)} · F {r0(t.f / servings)}
      </p>
      <Button onClick={save} className="sheet-cta">
        Save recipe
      </Button>
    </Sheet>
  )
}

function ServingsStepper({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="servings-row">
      <span>
        <strong>Makes</strong>
        <span className="muted small"> — for meal prep, how many portions</span>
      </span>
      <div className="stepper">
        <button className="stepper-btn pressable" onClick={() => onChange(Math.max(1, value - 1))} aria-label="Fewer servings">
          <Minus size={18} weight="bold" />
        </button>
        <span className="stepper-val">
          {value} serving{value === 1 ? '' : 's'}
        </span>
        <button className="stepper-btn pressable" onClick={() => onChange(Math.min(50, value + 1))} aria-label="More servings">
          <Plus size={18} weight="bold" />
        </button>
      </div>
    </div>
  )
}

/** All recipes: open one, log a serving, or make a new one (with AI or from foods). */
function RecipesSheet() {
  const recipes = useList<SavedMeal>('meals')
  const inTray = trayActive()
  const newFromFoods = () => {
    const key = newKey()
    saveMeal({ key, name: 'New recipe', items: [], servings: 1, at: new Date().toISOString() })
    openSheet(<SavedMealSheet mealKey={key} />)
  }
  return (
    <Sheet tall title="Recipes">
      <p className="muted small">Describe a meal once, then log it by the serving — no new AI search each time.</p>
      <div className="quick-row">
        <Button kind="secondary" onClick={() => openSheet(<AiMealSheet date={today()} meal={defaultMeal()} newRecipe />)}>
          <CrispMark size={18} /> New with AI
        </Button>
        <Button kind="secondary" onClick={newFromFoods}>
          <Plus size={18} weight="bold" aria-hidden /> From foods
        </Button>
      </div>
      {recipes.length ? (
        <ul className="list">
          {recipes.map((m) => {
            const s = perServing(m)
            const n = servingsOf(m)
            return (
              <li key={m.key} className="food-row-wrap">
                <button className="food-row pressable" onClick={() => pushSavedMeal(m.key)}>
                  <span className="food-name">{m.name}</span>
                  <span className="food-sub">
                    {fmt(r0(s.cal))} cal per serving · P {r0(s.p)} · C {r0(s.c)} · F {r0(s.f)}
                    {n > 1 ? ` · makes ${n}` : ''}
                  </span>
                </button>
                <button
                  className="relog pressable"
                  disabled={!m.items.length}
                  onClick={() => {
                    const item = savedMealTemplate(m)
                    if (inTray) {
                      addToTray(item)
                      toast(`1 serving of ${m.name} added to the list`)
                    } else {
                      addEntry(today(), { ...item, meal: defaultMeal() }, 'saved_meal')
                    }
                  }}
                  aria-label={`Log 1 serving of ${m.name}`}
                >
                  <PlusCircle size={30} weight="fill" aria-hidden />
                </button>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="muted center pad">No recipes yet. Tell the AI what's in your usual meal and save it here.</p>
      )}
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

/** One recipe: what's in it, servings, per-serving macros; change it; log N servings. */
export function SavedMealSheet({ mealKey }: { mealKey: string }) {
  const meals = useList<SavedMeal>('meals')
  const m = meals.find((x) => x.key === mealKey)
  const [name, setName] = useState(m?.name ?? '')
  const [meal, setMeal] = useState<Meal>(defaultMeal())
  const [qty, setQty] = useState(1)
  const inTray = trayActive()
  if (!m)
    return (
      <Sheet title="Recipe">
        <Note>This recipe was deleted.</Note>
      </Sheet>
    )
  const n = servingsOf(m)
  const t = mealTotals(m)
  const s = perServing(m)
  const update = (patch: Partial<SavedMeal>) => saveMeal({ ...m, ...patch, at: new Date().toISOString() })
  const setItem = (i: number, item: Item | null) => {
    const items = [...m.items]
    if (item) items[i] = item
    else items.splice(i, 1)
    update({ items })
  }
  const log = () => {
    const item = savedMealTemplate(m, qty)
    if (inTray) {
      addToTray(item)
      toast(`${m.name} added to the list`)
    } else addEntry(today(), { ...item, meal }, 'saved_meal')
    closeSheet()
  }
  return (
    <Sheet
      tall
      title="Recipe"
      right={
        <button
          className="icon-btn pressable"
          aria-label="Delete this recipe"
          onClick={async () => {
            if (!(await confirm({ title: `Delete “${m.name}”?`, message: 'Servings you already logged stay in your history.', confirm: 'Delete', destructive: true }))) return
            deleteMeal(m.key)
            closeSheet()
            toast('Recipe deleted')
          }}
        >
          <Trash size={20} />
        </button>
      }
    >
      <Field label="Name" value={name} onChange={(e) => setName(e.target.value)} onBlur={() => name.trim() && name.trim() !== m.name && update({ name: name.trim() })} />
      <ServingsStepper value={n} onChange={(v) => update({ servings: v })} />
      <div className="meal-total">
        <span className="big-number">{fmt(r0(s.cal))}</span>
        <span className="muted"> cal per serving</span>
        <div className="plan-macros">
          <span>
            <b style={{ color: 'var(--protein-ink)' }}>P</b> {r0(s.p)} g
          </span>
          <span>
            <b style={{ color: 'var(--carbs-ink)' }}>C</b> {r0(s.c)} g
          </span>
          <span>
            <b style={{ color: 'var(--fat-ink)' }}>F</b> {r0(s.f)} g
          </span>
        </div>
        {n > 1 && <p className="muted small">Whole recipe: {fmt(r0(t.cal))} cal</p>}
      </div>
      <h3 className="list-title">What's in it</h3>
      {m.items.length ? (
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
      ) : (
        <p className="muted small">Nothing in it yet — add foods by search or tell the AI.</p>
      )}
      <div className="quick-row">
        <Button kind="secondary" onClick={() => openSheet(<AiMealSheet date={today()} meal={meal} recipeKey={m.key} />)}>
          <CrispMark size={18} /> Add with AI
        </Button>
        <Button kind="secondary" onClick={() => openLogForSavedMeal(m.key)}>
          <Plus size={18} weight="bold" aria-hidden /> Add foods
        </Button>
      </div>
      <div className="recipe-log">
        {!inTray && <MealBubble value={meal} onChange={setMeal} prefix="Log to" />}
        <div className="stepper">
          <button className="stepper-btn pressable" onClick={() => setQty(Math.max(0.5, qty - 0.5))} aria-label="Less">
            <Minus size={18} weight="bold" />
          </button>
          <span className="stepper-val">
            {fmt(qty, 1)} serving{qty === 1 ? '' : 's'}
          </span>
          <button className="stepper-btn pressable" onClick={() => setQty(qty + 0.5)} aria-label="More">
            <Plus size={18} weight="bold" />
          </button>
        </div>
      </div>
      <Button onClick={log} disabled={!m.items.length} className="sheet-cta">
        {inTray ? 'Add' : 'Log'} {fmt(qty, 1)} serving{qty === 1 ? '' : 's'}
        {inTray ? ' to list' : ''} · {fmt(r0(s.cal * qty))} cal
      </Button>
    </Sheet>
  )
}

/** How many recipes there are. */
export function savedMealsCount() {
  return list<SavedMeal>('meals').items.length
}
