import webpush from 'web-push'
import { env } from './http'
import { stores } from './stores'

export type Sub = { endpoint: string; keys: { p256dh: string; auth: string } }

let configured = false
function configure(): boolean {
  if (configured) return true
  const pub = env('VAPID_PUBLIC_KEY')
  const priv = env('VAPID_PRIVATE_KEY')
  if (!pub || !priv) return false
  webpush.setVapidDetails(env('VAPID_SUBJECT') ?? 'mailto:crisp@example.com', pub, priv)
  configured = true
  return true
}

/** Send a notification to every subscription a person has; drop ones Apple says are gone. */
export async function sendPush(uid: string, payload: { title: string; body: string; url?: string }): Promise<number> {
  if (!configure()) return 0
  const st = stores.push()
  const subs = ((await st.get(uid, { type: 'json' })) as Sub[] | null) ?? []
  const keep: Sub[] = []
  let sent = 0
  for (const sub of subs) {
    try {
      await webpush.sendNotification(sub, JSON.stringify(payload), { TTL: 3600 })
      keep.push(sub)
      sent++
    } catch (err) {
      const code = (err as { statusCode?: number }).statusCode
      if (code !== 404 && code !== 410) keep.push(sub)
    }
  }
  if (keep.length !== subs.length) await st.setJSON(uid, keep)
  return sent
}
