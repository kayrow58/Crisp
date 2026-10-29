// Log sheet (+), portion card, Quick add, Create food (spec §3.4–3.5, §4.3–4.4).
import { useEffect, useMemo, useRef, useState } from 'react'
import { Lightning, MagnifyingGlass, Minus, Plus, PlusCircle, Star } from '@phosphor-icons/react'
import { Sheet } from '../components/Sheet'
import { Button, Field, Note, Shimmer } from '../components/ui'
import { customToLib, loadLibrary, macrosFor, searchFoods, type LibFood } from '../lib/foods'
import { addEntry, logTemplate, updateEntry, type LogMethod } from '../lib/logging'
import { getState, setCustomFoods, track, useList, useStore } from '../lib/store'
import { closeAllSheets, closeSheet, openSheet, toast } from '../lib/ui'
import { MEAL_LABEL, MEALS, fmt, r0 } from '../lib/format'
import { api, errorMessage } from '../lib/api'
import { mealForHour } from '../../shared/calc'
import { hourInZone } from '../../shared/dates'
import type { CustomFood, FoodEntry, FoodTemplate, Meal } from '../../shared/types'

export function defaultMeal(): Meal {
  return mealForHour(hourInZone(new Date(), getState().profile?.timeZone))
}

export function openLog(date: string, meal?: Meal) {
  openSheet(<LogSheet date={date} initialMeal={meal ?? defaultMeal()} />)
}

function MealPicker({ value, onChange, prefix = 'Log to' }: { value: Meal; onChange: (m: Meal) => void; prefix?: string }) {
  return (
    <label className="meal-chip">
      <span>{prefix}:</span>
      <select value={value} onChange={(e) => onChange(e.target.value as Meal)} aria-label="Meal">
        {MEALS.map((m) => (
          <option key={m} value={m}>
            {MEAL_LABEL[m]}
          </option>
        ))}
      </select>
      <span aria-hidden>▾</span>
    </label>
  )
}

function useLibrary() {
  const [lib, setLib] = useState<LibFood[] | null>(null)
  const [err, setErr] = useState(false)
  const custom = useStore((s) => s.customFoods)
  useEffect(() => {
    loadLibrary().then(setLib, () => setErr(true))
  }, [])
  const all = useMemo(() => [...custom.map(customToLib), ...(lib ?? [])], [lib, custom])
  return { all, loading: !lib && !err, err }
}

export function findFood(all: LibFood[], foodId: string) {
  return all.find((f) => f.id === foodId)
}

