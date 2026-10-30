// "Type or say it" — write or say everything in one go; Crisp matches each food, you check the
// matches, then add them all at once.
// ✦ AI: switch to AI (or tap the AI button after a normal search) and the foods Crisp couldn't
// confidently match are looked up on the web by Claude — all of them in ONE lookup (one credit per
// meal). Foods already in the database (including ones confirmed before) never go to the AI.
// AI results are only saved for everyone after "Looks good".
import { useEffect, useMemo, useRef, useState } from 'react'
import { CheckCircle, Circle, Lightning, Microphone, Minus, Plus, Sparkle, Stop } from '@phosphor-icons/react'
import { Sheet } from '../components/Sheet'
import { Button, Note, Shimmer } from '../components/ui'
import { Dropdown, MealBubble, unitOptions } from '../components/Pickers'
import { addToTray, trayActive } from '../lib/tray'
import { listen, voiceSupported } from '../lib/voice'
import { customToLib, macrosFor, type LibFood } from '../lib/foods'
import { matchText, fitUnit, type ParsedItem } from '../lib/parse'
import { strongMatch } from '../lib/match'
import { addEntry } from '../lib/logging'
import { coversQuery, hasUnknownWord, rememberBrand, searchBrands } from '../lib/brands'
import { AiLimitError, aiLookup, aiQuota, confirmAiFood } from '../lib/ai'
import { closeAllSheets, closeSheet, openSheet, toast } from '../lib/ui'
import { errorMessage } from '../lib/api'
import { fmt, r0 } from '../lib/format'
import { mealLabel } from '../lib/meals'
import { track } from '../lib/store'
import { useLibrary, QuickAddSheet } from './Log'
import { AiItemCard, showSecretNote } from './AiLookup'
import type { AiFoodItem, Meal } from '../../shared/types'

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
  /** looking this one up in store brands */
  checking?: boolean
  /** this line went to the AI */
  ai?: AiState
  /** confirmed from an AI lookup */
  fromAi?: boolean
}

type Mode = 'crisp' | 'ai'

/** Lines Crisp didn't get (no match, or not a confident one) — what the AI button sends. */
const needsAi = (l: Line) => !l.fromAi && !l.ai && !l.checking && (!l.food || !strongMatch(l.food, l.item.query))

