import { CM_PER_IN, kgToLb, lbToKg } from '../../shared/calc'
import type { Meal, Units } from '../../shared/types'

export const MEALS: Meal[] = ['breakfast', 'lunch', 'dinner', 'snacks']
export const MEAL_LABEL: Record<Meal, string> = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snacks: 'Snacks' }

/** Number with thousands separators. `fixed` keeps trailing zeros (e.g. 182.0). */
export const fmt = (n: number, digits = 0, fixed = false) =>
  n.toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: fixed ? digits : 0 })
export const r0 = (n: number) => Math.round(n)

export const weightUnit = (u: Units) => (u === 'metric' ? 'kg' : 'lb')
export const toDisplayWeight = (kg: number, u: Units) => (u === 'metric' ? kg : kgToLb(kg))
export const fromDisplayWeight = (v: number, u: Units) => (u === 'metric' ? v : lbToKg(v))
export const showWeight = (kg: number, u: Units, digits = 1) => `${fmt(toDisplayWeight(kg, u), digits, true)} ${weightUnit(u)}`

export function showHeight(cm: number, u: Units) {
  if (u === 'metric') return `${Math.round(cm)} cm`
  const inches = Math.round(cm / CM_PER_IN)
  return `${Math.floor(inches / 12)}′${inches % 12}″`
}

export function newId(): string {
  const a = new Uint8Array(9)
  crypto.getRandomValues(a)
  return Array.from(a, (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 14)
}

export function dayLabel(key: string, today: string): string {
  if (key === today) return 'Today'
  const [y, m, d] = key.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  const diff = Math.round((new Date(today + 'T00:00').getTime() - dt.getTime()) / 86400_000)
  if (diff === 1) return 'Yesterday'
  return dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

export function shortDate(key: string): string {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function timeAgo(iso: string): string {
  const s = (Date.now() - new Date(iso).getTime()) / 1000
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)} min ago`
  if (s < 86400) return `${Math.floor(s / 3600)} hr ago`
  const d = Math.floor(s / 86400)
  return d === 1 ? 'yesterday' : `${d} days ago`
}

export const prefersReducedMotion = () => {
  try {
    return matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}
