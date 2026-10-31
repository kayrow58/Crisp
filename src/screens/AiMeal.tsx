// AI — talk or type what you ate, once. Claude reads the whole meal (restaurant context carries
// over: "grilled Chick-fil-A sandwich and waffle fries" = both from Chick-fil-A), matches foods already in
// Crisp's database (free), and searches the web only for what's new (one credit per meal).
// Results come back as thin cards. One bar at the bottom: Looks good (saves everything) / Not right
// (pick the wrong cards, say what's wrong, search again).
import { useEffect, useMemo, useRef, useState } from 'react'
import { Microphone, Minus, Plus, Stop, X } from '@phosphor-icons/react'
import { CrispMark } from '../components/CrispMark'
import { Sheet } from '../components/Sheet'
import { Button, Note } from '../components/ui'
import { Dropdown, MealBubble, unitOptions } from '../components/Pickers'
import { addToTray, trayActive } from '../lib/tray'
import { listen, voiceSupported } from '../lib/voice'
import { customToLib, macrosFor, type LibFood } from '../lib/foods'
import { matchText } from '../lib/parse'
import { fuzzySearch } from '../lib/match'
import { addEntry } from '../lib/logging'
import { rememberBrand } from '../lib/brands'
import { AiLimitError, aiMealLookup, aiQuota, confirmAiFood, sourceDomain, type AiResult } from '../lib/ai'
import { phraseOrder } from '../lib/aiPhrases'
import { closeAllSheets, closeSheet, toast } from '../lib/ui'
import { errorMessage } from '../lib/api'
import { fmt, r0 } from '../lib/format'
import { mealLabel } from '../lib/meals'
import { track } from '../lib/store'
import { useLibrary } from './Log'
import { usePrefs } from '../lib/prefs'
import { MicTipCard } from '../components/MicTip'
import { aiName, showSecretNote } from './AiLookup'
import type { AiCandidate, AiFoodItem, Meal } from '../../shared/types'

type Kind = 'database' | 'web' | 'none' | 'guess'

interface Card {
  key: number
  said: string
  kind: Kind
  /** database / guess: the food and amount */
  food?: LibFood
  unitIndex: number
  qty: number
  /** web: what the AI found (saved for everyone on "Looks good") */
  web?: { item: AiFoodItem; jobId: string; fi: number; pi: number }
  note?: string
}

let nextKey = 1

/** The foods from Crisp's database that might be in this meal, for Claude to choose from. */
function buildPool(all: LibFood[], text: string): { pool: AiCandidate[]; byId: Map<string, LibFood> } {
  const byId = new Map<string, LibFood>()
  const add = (f: LibFood | undefined) => f && byId.size < 70 && !byId.has(f.id) && byId.set(f.id, f)
  const words = new Set(text.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2))
  // Everything people confirmed before that shares a word with the meal (restaurant items, brands).
  for (const f of all) if (f.custom && f.name.toLowerCase().split(/[^a-z0-9]+/).some((w) => words.has(w))) add(f)
  for (const m of matchText(all, text)) {
    add(m.best?.food)
    for (const f of fuzzySearch(all, m.item.query, 6, { phrases: false })) add(f)
    for (const f of m.alternatives.slice(0, 3)) add(f)
  }
  const pool = [...byId.values()].map((f) => ({
    id: f.id,
    name: f.name,
    serving: f.units[0]?.label ?? '1 serving',
    cal: Math.round(macrosFor(f, 0, f.units[0]?.label === 'g' ? 100 : 1).cal),
    units: f.units.map((u) => (u.grams && u.label !== 'g' && u.label !== 'oz' ? `${u.label} (${Math.round(u.grams)} g)` : u.label)),
  }))
  return { pool, byId }
}

function cardMacros(c: Card) {
  if (c.web) {
    const it = c.web.item
    return { cal: it.cal * c.qty, p: it.p * c.qty, c: it.c * c.qty, f: it.f * c.qty }
  }
  return c.food ? macrosFor(c.food, c.unitIndex, c.qty) : { cal: 0, p: 0, c: 0, f: 0 }
}

