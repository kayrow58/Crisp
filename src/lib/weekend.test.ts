import { describe, expect, it } from 'vitest'
import { weekendKey, zoneOf, zonesFor } from './weekend'

describe('weekend mode', () => {
  it('runs Friday–Sunday, keyed by the Friday', () => {
    expect(weekendKey('2026-10-30')).toBe('2026-10-30') // Fri
    expect(weekendKey('2026-10-31')).toBe('2026-10-30') // Sat
    expect(weekendKey('2026-11-01')).toBe('2026-10-30') // Sun
    expect(weekendKey('2026-10-29')).toBeNull() // Thu
    expect(weekendKey('2026-11-02')).toBeNull() // Mon
  })
  it('splits the bar into goal → orange → red (200 from maintenance) → over', () => {
    const z = zonesFor(1700, 2400)!
    expect(z).toEqual({ goal: 1700, redStart: 2200, maint: 2400 })
    expect(zoneOf(1600, z)).toBe('normal')
    expect(zoneOf(1900, z)).toBe('orange')
    expect(zoneOf(2250, z)).toBe('red')
    expect(zoneOf(2450, z)).toBe('over')
    expect(zonesFor(2000, 2000)).toBeNull()
    expect(zonesFor(2300, 2400)!.redStart).toBe(2300)
  })
})
