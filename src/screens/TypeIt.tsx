// "Type what you ate" — write everything in one go; Crisp matches each food to the catalog,
// you check the matches, then add them all at once.
import { useMemo, useState } from 'react'
import { CheckCircle, Circle, Lightning, Minus, Plus } from '@phosphor-icons/react'
import { Sheet } from '../components/Sheet'
import { Button, Note, Shimmer } from '../components/ui'
import { ChipRow, MealBubble } from '../components/Pickers'
import { macrosFor, type LibFood } from '../lib/foods'
import { matchText, fitUnit, type ParsedItem } from '../lib/parse'
import { addEntry } from '../lib/logging'
import { coversQuery, hasUnknownWord, rememberBrand, searchBrands } from '../lib/brands'
import { closeAllSheets, openSheet, toast } from '../lib/ui'
import { fmt, r0 } from '../lib/format'
import { mealLabel } from '../lib/meals'
import { useLibrary, QuickAddSheet } from './Log'
import type { Meal } from '../../shared/types'

interface Line {
  key: number
  item: ParsedItem
  food: LibFood | null
  unitIndex: number
  qty: number
  alternatives: LibFood[]
  include: boolean
  /** looking this one up in store brands */
  checking?: boolean
}

export function TypeItSheet({ date, meal: m0 }: { date: string; meal: Meal }) {
  const [meal, setMeal] = useState(m0)
  const [text, setText] = useState('')
  const [lines, setLines] = useState<Line[] | null>(null)
  const [open, setOpen] = useState<number | null>(null)
  const { all, loading, err } = useLibrary()

  const find = () => {
    const matched = matchText(all, text)
    setLines(
      matched.map((m, i) => ({
        key: i,
        item: m.item,
        food: m.best?.food ?? null,
        unitIndex: m.best?.unitIndex ?? 0,
        qty: m.best?.qty ?? 1,
        alternatives: m.alternatives,
        include: !!m.best,
        checking: !m.best || hasUnknownWord(all, m.item.query),
      })),
    )
    setOpen(null)
    // Brand names the built-in list doesn't know ("fairlife milk", "chobani") → look them up in store brands.
    matched.forEach((m, i) => {
      if (!(!m.best || hasUnknownWord(all, m.item.query))) return
      searchBrands(m.item.query).then(
        (found) => {
          setLines((ls) =>
            ls
              ? ls.map((l) => {
                  if (l.key !== i) return l
                  const pick = found.find((f) => coversQuery(f, l.item.query)) ?? (l.food ? undefined : found[0])
                  if (!pick) return { ...l, checking: false, alternatives: [...found.slice(0, 3), ...l.alternatives] }
                  const fit = fitUnit(pick, l.item)
                  return {
                    ...l,
                    checking: false,
                    food: fit.food,
                    unitIndex: fit.unitIndex,
                    qty: fit.qty,
                    include: true,
                    alternatives: [...found.filter((f) => f !== pick).slice(0, 3), ...(l.food ? [l.food] : []), ...l.alternatives].slice(0, 7),
                  }
                })
              : ls,
          )
        },
        () => setLines((ls) => (ls ? ls.map((l) => (l.key === i ? { ...l, checking: false } : l)) : ls)),
      )
    })
  }

  const update = (key: number, patch: Partial<Line>) => setLines((ls) => ls!.map((l) => (l.key === key ? { ...l, ...patch } : l)))
  const chosen = (lines ?? []).filter((l) => l.include && l.food)
  const total = useMemo(() => chosen.reduce((s, l) => s + macrosFor(l.food!, l.unitIndex, l.qty).cal, 0), [chosen])

  const addAll = () => {
    for (const l of chosen) {
      rememberBrand(l.food!)
      const m = macrosFor(l.food!, l.unitIndex, l.qty)
      addEntry(date, { foodId: l.food!.id, name: l.food!.name, meal, qty: l.qty, unit: l.food!.units[l.unitIndex].label, ...m, p: m.p, c: m.c, f: m.f }, 'typed', { silent: true })
    }
    toast(`Added ${chosen.length} food${chosen.length === 1 ? '' : 's'} to ${mealLabel(meal)}`)
    closeAllSheets()
  }

  return (
    <Sheet tall title="Type what you ate" dirty={!!text.trim() && !lines}>
      <MealBubble value={meal} onChange={setMeal} />
      <textarea
        className="input typeit-text"
        rows={4}
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          if (lines) setLines(null)
        }}
        placeholder={'2 eggs, about half an avocado, pb toast\nMonterey Jack cheese 60g, coffee w/ milk'}
        aria-label="What did you eat?"
        autoFocus
      />
      <p className="muted small">Separate foods with commas or new lines. Amounts like “2”, “1 cup”, “6 oz” or “half” help Crisp get it right.</p>
      {!lines && (
        <Button onClick={find} disabled={!text.trim() || loading}>
          {loading ? 'Loading foods…' : 'Find my foods'}
        </Button>
      )}
      {err && <Note tone="error">The food library didn't load. Check your connection and try again.</Note>}
      {loading && text && (
        <div className="stack">
          <Shimmer />
          <Shimmer />
        </div>
      )}

      {lines && (
        <>
          <h3 className="list-title">Check the matches</h3>
          <div className="typeit-list">
            {lines.map((l) => (
              <LineRow key={l.key} line={l} open={open === l.key} onToggleOpen={() => setOpen(open === l.key ? null : l.key)} onChange={(p) => update(l.key, p)} date={date} meal={meal} />
            ))}
          </div>
          <Button onClick={addAll} disabled={!chosen.length} className="sheet-cta">
            Add {chosen.length} food{chosen.length === 1 ? '' : 's'} · {fmt(r0(total))} cal
          </Button>
        </>
      )}
    </Sheet>
  )
}

