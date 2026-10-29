import { stores } from './stores'
import { monthKey } from '../../shared/dates'
import { randomId } from './http'

export interface AppEvent {
  uid: string
  type: string
  details?: Record<string, unknown>
  time: string
}

export async function recordEvent(uid: string, type: string, details?: Record<string, unknown>, at = new Date()) {
  const ev: AppEvent = { uid, type, details, time: at.toISOString() }
  try {
    await stores.events().setJSON(`${monthKey(at)}/${at.getTime()}-${randomId(4)}`, ev)
  } catch (err) {
    // Tracking must never break the app.
    console.error('event failed', err)
  }
}
