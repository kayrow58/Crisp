import { describe, expect, it } from 'vitest'
import { amountLabel, hourLabel } from './format'

describe('amountLabel', () => {
  it('reads naturally', () => {
    expect(amountLabel(1, '1 serving')).toBe('1 serving')
    expect(amountLabel(2, '1 cup')).toBe('2 × 1 cup')
    expect(amountLabel(150, 'g')).toBe('150 g')
    expect(amountLabel(6, 'oz')).toBe('6 oz')
  })
  it('shows the hour', () => {
    expect(hourLabel(new Date(2026, 9, 29, 18, 40).toISOString())).toBe('6 PM')
    expect(hourLabel(new Date(2026, 9, 29, 0, 5).toISOString())).toBe('12 AM')
  })
})
