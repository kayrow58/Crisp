// Balance: where the weight is coming from. Calories eaten vs. maintenance — days within a week,
// weeks within a month, months within a year — next to what the scale actually did.
import { useEffect, useMemo, useState } from 'react'
import { CaretLeft, CaretRight, Info } from '@phosphor-icons/react'
import { PushedScreen } from '../components/Screen'
import { Card, Segmented } from '../components/ui'
import { InfoSheet } from '../components/InfoSheet'
import { getDay, pull, useDayIndex, useList, useStore } from '../lib/store'
import { targetsFor, useToday } from '../lib/derived'
import { openSheet } from '../lib/ui'
import { fmt, weightUnit } from '../lib/format'
import { calToLb, catchUp, counted, dayBalance, monthDates, scaleChangeKg, sumNet, weekDates, weekStart, weightOn, type DayBal } from '../lib/balance'
import { addDays } from '../../shared/dates'
import type { WeightEntry } from '../../shared/types'

type View = 'week' | 'month' | 'year'
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const md = (d: string) => `${MONTHS[Number(d.slice(5, 7)) - 1].slice(0, 3)} ${Number(d.slice(8))}`
const signed = (n: number, digits = 0) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${fmt(Math.abs(n), digits)}`
const tone = (n: number, overGoal = false) => (n > 0 ? 'bal-worse' : overGoal ? 'bal-bad' : 'bal-good')

interface Bar {
  key: string
  label: string
  /** value shown under the bar */
  text: string
  /** signed net calories (bar height); null = nothing logged */
  net: number | null
  cls: 'u' | 'o' | 'r' | 'g' | 'p'
  onPick?: () => void
}

export function Balance() {
  const profile = useStore((s) => s.profile)
  const today = useToday()
  const [view, setView] = useState<View>('week')
  const [anchor, setAnchor] = useState(today)
  const items = useList<WeightEntry>('weights')
  const weights = useMemo(() => [...items].sort((a, b) => a.date.localeCompare(b.date)), [items])
  const index = useDayIndex()
  useStore((s) => s.docs) // re-render as days arrive
  const units = profile?.units ?? 'imperial'
  const unit = weightUnit(units)
  const toUnit = (lb: number) => (units === 'metric' ? lb * 0.4536 : lb)

  // which dates this view covers
  const range = useMemo(() => {
    if (view === 'week') {
      const s = weekStart(anchor)
      return { from: s, to: addDays(s, 6) }
    }
    if (view === 'month') {
      const ds = monthDates(anchor.slice(0, 7))
      return { from: ds[0], to: ds[ds.length - 1] }
    }
    const y = anchor.slice(0, 4)
    return { from: `${y}-01-01`, to: `${y}-12-31` }
  }, [view, anchor])

  // fetch any logged days in range this phone doesn't have yet (60 per request)
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    const need = index.filter((d) => d >= range.from && d <= range.to && !getDay(d).foods.length)
    if (!need.length) return
    let live = true
    setLoading(true)
    ;(async () => {
      for (let i = 0; i < need.length; i += 60) await pull(need.slice(i, i + 60)).catch(() => undefined)
      if (live) setLoading(false)
    })()
    return () => {
      live = false
    }
  }, [range.from, range.to, index.length]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!profile) return null
  const goalCal = targetsFor(profile).calories
  const fallbackKg = profile.startWeightKg ?? 70
  const bal = (d: string): DayBal | null => dayBalance(profile, getDay(d), weightOn(d, weights, fallbackKg), goalCal, today)
  const dayList = (dates: string[]) => dates.map(bal).filter((b): b is DayBal => !!b)

  const shift = (n: number) => {
    if (view === 'week') setAnchor(addDays(weekStart(anchor), 7 * n))
    else if (view === 'month') {
      const [y, m] = anchor.split('-').map(Number)
      const t = new Date(Date.UTC(y, m - 1 + n, 1))
      setAnchor(t.toISOString().slice(0, 10))
    } else setAnchor(`${Number(anchor.slice(0, 4)) + n}-01-01`)
  }
  const canNext = range.to < today

  let title = ''
  let bars: Bar[] = []
  let days: DayBal[] = []
  if (view === 'week') {
    const dates = weekDates(range.from)
    title = `${md(dates[0])} – ${dates[0].slice(5, 7) === dates[6].slice(5, 7) ? Number(dates[6].slice(8)) : md(dates[6])}`
    days = dayList(dates)
    bars = dates.map((d, i) => {
      const b = days.find((x) => x.date === d)
      if (!b || !b.logged || d > today) return { key: d, label: DOW[i], text: '—', net: null, cls: 'g' }
      if (b.partial) return { key: d, label: DOW[i], text: 'today', net: b.net, cls: 'p' }
      return { key: d, label: DOW[i], text: signed(b.net), net: b.net, cls: b.net > 0 ? 'r' : b.eaten > b.goal ? 'o' : 'u' }
    })
  } else if (view === 'month') {
    const dates = monthDates(range.from.slice(0, 7))
    title = MONTHS[Number(range.from.slice(5, 7)) - 1]
    days = dayList(dates)
    const starts = [...new Set(dates.map(weekStart))]
    bars = starts.map((s) => {
      const wk = days.filter((d) => weekStart(d.date) === s)
      const { net, logged } = sumNet(wk)
      const overGoal = wk.filter(counted).reduce((a, d) => a + d.eaten - d.goal, 0) > 0
      const label = md(s < range.from ? range.from : s)
      if (!logged) return { key: s, label, text: '—', net: null, cls: 'g', onPick: () => (setView('week'), setAnchor(s)) }
      return { key: s, label, text: signed(net), net, cls: net > 0 ? 'r' : overGoal ? 'o' : 'u', onPick: () => (setView('week'), setAnchor(s < range.from ? range.from : s)) }
    })
  } else {
    const y = range.from.slice(0, 4)
    title = y
    const all: DayBal[] = []
    bars = MONTHS.map((m, i) => {
      const ym = `${y}-${String(i + 1).padStart(2, '0')}`
      const ds = monthDates(ym).filter((d) => d <= today && index.includes(d))
      const mb = dayList(ds)
      all.push(...mb)
      const { net, logged } = sumNet(mb)
      if (!logged) return { key: ym, label: m[0], text: '', net: null, cls: 'g' }
      const lb = toUnit(calToLb(net))
      return { key: ym, label: m[0], text: signed(lb, 1), net, cls: net > 0 ? 'r' : 'u', onPick: () => (setView('month'), setAnchor(`${ym}-01`)) }
    })
    days = all
  }

  const { net, logged } = sumNet(days)
  const foodLb = toUnit(calToLb(net))
  const scaleKg = scaleChangeKg(weights, range.from, range.to < today ? range.to : today)
  const scale = scaleKg == null ? null : units === 'metric' ? scaleKg : scaleKg * 2.2046
  const isThisWeek = view === 'week' && range.from <= today && today <= range.to
  const cu = isThisWeek && profile.goal === 'lose' ? catchUp(days, today, profile, goalCal) : null
  const goalPace = view === 'week' ? Math.round((goalCal - (days[0]?.maint ?? goalCal)) * 7) : null
  const elapsed = monthDates(range.from.slice(0, 7)).filter((d) => d < today).length

  // best / toughest week (month view)
  const weekBars = view === 'month' ? bars.filter((b) => b.net != null) : []
  const best = weekBars.length ? weekBars.reduce((a, b) => ((b.net ?? 0) < (a.net ?? 0) ? b : a)) : null
  const worst = weekBars.length > 1 ? weekBars.reduce((a, b) => ((b.net ?? 0) > (a.net ?? 0) ? b : a)) : null

  const max = Math.max(250, ...bars.map((b) => Math.abs(b.net ?? 0)))
  const startedLabel = profile.createdAt && profile.createdAt.slice(0, 4) === range.from.slice(0, 4) ? md(profile.createdAt.slice(0, 10)) : null

  return (
    <PushedScreen
      title="Balance"
      right={
        <button className="icon-btn" aria-label="How Balance works" onClick={() => openSheet(<BalanceInfo />)}>
          <Info size={20} />
        </button>
      }
    >
      <Segmented
        label="Period"
        value={view}
        onChange={(v) => {
          setView(v)
          setAnchor(today)
        }}
        options={[
          { value: 'week', label: 'Week' },
          { value: 'month', label: 'Month' },
          { value: 'year', label: 'Year' },
        ]}
      />
      <Card className="bal-card">
        <div className="bal-nav">
          <button className="icon-btn" onClick={() => shift(-1)} aria-label="Previous">
            <CaretLeft size={18} weight="bold" />
          </button>
          <b>{title}</b>
          <button className="icon-btn" onClick={() => shift(1)} disabled={!canNext} aria-label="Next">
            <CaretRight size={18} weight="bold" />
          </button>
        </div>
        {logged ? (
          view === 'year' ? (
            <>
              <div className="bal-big">
                <span className={`bal-n ${tone(net)}`}>
                  {signed(foodLb, 1)} {unit}
                </span>
                <span className="muted">from food</span>
              </div>
              <p className="muted small">Estimate — real loss slows over months as your body adapts.</p>
            </>
          ) : (
            <>
              <div className="bal-big">
                <span className={`bal-n ${tone(net)}`}>{signed(net)}</span>
                <span className="muted">cal {view === 'week' ? 'this week' : isCurrent(range, today) ? 'so far' : 'this month'}</span>
              </div>
              <p className="muted small">
                ≈{' '}
                <b className={tone(net)}>
                  {fmt(Math.abs(foodLb), 1)} {unit} {net > 0 ? 'gained' : 'lost'}
                </b>{' '}
                from food{goalPace != null && goalPace < 0 && profile.goal === 'lose' ? ` · goal pace ${signed(goalPace)}` : ''}
              </p>
            </>
          )
        ) : (
          <p className="muted small">{loading ? 'Loading your days…' : 'Nothing logged in this ' + view + ' yet.'}</p>
        )}
        <p className="bal-axis muted">▲ over maintenance · ▼ under</p>
        <div className={`bal-chart bal-chart--${view}`}>
          <div className="bal-zero" />
          {bars.map((b) => (
            <button key={b.key} className="bal-col" onClick={b.onPick} disabled={!b.onPick} aria-label={`${b.label}: ${b.text}`}>
              <span className="bal-slot">
                {b.net == null ? (
                  <i className="bal-bar bal-bar--g" />
                ) : (
                  <i className={`bal-bar bal-bar--${b.cls} ${b.net > 0 ? 'up' : 'down'}`} style={{ height: `${Math.max(3, (Math.abs(b.net) / max) * 50)}%` }} />
                )}
              </span>
              <span className={`bal-val ${b.cls === 'r' ? 'bal-worse' : b.cls === 'o' ? 'bal-bad' : b.cls === 'u' ? 'bal-good' : 'muted'}`}>{b.text}</span>
              <span className="bal-lbl">{b.label}</span>
            </button>
          ))}
        </div>
        {view === 'week' ? (
          <div className="bal-legend">
            <span>
              <i className="u" />
              Under
            </span>
            <span>
              <i className="o" />
              Over goal
            </span>
            <span>
              <i className="r" />
              Over maintenance
            </span>
            <span>
              <i className="g" />
              Not logged
            </span>
          </div>
        ) : (
          <p className="muted small center">Tap a {view === 'month' ? 'week to see its days' : 'month to see its weeks'}</p>
        )}
      </Card>

      {logged > 0 && (
        <Card>
          <div className="bal-cmp">
            <div>
              <small>From food (estimate)</small>
              <b className={tone(net)}>
                {signed(foodLb, 1)} {unit}
              </b>
            </div>
            <div>
              <small>Your scale{view === 'week' ? ' (week avg)' : ''}</small>
              {scale == null ? <span className="muted small">Weigh in to compare</span> : <b className={tone(scale)}>{`${signed(scale, 1)} ${unit}`}</b>}
            </div>
          </div>
          {scale != null && <p className="muted small center">{matchNote(foodLb, scale, view)}</p>}
          {view === 'year' && startedLabel && <p className="muted small center">Since you started Crisp ({startedLabel})</p>}
        </Card>
      )}

      {view === 'month' && logged > 0 && (
        <Card>
          {best && (
            <div className="bal-row">
              <span className="muted">Best week</span>
              <span className={tone(best.net ?? 0)}>
                {best.label} · {best.text}
              </span>
            </div>
          )}
          {worst && worst !== best && (
            <div className="bal-row">
              <span className="muted">Toughest week</span>
              <span className={tone(worst.net ?? 0)}>
                {worst.label} · {worst.text}
              </span>
            </div>
          )}
          <div className="bal-row">
            <span className="muted">Days logged</span>
            <span>
              {logged} of {isCurrent(range, today) ? elapsed : monthDates(range.from.slice(0, 7)).length}
            </span>
          </div>
        </Card>
      )}

      {cu && cu.perDay > 0 && (
        <Card className="bal-catch">
          <h3>Catch up this week</h3>
          <p>
            You're <b>{fmt(cu.behind)} over</b> your weekly goal so far. Eat <b>~{fmt(cu.perDay)} less</b> on {cu.daysLeft === 1 ? 'today' : `each of the next ${cu.daysLeft} days`}{' '}
            {cu.covers ? 'and you’ll finish the week on goal.' : 'to make up most of it — no need to cut harder than that.'}
          </p>
        </Card>
      )}
      {cu && cu.behind < -300 && (
        <Card className="bal-ahead">
          <p>
            You're <b>{fmt(-cu.behind)} ahead</b> of your weekly goal. Nice work — that's room for a treat if you want it.
          </p>
        </Card>
      )}
    </PushedScreen>
  )
}

const isCurrent = (r: { from: string; to: string }, today: string) => r.from <= today && today <= r.to

function matchNote(food: number, scale: number, view: View) {
  const diff = Math.abs(food - scale)
  if (view === 'week' && diff > 2) return 'Water and salt move the scale a lot in a week — the monthly view is more reliable.'
  if (diff <= Math.max(0.6, Math.abs(scale) * 0.35)) return 'Close match — your logging is on track.'
  if (scale > food) return 'The scale is higher than your logs suggest — a few foods may be missing or bigger than logged.'
  return 'You’re losing faster than your logs suggest — great, or your maintenance may be a bit higher than estimated.'
}

function BalanceInfo() {
  return (
    <InfoSheet title="How Balance works">
      <p>Each day: calories you ate minus your maintenance calories (including steps and workouts). Under maintenance means you lost weight that day.</p>
      <p className="muted">
        Totals use about 3,500 calories per pound. Days you didn't log are left out, not counted as zero, and today doesn't count until it's over.
      </p>
      <p className="muted">
        The scale moves 2–5 lb a day with water, salt and carbs, so compare over weeks and months. Over months real loss also slows a little as your body
        adapts, so long-term numbers are estimates.
      </p>
    </InfoSheet>
  )
}
