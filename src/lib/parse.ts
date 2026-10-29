// "Type what you ate": turn free text like "2 eggs, 1 cup rice and 6oz chicken breast"
// into items, then match each one to the food catalog (no AI service, works offline).
import type { LibFood } from './foods'
import { macrosFor, searchFoods } from './foods'

export interface ParsedItem {
  raw: string
  qty: number
  unit: string | null
  query: string
  /** false when no amount was typed ("coffee") */
  explicit?: boolean
}

const WORD_NUM: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, dozen: 12, half: 0.5, couple: 2, few: 3, 'a couple': 2, 'a couple of': 2, 'a few': 3,
  'a half': 0.5, 'half a': 0.5, 'half an': 0.5, 'a dozen': 12, 'one and a half': 1.5,
}
const FRACTIONS: Record<string, number> = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3, '⅛': 0.125 }

const UNIT_ALIASES: [RegExp, string][] = [
  [/^(cups?|c)$/, 'cup'],
  [/^(tablespoons?|tbsps?|tbs|tbl)$/, 'tbsp'],
  [/^(teaspoons?|tsps?)$/, 'tsp'],
  [/^(fl\.? ?oz|fluid ounces?)$/, 'fl oz'],
  [/^(ounces?|oz)$/, 'oz'],
  [/^(grams?|g|gr|gms?)$/, 'g'],
  [/^(kilograms?|kg)$/, 'kg'],
  [/^(pounds?|lbs?)$/, 'lb'],
  [/^(milliliters?|ml)$/, 'ml'],
  [/^(slices?)$/, 'slice'],
  [/^(pieces?|pcs?)$/, 'piece'],
  [/^(servings?)$/, 'serving'],
  [/^(scoops?)$/, 'scoop'],
  [/^(bowls?)$/, 'bowl'],
  [/^(glass(es)?)$/, 'glass'],
  [/^(cans?)$/, 'can'],
  [/^(bottles?)$/, 'bottle'],
  [/^(bars?)$/, 'bar'],
  [/^(patt(y|ies))$/, 'patty'],
  [/^(large|lg)$/, 'large'],
  [/^(medium|med)$/, 'medium'],
  [/^(small|sm)$/, 'small'],
  [/^(extra large|xl)$/, 'extra large'],
  [/^(handfuls?)$/, 'handful'],
]

function unitOf(word: string): string | null {
  for (const [re, u] of UNIT_ALIASES) if (re.test(word)) return u
  return null
}

const FILLER = /^(i\s+)?(had|ate|eat|drank|got)\s+|^(for\s+(breakfast|lunch|dinner|a snack|snack)\s*:?\s*)|^(some|about|around|like|maybe|approx\.?|roughly)\s+/

const NUM = String.raw`(\d+\s+\d+\/\d+|\d+\/\d+|\d*\.\d+|\d+|[½¼¾⅓⅔⅛]|one and a half|a couple of|a couple|a few|a half|half an?|a dozen|an?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|dozen|half|couple|few)`
const UNIT_WORDS = String.raw`(cups?|c|tablespoons?|tbsps?|tbs|tbl|teaspoons?|tsps?|fl\.? ?oz|fluid ounces?|ounces?|oz|grams?|gr|gms?|g|kilograms?|kg|pounds?|lbs?|milliliters?|ml|slices?|pieces?|pcs?|servings?|scoops?|bowls?|glass(?:es)?|cans?|bottles?|bars?|patt(?:y|ies)|extra large|xl|large|lg|medium|med|small|sm|handfuls?)`
const LEAD = new RegExp(String.raw`^${NUM}\s*${UNIT_WORDS}?(?:\s+of)?\s+(.+)$`)
const TRAIL = new RegExp(String.raw`^(.+?)\s*[,(]?\s*${NUM}\s*${UNIT_WORDS}\)?$`)
const TRAIL_X = /^(.+?)\s*[x×]\s*(\d+(?:\.\d+)?)$/

