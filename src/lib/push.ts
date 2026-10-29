// Notifications opt-in (spec §3.11). Only called from a tap.
import { api } from './api'
import { updateProfile } from './store'

export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

function b64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4)
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  const out = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

export async function enableNotifications(hour = 20) {
  if (!pushSupported()) throw new Error('Notifications need Crisp to be opened from your Home Screen (iOS 16.4 or later).')
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') throw new Error('Notifications are turned off for Crisp. You can allow them in iPhone Settings → Notifications → Crisp.')
  const { publicKey } = await api<{ publicKey: string }>('/api/push/key', { auth: false })
  const reg = await navigator.serviceWorker.ready
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(publicKey) }))
  await api('/api/push/subscribe', { body: { subscription: sub.toJSON() } })
  updateProfile({ notif: { enabled: true, hour } })
}

export async function disableNotifications() {
  try {
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    await api('/api/push/unsubscribe', { body: { endpoint: sub?.endpoint } })
    await sub?.unsubscribe()
  } catch {
    /* still turn it off in the profile */
  }
}
