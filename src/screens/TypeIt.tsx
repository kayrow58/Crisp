// "Type or say it" — write or say everything in one go, check the matches, add them all at once.
// How each food is found (cheapest first):
//   1. Crisp's own matcher — instant, free, works offline — for foods it's sure about ("2 eggs").
//   2. Claude checks the closest foods already in Crisp's database (incl. everything people confirmed
//      before) — no web search, no credit, about 0.05¢.
//   3. Only foods that truly aren't there get a web search — one credit for the whole meal.
// Web finds are saved for everyone only after "Looks good". So the more people use Crisp, the more
// foods are already in the database and the fewer web searches happen.
import { useEffect, useMemo, useRef, useState } from 'react'
import { CheckCircle, Circle, Lightning, Microphone, Minus, Plus, Sparkle, Stop } from '@phosphor-icons/react'
import { Sheet } from '../components/Sheet'
import { Button, Note, Shimmer } from '../components/ui'
import { Dropdown, MealBubble, unitOptions } from '../components/Pickers'
import { addToTray, trayActive } from '../lib/tray'
import { listen, voiceSupported } from '../lib/voice'
import { customToLib, macrosFor, type LibFood } from '../lib/foods'
import { matchText, fitUnit, type ParsedItem } from '../lib/parse'
import { fuzzySearch, strongMatch } from '../lib/match'
import { addEntry } from '../lib/logging'
import { rememberBrand } from '../lib/brands'
import { AiLimitError, aiLookup, aiQuota, confirmAiFood } from '../lib/ai'
import { closeAllSheets, closeSheet, openSheet, toast } from '../lib/ui'
import { errorMessage } from '../lib/api'
import { fmt, r0 } from '../lib/format'
import { mealLabel } from '../lib/meals'
import { track } from '../lib/store'
import { useLibrary, QuickAddSheet } from './Log'
import { AiItemCard, showSecretNote } from './AiLookup'
import type { AiCandidate, AiFoodItem, Meal } from '../../shared/types'

interface AiState {
  status: 'searching' | 'found' | 'none' | 'error'
  items?: AiFoodItem[]
  pick: number
  jobId?: string
  /** position of this food in the lookup */
  fi?: number
  msg?: string
  saving?: boolean
}

interface Line {
  key: number
  item: ParsedItem
  food: LibFood | null
  unitIndex: number
  qty: number
  alternatives: LibFood[]
  include: boolean
  /** waiting for the web results card (needs "Looks good") */
  ai?: AiState
  /** being checked against the database by Claude */
  checking?: boolean
  /** where the match came from */
  source?: 'crisp' | 'database' | 'web'
}

/** The closest foods Crisp has, for Claude to choose from. */
function candidatesFor(all: LibFood[], l: Line): { foods: LibFood[]; list: AiCandidate[] } {
  const seen = new Set<string>()
  const foods = [...(l.food ? [l.food] : []), ...fuzzySearch(all, l.item.query, 8, { phrases: false }), ...l.alternatives].filter((f) => !seen.has(f.id) && seen.add(f.id)).slice(0, 8)
  const list = foods.map((f) => ({ id: f.id, name: f.name, serving: f.units[0]?.label ?? '1 serving', cal: Math.round(macrosFor(f, 0, f.units[0]?.label === 'g' ? 100 : 1).cal) }))
  return { foods, list }
}

