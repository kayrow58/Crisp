// Netlify Blobs stores used by Crisp (spec §8).
import { getStore } from '@netlify/blobs'
import type { Profile } from '../../shared/types'

const store = (name: string) => getStore({ name, consistency: 'strong' })

export const stores = {
  /** key: uid → Profile */
  profiles: () => store('profiles'),
  /** key: `${uid}/weights`, `${uid}/favorites`, `${uid}/recents`, `${uid}/dayindex`, `${uid}/days/${date}` */
  userdata: () => store('userdata'),
  /** key: `custom/${id}` → CustomFood */
  foods: () => store('foods'),
  /** key: `cred/${credentialId}`, `challenge/${id}`, `user/${uid}` */
  passkeys: () => store('passkeys'),
  /** key: uid → PushSubscription JSON[] */
  push: () => store('push'),
  /** key: `${YYYY-MM}/${time}-${rand}` → event */
  events: () => store('events'),
  /** key: 'settings' → { inviteCode, lastPurgePrompt } */
  app: () => store('app'),
  /** key: fitness code → uid */
  fitnesscodes: () => store('fitnesscodes'),
  /** key: `q/${query}` → { at, foods: BrandFood[] } (store-brand search cache) */
  brands: () => store('brands'),
}

export async function getProfile(uid: string): Promise<Profile | null> {
  return (await stores.profiles().get(uid, { type: 'json' })) as Profile | null
}

export async function saveProfile(p: Profile): Promise<void> {
  await stores.profiles().setJSON(p.id, p)
}

/** Read a JSON blob plus its etag. */
export async function getWithEtag<T>(
  s: ReturnType<typeof store>,
  key: string,
): Promise<{ data: T | null; etag: string | null }> {
  const r = await s.getWithMetadata(key, { type: 'json' })
  if (!r) return { data: null, etag: null }
  return { data: r.data as T, etag: r.etag ?? null }
}

/**
 * Read–modify–write with a conditional write, retrying if another request changed it first.
 * Used anywhere two devices (or the Shortcut and a phone) could write the same blob.
 */
export async function update<T>(
  s: ReturnType<typeof store>,
  key: string,
  fn: (current: T | null) => T,
  attempts = 5,
): Promise<{ data: T; etag: string | null }> {
  for (let i = 0; i < attempts; i++) {
    const { data, etag } = await getWithEtag<T>(s, key)
    const next = fn(data)
    const res = await conditionalSet(s, key, next, data !== null, etag)
    if (res.modified) return { data: next, etag: res.etag ?? null }
  }
  throw new Error(`Could not update ${key} after ${attempts} tries`)
}

/**
 * Write only if nobody changed the blob since we read it.
 * If the blob exists but no etag came back (e.g. the local test server), write normally.
 */
export function conditionalSet(s: ReturnType<typeof store>, key: string, value: unknown, exists: boolean, etag: string | null) {
  if (etag) return s.setJSON(key, value, { onlyIfMatch: etag })
  if (!exists) return s.setJSON(key, value, { onlyIfNew: true })
  return s.setJSON(key, value)
}

export async function listAll(s: ReturnType<typeof store>, prefix?: string): Promise<string[]> {
  const out: string[] = []
  const res = await s.list({ prefix })
  for (const b of res.blobs) out.push(b.key)
  return out
}
