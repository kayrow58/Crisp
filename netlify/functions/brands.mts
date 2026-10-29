// Store-brand foods: searches USDA FoodData Central "Branded Foods" (nutrition labels sent in by
// manufacturers, ~450k US products) and Open Food Facts as a backup. The USDA key stays on the server.
// Results are cached in Blobs for 14 days so repeat searches are instant and use no API calls.
import type { Config } from '@netlify/functions'
import { HttpError, env, handler, json } from '../lib/http'
import { requireSession } from '../lib/session'
import { stores } from '../lib/stores'
import type { BrandFood } from '../../shared/types'

export const config: Config = { path: '/api/brands' }

const CACHE_DAYS = 14
const r1 = (n: number) => Math.round(n * 10) / 10

function titleCase(s: string) {
  return s
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/(^|[\s(/-])([a-z])/g, (_, a, b) => a + b.toUpperCase())
}

/** "1 ONZ" → "1 oz", "2/3 CUP" → "2/3 cup", "" → "1 serving" */
function servingLabel(text: string | undefined): string {
  let t = (text ?? '').toLowerCase().replace(/\s+/g, ' ').trim()
  t = t.replace(/\bonz\b/g, 'oz').replace(/\bgrm\b/g, 'g').replace(/\bmlt\b/g, 'ml').replace(/\bpiece\b/g, 'piece')
  if (!t || /^none|^n\/a/.test(t)) return '1 serving'
  if (!/^[\d.½¼¾⅓⅔/]/.test(t)) t = `1 ${t}`
  return t.slice(0, 40)
}

function units(gramsPerServing: number | undefined, household: string | undefined) {
  const out: BrandFood['units'] = []
  if (gramsPerServing && gramsPerServing > 0) out.push({ label: servingLabel(household), grams: r1(gramsPerServing) })
  out.push({ label: 'g', grams: 1 }, { label: 'oz', grams: 28.35 })
  return out
}

// ---------- USDA FoodData Central ----------
interface FdcNutrient {
  nutrientId?: number
  nutrientNumber?: string
  value?: number
  amount?: number
  nutrient?: { id?: number; number?: string }
}
interface FdcFood {
  fdcId: number
  description?: string
  brandOwner?: string
  brandName?: string
  gtinUpc?: string
  servingSize?: number
  servingSizeUnit?: string
  householdServingFullText?: string
  foodNutrients?: FdcNutrient[]
}

function fdcValue(list: FdcNutrient[], ids: number[], numbers: string[]): number | undefined {
  for (const n of list) {
    const id = n.nutrientId ?? n.nutrient?.id
    const num = n.nutrientNumber ?? n.nutrient?.number
    if ((id != null && ids.includes(id)) || (num != null && numbers.includes(num))) {
      const v = n.value ?? n.amount
      if (typeof v === 'number' && Number.isFinite(v)) return v
    }
  }
  return undefined
}

async function searchFdc(q: string, signal: AbortSignal): Promise<BrandFood[]> {
  const key = env('FDC_API_KEY') || 'DEMO_KEY'
  const url = `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${encodeURIComponent(key)}&query=${encodeURIComponent(q)}&dataType=Branded&pageSize=40`
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`fdc ${res.status}`)
  const data = (await res.json()) as { foods?: FdcFood[] }
  const out: BrandFood[] = []
  for (const f of data.foods ?? []) {
    const n = f.foodNutrients ?? []
    // Branded values are per 100 g (or 100 ml), worked out from the label.
    const cal = fdcValue(n, [1008, 2047, 2048], ['208', '957', '958'])
    if (cal == null) continue
    const unit = (f.servingSizeUnit ?? '').toLowerCase()
    const grams = unit === 'g' || unit === 'grm' || unit === 'ml' || unit === 'mlt' ? f.servingSize : undefined
    out.push({
      id: `b:fdc:${f.fdcId}`,
      name: titleCase(f.description ?? 'Food'),
      brand: titleCase(f.brandName || f.brandOwner || ''),
      per100: {
        cal: r1(cal),
        p: r1(fdcValue(n, [1003], ['203']) ?? 0),
        c: r1(fdcValue(n, [1005], ['205']) ?? 0),
        f: r1(fdcValue(n, [1004], ['204']) ?? 0),
      },
      units: units(grams, f.householdServingFullText),
      upc: f.gtinUpc,
    })
  }
  return out
}