export function toNumber(s: string): number {
  s = s.trim()
  if (FRACTIONS[s] != null) return FRACTIONS[s]
  if (WORD_NUM[s] != null) return WORD_NUM[s]
  const mixed = s.match(/^(\d+)\s+(\d+)\/(\d+)$/)
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3])
  const frac = s.match(/^(\d+)\/(\d+)$/)
  if (frac) return Number(frac[1]) / Number(frac[2])
  const n = Number(s)
  return Number.isFinite(n) && n > 0 ? n : 1
}

/** Split text into separate foods: commas, new lines, "+", and "and/with" before a new amount. */
export function splitFoods(text: string): string[] {
  const parts: string[] = []
  for (const piece of text.toLowerCase().replace(/[.!]+(\s|$)/g, ',').split(/[\n,;+]+/)) {
    const sub = piece.split(new RegExp(String.raw`\s+(?:and|&|with|plus)\s+(?=(?:\d|[½¼¾⅓⅔⅛]|an?\s|one\s|two\s|three\s|four\s|five\s|six\s|half\s|some\s|a couple|a few))`))
    for (const s of sub) if (s.trim()) parts.push(s.trim())
  }
  return parts
}

export function parseItem(raw: string): ParsedItem {
  let s = raw.toLowerCase().trim()
  for (let i = 0; i < 3; i++) s = s.replace(FILLER, '')
  s = s.replace(/(\d)(oz|g|lb|lbs|ml|kg)\b/g, '$1 $2') // "6oz" → "6 oz"
  let m = s.match(LEAD)
  if (m) return { raw, qty: toNumber(m[1]), unit: m[2] ? unitOf(m[2]) : null, query: clean(m[3]), explicit: true }
  m = s.match(TRAIL)
  if (m) return { raw, qty: toNumber(m[2]), unit: unitOf(m[3]), query: clean(m[1]), explicit: true }
  m = s.match(TRAIL_X)
  if (m) return { raw, qty: Number(m[2]), unit: null, query: clean(m[1]), explicit: true }
  return { raw, qty: 1, unit: null, query: clean(s), explicit: false }
}

