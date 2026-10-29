// Crisp session tokens: HMAC-signed, 30-day, sent as "Authorization: Bearer <token>".
// Issued after a password sign-in (checked by Netlify Identity) or a passkey sign-in.
import { createHmac, timingSafeEqual } from 'node:crypto'
import { HttpError, env, requireEnv } from './http'

export interface Session {
  uid: string
  email: string
  exp: number
}

const THIRTY_DAYS = 30 * 24 * 3600

function sign(payload: string): string {
  return createHmac('sha256', requireEnv('SESSION_SECRET')).update(payload).digest('base64url')
}

export function issueToken(uid: string, email: string): string {
  const payload = Buffer.from(
    JSON.stringify({ uid, email: email.toLowerCase(), exp: Math.floor(Date.now() / 1000) + THIRTY_DAYS }),
  ).toString('base64url')
  return `${payload}.${sign(payload)}`
}

export function readSession(req: Request): Session | null {
  const auth = req.headers.get('authorization') ?? ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  const [payload, sig] = token.split('.')
  if (!payload || !sig) return null
  const expected = sign(payload)
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  try {
    const s = JSON.parse(Buffer.from(payload, 'base64url').toString()) as Session
    if (!s.uid || s.exp < Date.now() / 1000) return null
    return s
  } catch {
    return null
  }
}

export function requireSession(req: Request): Session {
  const s = readSession(req)
  if (!s) throw new HttpError(401, 'signed_out', 'Please sign in again.')
  return s
}

export function adminEmails(): string[] {
  return (env('ADMIN_EMAILS') ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
}

export const isAdmin = (email: string) => adminEmails().includes(email.toLowerCase())

export function requireAdmin(req: Request): Session {
  const s = requireSession(req)
  if (!isAdmin(s.email)) throw new HttpError(403, 'not_admin', 'Admin only.')
  return s
}
