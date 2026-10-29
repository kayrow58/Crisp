// Push notification sign-ups (spec §10, M11).
import type { Config } from '@netlify/functions'
import { HttpError, body, env, handler, json, route } from '../lib/http'
import { requireSession } from '../lib/session'
import { stores } from '../lib/stores'
import { recordEvent } from '../lib/events'
import type { Sub } from '../lib/push'

export const config: Config = { path: '/api/push/*' }

export default handler(async (req, url) => {
  const r = route(url, '/api/push')

  if (r === 'key' && req.method === 'GET') {
    const publicKey = env('VAPID_PUBLIC_KEY')
    if (!publicKey) throw new HttpError(503, 'push_not_set_up', "Notifications aren't set up yet. Kay needs to add the VAPID keys in Netlify.")
    return json({ publicKey })
  }

  const s = requireSession(req)
  const st = stores.push()

  if (r === 'subscribe' && req.method === 'POST') {
    const { subscription } = await body<{ subscription: Sub }>(req)
    if (!subscription?.endpoint || !subscription.keys?.p256dh) throw new HttpError(400, 'bad_subscription', 'Invalid subscription.')
    const subs = ((await st.get(s.uid, { type: 'json' })) as Sub[] | null) ?? []
    await st.setJSON(s.uid, [...subs.filter((x) => x.endpoint !== subscription.endpoint), subscription].slice(-5))
    await recordEvent(s.uid, 'notifications_on')
    return json({ ok: true })
  }

  if (r === 'unsubscribe' && req.method === 'POST') {
    const { endpoint } = await body<{ endpoint?: string }>(req)
    const subs = ((await st.get(s.uid, { type: 'json' })) as Sub[] | null) ?? []
    await st.setJSON(s.uid, endpoint ? subs.filter((x) => x.endpoint !== endpoint) : [])
    await recordEvent(s.uid, 'notifications_off')
    return json({ ok: true })
  }

  throw new HttpError(404, 'not_found')
})
