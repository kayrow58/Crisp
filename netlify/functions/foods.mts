// Shared custom foods: everyone can see them; only the creator can edit or delete (spec §2, Phase 7).
import type { Config } from '@netlify/functions'
import { HttpError, body, handler, json, randomId, route } from '../lib/http'
import { requireSession } from '../lib/session'
import { getProfile, stores } from '../lib/stores'
import { recordEvent } from '../lib/events'
import type { CustomFood } from '../../shared/types'

export const config: Config = { path: ['/api/foods', '/api/foods/*'] }

function clean(b: Partial<CustomFood>) {
  const num = (v: unknown) => {
    const n = Number(v)
    if (!Number.isFinite(n) || n < 0 || n > 10000) throw new HttpError(400, 'bad_number', 'Please check the numbers.')
    return Math.round(n * 10) / 10
  }
  const name = String(b.name ?? '').trim().slice(0, 80)
  if (!name) throw new HttpError(400, 'need_name', 'Give the food a name.')
  return {
    name,
    serving: String(b.serving ?? '1 serving').trim().slice(0, 40) || '1 serving',
    cal: num(b.cal),
    p: num(b.p),
    c: num(b.c),
    f: num(b.f),
  }
}

export default handler(async (req, url) => {
  const s = requireSession(req)
  const id = route(url, '/api/foods')
  const st = stores.foods()

  if (req.method === 'GET' && !id) {
    const { blobs } = await st.list({ prefix: 'custom/' })
    const foods = await Promise.all(blobs.map((b) => st.get(b.key, { type: 'json' })))
    return json({ foods: foods.filter(Boolean) })
  }

  if (req.method === 'POST' && !id) {
    const profile = await getProfile(s.uid)
    const food: CustomFood = {
      id: randomId(9),
      ...clean(await body<Partial<CustomFood>>(req)),
      createdBy: s.uid,
      createdByName: profile?.firstName ?? 'Someone',
      createdAt: new Date().toISOString(),
    }
    await st.setJSON(`custom/${food.id}`, food)
    await recordEvent(s.uid, 'custom_food_created', { name: food.name })
    return json({ food })
  }

  if (id && (req.method === 'PUT' || req.method === 'DELETE')) {
    const existing = (await st.get(`custom/${id}`, { type: 'json' })) as CustomFood | null
    if (!existing) throw new HttpError(404, 'not_found', 'That food no longer exists.')
    if (existing.createdBy !== s.uid) throw new HttpError(403, 'not_creator', 'Only the person who added this food can change it.')
    if (req.method === 'DELETE') {
      await st.delete(`custom/${id}`)
      return json({ ok: true })
    }
    const food = { ...existing, ...clean(await body<Partial<CustomFood>>(req)) }
    await st.setJSON(`custom/${id}`, food)
    return json({ food })
  }

  throw new HttpError(404, 'not_found')
})
