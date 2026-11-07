import webpush from 'web-push'
import { env } from './http'
import { listAll, stores } from './stores'

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

/**
 * Tell the app owner (only) that someone new joined. The owner is OWNER_EMAIL if set, otherwise the
 * first address in ADMIN_EMAILS. Shows the first name only — never the email — since it can sit on a lock screen.
 * Never throws: a failed ping must not break someone's sign-up.
 */
export async function notifyOwnerOfSignup(newUid: string, firstName: string): Promise<void> {
  try {
    const owner = (env('OWNER_EMAIL') ?? (env('ADMIN_EMAILS') ?? '').split(',')[0] ?? '').trim().toLowerCase()
    if (!owner) return
    const ids = await listAll(stores.profiles())
    let ownerUid: string | null = null
    for (const id of ids) {
      if (id === newUid) continue
      const p = (await stores.profiles().get(id, { type: 'json' })) as { email?: string } | null
      if (p?.email?.toLowerCase() === owner) {
        ownerUid = id
        break
      }
    }
    if (!ownerUid) return
    const name = firstName.split(/\s+/)[0].slice(0, 30) || 'Someone'
    await sendPush(ownerUid, {
      title: 'New Crisp sign-up 🎉',
      body: `${name} just joined. That's ${ids.length} ${ids.length === 1 ? 'person' : 'people'} on Crisp.`,
      url: '/',
    })
  } catch (err) {
    console.error('signup notify failed', err)
  }
}