export function TypeItSheet({ date, meal: m0 }: { date: string; meal: Meal }) {
  const [meal, setMeal] = useState(m0)
  const [text, setText] = useState('')
  const [lines, setLines] = useState<Line[] | null>(null)
  const [open, setOpen] = useState<number | null>(null)
  const [aiLeft, setAiLeft] = useState<number | null>(null)
  const [aiMsg, setAiMsg] = useState('')
  const { all, loading, err } = useLibrary()
  const toList = trayActive() // opened from the Log sheet: matches go to its running list
  const [listening, setListening] = useState(false)
  const [voiceErr, setVoiceErr] = useState('')
  const stopRef = useRef<(() => void) | null>(null)
  const before = useRef('')
  const heardRef = useRef('')
  const aiRun = useRef<{ cancelled: boolean }>({ cancelled: false })
  useEffect(
    () => () => {
      stopRef.current?.()
      aiRun.current.cancelled = true
    },
    [],
  )
  useEffect(() => {
    aiQuota().then((q) => setAiLeft(q.left), () => undefined)
  }, [])

  const toggleVoice = () => {
    if (listening) {
      stopRef.current?.()
      return
    }
    setVoiceErr('')
    setLines(null)
    before.current = text.trim() ? `${text.trim().replace(/,$/, '')}, ` : ''
    heardRef.current = ''
    setListening(true)
    stopRef.current = listen({
      onText: (heard) => {
        heardRef.current = heard
        setText(before.current + heard)
      },
      onEnd: () => {
        setListening(false)
        stopRef.current = null
        // Done talking: find the foods right away.
        if (heardRef.current.trim()) setTimeout(() => findRef.current(), 50)
      },
      onError: setVoiceErr,
    })
  }

  const update = (key: number, patch: Partial<Line>) => setLines((ls) => (ls ? ls.map((l) => (l.key === key ? { ...l, ...patch } : l)) : ls))
  const updateAi = (key: number, patch: Partial<AiState>) => setLines((ls) => (ls ? ls.map((l) => (l.key === key && l.ai ? { ...l, ai: { ...l.ai, ...patch } } : l)) : ls))

  /** Steps 2–3: Claude checks the database for these lines, then searches the web for what's left. */
  const runAi = (targets: Line[]) => {
    if (!targets.length) return
    setAiMsg('')
    const keys = targets.map((l) => l.key)
    const cands = targets.map((l) => candidatesFor(all, l))
    setLines((ls) => (ls ? ls.map((l) => (keys.includes(l.key) ? { ...l, checking: true, include: false } : l)) : ls))
    aiRun.current.cancelled = true
    const token = { cancelled: false }
    aiRun.current = token
    track('ai_meal_lookup', { foods: targets.length })
    aiLookup(
      targets.map((l, i) => ({ query: l.item.raw, candidates: cands[i].list })),
      token,
    ).then(
      (res) => {
        if (token.cancelled) return
        if (res.note) setAiMsg(res.note)
        if (res.limit) {
          if (res.limit.special) showSecretNote(res.limit.message)
          else setAiMsg(res.limit.message)
        }
        aiQuota().then((q) => setAiLeft(q.left), () => undefined)
        setLines((ls) =>
          ls
            ? ls.map((l) => {
                const fi = keys.indexOf(l.key)
                if (fi < 0) return l
                const r = res.results[fi]
                const matched = r?.matchId ? cands[fi].foods.find((f) => f.id === r.matchId) : undefined
                if (matched) {
                  const fit = fitUnit(matched, l.item)
                  return { ...l, checking: false, food: fit.food, unitIndex: fit.unitIndex, qty: fit.qty, include: true, source: 'database' as const }
                }
                if (r?.items.length) return { ...l, checking: false, ai: { status: 'found' as const, items: r.items, pick: 0, jobId: res.jobId, fi } }
                // Not in the database and nothing on the web (or out of lookups): keep Crisp's best guess, if any.
                return { ...l, checking: false, include: !!l.food, ai: l.food ? undefined : { status: 'none' as const, pick: 0 } }
              })
            : ls,
        )
      },
      (e) => {
        if (token.cancelled) return
        // Couldn't check online: fall back to Crisp's own best guesses.
        setLines((ls) => (ls ? ls.map((l) => (keys.includes(l.key) ? { ...l, checking: false, include: !!l.food } : l)) : ls))
        if (e instanceof AiLimitError) {
          if (e.special) showSecretNote(e.message)
          else setAiMsg(e.message)
        } else setAiMsg(`${errorMessage(e)} Showing Crisp's best guesses instead.`)
      },
    )
  }

  const findRef = useRef<() => void>(() => undefined)
  const find = (input = textRef.current) => {
    const matched = matchText(all, input)
    const next: Line[] = matched.map((m, i) => {
      const sure = !!m.best && strongMatch(m.best.food, m.item.query)
      return {
        key: i,
        item: m.item,
        food: m.best?.food ?? null,
        unitIndex: m.best?.unitIndex ?? 0,
        qty: m.best?.qty ?? 1,
        alternatives: m.alternatives,
        include: sure,
        source: sure ? ('crisp' as const) : undefined,
      }
    })
    setLines(next)
    setOpen(null)
    setAiMsg('')
    track('typed_meal_matched', { lines: matched.length, voice: !!heardRef.current })
    // Step 1 is done (Crisp's sure matches). Everything else: database check by Claude, then the web.
    runAi(next.filter((l) => l.source !== 'crisp'))
  }

  const textRef = useRef(text)
  textRef.current = text
  findRef.current = () => find()

  const looksGood = async (l: Line) => {
    const a = l.ai
    if (!a?.items || a.jobId == null || a.fi == null) return
    updateAi(l.key, { saving: true })
    try {
      const saved = await confirmAiFood(a.jobId, a.fi, a.pick)
      // The AI answered for exactly what was said ("2 tacos", "medium fries"), so it's 1 of that serving.
      update(l.key, { food: customToLib(saved), unitIndex: 0, qty: 1, include: true, ai: undefined, source: 'web', alternatives: l.food ? [l.food, ...l.alternatives] : l.alternatives })
    } catch (e) {
      updateAi(l.key, { saving: false })
      toast(errorMessage(e), { tone: 'error' })
    }
  }

  const chosen = (lines ?? []).filter((l) => l.include && l.food && !l.ai)
  const total = useMemo(() => chosen.reduce((s, l) => s + macrosFor(l.food!, l.unitIndex, l.qty).cal, 0), [chosen])
  const aiBusy = (lines ?? []).some((l) => l.checking)
  const waiting = (lines ?? []).filter((l) => l.ai?.status === 'found').length

  const addAll = () => {
    for (const l of chosen) {
      rememberBrand(l.food!)
      const m = macrosFor(l.food!, l.unitIndex, l.qty)
      const item = { foodId: l.food!.id, name: l.food!.name, qty: l.qty, unit: l.food!.units[l.unitIndex].label, cal: m.cal, p: m.p, c: m.c, f: m.f }
      if (toList) addToTray({ ...item, food: l.food! })
      else addEntry(date, { ...item, meal }, l.source === 'web' ? 'ai' : heardRef.current ? 'voice' : 'typed', { silent: true })
    }
    if (toList) {
      toast(`${chosen.length} food${chosen.length === 1 ? '' : 's'} added to the list`)
      closeSheet()
      return
    }
    toast(`Added ${chosen.length} food${chosen.length === 1 ? '' : 's'} to ${mealLabel(meal)}`)
    closeAllSheets()
  }

  return (
    <Sheet tall title="Type or say it" dirty={!!text.trim() && !lines}>
      {!toList && <MealBubble value={meal} onChange={setMeal} />}
      <div className={`typeit-box${listening ? ' typeit-box--live' : ''}`}>
        <textarea
          className="input typeit-text"
          rows={4}
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            if (lines) setLines(null)
          }}
          placeholder={
            listening ? 'Listening… say what you ate' : '2 eggs, half an avocado, toast\nChick-fil-A spicy sandwich and medium waffle fries'
          }
          aria-label="What did you eat?"
          readOnly={listening}
        />
      </div>
      {voiceSupported() && (
        <button className={`mic-btn pressable${listening ? ' mic-btn--on' : ''}`} onClick={toggleVoice} aria-pressed={listening} aria-label={listening ? 'Stop listening' : 'Say what you ate'}>
          <span className="mic-icon">{listening ? <Stop size={22} weight="fill" /> : <Microphone size={24} weight="fill" />}</span>
          <span>{listening ? 'Listening… tap when done' : 'Tap and say what you ate'}</span>
        </button>
      )}
      {voiceErr && <Note tone="error">{voiceErr}</Note>}
      <p className="muted small">
        Restaurants and brands work too. Amounts like “2”, “1 cup”, “6 oz”, “medium” or “(45 calories)” help.
        {aiLeft != null && aiLeft <= 3 && <span className="ai-left"> {aiLeft} web lookup{aiLeft === 1 ? '' : 's'} left today.</span>}
      </p>
      {!lines && !listening && (
        <Button onClick={() => find()} disabled={!text.trim() || loading}>
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
          {aiMsg && <Note>{aiMsg}</Note>}
          <div className="typeit-list">
            {lines.map((l) =>
              l.ai ? (
                <AiLine key={l.key} line={l} onPick={(i) => updateAi(l.key, { pick: i })} onLooksGood={() => void looksGood(l)} onDismiss={() => update(l.key, { ai: undefined, include: !!l.food })} />
              ) : (
                <LineRow key={l.key} line={l} open={open === l.key} onToggleOpen={() => setOpen(open === l.key ? null : l.key)} onChange={(p) => update(l.key, p)} date={date} meal={meal} />
              ),
            )}
          </div>
          {waiting > 0 && <p className="muted small center">Tap “Looks good” on the AI finds you want to add.</p>}
          <Button onClick={addAll} disabled={!chosen.length || aiBusy} className="sheet-cta">
            Add {chosen.length} food{chosen.length === 1 ? '' : 's'}
            {toList ? ' to list' : ''} · {fmt(r0(total))} cal
          </Button>
        </>
      )}
    </Sheet>
  )
}

