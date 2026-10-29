// Forgiving food matching for typed text.
// The USDA catalog names foods like "Cheese, monterey" or "Chicken, breast, meat only, cooked, roasted",
// while people type "monterey jack cheese" or "chkn breast". This scores every catalog food by how
// many of the typed words it covers (allowing plurals, abbreviations, prefixes and small typos), then
// backs off to the closest broader match — the same idea MIT's spoken food logger and Nutritionix use.
import type { LibFood } from './foods'

/** Short forms and slang → catalog words (applied word by word). */
const ABBREV: Record<string, string> = {
  pb: 'peanut butter',
  pbj: 'peanut butter jelly',
  oj: 'orange juice',
  aj: 'apple juice',
  evoo: 'olive oil',
  avo: 'avocado',
  avos: 'avocado',
  chx: 'chicken',
  chkn: 'chicken',
  chk: 'chicken',
  chick: 'chicken',
  mozz: 'mozzarella',
  mozzarela: 'mozzarella',
  parm: 'parmesan',
  broc: 'broccoli',
  brocolli: 'broccoli',
  brocoli: 'broccoli',
  cauli: 'cauliflower',
  zucc: 'zucchini',
  zuke: 'zucchini',
  yog: 'yogurt',
  yoghurt: 'yogurt',
  yogourt: 'yogurt',
  grk: 'greek',
  choc: 'chocolate',
  choco: 'chocolate',
  pnut: 'peanut',
  veg: 'vegetable',
  veggie: 'vegetable',
  veggies: 'vegetable',
  ff: 'fat free',
  nf: 'nonfat',
  lf: 'lowfat',
  'low-fat': 'lowfat',
  'non-fat': 'nonfat',
  'fat-free': 'fat free',
  skim: 'nonfat',
  cott: 'cottage',
  bbq: 'barbecue',
  mac: 'macaroni',
  spag: 'spaghetti',
  ketchup: 'catsup',
  mayo: 'mayonnaise',
  fries: 'french fried potato',
  hashbrown: 'hash brown',
  hashbrowns: 'hash brown',
  pepperjack: 'monterey',
  sando: 'sandwich',
  sammich: 'sandwich',
  sammy: 'sandwich',
  burger: 'hamburger',
  cheeseburger: 'cheeseburger',
  pancakes: 'pancake',
  tuna: 'tuna',
  shrooms: 'mushroom',
  'w/': 'with',
  'w/o': 'without',
  wo: 'without',
  wht: 'white',
  whl: 'whole',
  ww: 'whole wheat',
  gf: 'gluten free',
  pom: 'pomegranate',
  straw: 'strawberry',
  blue: 'blueberry',
  rasp: 'raspberry',
  grilled: 'grilled',
}

