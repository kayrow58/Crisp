// Weight: latest, graph with ranges, estimated change, entries, milestones (spec §4.6–4.7).
import { useMemo, useState } from 'react'
import { Info, Scales } from '@phosphor-icons/react'
import { TabScreen } from '../components/Screen'
import { Sheet } from '../components/Sheet'
import { SwipeRow } from '../components/SwipeRow'
import { WeightChart } from '../components/WeightChart'
import { Confetti } from '../components/Confetti'
import { Button, Card, EmptyState, Field, Note, Segmented } from '../components/ui'
import { dayStats, useToday } from '../lib/derived'
import { getDay, getState, list, refresh, setDoc, track, updateProfile, useList, useStore } from '../lib/store'
import { closeSheet, openSheet, showOverlay, toast } from '../lib/ui'
import { InfoSheet } from '../components/InfoSheet'
import { usePrefs } from '../lib/prefs'
import { dayLabel, fmt, fromDisplayWeight, newId, showWeight, toDisplayWeight, weightUnit } from '../lib/format'
import { addDays } from '../../shared/dates'
import { estimatedChangeLb, goalProgress, newMilestones, suggestTargets } from '../../shared/calc'
import type { WeightEntry } from '../../shared/types'

type Range = 'W' | 'M' | '3M' | 'Y' | 'All'
const RANGE_DAYS: Record<Range, number> = { W: 7, M: 31, '3M': 92, Y: 366, All: 100000 }

export function Weight() {
  const items = useList<WeightEntry>('weights')
  const profile = useStore((s) => s.profile)
  const units = profile?.units ?? 'imperial'
  const prefs = usePrefs()
  const today = useToday()
  const [range, setRange] = useState<Range>('M')
  const sorted = useMemo(() => [...items].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id)), [items])
  const latest = sorted[sorted.length - 1]
  const from = addDays(today, -RANGE_DAYS[range] + 1)
  const points = sorted.filter((w) => range === 'All' || w.date >= from).map((w) => ({ date: w.date, value: toDisplayWeight(w.kg, units) }))

  return (
    <TabScreen title="Weight" onRefresh={refresh}>
      {latest ? (
        <div className="weight-latest">
          <span className="big-number">{fmt(toDisplayWeight(latest.kg, units), 1, true)}</span>
          <span className="muted">
            {' '}
            {weightUnit(units)} · {dayLabel(latest.date, today)}
          </span>
        </div>
      ) : null}

      {sorted.length === 0 ? (
        <EmptyState icon={Scales} text="Add your first weigh-in to start your graph." action={<Button onClick={() => openSheet(<AddWeightSheet />)}>+ Add weight</Button>} />
      ) : (
        <>
          <Segmented label="Range" value={range} onChange={setRange} options={(['W', 'M', '3M', 'Y', 'All'] as Range[]).map((r) => ({ value: r, label: r }))} />
          <Card className="chart-card">
            {points.length >= 2 ? (
              <WeightChart points={points} unit={weightUnit(units)} style={prefs.graph} />
            ) : (
              <p className="muted center pad">{sorted.length === 1 ? 'One more weigh-in and your graph comes to life.' : 'No weigh-ins in this range yet.'}</p>
            )}
          </Card>
        </>
      )}

      <EstimateCard today={today} />

      {sorted.length > 0 && (
        <>
          <h3 className="list-title">Entries</h3>
          <div className="group-body">
            {[...sorted].reverse().slice(0, 60).map((w) => (
              <SwipeRow
                key={w.id}
                label={`${showWeight(w.kg, units)} on ${dayLabel(w.date, today)}`}
                onTap={() => openSheet(<AddWeightSheet editing={w} />)}
                onDelete={() => {
                  const cur = list<WeightEntry>('weights')
                  setDoc('weights', { items: cur.items.filter((x) => x.id !== w.id), deleted: [...cur.deleted, w.id] })
                  toast('Weigh-in deleted', {
                    undo: () => {
                      const c = list<WeightEntry>('weights')
                      setDoc('weights', { items: [...c.items, { ...w, id: newId() }], deleted: c.deleted })
                    },
                  })
                }}
              >
                <span className="row-main">
                  <span className="row-label">{showWeight(w.kg, units)}</span>
                </span>
                <span className="row-value">{dayLabel(w.date, today)}</span>
              </SwipeRow>
            ))}
          </div>
        </>
      )}
      <div className="sticky-actions">
        <Button onClick={() => openSheet(<AddWeightSheet />)}>+ Add weight</Button>
      </div>
    </TabScreen>
  )
}

