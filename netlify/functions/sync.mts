// Load and save a person's own data. Conditional writes stop two phones overwriting each other (spec §8).
import type { Config } from '@netlify/functions'
import { HttpError, body, handler, json, route } from '../lib/http'
import { requireSession } from '../lib/session'
import { conditionalSet, getProfile, getWithEtag, saveProfile, stores } from '../lib/stores'
import { mergeProfile } from '../../shared/merge'
import { addDays, dayKey } from '../../shared/dates'
import type { Profile } from '../../shared/types'

export const config: Config = { path: ['/api/sync', '/api/sync/*'] }

const DOC_KEY = /^(weights|favorites|recents|dayindex|days\/\d{4}-\d{2}-\d{2})$/

export default handler(async (req, url) => {
  const s = requireSession(req)
  const r = route(url, '/api/sync')
  const ud = stores.userdata()

  if (req.method === 'GET' && r === '') {
    const profile = await getProfile(s.uid)
    if (!profile) throw new HttpError(401, 'signed_out', 'Please sign in again.')
    const today = dayKey(new Date(), profile.timeZone)
    const requested = url.searchParams.get('days')
    const days = requested
      ? requested.split(',').filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).slice(0, 60)
      : Array.from({ length: 14 }, (_, i) => addDays(today, -i))
    const keys = [...(requested ? [] : ['weights', 'favorites', 'recents', 'dayindex']), ...days.map((d) => `days/${d}`)]
    const docs: Record<string, { data: unknown; etag: string | null }> = {}
    await Promise.all(
      keys.map(async (k) => {
        docs[k] = await getWithEtag(ud, `${s.uid}/${k}`)
      }),
    )
    return json({ profile, docs })
  }

  if (req.method === 'PUT' && r === '') {
    const b = await body<{ key: string; data: unknown; etag: string | null }>(req)
    if (b.key === 'profile') {
      const remote = await getProfile(s.uid)
      const merged = mergeProfile(b.data as Profile, remote)
      await saveProfile(merged)
      return json({ data: merged, etag: null })
    }
    if (!DOC_KEY.test(b.key)) throw new HttpError(400, 'bad_key', 'Unknown document.')
    if (JSON.stringify(b.data).length > 512_000) throw new HttpError(413, 'too_big', 'That is too much data to save at once.')
    const key = `${s.uid}/${b.key}`
    const current = await getWithEtag(ud, key)
    if (current.etag && current.etag !== b.etag) {
      return json({ conflict: true, data: current.data, etag: current.etag }, 409)
    }
    const res = await conditionalSet(ud, key, b.data, current.data !== null, current.etag)
    if (!res.modified) {
      const now = await getWithEtag(ud, key)
      return json({ conflict: true, data: now.data, etag: now.etag }, 409)
    }
    return json({ ok: true, etag: res.etag ?? null })
  }

  throw new HttpError(404, 'not_found')
})
