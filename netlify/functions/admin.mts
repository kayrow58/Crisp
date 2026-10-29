// Admin dashboard — only for emails in ADMIN_EMAILS, checked here on the server (spec §4.9, §9).
import type { Config } from '@netlify/functions'
import { HttpError, body, env, handler, json, route } from '../lib/http'
import { requireAdmin } from '../lib/session'
import { getProfile, stores } from '../lib/stores'
import type { AppEvent } from '../lib/events'
import { addDays, dayKey, ymdInZone } from '../../shared/dates'
import { streak } from '../../shared/calc'
import type { DayIndex, Profile } from '../../shared/types'

export const config: Config = { path: '/api/admin/*' }

const TZ = 'America/Chicago'

async function inChunks<T, R>(items: T[], size: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = []
  for (let i = 0; i < items.length; i += size) out.push(...(await Promise.all(items.slice(i, i + size).map(fn))))
  return out
}

async function monthsAvailable(): Promise<string[]> {
  const { directories } = await stores.events().list({ directories: true })
  return directories.map((d) => d.replace(/\/$/, '')).sort()
}

async function eventsForMonths(months: string[]): Promise<AppEvent[]> {
  const st = stores.events()
  const keys: string[] = []
  for (const m of months) {
    const { blobs } = await st.list({ prefix: `${m}/` })
    keys.push(...blobs.map((b) => b.key))
  }
  const evs = await inChunks(keys, 25, (k) => st.get(k, { type: 'json' }) as Promise<AppEvent | null>)
  return evs.filter((e): e is AppEvent => !!e).sort((a, b) => b.time.localeCompare(a.time))
}

function monthsBack(n: number): string[] {
  const d = new Date()
  return Array.from({ length: n }, (_, i) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i, 1)).toISOString().slice(0, 7))
}

async function settings() {
  return ((await stores.app().get('settings', { type: 'json' })) as { inviteCode?: string; lastPurgePrompt?: string } | null) ?? {}
}

