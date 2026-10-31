// AI food lookup: daily credits, bonus credits, and the Claude call itself.
import { HttpError, env } from './http'
import { stores } from './stores'
import { dayKey } from '../../shared/dates'
import type { AiCandidate, AiFoodItem, AiFoodResult, Profile } from '../../shared/types'

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

/** Web search for foods that aren't in the database. About one search per food (fewer when they share a restaurant). */
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
            max_uses: Math.min(4, queries.length),
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
      estimate: !!it.estimate,
      sourceUrl: url,
      sourceTitle: it.sourceTitle ? String(it.sourceTitle).slice(0, 80) : undefined,
    })
    if (items.length === 3) break
  }
  return items
}

/** Pull the JSON answer out of Claude's reply: one result per food asked, in order. */
export function parseAnswer(text: string, queries?: string[]): { foods: AiFoodResult[]; note?: string } {
  const fenced = [...text.matchAll(/```json\s*([\s\S]*?)```/g)].pop()?.[1]
  const raw = fenced ?? text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)
  let parsed: { foods?: { query?: string; items?: Partial<AiFoodItem>[] }[]; items?: Partial<AiFoodItem>[]; note?: string }
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error('Could not read the AI answer')
  }
  const got = parsed.foods ?? (parsed.items ? [{ query: queries?.[0], items: parsed.items }] : [])
  const foods = queries
    ? queries.map((q, i) => ({ query: q, items: cleanItems(got[i]?.items) }))
    : got.slice(0, 12).map((g) => ({ query: String(g.query ?? '').trim().slice(0, 120) || 'Food', items: cleanItems(g.items) })).filter((f) => f.query)
  return { foods, note: parsed.note ? String(parsed.note).slice(0, 240) : undefined }
}

// ---------- step 2: does Crisp's database already have it? (no web search, ~0.05¢) ----------
const MATCH_SYSTEM = `You match foods a person ate to foods already in a calorie app's database.
For each numbered food you get a list of candidates (id · name · serving · calories).
Pick the candidate that is the SAME food: same item, and the same restaurant/brand if one was named.
Different amounts or sizes of the same item are fine (the app adjusts the amount) — but a restaurant item
must match that restaurant, and a specific product must match that product. If none is the same food, answer null.
Reply with ONLY JSON: {"matches":["<id or null>", ...]} — one entry per food, in order.`

export async function matchWithDatabase(queries: string[], candidates: AiCandidate[][]): Promise<(string | null)[]> {
  const key = env('ANTHROPIC_API_KEY')
  if (!key) throw new HttpError(503, 'ai_not_setup', 'AI lookup is not set up yet (missing ANTHROPIC_API_KEY).')
  const list = queries
    .map((q, i) => {
      const c = candidates[i] ?? []
      return `${i + 1}. "${q}"\n${c.length ? c.map((x) => `   - ${x.id} · ${x.name} · ${x.serving} · ${Math.round(x.cal)} cal`).join('\n') : '   (no candidates)'}`
    })
    .join('\n')
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 45_000)
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    signal: ctrl.signal,
    headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: AI_MODEL, max_tokens: 400, system: MATCH_SYSTEM, messages: [{ role: 'user', content: list }] }),
  }).finally(() => clearTimeout(timer))
  if (!res.ok) throw new Error(`anthropic ${res.status}: ${(await res.text()).slice(0, 300)}`)
  const data = (await res.json()) as { content: Block[] }
  return parseMatches(
    data.content.map((b) => b.text ?? '').join(''),
    candidates,
  )
}

/** Read {"matches":[...]} and only accept ids that were actually offered for that food. */
export function parseMatches(text: string, candidates: AiCandidate[][]): (string | null)[] {
  let ids: unknown[] = []
  try {
    const raw = text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)
    ids = (JSON.parse(raw) as { matches?: unknown[] }).matches ?? []
  } catch {
    /* treat as no matches */
  }
  return candidates.map((c, i) => {
    const id = ids[i]
    return typeof id === 'string' && c.some((x) => x.id === id) ? id : null
  })
}

