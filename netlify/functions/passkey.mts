// Passkeys (Face ID / Touch ID) with SimpleWebAuthn. Spec §9.
import type { Config } from '@netlify/functions'
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server'
import { isoBase64URL } from '@simplewebauthn/server/helpers'
import { HttpError, body, env, handler, json, randomId, route } from '../lib/http'
import { issueToken, isAdmin, requireSession } from '../lib/session'
import { getProfile, saveProfile, stores } from '../lib/stores'
import { recordEvent } from '../lib/events'

export const config: Config = { path: '/api/passkey/*' }

interface StoredCred {
  id: string
  uid: string
  email: string
  publicKey: string
  counter: number
  transports?: string[]
  deviceName?: string
  createdAt: string
}

function rp(url: URL) {
  const rpID = env('PASSKEY_RP_ID') ?? url.hostname
  const origin = env('PASSKEY_ORIGIN') ?? `${url.protocol}//${url.host}`
  return { rpID, origin: [origin, `${url.protocol}//${url.host}`] }
}

const FIVE_MIN = 5 * 60_000

async function saveChallenge(id: string, challenge: string) {
  await stores.passkeys().setJSON(`challenge/${id}`, { challenge, exp: Date.now() + FIVE_MIN })
}

async function takeChallenge(id: string): Promise<string> {
  const s = stores.passkeys()
  const c = (await s.get(`challenge/${id}`, { type: 'json' })) as { challenge: string; exp: number } | null
  await s.delete(`challenge/${id}`)
  if (!c || c.exp < Date.now()) throw new HttpError(400, 'expired', 'That took too long. Please try again.')
  return c.challenge
}

export default handler(async (req, url) => {
  const r = route(url, '/api/passkey')
  const { rpID, origin } = rp(url)
  const pk = stores.passkeys()

  if (r === 'register-options' && req.method === 'POST') {
    const s = requireSession(req)
    const profile = await getProfile(s.uid)
    const existing = ((await pk.get(`user/${s.uid}`, { type: 'json' })) as string[] | null) ?? []
    const options = await generateRegistrationOptions({
      rpName: 'Crisp',
      rpID,
      userName: s.email,
      userDisplayName: profile?.firstName ?? s.email,
      userID: new TextEncoder().encode(s.uid),
      attestationType: 'none',
      excludeCredentials: existing.map((id) => ({ id })),
      authenticatorSelection: { residentKey: 'required', userVerification: 'preferred' },
    })
    await saveChallenge(`reg-${s.uid}`, options.challenge)
    return json({ options })
  }

  if (r === 'register-verify' && req.method === 'POST') {
    const s = requireSession(req)
    const b = await body<{ response: Parameters<typeof verifyRegistrationResponse>[0]['response']; deviceName?: string }>(req)
    const expectedChallenge = await takeChallenge(`reg-${s.uid}`)
    const v = await verifyRegistrationResponse({ response: b.response, expectedChallenge, expectedOrigin: origin, expectedRPID: rpID })
    if (!v.verified) throw new HttpError(400, 'not_verified', "Face ID setup didn't finish. Please try again.")
    const c = v.registrationInfo.credential
    const stored: StoredCred = {
      id: c.id,
      uid: s.uid,
      email: s.email,
      publicKey: isoBase64URL.fromBuffer(c.publicKey),
      counter: c.counter,
      transports: c.transports,
      deviceName: b.deviceName,
      createdAt: new Date().toISOString(),
    }
    await pk.setJSON(`cred/${c.id}`, stored)
    const list = ((await pk.get(`user/${s.uid}`, { type: 'json' })) as string[] | null) ?? []
    await pk.setJSON(`user/${s.uid}`, [...new Set([...list, c.id])])
    const profile = await getProfile(s.uid)
    if (profile) await saveProfile({ ...profile, passkeyEnabled: true })
    await recordEvent(s.uid, 'faceid_on')
    return json({ ok: true })
  }

  if (r === 'login-options' && req.method === 'POST') {
    const options = await generateAuthenticationOptions({ rpID, userVerification: 'preferred' })
    const challengeId = randomId()
    await saveChallenge(challengeId, options.challenge)
    return json({ options, challengeId })
  }

  if (r === 'login-verify' && req.method === 'POST') {
    const b = await body<{ challengeId: string; response: Parameters<typeof verifyAuthenticationResponse>[0]['response'] }>(req)
    const expectedChallenge = await takeChallenge(b.challengeId)
    const cred = (await pk.get(`cred/${b.response.id}`, { type: 'json' })) as StoredCred | null
    if (!cred) throw new HttpError(401, 'unknown_passkey', "Face ID isn't set up for this account anymore. Sign in with your password.")
    const v = await verifyAuthenticationResponse({
      response: b.response,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: {
        id: cred.id,
        publicKey: isoBase64URL.toBuffer(cred.publicKey),
        counter: cred.counter,
        transports: cred.transports as never,
      },
    })
    if (!v.verified) throw new HttpError(401, 'not_verified', "Face ID didn't work.")
    await pk.setJSON(`cred/${cred.id}`, { ...cred, counter: v.authenticationInfo.newCounter })
    const profile = await getProfile(cred.uid)
    if (!profile) throw new HttpError(401, 'signed_out', 'This account no longer exists.')
    await recordEvent(cred.uid, 'signed_in', { method: 'passkey' })
    return json({ token: issueToken(cred.uid, profile.email), profile, isAdmin: isAdmin(profile.email) })
  }

  if (r === 'disable' && req.method === 'POST') {
    const s = requireSession(req)
    const list = ((await pk.get(`user/${s.uid}`, { type: 'json' })) as string[] | null) ?? []
    for (const id of list) await pk.delete(`cred/${id}`)
    await pk.delete(`user/${s.uid}`)
    const profile = await getProfile(s.uid)
    if (profile) await saveProfile({ ...profile, passkeyEnabled: false })
    await recordEvent(s.uid, 'faceid_off')
    return json({ ok: true })
  }

  throw new HttpError(404, 'not_found')
})