function EstimateCard({ today }: { today: string }) {
  const profile = useStore((s) => s.profile)
  useStore((s) => s.docs) // re-render as days change
  const estimate = (d: string) => {
    const day = getDay(d)
    if (!day.foods.length) return null
    const s = dayStats(profile, day)
    return s.maintIncl == null ? null : estimatedChangeLb(s.totals.cal, s.maintIncl)
  }
  const todayLb = estimate(today)
  const week = Array.from({ length: 7 }, (_, i) => estimate(addDays(today, -i))).filter((x): x is number => x != null)
  if (todayLb == null && !week.length) return null
  const units = profile?.units ?? 'imperial'
  const show = (lb: number) => {
    const v = units === 'metric' ? lb * 0.4536 : lb
    return `≈ ${v > 0 ? '+' : v < 0 ? '−' : ''}${fmt(Math.abs(v), 2)} ${weightUnit(units)}`
  }
  return (
    <Card className="estimate">
      <div className="estimate-head">
        <span className="muted small">Estimated change</span>
        <button
          className="icon-btn"
          onClick={() =>
            openSheet(
              <InfoSheet title="Estimated change">
                <p>This estimates how your weight may change based on what you log.</p>
                <p className="muted">
                  How it works: (calories eaten − your maintenance calories, including activity) ÷ 3,500 calories per pound.
                </p>
                <p className="muted">
                  It's only as accurate as your food and activity logging and your maintenance calories. Daily weigh-ins also move with water, salt and other
                  factors, so the scale won't match it day to day.
                </p>
              </InfoSheet>,
            )
          }
          aria-label="About this estimate"
        >
          <Info size={18} />
        </button>
      </div>
      <p className="estimate-nums">
        {todayLb != null && <strong>{show(todayLb)} today</strong>}
        {todayLb != null && week.length > 0 && ' · '}
        {week.length > 0 && <span>{show(week.reduce((a, b) => a + b, 0))} this week</span>}
      </p>
    </Card>
  )
}

function AddWeightSheet({ editing }: { editing?: WeightEntry }) {
  const profile = useStore((s) => s.profile)!
  const units = profile.units
  const sorted = [...list<WeightEntry>('weights').items].sort((a, b) => a.date.localeCompare(b.date))
  const last = editing ?? sorted[sorted.length - 1]
  const [v, setV] = useState(last ? fmt(toDisplayWeight(last.kg, units), 1).replace(/,/g, '') : '')
  const today = useToday()
  const [date, setDate] = useState(editing?.date ?? today)
  const [err, setErr] = useState('')
  const save = () => {
    const kg = fromDisplayWeight(Number(v), units)
    if (!(kg > 20 && kg < 400)) return setErr(`That weight doesn't look right. Check the number in ${weightUnit(units)}.`)
    const cur = list<WeightEntry>('weights')
    const entry: WeightEntry = { id: editing?.id ?? newId(), date, kg }
    const items = editing ? cur.items.map((x) => (x.id === entry.id ? entry : x)) : [...cur.items, entry]
    setDoc('weights', { items, deleted: cur.deleted })
    if (!editing) track('weight_logged')
    closeSheet()
    toast(editing ? 'Weigh-in saved' : 'Weight added')
    checkMilestones(items)
  }
  return (
    <Sheet title={editing ? 'Edit weigh-in' : 'Add weight'}>
      <Field
        label="Weight"
        inputMode="decimal"
        value={v}
        onChange={(e) => {
          setErr('')
          setV(e.target.value.replace(/[^\d.]/g, ''))
        }}
        onFocus={(e) => e.target.select()}
        suffix={weightUnit(units)}
        autoFocus
      />
      <Field label="Date" type="date" value={date} max={today} onChange={(e) => setDate(e.target.value || today)} />
      {err && <Note tone="error">{err}</Note>}
      <Button className="sheet-cta" onClick={save} disabled={!v}>
        Save
      </Button>
    </Sheet>
  )
}

function checkMilestones(items: WeightEntry[]) {
  const p = getState().profile
  if (!p?.startWeightKg || !p.goalWeightKg || p.goal === 'maintain') return
  const latest = [...items].sort((a, b) => a.date.localeCompare(b.date)).at(-1)
  if (!latest) return
  const fresh = newMilestones(goalProgress(p.startWeightKg, latest.kg, p.goalWeightKg), p.milestonesHit ?? [])
  if (!fresh.length) return
  const top = fresh[fresh.length - 1]
  updateProfile({ milestonesHit: [...(p.milestonesHit ?? []), ...fresh] })
  track('milestone', { pct: top })
  setTimeout(() => showOverlay(<Milestone pct={top} />), 350)
}

const MESSAGES: Record<number, string> = {
  15: "You've reached 15% of your goal. Small steps, stacked up — that's how this works.",
  25: "You've reached 25% of your goal. Steady progress like this lasts.",
  50: "Halfway there. You've proven you can do this — keep the rhythm.",
  75: '75%! The finish line is in sight 🔥 Keep that streak burning.',
  100: 'You did it! 🎉 Goal reached. Every logged meal got you here.',
}

function Milestone({ pct }: { pct: number }) {
  const close = () => showOverlay(null)
  const p = getState().profile
  const switchToMaintain = () => {
    if (p) {
      const kg = p.goalWeightKg ?? p.startWeightKg ?? 70
      const draft = { ...p, goal: 'maintain' as const }
      const t = p.targets?.manual ? p.targets : suggestTargets(draft, kg) ?? p.targets
      updateProfile({ goal: 'maintain', targets: t })
      toast('Switched to Maintain')
    }
    close()
  }
  return (
    <div className={`milestone-wrap${pct === 100 ? ' milestone-wrap--big' : ''}`} role="dialog" aria-modal="true" aria-label={`${pct}% milestone`}>
      <Confetti pieces={pct === 100 ? 140 : pct >= 75 ? 90 : 50} />
      <div className="milestone card">
        <span className="milestone-pct">{pct}%</span>
        <p className="milestone-msg">{MESSAGES[pct]}</p>
        {pct === 100 && (
          <Button onClick={switchToMaintain} className="sheet-cta">
            Switch to Maintain
          </Button>
        )}
        <Button kind={pct === 100 ? 'secondary' : 'primary'} onClick={close}>
          Keep going
        </Button>
      </div>
    </div>
  )
}