// Soft cap on database checks per day (they're nearly free, this just stops runaway use).
export const DAILY_DB_CHECKS = 150
export async function spendCheck(p: Profile): Promise<boolean> {
  const st = stores.ai()
  const k = `checks/${p.id}/${today(p)}`
  const n = Number((await st.get(k, { type: 'text' })) ?? 0) || 0
  if (n >= DAILY_DB_CHECKS) return false
  await st.set(k, String(n + 1))
  return true
}

// ---------- AI-first: read the whole meal (no web search, ~0.1¢) ----------
const MEAL_SYSTEM = `You log meals for a US calorie-tracking app. The person typed or said what they ate, in one go.
1. Split it into the separate foods they ate. Keep each food's amount/size/count.
2. Restaurant context carries over: "grilled Chick-fil-A sandwich and waffle fries" means BOTH are from Chick-fil-A.
   Same for "from/at <place>" anywhere in the message.
3. For each food, look at the DATABASE list and pick the entry that is the SAME food — same item, and the same
   restaurant/brand if there is one. A restaurant item must only match that restaurant's entry (never a generic one).
   Generic foods ("2 eggs", "a banana", "1 cup rice") should match generic entries.
   If it matches, set "unit" to the index of the best unit in that entry's unit list and "qty" to how many of that unit
   (e.g. "2 eggs" with unit "1 large" → qty 2; "60 g cheese" with unit "g" → qty 60; "half an avocado" → qty 0.5 of "1 fruit").
4. If nothing in the database is the same food, set "match": null and write "search": a precise web search name
   including restaurant/brand and size (e.g. "Chick-fil-A medium waffle potato fries").
Reply with ONLY JSON:
{"foods":[{"said":"<the food as they said it>","match":"<database id or null>","unit":0,"qty":1,"search":"<only when match is null>"}]}`

export interface MealFood {
  said: string
  matchId: string | null
  unitIndex: number
  qty: number
  search: string
}

export async function understandMeal(text: string, pool: AiCandidate[]): Promise<MealFood[]> {
  const key = env('ANTHROPIC_API_KEY')
  if (!key) throw new HttpError(503, 'ai_not_setup', 'AI lookup is not set up yet (missing ANTHROPIC_API_KEY).')
  const db = pool.length
    ? pool.map((c) => `- ${c.id} · ${c.name} · units: ${(c.units?.length ? c.units : [c.serving]).map((u, i) => `[${i}] ${u}`).join(', ')}`).join('\n')
    : '(empty)'
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 60_000)
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    signal: ctrl.signal,
    headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: AI_MODEL,
      max_tokens: 1200,
      system: MEAL_SYSTEM,
      messages: [{ role: 'user', content: `What they ate: ${text}\n\nDATABASE:\n${db}` }],
    }),
  }).finally(() => clearTimeout(timer))
  if (!res.ok) throw new Error(`anthropic ${res.status}: ${(await res.text()).slice(0, 300)}`)
  const data = (await res.json()) as { content: Block[] }
  return parseMeal(data.content.map((b) => b.text ?? '').join(''), pool)
}

