// Merging two copies of the same document (e.g. two phones, or a phone and the Apple Shortcut).
import type { DayDoc, DayIndex, FoodTemplate, ListDoc, Profile } from './types'

function mergeById<T extends { id: string }>(a: T[], b: T[], deleted: Set<string>): T[] {
  const map = new Map<string, T>()
  for (const x of [...b, ...a]) if (!deleted.has(x.id)) map.set(x.id, x)
  return [...map.values()]
}

export function mergeDay(local: DayDoc, remote: DayDoc | null): DayDoc {
  if (!remote) return local
  const deleted = new Set([...(local.deleted ?? []), ...(remote.deleted ?? [])])
  // Shortcut workouts always come from the server copy.
  const localManual = local.workouts.filter((w) => w.source !== 'shortcut')
  // Latest change wins (locking when someone edits synced exercise, or unlocking "use Apple Fitness again").
  const lock = !local.fitnessLock ? remote.fitnessLock : !remote.fitnessLock ? local.fitnessLock : local.fitnessLock.at >= remote.fitnessLock.at ? local.fitnessLock : remote.fitnessLock
  // Synced workouts come from the server copy — unless the person edited this day's exercise.
  const remoteShortcut = lock?.exercise ? local.workouts.filter((w) => w.source === 'shortcut' && !deleted.has(w.id)) : remote.workouts.filter((w) => w.source === 'shortcut' && !deleted.has(w.id))
  const remoteManual = remote.workouts.filter((w) => w.source !== 'shortcut')
  const steps =
    !local.steps ? remote.steps : !remote.steps ? local.steps : local.steps.updatedAt >= remote.steps.updatedAt ? local.steps : remote.steps
  return {
    date: local.date,
    foods: mergeById(local.foods, remote.foods, deleted).sort((x, y) => x.at.localeCompare(y.at)),
    workouts: [...remoteShortcut, ...mergeById(localManual, remoteManual, deleted)],
    steps,
    deleted: [...deleted].slice(-500),
    ...(lock ? { fitnessLock: lock } : {}),
  }
}

export function mergeList<T extends { id: string }>(local: ListDoc<T>, remote: ListDoc<T> | null): ListDoc<T> {
  if (!remote) return local
  const deleted = new Set([...(local.deleted ?? []), ...(remote.deleted ?? [])])
  return { items: mergeById(local.items, remote.items, deleted), deleted: [...deleted].slice(-500) }
}

export function mergeTemplates(
  local: ListDoc<FoodTemplate>,
  remote: ListDoc<FoodTemplate> | null,
  cap: number,
): ListDoc<FoodTemplate> {
  if (!remote) return local
  const deleted = new Set([...(local.deleted ?? []), ...(remote.deleted ?? [])])
  const map = new Map<string, FoodTemplate>()
  for (const t of [...remote.items, ...local.items]) {
    if (deleted.has(t.key)) continue
    const prev = map.get(t.key)
    if (!prev || prev.at < t.at) map.set(t.key, t)
  }
  const items = [...map.values()].sort((a, b) => b.at.localeCompare(a.at)).slice(0, cap)
  return { items, deleted: [...deleted].slice(-200) }
}

export function mergeIndex(local: DayIndex, remote: DayIndex | null, removed: string[] = []): DayIndex {
  if (!remote) return local
  const set = new Set([...remote.dates, ...local.dates])
  for (const r of removed) set.delete(r)
  return { dates: [...set].sort() }
}

/** Fields only the server sets. */
const SERVER_FIELDS = ['id', 'email', 'createdAt', 'fitnessCode', 'fitnessLastSync'] as const

export function mergeProfile(local: Profile, remote: Profile | null): Profile {
  if (!remote) return local
  const out: Profile = { ...remote, ...local }
  for (const k of SERVER_FIELDS) (out as unknown as Record<string, unknown>)[k] = remote[k]
  out.bestStreak = Math.max(local.bestStreak ?? 0, remote.bestStreak ?? 0)
  out.milestonesHit = [...new Set([...(remote.milestonesHit ?? []), ...(local.milestonesHit ?? [])])]
  return out
}
