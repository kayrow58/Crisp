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
/** Weekly pace choices (lb per week). Lose: 0.5–2, gain: 0.25–1. */
export const LOSE_PACES = [0.5, 1, 1.5, 2] as const
export const GAIN_PACES = [0.25, 0.5, 1] as const
export const DEFAULT_PACE: Record<Goal, number> = { lose: 1, gain: 0.5, maintain: 0 }

/** Fastest safe loss pace (~1% of body weight a week), in lb/week. */
export const maxLosePace = (kg: number) => kgToLb(kg) * 0.01

/** A pace is offered when it stays within ~1% of body weight a week (0.5 lb is always allowed). */
export function paceAllowed(goal: Goal, pace: number, kg: number): boolean {
  if (goal !== 'lose') return true
  return pace <= 0.5 || pace <= maxLosePace(kg) + 0.05
}

/** Daily calorie change for a weekly pace: 1 lb ≈ 3,500 cal → 1 lb/week = 500/day. */
export const paceToDaily = (lbPerWeek: number) => (lbPerWeek * CAL_PER_LB) / 7

export function suggestedCalories(goal: Goal, sex: Sex, maint: number, kg: number, pace?: number): number {
  if (goal === 'maintain') return round(maint, 10)
  const lb = pace ?? DEFAULT_PACE[goal]
  if (goal === 'gain') return round(maint + paceToDaily(lb), 10)
  const maxDeficit = paceToDaily(Math.max(0.5, maxLosePace(kg))) // ~1% of body weight per week
  const deficit = Math.min(paceToDaily(lb), maxDeficit)
  const floor = CALORIE_FLOOR[sex]
  const target = Math.max(maint - deficit, Math.min(floor, maint))
  return round(target, 10)
}

/** Weekly pace the target actually gives (after the safety cap and calorie floor). */
export function effectivePace(goal: Goal, calories: number, maint: number): number {
  if (goal === 'maintain') return 0
  return Math.abs(maint - calories) * 7 / CAL_PER_LB
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
  const calories = suggestedCalories(p.goal, p.sex, maint, currentKg, p.paceLbPerWeek)
  return { calories, ...macrosFor(calories, p.goalWeightKg), manual: false }
}

export function maintenanceFor(p: Profile, currentKg: number): number | null {
  if (!p.sex || !p.heightCm || !p.birthYear) return null
  return maintenance(p.sex, currentKg, p.heightCm, ageFrom(p.birthYear), p.activityMode, p.activityLevel)
}

/** Steps in a mile from height (stride ≈ 41.5% of height); ~2,200 when height isn't known. */
export function stepsPerMile(heightCm?: number): number {
  if (!heightCm || heightCm < 100) return 2200
  return 160934 / (heightCm * 0.415)
}

/**
 * Extra calories from walking: ~0.3 cal per lb per mile (net — the body's "staying alive" calories
 * are already in the base target, so they aren't counted again here).
 */
export function stepCalories(steps: number, kg: number, heightCm?: number): number {
  return (steps / stepsPerMile(heightCm)) * 0.3 * kgToLb(kg)
}

export function workoutCalories(day: DayDoc | undefined): number {
  return (day?.workouts ?? []).reduce((s, w) => s + (w.cal || 0), 0)
}

/** What logged activity adds to today's allowance (Track mode only). */
export function activityBonus(day: DayDoc | undefined, kg: number, mode: ActivityMode, heightCm?: number) {
  if (mode !== 'track') return { steps: 0, workouts: 0, total: 0 }
  const steps = Math.round(stepCalories(day?.steps?.count ?? 0, kg, heightCm))
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
