// "Type what you ate": turn free text like "2 eggs, about half an avocado, Monterey Jack cheese 60g"
// into items (amount + unit + food), then match each one to the food catalog. Works offline, no AI service.
//
// Approach (like MIT's spoken food logger and Nutritionix's natural-language endpoint):
//   1. split the text into foods, 2. pull out the amount and unit (default: one normal serving),
//   3. find the closest catalog food, backing off to broader matches, 4. map the unit to the
//   closest catalog serving (converting cups/tbsp/oz/grams, or using a typical "each" weight).
import type { LibFood } from './foods'
import { macrosFor } from './foods'
import { fuzzySearch } from './match'

export interface ParsedItem {
  raw: string
  qty: number
  unit: string | null
  query: string
  /** false when no amount was typed ("coffee") */
  explicit?: boolean
}

const WORD_NUM: Record<string, number> = {
  a: 1, an: 1, one: 1, single: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, dozen: 12, half: 0.5, quarter: 0.25, couple: 2, few: 3, several: 3, 'a couple': 2, 'a couple of': 2,
  'a few': 3, 'a half': 0.5, 'half a': 0.5, 'half an': 0.5, 'half of a': 0.5, 'half of an': 0.5, 'half of': 0.5,
  'a quarter': 0.25, 'quarter of a': 0.25, 'a dozen': 12, 'one and a half': 1.5, 'one half': 0.5, 'a third': 1 / 3,
  'two thirds': 2 / 3, 'three quarters': 0.75, 'a pair of': 2, double: 2, 'a double': 2,
}
const FRACTIONS: Record<string, number> = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3, '⅛': 0.125 }

const UNIT_ALIASES: [RegExp, string][] = [
  [/^(cups?|c)$/, 'cup'],
  [/^(tablespoons?|tbsps?|tbs|tbl|tblsp|tbsp\.|t)$/, 'tbsp'],
  [/^(teaspoons?|tsps?|tsp\.)$/, 'tsp'],
  [/^(fl\.? ?oz|fluid ounces?|floz)$/, 'fl oz'],
  [/^(ounces?|oz|oz\.)$/, 'oz'],
  [/^(grams?|g|gr|grs|gms?|gm)$/, 'g'],
  [/^(kilograms?|kgs?|kilos?)$/, 'kg'],
  [/^(pounds?|lbs?|lb\.)$/, 'lb'],
  [/^(milliliters?|millilitres?|mls?)$/, 'ml'],
  [/^(liters?|litres?|l)$/, 'l'],
  [/^(slices?)$/, 'slice'],
  [/^(pieces?|pcs?|pc\.|each|ea|whole)$/, 'piece'],
  [/^(servings?|portions?)$/, 'serving'],
  [/^(scoops?)$/, 'scoop'],
  [/^(bowls?)$/, 'bowl'],
  [/^(glass(es)?|mugs?)$/, 'glass'],
  [/^(cans?|tins?)$/, 'can'],
  [/^(bottles?)$/, 'bottle'],
  [/^(bars?)$/, 'bar'],
  [/^(patt(y|ies))$/, 'patty'],
  [/^(sticks?)$/, 'stick'],
  [/^(strips?|rashers?)$/, 'strip'],
  [/^(links?)$/, 'link'],
  [/^(cloves?)$/, 'clove'],
  [/^(containers?|cartons?|cups? container|tubs?)$/, 'container'],
  [/^(packets?|packs?|pouch(es)?|sachets?)$/, 'packet'],
  [/^(large|lg|big)$/, 'large'],
  [/^(medium|med|regular)$/, 'medium'],
  [/^(small|sm|little)$/, 'small'],
  [/^(extra large|xl|jumbo)$/, 'extra large'],
  [/^(handfuls?)$/, 'handful'],
  [/^(spoonfuls?|spoons?)$/, 'spoonful'],
  [/^(heaping spoonfuls?|heaping spoons?|heaping tablespoons?|heaping tbsp)$/, 'heaping'],
  [/^(pinch(es)?|dash(es)?)$/, 'pinch'],
  [/^(splash(es)?|drizzle)$/, 'splash'],
  [/^(shots?)$/, 'shot'],
]

function unitOf(word: string | undefined): string | null {
  if (!word) return null
  for (const [re, u] of UNIT_ALIASES) if (re.test(word)) return u
  return null
}