/** Turn an AI answer into cards. */
function toCards(res: AiResult, byId: Map<string, LibFood>): Card[] {
  return res.results.map((r, fi) => {
    const key = nextKey++
    const food = r.matchId ? byId.get(r.matchId) : undefined
    if (food) {
      const unitIndex = Math.min(Math.max(0, r.unitIndex ?? 0), food.units.length - 1)
      return { key, said: r.query, kind: 'database' as const, food, unitIndex, qty: r.qty ?? 1 }
    }
    if (r.items.length) return { key, said: r.query, kind: 'web' as const, unitIndex: 0, qty: 1, web: { item: r.items[0], jobId: res.jobId, fi, pi: 0 } }
    return { key, said: r.query, kind: 'none' as const, unitIndex: 0, qty: 1, note: r.limited ? "Out of web lookups for today" : "Couldn't find this one" }
  })
}

/** If the AI can't be reached: Crisp's own best guesses, so the person isn't stuck. */
function guessCards(all: LibFood[], text: string): Card[] {
  return matchText(all, text).map((m) => ({
    key: nextKey++,
    said: m.item.raw,
    kind: m.best ? ('guess' as const) : ('none' as const),
    food: m.best?.food,
    unitIndex: m.best?.unitIndex ?? 0,
    qty: m.best?.qty ?? 1,
    note: m.best ? undefined : "Couldn't find this one",
  }))
}

