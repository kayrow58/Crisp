// Log sheet (+), portion card, Quick add, Create food (spec §3.4–3.5, §4.3–4.4).
import { useEffect, useMemo, useRef, useState } from 'react'
import { BookmarkSimple, CaretUp, Lightning, MagnifyingGlass, Minus, NotePencil, Plus, PlusCircle, Star, Storefront, X, XCircle } from '@phosphor-icons/react'
import { Sheet } from '../components/Sheet'
import { Button, Field, Note, Shimmer } from '../components/ui'
import { customToLib, loadLibrary, macrosFor, searchFoods, type LibFood } from '../lib/foods'
import { rememberBrand, savedBrand, useBrandSearch } from '../lib/brands'
import { addEntry, atForDate, removeEntry, updateEntry, type LogMethod } from '../lib/logging'
import { getState, list, saveMeal, setCustomFoods, today, track, useList, useStore } from '../lib/store'
import { closeAllSheets, closeSheet, openSheet, toast } from '../lib/ui'
import { amountLabel, HOUR_OPTIONS, fmt, r0 } from '../lib/format'
import { Dropdown, MealBubble, unitOptions } from '../components/Pickers'
import { addToTray, clearTray, closeTray, newTrayId, openTray, removeFromTray, trayTotals, useTray, type TrayItem } from '../lib/tray'
import { mealLabel } from '../lib/meals'
import { SaveMealSheet, mealTotals, pushSavedMeal, savedMealFood, savedMealTemplate } from './SavedMeals'
import { TypeItSheet } from './TypeIt'
import { api, errorMessage } from '../lib/api'
import { mealForHour } from '../../shared/calc'
import { hourInZone } from '../../shared/dates'
import type { CustomFood, FoodEntry, FoodTemplate, Meal, SavedMeal } from '../../shared/types'

export function defaultMeal(): Meal {
  return mealForHour(hourInZone(new Date(), getState().profile?.timeZone))
}

export function openLog(date: string, meal?: Meal) {
  openSheet(<LogSheet date={date} initialMeal={meal ?? defaultMeal()} />)
}

const MealPicker = MealBubble

export function useLibrary() {
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
  if (foodId.startsWith('b:')) return savedBrand(foodId)
  return all.find((f) => f.id === foodId)
}

/** Where the Log sheet sends foods: a day's meal (normal), or a Saved Meal being edited. */
export type LogTarget = { kind: 'day' } | { kind: 'saved'; mealKey: string }