const clean = (q: string) => q.replace(/^(of|the)\s+/, '').replace(/[^a-z0-9%' -]+/g, ' ').replace(/\s+/g, ' ').trim()

export function parseFoods(text: string): ParsedItem[] {
  return splitFoods(text).map(parseItem).filter((p) => p.query.length > 0)
}

// ---------- matching ----------

/** Typical weight of one whole item, for foods people count ("2 eggs", "a banana"). */
const EACH_GRAMS: [RegExp, number, string][] = [
  [/\begg/, 50, 'large egg'],
  [/\bbanana/, 118, 'medium banana'],
  [/\bapple/, 182, 'medium apple'],
  [/\borange/, 131, 'medium orange'],
  [/\bpeach/, 150, 'medium peach'],
  [/\bpear/, 178, 'medium pear'],
  [/\bavocado/, 150, 'avocado'],
  [/\bkiwi/, 69, 'kiwi'],
  [/\bmango/, 207, 'mango'],
  [/\bplum/, 66, 'plum'],
  [/\bnectarine/, 142, 'nectarine'],
  [/\bstrawberr/, 12, 'strawberry'],
  [/\bgrape\b|\bgrapes/, 5, 'grape'],
  [/\bclementine|tangerine|mandarin/, 74, 'clementine'],
  [/\btomato/, 123, 'medium tomato'],
  [/\bcarrot/, 61, 'medium carrot'],
  [/\bsweet potato/, 114, 'medium sweet potato'],
  [/\bpotato/, 173, 'medium potato'],
  [/\bbagel/, 105, 'bagel'],
  [/\btortilla/, 45, 'tortilla'],
  [/\bbread|toast/, 28, 'slice'],
  [/\bchicken breast|breast/, 172, 'breast (cooked)'],
  [/\bchicken thigh|thigh/, 52, 'thigh (cooked)'],
  [/\bhot dog|frankfurter/, 45, 'hot dog'],
  [/\bstrip.*bacon|bacon/, 8, 'slice'],
  [/\bcookie/, 30, 'cookie'],
  [/\bpancake/, 38, 'pancake'],
  [/\bwaffle/, 35, 'waffle'],
  [/\bmuffin/, 113, 'muffin'],
  [/\bdonut|doughnut/, 60, 'donut'],
  [/\bshrimp/, 6, 'shrimp'],
  [/\balmond/, 1.2, 'almond'],
  [/\bonion/, 110, 'medium onion'],
  [/\bpepper/, 119, 'medium pepper'],
  [/\blemon/, 58, 'lemon'],
  [/\blime/, 67, 'lime'],
]

export interface Match {
  food: LibFood
  unitIndex: number
  qty: number
}

function labelQty(label: string): number {
  const m = label.trim().match(/^(\d*\.?\d+(?:\/\d+)?)\s/)
  return m ? toNumber(m[1]) : 1
}

/** Pick the best unit for what was typed and work out the amount in that unit. */
export function fitUnit(food: LibFood, item: ParsedItem): Match {
  const units = food.units
  const find = (pred: (label: string) => boolean) => units.findIndex((u) => pred(u.label.toLowerCase()))
  // When a unit was typed ("1 tbsp" vs a "2 tbsp" serving) convert; otherwise one of the catalog's servings.
  const per = (i: number, typed = true) => ({ food, unitIndex: i, qty: typed ? round(item.qty / labelQty(units[i].label)) : item.qty })

  if (food.perServing) return { food, unitIndex: 0, qty: item.qty }
  const g = find((l) => l === 'g')
  const oz = find((l) => l === 'oz')
  switch (item.unit) {
    case 'g':
    case 'ml':
      return { food, unitIndex: g, qty: item.qty }
    case 'kg':
      return { food, unitIndex: g, qty: item.qty * 1000 }
    case 'oz':
      return { food, unitIndex: oz, qty: item.qty }
    case 'lb':
      return { food, unitIndex: oz, qty: item.qty * 16 }
  }
  const unitWord = item.unit === 'bowl' || item.unit === 'glass' ? 'cup' : item.unit === 'fl oz' ? 'fl oz' : item.unit
  if (unitWord) {
    const i = find((l) => new RegExp(`\\b${unitWord}`).test(l))
    if (i >= 0) return per(i)
  }
  // Calorie-dense snacks with no amount typed ("almonds", "chips"): a 1 oz handful, not a cupful.
  if (!item.explicit && !unitWord && food.per100 && food.per100.cal > 400 && oz >= 0) return { food, unitIndex: oz, qty: 1 }
  // Counting whole things ("2 eggs", "a banana"): add an "each" unit if the catalog doesn't have one.
  const name = (item.query + ' ' + food.name).toLowerCase()
  const countable = EACH_GRAMS.find(([re]) => re.test(item.query))
  const hasCountUnit = find((l) => /\b(large|medium|small|each|whole|fruit|breast|slice|piece|egg|patty|link|bar|item)\b/.test(l))
  if ((!unitWord || unitWord === 'piece' || ['large', 'medium', 'small'].includes(unitWord)) && hasCountUnit >= 0 && !/\bcup|tbsp|oz\b/.test(units[hasCountUnit].label)) {
    return per(hasCountUnit)
  }
  // Tiny things with no amount typed ("almonds") mean a normal serving, not one almond.
  if (countable && countable[1] < 15 && !item.explicit) return per(0, false)
  if (countable && name) {
    const extra = { label: countable[2], grams: countable[1] }
    const withEach: LibFood = { ...food, units: [extra, ...units] }
    return { food: withEach, unitIndex: 0, qty: item.qty }
  }
  if (unitWord === 'cup' || unitWord === 'tbsp' || unitWord === 'tsp') {
    // convert via a cup unit if there is one
    const cup = find((l) => /\bcup/.test(l))
    if (cup >= 0) {
      const factor = unitWord === 'cup' ? 1 : unitWord === 'tbsp' ? 1 / 16 : 1 / 48
      return { food, unitIndex: cup, qty: round((item.qty * factor) / labelQty(units[cup].label)) }
    }
  }
  // Drinks measured per fl oz: no amount typed means a normal glass/can.
  if (!unitWord && /fl oz/.test(units[0].label) && labelQty(units[0].label) === 1) {
    const size = /beer|soda|cola|seltzer|energy drink|sparkling/.test(item.query) ? 12 : 8
    return { food, unitIndex: 0, qty: item.qty * size }
  }
  return per(0, !!unitWord)
}

const round = (n: number) => Math.round(n * 100) / 100

/** Match one typed item: best food first, plus a few alternatives to switch to. */
/** Plain words people type → the catalog's wording. */
const SYNONYMS: Record<string, string> = {
  toast: 'bread white commercially prepared toasted',
  'white toast': 'bread white commercially prepared toasted',
  'wheat toast': 'bread whole wheat commercially prepared toasted',
  rice: 'rice white long grain regular enriched cooked',
  'white rice': 'rice white long grain regular enriched cooked',
  'brown rice': 'rice brown long grain cooked',
  oatmeal: 'oats regular quick unenriched cooked water',
  oats: 'oats regular quick not fortified dry',
  'protein shake': 'protein powder whey',
  'protein powder': 'protein powder whey',
  beer: 'beer regular',
  coffee: 'coffee brewed prepared tap water',
  chicken: 'chicken breast meat only cooked roasted',
  'grilled chicken': 'chicken breast skinless boneless grilled',
  steak: 'beef top sirloin steak cooked broiled',
  'ground beef': 'beef ground 85% lean patty cooked broiled',
  salmon: 'salmon atlantic farmed cooked dry heat',
  tuna: 'tuna light canned water drained',
  pasta: 'pasta cooked enriched without added salt',
  spaghetti: 'pasta cooked enriched without added salt',
  potato: 'potatoes baked flesh skin without salt',
  'sweet potato': 'sweet potato cooked baked skin',
  yogurt: 'yogurt greek plain nonfat',
  'greek yogurt': 'yogurt greek plain nonfat',
  milk: 'milk reduced fat 2% vitamin a',
  cheese: 'cheese cheddar',
  soda: 'carbonated cola regular',
  coke: 'carbonated cola regular',
  wine: 'wine table red',
}

export function matchItem(all: LibFood[], item: ParsedItem): { best: Match | null; alternatives: LibFood[] } {
  const plural = item.query.replace(/s$/, '')
  const q = SYNONYMS[item.query] ?? SYNONYMS[plural] ?? item.query
  let results = searchFoods(all, q, 8)
  if (!results.length && q !== item.query) results = searchFoods(all, item.query, 8)
  if (!results.length) return { best: null, alternatives: [] }
  let pick = results[0]
  // Prefer a result that actually has the unit the person typed (e.g. "slice").
  if (item.unit && !['g', 'oz', 'lb', 'kg', 'ml'].includes(item.unit)) {
    const withUnit = results.slice(0, 5).find((f) => f.units.some((u) => u.label.toLowerCase().includes(item.unit!)))
    if (withUnit) pick = withUnit
  }
  return { best: fitUnit(pick, item), alternatives: results.filter((f) => f !== pick).slice(0, 5) }
}

export const matchCalories = (m: Match) => macrosFor(m.food, m.unitIndex, m.qty).cal

export interface MatchedLine {
  item: ParsedItem
  best: Match | null
  alternatives: LibFood[]
}

/** Parse and match everything typed. "bagel with cream cheese" becomes two foods if it has no match as one. */
export function matchText(all: LibFood[], text: string): MatchedLine[] {
  const out: MatchedLine[] = []
  for (const item of parseFoods(text)) {
    const m = matchItem(all, item)
    if (!m.best && /\s(with|and|&)\s/.test(item.query)) {
      const parts = item.query.split(/\s+(?:with|and|&)\s+/).filter(Boolean)
      parts.forEach((q, i) => {
        const sub: ParsedItem = { raw: q, qty: i === 0 ? item.qty : 1, unit: i === 0 ? item.unit : null, query: q, explicit: i === 0 && item.explicit }
        out.push({ item: sub, ...matchItem(all, sub) })
      })
    } else out.push({ item, ...m })
  }
  return out
}