const NUM = String.raw`(\d+\s+\d+\/\d+|\d+\/\d+|\d*\.\d+|\d+|[½¼¾⅓⅔⅛]|one and a half|three quarters|two thirds|a third|a quarter|quarter of an?|a couple of|a couple|a few|a pair of|a double|a dozen|a half|half of an?|half of|half an?|one half|an?|one|single|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|dozen|half|quarter|couple|few|several|double)`
const UNIT_WORDS = String.raw`(cups?|c|tablespoons?|tbsps?|tbs|tblsp|tbl|teaspoons?|tsps?|fl\.? ?oz|fluid ounces?|floz|ounces?|oz|grams?|grs|gms?|gm|gr|g|kilograms?|kgs?|kilos?|pounds?|lbs?|milliliters?|millilitres?|mls?|liters?|litres?|l|slices?|pieces?|pcs?|each|ea|whole|servings?|portions?|scoops?|bowls?|glass(?:es)?|mugs?|cans?|tins?|bottles?|bars?|patt(?:y|ies)|sticks?|strips?|rashers?|links?|cloves?|containers?|cartons?|tubs?|packets?|packs?|pouch(?:es)?|sachets?|extra large|xl|jumbo|large|lg|big|medium|med|regular|small|sm|little|handfuls?|heaping (?:spoonfuls?|spoons?|tablespoons?|tbsp)|spoonfuls?|spoons?|pinch(?:es)?|dash(?:es)?|splash(?:es)?|drizzle|shots?)`
const LEAD = new RegExp(String.raw`^${NUM}\s*${UNIT_WORDS}?(?:\s+of)?(?:\s+an?)?\s+(.+)$`)
const TRAIL = new RegExp(String.raw`^(.+?)\s*[,(:-]?\s*${NUM}\s*${UNIT_WORDS}\)?$`)
const TRAIL_NUM = /^(.+?)\s*[,(:]?\s*(?:x\s*)?(\d+(?:\.\d+)?)\)?$/
const LEAD_X = /^(\d+(?:\.\d+)?)\s*x\s+(.+)$/

const FILLER = [
  /^(and|also|then|plus)\s+/,
  /^(i\s+)?(just\s+)?(had|ate|eat|drank|drink|got|grabbed|snacked on)\s+/,
  /^(for\s+(breakfast|brunch|lunch|dinner|supper|a snack|snack|dessert)\s*:?\s*)/,
  /^(some|about|around|approximately|approx\.?|roughly|like|maybe|probably|nearly|almost|just|only|over|under|~|±)\s+/,
]

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

/** Clean up shorthand before parsing: "w/", "6-oz", "60g", "(60g)", "2-3", "1½", "~". */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/\bw\/o\b/g, ' without ')
    .replace(/\bw\//g, ' with ')
    .replace(/[~≈]/g, ' about ')
    .replace(/(\d)\s*([½¼¾⅓⅔⅛])/g, (_, d, f) => ` ${Number(d) + FRACTIONS[f]} `) // "1½" → 1.5
    .replace(/(\d+(?:\.\d+)?)\s*(?:-|–|to)\s*(\d+(?:\.\d+)?)(?=\s*[a-z(]|\s*$)/g, (_, a, b) => String((Number(a) + Number(b)) / 2)) // "2-3 eggs" → 2.5
    .replace(/(\d)-(?=[a-z])/g, '$1 ') // "6-oz" → "6 oz"
    .replace(/(\d)(oz|g|gr|gm|gms|grams?|lbs?|ml|kg|l|c|cups?|tbsp|tsp|pc|pcs|x)\b/g, '$1 $2') // "60g" → "60 g"
    .replace(/\(([^)]*)\)/g, ' $1 ') // "(60 g)" → " 60 g "
    .replace(/[ \t]+/g, ' ') // keep new lines: each line is its own food
}

/** Split text into separate foods: commas, new lines, "+", ";" and "and/with" before a new amount. */
export function splitFoods(text: string): string[] {
  const parts: string[] = []
  for (const piece of normalize(text).replace(/[.!?]+(\s|$)/g, ',').split(/[\n,;+]+/)) {
    const sub = piece.split(
      new RegExp(String.raw`\s+(?:and|&|with|plus|then|also)\s+(?=(?:\d|[½¼¾⅓⅔⅛]|an?\s|one\s|two\s|three\s|four\s|five\s|six\s|half\s|some\s|a couple|a few|about\s|around\s))`),
    )
    for (const s of sub) if (s.trim()) parts.push(s.trim())
  }
  return parts
}

