// Weekend mode UI: the zoned calorie bar, its status line, the once-a-weekend invite,
// and the "almost at maintenance" heads-up that pops up when logging.
import { useEffect, useRef } from 'react'
import { Sparkle, Sun, WarningCircle } from '@phosphor-icons/react'
import { fmt, r0 } from '../lib/format'
import { Button } from './ui'
import { showOverlay, getUi } from '../lib/ui'
import { getPrefs, setPref } from '../lib/prefs'
import { setWeekend, weekendOnFor, zoneOf, zonesFor, type Zone, type Zones } from '../lib/weekend'
import { dayStats, useToday } from '../lib/derived'
import { useDay, useStore } from '../lib/store'

const ZONE_LABEL: Record<Zone, string> = {
  normal: 'Within goal',
  orange: 'Past goal',
  red: 'Near maintenance',
  over: 'Over maintenance',
}

/** Calorie bar with zones: goal → orange → red (200 from maintenance) → deep red past maintenance. */
export function WeekendBar({ eaten, zones, thick, label }: { eaten: number; zones: Zones; thick?: boolean; label: string }) {
  const { goal, redStart, maint } = zones
  const scale = Math.max(maint * 1.06, eaten * 1.03)
  const pc = (v: number) => `${(Math.max(0, v) / scale) * 100}%`
  const seg = (from: number, to: number) => Math.max(0, Math.min(eaten, to) - from)
  const parts: { cls: string; from: number; w: number }[] = [
    { cls: 'wb-fill wb-fill--goal', from: 0, w: seg(0, goal) },
    { cls: 'wb-fill wb-fill--orange', from: goal, w: seg(goal, redStart) },
    { cls: 'wb-fill wb-fill--red', from: redStart, w: seg(redStart, maint) },
    { cls: 'wb-fill wb-fill--over', from: maint, w: Math.max(0, eaten - maint) },
  ]
  return (
    <div
      className={`wbar${thick ? ' wbar--thick' : ''} wbar--${zoneOf(eaten, zones)}`}
      role="meter"
      aria-label={`${label}. ${ZONE_LABEL[zoneOf(eaten, zones)]}.`}
      aria-valuemin={0}
      aria-valuemax={Math.round(maint)}
      aria-valuenow={Math.round(eaten)}
    >
      <div className="wb-band wb-band--orange" style={{ left: pc(goal), width: pc(redStart - goal) }} />
      <div className="wb-band wb-band--red" style={{ left: pc(redStart), width: pc(maint - redStart) }} />
      {parts.map((p) => p.w > 0 && <div key={p.cls} className={p.cls} style={{ left: pc(p.from), width: pc(p.w) }} />)}
      <div className="wb-tick" style={{ left: pc(goal) }} />
      <div className="wb-tick wb-tick--maint" style={{ left: pc(maint) }} />
    </div>
  )
}

/** One line under the big number saying where they are. */
export function WeekendStatus({ eaten, zones }: { eaten: number; zones: Zones }) {
  const z = zoneOf(eaten, zones)
  const toMaint = r0(zones.maint - eaten)
  const text =
    z === 'normal'
      ? `Weekend mode · ${fmt(r0(zones.goal - eaten))} to goal, ${fmt(toMaint)} to maintenance`
      : z === 'orange'
        ? `Past goal · still losing · ${fmt(toMaint)} cal before maintenance`
        : z === 'red'
          ? `Careful · ${fmt(toMaint)} cal before you start gaining`
          : `Over maintenance by ${fmt(-toMaint)} · this adds weight`
  return (
    <span className={`wk-status wk-status--${z}`}>
      {(z === 'red' || z === 'over') && <WarningCircle size={14} weight="fill" aria-hidden />}
      {z === 'normal' && <Sun size={14} weight="fill" aria-hidden />}
      {text}
    </span>
  )
}

function Popup({ children, onClose }: { children: React.ReactNode; onClose?: () => void }) {
  return (
    <div className="popup-wrap" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="popup" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  )
}

export function WeekendPrompt({ date }: { date: string }) {
  const answer = (on: boolean) => {
    setWeekend(date, on)
    showOverlay(null)
  }
  return (
    <Popup>
      <div className="popup-icon popup-icon--sun">
        <Sun size={30} weight="fill" aria-hidden />
      </div>
      <h2 className="popup-title">It's the weekend. Turn on Weekend mode?</h2>
      <p className="popup-lead">Brunch, date night, drinks with friends — that's life, and it shouldn't wreck your progress. Weekend mode helps you enjoy it and still hit your goal.</p>
      <ul className="zone-legend">
        <li>
          <span className="zone-dot zone-dot--goal" />
          <span>
            <b>Up to your goal</b> — business as usual.
          </span>
        </li>
        <li>
          <span className="zone-dot zone-dot--orange" />
          <span>
            <b>Orange</b> — past your goal, but you're still not gaining. Just losing a little slower.
          </span>
        </li>
        <li>
          <span className="zone-dot zone-dot--red" />
          <span>
            <b>Red</b> — close to maintenance, where weight gain starts. We'll give you a heads-up 200 calories before.
          </span>
        </li>
      </ul>
      <div className="popup-tip">
        <Sparkle size={16} weight="fill" aria-hidden />
        <span>
          Out and about? Tap <b>Find my foods</b> and just say what you had. AI logs the whole meal in seconds — a quick, rough log beats skipping the day.
        </span>
      </div>
      <Button className="popup-btn" onClick={() => answer(true)}>
        Turn on Weekend mode
      </Button>
      <button className="link popup-link" onClick={() => answer(false)}>
        Not this weekend
      </button>
    </Popup>
  )
}