function LogSheet({ date, initialMeal, target = { kind: 'day' } }: { date: string; initialMeal: Meal; target?: LogTarget }) {
  const [meal, setMeal] = useState(initialMeal)
  const [q, setQ] = useState('')
  const { all, loading, err } = useLibrary()
  const recents = useList<FoodTemplate>('recents')
  const favorites = useList<FoodTemplate>('favorites')
  const savedMeals = useList<SavedMeal>('meals')
  const [trayId] = useState(newTrayId)
  const tray = useTray(trayId)
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => {
    openTray(trayId)
    const t = setTimeout(() => input.current?.focus(), 250)
    return () => {
      clearTimeout(t)
      closeTray(trayId)
    }
  }, [trayId])
  const results = useMemo(() => (q.trim() ? searchFoods(all, q) : []), [all, q])
  const brands = useBrandSearch(q)
  const brandSection = q.trim().length >= 3 && (brands.loading || brands.foods.length > 0 || brands.error)
  const ctx: AddCtx = { date, meal, toTray: true }
  const forSaved = target.kind === 'saved'

  const templateToTray = (t: FoodTemplate | Omit<FoodTemplate, 'key' | 'at'>) => {
    addToTray({ foodId: t.foodId, name: t.name, qty: t.qty, unit: t.unit, cal: t.cal, p: t.p, c: t.c, f: t.f })
    toast(`${t.name.split(',')[0]} added to the list`)
  }

  return (
    <Sheet
      tall
      title={forSaved ? 'Add to saved meal' : 'Log food'}
      dirty={tray.length > 0}
      dirtyMessage={`The ${tray.length} food${tray.length === 1 ? '' : 's'} in your list won't be added.`}
      footer={<TrayBar trayId={trayId} date={date} meal={meal} target={target} />}
    >
      {!forSaved && <MealPicker value={meal} onChange={setMeal} />}
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
        {q && (
          <button className="search-clear" onClick={() => (setQ(''), input.current?.focus())} aria-label="Clear search">
            <XCircle size={20} weight="fill" />
          </button>
        )}
      </div>
      {!q.trim() && (
        <>
          <button className="typeit-card pressable" onClick={() => openSheet(<TypeItSheet date={date} meal={meal} />)}>
            <NotePencil size={24} weight="duotone" className="typeit-icon" aria-hidden />
            <span className="row-main">
              <strong>Type or say what you ate</strong>
              <span className="muted small">“2 eggs, 1 cup rice, 6 oz chicken” — Crisp finds the matches</span>
            </span>
          </button>
          <div className="quick-row">
            <Button kind="secondary" onClick={() => openSheet(<QuickAddSheet date={date} meal={meal} toTray />)}>
              <Lightning size={18} weight="fill" aria-hidden /> Quick add
            </Button>
            <Button kind="secondary" onClick={() => openSheet(<CreateFoodSheet date={date} meal={meal} name={q} toTray />)}>
              <Plus size={18} weight="bold" aria-hidden /> Create food
            </Button>
          </div>
        </>
      )}

      {q.trim() ? (
        loading ? (
          <div className="stack">
            <Shimmer />
            <Shimmer />
            <Shimmer />
          </div>
        ) : results.length || brandSection ? (
          <>
            {results.length > 0 && <FoodList foods={results} ctx={ctx} />}
            {brandSection && (
              <section className="brand-section" aria-live="polite">
                <h3 className="group-title">
                  <Storefront size={16} weight="duotone" aria-hidden /> Store brands
                </h3>
                {brands.loading && !brands.foods.length ? (
                  <div className="stack">
                    <Shimmer />
                    <Shimmer />
                  </div>
                ) : brands.error ? (
                  <p className="muted small pad-x">Store brands need a connection. The foods above still work offline.</p>
                ) : (
                  <FoodList foods={brands.foods} ctx={ctx} />
                )}
              </section>
            )}
            {!results.length && !brands.loading && !brands.foods.length && (
              <div className="quick-row">
                <Button onClick={() => openSheet(<CreateFoodSheet date={date} meal={meal} name={q} toTray />)}>＋ Create it</Button>
                <Button kind="secondary" onClick={() => openSheet(<QuickAddSheet date={date} meal={meal} name={q} toTray />)}>
                  ⚡ Quick add
                </Button>
              </div>
            )}
          </>
        ) : (
          <div className="empty empty--small">
            <MagnifyingGlass size={40} className="empty-icon" aria-hidden />
            <p className="empty-text">No match for “{q}”.</p>
            <div className="quick-row">
              <Button onClick={() => openSheet(<CreateFoodSheet date={date} meal={meal} name={q} toTray />)}>＋ Create it</Button>
              <Button kind="secondary" onClick={() => openSheet(<QuickAddSheet date={date} meal={meal} name={q} toTray />)}>
                ⚡ Quick add
              </Button>
            </div>
          </div>
        )
      ) : (
        <>
          {err && <Note tone="error">The food library didn't load. Check your connection and try again — Quick add still works.</Note>}
          {!forSaved && savedMeals.length > 0 && (
            <section>
              <h3 className="list-title">Saved meals</h3>
              <ul className="list">
                {savedMeals.slice(0, 10).map((m) => {
                  const t = mealTotals(m)
                  return (
                    <li key={m.key} className="food-row-wrap">
                      <button className="food-row pressable" onClick={() => pushSavedMeal(m.key)}>
                        <span className="food-name">{m.name}</span>
                        <span className="food-sub">
                          {m.items.length} food{m.items.length === 1 ? '' : 's'} · {r0(t.cal)} cal
                        </span>
                      </button>
                      <button className="relog pressable" onClick={() => templateToTray(savedMealTemplate(m))} aria-label={`Add ${m.name}`}>
                        <PlusCircle size={30} weight="fill" aria-hidden />
                      </button>
                    </li>
                  )
                })}
              </ul>
            </section>
          )}
          <TemplateList title="Recent" items={recents} onAdd={templateToTray} all={all} ctx={ctx} method="recent" />
          <TemplateList title="Favorites ★" items={favorites} onAdd={templateToTray} all={all} ctx={ctx} method="favorite" />
          {!recents.length && !favorites.length && <p className="muted center pad">Foods you log will show up here.</p>}
        </>
      )}
    </Sheet>
  )
}