/** Whole phrases people type → how the catalog says it. Checked longest first. */
const PHRASES: [RegExp, string][] = [
  [/\b(monterey|monterrey) jack( cheese)?\b|\bjack cheese\b|\bpepper jack( cheese)?\b/, 'cheese monterey'],
  [/\bcolby jack( cheese)?\b/, 'cheese colby'],
  [/\bamerican cheese\b/, 'cheese pasteurized process american'],
  [/\bstring cheese\b/, 'cheese mozzarella part skim'],
  [/\bcream cheese\b/, 'cheese cream'],
  [/\bcottage cheese\b/, 'cheese cottage lowfat 2%'],
  [/\bcheddar( cheese)?\b/, 'cheese cheddar'],
  [/\bswiss( cheese)?\b/, 'cheese swiss'],
  [/\bfeta( cheese)?\b/, 'cheese feta'],
  [/\bparmesan( cheese)?\b/, 'cheese parmesan grated'],
  [/\bmozzarella( cheese)?\b/, 'cheese mozzarella part skim'],
  [/\bgreek yogurt\b/, 'yogurt greek plain nonfat'],
  [/\begg whites?\b/, 'egg white raw fresh'],
  [/\begg yolks?\b/, 'egg yolk raw fresh'],
  [/\b(hard[- ]?boiled|boiled) eggs?\b/, 'egg whole cooked hard-boiled'],
  [/\bscrambled eggs?\b/, 'egg whole cooked scrambled'],
  [/\bfried eggs?\b/, 'egg whole cooked fried'],
  [/^eggs?$/, 'egg whole cooked scrambled'],
  [/\bpeanut butter\b/, 'peanut butter smooth style'],
  [/\balmond butter\b/, 'nuts almond butter plain'],
  [/\bolive oil\b/, 'oil olive salad or cooking'],
  [/\bcoconut oil\b/, 'oil coconut'],
  [/\bchicken breasts?\b/, 'chicken breast meat only cooked roasted'],
  [/\bgrilled chicken\b/, 'chicken breast skinless boneless grilled'],
  [/\bchicken thighs?\b/, 'chicken thigh meat only cooked roasted'],
  [/\bground turkey\b/, 'turkey ground cooked'],
  [/\bground beef\b|\bhamburger meat\b/, 'beef ground 85% lean patty cooked broiled'],
  [/\bsteak\b/, 'beef top sirloin steak cooked broiled'],
  [/\bturkey bacon\b/, 'turkey bacon microwaved'],
  [/\bbacon\b/, 'pork cured bacon cooked baked'],
  [/\bsalmon\b/, 'salmon atlantic farmed cooked dry heat'],
  [/\btuna\b/, 'tuna light canned water drained'],
  [/\bshrimp\b/, 'crustaceans shrimp cooked'],
  [/\btilapia\b/, 'fish tilapia cooked dry heat'],
  [/\bcauliflower rice\b|\briced cauliflower\b/, 'cauliflower raw'],
  [/^(white )?rice$/, 'rice white long grain regular enriched cooked'],
  [/\bbrown rice\b/, 'rice brown long grain cooked'],
  [/\b(oatmeal|porridge)\b/, 'oats regular quick unenriched cooked water'],
  [/^oats$/, 'oats regular quick not fortified dry'],
  [/\b(protein shake|protein powder|whey( protein)?)\b/, 'protein powder whey'],
  [/^(white )?bread$|\bwhite toast\b|^toast$/, 'bread white commercially prepared toasted'],
  [/\b(wheat|whole wheat) (bread|toast)\b/, 'bread whole wheat commercially prepared'],
  [/^(pasta|spaghetti|noodles)$/, 'pasta cooked enriched without added salt'],
  [/^potato(es)?$|\bbaked potato\b/, 'potatoes baked flesh skin without salt'],
  [/\bsweet potato(es)?\b/, 'sweet potato cooked baked skin'],
  [/^yogurt$/, 'yogurt greek plain nonfat'],
  [/^milk$|\b2% milk\b/, 'milk reduced fat 2%'],
  [/\bwhole milk\b/, 'milk whole 3.25%'],
  [/\b(skim|nonfat|fat free) milk\b/, 'milk nonfat fluid'],
  [/\balmond milk\b/, 'almond milk unsweetened'],
  [/\bhalf (and|&) half\b/, 'cream fluid half and half'],
  [/^cheese$/, 'cheese cheddar'],
  [/^(beer)$/, 'beer regular'],
  [/\blight beer\b/, 'beer light'],
  [/^(coffee|black coffee)$/, 'coffee brewed prepared tap water'],
  [/^(soda|coke|pop|cola)$/, 'carbonated cola regular'],
  [/\b(diet coke|diet soda)\b/, 'carbonated cola without caffeine sweetened with aspartame'],
  [/\b(red wine|wine)\b/, 'wine table red'],
  [/\bwhite wine\b/, 'wine table white'],
  [/\b(french fries|fries|french fried potato)\b/, 'fast foods potato french fried vegetable oil'],
  [/\bhummus\b/, 'hummus commercial'],
  [/\b(pepperoni pizza)\b/, 'pizza pepperoni topping regular crust frozen cooked'],
  [/\bpizza\b/, 'pizza cheese topping regular crust frozen cooked'],
  [/\b(iced )?(latte|cappuccino|flat white)s?\b/, 'coffee ready to drink milk based'],
  [/\bchoc(olate)? chip cookies?\b/, 'cookies chocolate chip commercially prepared soft-type'],
  [/\bavocados?\b/, 'avocados raw'],
  [/\bbananas?\b/, 'bananas raw'],
  [/\bapples?\b/, 'apples raw with skin'],
  [/\bstrawberr(y|ies)\b/, 'strawberries raw'],
  [/\bblueberr(y|ies)\b/, 'blueberries raw'],
  [/\bgrapes?\b/, 'grapes red or green raw'],
  [/\boranges?\b/, 'oranges raw'],
  [/\bbroccoli\b/, 'broccoli raw'],
  [/\bspinach\b/, 'spinach raw'],
  [/\bquinoa\b/, 'quinoa cooked'],
  [/\balmonds?\b/, 'nuts almonds'],
  [/\bwalnuts?\b/, 'nuts walnuts english'],
  [/\bcashews?\b/, 'nuts cashew'],
  [/\bbagels?\b/, 'bagels plain enriched'],
  [/\btortillas?\b/, 'tortillas ready to bake fry flour'],
  [/\bcorn tortillas?\b/, 'tortillas ready to bake fry corn'],
  [/\bhoney\b/, 'honey'],
  [/\bbutter\b(?! milk)/, 'butter salted'],
]