/** Read Claude's meal breakdown; only accept database ids/units that were actually offered. */
export function parseMeal(text: string, pool: AiCandidate[]): MealFood[] {
  let foods: { said?: unknown; match?: unknown; unit?: unknown; qty?: unknown; search?: unknown }[] = []
  try {
    const fenced = [...text.matchAll(/```json\s*([\s\S]*?)```/g)].pop()?.[1]
    const raw = fenced ?? text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)
    foods = (JSON.parse(raw) as { foods?: typeof foods }).foods ?? []
  } catch {
    throw new Error('Could not read the AI answer')
  }
  const out: MealFood[] = []
  for (const f of foods.slice(0, 12)) {
    const said = String(f.said ?? '').trim().slice(0, 120)
    if (!said) continue
    const cand = typeof f.match === 'string' ? pool.find((c) => c.id === f.match) : undefined
    const unitCount = cand ? Math.max(1, cand.units?.length ?? 1) : 1
    const unit = Math.round(Number(f.unit))
    const qty = Number(f.qty)
    out.push({
      said,
      matchId: cand ? cand.id : null,
      unitIndex: cand && unit >= 0 && unit < unitCount ? unit : 0,
      qty: Number.isFinite(qty) && qty > 0 && qty < 2000 ? Math.round(qty * 100) / 100 : 1,
      search: String(f.search ?? '').trim().slice(0, 160) || said,
    })
  }
  return out
}

// ---------- Web-only mode: the whole meal in one lookup (builds the database) ----------
const WEB_MEAL_SYSTEM = `You log meals for a US calorie-tracking app. The person typed or said everything they ate, in one go.
1. Split it into the separate foods they ate, keeping each one's amount/size/count.
2. Restaurant context carries over: "grilled Chick-fil-A sandwich and waffle fries" means BOTH are from Chick-fil-A. Same for "from/at <place>".
3. Restaurant and brand items: use web search to find the official nutrition (the restaurant's or brand's own page or label first).
   Use as FEW searches as possible — ONE search per restaurant/brand usually covers every item from there.
4. Plain, generic foods (eggs, banana, white rice, chicken breast, milk, bread…): do NOT search. Use standard USDA values you know,
   leave "sourceUrl" empty and set "estimate": false.
5. No published nutrition (a local restaurant, homemade dish): best realistic estimate for a typical US portion, "estimate": true.
6. Each food's numbers are for exactly the amount they said (e.g. "2 eggs" → serving "2 large eggs"; "medium fries" → serving "medium").
   Calories in kcal, protein/carbs/fat in grams, whole numbers. If several versions are likely, up to 3 options, most likely first.
Finish with ONLY this JSON in a \`\`\`json code block:
{"foods":[{"query":"<the food as they said it>","items":[{"name":"","brand":"","serving":"","servingGrams":null,"cal":0,"p":0,"c":0,"f":0,"estimate":false,"sourceUrl":"","sourceTitle":""}]}],"note":""}
"note" is one short sentence for the person (e.g. which sizes you assumed).`

export async function askClaudeMeal(text: string): Promise<{ foods: AiFoodResult[]; note?: string }> {
  const key = env('ANTHROPIC_API_KEY')
  if (!key) throw new HttpError(503, 'ai_not_setup', 'AI lookup is not set up yet (missing ANTHROPIC_API_KEY).')
  const messages: { role: 'user' | 'assistant'; content: unknown }[] = [{ role: 'user', content: `What they ate: ${text}` }]
  let out = ''
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
        system: WEB_MEAL_SYSTEM,
        messages,
        tools: [{ type: 'web_search_20260318', name: 'web_search', max_uses: 3, allowed_callers: ['direct'], user_location: { type: 'approximate', country: 'US' } }],
      }),
    }).finally(() => clearTimeout(timer))
    if (!res.ok) throw new Error(`anthropic ${res.status}: ${(await res.text()).slice(0, 300)}`)
    const data = (await res.json()) as { content: Block[]; stop_reason: string }
    out += data.content.filter((b) => b.type === 'text').map((b) => b.text ?? '').join('')
    if (data.stop_reason !== 'pause_turn') break
    messages.push({ role: 'assistant', content: data.content })
  }
  return parseAnswer(out)
}

// ---------- which mode the AI runs in (Admin switch) ----------
export type AiMode = 'web' | 'database'
export async function aiMode(): Promise<AiMode> {
  const s = (await stores.app().get('settings', { type: 'json' }).catch(() => null)) as { aiMode?: AiMode } | null
  return s?.aiMode === 'database' ? 'database' : 'web' // web-only by default while the database fills up
}
