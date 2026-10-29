// Admin dashboard — collapsible sections, view-only except the invite code (spec §4.9).
import { useEffect, useState, type ReactNode } from 'react'
import { CaretDown } from '@phosphor-icons/react'
import { PushedScreen } from '../components/Screen'
import { Button, Card, Field, Note, Shimmer } from '../components/ui'
import { api, errorMessage } from '../lib/api'
import { confirm, toast } from '../lib/ui'
import { fmt, r0, showWeight, timeAgo } from '../lib/format'
import { dayTotals } from '../../shared/calc'
import type { DayDoc, ListDoc, Profile, WeightEntry } from '../../shared/types'

interface Ev {
  uid: string
  type: string
  details?: Record<string, unknown>
  time: string
  name?: string
}
interface Person {
  id: string
  firstName: string
  email: string
  createdAt: string
  lastOpened: string | null
  daysActive30: number
  streak: number
  bestStreak: number
  foodsLogged30: number
  fitnessConnected: boolean
  faceId: boolean
}
interface Dash {
  overview: { totalUsers: number; activeToday: number; activeWeek: number; activeMonth: number; newSignups30: number; dailyActive: { date: string; users: number }[] }
  features: Record<string, number | Record<string, number>>
  recent: Ev[]
  people: Person[]
  inviteCode: string
  purgePrompt: boolean
}

const EVENT_TEXT: Record<string, (d: Record<string, unknown>) => string> = {
  app_open: () => 'opened Crisp',
  food_logged: (d) => `logged ${d.meal ?? 'food'}${d.method ? ` (${d.method})` : ''}`,
  entry_edited: () => 'edited a food',
  entry_deleted: () => 'deleted a food',
  weight_logged: () => 'logged weight',
  steps_logged: () => 'logged steps',
  workout_logged: (d) => `logged a ${String(d.type ?? 'workout').toLowerCase()}`,
  streak_extended: (d) => `extended their streak to ${d.streak}`,
  milestone: (d) => `hit a ${d.pct}% milestone 🎉`,
  setting_changed: (d) => `changed ${d.name}${d.value ? ` → ${d.value}` : ''}`,
  signed_up: () => 'signed up',
  signed_in: (d) => `signed in${d.method === 'passkey' ? ' with Face ID' : ''}`,
  faceid_on: () => 'turned on Face ID',
  faceid_off: () => 'turned off Face ID',
  custom_food_created: (d) => `created a food${d.name ? `: ${d.name}` : ''}`,
  fitness_connected: () => 'connected Apple Fitness',
  fitness_synced: (d) => `synced Apple Fitness (${fmt(Number(d.steps ?? 0))} steps)`,
  notifications_on: () => 'turned on reminders',
  notifications_off: () => 'turned off reminders',
  account_deleted: () => 'deleted their account',
}
const describe = (e: Ev) => (EVENT_TEXT[e.type] ?? (() => e.type))(e.details ?? {})

function Section({ title, children, open: initial = false }: { title: string; children: ReactNode; open?: boolean }) {
  const [open, setOpen] = useState(initial)
  return (
    <section className="collapse">
      <button className="collapse-head pressable" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span>{title}</span>
        <CaretDown size={18} className={`collapse-caret${open ? ' collapse-caret--open' : ''}`} aria-hidden />
      </button>
      {open && <div className="collapse-body">{children}</div>}
    </section>
  )
}

