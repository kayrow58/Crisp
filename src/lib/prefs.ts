// Phone-only preferences (spec §8): theme, bars/rings, graph style, eaten↔left.
import { useSyncExternalStore } from 'react'

export type Theme = 'dark' | 'light' | 'system'
export interface Prefs {
  theme: Theme
  macroDisplay: 'bars' | 'rings'
  graph: 'line' | 'bar'
  statMode: 'eaten' | 'left'
  notifCardDismissed: boolean
  lostCardFor: string
  /** Apple Fitness sync time chosen in Crisp (HH:MM, 24h) and setup progress on this phone */
  syncTime: string
  shortcutAdded: boolean
  shortcutConnected: boolean
  /** the 'stop the microphone asking' tip was seen */
  micTipDone: boolean
}

const DEFAULTS: Prefs = {
  theme: 'dark',
  macroDisplay: 'bars',
  graph: 'line',
  statMode: 'eaten',
  notifCardDismissed: false,
  lostCardFor: '',
  syncTime: '21:00',
  shortcutAdded: false,
  shortcutConnected: false,
  micTipDone: false,
}

const KEY = 'crisp.prefs'
let prefs: Prefs = load()
const listeners = new Set<() => void>()

function load(): Prefs {
  try {
    const p = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }
    p.theme = (localStorage.getItem('crisp.theme') as Theme) || p.theme
    return p
  } catch {
    return { ...DEFAULTS }
  }
}

export function setPref<K extends keyof Prefs>(k: K, v: Prefs[K]) {
  prefs = { ...prefs, [k]: v }
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs))
    if (k === 'theme') localStorage.setItem('crisp.theme', v as string)
  } catch {
    /* ignore */
  }
  if (k === 'theme') applyTheme()
  listeners.forEach((l) => l())
}

export const getPrefs = () => prefs

export function usePrefs(): Prefs {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => prefs,
  )
}

export function applyTheme() {
  const t = prefs.theme === 'system' ? (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark') : prefs.theme
  document.documentElement.setAttribute('data-theme', t)
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t === 'light' ? '#F2F2F7' : '#000000')
}

try {
  matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => prefs.theme === 'system' && applyTheme())
} catch {
  /* old browsers */
}
