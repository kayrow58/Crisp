// Usage events from the app, for the Admin dashboard (spec Phase 7 event list).
import type { Config } from '@netlify/functions'
import { HttpError, body, handler, json } from '../lib/http'
import { requireSession } from '../lib/session'
import { recordEvent } from '../lib/events'

export const config: Config = { path: '/api/events' }

const ALLOWED = new Set([
  'app_open',
  'food_logged',
  'entry_edited',
  'entry_deleted',
  'weight_logged',
  'steps_logged',
  'workout_logged',
  'streak_extended',
  'streak_lost',
  'milestone',
  'setting_changed',
])

export default handler(async (req) => {
  if (req.method !== 'POST') throw new HttpError(405, 'method')
  const s = requireSession(req)
  const { events } = await body<{ events: { type: string; details?: Record<string, unknown>; time?: string }[] }>(req)
  const list = (Array.isArray(events) ? events : []).filter((e) => ALLOWED.has(e.type)).slice(0, 50)
  await Promise.all(
    list.map((e) => {
      const t = e.time ? new Date(e.time) : new Date()
      const at = Number.isNaN(t.getTime()) || t.getTime() > Date.now() + 60_000 ? new Date() : t
      return recordEvent(s.uid, e.type, e.details, at)
    }),
  )
  return json({ ok: true, saved: list.length })
})
