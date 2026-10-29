// App state + offline-first sync (spec §8, M7).
// Everything is saved on the phone (IndexedDB) first, then pushed to Netlify Blobs.
// Conflicts (two phones, or the Apple Shortcut) are merged with shared/merge.ts.
import { useSyncExternalStore } from 'react'
import { api, ApiError, setSignedOutHandler, token } from './api'
import { idb } from './idb'
import { mergeDay, mergeIndex, mergeList, mergeProfile, mergeTemplates } from '../../shared/merge'
import { addDays, dayKey } from '../../shared/dates'
import {
  emptyDay,
  type CustomFood,
  type DayDoc,
  type DayIndex,
  type FoodTemplate,
  type SavedMeal,
  type ListDoc,
  type Profile,
  type WeightEntry,
} from '../../shared/types'

type Doc = { data: unknown; etag: string | null }

export interface State {
  phase: 'loading' | 'signedOut' | 'ready'
  isAdmin: boolean
  profile: Profile | null
  docs: Record<string, Doc>
  customFoods: CustomFood[]
  online: boolean
  syncing: boolean
  /** bumped after a successful sync that followed being offline (drives the sync animation) */
  syncedAfterOffline: number
  pending: number
}

let state: State = {
  phase: 'loading',
  isAdmin: false,
  profile: null,
  docs: {},
  customFoods: [],
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  syncing: false,
  syncedAfterOffline: 0,
  pending: 0,
}

const listeners = new Set<() => void>()
const dirty = new Set<string>()
const rev = new Map<string, number>()
let wasOffline = false

function set(patch: Partial<State>) {
  state = { ...state, ...patch, pending: dirty.size }
  listeners.forEach((l) => l())
}

export const getState = () => state

export function useStore<T>(sel: (s: State) => T): T {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => sel(state),
  )
}

// ---------- persistence ----------
let persistTimer: ReturnType<typeof setTimeout> | null = null
function persist() {
  if (persistTimer) clearTimeout(persistTimer)
  persistTimer = setTimeout(() => {
    idb.set('state', { profile: state.profile, docs: state.docs, customFoods: state.customFoods, isAdmin: state.isAdmin })
    idb.set('dirty', [...dirty])
  }, 150)
}

// ---------- docs ----------
export function getDoc<T>(key: string): T | undefined {
  return state.docs[key]?.data as T | undefined
}

function markDirty(key: string) {
  dirty.add(key)
  rev.set(key, (rev.get(key) ?? 0) + 1)
}

export function setDoc(key: string, data: unknown) {
  markDirty(key)
  set({ docs: { ...state.docs, [key]: { data, etag: state.docs[key]?.etag ?? null } } })
  persist()
  scheduleFlush()
}

export function today(): string {
  return dayKey(new Date(), state.profile?.timeZone)
}

export function getDay(date: string): DayDoc {
  return getDoc<DayDoc>(`days/${date}`) ?? emptyDay(date)
}

export function useDay(date: string): DayDoc {
  const d = useStore((s) => s.docs[`days/${date}`]?.data as DayDoc | undefined)
  return d ?? emptyDay(date)
}

export function updateDay(date: string, fn: (d: DayDoc) => DayDoc) {
  const next = fn(structuredClone(getDay(date)))
  setDoc(`days/${date}`, next)
  const idx = getDoc<DayIndex>('dayindex') ?? { dates: [] }
  const has = idx.dates.includes(date)
  if (next.foods.length > 0 && !has) setDoc('dayindex', { dates: [...idx.dates, date].sort() })
  if (next.foods.length === 0 && has) setDoc('dayindex', { dates: idx.dates.filter((d) => d !== date) })
}

export function list<T>(key: 'weights' | 'favorites' | 'recents' | 'meals'): ListDoc<T> {
  return getDoc<ListDoc<T>>(key) ?? { items: [], deleted: [] }
}

export function useList<T>(key: 'weights' | 'favorites' | 'recents' | 'meals'): T[] {
  const d = useStore((s) => s.docs[key]?.data as ListDoc<T> | undefined)
  return d?.items ?? EMPTY
}
const EMPTY: never[] = []

export function useDayIndex(): string[] {
  return useStore((s) => (s.docs.dayindex?.data as DayIndex | undefined)?.dates ?? EMPTY)
}

export function updateProfile(patch: Partial<Profile>) {
  if (!state.profile) return
  markDirty('profile')
  set({ profile: { ...state.profile, ...patch } })
  persist()
  scheduleFlush()
}

// Weights (kg). Sorted by date.
export function weights(): WeightEntry[] {
  return [...list<WeightEntry>('weights').items].sort((a, b) => a.date.localeCompare(b.date))
}
export function latestWeightKg(): number | undefined {
  const w = weights()
  return w.length ? w[w.length - 1].kg : state.profile?.startWeightKg
}

