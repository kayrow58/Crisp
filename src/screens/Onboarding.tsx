// First-launch setup: Face ID → Units → About you → Goal → Goal weight → Activity → Your plan (spec §3.2).
import { useMemo, useState } from 'react'
import { ScanSmiley } from '@phosphor-icons/react'
import { Button, Field, Note, Segmented } from '../components/ui'
import { CM_PER_IN, healthyRangeKg, isBelowFloor, isBelowHealthy, suggestTargets } from '../../shared/calc'
import type { ActivityLevel, ActivityMode, Goal, Profile, Sex, Targets, Units } from '../../shared/types'
import { fromDisplayWeight, newId, showWeight, toDisplayWeight, weightUnit } from '../lib/format'
import { passkeysSupported, registerPasskey } from '../lib/auth'
import { errorMessage } from '../lib/api'
import { setDoc, today, track, updateProfile, useStore } from '../lib/store'

type Step = 'faceid' | 'units' | 'about' | 'goal' | 'goalWeight' | 'activity' | 'plan'

export const ACTIVITY_LABELS: Record<ActivityLevel, { label: string; sub: string }> = {
  sedentary: { label: 'Sedentary', sub: 'Desk job, little exercise' },
  light: { label: 'Lightly active', sub: 'Light exercise 1–3 days a week' },
  active: { label: 'Active', sub: 'Exercise 3–5 days a week' },
  very: { label: 'Very active', sub: 'Hard exercise 6–7 days a week' },
}