const STOP = new Set(['of', 'the', 'a', 'an', 'some', 'my', 'and', 'with', 'in', 'on', 'for', 'to', 'piece', 'pieces', 'fresh', 'homemade', 'little', 'bit'])

export function singular(w: string): string {
  if (w.length <= 3) return w
  if (w.endsWith('ies')) return w.slice(0, -3) + 'y'
  if (/(tomato|potato|mango)es$/.test(w)) return w.slice(0, -2)
  if (w.endsWith('ves')) return w.slice(0, -3) + 'f'
  if (/(ss|us|is)$/.test(w)) return w
  if (w.endsWith('es') && /(ch|sh|x)es$/.test(w)) return w.slice(0, -2)
  if (w.endsWith('s')) return w.slice(0, -1)
  return w
}

const words = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9%/ -]+/g, ' ')
    .split(/[\s-]+/)
    .filter(Boolean)

/** Expand abbreviations and catalog phrasing for a typed food description. */
export function expandQuery(q: string): string {
  let s = q.toLowerCase().trim()
  s = words(s)
    .map((w) => ABBREV[w] ?? w)
    .join(' ')
  for (const [re, to] of PHRASES) {
    if (re.test(s)) {
      s = s.replace(re, to)
      break
    }
  }
  return s
}

interface Indexed {
  all: Set<string>
  first: Set<string>
  count: number
  branded: boolean
}
const cache = new WeakMap<LibFood, Indexed>()
function index(f: LibFood): Indexed {
  let x = cache.get(f)
  if (!x) {
    const segs = f.name.split(',')
    const toks = words(f.name).map(singular)
    x = {
      all: new Set(toks),
      first: new Set(words(segs[0]).map(singular)),
      count: toks.length,
      branded: /\b[A-Z][A-Z'&.]{2,}\b/.test(f.name), // e.g. "McDONALD'S", "KRAFT"
    }
    cache.set(f, x)
  }
  return x
}

function close(a: string, b: string, max: number): boolean {
  if (Math.abs(a.length - b.length) > max || a[0] !== b[0]) return false
  // Levenshtein with early exit
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    let rowMin = i
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
      rowMin = Math.min(rowMin, cur[j])
    }
    if (rowMin > max) return false
    prev = cur
  }
  return prev[b.length] <= max
}

function tokenScore(q: string, set: Set<string>): number {
  if (set.has(q)) return 1
  let best = 0
  for (const t of set) {
    if (q.length >= 4 && (t.startsWith(q) || q.startsWith(t)) && t.length >= 3) best = Math.max(best, 0.85)
    else if (q.length >= 5 && close(q, t, q.length >= 8 ? 2 : 1)) best = Math.max(best, 0.7)
    if (best === 0.85) break
  }
  return best
}

/**
 * Ranked catalog search that tolerates extra words, word order, plurals, abbreviations and typos.
 * Foods that cover more of what was typed rank first; generic foods beat brand-name ones.
 */
export function fuzzySearch(all: LibFood[], query: string, limit = 8): LibFood[] {
  const expanded = expandQuery(query)
  const qWords = words(expanded)
    .filter((w) => !STOP.has(w))
    .map(singular)
  if (!qWords.length) return []
  const head = qWords[qWords.length - 1]
  const typedBrand = /[A-Z]{3,}/.test(query)
  const scored: { f: LibFood; s: number }[] = []
  for (const f of all) {
    const ix = index(f)
    let sum = 0
    let matched = 0
    let firstHits = 0
    for (const w of qWords) {
      const s = tokenScore(w, ix.all)
      sum += s
      if (s > 0) matched++
      if (s > 0 && ix.first.has(w)) firstHits++
    }
    if (!matched) continue
    const coverage = sum / qWords.length
    const headScore = tokenScore(head, ix.all)
    // Need most of the words, and normally the main food word (usually the last one typed).
    if (qWords.length === 1 ? coverage < 0.65 : coverage < 0.5 || (headScore === 0 && coverage < 0.8)) continue
    let s = coverage * 100
    s += firstHits * 6 // "cheese" matching "Cheese, monterey" counts more than matching deep in the name
    if (ix.first.has(head)) s += 6
    s -= Math.max(0, ix.count - matched) * 1.3 // fewer extra words = more generic
    if (f.featured) s += 14
    if (f.custom) s += 22
    if (ix.branded && !typedBrand) s -= 10
    if (/dehydrated|freeze-dried|industrial|imitation|frozen, unprepared|babyfood|infant|dry mix|refrigerated dough/i.test(f.name)) s -= 12
    if (/\b(raw|cooked|roasted|boiled|grilled|baked|broiled)\b/i.test(f.name)) s += 1
    scored.push({ f, s })
  }
  return scored
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map((x) => x.f)
}
