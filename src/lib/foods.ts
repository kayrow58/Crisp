// Built-in USDA food library (public/foods.json, built by scripts/build-foods.mjs) + search.
import type { CustomFood } from '../../shared/types'

/** [id, name, kcal, protein, carbs, fat (all per 100 g), portions [[label, grams]], featured] */
type Row = [string, string, number, number, number, number, [string, number][], number]

export interface LibFood {
  id: string // 'u:<ndb>' or 'c:<id>'
  name: string
  per100?: { cal: number; p: number; c: number; f: number }
  /** For custom foods: macros for one serving */
  perServing?: { cal: number; p: number; c: number; f: number }
  units: { label: string; grams?: number }[]
  featured: boolean
  createdByName?: string
  custom?: CustomFood
}

let lib: LibFood[] | null = null
let loading: Promise<LibFood[]> | null = null

export function loadLibrary(): Promise<LibFood[]> {
  if (lib) return Promise.resolve(lib)
  if (!loading) {
    loading = fetch('/foods.json')
      .then((r) => r.json())
      .then((j: { foods: Row[] }) => {
        lib = j.foods.map(([id, name, cal, p, c, f, portions, featured]) => ({
          id: `u:${id}`,
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

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9% ]+/g, ' ').replace(/\s+/g, ' ').trim()

/** Simple ranked search: every word must appear; earlier and shorter matches rank higher. */
export function searchFoods(all: LibFood[], query: string, limit = 40): LibFood[] {
  const q = norm(query)
  if (!q) return []
  const words = q.split(' ')
  const scored: { f: LibFood; s: number }[] = []
  for (const f of all) {
    const n = norm(f.name)
    let ok = true
    let s = 0
    for (const w of words) {
      const i = n.indexOf(w)
      if (i < 0) {
        // allow simple plurals: "eggs" → "egg"
        const j = w.endsWith('s') ? n.indexOf(w.slice(0, -1)) : -1
        if (j < 0) {
          ok = false
          break
        }
        s += j + 5
      } else {
        s += i
        if (i === 0 || n[i - 1] === ' ') s -= 3
      }
    }
    if (!ok) continue
    s += n.length / 12
    if (f.featured) s -= 25
    if (f.custom) s -= 30
    if (/\braw\b|\bcooked\b|\broasted\b|\bboiled\b|\bgrilled\b/.test(n)) s -= 2
    if (/dehydrated|freeze dried|industrial|frozen, unprepared|imitation/.test(n)) s += 6
    scored.push({ f, s })
  }
  return scored.sort((a, b) => a.s - b.s).slice(0, limit).map((x) => x.f)
}
