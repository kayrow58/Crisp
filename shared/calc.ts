// All Crisp math in one place (spec §8 "Calculations"). Pure functions, unit-tested in calc.test.ts.
import type { ActivityLevel, ActivityMode, DayDoc, Goal, Profile, Sex, Targets } from './types'
import { addDays } from './dates'

export const KG_PER_LB = 0.45359237
export const LB_PER_KG = 1 / KG_PER_LB
export const CM_PER_IN = 2.54
export const CAL_PER_LB = 3500

export const ACTIVITY_MULTIPLIER: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  active: 1.55,
  very: 1.725,
}

export const CALORIE_FLOOR: Record<Sex, number> = { female: 1200, male: 1500 }
export const MILESTONES = [15, 25, 50, 75, 100]

export const kgToLb = (kg: number) => kg * LB_PER_KG
export const lbToKg = (lb: number) => lb * KG_PER_LB

const round = (n: number, step = 1) => Math.round(n / step) * step

/** Mifflin-St Jeor resting calories. */
export function bmr(sex: Sex, kg: number, cm: number, age: number): number {
  const base = 10 * kg + 6.25 * cm - 5 * age
  return sex === 'male' ? base + 5 : base - 161
}

export function ageFrom(birthYear: number, now = new Date()): number {
  return now.getFullYear() - birthYear
}

/**
 * Maintenance calories.
 * - "Set my activity level": BMR × activity multiplier (activity already included).
 * - "Track my activity": BMR × 1.2 (mostly inactive); logged activity is added per day.
 */
export function maintenance(
  sex: Sex,
  kg: number,
  cm: number,
  age: number,
  mode: ActivityMode,
  level: ActivityLevel,
): number {
  const mult = mode === 'level' ? ACTIVITY_MULTIPLIER[level] : ACTIVITY_MULTIPLIER.sedentary
  return bmr(sex, kg, cm, age) * mult
}

/** Suggested daily calories for the goal, respecting the gentle guardrails (≤ ~1%/week, floor). */
export function suggestedCalories(goal: Goal, sex: Sex, maint: number, kg: number): number {
  if (goal === 'maintain') return round(maint, 10)
  if (goal === 'gain') return round(maint + 250, 10)
  const maxDeficit = (kgToLb(kg) * 0.01 * CAL_PER_LB) / 7 // ~1% of body weight per week
  const deficit = Math.min(500, maxDeficit)
  const floor = CALORIE_FLOOR[sex]
  const target = Math.max(maint - deficit, Math.min(floor, maint))
  return round(target, 10)
}

/** Protein-first macros: 0.8 g per lb of goal weight, ~30% fat, carbs fill the rest. */
export function macrosFor(calories: number, goalKg: number): Omit<Targets, 'calories' | 'manual'> {
  const protein = round(0.8 * kgToLb(goalKg))
  const fat = round((calories * 0.3) / 9)
  const carbs = Math.max(0, round((calories - protein * 4 - fat * 9) / 4))
  return { protein, carbs, fat }
}

export function suggestTargets(p: Profile, currentKg: number): Targets | null {
  if (!p.sex || !p.heightCm || !p.birthYear || !p.goal || !p.goalWeightKg) return null
  const maint = maintenance(p.sex, currentKg, p.heightCm, ageFrom(p.birthYear), p.activityMode, p.activityLevel)
  const calories = suggestedCalories(p.goal, p.sex, maint, currentKg)
  return { calories, ...macrosFor(calories, p.goalWeightKg), manual: false }
}

export function maintenanceFor(p: Profile, currentKg: number): number | null {
  if (!p.sex || !p.heightCm || !p.birthYear) return null
  return maintenance(p.sex, currentKg, p.heightCm, ageFrom(p.birthYear), p.activityMode, p.activityLevel)
}

/** Calories from steps: ~0.04 cal per step per 150 lb of body weight (added at 100%). */
export function stepCalories(steps: number, kg: number): number {
  return steps * 0.04 * (kgToLb(kg) / 150)
}

export function workoutCalories(day: DayDoc | undefined): number {
  return (day?.workouts ?? []).reduce((s, w) => s + (w.cal || 0), 0)
}

/** What logged activity adds to today's allowance (Track mode only). */
export function activityBonus(day: DayDoc | undefined, kg: number, mode: ActivityMode) {
  if (mode !== 'track') return { steps: 0, workouts: 0, total: 0 }
  const steps = Math.round(stepCalories(day?.steps?.count ?? 0, kg))
  const workouts = Math.round(0.5 * workoutCalories(day))
  return { steps, workouts, total: steps + workouts }
}

export function dayTotals(day: DayDoc | undefined) {
  const t = { cal: 0, p: 0, c: 0, f: 0 }
  for (const e of day?.foods ?? []) {
    t.cal += e.cal
    t.p += e.p
    t.c += e.c
    t.f += e.f
  }
  return t
}

/** Healthy weight range (BMI 18.5–24.9) in kg for a height. */
export function healthyRangeKg(cm: number): { min: number; max: number } {
  const m = cm / 100
  return { min: 18.5 * m * m, max: 24.9 * m * m }
}

export const isBelowHealthy = (goalKg: number, cm: number) => goalKg < healthyRangeKg(cm).min
export const isBelowFloor = (calories: number, sex?: Sex) => !!sex && calories < CALORIE_FLOOR[sex]

/**
 * Estimated weight change for a day in lb (negative = loss):
 * (eaten − maintenance incl. activity) ÷ 3,500.
 */
export function estimatedChangeLb(eaten: number, maintInclActivity: number): number {
  return (eaten - maintInclActivity) / CAL_PER_LB
}

/** Fraction (0–1+) of the way from start to goal weight. */
export function goalProgress(startKg: number, currentKg: number, goalKg: number): number {
  const total = goalKg - startKg
  if (Math.abs(total) < 0.01) return 1
  return (currentKg - startKg) / total
}

/** Milestones newly crossed (not already in `hit`), highest last. */
export function newMilestones(progress: number, hit: number[]): number[] {
  const pct = progress * 100
  return MILESTONES.filter((m) => pct >= m - 1e-9 && !hit.includes(m))
}

export interface StreakInfo {
  current: number
  loggedToday: boolean
  /** true when there was a streak that ended (yesterday has no food and an earlier day does) */
  lost: boolean
}

/** Streak = consecutive days with ≥1 food, ending today (or yesterday if today isn't logged yet). */
export function streak(dates: Iterable<string>, today: string): StreakInfo {
  const set = new Set(dates)
  const loggedToday = set.has(today)
  let day = loggedToday ? today : addDays(today, -1)
  let current = 0
  while (set.has(day)) {
    current++
    day = addDays(day, -1)
  }
  const lost = current === 0 && [...set].some((d) => d < today)
  return { current, loggedToday, lost }
}

export type FlameTier = 'small' | 'medium' | 'large' | 'blazing'
export function flameTier(n: number): FlameTier {
  if (n >= 100) return 'blazing'
  if (n >= 30) return 'large'
  if (n >= 7) return 'medium'
  return 'small'
}

/** Default meal from time of day: <11 Breakfast · 11–4 Lunch · 4–9 Dinner · else Snacks. */
export function mealForHour(h: number) {
  if (h >= 3 && h < 11) return 'breakfast' as const
  if (h >= 11 && h < 16) return 'lunch' as const
  if (h >= 16 && h < 21) return 'dinner' as const
  return 'snacks' as const
}