export function Onboarding() {
  const profile = useStore((s) => s.profile)!
  const steps: Step[] = useMemo(() => [...(passkeysSupported() && !profile.passkeyEnabled ? (['faceid'] as Step[]) : []), 'units', 'about', 'goal', 'goalWeight', 'activity', 'plan'], [profile.passkeyEnabled])
  const [i, setI] = useState(0)
  const step = steps[i]
  const next = () => setI((n) => Math.min(steps.length - 1, n + 1))

  const [units, setUnits] = useState<Units>(profile.units ?? 'imperial')
  const [sex, setSex] = useState<Sex>(profile.sex ?? 'female')
  const [age, setAge] = useState(profile.birthYear ? String(new Date().getFullYear() - profile.birthYear) : '')
  const [ft, setFt] = useState('')
  const [inch, setInch] = useState('')
  const [cm, setCm] = useState('')
  const [weight, setWeight] = useState('')
  const [goal, setGoal] = useState<Goal>('lose')
  const [goalWeight, setGoalWeight] = useState('')
  const [mode, setMode] = useState<ActivityMode>('level')
  const [level, setLevel] = useState<ActivityLevel>('sedentary')
  const back = () => setI((n) => (steps[n] === 'activity' && goal === 'maintain' ? steps.indexOf('goal') : Math.max(0, n - 1)))

  const heightCm = units === 'metric' ? Number(cm) : (Number(ft) * 12 + Number(inch || 0)) * CM_PER_IN
  const weightKg = fromDisplayWeight(Number(weight), units)
  const goalKg = goal === 'maintain' ? weightKg : fromDisplayWeight(Number(goalWeight), units)

  const draft: Profile = {
    ...profile,
    units,
    sex,
    birthYear: new Date().getFullYear() - Number(age),
    heightCm,
    startWeightKg: weightKg,
    goal,
    goalWeightKg: goalKg,
    activityMode: mode,
    activityLevel: level,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  }

  const aboutOk = Number(age) >= 13 && Number(age) <= 100 && heightCm > 100 && heightCm < 250 && weightKg > 25 && weightKg < 350
  const goalOk = goal === 'maintain' || (goalKg > 25 && goalKg < 350)

  return (
    <main className="onboard">
      <div className="onboard-top">
        {i > 0 ? (
          <button className="link" onClick={back}>
            ‹ Back
          </button>
        ) : (
          <span />
        )}
        <div className="progress" role="progressbar" aria-valuemin={1} aria-valuemax={steps.length} aria-valuenow={i + 1} aria-label={`Step ${i + 1} of ${steps.length}`}>
          <div className="progress-fill" style={{ width: `${((i + 1) / steps.length) * 100}%` }} />
        </div>
      </div>

      <div className="onboard-body" key={step}>
        {step === 'faceid' && <FaceIdStep onDone={next} />}

        {step === 'units' && (
          <>
            <h1 className="large-title">Units</h1>
            <p className="lead">How do you like to see weight and height?</p>
            <Segmented
              label="Units"
              value={units}
              onChange={setUnits}
              options={[
                { value: 'imperial', label: 'lb · ft/in' },
                { value: 'metric', label: 'kg · cm' },
              ]}
            />
            <Button className="onboard-next" onClick={next}>
              Continue
            </Button>
          </>
        )}

        {step === 'about' && (
          <>
            <h1 className="large-title">About you</h1>
            <p className="lead">Used to estimate your maintenance calories.</p>
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
            {units === 'imperial' ? (
              <div className="field-row">
                <Field label="Height" inputMode="numeric" value={ft} onChange={(e) => setFt(e.target.value.replace(/\D/g, ''))} suffix="ft" />
                <Field label="&nbsp;" aria-label="Inches" inputMode="numeric" value={inch} onChange={(e) => setInch(e.target.value.replace(/\D/g, ''))} suffix="in" />
              </div>
            ) : (
              <Field label="Height" inputMode="numeric" value={cm} onChange={(e) => setCm(e.target.value.replace(/\D/g, ''))} suffix="cm" />
            )}
            <Field label="Current weight" inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value.replace(/[^\d.]/g, ''))} suffix={weightUnit(units)} />
            <Button className="onboard-next" onClick={next} disabled={!aboutOk}>
              Continue
            </Button>
          </>
        )}

        {step === 'goal' && (
          <>
            <h1 className="large-title">Your goal</h1>
            <div className="choice-list">
              {(
                [
                  ['lose', 'Lose weight'],
                  ['maintain', 'Maintain'],
                  ['gain', 'Gain weight'],
                ] as [Goal, string][]
              ).map(([g, label]) => (
                <button key={g} className={`choice pressable${goal === g ? ' choice--on' : ''}`} onClick={() => setGoal(g)} aria-pressed={goal === g}>
                  {label}
                </button>
              ))}
            </div>
            <Button className="onboard-next" onClick={goal === 'maintain' ? () => setI(steps.indexOf('activity')) : next}>
              Continue
            </Button>
          </>
        )}

        {step === 'goalWeight' && <GoalWeightStep heightCm={heightCm} units={units} value={goalWeight} onChange={setGoalWeight} goalKg={goalKg} onNext={next} ok={goalOk} />}

        {step === 'activity' && (
          <>
            <h1 className="large-title">Activity</h1>
            <p className="lead">You can change this any time in Settings.</p>
            <div className="choice-list">
              <button className={`choice pressable${mode === 'level' ? ' choice--on' : ''}`} onClick={() => setMode('level')} aria-pressed={mode === 'level'}>
                <strong>Set my activity level</strong>
                <span className="choice-sub">Pick one level. Your calorie target stays the same every day — nothing to log.</span>
              </button>
              <button className={`choice pressable${mode === 'track' ? ' choice--on' : ''}`} onClick={() => setMode('track')} aria-pressed={mode === 'track'}>
                <strong>Track my activity</strong>
                <span className="choice-sub">Log steps and workouts (or sync Apple Fitness). Your allowance grows with what you do.</span>
              </button>
            </div>
            {mode === 'level' && (
              <div className="choice-list choice-list--compact">
                {(Object.keys(ACTIVITY_LABELS) as ActivityLevel[]).map((l) => (
                  <button key={l} className={`choice pressable${level === l ? ' choice--on' : ''}`} onClick={() => setLevel(l)} aria-pressed={level === l}>
                    <strong>{ACTIVITY_LABELS[l].label}</strong>
                    <span className="choice-sub">{ACTIVITY_LABELS[l].sub}</span>
                  </button>
                ))}
              </div>
            )}
            <Button className="onboard-next" onClick={next}>
              Continue
            </Button>
          </>
        )}

        {step === 'plan' && <PlanStep draft={draft} weightKg={weightKg} />}
      </div>
    </main>
  )
}

