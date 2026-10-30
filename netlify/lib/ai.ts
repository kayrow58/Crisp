// AI food lookup: daily credits, bonus credits, and the Claude call itself.
import { HttpError, env } from './http'
import { stores } from './stores'
import { dayKey } from '../../shared/dates'
import type { AiFoodItem, AiFoodResult, Profile } from '../../shared/types'

export const DAILY_AI_LOOKUPS = 10
export const AI_MODEL = 'claude-haiku-5-5'

const today = (p: Profile) => dayKey(new Date(), p.timeZone)

export async function quota(p: Profile) {
  const st = stores.ai()
  const used = Number((await st.get(`usage/${p.id}/${today(p)}`, { type: 'text' })) ?? 0) || 0
  const bonus = Number((await st.get(`bonus/${p.id}`, { type: 'text' })) ?? 0) || 0
  return { used, bonus, daily: DAILY_AI_LOOKUPS, left: Math.max(0, DAILY_AI_LOOKUPS - used) + bonus }
}

/** Use one credit (daily first, then bonus). Returns which was used, or null when out. */
export async function spendCredit(p: Profile): Promise<'daily' | 'bonus' | null> {
  const st = stores.ai()
  const q = await quota(p)
  if (q.used < DAILY_AI_LOOKUPS) {
    await st.set(`usage/${p.id}/${today(p)}`, String(q.used + 1))
    return 'daily'
  }
  if (q.bonus > 0) {
    await st.set(`bonus/${p.id}`, String(q.bonus - 1))
    return 'bonus'
  }
  return null
}

export async function refundCredit(p: Profile, paidWith: 'daily' | 'bonus') {
  const st = stores.ai()
  const q = await quota(p)
  if (paidWith === 'daily') await st.set(`usage/${p.id}/${today(p)}`, String(Math.max(0, q.used - 1)))
  else await st.set(`bonus/${p.id}`, String(q.bonus + 1))
}

export async function addBonus(uid: string, n: number) {
  const st = stores.ai()
  const cur = Number((await st.get(`bonus/${uid}`, { type: 'text' })) ?? 0) || 0
  const next = Math.max(0, Math.min(500, cur + n))
  await st.set(`bonus/${uid}`, String(next))
  return next
}

export const privateMessage = async (uid: string) => ((await stores.ai().get(`message/${uid}`, { type: 'text' })) ?? '').trim()

// ---------- Claude ----------
const SYSTEM = `You look up nutrition facts for foods people ate, for a US calorie-tracking app.
You get a numbered list of foods (often from one restaurant meal). For EACH one, use web search to find the official numbers:
the restaurant's or brand's own nutrition page or label first, then reputable databases. One search can often cover several items from the same place.
Rules:
- Match the exact item, size and restaurant/brand the person named. If they gave a size (small/medium/large, 12 oz, 6-inch) or a count ("2 tacos"), the serving must be exactly that.
- If several versions are likely (sizes, with/without sauce), return up to 3 options for that food, most likely first.
- If no published nutrition exists (a local restaurant, homemade dish), give your best realistic estimate for a typical US portion and set "estimate": true.
- Numbers are for the serving described in "serving". Calories in kcal, protein/carbs/fat in grams. Whole numbers.
- Include the page you used in "sourceUrl" (omit it for estimates with no source).
Finish with ONLY this JSON in a \`\`\`json code block, one entry per food in the same order:
{"foods":[{"query":"<the food as given>","items":[{"name":"","brand":"","serving":"","servingGrams":null,"cal":0,"p":0,"c":0,"f":0,"estimate":false,"sourceUrl":"","sourceTitle":""}]}],"note":""}
"note" is one short sentence for the person (e.g. which sizes you assumed). Use "items":[] for a food you can't identify.`

interface Block {
  type: string
  text?: string
}

export async function askClaude(queries: string[]): Promise<{ foods: AiFoodResult[]; note?: string }> {
  const key = env('ANTHROPIC_API_KEY')
  if (!key) throw new HttpError(503, 'ai_not_setup', 'AI lookup is not set up yet (missing ANTHROPIC_API_KEY).')
  const list = queries.map((q, i) => `${i + 1}. ${q}`).join('\n')
  const messages: { role: 'user' | 'assistant'; content: unknown }[] = [{ role: 'user', content: `Foods:\n${list}` }]
  let text = ''
  for (let turn = 0; turn < 5; turn++) {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 120_000)
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: AI_MODEL,
        max_tokens: 3000,
        system: SYSTEM,
        messages,
        tools: [
          {
            type: 'web_search_20260318',
            name: 'web_search',
            max_uses: Math.min(8, 2 + queries.length * 2),
            allowed_callers: ['direct'],
            user_location: { type: 'approximate', country: 'US' },
          },
        ],
      }),
    }).finally(() => clearTimeout(timer))
    if (!res.ok) throw new Error(`anthropic ${res.status}: ${(await res.text()).slice(0, 300)}`)
    const data = (await res.json()) as { content: Block[]; stop_reason: string }
    text += data.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text ?? '')
      .join('')
    if (data.stop_reason !== 'pause_turn') break
    messages.push({ role: 'assistant', content: data.content }) // long search: let it continue
  }
  return parseAnswer(text, queries)
}

const num = (v: unknown) => {
  const x = Number(v)
  return Number.isFinite(x) && x >= 0 && x < 5000 ? Math.round(x * 10) / 10 : NaN
}

function cleanItems(list: Partial<AiFoodItem>[] | undefined): AiFoodItem[] {
  const items: AiFoodItem[] = []
  for (const it of list ?? []) {
    const cal = num(it.cal)
    if (!it.name || Number.isNaN(cal)) continue
    const url = typeof it.sourceUrl === 'string' && /^https?:\/\//.test(it.sourceUrl) ? it.sourceUrl.slice(0, 300) : undefined
    items.push({
      name: String(it.name).slice(0, 80),
      brand: it.brand ? String(it.brand).slice(0, 60) : undefined,
      serving: String(it.serving || '1 serving').slice(0, 40),
      servingGrams: Number.isFinite(Number(it.servingGrams)) && Number(it.servingGrams) > 0 ? Number(it.servingGrams) : null,
      cal,
      p: num(it.p) || 0,
      c: num(it.c) || 0,
      f: num(it.f) || 0,
      estimate: !!it.estimate || !url,
      sourceUrl: url,
      sourceTitle: it.sourceTitle ? String(it.sourceTitle).slice(0, 80) : undefined,
    })
    if (items.length === 3) break
  }
  return items
}

/** Pull the JSON answer out of Claude's reply: one result per food asked, in order. */
export function parseAnswer(text: string, queries: string[]): { foods: AiFoodResult[]; note?: string } {
  const fenced = [...text.matchAll(/```json\s*([\s\S]*?)```/g)].pop()?.[1]
  const raw = fenced ?? text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)
  let parsed: { foods?: { query?: string; items?: Partial<AiFoodItem>[] }[]; items?: Partial<AiFoodItem>[]; note?: string }
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error('Could not read the AI answer')
  }
  const got = parsed.foods ?? (parsed.items ? [{ query: queries[0], items: parsed.items }] : [])
  const foods = queries.map((q, i) => ({ query: q, items: cleanItems(got[i]?.items) }))
  return { foods, note: parsed.note ? String(parsed.note).slice(0, 240) : undefined }
}