/** Shared by the portion card, quick add and create food when they're opened from the Log sheet. */
export interface AddCtx {
  date: string
  meal: Meal
  toTray?: boolean
}

/** Bottom bar of the Log sheet: the running list and the one button that posts it. */
function TrayBar({ trayId, date, meal, target }: { trayId: number; date: string; meal: Meal; target: LogTarget }) {
  const tray = useTray(trayId)
  const [open, setOpen] = useState(false)
  if (!tray.length) return null
  const t = trayTotals(tray)
  const post = () => {
    if (target.kind === 'saved') {
      const m = list<SavedMeal>('meals').items.find((x) => x.key === target.mealKey)
      if (m) saveMeal({ ...m, items: [...m.items, ...tray.map(trayToTemplate)], at: new Date().toISOString() })
      toast(`Added ${tray.length} to ${m?.name ?? 'meal'}`)
    } else {
      const at = atForDate(date)
      const added = tray.map((i) => {
        if (i.food) rememberBrand(i.food)
        return addEntry(date, { ...trayToTemplate(i), meal }, i.foodId.startsWith('m:') ? 'saved_meal' : 'search', { silent: true, at })
      })
      toast(`Added ${tray.length} food${tray.length === 1 ? '' : 's'} to ${mealLabel(meal)}`, {
        undo: () => added.forEach((e) => removeEntry(date, e.id, false)),
      })
    }
    clearTray(trayId)
    closeSheet()
  }
  return (
    <div className="tray">
      {open && (
        <ul className="tray-list">
          {tray.map((i) => (
            <li key={i.key} className="tray-item">
              <span className="row-main">
                <span className="tray-name">{i.name}</span>
                <span className="muted small">
                  {amountLabel(i.qty, i.unit)} · {r0(i.cal)} cal
                </span>
              </span>
              <button className="icon-btn pressable" onClick={() => removeFromTray(trayId, i.key)} aria-label={`Remove ${i.name}`}>
                <X size={18} weight="bold" />
              </button>
            </li>
          ))}
          {target.kind === 'day' && tray.length > 1 && (
            <li>
              <button className="link small tray-save" onClick={() => openSheet(<SaveMealSheet items={tray.map(trayToTemplate)} />)}>
                <BookmarkSimple size={16} weight="bold" aria-hidden /> Save these as a meal
              </button>
            </li>
          )}
        </ul>
      )}
      <div className="tray-row">
        <button className="tray-count pressable" onClick={() => setOpen(!open)} aria-expanded={open}>
          <span className="tray-badge">{tray.length}</span>
          <span className="row-main">
            <strong>{r0(t.cal)} cal</strong>
            <span className="muted small">
              P {r0(t.p)} · C {r0(t.c)} · F {r0(t.f)}
            </span>
          </span>
          <CaretUp size={16} weight="bold" className={`meal-caret${open ? '' : ' meal-caret--open'}`} aria-hidden />
        </button>
        <Button onClick={post} className="tray-post">
          {target.kind === 'saved' ? 'Add to meal' : `Add to ${mealLabel(meal)}`}
        </Button>
      </div>
    </div>
  )
}

const trayToTemplate = (i: TrayItem): Omit<FoodTemplate, 'key' | 'at'> => ({ foodId: i.foodId, name: i.name, qty: i.qty, unit: i.unit, cal: i.cal, p: i.p, c: i.c, f: i.f })

/** Default amount for a one-tap add: the food's first serving (100 g when it's measured in grams). */
function quickAmount(f: LibFood) {
  const unit = 0
  const qty = f.units[0]?.label === 'g' ? 100 : 1
  return { unit, qty, m: macrosFor(f, unit, qty) }
}

