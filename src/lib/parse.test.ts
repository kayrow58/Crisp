import { describe, expect, it } from 'vitest'
import { fitUnit, parseFoods, parseItem, splitFoods } from './parse'
import type { LibFood } from './foods'

describe('splitting', () => {
  it('splits on commas, lines and "and" before an amount', () => {
    expect(splitFoods('2 eggs, toast and 1 cup of coffee\nbanana')).toEqual(['2 eggs', 'toast', '1 cup of coffee', 'banana'])
  })
  it('keeps "mac and cheese" together', () => {
    expect(splitFoods('mac and cheese, a banana')).toEqual(['mac and cheese', 'a banana'])
  })
})

describe('parsing amounts', () => {
  it.each([
    ['2 eggs', 2, null, 'eggs'],
    ['1 cup of rice', 1, 'cup', 'rice'],
    ['6oz chicken breast', 6, 'oz', 'chicken breast'],
    ['chicken breast 6 oz', 6, 'oz', 'chicken breast'],
    ['a banana', 1, null, 'banana'],
    ['half an avocado', 0.5, null, 'avocado'],
    ['1/2 cup oats', 0.5, 'cup', 'oats'],
    ['½ cup greek yogurt', 0.5, 'cup', 'greek yogurt'],
    ['two slices of bread', 2, 'slice', 'bread'],
    ['I had 3 tbsp peanut butter', 3, 'tbsp', 'peanut butter'],
    ['150 grams salmon', 150, 'g', 'salmon'],
    ['coffee', 1, null, 'coffee'],
  ])('%s', (text, qty, unit, query) => {
    const p = parseItem(text)
    expect(p.qty).toBeCloseTo(qty as number)
    expect(p.unit).toBe(unit)
    expect(p.query).toBe(query)
  })
  it('handles a whole sentence', () => {
    expect(parseFoods('For breakfast I had 2 eggs, a slice of toast and some coffee').map((p) => p.query)).toEqual(['eggs', 'toast', 'coffee'])
  })
})

describe('fitting units', () => {
  const rice: LibFood = {
    id: 'u:1',
    name: 'Rice, white, cooked',
    per100: { cal: 130, p: 2.7, c: 28, f: 0.3 },
    units: [{ label: '1 cup', grams: 158 }, { label: 'g', grams: 1 }, { label: 'oz', grams: 28.35 }],
    featured: true,
  }
  const egg: LibFood = {
    id: 'u:2',
    name: 'Egg, whole, cooked, scrambled',
    per100: { cal: 149, p: 10, c: 1.6, f: 11 },
    units: [{ label: '1 large', grams: 61 }, { label: '1 cup', grams: 220 }, { label: 'g', grams: 1 }, { label: 'oz', grams: 28.35 }],
    featured: true,
  }
  const banana: LibFood = {
    id: 'u:3',
    name: 'Bananas, raw',
    per100: { cal: 89, p: 1.1, c: 23, f: 0.3 },
    units: [{ label: '1 cup, mashed', grams: 225 }, { label: 'g', grams: 1 }, { label: 'oz', grams: 28.35 }],
    featured: true,
  }
  it('cups', () => expect(fitUnit(rice, parseItem('2 cups rice'))).toMatchObject({ unitIndex: 0, qty: 2 }))
  it('grams', () => expect(fitUnit(rice, parseItem('200g rice'))).toMatchObject({ unitIndex: 1, qty: 200 }))
  it('pounds → ounces', () => expect(fitUnit(rice, parseItem('1 lb rice'))).toMatchObject({ unitIndex: 2, qty: 16 }))
  it('counting eggs uses "large"', () => expect(fitUnit(egg, parseItem('3 eggs'))).toMatchObject({ unitIndex: 0, qty: 3 }))
  it('a banana is one medium banana, not a cup', () => {
    const m = fitUnit(banana, parseItem('a banana'))
    expect(m.food.units[m.unitIndex]).toEqual({ label: 'medium banana', grams: 118 })
    expect(m.qty).toBe(1)
  })
})