// ---------- Open Food Facts (no key; backup) ----------
interface OffProduct {
  code?: string
  product_name?: string
  brands?: string
  serving_size?: string
  serving_quantity?: number | string
  nutriments?: Record<string, number | string | undefined>
}

async function searchOff(q: string, signal: AbortSignal): Promise<BrandFood[]> {
  const url =
    'https://world.openfoodfacts.org/cgi/search.pl?search_simple=1&action=process&json=1&page_size=25' +
    '&fields=code,product_name,brands,serving_size,serving_quantity,nutriments' +
    '&tagtype_0=countries&tag_contains_0=contains&tag_0=united-states' +
    `&search_terms=${encodeURIComponent(q)}`
  const res = await fetch(url, { signal, headers: { 'user-agent': 'Crisp/1.0 (personal macro tracker; netlify)' } })
  if (!res.ok) throw new Error(`off ${res.status}`)
  const data = (await res.json()) as { products?: OffProduct[] }
  const num = (v: unknown) => (v == null || v === '' ? undefined : Number(v))
  const out: BrandFood[] = []
  for (const p of data.products ?? []) {
    const nm = p.nutriments ?? {}
    const cal = num(nm['energy-kcal_100g']) ?? (num(nm['energy_100g']) != null ? num(nm['energy_100g'])! / 4.184 : undefined)
    if (!p.product_name || cal == null || !Number.isFinite(cal)) continue
    const grams = num(p.serving_quantity)
    const household = (p.serving_size ?? '').replace(/\s*\(.*\)\s*/, '').trim()
    out.push({
      id: `b:off:${p.code}`,
      name: titleCase(p.product_name),
      brand: titleCase((p.brands ?? '').split(',')[0] ?? ''),
      per100: { cal: r1(cal), p: r1(num(nm.proteins_100g) ?? 0), c: r1(num(nm.carbohydrates_100g) ?? 0), f: r1(num(nm.fat_100g) ?? 0) },
      units: units(grams && Number.isFinite(grams) ? grams : undefined, household),
      upc: p.code,
    })
  }
  return out
}