function FoodList({ foods, ctx }: { foods: LibFood[]; ctx: AddCtx }) {
  return (
    <ul className="list">
      {foods.map((f) => {
        const method: LogMethod = f.custom ? 'custom' : f.brand ? 'brand' : 'search'
        const quick = quickAmount(f)
        return (
          <li key={f.id} className="food-row-wrap">
            <button className="food-row pressable" onClick={() => openSheet(<PortionSheet food={f} ctx={ctx} method={method} />)}>
              <span className="food-name">{f.name}</span>
              <span className="food-sub">
                {r0(quick.m.cal)} cal · {f.units[0].label}
                {f.units[0].grams && f.units[0].label !== 'g' && f.units[0].label !== 'oz' ? ` (${fmt(f.units[0].grams)} g)` : ''}
                {f.createdByName && <span className="by"> · added by {f.createdByName}</span>}
              </span>
            </button>
            <button
              className="relog pressable"
              onClick={() => {
                addToTray({ foodId: f.id, name: f.name, qty: quick.qty, unit: f.units[quick.unit].label, ...quick.m, food: f })
                toast(`${f.name.split(',')[0]} added to the list`)
              }}
              aria-label={`Add ${f.name}, ${f.units[0].label}`}
            >
              <PlusCircle size={30} weight="fill" aria-hidden />
            </button>
          </li>
        )
      })}
    </ul>
  )
}

function TemplateList({
  title,
  items,
  onAdd,
  all,
  ctx,
  method,
}: {
  title: string
  items: FoodTemplate[]
  onAdd: (t: FoodTemplate) => void
  all: LibFood[]
  ctx: AddCtx
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
              <button className="food-row pressable" onClick={() => (food ? openSheet(<PortionSheet food={food} ctx={ctx} method={method} initial={t} />) : onAdd(t))}>
                <span className="food-name">{t.name}</span>
                <span className="food-sub">
                  {amountLabel(t.qty, t.unit)} · {r0(t.cal)} cal
                </span>
              </button>
              <button className="relog pressable" onClick={() => onAdd(t)} aria-label={`Add ${t.name}, ${fmt(t.qty, 2)} ${t.unit}`}>
                <PlusCircle size={30} weight="fill" aria-hidden />
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/** Portion card: stepper + unit dropdown + live macros (spec §4.4). Also used to edit a logged food. */
export function PortionSheet({
  food,
  ctx,
  method,
  initial,
  editing,
  onSave,
}: {
  food: LibFood
  ctx: AddCtx
  method: LogMethod
  initial?: { qty: number; unit: string }
  editing?: FoodEntry
  /** used by saved-meal editing: return the new amount instead of logging */
  onSave?: (item: Omit<FoodTemplate, 'key' | 'at'>) => void
}) {
  const startUnit = Math.max(0, initial ? food.units.findIndex((u) => u.label === initial.unit) : 0)
  const [unit, setUnit] = useState(startUnit)
  const [qtyText, setQtyText] = useState(String(initial?.qty ?? (food.units[startUnit]?.label === 'g' ? 100 : 1)))
  const [meal, setMeal] = useState(editing?.meal ?? ctx.meal)
  const [hour, setHour] = useState(editing ? new Date(editing.at).getHours() : new Date().getHours())
  const qty = Math.max(0, Number(qtyText) || 0)
  const m = macrosFor(food, unit, qty)
  const isGrams = food.units[unit]?.label === 'g'
  const step = isGrams ? 10 : food.units[unit]?.label === 'oz' ? 1 : 0.5
  const bump = (d: number) => setQtyText(String(Math.max(0, Math.round((qty + d) * 100) / 100)))

  const save = () => {
    if (qty <= 0) return
    const item = { foodId: food.id, name: food.name, qty, unit: food.units[unit].label, cal: m.cal, p: m.p, c: m.c, f: m.f }
    rememberBrand(food)
    if (onSave) {
      onSave(item)
      closeSheet()
    } else if (editing) {
      updateEntry(ctx.date, editing.id, { ...item, meal, at: atForDate(ctx.date, hour) })
      toast('Saved')
      closeAllSheets()
    } else if (ctx.toTray) {
      addToTray({ ...item, food })
      toast(`${food.name.split(',')[0]} added to the list`)
      closeSheet() // back to search, the list keeps growing
    } else {
      addEntry(ctx.date, { ...item, meal }, method)
      closeAllSheets()
    }
  }

  return (
    <Sheet title={editing ? 'Edit portion' : onSave ? 'Change amount' : 'Add food'}>
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
        <Dropdown
          label="Portion size"
          value={unit}
          onChange={(i) => {
            const label = food.units[i].label
            // switching to grams/ounces: start from the same amount of food
            const grams = (food.units[unit]?.grams ?? 100) * qty
            if (label === 'g') setQtyText(String(Math.round(grams)))
            else if (label === 'oz') setQtyText(String(Math.round((grams / 28.35) * 10) / 10))
            else if (food.units[unit]?.label === 'g' || food.units[unit]?.label === 'oz') setQtyText('1')
            setUnit(i)
          }}
          options={unitOptions(food.units)}
        />
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
      {editing && (
        <>
          <MealPicker value={meal} onChange={setMeal} prefix="Meal" />
          <Dropdown label="Time logged" value={hour} onChange={setHour} options={HOUR_OPTIONS} />
        </>
      )}
      <Button onClick={save} disabled={qty <= 0} className="sheet-cta">
        {editing || onSave ? 'Save' : ctx.toTray ? 'Add to list' : 'Add'}
      </Button>
    </Sheet>
  )
}

export function QuickAddSheet({ date, meal: m0, name: n0 = '', editing, toTray }: { date: string; meal: Meal; name?: string; editing?: FoodEntry; toTray?: boolean }) {
  const [meal, setMeal] = useState(editing?.meal ?? m0)
  const [hour, setHour] = useState(editing ? new Date(editing.at).getHours() : new Date().getHours())
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
      updateEntry(date, editing.id, { ...data, at: atForDate(date, hour) })
      toast('Saved')
    } else if (toTray) {
      const { meal: _m, ...item } = data
      void _m
      addToTray(item)
      toast(`${item.name} added to the list`)
      closeSheet()
      return
    } else addEntry(date, data, 'quick')
    closeAllSheets()
  }
  const dirty = !!(f.cal || f.p || f.c || f.fat)
  return (
    <Sheet title={editing ? 'Edit quick add' : 'Quick add'} dirty={dirty && !editing}>
      {!toTray && <MealPicker value={meal} onChange={setMeal} prefix="Meal" />}
      {editing && <Dropdown label="Time logged" value={hour} onChange={setHour} options={HOUR_OPTIONS} />}
      <Field label="Name (optional)" value={f.name} onChange={set('name')} placeholder="e.g. Coffee shop wrap" />
      <Field label="Calories" inputMode="numeric" value={f.cal} onChange={set('cal')} placeholder={p + c + fat ? String(cal) : ''} hint={!f.cal && p + c + fat ? 'Filled in from your macros' : undefined} />
      <div className="field-row field-row--3">
        <Field label="Protein" inputMode="decimal" value={f.p} onChange={set('p')} suffix="g" />
        <Field label="Carbs" inputMode="decimal" value={f.c} onChange={set('c')} suffix="g" />
        <Field label="Fat" inputMode="decimal" value={f.fat} onChange={set('fat')} suffix="g" />
      </div>
      <Button onClick={save} disabled={!ok} className="sheet-cta">
        {editing ? 'Save' : toTray ? 'Add to list' : 'Add'}
      </Button>
    </Sheet>
  )
}

