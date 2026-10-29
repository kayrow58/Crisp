// Logging food: add, edit, move, copy, delete (with Undo), favorites, streak bump (spec §3.4, §5).
import type { FoodEntry, FoodTemplate, Meal } from '../../shared/types'
import { streak } from '../../shared/calc'
import { getDay, getDoc, getState, list, pushTemplate, removeTemplate, today, track, updateDay, updateProfile } from './store'
import { newId } from './format'
import { mealLabel } from './meals'
import { toast } from './ui'

export type LogMethod = 'search' | 'recent' | 'favorite' | 'quick' | 'custom' | 'typed'

const templateKey = (e: Pick<FoodEntry, 'foodId' | 'name' | 'unit'>) => `${e.foodId}|${e.foodId === 'q' ? e.name : ''}|${e.unit}`

export function toTemplate(e: FoodEntry): FoodTemplate {
  return { key: templateKey(e), foodId: e.foodId, name: e.name, qty: e.qty, unit: e.unit, cal: e.cal, p: e.p, c: e.c, f: e.f, at: new Date().toISOString() }
}

function afterFirstFoodOfDay(date: string) {
  if (date !== today()) return
  const dates = (getDoc<{ dates: string[] }>('dayindex')?.dates ?? []).concat(date)
  const s = streak(dates, date)
  const p = getState().profile
  if (p && s.current > (p.bestStreak ?? 0)) updateProfile({ bestStreak: s.current })
  track('streak_extended', { streak: s.current })
  window.dispatchEvent(new CustomEvent('crisp:flare'))
}

export function addEntry(date: string, e: Omit<FoodEntry, 'id' | 'at'>, method: LogMethod, opts: { silent?: boolean } = {}) {
  const entry: FoodEntry = { ...e, id: newId(), at: new Date().toISOString(), cal: round1(e.cal), p: round1(e.p), c: round1(e.c), f: round1(e.f) }
  const wasEmpty = getDay(date).foods.length === 0
  updateDay(date, (d) => ({ ...d, foods: [...d.foods, entry] }))
  pushTemplate('recents', toTemplate(entry))
  track('food_logged', { method, meal: e.meal })
  if (wasEmpty) afterFirstFoodOfDay(date)
  if (!opts.silent) toast(`Added to ${mealLabel(e.meal)}`, { undo: () => removeEntry(date, entry.id, false) })
  return entry
}

const round1 = (n: number) => Math.round(n * 10) / 10

export function logTemplate(date: string, t: FoodTemplate, meal: Meal, method: LogMethod) {
  addEntry(date, { foodId: t.foodId, name: t.name, meal, qty: t.qty, unit: t.unit, cal: t.cal, p: t.p, c: t.c, f: t.f }, method)
}

function removeEntry(date: string, id: string, markDeleted = true) {
  updateDay(date, (d) => ({ ...d, foods: d.foods.filter((f) => f.id !== id), deleted: markDeleted ? [...d.deleted, id] : [...d.deleted, id] }))
}

export function deleteEntry(date: string, id: string) {
  const entry = getDay(date).foods.find((f) => f.id === id)
  if (!entry) return
  removeEntry(date, id)
  track('entry_deleted')
  toast(`Deleted ${entry.name.split(',')[0]}`, {
    undo: () => {
      const copy = { ...entry, id: newId() }
      updateDay(date, (d) => ({ ...d, foods: [...d.foods, copy].sort((a, b) => a.at.localeCompare(b.at)) }))
    },
  })
}

export function updateEntry(date: string, id: string, patch: Partial<FoodEntry>) {
  updateDay(date, (d) => ({ ...d, foods: d.foods.map((f) => (f.id === id ? { ...f, ...patch } : f)) }))
  track('entry_edited')
}

export function moveEntry(date: string, id: string, meal: Meal) {
  updateEntry(date, id, { meal })
  toast(`Moved to ${mealLabel(meal)}`)
}

export function copyToToday(e: FoodEntry) {
  const { id: _id, at: _at, ...rest } = e
  addEntry(today(), rest, 'recent', { silent: true })
  toast(`Copied to today's ${mealLabel(e.meal)}`)
}

export function isFavorite(e: Pick<FoodEntry, 'foodId' | 'name' | 'unit'>) {
  return list<FoodTemplate>('favorites').items.some((t) => t.key === templateKey(e))
}

export function toggleFavorite(e: FoodEntry) {
  const key = templateKey(e)
  if (isFavorite(e)) {
    removeTemplate('favorites', key)
    toast(`Removed from favorites`, { undo: () => pushTemplate('favorites', toTemplate(e), 50) })
  } else {
    pushTemplate('favorites', toTemplate(e), 50)
    toast('Added to favorites')
  }
}
