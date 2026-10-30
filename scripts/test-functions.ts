// Integration test for the Netlify Functions against a local Netlify Blobs server.
// Run: npx tsx scripts/test-functions.ts
// (Netlify Identity can't run locally, so sign-up/sign-in are covered on the live site.)
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { BlobsServer } from '@netlify/blobs/server'
import { setEnvironmentContext } from '@netlify/blobs'

process.env.SESSION_SECRET = 'test-secret'
process.env.ADMIN_EMAILS = 'kay@example.com'
process.env.INVITE_CODE = 'CRISP-TEST'

const token = 'local-token'
const server = new BlobsServer({ directory: mkdtempSync(join(tmpdir(), 'blobs-')), token, port: 0 })
const { port } = await server.start()
setEnvironmentContext({ siteID: "test-site", token, edgeURL: `http://localhost:${port}`, uncachedEdgeURL: `http://localhost:${port}`, apiURL: `http://localhost:${port}` })

const { issueToken } = await import('../netlify/lib/session')
const { saveProfile, stores } = await import('../netlify/lib/stores')
const { newProfile } = await import('../shared/types')
const sync = (await import('../netlify/functions/sync.mts')).default
const foods = (await import('../netlify/functions/foods.mts')).default
const fitness = (await import('../netlify/functions/fitness.mts')).default
const events = (await import('../netlify/functions/events.mts')).default
const admin = (await import('../netlify/functions/admin.mts')).default
const passkey = (await import('../netlify/functions/passkey.mts')).default
const streakSaver = (await import('../netlify/functions/streak-saver.mts')).default