export function AiMealSheet({ date, meal: m0 }: { date: string; meal: Meal }) {
  const [meal, setMeal] = useState(m0)
  const [text, setText] = useState('')
  const [sentText, setSentText] = useState('')
  const [phase, setPhase] = useState<'edit' | 'thinking' | 'results'>('edit')
  const [cards, setCards] = useState<Card[]>([])
  const [open, setOpen] = useState<number | null>(null)
  const [fixing, setFixing] = useState(false)
  const [fixes, setFixes] = useState<Record<number, string>>({})
  const [msg, setMsg] = useState('')
  const [left, setLeft] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const { all, loading } = useLibrary()
  const toList = trayActive()
  const [listening, setListening] = useState(false)
  const [voiceErr, setVoiceErr] = useState('')
  const prefs = usePrefs()
  const [triedMic, setTriedMic] = useState(false)
  const stopRef = useRef<(() => void) | null>(null)
  const before = useRef('')
  const usedVoice = useRef(false)
  const run = useRef<{ cancelled: boolean }>({ cancelled: false })
  const box = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    aiQuota().then((q) => setLeft(q.left), () => undefined)
    return () => {
      stopRef.current?.()
      run.current.cancelled = true
    }
  }, [])

  const talk = () => {
    if (listening) {
      stopRef.current?.()
      return
    }
    if (!voiceSupported()) {
      box.current?.focus()
      return
    }
    setVoiceErr('')
    setTriedMic(true)
    before.current = text.trim() ? `${text.trim().replace(/,$/, '')}, ` : ''
    setListening(true)
    usedVoice.current = true
    // Words show up as you talk. Nothing is sent until you tap "Find my foods", so you can fix them first.
    stopRef.current = listen({
      onText: (heard) => setText(before.current + heard),
      onEnd: () => {
        setListening(false)
        stopRef.current = null
      },
      onError: setVoiceErr,
    })
  }

  /** Send to the AI. `replace` = the cards being re-checked after "Not right". */
  const send = (input: string, replace?: number[]) => {
    stopRef.current?.()
    const { pool, byId } = buildPool(all, input)
    setMsg('')
    setPhase('thinking')
    run.current.cancelled = true
    const token = { cancelled: false }
    run.current = token
    track('ai_meal', { retry: !!replace, voice: usedVoice.current })
    aiMealLookup(input, pool, token).then(
      (res) => {
        if (token.cancelled) return
        if (res.limit) {
          if (res.limit.special) showSecretNote(res.limit.message)
          else setMsg(res.limit.message)
        } else if (res.note) setMsg(res.note)
        aiQuota().then((q) => setLeft(q.left), () => undefined)
        const fresh = toCards(res, byId)
        setCards((cur) => {
          if (!replace) return fresh
          const at = cur.findIndex((c) => replace.includes(c.key))
          const kept = cur.filter((c) => !replace.includes(c.key))
          kept.splice(at < 0 ? kept.length : Math.min(at, kept.length), 0, ...fresh)
          return kept
        })
        setFixing(false)
        setFixes({})
        setPhase('results')
      },
      (e) => {
        if (token.cancelled) return
        if (e instanceof AiLimitError) {
          if (e.special) showSecretNote(e.message)
          else setMsg(e.message)
        } else setMsg(`${errorMessage(e)} Showing Crisp's best guesses instead.`)
        if (!replace) setCards(guessCards(all, input))
        setFixing(false)
        setPhase('results')
      },
    )
  }

  const find = () => {
    const t = text.trim()
    if (!t) return
    setSentText(t)
    setCards([])
    setOpen(null)
    send(t)
  }

  const searchAgain = () => {
    const picked = cards.filter((c) => c.key in fixes)
    if (!picked.length) return
    const list = picked.map((c, i) => `${i + 1}. ${c.said}${fixes[c.key]?.trim() ? ` — correction: ${fixes[c.key].trim()}` : ''}`).join('\n')
    send(`Whole meal for context: "${sentText}". Only look up these foods again, using the corrections:\n${list}`, picked.map((c) => c.key))
  }

  const update = (key: number, patch: Partial<Card>) => setCards((cs) => cs.map((c) => (c.key === key ? { ...c, ...patch } : c)))
  const keep = cards.filter((c) => c.kind !== 'none')
  const total = useMemo(() => keep.reduce((s, c) => s + cardMacros(c).cal, 0), [keep])

  const looksGood = async () => {
    setSaving(true)
    try {
      for (const c of keep) {
        let food = c.food
        let unitIndex = c.unitIndex
        if (c.web) {
          food = customToLib(await confirmAiFood(c.web.jobId, c.web.fi, c.web.pi)) // saved for everyone
          unitIndex = 0
        }
        if (!food) continue
        rememberBrand(food)
        const m = macrosFor(food, unitIndex, c.qty)
        const item = { foodId: food.id, name: food.name, qty: c.qty, unit: food.units[unitIndex].label, cal: m.cal, p: m.p, c: m.c, f: m.f }
        if (toList) addToTray({ ...item, food })
        else addEntry(date, { ...item, meal }, c.web ? 'ai' : usedVoice.current ? 'voice' : 'typed', { silent: true })
      }
      toast(toList ? `${keep.length} food${keep.length === 1 ? '' : 's'} added to the list` : `Added ${keep.length} food${keep.length === 1 ? '' : 's'} to ${mealLabel(meal)}`)
      if (toList) closeSheet()
      else closeAllSheets()
    } catch (e) {
      toast(errorMessage(e), { tone: 'error' })
      setSaving(false)
    }
  }

  const hasText = !!text.trim()

  return (
    <Sheet
      tall
      title="AI"
      dirty={phase === 'results' || (hasText && phase === 'edit')}
      dirtyMessage="What you told the AI won't be added."
      footer={
        phase === 'results' && cards.length > 0 ? (
          <div className="ai-bar">
            {fixing ? (
              <>
                <span className="muted small ai-bar-hint">Tap the foods that are wrong and say what's off.</span>
                <div className="ai-bar-row">
                  <Button
                    kind="secondary"
                    onClick={() => {
                      setFixing(false)
                      setFixes({})
                    }}
                  >
                    Cancel
                  </Button>
                  <Button onClick={searchAgain} disabled={!Object.keys(fixes).length}>
                    <CrispMark size={16} /> Search again
                  </Button>
                </div>
              </>
            ) : (
              <>
                <span className="ai-bar-total">
                  {keep.length} food{keep.length === 1 ? '' : 's'} · <strong>{fmt(r0(total))} cal</strong>
                </span>
                <div className="ai-bar-row">
                  <Button kind="secondary" onClick={() => setFixing(true)} disabled={saving}>
                    Not right
                  </Button>
                  <Button onClick={() => void looksGood()} busy={saving} disabled={!keep.length}>
                    Looks good
                  </Button>
                </div>
              </>
            )}
          </div>
        ) : undefined
      }
    >
      {!toList && <MealBubble value={meal} onChange={setMeal} />}

      {phase === 'edit' ? (
        <>
          <p className="ai-intro">
            <CrispMark size={18} /> Tell me what you ate — talk or type, once. Restaurants and brands too.
          </p>
          <div className={`typeit-box ai-box${listening ? ' typeit-box--live' : ''}`}>
            <textarea
              ref={box}
              className="input typeit-text"
              rows={4}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={listening ? 'Listening… say what you ate' : 'e.g. grilled Chick-fil-A sandwich, medium waffle fries and a diet lemonade'}
              aria-label="What did you eat?"
              readOnly={listening}
            />
            {hasText && voiceSupported() && (
              <button className={`ai-mic-mini pressable${listening ? ' ai-mic-mini--on' : ''}`} onClick={talk} aria-label={listening ? 'Stop listening' : 'Add more by talking'}>
                {listening ? <Stop size={18} weight="fill" /> : <Microphone size={18} weight="fill" />}
              </button>
            )}
          </div>
          {voiceErr && <Note tone="error">{voiceErr}</Note>}
          {triedMic && !prefs.micTipDone && <MicTipCard />}
          {hasText && !listening ? (
            <button className="ai-go pressable" onClick={find} disabled={loading}>
              <CrispMark size={20} />
              <span>{loading ? 'Loading…' : 'Find my foods'}</span>
            </button>
          ) : (
            <button className={`ai-go pressable${listening ? ' ai-go--live' : ''}`} onClick={talk}>
              {listening ? <Stop size={20} weight="fill" aria-hidden /> : <CrispMark size={20} />}
              <span>{listening ? 'Listening… tap when done' : voiceSupported() ? 'AI · tap to talk' : 'AI · type above'}</span>
            </button>
          )}
          {left != null && left <= 3 && (
            <p className="muted small center">
              {left} web lookup{left === 1 ? '' : 's'} left today · foods already in Crisp don't use any
            </p>
          )}
        </>
      ) : (
        <button
          className="ai-sent pressable"
          onClick={() => {
            if (phase === 'thinking') return
            run.current.cancelled = true
            setText(sentText)
            setPhase('edit')
            setCards([])
          }}
          aria-label="Edit what you said"
        >
          <span className="muted small">You said</span>
          <span className="ai-sent-text">“{sentText}”</span>
          {phase === 'results' && <span className="link small">Edit</span>}
        </button>
      )}

      {phase === 'thinking' && <Thinking />}

      {phase === 'results' && (
        <>
          {msg && <p className="muted small">{msg}</p>}
          <div className="ai-cards">
            {cards.map((c) => (
              <AiCard
                key={c.key}
                card={c}
                open={open === c.key && !fixing}
                fixing={fixing}
                fix={fixes[c.key]}
                onTap={() => {
                  if (fixing) setFixes((f) => (c.key in f ? Object.fromEntries(Object.entries(f).filter(([k]) => Number(k) !== c.key)) : { ...f, [c.key]: '' }))
                  else setOpen(open === c.key ? null : c.key)
                }}
                onFix={(v) => setFixes((f) => ({ ...f, [c.key]: v }))}
                onRemove={() => {
                  setCards((cs) => cs.filter((x) => x.key !== c.key))
                  setFixes((f) => Object.fromEntries(Object.entries(f).filter(([k]) => Number(k) !== c.key)))
                }}
                onChange={(p) => update(c.key, p)}
              />
            ))}
          </div>
        </>
      )}
    </Sheet>
  )
}

