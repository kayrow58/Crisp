// Fitness: Today | History, steps, workouts, Apple Fitness sync status (spec §4.5).
import { useEffect, useState } from 'react'
import { ArrowsClockwise, Barbell, CaretLeft, CaretRight, Info, Sneaker } from '@phosphor-icons/react'
import { InfoSheet } from '../components/InfoSheet'
import { runCrispSync } from '../lib/fitnessSync'
import { TabScreen } from '../components/Screen'
import { Sheet } from '../components/Sheet'
import { SwipeRow } from '../components/SwipeRow'
import { Button, Card, EmptyState, Field, Segmented } from '../components/ui'
import { dayStats, useToday } from '../lib/derived'
import { ensureDay, getDay, latestWeightKg, pull, refresh, today as todayKey, track, updateDay, useDay, useStore } from '../lib/store'
import { closeSheet, openSheet, pushScreen, toast } from '../lib/ui'
import { dayLabel, fmt, newId, r0, timeAgo } from '../lib/format'
import { addDays, daysBetween } from '../../shared/dates'
import { stepCalories } from '../../shared/calc'
import type { Workout } from '../../shared/types'
import { ConnectFitness } from './Settings'

export function Fitness() {
  const today = useToday()
  const [view, setView] = useState<'today' | 'history'>('today')
  const [date, setDate] = useState<string | null>(null) // null = today
  const shown = date && date < today ? date : today
  const profile = useStore((s) => s.profile)
  const last = profile?.fitnessLastSync
  // Back from the Shortcuts app after a sync: pull the new numbers right away.
  useEffect(() => {
    const on = () => document.visibilityState === 'visible' && void refresh()
    document.addEventListener('visibilitychange', on)
    return () => document.removeEventListener('visibilitychange', on)
  }, [])
  return (
    <TabScreen title="Fitness" onRefresh={refresh}>
      <SyncButton last={last} />
      <Segmented
        label="View"
        value={view}
        onChange={setView}
        options={[
          { value: 'today', label: shown === today ? 'Today' : 'Day' },
          { value: 'history', label: 'History' },
        ]}
      />
      {view === 'today' ? (
        <Today date={shown} today={today} setDate={(d) => setDate(d === today ? null : d)} />
      ) : (
        <History
          onPick={(d) => {
            setDate(d)
            setView('today')
          }}
        />
      )}
    </TabScreen>
  )
}

/** Runs the Crisp Sync Shortcut now (same as the nightly automation). */
function SyncButton({ last }: { last?: string }) {
  return (
    <div className="sync-wrap">
      <button className="sync-btn pressable" onClick={() => runCrispSync('fitness')} aria-label="Sync Apple Fitness now">
        <ArrowsClockwise size={20} weight="bold" className="sync-icon" aria-hidden />
        <span className="row-main">
          <strong>Sync Apple Fitness</strong>
          <span className="muted small">{last ? `Last synced ${timeAgo(last)}` : 'Not synced yet'}</span>
        </span>
      </button>
      {!last && (
        <button className="link small" onClick={() => pushScreen(<ConnectFitness />)}>
          First time? Set up the Crisp Sync Shortcut
        </button>
      )}
    </div>
  )
}