export function Admin() {
  const [d, setD] = useState<Dash | null>(null)
  const [err, setErr] = useState('')
  const load = async () => {
    try {
      setD(await api<Dash>('/api/admin/dashboard'))
      setErr('')
    } catch (e) {
      setErr(errorMessage(e))
    }
  }
  useEffect(() => {
    void load()
  }, [])
  useEffect(() => {
    if (!d?.purgePrompt) return
    void (async () => {
      const del = await confirm({
        title: 'Old activity history',
        message: 'You have activity history older than 12 months. Delete it?',
        confirm: 'Delete',
        cancel: 'Keep for now',
        destructive: true,
      })
      try {
        const r = await api<{ deleted: number }>('/api/admin/purge', { body: { action: del ? 'delete' : 'later' } })
        if (del) toast(`Deleted ${r.deleted} old events`)
      } catch (e) {
        toast(errorMessage(e), { tone: 'error' })
      }
    })()
  }, [d?.purgePrompt])

  if (err) return (
    <PushedScreen title="Admin">
      <Note tone="error">{err}</Note>
      <Button onClick={() => void load()}>Retry</Button>
    </PushedScreen>
  )
  if (!d)
    return (
      <PushedScreen title="Admin">
        <div className="stack">
          <Shimmer h={90} />
          <Shimmer />
          <Shimmer />
          <Shimmer />
        </div>
      </PushedScreen>
    )

  const o = d.overview
  const maxDau = Math.max(1, ...o.dailyActive.map((x) => x.users))
  const f = d.features as Record<string, number> & { logMethods: Record<string, number> }
  return (
    <PushedScreen title="Admin">
      <Section title="Overview" open>
        <div className="stat-grid">
          <Stat n={o.totalUsers} label="users" />
          <Stat n={o.activeToday} label="active today" />
          <Stat n={o.activeWeek} label="this week" />
          <Stat n={o.activeMonth} label="this month" />
          <Stat n={o.newSignups30} label="new (30 days)" />
        </div>
        <div className="dau" role="img" aria-label="Daily active users, last 30 days">
          {o.dailyActive.map((x) => (
            <span key={x.date} className="dau-bar" style={{ height: `${(x.users / maxDau) * 100}%` }} title={`${x.date}: ${x.users}`} />
          ))}
        </div>
        <p className="muted small">Daily active people, last 30 days</p>
      </Section>

      <Section title="Feature usage">
        <ul className="kv">
          <li>
            <span>Logged by search</span>
            <b>{f.logMethods.search}</b>
          </li>
          <li>
            <span>Re-logged from Recent</span>
            <b>{f.logMethods.recent}</b>
          </li>
          <li>
            <span>From Favorites</span>
            <b>{f.logMethods.favorite}</b>
          </li>
          <li>
            <span>Quick add</span>
            <b>{f.logMethods.quick}</b>
          </li>
          <li>
            <span>Custom foods logged</span>
            <b>{f.logMethods.custom}</b>
          </li>
          <li>
            <span>Custom foods created</span>
            <b>{f.customFoods30}</b>
          </li>
          <li>
            <span>Weigh-ins</span>
            <b>{f.weightsLogged30}</b>
          </li>
          <li>
            <span>Apple Fitness connected</span>
            <b>{f.fitnessConnected}</b>
          </li>
          <li>
            <span>Face ID on</span>
            <b>{f.faceIdOn}</b>
          </li>
          <li>
            <span>Reminders on</span>
            <b>{f.notificationsOn}</b>
          </li>
          <li>
            <span>Bars · Rings</span>
            <b>
              {f.bars} · {f.rings}
            </b>
          </li>
          <li>
            <span>Dark · Light</span>
            <b>
              {f.dark} · {f.light}
            </b>
          </li>
          <li>
            <span>Track activity · Set level</span>
            <b>
              {f.activityTrack} · {f.activityLevel}
            </b>
          </li>
        </ul>
        <p className="muted small">Counts are for the last 30 days.</p>
      </Section>

      <Section title="Recent activity">
        <ul className="feed">
          {d.recent.map((e, i) => (
            <li key={i}>
              <b>{e.name}</b> {describe(e)} <span className="muted">· {timeAgo(e.time)}</span>
            </li>
          ))}
          {!d.recent.length && <li className="muted">No activity yet.</li>}
        </ul>
      </Section>

      <Section title={`People (${d.people.length})`}>
        {d.people
          .sort((a, b) => (b.lastOpened ?? '').localeCompare(a.lastOpened ?? ''))
          .map((p) => (
            <PersonCard key={p.id} p={p} recent={d.recent.filter((e) => e.uid === p.id)} />
          ))}
      </Section>

      <InviteCode initial={d.inviteCode} />
    </PushedScreen>
  )
}

const Stat = ({ n, label }: { n: number; label: string }) => (
  <div className="stat">
    <span className="stat-n">{n}</span>
    <span className="stat-l">{label}</span>
  </div>
)