function FaceIdStep({ onDone }: { onDone: () => void }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  return (
    <>
      <ScanSmiley size={72} weight="duotone" className="empty-icon onboard-hero" aria-hidden />
      <h1 className="large-title">Unlock with Face ID?</h1>
      <p className="lead">Sign in with a glance instead of typing your password, so your data stays private. Your face never leaves your iPhone.</p>
      {err && <Note tone="error">{err}</Note>}
      <Button
        busy={busy}
        onClick={async () => {
          setBusy(true)
          setErr('')
          try {
            await registerPasskey()
            onDone()
          } catch (e) {
            setErr(errorMessage(e))
          } finally {
            setBusy(false)
          }
        }}
      >
        Turn on Face ID
      </Button>
      <Button kind="plain" onClick={onDone}>
        Skip for now
      </Button>
    </>
  )
}

function GoalWeightStep({
  heightCm,
  units,
  value,
  onChange,
  goalKg,
  onNext,
  ok,
}: {
  heightCm: number
  units: Units
  value: string
  onChange: (v: string) => void
  goalKg: number
  onNext: () => void
  ok: boolean
}) {
  const range = healthyRangeKg(heightCm)
  const low = value && isBelowHealthy(goalKg, heightCm)
  return (
    <>
      <h1 className="large-title">Goal weight</h1>
      <div className="card hint-card">
        <span className="muted">Healthy range for your height</span>
        <strong>
          {Math.round(toDisplayWeight(range.min, units))}–{Math.round(toDisplayWeight(range.max, units))} {weightUnit(units)}
        </strong>
        <span className="muted small">Based on BMI 18.5–24.9. Just a suggestion — you choose.</span>
      </div>
      <Field label="Your goal" inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value.replace(/[^\d.]/g, ''))} suffix={weightUnit(units)} />
      {low && <Note tone="warn">That's below the usual healthy range for your height. You can keep it — just something to know.</Note>}
      <Button className="onboard-next" onClick={onNext} disabled={!ok}>
        Continue
      </Button>
    </>
  )
}

function PlanStep({ draft, weightKg }: { draft: Profile; weightKg: number }) {
  const suggested = suggestTargets(draft, weightKg)!
  const [adjust, setAdjust] = useState(false)
  const [t, setT] = useState<Targets>(suggested)
  const finish = (targets: Targets) => {
    updateProfile({ ...draft, targets, onboarded: true })
    setDoc('weights', { items: [{ id: newId(), date: today(), kg: weightKg }], deleted: [] })
    track('setting_changed', { name: 'onboarding', value: draft.activityMode })
  }
  const num = (k: keyof Targets) => (e: React.ChangeEvent<HTMLInputElement>) => setT({ ...t, [k]: Number(e.target.value.replace(/\D/g, '')), manual: true })
  return (
    <>
      <h1 className="large-title">Your plan</h1>
      <p className="lead">
        Starting at {showWeight(weightKg, draft.units, 0)}
        {draft.goal !== 'maintain' && <> · goal {showWeight(draft.goalWeightKg!, draft.units, 0)}</>}
      </p>
      {!adjust ? (
        <div className="card plan-card">
          <div className="plan-cal">
            <span className="big-number">{t.calories.toLocaleString()}</span>
            <span className="muted">calories a day{draft.activityMode === 'track' ? ' + your activity' : ''}</span>
          </div>
          <div className="plan-macros">
            <span>
              <b style={{ color: 'var(--protein-ink)' }}>P</b> {t.protein} g
            </span>
            <span>
              <b style={{ color: 'var(--carbs-ink)' }}>C</b> {t.carbs} g
            </span>
            <span>
              <b style={{ color: 'var(--fat-ink)' }}>F</b> {t.fat} g
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
          {isBelowFloor(t.calories, draft.sex) && <Note tone="warn">That's below the usual minimum ({draft.sex === 'male' ? '1,500' : '1,200'}). Saved as you entered it.</Note>}
        </>
      )}
      <Button className="onboard-next" onClick={() => finish(adjust ? t : suggested)}>
        {adjust ? 'Save' : 'Looks good'}
      </Button>
      {!adjust && (
        <Button kind="secondary" onClick={() => setAdjust(true)}>
          Adjust
        </Button>
      )}
    </>
  )
}