// Recents & favorites
export function pushTemplate(key: 'recents' | 'favorites', t: FoodTemplate, cap = 30) {
  const cur = list<FoodTemplate>(key)
  const items = [t, ...cur.items.filter((x) => x.key !== t.key)].slice(0, cap)
  setDoc(key, { items, deleted: cur.deleted.filter((d) => d !== t.key) })
}
export function removeTemplate(key: 'recents' | 'favorites', templateKey: string) {
  const cur = list<FoodTemplate>(key)
  setDoc(key, { items: cur.items.filter((x) => x.key !== templateKey), deleted: [...cur.deleted, templateKey].slice(-200) })
}

// Saved meals
export function saveMeal(m: SavedMeal) {
  const cur = list<SavedMeal>('meals')
  setDoc('meals', { items: [m, ...cur.items.filter((x) => x.key !== m.key)].slice(0, 100), deleted: cur.deleted.filter((d) => d !== m.key) })
}
export function deleteMeal(key: string) {
  const cur = list<SavedMeal>('meals')
  setDoc('meals', { items: cur.items.filter((x) => x.key !== key), deleted: [...cur.deleted, key].slice(-200) })
}

// ---------- merging ----------
function mergeFor(key: string, local: unknown, remote: unknown): unknown {
  if (key.startsWith('days/')) return mergeDay(local as DayDoc, remote as DayDoc | null)
  if (key === 'weights') return mergeList(local as ListDoc<WeightEntry>, remote as ListDoc<WeightEntry> | null)
  if (key === 'favorites') return mergeTemplates(local as ListDoc<FoodTemplate>, remote as ListDoc<FoodTemplate> | null, 50)
  if (key === 'recents') return mergeTemplates(local as ListDoc<FoodTemplate>, remote as ListDoc<FoodTemplate> | null, 30)
  if (key === 'meals') return mergeTemplates(local as never, remote as never, 100)
  if (key === 'dayindex') {
    // Re-check dates we know locally so a date removed here isn't brought back.
    const merged = mergeIndex(local as DayIndex, remote as DayIndex | null)
    const dates = merged.dates.filter((d) => {
      const day = getDoc<DayDoc>(`days/${d}`)
      return !day || day.foods.length > 0
    })
    return { dates }
  }
  return local
}

// ---------- sync ----------
let flushTimer: ReturnType<typeof setTimeout> | null = null
let flushing = false

export function scheduleFlush(delay = 400) {
  if (flushTimer) clearTimeout(flushTimer)
  flushTimer = setTimeout(() => void flush(), delay)
}

async function putDoc(key: string): Promise<boolean> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const myRev = rev.get(key)
    if (key === 'profile') {
      const p = state.profile
      if (!p) return true
      const res = await api<{ data: Profile }>('/api/sync', { method: 'PUT', body: { key, data: p, etag: null } })
      if (rev.get(key) === myRev) set({ profile: res.data })
      return rev.get(key) === myRev
    }
    const doc = state.docs[key]
    if (!doc) return true
    try {
      const res = await api<{ etag: string | null }>('/api/sync', { method: 'PUT', body: { key, data: doc.data, etag: doc.etag } })
      set({ docs: { ...state.docs, [key]: { data: state.docs[key].data, etag: res.etag } } })
      return rev.get(key) === myRev
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        const remote = e.data as { data: unknown; etag: string | null }
        const merged = mergeFor(key, state.docs[key].data, remote.data)
        set({ docs: { ...state.docs, [key]: { data: merged, etag: remote.etag } } })
        continue
      }
      throw e
    }
  }
  return false
}

export async function flush(): Promise<void> {
  if (flushing || !token.get() || state.phase !== 'ready') return
  if (!navigator.onLine) {
    wasOffline = true
    set({ online: false })
    return
  }
  if (dirty.size === 0 && eventQueue.length === 0) return
  flushing = true
  set({ syncing: true })
  let failed = false
  try {
    for (const key of [...dirty]) {
      try {
        const clean = await putDoc(key)
        if (clean) dirty.delete(key)
      } catch (e) {
        failed = true
        if (e instanceof ApiError && e.status === 0) break
      }
    }
    await flushEvents()
  } finally {
    flushing = false
    persist()
    const recovered = wasOffline && !failed && dirty.size === 0
    if (recovered) wasOffline = false
    set({ syncing: false, online: navigator.onLine, syncedAfterOffline: recovered ? Date.now() : state.syncedAfterOffline })
    if (failed) setTimeout(() => void flush(), 15_000)
    else if (dirty.size) scheduleFlush()
  }
}