export function parseItem(raw: string): ParsedItem {
  let s = normalize(raw).trim()
  for (let i = 0; i < 4; i++) for (const re of FILLER) s = s.replace(re, '')
  let m = s.match(LEAD_X)
  if (m) return { raw, qty: Number(m[1]), unit: null, query: clean(m[2]), explicit: true }
  m = s.match(LEAD)
  if (m && clean(m[3])) {
    // "60 g monterey jack" · "half an avocado" · "2 slices of bread"
    return { raw, qty: toNumber(m[1]), unit: unitOf(m[2]), query: clean(m[3]), explicit: true }
  }
  m = s.match(TRAIL)
  if (m && clean(m[1])) {
    // "monterey jack cheese 60 g" · "chicken breast (6 oz)"
    return { raw, qty: toNumber(m[2]), unit: unitOf(m[3]), query: clean(m[1]), explicit: true }
  }
  m = s.match(TRAIL_NUM)
  if (m && clean(m[1]) && !/\d%$/.test(s)) {
    // "eggs 2" · "banana x2"
    return { raw, qty: Number(m[2]), unit: null, query: clean(m[1]), explicit: true }
  }
  const size = s.match(/^(extra large|xl|jumbo|large|lg|big|medium|med|regular|small|sm|little)\s+(.+)$/)
  if (size && clean(size[2])) return { raw, qty: 1, unit: unitOf(size[1]), query: clean(size[2]), explicit: true }
  return { raw, qty: 1, unit: null, query: clean(s), explicit: false }
}

