// Receives Apple Health data from the Crisp Apple Shortcut (spec §3.7, §8).
// The Shortcut sends JSON: { code, steps, workouts?: [{ type, minutes, calories }], date? }
// It can also send simple totals instead of a list: { code, steps, workoutMinutes, workoutCalories }.
// Or the Activity-ring totals (works on every iOS version): { code, steps, activeCalories, exerciseMinutes }.
//   activeCalories = Active Energy (Move ring: walking + workouts). The walking part is already counted
//   from steps, so only the extra burn is kept as today's exercise — nothing is counted twice.
import type { Config } from '@netlify/functions'
import { HttpError, body, handler, json, randomId } from '../lib/http'
import { getProfile, saveProfile, stores, update } from '../lib/stores'
import { recordEvent } from '../lib/events'
import { dayKey } from '../../shared/dates'
import { stepCalories } from '../../shared/calc'
import { emptyDay, type DayDoc, type WeightEntry, type Workout } from '../../shared/types'

export const config: Config = { path: '/api/fitness' }

const num = (v: unknown) => {
  const n = Number(String(v ?? '').replace(/[^0-9.]/g, ''))
  return Number.isFinite(n) ? n : 0
}

export default handler(async (req) => {
  if (req.method !== 'POST') throw new HttpError(405, 'method', 'Use POST.')
  const b = await body<{
    code: string
    steps?: unknown
    date?: string
    workouts?: { type?: string; minutes?: unknown; calories?: unknown }[]
    workoutMinutes?: unknown
    workoutCalories?: unknown
    activeCalories?: unknown
    exerciseMinutes?: unknown
  }>(req)
  const uid = await stores.fitnesscodes().get(String(b.code ?? '').trim(), { type: 'text' })
  if (!uid) throw new HttpError(401, 'bad_code', 'That sync code is not recognized. Copy it again from Crisp → Settings → Connect Apple Fitness.')
  const profile = await getProfile(uid)
  if (!profile) throw new HttpError(401, 'bad_code', 'This account no longer exists.')

  const date = b.date && /^\d{4}-\d{2}-\d{2}$/.test(b.date) ? b.date : dayKey(new Date(), profile.timeZone)
  const now = new Date().toISOString()
  const steps = Math.round(num(b.steps))
  const list: Workout[] = (Array.isArray(b.workouts) ? b.workouts : [])
    .map((w) => ({
      id: `sc-${randomId(6)}`,
      type: String(w.type ?? 'Workout').slice(0, 40),
      minutes: Math.round(num(w.minutes)),
      cal: Math.round(num(w.calories)),
      source: 'shortcut' as const,
      at: now,
    }))
    .filter((w) => w.minutes > 0 || w.cal > 0)
  if (!list.length && (num(b.workoutMinutes) > 0 || num(b.workoutCalories) > 0)) {
    list.push({
      id: `sc-${randomId(6)}`,
      type: 'Workouts',
      minutes: Math.round(num(b.workoutMinutes)),
      cal: Math.round(num(b.workoutCalories)),
      source: 'shortcut',
      at: now,
    })
  }

  // Activity-ring totals: exercise = Active Energy minus what the steps already account for.
  if (!list.length && (num(b.activeCalories) > 0 || num(b.exerciseMinutes) > 0)) {
    const weights = ((await stores.userdata().get(`${uid}/weights`, { type: 'json' }).catch(() => null)) as { items?: WeightEntry[] } | null)?.items ?? []
    const latest = [...weights].sort((a, c) => a.date.localeCompare(c.date)).pop()
    const kg = latest?.kg ?? profile.startWeightKg ?? 75
    const extra = Math.max(0, num(b.activeCalories) - stepCalories(steps, kg))
    const minutes = Math.round(num(b.exerciseMinutes))
    if (minutes > 0 || extra >= 20) {
      list.push({ id: `sc-${randomId(6)}`, type: 'Exercise', minutes, cal: Math.round(extra), source: 'shortcut', at: now })
    }
  }

  await update<DayDoc>(stores.userdata(), `${uid}/days/${date}`, (cur) => {
    const day = cur ?? emptyDay(date)
    return {
      ...day,
      // Numbers the person changed by hand stay as they are.
      steps: steps > 0 && day.steps?.source !== 'manual' ? { count: steps, source: 'shortcut', updatedAt: now } : day.steps,
      workouts: day.fitnessLock?.exercise ? day.workouts : [...day.workouts.filter((w) => w.source !== 'shortcut'), ...list],
    }
  })

  const first = !profile.fitnessLastSync
  await saveProfile({ ...(await getProfile(uid))!, fitnessLastSync: now })
  if (first) await recordEvent(uid, 'fitness_connected')
  await recordEvent(uid, 'fitness_synced', { steps, workouts: list.length })

  const exercise = list.find((w) => w.type === 'Exercise')
  const parts = [
    steps ? `${steps.toLocaleString('en-US')} steps` : null,
    exercise ? `${exercise.minutes} exercise min` : list.length ? `${list.length} workout${list.length > 1 ? 's' : ''}` : null,
  ].filter(Boolean)
  return json({ ok: true, message: parts.length ? `Synced ${parts.join(' and ')} to Crisp.` : 'Connected to Crisp. Nothing new to sync.' })
})