export default handler(async (req, url) => {
  requireAdmin(req)
  const r = route(url, '/api/admin')

  if (r === 'dashboard' && req.method === 'GET') {
    const profilesStore = stores.profiles()
    const { blobs } = await profilesStore.list()
    const profiles = (await inChunks(blobs, 25, (b) => profilesStore.get(b.key, { type: 'json' }) as Promise<Profile | null>)).filter(
      (p): p is Profile => !!p,
    )
    const months = await monthsAvailable()
    const recentMonths = monthsBack(2).filter((m) => months.includes(m))
    const events = await eventsForMonths(recentMonths)
    const today = dayKey(new Date(), TZ)
    const since = (days: number) => addDays(today, -days + 1)
    const evDay = (e: AppEvent) => ymdInZone(new Date(e.time), TZ)

    const activeSet = (from: string) => new Set(events.filter((e) => evDay(e) >= from).map((e) => e.uid))
    const dailyActive = Array.from({ length: 30 }, (_, i) => {
      const d = addDays(today, -29 + i)
      return { date: d, users: new Set(events.filter((e) => evDay(e) === d).map((e) => e.uid)).size }
    })

    const last30 = events.filter((e) => evDay(e) >= since(30))
    const count = (pred: (e: AppEvent) => boolean) => last30.filter(pred).length
    const latestOpen = new Map<string, AppEvent>()
    for (const e of events) if (e.type === 'app_open' && !latestOpen.has(e.uid)) latestOpen.set(e.uid, e)
    const prefs = [...latestOpen.values()].map((e) => e.details ?? {})
    const pushStore = stores.push()
    const pushCounts = await inChunks(profiles, 25, async (p) => (((await pushStore.get(p.id, { type: 'json' })) as unknown[] | null) ?? []).length)

    const ud = stores.userdata()
    const people = await inChunks(profiles, 10, async (p) => {
      const mine = events.filter((e) => e.uid === p.id)
      const index = (await ud.get(`${p.id}/dayindex`, { type: 'json' })) as DayIndex | null
      return {
        id: p.id,
        firstName: p.firstName,
        email: p.email,
        createdAt: p.createdAt,
        lastOpened: latestOpen.get(p.id)?.time ?? mine[0]?.time ?? null,
        daysActive30: new Set(mine.filter((e) => evDay(e) >= since(30)).map(evDay)).size,
        streak: streak(index?.dates ?? [], dayKey(new Date(), p.timeZone)).current,
        bestStreak: p.bestStreak ?? 0,
        foodsLogged30: mine.filter((e) => e.type === 'food_logged' && evDay(e) >= since(30)).length,
        fitnessConnected: !!p.fitnessLastSync,
        faceId: !!p.passkeyEnabled,
      }
    })

    const s = await settings()
    const oldest = months[0]
    const cutoff = monthsBack(13)[12]
    const promptDue = !s.lastPurgePrompt || Date.now() - new Date(s.lastPurgePrompt).getTime() > 30 * 86400_000
    const nameOf = new Map(profiles.map((p) => [p.id, p.firstName]))

    return json({
      overview: {
        totalUsers: profiles.length,
        activeToday: activeSet(today).size,
        activeWeek: activeSet(since(7)).size,
        activeMonth: activeSet(since(30)).size,
        newSignups30: profiles.filter((p) => p.createdAt >= new Date(Date.now() - 30 * 86400_000).toISOString()).length,
        dailyActive,
      },
      features: {
        logMethods: {
          search: count((e) => e.type === 'food_logged' && e.details?.method === 'search'),
          recent: count((e) => e.type === 'food_logged' && e.details?.method === 'recent'),
          favorite: count((e) => e.type === 'food_logged' && e.details?.method === 'favorite'),
          quick: count((e) => e.type === 'food_logged' && e.details?.method === 'quick'),
          custom: count((e) => e.type === 'food_logged' && e.details?.method === 'custom'),
        },
        fitnessConnected: profiles.filter((p) => p.fitnessLastSync).length,
        faceIdOn: profiles.filter((p) => p.passkeyEnabled).length,
        notificationsOn: pushCounts.filter((n) => n > 0).length,
        bars: prefs.filter((d) => d.macroDisplay !== 'rings').length,
        rings: prefs.filter((d) => d.macroDisplay === 'rings').length,
        dark: prefs.filter((d) => d.theme !== 'light').length,
        light: prefs.filter((d) => d.theme === 'light').length,
        activityTrack: profiles.filter((p) => p.activityMode === 'track').length,
        activityLevel: profiles.filter((p) => p.activityMode !== 'track').length,
        weightsLogged30: count((e) => e.type === 'weight_logged'),
        customFoods30: count((e) => e.type === 'custom_food_created'),
      },
      recent: events.slice(0, 50).map((e) => ({ ...e, name: nameOf.get(e.uid) ?? 'Someone' })),
      people,
      inviteCode: s.inviteCode ?? env('INVITE_CODE') ?? '',
      purgePrompt: !!oldest && oldest < cutoff && promptDue,
    })
  }

  if (r === 'person' && req.method === 'GET') {
    const uid = url.searchParams.get('uid') ?? ''
    const profile = await getProfile(uid)
    if (!profile) throw new HttpError(404, 'not_found', 'That person was not found.')
    const ud = stores.userdata()
    const today = dayKey(new Date(), profile.timeZone)
    const dayKeys = Array.from({ length: 14 }, (_, i) => addDays(today, -i))
    const [weights, dayindex, ...days] = await Promise.all([
      ud.get(`${uid}/weights`, { type: 'json' }),
      ud.get(`${uid}/dayindex`, { type: 'json' }),
      ...dayKeys.map((d) => ud.get(`${uid}/days/${d}`, { type: 'json' })),
    ])
    const events = (await eventsForMonths(monthsBack(2))).filter((e) => e.uid === uid).slice(0, 40)
    return json({ profile, weights, dayindex, days: days.filter(Boolean), events })
  }

  if (r === 'invite' && req.method === 'POST') {
    const { code } = await body<{ code: string }>(req)
    const clean = String(code ?? '').trim()
    if (clean.length < 4) throw new HttpError(400, 'short_code', 'Use at least 4 characters.')
    await stores.app().setJSON('settings', { ...(await settings()), inviteCode: clean })
    return json({ inviteCode: clean })
  }

  if (r === 'purge' && req.method === 'POST') {
    const { action } = await body<{ action: 'delete' | 'later' }>(req)
    const s = await settings()
    await stores.app().setJSON('settings', { ...s, lastPurgePrompt: new Date().toISOString() })
    if (action !== 'delete') return json({ ok: true, deleted: 0 })
    const cutoff = monthsBack(13)[12]
    const st = stores.events()
    let deleted = 0
    for (const m of (await monthsAvailable()).filter((m) => m < cutoff)) {
      const { blobs } = await st.list({ prefix: `${m}/` })
      for (const b of blobs) {
        await st.delete(b.key)
        deleted++
      }
    }
    return json({ ok: true, deleted })
  }

  throw new HttpError(404, 'not_found')
})