function LogSheet({ date, initialMeal }: { date: string; initialMeal: Meal }) {
  const [meal, setMeal] = useState(initialMeal)
  const [q, setQ] = useState('')
  const { all, loading, err } = useLibrary()
  const recents = useList<FoodTemplate>('recents')
  const favorites = useList<FoodTemplate>('favorites')
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const t = setTimeout(() => input.current?.focus(), 250)
    return () => clearTimeout(t)
  }, [])
  const results = useMemo(() => (q.trim() ? searchFoods(all, q) : []), [all, q])

  const quickRelog = (t: FoodTemplate, method: LogMethod) => {
    logTemplate(date, t, meal, method)
    closeSheet()
  }

  return (
    <Sheet tall title="Log food" dirty={false}>
      <MealPicker value={meal} onChange={setMeal} />
      <div className="search">
        <MagnifyingGlass size={18} className="search-icon" aria-hidden />
        <input
          ref={input}
          className="input search-input"
          placeholder="Search foods…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Search foods"
          type="search"
          enterKeyHint="search"
        />
      </div>
      <div className="quick-row">
        <Button kind="secondary" onClick={() => openSheet(<QuickAddSheet date={date} meal={meal} />)}>
          <Lightning size={18} weight="fill" aria-hidden /> Quick add
        </Button>
        <Button kind="secondary" onClick={() => openSheet(<CreateFoodSheet date={date} meal={meal} name={q} />)}>
          <Plus size={18} weight="bold" aria-hidden /> Create food
        </Button>
      </div>

      {q.trim() ? (
        loading ? (
          <div className="stack">
            <Shimmer />
            <Shimmer />
            <Shimmer />
          </div>
        ) : results.length ? (
          <ul className="list">
            {results.map((f) => (
              <li key={f.id}>
                <button className="food-row pressable" onClick={() => openSheet(<PortionSheet food={f} date={date} meal={meal} method={f.custom ? 'custom' : 'search'} />)}>
                  <span className="food-name">{f.name}</span>
                  <span className="food-sub">
                    {f.perServing ? `${r0(f.perServing.cal)} cal · ${f.units[0].label}` : `${r0(macrosFor(f, 0, 1).cal)} cal · ${f.units[0].label}`}
                    {f.createdByName && <span className="by"> · added by {f.createdByName}</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="empty empty--small">
            <MagnifyingGlass size={40} className="empty-icon" aria-hidden />
            <p className="empty-text">No match for “{q}”.</p>
            <div className="quick-row">
              <Button onClick={() => openSheet(<CreateFoodSheet date={date} meal={meal} name={q} />)}>＋ Create it</Button>
              <Button kind="secondary" onClick={() => openSheet(<QuickAddSheet date={date} meal={meal} name={q} />)}>
                ⚡ Quick add
              </Button>
            </div>
          </div>
        )
      ) : (
        <>
          {err && <Note tone="error">The food library didn't load. Check your connection and try again — Quick add still works.</Note>}
          <TemplateList title="Recent" items={recents} onLog={(t) => quickRelog(t, 'recent')} all={all} date={date} meal={meal} method="recent" />
          <TemplateList title="Favorites ★" items={favorites} onLog={(t) => quickRelog(t, 'favorite')} all={all} date={date} meal={meal} method="favorite" />
          {!recents.length && !favorites.length && <p className="muted center pad">Foods you log will show up here.</p>}
        </>
      )}
    </Sheet>
  )
}

function TemplateList({
  title,
  items,
  onLog,
  all,
  date,
  meal,
  method,
}: {
  title: string
  items: FoodTemplate[]
  onLog: (t: FoodTemplate) => void
  all: LibFood[]
  date: string
  meal: Meal
  method: LogMethod
}) {
  if (!items.length) return null
  return (
    <section>
      <h3 className="list-title">{title}</h3>
      <ul className="list">
        {items.slice(0, 15).map((t) => {
          const food = findFood(all, t.foodId)
          return (
            <li key={t.key} className="food-row-wrap">
              <button
                className="food-row pressable"
                onClick={() => (food ? openSheet(<PortionSheet food={food} date={date} meal={meal} method={method} initial={t} />) : onLog(t))}
              >
                <span className="food-name">{t.name}</span>
                <span className="food-sub">
                  {fmt(t.qty, 2)} {t.unit} · {r0(t.cal)} cal
                </span>
              </button>
              <button className="relog pressable" onClick={() => onLog(t)} aria-label={`Log ${t.name} again, ${fmt(t.qty, 2)} ${t.unit}`}>
                <PlusCircle size={30} weight="fill" aria-hidden />
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/** Portion card: stepper + unit picker + live macros (spec §4.4). Also used to edit a logged food. */
export function PortionSheet({
  food,
  date,
  meal: initialMeal,
  method,
  initial,
  editing,
}: {
  food: LibFood
  date: string
  meal: Meal
  method: LogMethod
  initial?: { qty: number; unit: string }
  editing?: FoodEntry
}) {
  const startUnit = Math.max(0, initial ? food.units.findIndex((u) => u.label === initial.unit) : 0)
  const [unit, setUnit] = useState(startUnit)
  const [qtyText, setQtyText] = useState(String(initial?.qty ?? (food.units[startUnit]?.label === 'g' ? 100 : 1)))
  const [meal, setMeal] = useState(editing?.meal ?? initialMeal)
  const qty = Math.max(0, Number(qtyText) || 0)
  const m = macrosFor(food, unit, qty)
  const isGrams = food.units[unit]?.label === 'g'
  const step = isGrams ? 10 : food.units[unit]?.label === 'oz' ? 1 : 0.5
  const bump = (d: number) => setQtyText(String(Math.max(0, Math.round((qty + d) * 100) / 100)))

  const save = () => {
    if (qty <= 0) return
    const data = { foodId: food.id, name: food.name, meal, qty, unit: food.units[unit].label, cal: m.cal, p: m.p, c: m.c, f: m.f }
    if (editing) {
      updateEntry(date, editing.id, data)
      toast('Saved')
    } else addEntry(date, data, method)
    closeAllSheets()
  }

  return (
    <Sheet title={editing ? 'Edit portion' : 'Add food'}>
      <h2 className="portion-name">{food.name}</h2>
      {food.createdByName && <p className="muted small">Added by {food.createdByName}</p>}
      <div className="portion-row">
        <div className="stepper">
          <button className="stepper-btn pressable" onClick={() => bump(-step)} aria-label="Less">
            <Minus size={20} weight="bold" />
          </button>
          <input
            className="input stepper-input"
            inputMode="decimal"
            value={qtyText}
            onChange={(e) => setQtyText(e.target.value.replace(/[^\d.]/g, ''))}
            onFocus={(e) => e.target.select()}
            aria-label="Amount"
          />
          <button className="stepper-btn pressable" onClick={() => bump(step)} aria-label="More">
            <Plus size={20} weight="bold" />
          </button>
        </div>
        {food.units.length === 1 && <span className="unit-label">{food.units[0].label}</span>}
      </div>
      {food.units.length > 1 && (
        <select className="input unit-select" value={unit} onChange={(e) => setUnit(Number(e.target.value))} aria-label="Unit">
          {food.units.map((u, i) => (
            <option key={u.label + i} value={i}>
              {u.label}
              {u.grams && u.label !== 'g' && u.label !== 'oz' ? ` (${fmt(u.grams)} g)` : ''}
            </option>
          ))}
        </select>
      )}
      <div className="portion-macros" aria-live="polite">
        <span className="big-number portion-cal">{fmt(r0(m.cal))}</span>
        <span className="muted">cal</span>
        <div className="plan-macros">
          <span>
            <b style={{ color: 'var(--protein)' }}>P</b> {fmt(m.p, 1)} g
          </span>
          <span>
            <b style={{ color: 'var(--carbs)' }}>C</b> {fmt(m.c, 1)} g
          </span>
          <span>
            <b style={{ color: 'var(--fat)' }}>F</b> {fmt(m.f, 1)} g
          </span>
        </div>
      </div>
      <MealPicker value={meal} onChange={setMeal} prefix="Meal" />
      <Button onClick={save} disabled={qty <= 0} className="sheet-cta">
        {editing ? 'Save' : 'Add'}
      </Button>
    </Sheet>
  )
}

export function QuickAddSheet({ date, meal: m0, name: n0 = '', editing }: { date: string; meal: Meal; name?: string; editing?: FoodEntry }) {
  const [meal, setMeal] = useState(editing?.meal ?? m0)
  const [f, setF] = useState({
    name: editing?.name ?? n0,
    cal: editing ? String(r0(editing.cal)) : '',
    p: editing ? String(editing.p) : '',
    c: editing ? String(editing.c) : '',
    fat: editing ? String(editing.f) : '',
  })
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: k === 'name' ? e.target.value : e.target.value.replace(/[^\d.]/g, '') })
  const p = Number(f.p) || 0
  const c = Number(f.c) || 0
  const fat = Number(f.fat) || 0
  const cal = f.cal ? Number(f.cal) : Math.round(p * 4 + c * 4 + fat * 9)
  const ok = cal > 0 || p + c + fat > 0
  const save = () => {
    const data = { foodId: 'q', name: f.name.trim() || 'Quick add', meal, qty: 1, unit: 'serving', cal, p, c, f: fat }
    if (editing) {
      updateEntry(date, editing.id, data)
      toast('Saved')
    } else addEntry(date, data, 'quick')
    closeAllSheets()
  }
  const dirty = !!(f.cal || f.p || f.c || f.fat)
  return (
    <Sheet title={editing ? 'Edit quick add' : 'Quick add'} dirty={dirty && !editing}>
      <MealPicker value={meal} onChange={setMeal} prefix="Meal" />
      <Field label="Name (optional)" value={f.name} onChange={set('name')} placeholder="e.g. Coffee shop wrap" />
      <Field label="Calories" inputMode="numeric" value={f.cal} onChange={set('cal')} placeholder={p + c + fat ? String(cal) : ''} hint={!f.cal && p + c + fat ? 'Filled in from your macros' : undefined} />
      <div className="field-row field-row--3">
        <Field label="Protein" inputMode="decimal" value={f.p} onChange={set('p')} suffix="g" />
        <Field label="Carbs" inputMode="decimal" value={f.c} onChange={set('c')} suffix="g" />
        <Field label="Fat" inputMode="decimal" value={f.fat} onChange={set('fat')} suffix="g" />
      </div>
      <Button onClick={save} disabled={!ok} className="sheet-cta">
        {editing ? 'Save' : 'Add'}
      </Button>
    </Sheet>
  )
}

export function CreateFoodSheet({ date, meal, name = '', editing }: { date?: string; meal?: Meal; name?: string; editing?: CustomFood }) {
  const [f, setF] = useState({
    name: editing?.name ?? name,
    serving: editing?.serving ?? '1 serving',
    cal: editing ? String(editing.cal) : '',
    p: editing ? String(editing.p) : '',
    c: editing ? String(editing.c) : '',
    fat: editing ? String(editing.f) : '',
  })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF({ ...f, [k]: k === 'name' || k === 'serving' ? e.target.value : e.target.value.replace(/[^\d.]/g, '') })
  const ok = f.name.trim() && f.cal !== ''
  const save = async () => {
    setBusy(true)
    setErr('')
    try {
      const payload = { name: f.name.trim(), serving: f.serving.trim(), cal: Number(f.cal), p: Number(f.p) || 0, c: Number(f.c) || 0, f: Number(f.fat) || 0 }
      const res = editing
        ? await api<{ food: CustomFood }>(`/api/foods/${editing.id}`, { method: 'PUT', body: payload })
        : await api<{ food: CustomFood }>('/api/foods', { body: payload })
      const foods = getState().customFoods.filter((x) => x.id !== res.food.id)
      setCustomFoods([res.food, ...foods])
      if (editing) {
        toast('Food updated')
        closeSheet()
      } else {
        track('custom_food_created')
        closeSheet()
        if (date && meal) openSheet(<PortionSheet food={customToLib(res.food)} date={date} meal={meal} method="custom" />)
      }
    } catch (e) {
      setErr(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Sheet title={editing ? 'Edit food' : 'Create food'} dirty={!editing && !!(f.cal || f.p)}>
      <Note>Foods you create are shared with everyone on Crisp and show your name.</Note>
      <Field label="Name" value={f.name} onChange={set('name')} placeholder="e.g. Quest protein bar" />
      <Field label="Serving" value={f.serving} onChange={set('serving')} placeholder="1 bar" />
      <Field label="Calories per serving" inputMode="numeric" value={f.cal} onChange={set('cal')} />
      <div className="field-row field-row--3">
        <Field label="Protein" inputMode="decimal" value={f.p} onChange={set('p')} suffix="g" />
        <Field label="Carbs" inputMode="decimal" value={f.c} onChange={set('c')} suffix="g" />
        <Field label="Fat" inputMode="decimal" value={f.fat} onChange={set('fat')} suffix="g" />
      </div>
      {err && <Note tone="error">{err}</Note>}
      <Button onClick={save} disabled={!ok} busy={busy} className="sheet-cta">
        {editing ? 'Save' : 'Save & add'}
      </Button>
    </Sheet>
  )
}

/** Open the right editor for a logged food (tap on a row). */
export async function editEntry(date: string, e: FoodEntry) {
  if (e.foodId === 'q') return openSheet(<QuickAddSheet date={date} meal={e.meal} editing={e} />)
  const custom = getState().customFoods.find((c) => `c:${c.id}` === e.foodId)
  let food: LibFood | undefined = custom ? customToLib(custom) : undefined
  if (!food && e.foodId.startsWith('u:')) {
    try {
      food = findFood(await loadLibrary(), e.foodId)
    } catch {
      /* offline & not cached */
    }
  }
  if (!food) return openSheet(<QuickAddSheet date={date} meal={e.meal} editing={e} />)
  openSheet(<PortionSheet food={food} date={date} meal={e.meal} method="search" initial={{ qty: e.qty, unit: e.unit }} editing={e} />)
}

export const FavoriteIcon = Star
