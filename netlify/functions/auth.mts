// Accounts: sign-up with invite code, sign-in, current user, change password, delete account.
import type { Config } from '@netlify/functions'
import { admin, login, AuthError } from '@netlify/identity'
import { HttpError, body, env, handler, json, randomId, route } from '../lib/http'
import { issueToken, isAdmin, requireSession } from '../lib/session'
import { getProfile, listAll, saveProfile, stores } from '../lib/stores'
import { recordEvent } from '../lib/events'
import { newProfile } from '../../shared/types'

export const config: Config = { path: '/api/auth/*' }

async function currentInviteCode(): Promise<string> {
  const s = (await stores.app().get('settings', { type: 'json' })) as { inviteCode?: string } | null
  return (s?.inviteCode ?? env('INVITE_CODE') ?? '').trim()
}

const norm = (s: unknown) => String(s ?? '').trim()

async function ensureFitnessCode(uid: string): Promise<string> {
  const code = randomId(18)
  await stores.fitnesscodes().set(code, uid)
  return code
}

export default handler(async (req, url) => {
  const r = route(url, '/api/auth')

  if (r === 'signup' && req.method === 'POST') {
    const b = await body<{ firstName: string; email: string; password: string; inviteCode: string; timeZone: string }>(req)
    const firstName = norm(b.firstName)
    const email = norm(b.email).toLowerCase()
    const password = String(b.password ?? '')
    if (!firstName) throw new HttpError(400, 'need_name', 'Please enter your first name.')
    if (!/^\S+@\S+\.\S+$/.test(email)) throw new HttpError(400, 'bad_email', "That email doesn't look right.")
    if (password.length < 8) throw new HttpError(400, 'short_password', 'Use at least 8 characters for your password.')
    const code = await currentInviteCode()
    if (!code) throw new HttpError(500, 'missing_env', 'No invite code is set up yet. Ask Kay to add INVITE_CODE in Netlify.')
    if (norm(b.inviteCode).toUpperCase() !== code.toUpperCase())
      throw new HttpError(403, 'bad_invite', "That invite code doesn't match. Check with Kay.")

    let user
    try {
      user = await admin.createUser({ email, password, data: { user_metadata: { full_name: firstName } } })
    } catch (err) {
      const e = AuthError.from(err)
      if (e.status === 422 || e.status === 400 || /already|exists|registered/i.test(e.message))
        throw new HttpError(409, 'email_taken', "We couldn't create your account. That email may already be in use.")
      console.error('createUser failed', e.status, e.message)
      throw new HttpError(502, 'identity_failed', "We couldn't create your account right now. Make sure Identity is turned on in Netlify, then try again.")
    }
    const profile = newProfile(user.id, email, firstName, norm(b.timeZone))
    profile.fitnessCode = await ensureFitnessCode(user.id)
    await saveProfile(profile)
    await recordEvent(user.id, 'signed_up')
    return json({ token: issueToken(user.id, email), profile, isAdmin: isAdmin(email) })
  }

  if (r === 'login' && req.method === 'POST') {
    const b = await body<{ email: string; password: string }>(req)
    const email = norm(b.email).toLowerCase()
    let user
    try {
      user = await login(email, String(b.password ?? ''))
    } catch (err) {
      const e = AuthError.from(err)
      if (e.status === 400 || e.status === 401 || e.status === 422)
        throw new HttpError(401, 'wrong_password', "That email and password don't match.")
      console.error('login failed', e.status, e.message)
      throw new HttpError(502, 'identity_failed', "We couldn't reach the sign-in service. Please try again.")
    }
    let profile = await getProfile(user.id)
    if (!profile) {
      profile = newProfile(user.id, email, user.name ?? email.split('@')[0], 'America/Chicago')
      profile.fitnessCode = await ensureFitnessCode(user.id)
      await saveProfile(profile)
    }
    await recordEvent(user.id, 'signed_in', { method: 'password' })
    return json({ token: issueToken(user.id, email), profile, isAdmin: isAdmin(email) })
  }

  if (r === 'me' && req.method === 'GET') {
    const s = requireSession(req)
    const profile = await getProfile(s.uid)
    if (!profile) throw new HttpError(401, 'signed_out', 'Please sign in again.')
    return json({ profile, isAdmin: isAdmin(s.email) })
  }

  if (r === 'change-password' && req.method === 'POST') {
    const s = requireSession(req)
    const b = await body<{ current: string; next: string }>(req)
    if (String(b.next ?? '').length < 8) throw new HttpError(400, 'short_password', 'Use at least 8 characters.')
    try {
      await login(s.email, String(b.current ?? ''))
    } catch {
      throw new HttpError(401, 'wrong_password', "Your current password doesn't match.")
    }
    await admin.updateUser(s.uid, { password: String(b.next) })
    return json({ ok: true })
  }

  if (r === 'delete' && req.method === 'POST') {
    const s = requireSession(req)
    const b = await body<{ confirm: string }>(req)
    if (b.confirm !== 'DELETE') throw new HttpError(400, 'confirm', 'Type DELETE to confirm.')
    const profile = await getProfile(s.uid)
    // Remove personal data
    const ud = stores.userdata()
    for (const k of await listAll(ud, `${s.uid}/`)) await ud.delete(k)
    const pk = stores.passkeys()
    const creds = ((await pk.get(`user/${s.uid}`, { type: 'json' })) as string[] | null) ?? []
    for (const id of creds) await pk.delete(`cred/${id}`)
    await pk.delete(`user/${s.uid}`)
    await stores.push().delete(s.uid)
    if (profile?.fitnessCode) await stores.fitnesscodes().delete(profile.fitnessCode)
    await stores.profiles().delete(s.uid)
    try {
      await admin.deleteUser(s.uid)
    } catch (err) {
      console.error('deleteUser failed', err)
    }
    await recordEvent(s.uid, 'account_deleted')
    return json({ ok: true })
  }

  throw new HttpError(404, 'not_found')
})
