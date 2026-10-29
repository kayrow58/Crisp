// One-time prep: condense USDA FNDDS 2019–2020 ("Survey foods", public domain) into scripts/data/fndds.json.
// Source: FoodData Central download "FoodData_Central_survey_food_json_2022-10-28.json".
// Usage: node scripts/prepare-fndds.mjs /path/to/FoodData_Central_survey_food_json_2022-10-28.json
// Output rows: [foodCode, name, kcal, protein, carbs, fat, portions[[label, grams]], category]  (macros per 100 g)
import { readFileSync, writeFileSync } from 'node:fs'

const src = process.argv[2]
if (!src) throw new Error('Pass the path to the FDC survey food JSON')
const { SurveyFoods } = JSON.parse(readFileSync(src, 'utf8'))
const r1 = (n) => Math.round(n * 10) / 10
const nut = (f, id) => f.foodNutrients.find((n) => n.nutrient.id === id)?.amount ?? 0
// Plain names: drop survey jargon ("NFS" = not further specified, "NS as to …" = not specified).
const tidyName = (n) =>
  n
    .replace(/,\s*NFS\b/g, '')
    .replace(/,\s*NS as to [^,]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
const tidyPortion = (l) =>
  l
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/small or thin\/very thin slice/i, 'thin slice')
    .replace(/medium or regular slice/i, 'medium slice')
    .replace(/large or thick slice/i, 'thick slice')
const SKIP = /^(Infant formula|Baby|Human milk)|babyfood|infant/i

const rows = []
for (const f of SurveyFoods) {
  if (SKIP.test(f.description) || /^Baby/i.test(f.wweiaFoodCategory?.wweiaFoodCategoryDescription ?? '')) continue
  const portions = []
  let typical = null
  for (const p of [...f.foodPortions].sort((a, b) => a.sequenceNumber - b.sequenceNumber)) {
    const label = tidyPortion(p.portionDescription)
    if (/guideline amount/i.test(label)) continue
    if (/^quantity not specified/i.test(label)) {
      typical = r1(p.gramWeight)
      continue
    }
    if (!p.gramWeight || label.length > 60) continue
    portions.push([label.replace(/\s+/g, ' '), r1(p.gramWeight)])
  }
  // The typical amount people eat goes first as "1 serving".
  if (typical) portions.unshift(['1 serving', typical])
  rows.push([
    f.foodCode,
    tidyName(f.description),
    r1(nut(f, 1008)),
    r1(nut(f, 1003)),
    r1(nut(f, 1005)),
    r1(nut(f, 1004)),
    portions.slice(0, 8),
    f.wweiaFoodCategory?.wweiaFoodCategoryDescription ?? '',
  ])
}
writeFileSync(new URL('./data/fndds.json', import.meta.url), JSON.stringify(rows))
console.log(`fndds.json: ${rows.length} foods`)