const clean = (q: string) =>
  q
    .replace(/^(of|the|an?)\s+/, '')
    .replace(/\s+(of|about)$/, '')
    .replace(/[^a-z0-9%' -]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

export function parseFoods(text: string): ParsedItem[] {
  return splitFoods(text)
    .map(parseItem)
    .filter((p) => p.query.length > 0)
}

// ---------- fitting the amount to a catalog serving ----------

/** Typical weight of one whole item, for foods people count ("2 eggs", "a banana", "half an avocado"). */
const EACH_GRAMS: [RegExp, number, string][] = [
  [/\begg whites?\b/, 33, 'large egg white'],
  [/\begg yolks?\b/, 17, 'large egg yolk'],
  [/\begg/, 50, 'large egg'],
  [/\bbanana/, 118, 'medium banana'],
  [/\bapple/, 182, 'medium apple'],
  [/\borange/, 131, 'medium orange'],
  [/\bpeach/, 150, 'medium peach'],
  [/\bpear/, 178, 'medium pear'],
  [/\bavocado|\bavo\b/, 150, 'whole avocado (no skin or pit)'],
  [/\bkiwi/, 69, 'kiwi'],
  [/\bmango/, 207, 'mango'],
  [/\bplum/, 66, 'plum'],
  [/\bnectarine/, 142, 'nectarine'],
  [/\bstrawberr/, 12, 'strawberry'],
  [/\bgrape\b|\bgrapes/, 5, 'grape'],
  [/\bclementine|tangerine|mandarin|cutie/, 74, 'clementine'],
  [/\bgrapefruit/, 246, 'grapefruit'],
  [/\btomato/, 123, 'medium tomato'],
  [/\bcarrot/, 61, 'medium carrot'],
  [/\bcelery/, 40, 'stalk'],
  [/\bcucumber/, 301, 'cucumber'],
  [/\bsweet potato/, 114, 'medium sweet potato'],
  [/\bpotato/, 173, 'medium potato'],
  [/\bbagel/, 105, 'bagel'],
  [/\btortilla/, 45, 'tortilla'],
  [/\bbread|toast/, 28, 'slice'],
  [/\bchicken breast|\bbreast/, 172, 'breast (cooked)'],
  [/\bchicken thigh|\bthigh/, 52, 'thigh (cooked)'],
  [/\bchicken (wing|drumstick)|\bwing|drumstick/, 34, 'piece'],
  [/\bhot dog|frankfurter|sausage link|\blink\b/, 45, 'link'],
  [/\bturkey bacon/, 15, 'slice'],
  [/\bbacon/, 8, 'slice'],
  [/\bcookie/, 30, 'cookie'],
  [/\bpancake/, 38, 'pancake'],
  [/\bwaffle/, 35, 'waffle'],
  [/\bmuffin/, 113, 'muffin'],
  [/\bdonut|doughnut/, 60, 'donut'],
  [/\bshrimp/, 6, 'shrimp'],
  [/\balmond/, 1.2, 'almond'],
  [/\bonion/, 110, 'medium onion'],
  [/\bbell pepper|\bpepper\b/, 119, 'medium pepper'],
  [/\blemon/, 58, 'lemon'],
  [/\blime/, 67, 'lime'],
  [/\bgarlic/, 3, 'clove'],
  [/\bdate\b|\bdates\b/, 24, 'date'],
  [/\bcracker/, 3, 'cracker'],
  [/\bstring cheese|cheese stick/, 28, 'stick'],
  [/\bmeatball/, 30, 'meatball'],
  [/\bnugget/, 16, 'nugget'],
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

/** Spoon-ish units turned into a fraction of a cup / tbsp. */
const SPOON: Record<string, [string, number]> = {
  spoonful: ['tbsp', 1],
  heaping: ['tbsp', 1.5],
  pinch: ['tsp', 1 / 16],
  splash: ['tbsp', 1],
  shot: ['fl oz', 1.5],
}

const round = (n: number) => Math.round(n * 100) / 100

/** How each unit can be written in catalog serving labels ("1 tbsp" or "1 tablespoon"). */
const LABEL_RE: Record<string, RegExp> = {
  tbsp: /\b(tbsp|tablespoons?)\b/,
  tsp: /\b(tsp|teaspoons?)\b/,
  cup: /\bcups?\b/,
  'fl oz': /\bfl oz\b/,
}
export const labelHas = (label: string, unit: string) => (LABEL_RE[unit] ?? new RegExp(`\\b${unit}`)).test(label.toLowerCase())

/** Pick the best unit for what was typed and work out the amount in that unit. */
export function fitUnit(food: LibFood, item: ParsedItem): Match {
  const units = food.units
  const find = (pred: (label: string) => boolean) => units.findIndex((u) => pred(u.label.toLowerCase()))
  // When a unit was typed ("1 tbsp" vs a "2 tbsp" serving) convert; otherwise one of the catalog's servings.
  const per = (i: number, typed = true) => ({ food, unitIndex: i, qty: typed ? round(item.qty / labelQty(units[i].label)) : item.qty })
  const withEach = (label: string, grams: number, qty: number): Match => ({ food: { ...food, units: [{ label, grams }, ...units] }, unitIndex: 0, qty: round(qty) })

  if (food.perServing) return { food, unitIndex: 0, qty: item.qty }
  // Store brands: count in the label's serving ("2 waffles" with a "2 waffles (70 g)" serving = 1 serving).
  if (food.brand && (!item.unit || item.unit === 'piece') && food.units[0].label !== 'g') {
    const label = food.units[0].label.toLowerCase()
    const same = item.explicit && item.query.split(' ').some((w) => w.length > 2 && label.includes(w.replace(/e?s$/, '')))
    return { food, unitIndex: 0, qty: round(same ? item.qty / labelQty(label) : item.qty) }
  }
  const g = find((l) => l === 'g')
  const oz = find((l) => l === 'oz')
  let unit = item.unit
  let qty = item.qty
  switch (unit) {
    case 'g':
    case 'ml':
      return { food, unitIndex: g, qty: round(qty) }
    case 'kg':
    case 'l':
      return { food, unitIndex: g, qty: round(qty * 1000) }
    case 'oz':
      return { food, unitIndex: oz, qty: round(qty) }
    case 'lb':
      return { food, unitIndex: oz, qty: round(qty * 16) }
    case 'handful':
      return { food, unitIndex: oz, qty: round(qty) } // a handful ≈ 1 oz
  }
  if (unit && SPOON[unit]) {
    ;[unit, qty] = [SPOON[unit][0], qty * SPOON[unit][1]]
  }
  if (unit === 'stick' && /butter|margarine/.test(food.name.toLowerCase())) return withEach('stick', 113, qty)
  if (unit === 'scoop' && find((l) => /scoop/.test(l)) < 0) return withEach('scoop', 30, qty)
  const unitWord = unit === 'bowl' || unit === 'glass' ? 'cup' : unit === 'strip' ? 'slice' : unit === 'can' || unit === 'bottle' ? unit : unit
  const typedFor: ParsedItem = { ...item, unit, qty }
  if (unitWord && unitWord !== 'piece' && !['large', 'medium', 'small', 'extra large'].includes(unitWord)) {
    const i = find((l) => labelHas(l, unitWord))
    if (i >= 0) return { food, unitIndex: i, qty: round(qty / labelQty(units[i].label)) }
  }
  // Calorie-dense snacks with no amount typed ("almonds", "chips"): a 1 oz handful, not a cupful.
  if (!item.explicit && !unitWord && food.per100 && food.per100.cal > 400 && oz >= 0) return { food, unitIndex: oz, qty: 1 }

  // Counting whole things ("2 eggs", "a banana", "half an avocado").
  const countable = EACH_GRAMS.find(([re]) => re.test(item.query))
  const size = unitWord === 'large' ? 'large' : unitWord === 'small' ? 'small' : unitWord === 'extra large' ? 'extra large' : 'medium'
  const sized = find((l) => new RegExp(`\\b${size}\\b`).test(l) && !/\bcup|tbsp|oz\b/.test(l))
  const counted = find((l) => /\b(large|medium|small|each|whole|fruit|breast|slice|piece|egg|patty|link|bar|item|stalk|wing|drumstick|thigh|leg)\b/.test(l) && !/\bcup|tbsp|\boz\b/.test(l))
  if (!unitWord || unitWord === 'piece' || ['large', 'medium', 'small', 'extra large'].includes(unitWord)) {
    if (sized >= 0) return per(sized)
    // No size typed and the catalog only lists large/small: use a typical medium one instead.
    if (!unitWord && countable && countable[1] >= 15 && /\bmedium\b/.test(countable[2]) && counted >= 0 && !/\bmedium\b/.test(units[counted].label.toLowerCase()))
      return withEach(countable[2], countable[1], qty)
    if (counted >= 0 && !(countable && countable[1] < 15 && !item.explicit)) return { food, unitIndex: counted, qty: round(qty / labelQty(units[counted].label)) }
  }
  // Tiny things with no amount typed ("grapes") mean a normal serving, not one grape.
  if (countable && countable[1] < 15 && !item.explicit) return per(0, false)
  if (countable) {
    const factor = unitWord === 'large' ? 1.25 : unitWord === 'small' ? 0.75 : unitWord === 'extra large' ? 1.4 : 1
    const label = unitWord && factor !== 1 ? countable[2].replace(/\b(medium|large|whole)\b/, unitWord) : countable[2]
    return withEach(label === countable[2] && factor !== 1 ? `${unitWord} ${label}` : label, Math.round(countable[1] * factor), qty)
  }
  if (unitWord === 'cup' || unitWord === 'tbsp' || unitWord === 'tsp' || unitWord === 'fl oz') {
    // convert via a cup unit if there is one
    const cup = find((l) => labelHas(l, 'cup'))
    if (cup >= 0) {
      const factor = unitWord === 'cup' ? 1 : unitWord === 'tbsp' ? 1 / 16 : unitWord === 'fl oz' ? 1 / 8 : 1 / 48
      return { food, unitIndex: cup, qty: round((qty * factor) / labelQty(units[cup].label)) }
    }
    const tbsp = find((l) => labelHas(l, 'tbsp'))
    if (tbsp >= 0) {
      const factor = unitWord === 'cup' ? 16 : unitWord === 'tbsp' ? 1 : unitWord === 'fl oz' ? 2 : 1 / 3
      return { food, unitIndex: tbsp, qty: round((qty * factor) / labelQty(units[tbsp].label)) }
    }
  }
  // Drinks measured per fl oz: no amount typed means a normal glass/can.
  if (!unitWord && /fl oz/.test(units[0].label) && labelQty(units[0].label) === 1) {
    const sizeOz = /beer|soda|cola|seltzer|energy drink|sparkling/.test(item.query) ? 12 : 8
    return { food, unitIndex: 0, qty: qty * sizeOz }
  }
  // A unit the catalog doesn't list ("1 container", "a packet"): one normal serving each.
  return per(0, false)
  void typedFor
}

/** Match one typed item: best food first, plus a few alternatives to switch to. */
export function matchItem(all: LibFood[], item: ParsedItem): { best: Match | null; alternatives: LibFood[] } {
  let results = fuzzySearch(all, item.query, 8)
  // Back off: drop describing words one at a time ("leftover grilled teriyaki chicken" → "chicken").
  const words = item.query.split(' ')
  for (let i = 1; !results.length && i < words.length; i++) results = fuzzySearch(all, words.slice(i).join(' '), 8)
  if (!results.length) return { best: null, alternatives: [] }
  let pick = results[0]
  // Prefer a result that actually has the unit the person typed (e.g. "slice", "container").
  const u = item.unit
  if (u && !['g', 'oz', 'lb', 'kg', 'ml', 'l', 'piece', 'large', 'medium', 'small', 'extra large'].includes(u) && !pick.units.some((x) => labelHas(x.label, u))) {
    const withUnit = results.slice(1, 4).find((f) => f.units.some((x) => labelHas(x.label, u)))
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
const SPREAD = /^(pb|peanut butter|almond butter|avo|avocado|butter|jam|jelly|nutella|cream cheese|egg|cheese|hummus)\s+(toast|bagel|english muffin|sandwich)$/

export function matchText(all: LibFood[], text: string): MatchedLine[] {
  const out: MatchedLine[] = []
  for (let item of parseFoods(text)) {
    // "avo toast" / "pb toast" → the bread plus what's on it
    const spread = item.query.match(SPREAD)
    if (spread) item = { ...item, query: `${spread[2] === 'sandwich' ? 'bread' : spread[2]} with ${spread[1]}`, unit: spread[2] === 'sandwich' ? null : item.unit, qty: spread[2] === 'sandwich' ? item.qty * 2 : item.qty }
    if (item.query === 'pb&j' || item.query === 'pbj' || item.query === 'pb j') item = { ...item, query: 'bread with peanut butter and jelly', qty: item.qty * 2 }
    const whole = matchItem(all, item)
    const parts = item.query.split(/\s+(?:with|and|&|on|plus|topped with)\s+/).filter(Boolean)
    if (parts.length > 1) {
      // Prefer splitting when each part matches well on its own (e.g. "toast with butter").
      const subs = parts.map((q, i) => {
        // toppings: half an avocado on toast, otherwise one normal serving
        const avo = /^(avo|avocado)s?$/.test(q)
        const spoon = /^(pb|peanut butter|almond butter|butter|jam|jelly|nutella|cream cheese|hummus|mayo|mayonnaise|honey|syrup|ranch|dressing|sauce)$/.test(q)
        const splash = /^(milk|cream|creamer|half and half|half & half|oat milk|almond milk|skim milk|2% milk)$/.test(q)
        const top: Pick<ParsedItem, 'qty' | 'unit' | 'explicit'> = avo
          ? { qty: 0.5, unit: null, explicit: true }
          : spoon
            ? { qty: 1, unit: 'tbsp', explicit: true }
            : splash
              ? { qty: 2, unit: 'tbsp', explicit: true }
              : { qty: 1, unit: null, explicit: false }
        const sub: ParsedItem = i === 0 ? { raw: q, qty: item.qty, unit: item.unit, query: q, explicit: item.explicit } : { raw: q, query: q, ...top }
        return { item: sub, ...matchItem(all, sub) }
      })
      const wholeName = whole.best?.food.name.toLowerCase() ?? ''
      const wholeCoversAll = !!whole.best && parts.every((p) => p.split(' ').some((w) => wholeName.includes(w.replace(/s$/, ''))))
      // Also split when the combined match drifted away from the main food ("coffee with milk" → candy).
      const drifted = !!whole.best && !!subs[0].best && whole.best.food !== subs[0].best.food && !subs[0].alternatives.slice(0, 4).includes(whole.best.food)
      if (subs.every((s) => s.best) && (!wholeCoversAll || drifted)) {
        out.push(...subs)
        continue
      }
    }
    out.push({ item, ...whole })
  }
  return out
}
