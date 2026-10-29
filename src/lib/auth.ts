// Sign-up / sign-in / Face ID / password reset (spec §3.2–3.3, §3.10, §9).
import { startAuthentication, startRegistration, browserSupportsWebAuthn } from '@simplewebauthn/browser'
import { api } from './api'
import { signedIn, updateProfile, type AuthResult } from './store'

const tz = () => Intl.DateTimeFormat().resolvedOptions().timeZone

export async function signUp(firstName: string, email: string, password: string, inviteCode: string) {
  const r = await api<AuthResult>('/api/auth/signup', { body: { firstName, email, password, inviteCode, timeZone: tz() }, auth: false })
  await signedIn(r)
}

export async function signIn(email: string, password: string) {
  const r = await api<AuthResult>('/api/auth/login', { body: { email, password }, auth: false })
  await signedIn(r)
}

export const passkeysSupported = () => {
  try {
    return browserSupportsWebAuthn()
  } catch {
    return false
  }
}

export async function signInWithPasskey() {
  const { options, challengeId } = await api<{ options: Parameters<typeof startAuthentication>[0]['optionsJSON']; challengeId: string }>(
    '/api/passkey/login-options',
    { body: {}, auth: false },
  )
  let response
  try {
    response = await startAuthentication({ optionsJSON: options })
  } catch {
    throw new Error("Face ID didn't work.")
  }
  const r = await api<AuthResult>('/api/passkey/login-verify', { body: { challengeId, response }, auth: false })
  await signedIn(r)
}

export async function registerPasskey() {
  const { options } = await api<{ options: Parameters<typeof startRegistration>[0]['optionsJSON'] }>('/api/passkey/register-options', { body: {} })
  let response
  try {
    response = await startRegistration({ optionsJSON: options })
  } catch {
    throw new Error("Face ID setup didn't finish. You can try again in Settings.")
  }
  await api('/api/passkey/register-verify', { body: { response, deviceName: navigator.platform || 'iPhone' } })
  updateProfile({ passkeyEnabled: true })
}

export async function disablePasskey() {
  await api('/api/passkey/disable', { body: {} })
  updateProfile({ passkeyEnabled: false })
}

// Password reset goes through Netlify Identity's own email (loaded only when needed).
export async function requestReset(email: string) {
  const { requestPasswordRecovery } = await import('@netlify/identity')
  try {
    await requestPasswordRecovery(email.trim().toLowerCase())
  } catch {
    throw new Error("We couldn't send the reset email. Check the address and try again.")
  }
}

export const hasRecoveryToken = () => /recovery_token=/.test(location.hash)

export async function completeReset(newPassword: string) {
  const token = new URLSearchParams(location.hash.slice(1)).get('recovery_token') ?? ''
  const { recoverPassword } = await import('@netlify/identity')
  try {
    await recoverPassword(token, newPassword)
  } catch {
    throw new Error('This reset link has expired. Request a new one from the Crisp sign-in screen.')
  }
  history.replaceState(null, '', location.pathname)
}

export async function changePassword(current: string, next: string) {
  await api('/api/auth/change-password', { body: { current, next } })
}

export async function deleteAccount() {
  await api('/api/auth/delete', { body: { confirm: 'DELETE' } })
}
