// Settings (spec §4.8) and its sub-screens.
import { useEffect, useState } from 'react'
import {
  Bell,
  ChartLine,
  Crown,
  Heartbeat,
  Key,
  Lightning,
  Palette,
  Ruler,
  ScanSmiley,
  SignOut,
  Target,
  Trash,
  User,
} from '@phosphor-icons/react'
import { PushedScreen, TabScreen } from '../components/Screen'
import { Button, Field, Group, Note, Row, Segmented, Toggle } from '../components/ui'
import { getState, latestWeightKg, refresh, signOut, track, updateProfile, useStore } from '../lib/store'
import { setPref, usePrefs, type Theme } from '../lib/prefs'
import { confirm, pushScreen, toast } from '../lib/ui'
import { CM_PER_IN, healthyRangeKg, isBelowFloor, isBelowHealthy, maintenanceFor, suggestTargets } from '../../shared/calc'
import type { ActivityLevel, ActivityMode, Goal, Sex, Targets, Units } from '../../shared/types'
import { fmt, fromDisplayWeight, showHeight, showWeight, timeAgo, toDisplayWeight, weightUnit } from '../lib/format'
import { changePassword, deleteAccount, disablePasskey, passkeysSupported, registerPasskey } from '../lib/auth'
import { errorMessage } from '../lib/api'
import { disableNotifications, enableNotifications, pushSupported } from '../lib/push'
import { ACTIVITY_LABELS } from './Onboarding'
import { Admin } from './Admin'
import { SHORTCUT_URL } from '../config'
import { ChipRow } from '../components/Pickers'

export function Settings() {
  const p = useStore((s) => s.profile)!
  const isAdmin = useStore((s) => s.isAdmin)
  const prefs = usePrefs()
  const setAndTrack = <K extends 'theme' | 'macroDisplay' | 'graph'>(k: K, v: (typeof prefs)[K]) => {
    setPref(k, v)
    track('setting_changed', { name: k, value: v })
  }
  return (
    <TabScreen title="Settings">
      <Group title="Profile & goals">
        <Row icon={User} label="My Profile" value={p.firstName} onClick={() => pushScreen(<MyProfile />)} />
        <Row icon={Target} label="Goal & Targets" value={p.targets ? `${fmt(p.targets.calories)} cal` : undefined} onClick={() => pushScreen(<GoalTargets />)} />
        <Row icon={Lightning} label="Activity Mode" value={p.activityMode === 'track' ? 'Track' : ACTIVITY_LABELS[p.activityLevel].label} onClick={() => pushScreen(<ActivityModeScreen />)} />
      </Group>

      <Group title="Appearance">
        <div className="row row--stack">
          <span className="row-label">
            <Palette size={20} className="row-icon" aria-hidden /> Theme
          </span>
          <Segmented<Theme>
            label="Theme"
            value={prefs.theme}
            onChange={(v) => setAndTrack('theme', v)}
            options={[
              { value: 'dark', label: 'Dark' },
              { value: 'light', label: 'Light' },
              { value: 'system', label: 'System' },
            ]}
          />
        </div>
        <div className="row row--stack">
          <span className="row-label">Macro display</span>
          <Segmented
            label="Macro display"
            value={prefs.macroDisplay}
            onChange={(v) => setAndTrack('macroDisplay', v)}
            options={[
              { value: 'bars', label: 'Bars' },
              { value: 'rings', label: 'Rings' },
            ]}
          />
        </div>
        <div className="row row--stack">
          <span className="row-label">
            <ChartLine size={20} className="row-icon" aria-hidden /> Weight graph
          </span>
          <Segmented
            label="Weight graph"
            value={prefs.graph}
            onChange={(v) => setAndTrack('graph', v)}
            options={[
              { value: 'line', label: 'Line' },
              { value: 'bar', label: 'Bar' },
            ]}
          />
        </div>
        <div className="row row--stack">
          <span className="row-label">
            <Ruler size={20} className="row-icon" aria-hidden /> Units
          </span>
          <Segmented<Units>
            label="Units"
            value={p.units}
            onChange={(v) => {
              updateProfile({ units: v })
              track('setting_changed', { name: 'units', value: v })
            }}
            options={[
              { value: 'imperial', label: 'lb · ft' },
              { value: 'metric', label: 'kg · cm' },
            ]}
          />
        </div>
      </Group>

      <Group title="Notifications">
        <NotificationsRow />
      </Group>

      <Group title="Connections">
        <Row icon={Heartbeat} label="Connect Apple Fitness" value={p.fitnessLastSync ? `Synced ${timeAgo(p.fitnessLastSync)}` : undefined} onClick={() => pushScreen(<ConnectFitness />)} />
      </Group>

      <Group title="Security">
        <FaceIdRow />
        <Row icon={Key} label="Change password" onClick={() => pushScreen(<ChangePassword />)} />
      </Group>

      {isAdmin && (
        <Group title="Admin">
          <Row icon={Crown} label="Admin Dashboard" onClick={() => pushScreen(<Admin />)} />
        </Group>
      )}

      <Group>
        <Row
          icon={SignOut}
          label="Sign out"
          chevron={false}
          onClick={async () => {
            if (await confirm({ title: 'Sign out?', message: "You'll need your password or Face ID to sign back in.", confirm: 'Sign out', destructive: true })) await signOut()
          }}
        />
        <Row
          icon={Trash}
          danger
          label="Delete my account"
          chevron={false}
          onClick={async () => {
            const ok = await confirm({
              title: 'Delete your account?',
              message: 'This permanently deletes your account and everything you have logged. Type DELETE to confirm.',
              confirm: 'Delete',
              destructive: true,
              requireText: 'DELETE',
            })
            if (!ok) return
            try {
              await deleteAccount()
              await signOut()
            } catch (e) {
              toast(errorMessage(e), { tone: 'error' })
            }
          }}
        />
      </Group>
      <p className="muted small center pad">Crisp · food data from USDA FoodData Central (SR Legacy)</p>
    </TabScreen>
  )
}