export function MaintenanceHeadsUp({ eaten, zones }: { eaten: number; zones: Zones }) {
  const left = Math.max(0, r0(zones.maint - eaten))
  const close = () => showOverlay(null)
  return (
    <Popup onClose={close}>
      <div className="popup-icon popup-icon--red">
        <WarningCircle size={30} weight="fill" aria-hidden />
      </div>
      <h2 className="popup-title">Heads up — {left > 0 ? `${fmt(left)} cal from maintenance` : 'you hit maintenance'}</h2>
      <p className="popup-lead">
        {left > 0 ? (
          <>
            Your maintenance today is about <b>{fmt(zones.maint)}</b>. If you keep eating or drinking past that, you'll start gaining weight.
          </>
        ) : (
          <>Anything more today starts adding weight.</>
        )}
      </p>
      <p className="popup-sub">You're still not over — today isn't a gain yet. Water or a zero-cal drink helps you coast, and a walk adds a little room.</p>
      <Button className="popup-btn" onClick={close}>
        Got it
      </Button>
    </Popup>
  )
}

/** 0 = fine (normal/orange), 1 = within 200 of maintenance, 2 = over maintenance */
const levelOf = (cal: number, z: Zones) => (cal >= z.maint ? 2 : cal >= z.redStart ? 1 : 0)

/**
 * Before posting: warns while foods are still in the list (or on the AI results) when they would put
 * the day within 200 cal of maintenance, and again if they'd go over. Returns where the day would land.
 */
export function usePendingHeadsUp(date: string, pending: number, enabled = true) {
  const profile = useStore((s) => s.profile)
  const day = useDay(date)
  const stats = dayStats(profile, day)
  const on = enabled && weekendOnFor(date, profile)
  const zones = on ? zonesFor(stats.allowance, stats.maintIncl) : null
  const eaten = stats.totals.cal
  const after = eaten + pending
  const level = zones ? levelOf(after, zones) : 0
  const shown = useRef<number | null>(null)
  useEffect(() => {
    if (!zones) return
    if (shown.current == null) shown.current = levelOf(eaten, zones) // what was already true before this list
    if (pending <= 0 || level <= shown.current) return
    shown.current = level
    setPref('weekendWarned', date)
    const z = zones
    const e = eaten
    const p = pending
    setTimeout(() => {
      if (!getUi().overlay) showOverlay(<ListHeadsUp eaten={e} pending={p} zones={z} />)
    }, 350)
  }, [level, !!zones]) // eslint-disable-line react-hooks/exhaustive-deps
  return { zones, after, zone: zones ? zoneOf(after, zones) : null }
}

function ListHeadsUp({ eaten, pending, zones }: { eaten: number; pending: number; zones: Zones }) {
  const after = eaten + pending
  const over = after >= zones.maint
  const gap = r0(Math.abs(zones.maint - after))
  const close = () => showOverlay(null)
  return (
    <Popup onClose={close}>
      <div className="popup-icon popup-icon--red">
        <WarningCircle size={30} weight="fill" aria-hidden />
      </div>
      <h2 className="popup-title">{over ? `This puts you ${fmt(gap)} cal over maintenance` : `This puts you ${fmt(gap)} cal from maintenance`}</h2>
      <p className="popup-lead">
        You've had <b>{fmt(r0(eaten))}</b> today. With the <b>{fmt(r0(pending))}</b> cal you're adding, you'd be at <b>{fmt(r0(after))}</b> — your maintenance is about <b>{fmt(zones.maint)}</b>.
      </p>
      <p className="popup-sub">
        {over
          ? "Past maintenance is where weight gain starts. You can remove something, pick a smaller amount, or add it anyway — your call."
          : "You're not gaining yet, but anything more today after this starts adding weight. Water or a zero-cal drink helps you coast."}
      </p>
      <Button className="popup-btn" onClick={close}>
        Got it
      </Button>
    </Popup>
  )
}

/** Watches today's total; when Weekend mode is on and a log crosses into red, shows the heads-up once that day. */
export function WeekendWatcher() {
  const today = useToday()
  const profile = useStore((s) => s.profile)
  const day = useDay(today)
  const stats = dayStats(profile, day)
  const zones = zonesFor(stats.allowance, stats.maintIncl)
  const cal = stats.totals.cal
  const prev = useRef<{ date: string; cal: number } | null>(null)
  useEffect(() => {
    const last = prev.current
    prev.current = { date: today, cal }
    if (!zones || !last || last.date !== today || cal <= last.cal) return
    if (!weekendOnFor(today, profile)) return
    if (getPrefs().weekendWarned === today) return
    if (last.cal < zones.redStart && cal >= zones.redStart) {
      setPref('weekendWarned', today)
      const z = zones
      setTimeout(() => {
        if (!getUi().overlay) showOverlay(<MaintenanceHeadsUp eaten={cal} zones={z} />)
      }, 700)
    }
  }, [cal, today]) // eslint-disable-line react-hooks/exhaustive-deps
  return null
}
