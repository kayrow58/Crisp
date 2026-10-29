// Scheduled hourly: at each person's reminder hour (default 8 PM local), if they haven't
// logged any food today, send one streak-saver notification (spec §8, M11).
import type { Config } from '@netlify/functions'
import { stores } from '../lib/stores'
import { sendPush } from '../lib/push'
import { dayKey, hourInZone } from '../../shared/dates'
import { streak } from '../../shared/calc'
import type { DayDoc, DayIndex, Profile } from '../../shared/types'

export const config: Config = { schedule: '@hourly' }

export default async () => {
  const now = new Date()
  const profiles = stores.profiles()
  const ud = stores.userdata()
  const { blobs } = await profiles.list()
  let sent = 0
  for (const { key } of blobs) {
    const p = (await profiles.get(key, { type: 'json' })) as Profile | null
    if (!p?.notif?.enabled) continue
    if (hourInZone(now, p.timeZone) !== (p.notif.hour ?? 20)) continue
    const today = dayKey(now, p.timeZone)
    const day = (await ud.get(`${p.id}/days/${today}`, { type: 'json' })) as DayDoc | null
    if (day?.foods?.length) continue
    const index = (await ud.get(`${p.id}/dayindex`, { type: 'json' })) as DayIndex | null
    const s = streak(index?.dates ?? [], today)
    const body =
      s.current > 0
        ? `Keep your 🔥 ${s.current}-day streak alive. Log something!`
        : 'Start a new streak today. Log something!'
    sent += await sendPush(p.id, { title: 'Crisp', body, url: '/' })
  }
  console.log(`streak-saver: sent ${sent}`)
}