function Today({ date, today, setDate }: { date: string; today: string; setDate: (d: string) => void }) {
  const day = useDay(date)
  useEffect(() => {
    void ensureDay(date)
  }, [date])
  const profile = useStore((s) => s.profile)
  const stats = dayStats(profile, day)
  const track_ = profile?.activityMode === 'track'
  const last = profile?.fitnessLastSync
  const stale = date === today && last && daysBetween(last.slice(0, 10), date) >= 2
  const edited = !!day.fitnessLock?.exercise || day.steps?.source === 'manual'
  const steps = day.steps?.count ?? 0
  const kg = latestWeightKg() ?? 70

  return (
    <>
      <div className="day-nav">
        <button className="icon-btn pressable" onClick={() => setDate(addDays(date, -1))} aria-label="Previous day">
          <CaretLeft size={20} weight="bold" />
        </button>
        <strong className="day-nav-label">{dayLabel(date, today)}</strong>
        <button className="icon-btn pressable" onClick={() => setDate(addDays(date, 1))} disabled={date >= today} aria-label="Next day">
          <CaretRight size={20} weight="bold" />
        </button>
      </div>
      {stale && (
        <Card className="info-card">
          <p>
            <strong>Apple Fitness hasn't synced in {daysBetween(last!.slice(0, 10), date)} days.</strong>
          </p>
          <div className="quick-row">
            <Button onClick={() => pushScreen(<ConnectFitness />)}>Fix it</Button>
            <Button kind="secondary" onClick={() => openSheet(<StepsSheet date={date} />)}>
              Enter manually
            </Button>
          </div>
        </Card>
      )}

      <Card className="balance">
        <div className="balance-top">
          <span>
            <span className="muted small">Eaten</span>
            <strong className="balance-num">{fmt(r0(stats.totals.cal))}</strong>
          </span>
          <span className="balance-slash">/</span>
          <span>
            <span className="muted small">Allowed</span>
            <strong className="balance-num balance-num--neon">{fmt(stats.allowance)}</strong>
          </span>
          <button
            className="icon-btn balance-info"
            aria-label="How your allowance is worked out"
            onClick={() =>
              openSheet(
                <InfoSheet title={date === today ? 'Your allowance today' : `Your allowance · ${dayLabel(date, today)}`}>
                  {track_ ? (
                    <>
                      <div className="info-sum">
                        <span>Base</span>
                        <strong>{fmt(stats.targets.calories)}</strong>
                        <span>+ Steps</span>
                        <strong>{fmt(stats.bonus.steps)}</strong>
                        <span>+ Exercise & workouts</span>
                        <strong>{fmt(stats.bonus.workouts)}</strong>
                        <span className="info-sum-total">= Allowed</span>
                        <strong className="info-sum-total">{fmt(stats.allowance)}</strong>
                      </div>
                      <p className="muted">Steps count in full. Exercise and workouts count at 50%, since trackers often overestimate the calories they burn.</p>
                    </>
                  ) : (
                    <p className="muted">Your activity level is already built into your daily target, so steps and workouts here are for reference only and don't change your allowance.</p>
                  )}
                </InfoSheet>,
              )
            }
          >
            <Info size={18} />
          </button>
        </div>
      </Card>

      <div className="group-body">
        <button className="row row--tap" onClick={() => openSheet(<StepsSheet date={date} />)}>
          <Sneaker size={22} className="row-icon" aria-hidden />
          <span className="row-main">
            <span className="row-label">Steps</span>
            <span className="row-sub">
              {day.steps?.source === 'shortcut' ? 'From Apple Fitness' : steps ? 'Entered by you' : 'Not logged yet'} · ≈ {fmt(r0(stepCalories(steps, kg)))} cal
            </span>
          </span>
          <span className="row-value">{fmt(steps)}</span>
        </button>
      </div>

      <h3 className="list-title">Workouts</h3>
      {day.workouts.length ? (
        <div className="group-body">
          {day.workouts.map((w) => (
            <WorkoutRow key={w.id} w={w} date={date} />
          ))}
        </div>
      ) : steps === 0 ? (
        <EmptyState icon={Sneaker} text={date === today ? 'No activity yet today.' : 'No activity logged this day.'} />
      ) : (
        <p className="muted pad">No workouts {date === today ? 'yet today' : 'this day'}.</p>
      )}
      {edited && profile?.fitnessLastSync && (
        <button
          className="link small center"
          onClick={() => {
            updateDay(date, (d) => ({
              ...d,
              fitnessLock: { exercise: false, at: new Date().toISOString() },
              steps: d.steps ? { ...d.steps, source: 'shortcut' } : d.steps,
            }))
            toast('Apple Fitness will update this day on its next sync')
          }}
        >
          You changed this day's activity, so syncs leave it alone · Use Apple Fitness numbers again
        </button>
      )}

      <div className="quick-row sticky-actions">
        <Button kind="secondary" onClick={() => openSheet(<StepsSheet date={date} />)}>
          + Steps
        </Button>
        <Button onClick={() => openSheet(<WorkoutSheet date={date} />)}>+ Workout</Button>
      </div>
    </>
  )
}

function WorkoutRow({ w, date }: { w: Workout; date: string }) {
  const remove = () => {
    // Removing something Apple Fitness synced: keep it removed on future syncs.
    const lock = w.source === 'shortcut' ? { fitnessLock: { exercise: true, at: new Date().toISOString() } } : {}
    updateDay(date, (d) => ({ ...d, ...lock, workouts: d.workouts.filter((x) => x.id !== w.id), deleted: [...d.deleted, w.id] }))
    toast(`Deleted ${w.type}`, { undo: () => updateDay(date, (d) => ({ ...d, workouts: [...d.workouts, { ...w, id: newId() }] })) })
  }
  const content = (
    <>
      <Barbell size={22} className="row-icon" aria-hidden />
      <span className="row-main">
        <span className="row-label">{w.type}</span>
        <span className="row-sub">
          {w.minutes} min · {w.source === 'shortcut' ? 'Apple Fitness' : 'Manual'}
        </span>
      </span>
      <span className="row-value">{fmt(w.cal)} cal</span>
    </>
  )
  return (
    <SwipeRow label={`${w.type}, ${w.minutes} minutes, ${w.cal} calories`} onDelete={remove} onTap={() => openSheet(<WorkoutSheet date={date} editing={w} />)}>
      {content}
    </SwipeRow>
  )
}

