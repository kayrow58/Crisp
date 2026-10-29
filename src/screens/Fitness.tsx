// Fitness: Today | History, steps, workouts, Apple Fitness sync status (spec §4.5).
import { useEffect, useState } from 'react'
import { Barbell, Sneaker } from '@phosphor-icons/react'
import { TabScreen } from '../components/Screen'
import { Sheet } from '../components/Sheet'
import { SwipeRow } from '../components/SwipeRow'
import { Button, Card, EmptyState, Field, Segmented } from '../components/ui'
import { dayStats, useToday } from '../lib/derived'
import { getDay, latestWeightKg, pull, refresh, track, updateDay, useDay, useStore } from '../lib/store'
import { closeSheet, openSheet, pushScreen, toast } from '../lib/ui'
import { dayLabel, fmt, newId, r0, timeAgo } from '../lib/format'
import { addDays, daysBetween } from '../../shared/dates'
import { stepCalories } from '../../shared/calc'
import type { Workout } from '../../shared/types'
import { ConnectFitness } from './Settings'

export function Fitness() {
  const [view, setView] = useState<'today' | 'history'>('today')
  const profile = useStore((s) => s.profile)
  const last = profile?.fitnessLastSync
  return (
    <TabScreen title="Fitness" onRefresh={refresh} right={last ? <span className="muted small">⟳ Synced {timeAgo(last)}</span> : undefined}>
      <Segmented
        label="View"
        value={view}
        onChange={setView}
        options={[
          { value: 'today', label: 'Today' },
          { value: 'history', label: 'History' },
        ]}
      />
      {view === 'today' ? <Today /> : <History />}
    </TabScreen>
  )
}

function Today() {
  const date = useToday()
  const day = useDay(date)
  const profile = useStore((s) => s.profile)
  const stats = dayStats(profile, day)
  const track_ = profile?.activityMode === 'track'
  const last = profile?.fitnessLastSync
  const stale = last && daysBetween(last.slice(0, 10), date) >= 2
  const steps = day.steps?.count ?? 0
  const kg = latestWeightKg() ?? 70

  return (
    <>
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
        </div>
        {track_ ? (
          <p className="muted small">
            Base {fmt(stats.targets.calories)} + Steps {fmt(stats.bonus.steps)} + Workouts {fmt(stats.bonus.workouts)}
            <br />
            Workouts count at 50% since trackers often overestimate.
          </p>
        ) : (
          <p className="muted small">Your activity level is already in your target, so logged activity here is for reference only.</p>
        )}
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
        <EmptyState icon={Sneaker} text="No activity yet today." />
      ) : (
        <p className="muted pad">No workouts yet today.</p>
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
    updateDay(date, (d) => ({ ...d, workouts: d.workouts.filter((x) => x.id !== w.id), deleted: [...d.deleted, w.id] }))
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
  if (w.source === 'shortcut') return <div className="row">{content}</div>
  return (
    <SwipeRow label={`${w.type}, ${w.minutes} minutes, ${w.cal} calories`} onDelete={remove} onTap={() => openSheet(<WorkoutSheet date={date} editing={w} />)}>
      {content}
    </SwipeRow>
  )
}

function History() {
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
          <h3 className="list-title">
            {dayLabel(d, today)} · {fmt(day.steps?.count ?? 0)} steps
          </h3>
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
      <Field label="Steps today" inputMode="numeric" value={v} onChange={(e) => setV(e.target.value.replace(/\D/g, ''))} autoFocus />
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
    const w: Workout = { id: editing?.id ?? newId(), type, minutes: Number(min) || 0, cal: Number(cal) || 0, source: 'manual', at: editing?.at ?? new Date().toISOString() }
    updateDay(date, (d) => ({ ...d, workouts: editing ? d.workouts.map((x) => (x.id === w.id ? w : x)) : [...d.workouts, w] }))
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