function PersonCard({ p, recent }: { p: Person; recent: Ev[] }) {
  const [full, setFull] = useState<{ profile: Profile; weights: ListDoc<WeightEntry> | null; days: DayDoc[]; events: Ev[] } | null>(null)
  const [loading, setLoading] = useState(false)
  const loadFull = async () => {
    setLoading(true)
    try {
      setFull(await api(`/api/admin/person?uid=${encodeURIComponent(p.id)}`))
    } catch (e) {
      toast(errorMessage(e), { tone: 'error' })
    } finally {
      setLoading(false)
    }
  }
  return (
    <Section title={`${p.firstName} · ${p.lastOpened ? timeAgo(p.lastOpened) : 'never opened'} · 🔥 ${p.streak}`}>
      <ul className="kv">
        <li>
          <span>Email</span>
          <b>{p.email}</b>
        </li>
        <li>
          <span>Joined</span>
          <b>{new Date(p.createdAt).toLocaleDateString()}</b>
        </li>
        <li>
          <span>Days active (30)</span>
          <b>{p.daysActive30}</b>
        </li>
        <li>
          <span>Foods logged (30)</span>
          <b>{p.foodsLogged30}</b>
        </li>
        <li>
          <span>Streak · best</span>
          <b>
            {p.streak} · {p.bestStreak}
          </b>
        </li>
        <li>
          <span>Apple Fitness · Face ID</span>
          <b>
            {p.fitnessConnected ? 'Yes' : 'No'} · {p.faceId ? 'Yes' : 'No'}
          </b>
        </li>
      </ul>
      {recent.length > 0 && (
        <ul className="feed">
          {recent.slice(0, 8).map((e, i) => (
            <li key={i}>
              {describe(e)} <span className="muted">· {timeAgo(e.time)}</span>
            </li>
          ))}
        </ul>
      )}
      {!full ? (
        <Button kind="secondary" busy={loading} onClick={() => void loadFull()}>
          Show full data
        </Button>
      ) : (
        <PersonData data={full} />
      )}
    </Section>
  )
}

function PersonData({ data }: { data: { profile: Profile; weights: ListDoc<WeightEntry> | null; days: DayDoc[] } }) {
  const p = data.profile
  const w = [...(data.weights?.items ?? [])].sort((a, b) => b.date.localeCompare(a.date))
  return (
    <Card className="person-data">
      <ul className="kv">
        <li>
          <span>Goal</span>
          <b>
            {p.goal ?? '—'}
            {p.goalWeightKg ? ` · ${showWeight(p.goalWeightKg, p.units, 0)}` : ''}
          </b>
        </li>
        <li>
          <span>Targets</span>
          <b>{p.targets ? `${fmt(p.targets.calories)} cal · P${p.targets.protein} C${p.targets.carbs} F${p.targets.fat}` : '—'}</b>
        </li>
        <li>
          <span>Activity</span>
          <b>{p.activityMode === 'track' ? 'Track' : p.activityLevel}</b>
        </li>
      </ul>
      <h4 className="list-title">Weigh-ins</h4>
      <ul className="feed">
        {w.slice(0, 10).map((x) => (
          <li key={x.id}>
            {x.date}: {showWeight(x.kg, p.units)}
          </li>
        ))}
        {!w.length && <li className="muted">None</li>}
      </ul>
      <h4 className="list-title">Last 14 days</h4>
      <ul className="feed">
        {data.days
          .sort((a, b) => b.date.localeCompare(a.date))
          .map((d) => {
            const t = dayTotals(d)
            return (
              <li key={d.date}>
                <b>{d.date}</b>: {fmt(r0(t.cal))} cal · P{r0(t.p)} C{r0(t.c)} F{r0(t.f)} · {d.foods.length} foods{d.steps ? ` · ${fmt(d.steps.count)} steps` : ''}
                <div className="muted small">{d.foods.map((f) => f.name.split(',')[0]).join(', ')}</div>
              </li>
            )
          })}
        {!data.days.length && <li className="muted">Nothing logged</li>}
      </ul>
    </Card>
  )
}

function InviteCode({ initial }: { initial: string }) {
  const [code, setCode] = useState(initial)
  const [busy, setBusy] = useState(false)
  const save = async () => {
    setBusy(true)
    try {
      const r = await api<{ inviteCode: string }>('/api/admin/invite', { body: { code } })
      setCode(r.inviteCode)
      toast('Invite code updated')
    } catch (e) {
      toast(errorMessage(e), { tone: 'error' })
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="group">
      <h2 className="group-title">Invite code</h2>
      <Field label="Code friends type when they sign up" value={code} onChange={(e) => setCode(e.target.value)} autoCapitalize="characters" />
      <Button onClick={() => void save()} busy={busy} disabled={code.trim() === initial || code.trim().length < 4}>
        Save code
      </Button>
    </section>
  )
}
