// Background half of the food lookup ("Type or say it"):
//   1. Claude checks the closest foods already in Crisp's database (no web search, no credit).
//   2. Only foods that truly aren't there get a web search — one credit for the whole meal.
// Runs up to 15 minutes; the app polls /api/ai-food/job/<id> for the result.
import type { Config } from '@netlify/functions'
import { stores, getProfile } from '../lib/stores'
import { askClaude, matchWithDatabase, privateMessage, refundCredit, spendCredit, understandMeal } from '../lib/ai'
import type { AiFoodResult, AiJob } from '../../shared/types'

export const config: Config = { path: '/api/ai-food-run', background: true }

export default async (req: Request) => {
  const { jobId, runToken } = (await req.json().catch(() => ({}))) as { jobId?: string; runToken?: string }
  const ai = stores.ai()
  const job = (await ai.get(`job/${jobId}`, { type: 'json' })) as (AiJob & { runToken?: string }) | null
  if (!job || job.status !== 'pending' || !runToken || job.runToken !== runToken) return
  const profile = await getProfile(job.uid)
  if (!profile) return
  let paidWith: AiJob['paidWith']
  try {
    let results: AiFoodResult[]
    let searches: string[]
    if (job.text != null) {
      // AI-first: Claude reads the whole meal, carries the restaurant across it, and matches the database.
      const foods = await understandMeal(job.text, job.pool ?? [])
      job.queries = foods.map((f) => f.said)
      results = foods.map((f) => ({ query: f.said, items: [], matchId: f.matchId ?? undefined, unitIndex: f.unitIndex, qty: f.qty }))
      searches = foods.map((f) => f.search)
    } else {
      const candidates = job.candidates ?? job.queries.map(() => [])
      const matches = candidates.some((c) => c.length) ? await matchWithDatabase(job.queries, candidates) : job.queries.map(() => null)
      results = job.queries.map((query, i) => ({ query, items: [], matchId: matches[i] ?? undefined }))
      searches = job.queries
    }
    const missing = results.map((r, i) => (r.matchId ? -1 : i)).filter((i) => i >= 0)
    let note: string | undefined
    let limit: AiJob['limit']
    // 2. Web search only for what's left (one credit for all of them).
    if (missing.length) {
      paidWith = (await spendCredit(profile)) ?? undefined
      if (!paidWith) {
        const special = await privateMessage(profile.id)
        limit = {
          message: special || "You've used today's web lookups — they reset tomorrow. Foods already in Crisp still work.",
          special: !!special,
        }
        for (const i of missing) results[i].limited = true
      } else {
        const web = await askClaude(missing.map((i) => searches[i]))
        note = web.note
        missing.forEach((i, k) => (results[i].items = web.foods[k]?.items ?? []))
        if (!missing.some((i) => results[i].items.length)) {
          await refundCredit(profile, paidWith) // nothing found: don't charge
          paidWith = undefined
        }
      }
    }
    await ai.setJSON(`job/${job.id}`, { ...job, runToken: undefined, status: 'done', results, note, limit, paidWith })
  } catch (e) {
    console.error('ai-food-run', e)
    if (paidWith) await refundCredit(profile, paidWith)
    await ai.setJSON(`job/${job.id}`, { ...job, runToken: undefined, status: 'error', paidWith: undefined, error: "The lookup didn't work just now. No credit was used — try again." })
  }
}