export function CreateFoodSheet({ date, meal, name = '', editing, toTray }: { date?: string; meal?: Meal; name?: string; editing?: CustomFood; toTray?: boolean }) {
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
        if (date && meal) openSheet(<PortionSheet food={customToLib(res.food)} ctx={{ date, meal, toTray }} method="custom" />)
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
  if (!food && e.foodId.startsWith('b:')) food = savedBrand(e.foodId)
  if (!food && e.foodId.startsWith('m:')) {
    const m = list<SavedMeal>('meals').items.find((x) => `m:${x.key}` === e.foodId)
    if (m) food = savedMealFood(m)
  }
  if (!food && (e.foodId.startsWith('u:') || e.foodId.startsWith('f'))) {
    try {
      food = findFood(await loadLibrary(), e.foodId)
    } catch {
      /* offline & not cached */
    }
  }
  if (!food) return openSheet(<QuickAddSheet date={date} meal={e.meal} editing={e} />)
  openSheet(<PortionSheet food={food} ctx={{ date, meal: e.meal }} method="search" initial={{ qty: e.qty, unit: e.unit }} editing={e} />)
}

/** Open the Log sheet to add foods to a saved meal. */
export function openLogForSavedMeal(mealKey: string) {
  openSheet(<LogSheet date={today()} initialMeal={defaultMeal()} target={{ kind: 'saved', mealKey }} />)
}

export const FavoriteIcon = Star