/** One line with the yellow star and a rotating, themed status. */
function Thinking() {
  const order = useMemo(phraseOrder, [])
  const [i, setI] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setI((n) => (n + 1) % order.length), 3500)
    return () => clearInterval(t)
  }, [order])
  return (
    <div className="ai-thinking" role="status" aria-live="polite">
      <CrispMark size={28} working />
      <span key={i} className="ai-thinking-text">
        {order[i]}
      </span>
    </div>
  )
}

function AiCard({
  card: c,
  open,
  fixing,
  fix,
  onTap,
  onFix,
  onRemove,
  onChange,
}: {
  card: Card
  open: boolean
  fixing: boolean
  fix?: string
  onTap: () => void
  onFix: (v: string) => void
  onRemove: () => void
  onChange: (p: Partial<Card>) => void
}) {
  const selected = fix !== undefined
  const m = cardMacros(c)
  const name = c.web ? aiName(c.web.item) : c.food?.name ?? c.said
  const amount = c.web ? (c.qty === 1 ? c.web.item.serving : `${fmt(c.qty, 2)} × ${c.web.item.serving}`) : c.food ? amountText(c.food, c.unitIndex, c.qty) : ''
  const source =
    c.kind === 'web'
      ? c.web!.item.estimate
        ? 'Estimate'
        : c.web!.item.sourceUrl
          ? `From ${sourceDomain(c.web!.item.sourceUrl)}`
          : 'Typical values'
      : c.kind === 'database'
        ? c.food?.custom
          ? `Saved by ${c.food.custom.createdByName}`
          : 'From Crisp'
        : c.kind === 'guess'
          ? "Crisp's guess"
          : c.note
  const unit = c.food?.units[c.unitIndex]
  const step = c.web ? 0.5 : unit?.label === 'g' ? 10 : unit?.label === 'oz' ? 1 : 0.5
  return (
    <div className={`ai-line${c.kind === 'none' ? ' ai-line--miss' : ''}${selected ? ' ai-line--wrong' : ''}${fixing ? ' ai-line--pick' : ''}`}>
      <button className="ai-line-main" onClick={onTap} aria-pressed={fixing ? selected : undefined} aria-expanded={!fixing ? open : undefined}>
        <span className="ai-line-text">
          <span className="ai-line-name">{name}</span>
          <span className="ai-line-sub">
            {amount && <>{amount} · </>}
            {c.kind !== 'none' && (
              <>
                P {r0(m.p)} · C {r0(m.c)} · F {r0(m.f)} ·{' '}
              </>
            )}
            <span className={`ai-src ai-src--${c.kind}`}>{source}</span>
          </span>
        </span>
        <span className="ai-line-cal">{c.kind === 'none' ? '—' : fmt(r0(m.cal))}</span>
      </button>
      {selected && (
        <div className="ai-fix">
          <input
            className="input"
            autoFocus
            value={fix}
            onChange={(e) => onFix(e.target.value)}
            placeholder={`What's wrong? e.g. it was the grilled one, large size`}
            aria-label={`What's wrong with ${name}?`}
          />
          <button className="link small" onClick={onRemove}>
            <X size={12} weight="bold" aria-hidden /> Remove it instead
          </button>
        </div>
      )}
      {open && c.kind !== 'none' && (
        <div className="ai-edit">
          <div className="stepper">
            <button className="stepper-btn pressable" onClick={() => onChange({ qty: Math.max(0, Math.round((c.qty - step) * 100) / 100) })} aria-label="Less">
              <Minus size={18} weight="bold" />
            </button>
            <span className="stepper-val">{fmt(c.qty, 2)}</span>
            <button className="stepper-btn pressable" onClick={() => onChange({ qty: Math.round((c.qty + step) * 100) / 100 })} aria-label="More">
              <Plus size={18} weight="bold" />
            </button>
          </div>
          {c.food && c.food.units.length > 1 && (
            <Dropdown
              label="Portion size"
              value={c.unitIndex}
              onChange={(i) => {
                const grams = (unit?.grams ?? 100) * c.qty
                const label = c.food!.units[i].label
                onChange({ unitIndex: i, qty: label === 'g' ? Math.round(grams) : label === 'oz' ? Math.round((grams / 28.35) * 10) / 10 : 1 })
              }}
              options={unitOptions(c.food.units)}
            />
          )}
          {c.web?.item.sourceUrl && (
            <a className="link small" href={c.web.item.sourceUrl} target="_blank" rel="noreferrer">
              See where this came from
            </a>
          )}
        </div>
      )}
    </div>
  )
}

function amountText(food: LibFood, unitIndex: number, qty: number) {
  const label = food.units[unitIndex]?.label ?? ''
  if (label === 'g') return `${fmt(qty, 1)} g`
  if (label === 'oz') return `${fmt(qty, 2)} oz`
  if (/^[\d.½¼¾⅓⅔]/.test(label)) return qty === 1 ? label : `${fmt(qty, 2)} × ${label}`
  return `${fmt(qty, 2)} ${label}`
}
