// Meals: Breakfast · Lunch · Dinner · (extra meals) · Snacks.
// Extra meals live on the profile so they sync to every phone.
import type { ExtraMeal, Meal, Profile } from '../../shared/types'
import { CORE_MEAL_LABEL, newId } from './format'
import { getState, updateProfile, useStore } from './store'

export const MAX_EXTRA_MEALS = 3

export interface MealInfo {
  id: Meal
  label: string
  extra: boolean
}

export function mealsFor(p: Profile | null | undefined): MealInfo[] {
  const extras = p?.extraMeals ?? []
  return [
    { id: 'breakfast', label: 'Breakfast', extra: false },
    { id: 'lunch', label: 'Lunch', extra: false },
    { id: 'dinner', label: 'Dinner', extra: false },
    ...extras.map((m) => ({ id: m.id, label: m.name, extra: true })),
    { id: 'snacks', label: 'Snacks', extra: false },
  ]
}

export function useMeals(): MealInfo[] {
  const p = useStore((s) => s.profile)
  return mealsFor(p)
}

export function mealLabel(id: Meal): string {
  return CORE_MEAL_LABEL[id] ?? getState().profile?.extraMeals?.find((m) => m.id === id)?.name ?? 'Snacks'
}

/** Foods logged to a meal that was later removed show up under Snacks. */
export function displayMeal(id: Meal, p: Profile | null | undefined): Meal {
  if (CORE_MEAL_LABEL[id]) return id
  return p?.extraMeals?.some((m) => m.id === id) ? id : 'snacks'
}

export function addExtraMeal(): ExtraMeal | null {
  const p = getState().profile
  const extras = p?.extraMeals ?? []
  if (!p || extras.length >= MAX_EXTRA_MEALS) return null
  const meal = { id: `meal-${newId().slice(0, 6)}`, name: `Meal ${extras.length + 4}` }
  updateProfile({ extraMeals: [...extras, meal] })
  return meal
}

export function renameExtraMeal(id: string, name: string) {
  const p = getState().profile
  if (!p) return
  updateProfile({ extraMeals: (p.extraMeals ?? []).map((m) => (m.id === id ? { ...m, name: name.trim().slice(0, 24) || m.name } : m)) })
}

export function removeExtraMeal(id: string) {
  const p = getState().profile
  if (!p) return
  updateProfile({ extraMeals: (p.extraMeals ?? []).filter((m) => m.id !== id) })
}
