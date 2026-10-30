// AI food lookup (spec addition, Oct 29): search the web for a food Crisp doesn't have.
//   POST /api/ai-food            { foods: [{ query, candidates }] } → starts one lookup for a meal, returns { jobId, left }
//        Claude checks the database candidates first; only foods not there get a web search (1 credit per meal).
//   GET  /api/ai-food/job/<id>   → { status, results: [{ query, matchId?, items, limited? }], note, limit }
//   POST /api/ai-food/confirm    { jobId, food, index } → "Looks good": saves that item to the shared foods
//   GET  /api/ai-food/quota      → { left, daily, bonus }
// Nothing is saved for everyone until the person taps "Looks good".
import type { Config } from '@netlify/functions'
import { HttpError, body, handler, json, randomId, route } from '../lib/http'
import { requireSession } from '../lib/session'
import { getProfile, stores } from '../lib/stores'
import { recordEvent } from '../lib/events'
import { quota, refundCredit, spendCheck } from '../lib/ai'
import { env } from '../lib/http'
import type { AiCandidate, AiJob, CustomFood } from '../../shared/types'

export const config: Config = { path: ['/api/ai-food', '/api/ai-food/*'] }

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

export default handler(async (req, url) => {
  const s = requireSession(req)
  const r = route(url, '/api/ai-food')
  const profile = await getProfile(s.uid)
  if (!profile) throw new HttpError(401, 'signed_out', 'Please sign in again.')
  const ai = stores.ai()

  if (r === 'quota' && req.method === 'GET') return json(await quota(profile))

  if (r === '' && req.method === 'POST') {
    if (!env('ANTHROPIC_API_KEY')) throw new HttpError(503, 'ai_not_setup', "AI lookup isn't switched on yet.")
    const b = await body<{ foods?: { query?: string; candidates?: AiCandidate[] }[]; text?: string; pool?: AiCandidate[] }>(req)
    const cleanCand = (c: AiCandidate): AiCandidate => ({
      id: String(c.id).slice(0, 60),
      name: String(c.name).slice(0, 120),
      serving: String(c.serving ?? '').slice(0, 60),
      cal: Number(c.cal) || 0,
      units: Array.isArray(c.units) ? c.units.slice(0, 8).map((u) => String(u).slice(0, 60)) : undefined,
    })
    // AI-first: the whole meal as typed/said, plus the closest foods Crisp has.
    if (typeof b.text === 'string') {
      const text = b.text.trim().slice(0, 600)
      if (text.length < 2) throw new HttpError(400, 'need_query', 'Tell Crisp what you ate.')
      if (!(await spendCheck(profile))) throw new HttpError(429, 'too_many', "That's a lot of lookups today — try again tomorrow.")
      const job: AiJob & { runToken: string } = {
        id: randomId(12),
        uid: s.uid,
        text,
        queries: [],
        pool: (Array.isArray(b.pool) ? b.pool : []).slice(0, 70).map(cleanCand),
        status: 'pending',
        createdAt: new Date().toISOString(),
        runToken: randomId(16),
      }
      await ai.setJSON(`job/${job.id}`, job)
      await fetch(new URL('/api/ai-food-run', url.origin), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jobId: job.id, runToken: job.runToken }) })
      await recordEvent(s.uid, 'ai_lookup', { meal: true })
      return json({ jobId: job.id, left: (await quota(profile)).left })
    }
    const foods = (Array.isArray(b.foods) ? b.foods : [])
      .map((f) => ({
        query: String(f?.query ?? '').trim().slice(0, 160),
        candidates: (Array.isArray(f?.candidates) ? f.candidates : []).slice(0, 8).map((c) => ({
          id: String(c.id).slice(0, 60),
          name: String(c.name).slice(0, 120),
          serving: String(c.serving ?? '').slice(0, 60),
          cal: Number(c.cal) || 0,
        })),
      }))
      .filter((f) => f.query.length >= 2)
      .slice(0, 10)
    if (!foods.length) throw new HttpError(400, 'need_query', 'Type the food you want to look up.')
    if (!(await spendCheck(profile))) throw new HttpError(429, 'too_many', "That's a lot of lookups today — try again tomorrow.")
    const job: AiJob & { runToken: string } = {
      id: randomId(12),
      uid: s.uid,
      queries: foods.map((f) => f.query),
      candidates: foods.map((f) => f.candidates),
      status: 'pending',
      createdAt: new Date().toISOString(),
      runToken: randomId(16),
    }
    await ai.setJSON(`job/${job.id}`, job)
    // Hand off to the background function (web search can take longer than a normal request allows).
    await fetch(new URL('/api/ai-food-run', url.origin), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jobId: job.id, runToken: job.runToken }) })
    await recordEvent(s.uid, 'ai_lookup', { foods: foods.length })
    return json({ jobId: job.id, left: (await quota(profile)).left })
  }

  if (r.startsWith('job/') && req.method === 'GET') {
    const job = (await ai.get(`job/${r.slice(4)}`, { type: 'json' })) as AiJob | null
    if (!job || job.uid !== s.uid) throw new HttpError(404, 'not_found', 'That lookup was not found.')
    if (job.status === 'pending' && Date.now() - Date.parse(job.createdAt) > 150_000) {
      const error = 'The lookup took too long. Your credit was not used — try again.'
      await ai.setJSON(`job/${job.id}`, { ...job, status: 'error', error })
      if (job.paidWith) await refundCredit(profile, job.paidWith)
      return json({ status: 'error', error })
    }
    return json({ status: job.status, results: job.results ?? [], note: job.note, limit: job.limit, error: job.error })
  }

  if (r === 'confirm' && req.method === 'POST') {
    const { jobId, food: fi, index } = await body<{ jobId: string; food: number; index: number }>(req)
    const job = (await ai.get(`job/${jobId}`, { type: 'json' })) as AiJob | null
    const item = job?.uid === s.uid ? job.results?.[Number(fi) || 0]?.items[Number(index) || 0] : undefined
    if (!job || !item) throw new HttpError(404, 'not_found', 'That lookup was not found.')
    const foods = stores.foods()
    // Already in the shared list (someone confirmed the same thing)? Use that one.
    const { blobs } = await foods.list({ prefix: 'custom/' })
    const all = (await Promise.all(blobs.map((b) => foods.get(b.key, { type: 'json' }) as Promise<CustomFood | null>))).filter((f): f is CustomFood => !!f)
    const key = norm(`${item.brand ?? ''} ${item.name} ${item.serving}`)
    const same = all.find((f) => f.source === 'ai' && norm(`${f.brand ?? ''} ${f.name} ${f.serving}`) === key && Math.abs(f.cal - item.cal) < 2)
    if (same) return json({ food: same })
    const food: CustomFood = {
      id: randomId(9),
      name: item.name,
      brand: item.brand,
      serving: item.servingGrams ? `${item.serving} (${Math.round(item.servingGrams)} g)`.slice(0, 40) : item.serving,
      cal: item.cal,
      p: item.p,
      c: item.c,
      f: item.f,
      createdBy: s.uid,
      createdByName: profile.firstName,
      createdAt: new Date().toISOString(),
      source: 'ai',
      sourceUrl: item.sourceUrl,
      estimate: item.estimate,
    }
    await foods.setJSON(`custom/${food.id}`, food)
    await ai.setJSON(`job/${job.id}`, { ...job, confirmed: [...(job.confirmed ?? []), food.id] })
    await recordEvent(s.uid, 'ai_food_confirmed', { estimate: item.estimate })
    return json({ food })
  }

  throw new HttpError(404, 'not_found')
})
