import { describe, expect, it } from 'vitest'
import { catchUp, monthDates, scaleChangeKg, sumNet, weekStart, weightOn, type DayBal } from './balance'
import type { Profile } from '../../shared/types'

const day = (date: string, eaten: number, extra: Partial<DayBal> = {}): DayBal => ({ date, logged: true, partial: false, eaten, maint: 2500, goal: 2000, net: eaten - 2500, ...extra })

describe('balance', () => {
  it('weeks start on Sunday; months have the right days', () => {
    expect(weekStart('2026-11-11')).toBe('2026-11-08')
    expect(weekStart('2026-11-08')).toBe('2026-11-08')
    expect(monthDates('2026-02')).toHaveLength(28)
    expect(monthDates('2028-02')).toHaveLength(29)
  })
  it('totals skip unlogged days and today', () => {
    const days = [day('2026-11-08', 2000), day('2026-11-09', 0, { logged: false }), day('2026-11-10', 3000), day('2026-11-11', 500, { partial: true })]
    expect(sumNet(days)).toEqual({ net: -500 + 500, logged: 2 })
  })
  it('uses the weight that applied on each day', () => {
    const w = [{ id: 'a', date: '2026-11-01', kg: 100 }, { id: 'b', date: '2026-11-08', kg: 98 }]
    expect(weightOn('2026-10-30', w, 90)).toBe(100)
    expect(weightOn('2026-11-09', w, 90)).toBe(98)
    expect(weightOn('2026-11-09', [], 90)).toBe(90)
  })
  it('compares the scale week over week', () => {
    const w = [{ id: 'a', date: '2026-11-03', kg: 100 }, { id: 'b', date: '2026-11-05', kg: 100.4 }, { id: 'c', date: '2026-11-10', kg: 99.6 }]
    expect(scaleChangeKg(w, '2026-11-08', '2026-11-14')).toBeCloseTo(-0.6)
    expect(scaleChangeKg([], '2026-11-08', '2026-11-14')).toBeNull()
  })
  it('spreads a catch-up over the days left, at most 250 a day', () => {
    const p = { sex: 'male', goal: 'lose' } as Profile
    const week = ['08', '09', '10', '11', '12', '13', '14'].map((d, i) => day(`2026-11-${d}`, i === 1 ? 3400 : 2000, { partial: i >= 3 }))
    const c = catchUp(week, '2026-11-11', p, 2000)!
    expect(c.behind).toBe(1400)
    expect(c.daysLeft).toBe(4)
    expect(c.perDay).toBe(250)
    expect(c.covers).toBe(false)
    // never below the safe minimum (male 1,500): only 100 of room at a 1,600 goal
    expect(catchUp(week, '2026-11-11', p, 1600)!.perDay).toBe(100)
    // small gaps need no plan
    expect(catchUp([day('2026-11-08', 2050)], '2026-11-11', p, 2000)!.perDay).toBe(0)
  })
})