function History({ onPick }: { onPick: (d: string) => void }) {
  const today = useToday()
  const docs = useStore((s) => s.docs)
  const days = Array.from({ length: 30 }, (_, i) => addDays(today, -i - 1))
  useEffect(() => {
    const missing = days.filter((d) => !docs[`days/${d}`]).slice(0, 30)
    if (missing.length) void pull(missing).catch(() => undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today])
  const withActivity = days.map((d) => ({ d, day: getDay(d) })).filter(({ day }) => (day.steps?.count ?? 0) > 0 || day.workouts.length > 0)
  if (!withActivity.length) return <EmptyState icon={Sneaker} text="Your activity history starts here." />
  return (
    <div className="history">
      {withActivity.map(({ d, day }) => (
        <section key={d}>
          <button className="history-day pressable" onClick={() => onPick(d)} aria-label={`Open ${dayLabel(d, today)} to see or change it`}>
            <span className="list-title">
              {dayLabel(d, today)} · {fmt(day.steps?.count ?? 0)} steps
            </span>
            <span className="link small">Edit ›</span>
          </button>
          {day.workouts.length > 0 && (
            <div className="group-body">
              {day.workouts.map((w) => (
                <div className="row" key={w.id}>
                  <span className="row-main">
                    <span className="row-label">{w.type}</span>
                    <span className="row-sub">{w.minutes} min</span>
                  </span>
                  <span className="row-value">{fmt(w.cal)} cal</span>
                </div>
              ))}
            </div>
          )}
        </section>
      ))}
    </div>
  )
}

function StepsSheet({ date }: { date: string }) {
  const cur = getDay(date).steps?.count
  const [v, setV] = useState(cur ? String(cur) : '')
  const save = () => {
    const count = Math.round(Number(v) || 0)
    updateDay(date, (d) => ({ ...d, steps: { count, source: 'manual', updatedAt: new Date().toISOString() } }))
    track('steps_logged', { count })
    toast(`Steps saved`)
    closeSheet()
  }
  return (
    <Sheet title="Steps">
      <Field label={date === todayKey() ? 'Steps today' : 'Steps that day'} inputMode="numeric" value={v} onChange={(e) => setV(e.target.value.replace(/\D/g, ''))} autoFocus />
      <Button className="sheet-cta" onClick={save} disabled={!v}>
        Save
      </Button>
    </Sheet>
  )
}

const WORKOUT_TYPES = ['Walk', 'Run', 'Strength', 'Cycling', 'HIIT', 'Yoga', 'Swim', 'Sports', 'Other']

function WorkoutSheet({ date, editing }: { date: string; editing?: Workout }) {
  const [type, setType] = useState(editing?.type ?? 'Strength')
  const [min, setMin] = useState(editing ? String(editing.minutes) : '')
  const [cal, setCal] = useState(editing ? String(editing.cal) : '')
  const save = () => {
    const synced = editing?.source === 'shortcut'
    // Editing a synced entry turns it into your own, and future syncs leave this day's exercise alone.
    const w: Workout = { id: synced ? newId() : editing?.id ?? newId(), type, minutes: Number(min) || 0, cal: Number(cal) || 0, source: 'manual', at: editing?.at ?? new Date().toISOString() }
    updateDay(date, (d) => ({
      ...d,
      ...(synced ? { fitnessLock: { exercise: true, at: new Date().toISOString() }, deleted: [...d.deleted, editing!.id] } : {}),
      workouts: editing ? d.workouts.map((x) => (x.id === editing.id ? w : x)) : [...d.workouts, w],
    }))
    if (!editing) track('workout_logged', { type })
    toast(editing ? 'Workout saved' : `${type} added`)
    closeSheet()
  }
  return (
    <Sheet title={editing ? 'Edit workout' : 'Add workout'} dirty={!editing && !!(min || cal)}>
      <div className="chips" role="radiogroup" aria-label="Workout type">
        {WORKOUT_TYPES.map((t) => (
          <button key={t} role="radio" aria-checked={type === t} className={`chip pressable${type === t ? ' chip--on' : ''}`} onClick={() => setType(t)}>
            {t}
          </button>
        ))}
      </div>
      <div className="field-row">
        <Field label="Minutes" inputMode="numeric" value={min} onChange={(e) => setMin(e.target.value.replace(/\D/g, ''))} />
        <Field label="Calories burned" inputMode="numeric" value={cal} onChange={(e) => setCal(e.target.value.replace(/\D/g, ''))} />
      </div>
      <Button className="sheet-cta" onClick={save} disabled={!cal && !min}>
        Save
      </Button>
    </Sheet>
  )
}
