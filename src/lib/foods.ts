// Built-in USDA food library (public/foods.json, built by scripts/build-foods.mjs) + search.
import type { BrandFood, CustomFood } from '../../shared/types'
import { fuzzySearch } from './match'

/** [id, name, kcal, protein, carbs, fat (all per 100 g), portions [[label, grams]], featured, kind] */
type Row = [string, string, number, number, number, number, [string, number][], number, number?]

export interface LibFood {
  id: string // 'u:<ndb>' or 'c:<id>'
  name: string
  per100?: { cal: number; p: number; c: number; f: number }
  /** For custom foods: macros for one serving */
  perServing?: { cal: number; p: number; c: number; f: number }
  units: { label: string; grams?: number }[]
  featured: boolean
  /** 1 generic everyday food (FNDDS) · 0 detailed food (SR28) · 2 brand or restaurant item */
  kind?: 0 | 1 | 2
  createdByName?: string
  custom?: CustomFood
  /** store-brand product (USDA Branded Foods / Open Food Facts) */
  brand?: BrandFood
}

let lib: LibFood[] | null = null
let loading: Promise<LibFood[]> | null = null

export function loadLibrary(): Promise<LibFood[]> {
  if (lib) return Promise.resolve(lib)
  if (!loading) {
    loading = fetch('/foods.json')
      .then((r) => r.json())
      .then((j: { foods: Row[] }) => {
        lib = j.foods.map(([id, name, cal, p, c, f, portions, featured, kind]) => ({
          id: `u:${id}`,
          kind: (kind ?? 0) as 0 | 1 | 2,
          name,
          per100: { cal, p, c, f },
          units: [...portions.map(([label, grams]) => ({ label, grams })), { label: 'g', grams: 1 }, { label: 'oz', grams: 28.35 }],
          featured: featured === 1,
        }))
        return lib
      })
      .catch((e) => {
        loading = null
        throw e
      })
  }
  return loading
}

export function customToLib(c: CustomFood): LibFood {
  return {
    id: `c:${c.id}`,
    name: c.name,
    perServing: { cal: c.cal, p: c.p, c: c.c, f: c.f },
    units: [{ label: c.serving || '1 serving' }],
    featured: true,
    createdByName: c.createdByName,
    custom: c,
  }
}

/** Macros for qty × unit of a food. */
export function macrosFor(food: LibFood, unitIndex: number, qty: number) {
  const unit = food.units[unitIndex] ?? food.units[0]
  if (food.perServing) {
    const s = food.perServing
    return { cal: s.cal * qty, p: s.p * qty, c: s.c * qty, f: s.f * qty }
  }
  const grams = (unit.grams ?? 100) * qty
  const m = food.per100!
  return { cal: (m.cal * grams) / 100, p: (m.p * grams) / 100, c: (m.c * grams) / 100, f: (m.f * grams) / 100 }
}

/**
 * Search box: generic everyday foods first ("Sour cream, regular"), then detailed foods,
 * then brands and restaurants (unless a brand name was typed). Tolerates typos and word order.
 */
export function searchFoods(all: LibFood[], query: string, limit = 40): LibFood[] {
  return fuzzySearch(all, query, limit, { phrases: false })
}
