// Store-brand search (USDA Branded Foods + Open Food Facts, through /api/brands).
// Brand foods become normal LibFoods so the portion sheet, "Type what you ate" and editing all work the same.
import { useEffect, useState } from 'react'
import { api } from './api'
import type { LibFood } from './foods'
import type { BrandFood } from '../../shared/types'

const memo = new Map<string, Promise<LibFood[]>>()
const SAVED_KEY = 'crisp.brandFoods'

export function brandToLib(b: BrandFood): LibFood {
  const brand = b.brand && !b.name.toLowerCase().startsWith(b.brand.toLowerCase()) ? `${b.brand} ` : ''
  return { id: b.id, name: `${brand}${b.name}`.trim(), per100: b.per100, units: b.units, featured: false, brand: b }
}

export function searchBrands(query: string): Promise<LibFood[]> {
  const q = query.toLowerCase().replace(/\s+/g, ' ').trim()
  if (q.length < 3) return Promise.resolve([])
  if (!memo.has(q)) {
    const p = api<{ foods: BrandFood[] }>(`/api/brands?q=${encodeURIComponent(q)}`).then((r) => r.foods.map(brandToLib))
    p.catch(() => memo.delete(q))
    memo.set(q, p)
  }
  return memo.get(q)!
}

/** Debounced brand search for a search box. */
export function useBrandSearch(query: string, delay = 450) {
  const [state, setState] = useState<{ q: string; foods: LibFood[]; loading: boolean; error: boolean }>({ q: '', foods: [], loading: false, error: false })
  useEffect(() => {
    const q = query.trim()
    if (q.length < 3) {
      setState({ q, foods: [], loading: false, error: false })
      return
    }
    setState((s) => ({ ...s, q, loading: true, error: false }))
    let live = true
    const t = setTimeout(() => {
      searchBrands(q).then(
        (foods) => live && setState({ q, foods, loading: false, error: false }),
        () => live && setState({ q, foods: [], loading: false, error: true }),
      )
    }, delay)
    return () => {
      live = false
      clearTimeout(t)
    }
  }, [query, delay])
  return state
}

// Brand foods someone logged are kept on this phone so the entry can be edited later (even offline).
export function rememberBrand(f: LibFood) {
  if (!f.brand) return
  try {
    const saved = JSON.parse(localStorage.getItem(SAVED_KEY) ?? '{}') as Record<string, BrandFood>
    saved[f.id] = f.brand
    const keys = Object.keys(saved)
    if (keys.length > 300) for (const k of keys.slice(0, keys.length - 300)) delete saved[k]
    localStorage.setItem(SAVED_KEY, JSON.stringify(saved))
  } catch {
    /* storage unavailable */
  }
}

export function savedBrand(id: string): LibFood | undefined {
  try {
    const b = (JSON.parse(localStorage.getItem(SAVED_KEY) ?? '{}') as Record<string, BrandFood>)[id]
    return b ? brandToLib(b) : undefined
  } catch {
    return undefined
  }
}

// ---------- does a typed food name a brand? ----------
const vocab = new WeakMap<LibFood[], Set<string>>()

/** True when the text has a word the built-in library has never seen (often a brand: "fairlife", "chobani"). */
export function hasUnknownWord(all: LibFood[], query: string): boolean {
  let v = vocab.get(all)
  if (!v) {
    v = new Set()
    for (const f of all) for (const w of f.name.toLowerCase().split(/[^a-z0-9]+/)) if (w.length > 2) v.add(w)
    vocab.set(all, v)
  }
  return query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .some((w) => w.length > 3 && !v!.has(w) && !v!.has(w.replace(/s$/, '')) && !v!.has(w.replace(/es$/, '')))
}

/** All typed words appear in the brand + name. */
export function coversQuery(f: LibFood, query: string): boolean {
  const hay = f.name.toLowerCase()
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 1)
    .every((w) => hay.includes(w.replace(/s$/, '')))
}