export function TypeItSheet({ date, meal: m0 }: { date: string; meal: Meal }) {
  const [meal, setMeal] = useState(m0)
  const [mode, setMode] = useState<Mode>('crisp')
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
    if (mode === 'ai' && aiLeft == null) aiQuota().then((q) => setAiLeft(q.left), () => undefined)
  }, [mode, aiLeft])

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

  /** Send these lines to the AI in one lookup. */
  const runAi = (targets: Line[]) => {
    if (!targets.length) return
    setAiMsg('')
    const keys = targets.map((l) => l.key)
    setLines((ls) => (ls ? ls.map((l) => (keys.includes(l.key) ? { ...l, include: false, ai: { status: 'searching', pick: 0 } } : l)) : ls))
    aiRun.current.cancelled = true
    const token = { cancelled: false }
    aiRun.current = token
    track('ai_meal_lookup', { foods: targets.length, mode })
    aiLookup(targets.map((l) => l.item.raw), token).then(
      (res) => {
        if (token.cancelled) return
        setAiLeft(res.left)
        if (res.note) setAiMsg(res.note)
        setLines((ls) =>
          ls
            ? ls.map((l) => {
                const fi = keys.indexOf(l.key)
                if (fi < 0) return l
                const items = res.results[fi]?.items ?? []
                return { ...l, ai: items.length ? { status: 'found', items, pick: 0, jobId: res.jobId, fi } : { status: 'none', pick: 0 } }
              })
            : ls,
        )
      },
      (e) => {
        if (token.cancelled) return
        // Put the lines back the way they were.
        setLines((ls) => (ls ? ls.map((l) => (keys.includes(l.key) ? { ...l, ai: undefined, include: !!l.food } : l)) : ls))
        if (e instanceof AiLimitError) {
          setAiLeft(0)
          if (e.special) showSecretNote(e.message)
          else setAiMsg(e.message)
        } else setAiMsg(errorMessage(e))
      },
    )
  }

  const findRef = useRef<() => void>(() => undefined)
  const find = (input = textRef.current) => {
    const matched = matchText(all, input)
    const next: Line[] = matched.map((m, i) => ({
      key: i,
      item: m.item,
      food: m.best?.food ?? null,
      unitIndex: m.best?.unitIndex ?? 0,
      qty: m.best?.qty ?? 1,
      alternatives: m.alternatives,
      include: !!m.best,
      checking: mode === 'crisp' && (!m.best || hasUnknownWord(all, m.item.query)),
    }))
    setLines(next)
    setOpen(null)
    setAiMsg('')
    track('typed_meal_matched', { lines: matched.length, voice: !!heardRef.current, mode })

    // ✦ AI mode: anything the database doesn't have for sure goes to the AI right away (one lookup).
    if (mode === 'ai') {
      runAi(next.filter(needsAi))
      return
    }
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
      update(l.key, { food: customToLib(saved), unitIndex: 0, qty: 1, include: true, ai: undefined, fromAi: true, alternatives: l.food ? [l.food, ...l.alternatives] : l.alternatives })
    } catch (e) {
      updateAi(l.key, { saving: false })
      toast(errorMessage(e), { tone: 'error' })
    }
  }

  const chosen = (lines ?? []).filter((l) => l.include && l.food && !l.ai)
  const total = useMemo(() => chosen.reduce((s, l) => s + macrosFor(l.food!, l.unitIndex, l.qty).cal, 0), [chosen])
  const missed = (lines ?? []).filter(needsAi)
  const aiBusy = (lines ?? []).some((l) => l.ai?.status === 'searching')
  const waiting = (lines ?? []).filter((l) => l.ai?.status === 'found').length

  const addAll = () => {
    for (const l of chosen) {
      rememberBrand(l.food!)
      const m = macrosFor(l.food!, l.unitIndex, l.qty)
      const item = { foodId: l.food!.id, name: l.food!.name, qty: l.qty, unit: l.food!.units[l.unitIndex].label, cal: m.cal, p: m.p, c: m.c, f: m.f }
      if (toList) addToTray({ ...item, food: l.food! })
      else addEntry(date, { ...item, meal }, l.fromAi ? 'ai' : heardRef.current ? 'voice' : 'typed', { silent: true })
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
      <div className="mode-switch" role="radiogroup" aria-label="How to find your foods">
        <button role="radio" aria-checked={mode === 'crisp'} className={`mode-opt${mode === 'crisp' ? ' mode-opt--on' : ''}`} onClick={() => setMode('crisp')}>
          Crisp foods
        </button>
        <button role="radio" aria-checked={mode === 'ai'} className={`mode-opt mode-opt--ai${mode === 'ai' ? ' mode-opt--on' : ''}`} onClick={() => setMode('ai')}>
          <Sparkle size={16} weight="fill" className="ai-star" aria-hidden /> AI
        </button>
      </div>
      {mode === 'ai' && (
        <p className="muted small">
          For restaurants, brands and eating out. Crisp checks its own foods first, then the AI looks up the rest on the web — one lookup per meal.
          {aiLeft != null && <strong className="ai-left"> {aiLeft} left today.</strong>}
        </p>
      )}
      <div className={`typeit-box${listening ? ' typeit-box--live' : ''}${mode === 'ai' ? ' typeit-box--ai' : ''}`}>
        <textarea
          className="input typeit-text"
          rows={4}
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            if (lines) setLines(null)
          }}
          placeholder={
            listening
              ? 'Listening… say what you ate'
              : mode === 'ai'
                ? 'Chick-fil-A spicy chicken sandwich, medium waffle fries, large sweet tea'
                : '2 eggs, about half an avocado, pb toast\nMonterey Jack cheese 60g, coffee w/ milk'
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
      {mode === 'crisp' && (
        <p className="muted small">Separate foods with commas, new lines or “and”. Amounts like “2”, “1 cup”, “6 oz”, “half” or “(45 calories)” help Crisp get it right.</p>
      )}
      {!lines && !listening && (
        <Button onClick={() => find()} disabled={!text.trim() || loading}>
          {loading ? (
            'Loading foods…'
          ) : mode === 'ai' ? (
            <>
              <Sparkle size={18} weight="fill" aria-hidden /> Find with AI
            </>
          ) : (
            'Find my foods'
          )}
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
          {missed.length > 0 && !aiBusy && (
            <button className="ai-btn pressable" onClick={() => runAi(missed)}>
              <Sparkle size={20} weight="fill" className="ai-star" aria-hidden />
              <span>
                AI · look up {missed.length === 1 ? 'the 1 food' : `the ${missed.length} foods`} Crisp didn't get
              </span>
            </button>
          )}
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
          <span className="muted small">
            {line.fromAi && <Sparkle size={12} weight="fill" className="ai-star" aria-label="Found by AI" />} “{item.raw}”
          </span>
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