let failures = 0
const check = (cond: unknown, msg: string) => {
  console.log(`${cond ? '✓' : '✗'} ${msg}`)
  if (!cond) failures++
}
const req = (path: string, opts: { method?: string; body?: unknown; tok?: string } = {}) =>
  new Request(`https://crisp.test${path}`, {
    method: opts.method ?? (opts.body ? 'POST' : 'GET'),
    headers: { 'content-type': 'application/json', ...(opts.tok ? { authorization: `Bearer ${opts.tok}` } : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  })
const call = async (fn: (r: Request) => Promise<Response>, path: string, opts?: Parameters<typeof req>[1]) => {
  const res = await fn(req(path, opts))
  return { status: res.status, body: (await res.json()) as Record<string, any> }
}

// Two users: Kay (admin) and Sam
const kay = { ...newProfile('kay1', 'kay@example.com', 'Kay', 'America/Chicago'), fitnessCode: 'kaycode123', onboarded: true }
const sam = { ...newProfile('sam1', 'sam@example.com', 'Sam', 'America/Chicago'), fitnessCode: 'samcode456', onboarded: true }
await saveProfile(kay)
await saveProfile(sam)
await stores.fitnesscodes().set('samcode456', 'sam1')
const tKay = issueToken('kay1', 'kay@example.com')
const tSam = issueToken('sam1', 'sam@example.com')

// --- auth required
check((await call(sync, '/api/sync')).status === 401, 'sync refuses requests without a session')
check((await call(sync, '/api/sync', { tok: tSam.slice(0, -2) + 'xx' })).status === 401, 'sync refuses a tampered token')

// --- sync: save + conflict + merge
const date = '2026-10-28'
const food = (id: string) => ({ id, foodId: 'q', name: id, meal: 'lunch', qty: 1, unit: 'serving', cal: 100, p: 1, c: 1, f: 1, at: id })
let r = await call(sync, '/api/sync', { method: 'PUT', tok: tSam, body: { key: `days/${date}`, data: { date, foods: [food('a')], workouts: [], steps: null, deleted: [] }, etag: null } })
check(r.status === 200 && r.body.etag, 'first save of a day works and returns an etag')
const etag1 = r.body.etag
r = await call(sync, '/api/sync', { method: 'PUT', tok: tSam, body: { key: `days/${date}`, data: { date, foods: [food('a'), food('b')], workouts: [], steps: null, deleted: [] }, etag: etag1 } })
check(r.status === 200, 'save with the right etag works')
// The local Blobs test server doesn't return etags on reads (production does), so only run this check when it can work.
const readEtags = !!(await stores.userdata().getWithMetadata(`sam1/days/${date}`, { type: 'json' }))?.etag
if (readEtags) {
  r = await call(sync, '/api/sync', { method: 'PUT', tok: tSam, body: { key: `days/${date}`, data: { date, foods: [food('c')], workouts: [], steps: null, deleted: [] }, etag: etag1 } })
  check(r.status === 409 && r.body.data.foods.length === 2, 'stale etag gets a 409 with the current copy (no overwrite)')
} else console.log('- skipped stale-etag check (local test server has no read etags)')
check((await call(sync, '/api/sync', { method: 'PUT', tok: tSam, body: { key: '../kay1/weights', data: {}, etag: null } })).status === 400, 'rejects unknown document keys')

// profile: server-owned fields are protected
r = await call(sync, '/api/sync', { method: 'PUT', tok: tSam, body: { key: 'profile', data: { ...sam, fitnessCode: 'hacked', firstName: 'Samuel' }, etag: null } })
check(r.body.data.firstName === 'Samuel' && r.body.data.fitnessCode === 'samcode456', 'profile saves, but the sync code cannot be changed by the app')

r = await call(sync, '/api/sync', { tok: tSam })
check(r.status === 200 && r.body.docs[`days/${date}`]?.data?.foods?.length === 2 || r.body.profile.firstName === 'Samuel', 'pull returns profile and docs')
r = await call(sync, `/api/sync?days=${date}`, { tok: tKay })
check(r.body.docs[`days/${date}`].data === null, "one person can't see another person's days")

// --- fitness (Shortcut)
check((await call(fitness, '/api/fitness', { body: { code: 'wrong', steps: 10 } })).status === 401, 'Shortcut with a wrong code is refused')
r = await call(fitness, '/api/fitness', { body: { code: 'samcode456', steps: '8,200', date, workouts: [{ type: 'Run', minutes: 30, calories: 310 }] } })
check(r.status === 200 && /8,200 steps/.test(r.body.message), `Shortcut sync works: "${r.body.message}"`)
r = await call(sync, `/api/sync?days=${date}`, { tok: tSam })
const day = r.body.docs[`days/${date}`].data
check(day.steps.count === 8200 && day.workouts.length === 1 && day.foods.length === 2, 'Shortcut data lands in the day without touching foods')
await call(fitness, '/api/fitness', { body: { code: 'samcode456', steps: 9000, date, workoutCalories: 200, workoutMinutes: 20 } })
r = await call(sync, `/api/sync?days=${date}`, { tok: tSam })
check(r.body.docs[`days/${date}`].data.workouts.length === 1 && r.body.docs[`days/${date}`].data.steps.count === 9000, 'a second Shortcut run replaces (not duplicates) its data')
// Activity-ring totals: Active Energy minus the walking already counted from steps
r = await call(fitness, '/api/fitness', { body: { code: 'samcode456', steps: '8,000', date, activeCalories: '612.4 kcal', exerciseMinutes: '42 min' } })
check(r.status === 200 && /42 exercise min/.test(r.body.message), `Activity-ring sync works: "${r.body.message}"`)
r = await call(sync, `/api/sync?days=${date}`, { tok: tSam })
{
  const w = r.body.docs[`days/${date}`].data.workouts
  check(w.length === 1 && w[0].type === 'Exercise' && w[0].minutes === 42 && w[0].cal > 200 && w[0].cal < 612, `exercise keeps only the burn beyond walking (${w[0]?.cal} cal of 612)`)
}

// --- AI lookup (no ANTHROPIC_API_KEY here, so only credits, admin and safety checks)
const aiFood = (await import('../netlify/functions/ai-food.mts')).default
const aiLib = await import('../netlify/lib/ai')
r = await call(aiFood, '/api/ai-food', { tok: tSam, body: { foods: [{ query: 'chick-fil-a sandwich', candidates: [] }] } })
check(r.status === 503 && r.body.error === 'ai_not_setup', 'AI lookup says it is not set up when the API key is missing')
r = await call(aiFood, '/api/ai-food/quota', { tok: tSam })
check(r.status === 200 && r.body.left === 10 && r.body.daily === 10, 'everyone starts with 10 AI lookups a day')
for (let i = 0; i < 10; i++) await aiLib.spendCredit(sam)
check((await aiLib.spendCredit(sam)) === null, 'the 11th lookup in a day is refused')
r = await call(admin, '/api/admin/ai-bonus', { tok: tKay, body: { uid: 'sam1', add: 5 } })
check(r.status === 200 && r.body.left === 5 && r.body.bonus === 5, 'admin can give +5 AI lookups')
check((await aiLib.spendCredit(sam)) === 'bonus', 'bonus lookups are used after the daily ones')
r = await call(admin, '/api/admin/ai-message', { tok: tKay, body: { uid: 'sam1', message: 'Love you! Ask me for more 💕' } })
check(r.status === 200 && (await aiLib.privateMessage('sam1')) === 'Love you! Ask me for more 💕', 'admin can save a private out-of-lookups note')
r = await call(admin, '/api/admin/ai-bonus', { tok: tSam, body: { uid: 'sam1', add: 50 } })
check(r.status === 403, 'non-admins cannot give themselves lookups')
r = await call(aiFood, '/api/ai-food/job/nope', { tok: tSam })
check(r.status === 404, 'unknown AI lookups are refused')
{
  const qs = ['chick-fil-a spicy chicken sandwich', 'medium waffle fries', 'mystery thing']
  const parsed = aiLib.parseAnswer('Found them.\n```json\n{"foods":[{"query":"x","items":[{"name":"Spicy Chicken Sandwich","brand":"Chick-fil-A","serving":"1 sandwich","servingGrams":214,"cal":460,"p":28,"c":45,"f":19,"estimate":false,"sourceUrl":"https://www.chick-fil-a.com/menu"},{"name":"x","cal":"lots"}]},{"items":[{"name":"Waffle Potato Fries","brand":"Chick-fil-A","serving":"medium","cal":420,"p":5,"c":45,"f":24,"sourceUrl":"https://www.chick-fil-a.com/fries"}]},{"items":[]}],"note":"Regular sizes"}\n```', qs)
  check(parsed.foods.length === 3 && parsed.foods[0].items.length === 1 && parsed.foods[0].items[0].cal === 460 && parsed.foods[1].items[0].cal === 420 && parsed.foods[2].items.length === 0 && parsed.note === 'Regular sizes', 'one AI answer covers a whole meal, in order, with junk dropped')
  const est = aiLib.parseAnswer('{"foods":[{"items":[{"name":"Pad thai","serving":"1 plate","cal":800,"p":30,"c":90,"f":30}]}]}', ['pad thai'])
  check(est.foods[0].items[0].estimate === true, 'answers without a source are marked as estimates')
  const cands = [
    [{ id: 'c:abc', name: 'Chick-fil-A Waffle Potato Fries', serving: 'medium', cal: 420 }, { id: 'u:f71401000', name: 'French fries', serving: '1 serving', cal: 365 }],
    [{ id: 'u:01123', name: 'Egg, whole', serving: '1 large', cal: 72 }],
    [],
  ]
  const m = aiLib.parseMatches('{"matches":["c:abc","u:made-up",null]}', cands)
  check(m[0] === 'c:abc' && m[1] === null && m[2] === null, 'database matches only accept foods that were actually offered')
}

// --- foods
r = await call(foods, '/api/foods', { tok: tSam, body: { name: 'Quest bar', serving: '1 bar', cal: 190, p: 21, c: 22, f: 8 } })
check(r.status === 200 && r.body.food.createdByName === 'Samuel', 'custom food created with creator name')
const foodId = r.body.food.id
check((await call(foods, `/api/foods/${foodId}`, { method: 'DELETE', tok: tKay })).status === 403, "others (even admin) can't delete someone's custom food")
check((await call(foods, '/api/foods', { tok: tKay })).body.foods.length === 1, 'everyone can see shared custom foods')
check((await call(foods, `/api/foods/${foodId}`, { method: 'PUT', tok: tSam, body: { name: 'Quest bar', serving: '1 bar', cal: 200, p: 21, c: 22, f: 8 } })).body.food.cal === 200, 'creator can edit')

// --- events + admin
r = await call(events, '/api/events', { tok: tSam, body: { events: [{ type: 'app_open', details: { theme: 'dark', macroDisplay: 'rings' } }, { type: 'food_logged', details: { method: 'quick', meal: 'lunch' } }, { type: 'evil', details: {} }] } })
check(r.body.saved === 2, 'events saved (unknown types ignored)')
check((await call(admin, '/api/admin/dashboard', { tok: tSam })).status === 403, 'non-admins are refused by the admin function')
r = await call(admin, '/api/admin/dashboard', { tok: tKay })
check(r.status === 200 && r.body.overview.totalUsers === 2 && r.body.features.logMethods.quick === 1 && r.body.features.rings === 1, 'admin dashboard aggregates users and features')
check(r.body.recent.some((e: { name: string }) => e.name === 'Samuel'), 'recent activity shows first names')
r = await call(admin, '/api/admin/person?uid=sam1', { tok: tKay })
check(r.status === 200 && r.body.days.length >= 1, 'admin can see a person’s full data')
r = await call(admin, '/api/admin/invite', { tok: tKay, body: { code: 'NEW-CODE' } })
check(r.body.inviteCode === 'NEW-CODE', 'admin can change the invite code')

// --- passkey options
r = await call(passkey, '/api/passkey/login-options', { body: {} })
check(r.status === 200 && r.body.options.challenge && r.body.challengeId, 'passkey login options are generated')
r = await call(passkey, '/api/passkey/register-options', { tok: tSam, body: {} })
check(r.status === 200 && r.body.options.rp.id === 'crisp.test', 'passkey registration options use the site domain')
r = await call(passkey, '/api/passkey/login-verify', { body: { challengeId: 'nope', response: { id: 'x' } } })
check(r.status === 400, 'passkey verify with an unknown challenge is refused')

// --- streak saver runs without crashing (no VAPID keys locally → sends nothing)
await saveProfile({ ...sam, notif: { enabled: true, hour: new Date().getHours() } })
await streakSaver()
check(true, 'streak-saver runs')

await server.stop()
console.log(failures ? `\n${failures} check(s) failed` : '\nAll function checks passed')
process.exit(failures ? 1 : 0)
