// Weekend mode: enjoy the weekend, still reach the goal. The calorie bar gets zones —
// normal up to the goal, orange past it (losing slower, not gaining), red near maintenance (gain starts).
import { addDays, weekday } from '../../shared/dates'
import { getPrefs, setPref, usePrefs } from './prefs'
import type { Profile } from '../../shared/types'

/** How close to maintenance (cal) the red zone and heads-up start. */
export const RED_MARGIN = 200

/** The weekend runs Friday–Sunday and is keyed by its Friday's date; other days → null. */
export function weekendKey(date: string): string | null {
  const d = weekday(date)
  if (d === 5) return date
  if (d === 6) return addDays(date, -1)
  if (d === 0) return addDays(date, -2)
  return null
}

/** Weekend mode is offered to people trying to lose weight. */
export const weekendEligible = (p: Profile | null) => p?.goal === 'lose'

export function weekendOnFor(date: string, p: Profile | null, weekendOn = getPrefs().weekendOn): boolean {
  const k = weekendKey(date)
  return !!k && k === weekendOn && weekendEligible(p)
}

export function useWeekendOn(date: string, p: Profile | null): boolean {
  const prefs = usePrefs()
  return weekendOnFor(date, p, prefs.weekendOn)
}

export type Zone = 'normal' | 'orange' | 'red' | 'over'

export interface Zones {
  goal: number
  redStart: number
  maint: number
}

export function zonesFor(allowance: number, maintIncl: number | null): Zones | null {
  if (maintIncl == null || maintIncl <= allowance) return null
  const maint = Math.round(maintIncl)
  return { goal: allowance, redStart: Math.max(allowance, maint - RED_MARGIN), maint }
}

export function zoneOf(eaten: number, z: Zones): Zone {
  if (eaten >= z.maint) return 'over'
  if (eaten >= z.redStart) return 'red'
  if (eaten > z.goal) return 'orange'
  return 'normal'
}

export function setWeekend(date: string, on: boolean) {
  const k = weekendKey(date)
  if (!k) return
  setPref('weekendAsked', k)
  setPref('weekendOn', on ? k : '')
}

/** Should we ask about Weekend mode right now? Once per weekend. */
export function shouldAskWeekend(today: string, p: Profile | null): boolean {
  const k = weekendKey(today)
  const prefs = getPrefs()
  return !!k && weekendEligible(p) && prefs.weekendAsked !== k && prefs.weekendOn !== k
}
