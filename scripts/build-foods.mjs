// Builds public/foods.json from two public-domain USDA databases:
//  • FNDDS 2019–2020 "survey foods" — ~5,500 everyday generic foods with plain names and real servings
//    ("Sour cream, regular" · 1 tablespoon), condensed in scripts/data/fndds.json (scripts/prepare-fndds.mjs)
//  • SR28 Standard Reference — ~8,000 detailed foods incl. uncooked staples and some brands/restaurants
//    (via the fda-nutrient-database package). Spec §12.
//
// Output: { v, foods: [[id, name, kcal, protein, carbs, fat, portions, featured, kind], ...] }
// Macros are per 100 g. portions = [[label, grams], ...]. kind: 1 generic (FNDDS) · 0 plain (SR) · 2 brand/restaurant
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)
const dataDir = join(dirname(require.resolve('fda-nutrient-database/package.json')), 'data')

const read = (f) =>
  readFileSync(join(dataDir, f), 'latin1')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((l) => l.split('^').map((x) => x.replace(/^~|~$/g, '')))

// Skip baby foods (0300) and American Indian/Alaska Native foods (3500).
const SKIP_GROUPS = new Set(['0300', '3500'])
const SKIP_WORDS = /babyfood|infant formula|child formula|usda commodity|school lunch|milk, human/i

// Foods shown first in search results (exact USDA names).
const FEATURED = new Set(JSON.parse(readFileSync(join(root, 'scripts/featured-foods.json'), 'utf8')))

const desc = new Map(read('FOOD_DES.txt').map((f) => [f[0], { group: f[1], name: f[2] }]))

const tidy = (name) =>
  name
    .replace(/broilers? or fryers, /gi, '')
    .replace(/, all commercial varieties/gi, '')
    .replace(/, year round average/gi, '')
    .replace(/\s+/g, ' ')
    .trim()

const num = (s) => (s === '' || s == null ? 0 : Number(s))
const r1 = (n) => Math.round(n * 10) / 10

// Brand or restaurant items in SR28 (fast-food group, restaurant group, or a name starting with a brand in caps).
const BRAND_GROUPS = new Set(['2100', '3600'])
const isBrand = (group, name) => BRAND_GROUPS.has(group) || /^[A-Z][A-Z0-9'&.\- ]{2,}(,|\s[A-Z])/.test(name) || /\b(McDONALD|KRAFT|KELLOGG|GENERAL MILLS|NABISCO|PILLSBURY)\b/.test(name)
// Grains, pasta and cereals: say "uncooked (dry)" instead of "raw"/"dry" so cooked vs uncooked is clear.
const GRAIN_GROUPS = new Set(['2000', '0800'])
const grainName = (group, name) =>
  GRAIN_GROUPS.has(group) && !/cooked/i.test(name) ? name.replace(/,\s*(raw|dry form|dry|unprepared)\b/i, ', uncooked (dry)') : name

const foods = []
const found = new Set()

// Generic foods first.
const fndds = JSON.parse(readFileSync(join(root, 'scripts/data/fndds.json'), 'utf8'))
for (const [code, name, kcal, p, c, f, portions] of fndds) {
  if (SKIP_WORDS.test(name)) continue
  foods.push([`f${code}`, name, kcal, p, c, f, portions, FEATURED.has(name) ? 1 : 0, 1])
  if (FEATURED.has(name)) found.add(name)
}
for (const f of read('ABBREV.txt')) {
  const id = f[0]
  const d = desc.get(id)
  if (!d || SKIP_GROUPS.has(d.group) || SKIP_WORDS.test(d.name)) continue
  const kcal = num(f[3])
  const protein = num(f[4])
  const fat = num(f[5])
  const carbs = num(f[7])
  const n = f.length
  const portions = []
  const g1 = num(f[n - 5]), d1 = f[n - 4]
  const g2 = num(f[n - 3]), d2 = f[n - 2]
  if (g1 > 0 && d1) portions.push([d1, r1(g1)])
  if (g2 > 0 && d2 && d2 !== d1) portions.push([d2, r1(g2)])
  const featured = FEATURED.has(d.name) ? 1 : 0
  if (featured) found.add(d.name)
  foods.push([id, grainName(d.group, tidy(d.name)), r1(kcal), r1(protein), r1(carbs), r1(fat), portions, featured, isBrand(d.group, d.name) ? 2 : 0])
}

const missing = [...FEATURED].filter((n) => !found.has(n))
if (missing.length) console.warn(`featured foods not found (${missing.length}):\n  ` + missing.join('\n  '))

mkdirSync(join(root, 'public'), { recursive: true })
writeFileSync(join(root, 'public/foods.json'), JSON.stringify({ v: 'fndds-sr28-2', foods }))
console.log(`foods.json: ${foods.length} foods (${fndds.length} generic, ${foods.filter((f) => f[8] === 2).length} brand/restaurant, ${found.size} featured)`)
