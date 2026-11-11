// AI food lookup from the app: send the foods Crisp couldn't match (one credit per meal),
// wait for the answer, then "Looks good" saves an item for everyone.
import { api, ApiError } from './api'
import { getState, setCustomFoods } from './store'
import type { AiCandidate, AiFoodResult, CustomFood } from '../../shared/types'

export type AiResult = { results: AiFoodResult[]; note?: string; limit?: { message: string; special: boolean }; jobId: string; left: number }

export class AiLimitError extends Error {
  constructor(
    message: string,
    public special: boolean,
  ) {
    super(message)
  }
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

type Job = { status: string; results: AiFoodResult[]; note?: string; limit?: AiResult['limit']; error?: string }

/**
 * Check on the lookup until it's done. A check that doesn't get through (a signal blip, the phone
 * switching networks, a server hiccup) is retried — only several misses in a row end the lookup.
 */
async function waitForJob(start: { jobId: string; left: number }, signal?: { cancelled: boolean }): Promise<AiResult> {
  const began = Date.now()
  let misses = 0
  while (Date.now() - began < 170_000) {
    await wait(Date.now() - began < 8000 ? 1000 : 1800)
    if (signal?.cancelled) throw new Error('cancelled')
    let job: Job
    try {
      job = await api<Job>(`/api/ai-food/job/${start.jobId}`)
      misses = 0
    } catch (e) {
      const transient = e instanceof ApiError && (e.status === 0 || e.status >= 500)
      if (!transient || ++misses >= 8) throw e
      continue
    }
    if (job.status === 'done') return { results: job.results, note: job.note, limit: job.limit, jobId: start.jobId, left: start.left }
    if (job.status === 'error') throw new Error(job.error ?? "The AI lookup didn't work. Try again.")
  }
  throw new Error('The lookup took too long. Try again.')
}

/** Check these foods: Claude matches them to Crisp's database first; only new ones get a web search. */
export async function aiLookup(foods: { query: string; candidates: AiCandidate[] }[], signal?: { cancelled: boolean }): Promise<AiResult> {
  let start: { jobId: string; left: number }
  try {
    start = await api('/api/ai-food', { body: { foods } })
  } catch (e) {
    if (e instanceof ApiError && e.code === 'ai_limit') {
      const d = e.data as { message?: string; special?: boolean } | undefined
      throw new AiLimitError(d?.message ?? e.message, !!d?.special)
    }
    throw e
  }
  return waitForJob(start, signal)
}

/** AI-first: send the whole meal (as typed/said) plus the closest foods Crisp has. */
export async function aiMealLookup(text: string, pool: AiCandidate[], signal?: { cancelled: boolean }): Promise<AiResult> {
  let start: { jobId: string; left: number }
  try {
    start = await api('/api/ai-food', { body: { text, pool } })
  } catch (e) {
    if (e instanceof ApiError && e.code === 'ai_limit') {
      const d = e.data as { message?: string; special?: boolean } | undefined
      throw new AiLimitError(d?.message ?? e.message, !!d?.special)
    }
    throw e
  }
  return waitForJob(start, signal)
}

export const aiQuota = () => api<{ left: number; daily: number; bonus: number }>('/api/ai-food/quota')

/** "Looks good": save it for everyone and return it as a food. */
export async function confirmAiFood(jobId: string, food: number, index: number): Promise<CustomFood> {
  const res = await api<{ food: CustomFood }>('/api/ai-food/confirm', { body: { jobId, food, index } })
  setCustomFoods([res.food, ...getState().customFoods.filter((f) => f.id !== res.food.id)])
  return res.food
}

export const sourceDomain = (url?: string) => {
  if (!url) return ''
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}