function AiLine({ line, onPick, onLooksGood, onDismiss }: { line: Line; onPick: (i: number) => void; onLooksGood: () => void; onDismiss: () => void }) {
  const a = line.ai!
  if (a.status === 'searching')
    return (
      <div className="typeit-row ai-searching">
        <span className="row-main">
          <span className="row-label">
            <Sparkle size={14} weight="fill" className="ai-star ai-spin" aria-hidden /> “{line.item.raw}”
          </span>
          <span className="row-sub">AI is looking it up…</span>
        </span>
      </div>
    )
  if (a.status !== 'found' || !a.items)
    return (
      <div className="typeit-row typeit-row--miss">
        <span className="row-main">
          <span className="row-label">“{line.item.raw}”</span>
          <span className="row-sub">The AI couldn't find this one. Try adding the restaurant or brand.</span>
        </span>
        <button className="link small" onClick={onDismiss}>
          OK
        </button>
      </div>
    )
  return <AiItemCard raw={line.item.raw} items={a.items} pick={a.pick} onPick={onPick} onLooksGood={onLooksGood} onDismiss={onDismiss} busy={!!a.saving} />
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
          <span className="row-sub">{line.checking ? 'Checking Crisp’s foods…' : 'No match in the food list'}</span>
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
          <span className="muted small">
            {line.source === 'web' && <Sparkle size={12} weight="fill" className="ai-star" aria-label="Found on the web" />} “{item.raw}”
          </span>
          <span className="row-label">{food.name}</span>
          {line.checking && (
            <span className="muted small">
              <Sparkle size={12} weight="fill" className="ai-star ai-spin" aria-hidden /> Double-checking…
            </span>
          )}
          {!line.checking && line.source === 'database' && food.custom && (
            <span className="muted small">{food.custom.source === 'ai' ? `Saved by ${food.custom.createdByName}` : `Added by ${food.custom.createdByName}`}</span>
          )}
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
            <Dropdown
              label="Portion size"
              value={unitIndex}
              onChange={(i) => onChange({ unitIndex: i, qty: food.units[i].label === 'g' ? Math.round((unit.grams ?? 100) * qty) : food.units[i].label === 'oz' ? Math.round(((unit.grams ?? 100) * qty) / 28.35) : 1 })}
              options={unitOptions(food.units)}
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
