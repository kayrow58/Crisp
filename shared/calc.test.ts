import { describe, expect, it } from 'vitest'
import {
  activityBonus,
  bmr,
  estimatedChangeLb,
  flameTier,
  goalProgress,
  healthyRangeKg,
  lbToKg,
  macrosFor,
  maintenance,
  mealForHour,
  newMilestones,
  stepCalories,
  streak,
  suggestedCalories,
} from './calc'
import { addDays, dayKey } from './dates'
import { mergeDay } from './merge'
import { emptyDay } from './types'

describe('Mifflin-St Jeor', () => {
  it('matches the published formula', () => {
    expect(bmr('male', 80, 180, 30)).toBeCloseTo(10 * 80 + 6.25 * 180 - 150 + 5)
    expect(bmr('female', 60, 165, 30)).toBeCloseTo(10 * 60 + 6.25 * 165 - 150 - 161)
  })
  it('uses the activity multiplier only in Set-level mode', () => {
    const b = bmr('female', 60, 165, 30)
    expect(maintenance('female', 60, 165, 30, 'level', 'active')).toBeCloseTo(b * 1.55)
    expect(maintenance('female', 60, 165, 30, 'track', 'active')).toBeCloseTo(b * 1.2)
  })
})

describe('targets', () => {
  it('suggests a deficit capped at ~1% body weight per week and never below the floor', () => {
    expect(suggestedCalories('lose', 'female', 2000, lbToKg(150))).toBe(1500)
    // small person: 1% of 100 lb/week = 500 cal/day cap is 1 lb… deficit limited to ~500
    expect(suggestedCalories('lose', 'female', 1500, lbToKg(100))).toBe(1200)
    // maintenance already under the floor → stay at maintenance
    expect(suggestedCalories('lose', 'female', 1150, lbToKg(95))).toBe(1150)
    expect(suggestedCalories('gain', 'male', 2500, 80)).toBe(2750)
    expect(suggestedCalories('maintain', 'male', 2504, 80)).toBe(2500)
  })
  it('is protein first', () => {
    const m = macrosFor(1600, lbToKg(150))
    expect(m.protein).toBe(120)
    expect(m.fat).toBe(53)
    expect(m.carbs).toBe(Math.round((1600 - 120 * 4 - 53 * 9) / 4))
  })
})

describe('activity', () => {
  it('converts steps at ~0.04 cal per step per 150 lb', () => {
    expect(stepCalories(10000, lbToKg(150))).toBeCloseTo(400)
    expect(stepCalories(10000, lbToKg(200))).toBeCloseTo(533.3, 0)
  })
  it('adds 50% of workouts and 100% of steps only in Track mode', () => {
    const day = { ...emptyDay('2026-01-01'), steps: { count: 5000, source: 'manual' as const, updatedAt: '' }, workouts: [{ id: 'w', type: 'Run', minutes: 30, cal: 400, source: 'manual' as const, at: '' }] }
    expect(activityBonus(day, lbToKg(150), 'track')).toEqual({ steps: 200, workouts: 200, total: 400 })
    expect(activityBonus(day, lbToKg(150), 'level').total).toBe(0)
  })
})

describe('weight helpers', () => {
  it('healthy range uses BMI 18.5–24.9', () => {
    const r = healthyRangeKg(170)
    expect(r.min).toBeCloseTo(53.5, 1)
    expect(r.max).toBeCloseTo(72.0, 1)
  })
  it('estimates change from a 500 cal deficit', () => {
    expect(estimatedChangeLb(1600, 2100)).toBeCloseTo(-0.143, 3)
  })
  it('finds new milestones once', () => {
    expect(goalProgress(90, 85, 80)).toBeCloseTo(0.5)
    expect(newMilestones(0.5, [15])).toEqual([25, 50])
    expect(newMilestones(0.5, [15, 25, 50])).toEqual([])
    // gaining works too
    expect(goalProgress(60, 63, 66)).toBeCloseTo(0.5)
  })
})

describe('streaks & days', () => {
  it('counts back from today or yesterday', () => {
    const t = '2026-10-28'
    expect(streak([t, addDays(t, -1), addDays(t, -2)], t)).toEqual({ current: 3, loggedToday: true, lost: false })
    expect(streak([addDays(t, -1), addDays(t, -2)], t)).toEqual({ current: 2, loggedToday: false, lost: false })
    expect(streak([addDays(t, -3)], t)).toEqual({ current: 0, loggedToday: false, lost: true })
  })
  it('flame tiers', () => {
    expect([1, 7, 30, 100].map(flameTier)).toEqual(['small', 'medium', 'large', 'blazing'])
  })
  it('day starts at 3 AM local', () => {
    expect(dayKey(new Date('2026-10-29T07:30:00Z'), 'America/Chicago')).toBe('2026-10-28') // 2:30 AM CDT
    expect(dayKey(new Date('2026-10-29T08:30:00Z'), 'America/Chicago')).toBe('2026-10-29') // 3:30 AM CDT
  })
  it('meal by time of day', () => {
    expect([7, 12, 18, 22, 1].map(mealForHour)).toEqual(['breakfast', 'lunch', 'dinner', 'snacks', 'snacks'])
  })
})

describe('merge', () => {
  it('keeps both phones’ foods and respects deletes', () => {
    const base = emptyDay('2026-10-28')
    const f = (id: string) => ({ id, foodId: 'q', name: id, meal: 'lunch' as const, qty: 1, unit: 'serving', cal: 1, p: 0, c: 0, f: 0, at: id })
    const a = { ...base, foods: [f('a'), f('x')], deleted: [] }
    const b = { ...base, foods: [f('b'), f('x')], deleted: ['x'] }
    expect(mergeDay(a, b).foods.map((x) => x.id)).toEqual(['a', 'b'])
  })
})
