// The running list in the Log sheet: add several foods, then post them to the meal in one go.
// Each open Log sheet has its own list (a saved meal can be edited from inside another Log sheet);
// foods always go to the top-most one.
import { useSyncExternalStore } from 'react'
import type { LibFood } from './foods'
import type { FoodEntry } from '../../shared/types'

export type TrayItem = Omit<FoodEntry, 'id' | 'at' | 'meal'> & { key: number; food?: LibFood }

const trays = new Map<number, TrayItem[]>()
const stack: number[] = []
let next = 1
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())
const EMPTY: TrayItem[] = []

export const newTrayId = () => next++

/** A Log sheet opened: start (or resume) its list and send new foods to it. */
export function openTray(id: number) {
  if (!trays.has(id)) trays.set(id, [])
  if (!stack.includes(id)) stack.push(id)
  emit()
}
export function closeTray(id: number) {
  trays.delete(id)
  const i = stack.lastIndexOf(id)
  if (i >= 0) stack.splice(i, 1)
  emit()
}
export const trayActive = () => stack.length > 0
const top = () => stack[stack.length - 1]

export function addToTray(item: Omit<TrayItem, 'key'>) {
  const id = top()
  if (id == null) return
  trays.set(id, [...(trays.get(id) ?? []), { ...item, key: next++ }])
  emit()
}
export function removeFromTray(id: number, key: number) {
  trays.set(id, (trays.get(id) ?? []).filter((i) => i.key !== key))
  emit()
}
export function clearTray(id: number) {
  trays.set(id, [])
  emit()
}
export function useTray(id: number): TrayItem[] {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => trays.get(id) ?? EMPTY,
  )
}
export const trayTotals = (list: TrayItem[]) =>
  list.reduce((a, i) => ({ cal: a.cal + i.cal, p: a.p + i.p, c: a.c + i.c, f: a.f + i.f }), { cal: 0, p: 0, c: 0, f: 0 })
