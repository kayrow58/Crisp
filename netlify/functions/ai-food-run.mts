// Background half of the AI food lookup: asks Claude (with web search) and stores the answer
// on the job. Runs up to 15 minutes; the app polls /api/ai-food/job/<id> for the result.
import type { Config } from '@netlify/functions'
import { stores, getProfile } from '../lib/stores'
import { askClaude, refundCredit } from '../lib/ai'
import type { AiJob } from '../../shared/types'

export const config: Config = { path: '/api/ai-food-run', background: true }

export default async (req: Request) => {
  const { jobId, runToken } = (await req.json().catch(() => ({}))) as { jobId?: string; runToken?: string }
  const ai = stores.ai()
  const job = (await ai.get(`job/${jobId}`, { type: 'json' })) as (AiJob & { runToken?: string }) | null
  if (!job || job.status !== 'pending' || !runToken || job.runToken !== runToken) return
  try {
    const { foods, note } = await askClaude(job.queries)
    await ai.setJSON(`job/${job.id}`, { ...job, runToken: undefined, status: 'done', results: foods, note })
    if (!foods.some((f) => f.items.length)) {
      const p = await getProfile(job.uid)
      if (p) await refundCredit(p, job.paidWith) // nothing found: don't charge a credit
    }
  } catch (e) {
    console.error('ai-food-run', e)
    await ai.setJSON(`job/${job.id}`, { ...job, runToken: undefined, status: 'error', error: "The AI lookup didn't work just now. Your credit was not used — try again." })
    const p = await getProfile(job.uid)
    if (p) await refundCredit(p, job.paidWith)
  }
}
