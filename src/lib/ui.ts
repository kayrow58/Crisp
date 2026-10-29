// UI-level state: pushed screens, bottom sheets, alerts, toasts.
import { useSyncExternalStore, type ReactNode } from 'react'

interface Layer {
  id: number
  node: ReactNode
}
interface Alert {
  id: number
  title: string
  message?: string
  confirm: string
  cancel?: string
  destructive?: boolean
  requireText?: string
  resolve: (ok: boolean) => void
}
export interface Toast {
  id: number
  text: string
  undo?: () => void
  tone?: 'ok' | 'error'
}

interface UiState {
  screens: Layer[]
  sheets: Layer[]
  overlay: Layer | null
  alert: Alert | null
  toast: Toast | null
  tab: 'home' | 'fitness' | 'weight' | 'settings'
  /** date shown on Home (YYYY-MM-DD) or null for today */
  homeDate: string | null
}

let ui: UiState = { screens: [], sheets: [], overlay: null, alert: null, toast: null, tab: 'home', homeDate: null }
const subs = new Set<() => void>()
let nextId = 1
const set = (p: Partial<UiState>) => {
  ui = { ...ui, ...p }
  subs.forEach((s) => s())
}

export function useUi<T>(sel: (s: UiState) => T): T {
  return useSyncExternalStore(
    (cb) => {
      subs.add(cb)
      return () => subs.delete(cb)
    },
    () => sel(ui),
  )
}

export const setTab = (tab: UiState['tab']) => set({ tab, screens: [] })
export const setHomeDate = (homeDate: string | null) => set({ homeDate })
export const getUi = () => ui

export function pushScreen(node: ReactNode) {
  set({ screens: [...ui.screens, { id: nextId++, node }] })
}
export function popScreen() {
  set({ screens: ui.screens.slice(0, -1) })
}
export function openSheet(node: ReactNode) {
  set({ sheets: [...ui.sheets, { id: nextId++, node }] })
}
export function closeSheet() {
  set({ sheets: ui.sheets.slice(0, -1) })
}
export function closeAllSheets() {
  set({ sheets: [] })
}
export function showOverlay(node: ReactNode | null) {
  set({ overlay: node ? { id: nextId++, node } : null })
}

export function confirm(opts: Omit<Alert, 'id' | 'resolve'>): Promise<boolean> {
  return new Promise((resolve) => set({ alert: { ...opts, id: nextId++, resolve } }))
}
export function answerAlert(ok: boolean) {
  ui.alert?.resolve(ok)
  set({ alert: null })
}

let toastTimer: ReturnType<typeof setTimeout> | null = null
export function toast(text: string, opts: { undo?: () => void; tone?: 'ok' | 'error' } = {}) {
  if (toastTimer) clearTimeout(toastTimer)
  set({ toast: { id: nextId++, text, ...opts } })
  toastTimer = setTimeout(() => set({ toast: null }), 4000)
}
export const hideToast = () => set({ toast: null })
