// Builds public/foods.json from the USDA National Nutrient Database for Standard Reference
// (SR28, public domain — via the fda-nutrient-database package). Spec §12.
//
// Output: { v, foods: [[id, name, kcal, protein, carbs, fat, portions, featured], ...] }
// Macros are per 100 g. portions = [[label, grams], ...] from USDA household measures.
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
const SKIP_WORDS = /babyfood|infant formula|child formula|usda commodity|school lunch/i

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

const foods = []
const found = new Set()
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
  foods.push([id, tidy(d.name), r1(kcal), r1(protein), r1(carbs), r1(fat), portions, featured])
}

const missing = [...FEATURED].filter((n) => !found.has(n))
if (missing.length) console.warn(`featured foods not found (${missing.length}):\n  ` + missing.join('\n  '))

mkdirSync(join(root, 'public'), { recursive: true })
writeFileSync(join(root, 'public/foods.json'), JSON.stringify({ v: 'sr28-1', foods }))
console.log(`foods.json: ${foods.length} foods (${found.size} featured)`)
