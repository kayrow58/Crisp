// Numbers screens need, computed from the profile + a day (allowance, totals, maintenance).
import { useEffect, useState } from 'react'
import { activityBonus, dayTotals, maintenanceFor, suggestTargets } from '../../shared/calc'
import type { DayDoc, Profile, Targets } from '../../shared/types'
import { dayKey } from '../../shared/dates'
import { getState, latestWeightKg } from './store'

const FALLBACK: Targets = { calories: 2000, protein: 120, carbs: 200, fat: 65, manual: false }

export function targetsFor(p: Profile | null): Targets {
  if (!p) return FALLBACK
  if (p.targets) return p.targets
  return suggestTargets(p, latestWeightKg() ?? 70) ?? FALLBACK
}

export function dayStats(p: Profile | null, day: DayDoc) {
  const t = targetsFor(p)
  const kg = latestWeightKg() ?? 70
  const mode = p?.activityMode ?? 'level'
  const bonus = activityBonus(day, kg, mode)
  const totals = dayTotals(day)
  const allowance = Math.round(t.calories + bonus.total)
  const maint = p ? maintenanceFor(p, kg) : null
  return {
    targets: t,
    totals,
    bonus,
    allowance,
    left: allowance - totals.cal,
    /** maintenance including the same activity credit the allowance uses */
    maintIncl: maint != null ? maint + bonus.total : null,
  }
}

/** Current Crisp day (3 AM cutoff), re-checked every minute. */
export function useToday(): string {
  const tz = getState().profile?.timeZone
  const [d, setD] = useState(() => dayKey(new Date(), tz))
  useEffect(() => {
    const id = setInterval(() => setD(dayKey(new Date(), getState().profile?.timeZone)), 60_000)
    return () => clearInterval(id)
  }, [])
  return d
}
