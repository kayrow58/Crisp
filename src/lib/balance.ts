// Balance: calories in vs. maintenance, day by day, rolled up into weeks, months and the year.
// Pure functions (no React) so they're easy to test.
import { activityBonus, CAL_PER_LB, CALORIE_FLOOR, dayTotals, maintenanceFor } from '../../shared/calc'
import { addDays, weekday } from '../../shared/dates'
import type { DayDoc, Profile, WeightEntry } from '../../shared/types'

export interface DayBal {
  date: string
  /** has food logged (unlogged days never count as zero) */
  logged: boolean
  /** today: still going, shown but not counted */
  partial: boolean
  eaten: number
  maint: number
  goal: number
  /** eaten − maintenance (negative = under) */
  net: number
}

/** The weight that applied on a date: the latest weigh-in on or before it (else the first one, else the start weight). */
export function weightOn(date: string, sortedWeights: WeightEntry[], fallbackKg: number): number {
  let kg: number | undefined
  for (const w of sortedWeights) {
    if (w.date > date) break
    kg = w.kg
  }
  return kg ?? sortedWeights[0]?.kg ?? fallbackKg
}

/** null when maintenance can't be worked out (profile missing height/age/sex). */
export function dayBalance(p: Profile, day: DayDoc, kg: number, goalCalories: number, today: string): DayBal | null {
  const base = maintenanceFor(p, kg)
  if (base == null) return null
  const bonus = activityBonus(day, kg, p.activityMode ?? 'level', p.heightCm)
  const eaten = Math.round(dayTotals(day).cal)
  const maint = Math.round(base + bonus.total)
  const goal = Math.round(goalCalories + bonus.total)
  return { date: day.date, logged: day.foods.length > 0, partial: day.date >= today, eaten, maint, goal, net: eaten - maint }
}

/** Days that count toward totals: logged and finished. */
export const counted = (d: DayBal) => d.logged && !d.partial

export function sumNet(days: DayBal[]): { net: number; logged: number } {
  const c = days.filter(counted)
  return { net: c.reduce((a, d) => a + d.net, 0), logged: c.length }
}

/** Sunday that starts the week containing `date`. */
export const weekStart = (date: string) => addDays(date, -weekday(date))
export const weekDates = (start: string) => Array.from({ length: 7 }, (_, i) => addDays(start, i))

export function monthDates(ym: string): string[] {
  const [y, m] = ym.split('-').map(Number)
  const n = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return Array.from({ length: n }, (_, i) => `${ym}-${String(i + 1).padStart(2, '0')}`)
}

/** Calories → pounds (or kg) of body weight, by the usual 3,500-per-pound rule. */
export const calToLb = (cal: number) => cal / CAL_PER_LB

/**
 * How much the scale moved over a period: average of the weigh-ins in the period's last week
 * minus the average of the week before it started. Falls back to the first/last weigh-in inside the period.
 * null when there isn't enough to compare.
 */
export function scaleChangeKg(sortedWeights: WeightEntry[], from: string, to: string): number | null {
  const avg = (a: string, b: string) => {
    const w = sortedWeights.filter((x) => x.date >= a && x.date <= b)
    return w.length ? w.reduce((s, x) => s + x.kg, 0) / w.length : null
  }
  const inside = sortedWeights.filter((x) => x.date >= from && x.date <= to)
  const start = avg(addDays(from, -7), addDays(from, -1)) ?? (inside.length > 1 ? inside[0].kg : null)
  const endFrom = addDays(to, -6) > from ? addDays(to, -6) : from
  const end = avg(endFrom, to) ?? inside[inside.length - 1]?.kg ?? null
  if (start == null || end == null) return null
  return end - start
}

export interface CatchUp {
  /** calories over (+) or under (−) the weekly goal so far */
  behind: number
  /** suggested cut per remaining day (0 if none needed) */
  perDay: number
  daysLeft: number
  /** the suggestion fully makes up the gap */
  covers: boolean
}

/**
 * This week so far vs. the goal: finished, logged days only. Suggests spreading any gap over the days left
 * (today included), at most 250 a day and never below the safe minimum.
 */
export function catchUp(week: DayBal[], today: string, p: Profile, goalCalories: number): CatchUp | null {
  const done = week.filter(counted)
  if (!done.length) return null
  const behind = done.reduce((a, d) => a + (d.eaten - d.goal), 0)
  const daysLeft = week.filter((d) => d.date >= today).length
  if (behind <= 100 || daysLeft === 0) return { behind, perDay: 0, daysLeft, covers: behind <= 100 }
  const floor = CALORIE_FLOOR[p.sex ?? 'female']
  const room = Math.max(0, goalCalories - floor)
  const perDay = Math.min(250, room, Math.ceil(behind / daysLeft / 10) * 10)
  return { behind, perDay, daysLeft, covers: perDay * daysLeft >= behind }
}