function NotificationsRow() {
  const p = useStore((s) => s.profile)!
  const [busy, setBusy] = useState(false)
  const on = !!p.notif?.enabled
  const toggle = async (v: boolean) => {
    setBusy(true)
    try {
      if (v) {
        await enableNotifications(p.notif?.hour ?? 20)
        toast('Streak reminder is on')
      } else {
        await disableNotifications()
        updateProfile({ notif: { enabled: false, hour: p.notif?.hour ?? 20 } })
      }
    } catch (e) {
      toast(errorMessage(e), { tone: 'error' })
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <Row icon={Bell} label="Streak reminder" sub={pushSupported() ? "Only if you haven't logged that day" : 'Open Crisp from your Home Screen to use notifications'}>
        <Toggle checked={on} onChange={(v) => !busy && void toggle(v)} label="Streak reminder" />
      </Row>
      {on && (
        <Row label="Remind me at">
          <select
            className="input input--inline"
            value={p.notif.hour}
            onChange={(e) => updateProfile({ notif: { enabled: true, hour: Number(e.target.value) } })}
            aria-label="Reminder time"
          >
            {Array.from({ length: 15 }, (_, i) => i + 9).map((h) => (
              <option key={h} value={h}>
                {h > 12 ? `${h - 12} PM` : h === 12 ? '12 PM' : `${h} AM`}
              </option>
            ))}
          </select>
        </Row>
      )}
    </>
  )
}

function FaceIdRow() {
  const p = useStore((s) => s.profile)!
  const [busy, setBusy] = useState(false)
  if (!passkeysSupported()) return <Row icon={ScanSmiley} label="Face ID" value="Not available here" chevron={false} />
  const toggle = async (v: boolean) => {
    if (busy) return
    if (!v && !(await confirm({ title: 'Turn off Face ID?', message: "You'll sign in with your password instead.", confirm: 'Turn off', destructive: true }))) return
    setBusy(true)
    try {
      if (v) await registerPasskey()
      else await disablePasskey()
      toast(v ? 'Face ID is on' : 'Face ID is off')
    } catch (e) {
      toast(errorMessage(e), { tone: 'error' })
    } finally {
      setBusy(false)
    }
  }
  return (
    <Row icon={ScanSmiley} label="Face ID / Passkey" sub="Used when you sign in">
      <Toggle checked={!!p.passkeyEnabled} onChange={(v) => void toggle(v)} label="Face ID" />
    </Row>
  )
}

function MyProfile() {
  const p = useStore((s) => s.profile)!
  const [name, setName] = useState(p.firstName)
  const [sex, setSex] = useState<Sex>(p.sex ?? 'female')
  const [age, setAge] = useState(p.birthYear ? String(new Date().getFullYear() - p.birthYear) : '')
  const inches = p.heightCm ? Math.round(p.heightCm / CM_PER_IN) : 0
  const [ft, setFt] = useState(inches ? String(Math.floor(inches / 12)) : '')
  const [inch, setInch] = useState(inches ? String(inches % 12) : '')
  const [cm, setCm] = useState(p.heightCm ? String(Math.round(p.heightCm)) : '')
  const save = () => {
    const heightCm = p.units === 'metric' ? Number(cm) : (Number(ft) * 12 + Number(inch || 0)) * CM_PER_IN
    const patch = { firstName: name.trim() || p.firstName, sex, birthYear: new Date().getFullYear() - Number(age), heightCm }
    updateProfile(recalc({ ...p, ...patch }))
    toast('Profile saved')
  }
  return (
    <PushedScreen title="My Profile">
      <Field label="First name" value={name} onChange={(e) => setName(e.target.value)} />
      <Field label="Email" value={p.email} readOnly />
      <Segmented
        label="Sex"
        value={sex}
        onChange={setSex}
        options={[
          { value: 'female', label: 'Female' },
          { value: 'male', label: 'Male' },
        ]}
      />
      <Field label="Age" inputMode="numeric" value={age} onChange={(e) => setAge(e.target.value.replace(/\D/g, ''))} suffix="years" />
      {p.units === 'imperial' ? (
        <div className="field-row">
          <Field label="Height" inputMode="numeric" value={ft} onChange={(e) => setFt(e.target.value.replace(/\D/g, ''))} suffix="ft" />
          <Field label="&nbsp;" aria-label="Inches" inputMode="numeric" value={inch} onChange={(e) => setInch(e.target.value.replace(/\D/g, ''))} suffix="in" />
        </div>
      ) : (
        <Field label="Height" inputMode="numeric" value={cm} onChange={(e) => setCm(e.target.value.replace(/\D/g, ''))} suffix="cm" />
      )}
      <p className="muted small">Best streak: {p.bestStreak ?? 0} days</p>
      <Button className="sheet-cta" onClick={save}>
        Save
      </Button>
    </PushedScreen>
  )
}

/** If targets were suggested (not typed by hand), refresh them after profile/goal changes. */
function recalc<T extends ReturnType<typeof getState>['profile'] & object>(p: T): T {
  if (p.targets?.manual) return p
  const t = suggestTargets(p, latestWeightKg() ?? p.startWeightKg ?? 70)
  return t ? { ...p, targets: t } : p
}

function GoalTargets() {
  const p = useStore((s) => s.profile)!
  const units = p.units
  const [goal, setGoal] = useState<Goal>(p.goal ?? 'maintain')
  const [gw, setGw] = useState(p.goalWeightKg ? fmt(toDisplayWeight(p.goalWeightKg, units), 0).replace(/,/g, '') : '')
  const kg = latestWeightKg() ?? p.startWeightKg ?? 70
  const goalKg = goal === 'maintain' ? kg : fromDisplayWeight(Number(gw), units)
  const draft = { ...p, goal, goalWeightKg: goalKg }
  const suggested = suggestTargets(draft, kg)
  const [manual, setManual] = useState(!!p.targets?.manual)
  const [t, setT] = useState<Targets>(p.targets ?? suggested ?? { calories: 2000, protein: 120, carbs: 200, fat: 65, manual: false })
  const maint = maintenanceFor(draft, kg)
  const num = (k: keyof Targets) => (e: React.ChangeEvent<HTMLInputElement>) => setT({ ...t, [k]: Number(e.target.value.replace(/\D/g, '')) })
  const goalChanged = goal !== p.goal || Math.abs(goalKg - (p.goalWeightKg ?? 0)) > 0.05
  const save = () => {
    const targets = manual ? { ...t, manual: true } : suggested!
    updateProfile({
      goal,
      goalWeightKg: goalKg,
      targets,
      // a new goal restarts the milestone journey from today's weight
      ...(goalChanged ? { startWeightKg: kg, milestonesHit: [] } : {}),
    })
    toast('Targets saved')
  }
  const range = p.heightCm ? healthyRangeKg(p.heightCm) : null
  return (
    <PushedScreen title="Goal & Targets">
      <Segmented
        label="Goal"
        value={goal}
        onChange={setGoal}
        options={[
          { value: 'lose', label: 'Lose' },
          { value: 'maintain', label: 'Maintain' },
          { value: 'gain', label: 'Gain' },
        ]}
      />
      {goal !== 'maintain' && (
        <>
          <Field label="Goal weight" inputMode="decimal" value={gw} onChange={(e) => setGw(e.target.value.replace(/[^\d.]/g, ''))} suffix={weightUnit(units)} />
          {range && (
            <p className="muted small">
              Healthy range for your height: {fmt(toDisplayWeight(range.min, units))}–{fmt(toDisplayWeight(range.max, units))} {weightUnit(units)}
            </p>
          )}
          {p.heightCm && gw && isBelowHealthy(goalKg, p.heightCm) && <Note tone="warn">That's below the usual healthy range for your height. You can keep it.</Note>}
        </>
      )}
      {maint && <p className="muted small">Estimated maintenance: {fmt(Math.round(maint))} cal{p.activityMode === 'track' ? ' + your logged activity' : ''}</p>}

      <Group title="Daily targets">
        <Row label="Use suggested targets">
          <Toggle checked={!manual} onChange={(v) => setManual(!v)} label="Use suggested targets" />
        </Row>
      </Group>
      {!manual && suggested ? (
        <div className="card plan-card">
          <div className="plan-cal">
            <span className="big-number">{fmt(suggested.calories)}</span>
            <span className="muted">calories</span>
          </div>
          <div className="plan-macros">
            <span>
              <b style={{ color: 'var(--protein)' }}>P</b> {suggested.protein} g
            </span>
            <span>
              <b style={{ color: 'var(--carbs)' }}>C</b> {suggested.carbs} g
            </span>
            <span>
              <b style={{ color: 'var(--fat)' }}>F</b> {suggested.fat} g
            </span>
          </div>
        </div>
      ) : (
        <>
          <Field label="Calories" inputMode="numeric" value={String(t.calories)} onChange={num('calories')} />
          <div className="field-row field-row--3">
            <Field label="Protein" inputMode="numeric" value={String(t.protein)} onChange={num('protein')} suffix="g" />
            <Field label="Carbs" inputMode="numeric" value={String(t.carbs)} onChange={num('carbs')} suffix="g" />
            <Field label="Fat" inputMode="numeric" value={String(t.fat)} onChange={num('fat')} suffix="g" />
          </div>
          {isBelowFloor(t.calories, p.sex) && <Note tone="warn">That's below the usual minimum ({p.sex === 'male' ? '1,500' : '1,200'}). Saved as you entered it.</Note>}
        </>
      )}
      <Button className="sheet-cta" onClick={save} disabled={goal !== 'maintain' && !(goalKg > 20)}>
        Save
      </Button>
    </PushedScreen>
  )
}

function ActivityModeScreen() {
  const p = useStore((s) => s.profile)!
  const choose = async (mode: ActivityMode, level: ActivityLevel) => {
    if (mode === p.activityMode && level === p.activityLevel) return
    const ok = await confirm({
      title: 'Change activity mode?',
      message: p.targets?.manual ? 'Your hand-entered targets stay the same.' : 'This recalculates your suggested targets.',
      confirm: 'Change',
    })
    if (!ok) return
    updateProfile(recalc({ ...p, activityMode: mode, activityLevel: level }))
    track('setting_changed', { name: 'activityMode', value: mode })
    toast('Activity mode updated')
  }
  return (
    <PushedScreen title="Activity Mode">
      <p className="lead">Pick one way to count your activity.</p>
      <div className="choice-list">
        <button className={`choice pressable${p.activityMode === 'track' ? ' choice--on' : ''}`} onClick={() => void choose('track', p.activityLevel)} aria-pressed={p.activityMode === 'track'}>
          <strong>Track my activity</strong>
          <span className="choice-sub">Steps add 100% of their calories; workouts add 50%.</span>
        </button>
      </div>
      <h3 className="list-title">Or set my activity level</h3>
      <div className="choice-list">
        {(Object.keys(ACTIVITY_LABELS) as ActivityLevel[]).map((l) => {
          const on = p.activityMode === 'level' && p.activityLevel === l
          return (
            <button key={l} className={`choice pressable${on ? ' choice--on' : ''}`} onClick={() => void choose('level', l)} aria-pressed={on}>
              <strong>{ACTIVITY_LABELS[l].label}</strong>
              <span className="choice-sub">{ACTIVITY_LABELS[l].sub}</span>
            </button>
          )
        })}
      </div>
    </PushedScreen>
  )
}

const SHORTCUT_NAME = 'Crisp Sync'
const SYNC_TIMES = ['20:00', '21:00', '22:00', '23:00']
const timeLabel = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
}

/**
 * Apple Fitness setup: everything is chosen here in Crisp, then one tap connects.
 * "Connect" runs the Shortcut with this person's sync code as its input (Apple's shortcuts:// link),
 * so nobody copies or pastes a code. The only step Apple keeps in the Shortcuts app is the nightly automation.
 */
export function ConnectFitness() {
  const p = useStore((s) => s.profile)!
  const prefs = usePrefs()
  const code = p.fitnessCode ?? ''
  const custom = !SYNC_TIMES.includes(prefs.syncTime)
  const synced = !!p.fitnessLastSync
  const connected = prefs.shortcutConnected || synced
  const time = timeLabel(prefs.syncTime)
  // Coming back from the Shortcuts app: fetch the new sync right away.
  useEffect(() => {
    const on = () => document.visibilityState === 'visible' && void refresh()
    document.addEventListener('visibilitychange', on)
    return () => document.removeEventListener('visibilitychange', on)
  }, [])

  const connect = async () => {
    try {
      await navigator.clipboard.writeText(code) // backup, in case the Shortcut asks
    } catch {
      /* not needed */
    }
    setPref('shortcutConnected', true)
    track('fitness_connect_tapped')
    window.location.href = `shortcuts://run-shortcut?name=${encodeURIComponent(SHORTCUT_NAME)}&input=text&text=${encodeURIComponent(code)}`
  }

  return (
    <PushedScreen title="Apple Fitness">
      <p className="lead">Crisp can't read Apple Health directly, so a free Apple Shortcut sends your steps and workouts each night. Set it up here — it takes a minute.</p>
      {synced && <Note>✓ Connected · last synced {timeAgo(p.fitnessLastSync!)}</Note>}
      <ol className="guide">
        <li className={prefs.syncTime ? 'guide-done' : ''}>
          <strong>When should Crisp sync?</strong>
          <span className="muted small">Pick a time after your last workout of the day.</span>
          <ChipRow
            label="Sync time"
            value={custom ? 'custom' : prefs.syncTime}
            onChange={(v) => setPref('syncTime', v === 'custom' ? '21:30' : v)}
            options={[...SYNC_TIMES.map((t) => ({ value: t, label: timeLabel(t) })), { value: 'custom', label: 'Other' }]}
          />
          {custom && (
            <input
              className="input time-input"
              type="time"
              value={prefs.syncTime}
              onChange={(e) => e.target.value && setPref('syncTime', e.target.value)}
              aria-label="Custom sync time"
            />
          )}
        </li>
        <li className={prefs.shortcutAdded ? 'guide-done' : ''}>
          <strong>Add the Crisp Shortcut</strong>
          {SHORTCUT_URL ? (
            <>
              <Button
                kind={prefs.shortcutAdded ? 'secondary' : 'primary'}
                onClick={() => {
                  setPref('shortcutAdded', true)
                  window.location.href = SHORTCUT_URL
                }}
              >
                {prefs.shortcutAdded ? 'Add it again' : 'Add Shortcut'}
              </Button>
              <span className="muted small">Tap “Add Shortcut” in the Shortcuts app, then come back here.</span>
            </>
          ) : (
            <Note tone="warn">The Shortcut link isn't set up yet — Kay is adding it soon.</Note>
          )}
        </li>
        <li className={connected ? 'guide-done' : ''}>
          <strong>Connect</strong>
          <Button kind={connected ? 'secondary' : 'primary'} onClick={() => void connect()} disabled={!code || !SHORTCUT_URL}>
            {connected ? 'Sync now' : 'Connect & sync'}
          </Button>
          <span className="muted small">Sends your code to the Shortcut and syncs today. Tap “Allow” for Health the first time, then come back and pull down to refresh.</span>
        </li>
        <li>
          <strong>Make it automatic at {time}</strong>
          <span className="muted small">
            Apple only lets you do this part in the Shortcuts app: <b>Automation</b> → <b>+</b> → <b>Time of Day</b> → <b>{time}</b>, <b>Daily</b> → <b>Run Immediately</b> → choose <b>{SHORTCUT_NAME}</b> → Done.
          </span>
          <Button kind="secondary" onClick={() => (window.location.href = 'shortcuts://')}>
            Open Shortcuts
          </Button>
        </li>
      </ol>
      <Group title="If something's off" footer="Your sync code is private — it only lets the Shortcut send your steps and workouts.">
        <Row label="Sync code" sub={code || 'Sign in again to get a code'} onClick={() => void copyText(code, 'Sync code')} />
        {getState().isAdmin && <Row label="Sync address" sub={`${location.origin}/api/fitness`} onClick={() => void copyText(`${location.origin}/api/fitness`, 'Address')} />}
      </Group>
    </PushedScreen>
  )
}

async function copyText(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast(`${what} copied`)
  } catch {
    toast('Press and hold the text to copy it', { tone: 'error' })
  }
}

function ChangePassword() {
  const [cur, setCur] = useState('')
  const [next, setNext] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const save = async () => {
    setBusy(true)
    setErr('')
    try {
      await changePassword(cur, next)
      toast('Password changed')
      setCur('')
      setNext('')
    } catch (e) {
      setErr(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <PushedScreen title="Change password">
      <Field label="Current password" type="password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} />
      <Field label="New password" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} hint="At least 8 characters" />
      {err && <Note tone="error">{err}</Note>}
      <Button className="sheet-cta" onClick={save} busy={busy} disabled={!cur || next.length < 8}>
        Save
      </Button>
    </PushedScreen>
  )
}

export { showHeight, showWeight }