let lastPull = 0
export async function pull(days?: string[]): Promise<void> {
  if (!token.get() || !navigator.onLine) return
  const q = days?.length ? `?days=${days.join(',')}` : ''
  const res = await api<{ profile?: Profile; docs: Record<string, Doc> }>(`/api/sync${q}`)
  const docs = { ...state.docs }
  for (const [key, remote] of Object.entries(res.docs)) {
    if (remote.data == null) continue
    if (dirty.has(key) && docs[key]) {
      docs[key] = { data: mergeFor(key, docs[key].data, remote.data), etag: remote.etag }
    } else {
      docs[key] = remote
    }
  }
  const profile = res.profile ? (dirty.has('profile') && state.profile ? mergeProfile(state.profile, res.profile) : res.profile) : state.profile
  if (!days) lastPull = Date.now()
  set({ docs, profile })
  persist()
}

export async function ensureDay(date: string) {
  if (state.docs[`days/${date}`] || !navigator.onLine) return
  try {
    await pull([date])
  } catch {
    /* offline: show what we have */
  }
}

export async function loadCustomFoods() {
  try {
    const res = await api<{ foods: CustomFood[] }>('/api/foods')
    set({ customFoods: res.foods })
    persist()
  } catch {
    /* keep cached */
  }
}

export function setCustomFoods(foods: CustomFood[]) {
  set({ customFoods: foods })
  persist()
}

// ---------- events (usage tracking for Admin) ----------
let eventQueue: { type: string; details?: Record<string, unknown>; time: string }[] = []

export function track(type: string, details?: Record<string, unknown>) {
  eventQueue.push({ type, details, time: new Date().toISOString() })
  idb.set('events', eventQueue)
  scheduleFlush(1500)
}

async function flushEvents() {
  if (!eventQueue.length) return
  const batch = eventQueue.slice(0, 50)
  try {
    await api('/api/events', { body: { events: batch } })
  } catch {
    return // try again next sync; usage events must never get in the way
  }
  eventQueue = eventQueue.slice(batch.length)
  if (eventQueue.length > 500) eventQueue = eventQueue.slice(-500)
  idb.set('events', eventQueue)
}

// ---------- session ----------
export interface AuthResult {
  token: string
  profile: Profile
  isAdmin: boolean
}

export async function signedIn(r: AuthResult) {
  token.set(r.token)
  set({ phase: 'ready', profile: r.profile, isAdmin: r.isAdmin })
  persist()
  await Promise.allSettled([pull(), loadCustomFoods()])
}

export async function signOut() {
  token.set(null)
  dirty.clear()
  eventQueue = []
  await idb.clear()
  set({ phase: 'signedOut', profile: null, docs: {}, isAdmin: false, customFoods: [] })
}

setSignedOutHandler(() => void signOut())

export async function boot() {
  window.addEventListener('online', () => {
    set({ online: true })
    void flush()
  })
  window.addEventListener('offline', () => {
    wasOffline = true
    set({ online: false })
  })
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && Date.now() - lastPull > 30_000) void refresh()
  })

  if (!token.get()) {
    set({ phase: 'signedOut' })
    return
  }
  const saved = await idb.get<{ profile: Profile; docs: Record<string, Doc>; customFoods: CustomFood[]; isAdmin: boolean }>('state')
  const savedDirty = (await idb.get<string[]>('dirty')) ?? []
  eventQueue = (await idb.get<typeof eventQueue>('events')) ?? []
  savedDirty.forEach(markDirty)
  if (saved?.profile) {
    set({ phase: 'ready', profile: saved.profile, docs: saved.docs ?? {}, customFoods: saved.customFoods ?? [], isAdmin: !!saved.isAdmin })
  }
  if (!navigator.onLine) {
    wasOffline = true
    set({ online: false, phase: saved?.profile ? 'ready' : 'signedOut' })
    return
  }
  try {
    const me = await api<{ profile: Profile; isAdmin: boolean }>('/api/auth/me')
    const profile = dirty.has('profile') && saved?.profile ? mergeProfile(saved.profile, me.profile) : me.profile
    set({ phase: 'ready', profile, isAdmin: me.isAdmin })
    await Promise.allSettled([pull(), loadCustomFoods()])
    void flush()
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) return // handler signed us out
    if (!saved?.profile) set({ phase: 'signedOut' })
  }
}

export async function refresh() {
  await Promise.allSettled([flush(), pull(), loadCustomFoods()])
}

/** Recent day keys (oldest first) ending today. */
export function lastNDays(n: number): string[] {
  const t = today()
  return Array.from({ length: n }, (_, i) => addDays(t, i - n + 1))
}
