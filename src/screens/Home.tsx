// Home: streak, week strip, calorie + macro card, meals (spec §4.1).
import { useEffect, useRef, useState } from 'react'
import { BellRinging, ForkKnife } from '@phosphor-icons/react'
import { TabScreen } from '../components/Screen'
import { MiniCalorieBar, StatCard } from '../components/Meters'
import { Flame } from '../components/Flame'
import { Button, Card, EmptyState, Note } from '../components/ui'
import { dayStats, useToday } from '../lib/derived'
import { ensureDay, refresh, useDay, useDayIndex, useStore } from '../lib/store'
import { setPref, usePrefs } from '../lib/prefs'
import { pushScreen, setHomeDate, toast, useUi } from '../lib/ui'
import { MEAL_LABEL, MEALS, dayLabel, fmt, r0 } from '../lib/format'
import { streak } from '../../shared/calc'
import { addDays, weekday } from '../../shared/dates'
import { openLog } from './Log'
import { MealScreen } from './Meal'
import { enableNotifications, pushSupported } from '../lib/push'
import { errorMessage } from '../lib/api'

export function Home() {
  const today = useToday()
  const selected = useUi((s) => s.homeDate) ?? today
  const profile = useStore((s) => s.profile)
  const day = useDay(selected)
  const prefs = usePrefs()
  const dates = useDayIndex()
  const s = streak(dates, today)
  const stats = dayStats(profile, day)
  const [flare, setFlare] = useState(false)

  useEffect(() => {
    void ensureDay(selected)
  }, [selected])
  useEffect(() => {
    const on = () => {
      setFlare(true)
      setTimeout(() => setFlare(false), 1100)
    }
    window.addEventListener('crisp:flare', on)
    return () => window.removeEventListener('crisp:flare', on)
  }, [])

  const showLost = s.lost && prefs.lostCardFor !== today && (profile?.bestStreak ?? 0) > 0
  const showNotif = !profile?.notif?.enabled && !prefs.notifCardDismissed && dates.length >= 1 && pushSupported()
  const hasFood = day.foods.length > 0

  return (
    <TabScreen
      title={dayLabel(selected, today)}
      right={<Flame count={s.current} lit={s.loggedToday} flare={flare} />}
      sticky={<MiniCalorieBar eaten={stats.totals.cal} allowance={stats.allowance} />}
      onRefresh={refresh}
    >
      <WeekStrip selected={selected} today={today} logged={dates} />

      {showLost && (
        <Card className="info-card">
          <p>
            <strong>New streak starts today</strong> — your best is {profile?.bestStreak} day{profile?.bestStreak === 1 ? '' : 's'}.
          </p>
          <button className="link" onClick={() => setPref('lostCardFor', today)}>
            Got it
          </button>
        </Card>
      )}

      <StatCard
        totals={stats.totals}
        allowance={stats.allowance}
        goals={stats.targets}
        mode={prefs.statMode}
        display={prefs.macroDisplay}
        onToggle={() => setPref('statMode', prefs.statMode === 'eaten' ? 'left' : 'eaten')}
      />

      {showNotif && <NotifCard />}

      {!hasFood && selected === today ? (
        <EmptyState icon={ForkKnife} text="Fresh day. What's first?" action={<Button onClick={() => openLog(selected)}>+ Log food</Button>} />
      ) : null}

      <div className="group-body meals">
        {MEALS.map((m) => {
          const foods = day.foods.filter((f) => f.meal === m)
          const cal = foods.reduce((a, f) => a + f.cal, 0)
          return (
            <button key={m} className="row row--tap meal-row" onClick={() => pushScreen(<MealScreen date={selected} meal={m} />)}>
              <span className="row-main">
                <span className="row-label">{MEAL_LABEL[m]}</span>
                {foods.length > 0 && <span className="row-sub">{foods.map((f) => f.name.split(',')[0]).slice(0, 3).join(' · ')}</span>}
              </span>
              <span className="row-value">{foods.length ? `${fmt(r0(cal))} cal` : '—'}</span>
              <span className="row-chevron" aria-hidden>
                ›
              </span>
            </button>
          )
        })}
      </div>
      {selected !== today && (
        <Button kind="plain" onClick={() => setHomeDate(null)}>
          Back to today
        </Button>
      )}
    </TabScreen>
  )
}

function WeekStrip({ selected, today, logged }: { selected: string; today: string; logged: string[] }) {
  const [offset, setOffset] = useState(0)
  const start = useRef<number | null>(null)
  const set = new Set(logged)
  const endOfWeek = addDays(today, 6 - weekday(today) - offset * 7)
  const days = Array.from({ length: 7 }, (_, i) => addDays(endOfWeek, i - 6))
  const letters = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
  return (
    <div
      className="week"
      onPointerDown={(e) => (start.current = e.clientX)}
      onPointerUp={(e) => {
        if (start.current == null) return
        const d = e.clientX - start.current
        start.current = null
        if (d > 50) setOffset((o) => o + 1)
        if (d < -50 && offset > 0) setOffset((o) => o - 1)
      }}
      aria-label="Choose a day"
    >
      {days.map((d) => {
        const future = d > today
        const on = d === selected
        return (
          <button
            key={d}
            className={`week-day${on ? ' week-day--on' : ''}${d === today ? ' week-day--today' : ''}`}
            disabled={future}
            onClick={() => setHomeDate(d === today ? null : d)}
            aria-label={`${dayLabel(d, today)}${set.has(d) ? ', food logged' : ''}`}
            aria-pressed={on}
          >
            <span className="week-letter">{letters[weekday(d)]}</span>
            <span className="week-num">{Number(d.slice(8))}</span>
            <span className={`week-dot${set.has(d) ? ' week-dot--on' : ''}`} aria-hidden />
          </button>
        )
      })}
    </div>
  )
}

function NotifCard() {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  return (
    <Card className="info-card">
      <BellRinging size={26} weight="duotone" className="info-icon" aria-hidden />
      <p>Want a heads-up at 8 PM if you haven't logged yet?</p>
      {err && <Note tone="error">{err}</Note>}
      <div className="quick-row">
        <Button
          busy={busy}
          onClick={async () => {
            setBusy(true)
            setErr('')
            try {
              await enableNotifications(20)
              toast('Streak reminder is on')
            } catch (e) {
              setErr(errorMessage(e))
            } finally {
              setBusy(false)
            }
          }}
        >
          Turn on
        </Button>
        <Button kind="secondary" onClick={() => setPref('notifCardDismissed', true)}>
          No thanks
        </Button>
      </div>
    </Card>
  )
}