function dedupe(list: BrandFood[]): BrandFood[] {
  const seen = new Set<string>()
  return list.filter((f) => {
    const k = `${f.brand}|${f.name}|${Math.round(f.per100.cal)}`.toLowerCase()
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

// Household-name US grocery brands rank first (USDA's list includes thousands of small/regional labels).
const BIG_US_BRANDS = new Set(
  `365 by whole foods|a.1.|activia|alexia|almond breeze|amy's|annie's|applegate|aquafina|arnold|athenos|banza|barilla|belgioioso|ben & jerry's|ben's original|bertolli|best foods|betty crocker|birds eye|bisquick|blue bell|blue diamond|boar's head|bob's red mill|bodyarmor|bolthouse farms|borden|boursin|breakstone's|breyers|bubly|bumble bee|bush's|butterball|cabot|califia|campbell's|carolina|celsius|cheetos|cheez-it|chi-chi's|chicken of the sea|chips ahoy|chiquita|chobani|clif|coca-cola|coffee mate|coffee-mate|country crock|crisco|cuties|daisy|dannon|danone|darigold|dasani|dave's killer bread|de cecco|dean's|del monte|digiorno|dole|domino|doritos|driscoll's|duke's|duncan hines|dunkin|earth balance|eggland's best|eggo|fage|fairlife|florida's natural|folgers|foster farms|frank's redhot|french's|friendly farms|fritos|galbani|gatorade|general mills|ghirardelli|gold medal|goldfish|good & gather|good culture|goya|great value|green giant|guerrero|h-e-b|haagen-dazs|halo top|halos|healthy choice|heinz|hellmann's|herdez|hershey's|hidden valley|hillshire farm|hood|horizon organic|hormel|hot pockets|huy fong|i can't believe it's not butter|idahoan|international delight|jennie-o|jif|jimmy dean|johnsonville|justin's|kashi|keebler|kellogg's|ken's|kerrygold|kikkoman|kind|king arthur|king's hawaiian|kirkland|kirkland signature|kit kat|knorr|knudsen|kodiak|kraft|kroger|krusteaz|la banderita|lacroix|lactaid|land o lakes|land o'lakes|lawry's|lay's|lea & perrins|lean cuisine|light + fit|lipton|m&m's|mahatma|marie callender's|market pantry|maruchan|marzetti|maxwell house|mccormick|meijer|member's mark|minute|minute maid|mission|monster|morton|mott's|muscle milk|nabisco|naked|nature valley|nature's own|near east|nestle|newman's own|nissin|nutella|oatly|ocean spray|oikos|old el paso|old london|optimum nutrition|ore-ida|oreo|organic valley|oroweat|ortega|oscar mayer|pace|pam|pearl milling|pepperidge farm|pepsi|perdue|pete and gerry's|peter pan|philadelphia|pillsbury|polly-o|pompeian|post|powerade|prairie farm|prego|premier protein|president|primal kitchen|pringles|progresso|publix|quaker|quest|ragu|rao's|ratio|red baron|red bull|reese's|rice-a-roni|ritz|ronzoni|ruffles|rxbar|sabra|sara lee|sargento|siete|siggi's|signature select|silk|simple truth|simply|skippy|smartwater|smithfield|smucker's|snickers|splenda|sprite|starbucks|starkist|stonyfield|stouffer's|stove top|stubb's|success|sun-maid|swanson|sweet baby ray's|tabasco|talenti|thomas'|tillamook|top ramen|tostitos|totino's|trader joe's|triscuit|tropicana|truvia|two good|tyson|uncle ben's|v8|velveeta|vital farms|vitaminwater|wegmans|welch's|wesson|wheat thins|whole foods market|wish-bone|wonder|wonderful|yoplait|zatarain's`.split('|'),
)
const bigBrand = (brand: string) => {
  const b = brand.toLowerCase()
  if (!b) return false
  for (const known of BIG_US_BRANDS) if (b === known || b.startsWith(known + ' ') || (known.length > 4 && b.includes(known))) return true
  return false
}

/** Every typed word present first, then household-name US brands, then USDA label data over Open Food Facts. */
function rank(list: BrandFood[], q: string): BrandFood[] {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean)
  const score = (f: BrandFood) => {
    const hay = `${f.brand} ${f.name}`.toLowerCase()
    const hits = words.filter((w) => hay.includes(w.replace(/s$/, ''))).length
    return hits * 10 + (bigBrand(f.brand) ? 8 : 0) + (f.id.startsWith('b:fdc:') ? 2 : 0) - hay.length / 40 + (f.units.length > 2 ? 1 : 0)
  }
  return list
    .map((f, i) => ({ f, s: score(f) - i / 100 }))
    .sort((a, b) => b.s - a.s)
    .map((x) => x.f)
}

const withTimeout = <T,>(fn: (s: AbortSignal) => Promise<T>, ms: number) => {
  const c = new AbortController()
  const t = setTimeout(() => c.abort(), ms)
  return fn(c.signal).finally(() => clearTimeout(t))
}

export default handler(async (req, url) => {
  requireSession(req)
  if (req.method !== 'GET') throw new HttpError(405, 'method')
  const q = (url.searchParams.get('q') ?? '').toLowerCase().replace(/[^a-z0-9%'& -]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60)
  if (q.length < 2) return json({ foods: [] })

  const cache = stores.brands()
  const key = `q/${q}`
  const hit = (await cache.get(key, { type: 'json' }).catch(() => null)) as { at: number; foods: BrandFood[] } | null
  if (hit && Date.now() - hit.at < CACHE_DAYS * 864e5) return json({ foods: hit.foods, cached: true })

  // USDA first (US label data). Open Food Facts only fills in when USDA has little or fails.
  const [fdc] = await Promise.allSettled([withTimeout((s) => searchFdc(q, s), 6000)])
  const needOff = fdc.status === 'rejected' || fdc.value.length < 8
  const [off] = needOff ? await Promise.allSettled([withTimeout((s) => searchOff(q, s), 6000)]) : [{ status: 'fulfilled', value: [] } as PromiseFulfilledResult<BrandFood[]>]
  if (fdc.status === 'rejected') console.warn('brands: USDA search failed', String(fdc.reason))
  if (off.status === 'rejected') console.warn('brands: Open Food Facts search failed', String(off.reason))
  if (fdc.status === 'rejected' && off.status === 'rejected') throw new HttpError(503, 'brands_unavailable', "Store brands couldn't load right now. Try again in a bit.")

  const foods = rank(dedupe([...(fdc.status === 'fulfilled' ? fdc.value : []), ...(off.status === 'fulfilled' ? off.value : [])]), q).slice(0, 30)
  if (foods.length) await cache.setJSON(key, { at: Date.now(), foods }).catch(() => undefined)
  return json({ foods })
})