function LineRow({
  line,
  open,
  onToggleOpen,
  onChange,
  date,
  meal,
}: {
  line: Line
  open: boolean
  onToggleOpen: () => void
  onChange: (p: Partial<Line>) => void
  date: string
  meal: Meal
}) {
  const { item, food, unitIndex, qty, include } = line
  if (!food)
    return (
      <div className="typeit-row typeit-row--miss">
        <span className="row-main">
          <span className="row-label">“{item.raw}”</span>
          <span className="row-sub">{line.checking ? 'Checking store brands…' : 'No match in the food list'}</span>
        </span>
        <button className="link small" onClick={() => openSheet(<QuickAddSheet date={date} meal={meal} name={item.query} />)}>
          <Lightning size={14} weight="fill" aria-hidden /> Quick add
        </button>
      </div>
    )
  const m = macrosFor(food, unitIndex, qty)
  const unit = food.units[unitIndex]
  const step = unit.label === 'g' ? 10 : unit.label === 'oz' ? 1 : 0.5
  return (
    <div className={`typeit-row${include ? '' : ' typeit-row--off'}`}>
      <div className="typeit-top">
        <button className="typeit-check" onClick={() => onChange({ include: !include })} aria-pressed={include} aria-label={include ? `Don't add ${food.name}` : `Add ${food.name}`}>
          {include ? <CheckCircle size={26} weight="fill" /> : <Circle size={26} />}
        </button>
        <button className="row-main typeit-main" onClick={onToggleOpen} aria-expanded={open}>
          <span className="muted small">“{item.raw}”</span>
          <span className="row-label">{food.name}</span>
          {line.checking && <span className="muted small">Checking store brands…</span>}
          <span className="row-sub">
            {fmt(qty, 2)} × {unit.label === 'g' ? 'grams' : unit.label === 'oz' ? 'oz' : unit.label} · P {r0(m.p)} · C {r0(m.c)} · F {r0(m.f)}
          </span>
        </button>
        <span className="row-value">{fmt(r0(m.cal))}</span>
      </div>
      {open && (
        <div className="typeit-edit">
          <div className="stepper">
            <button className="stepper-btn pressable" onClick={() => onChange({ qty: Math.max(0, Math.round((qty - step) * 100) / 100) })} aria-label="Less">
              <Minus size={18} weight="bold" />
            </button>
            <span className="stepper-val">{fmt(qty, 2)}</span>
            <button className="stepper-btn pressable" onClick={() => onChange({ qty: Math.round((qty + step) * 100) / 100 })} aria-label="More">
              <Plus size={18} weight="bold" />
            </button>
          </div>
          {food.units.length > 1 && (
            <ChipRow
              label="Portion size"
              value={unitIndex}
              onChange={(i) => onChange({ unitIndex: i, qty: food.units[i].label === 'g' ? Math.round((unit.grams ?? 100) * qty) : food.units[i].label === 'oz' ? Math.round(((unit.grams ?? 100) * qty) / 28.35) : 1 })}
              options={food.units.map((u, i) => ({ value: i, label: u.label === 'g' ? 'grams' : u.label === 'oz' ? 'ounces' : u.label, sub: u.grams && u.label !== 'g' && u.label !== 'oz' ? `${fmt(u.grams)} g` : undefined }))}
            />
          )}
          {line.alternatives.length > 0 && (
            <>
              <span className="muted small">Not quite? Try:</span>
              <div className="alt-list">
                {line.alternatives.map((alt) => (
                  <button
                    key={alt.id}
                    className="bubble pressable alt"
                    onClick={() => {
                      const fit = fitUnit(alt, item)
                      onChange({ food: fit.food, unitIndex: fit.unitIndex, qty: fit.qty, include: true, alternatives: [food, ...line.alternatives.filter((a) => a !== alt)] })
                    }}
                  >
                    {alt.name}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
