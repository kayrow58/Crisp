// Welcome · Sign in · Create account · Forgot password · Reset password (spec §3.2, §3.3, §3.10, §7).
import { useState } from 'react'
import { Button, Field, Note } from '../components/ui'
import { completeReset, passkeysSupported, requestReset, signIn, signInWithPasskey, signUp } from '../lib/auth'
import { errorMessage } from '../lib/api'

type View = 'welcome' | 'signin' | 'signup' | 'forgot'

export function AuthScreen() {
  const [view, setView] = useState<View>('welcome')
  return (
    <main className="auth">
      {view === 'welcome' && <Welcome go={setView} />}
      {view === 'signin' && <SignIn go={setView} />}
      {view === 'signup' && <SignUp go={setView} />}
      {view === 'forgot' && <Forgot go={setView} />}
    </main>
  )
}

function Welcome({ go }: { go: (v: View) => void }) {
  return (
    <div className="auth-welcome">
      <img src="/icons/icon-192.png" alt="" width={112} height={112} className="auth-logo" />
      <h1 className="auth-brand">Crisp</h1>
      <p className="auth-tag">Fast macro tracking. Keep the streak alive.</p>
      <div className="auth-actions">
        <Button onClick={() => go('signup')}>Create account</Button>
        <Button kind="secondary" onClick={() => go('signin')}>
          Sign in
        </Button>
      </div>
    </div>
  )
}

function SignIn({ go }: { go: (v: View) => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState<'pw' | 'pk' | null>(null)
  const [err, setErr] = useState('')
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErr('')
    setBusy('pw')
    try {
      await signIn(email, password)
    } catch (x) {
      setErr(errorMessage(x))
    } finally {
      setBusy(null)
    }
  }
  const faceId = async () => {
    setErr('')
    setBusy('pk')
    try {
      await signInWithPasskey()
    } catch (x) {
      setErr(errorMessage(x) + ' You can sign in with your password instead.')
    } finally {
      setBusy(null)
    }
  }
  return (
    <form className="auth-form" onSubmit={submit}>
      <button type="button" className="link auth-back" onClick={() => go('welcome')}>
        ‹ Back
      </button>
      <h1 className="large-title">Sign in</h1>
      {passkeysSupported() && (
        <>
          <Button type="button" onClick={faceId} busy={busy === 'pk'}>
            Sign in with Face ID
          </Button>
          <p className="auth-or">or use your password</p>
        </>
      )}
      <Field label="Email" type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      <Field label="Password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      {err && <Note tone="error">{err}</Note>}
      <Button type="submit" kind={passkeysSupported() ? 'secondary' : 'primary'} busy={busy === 'pw'}>
        Sign in
      </Button>
      <div className="auth-links">
        <button type="button" className="link" onClick={() => go('forgot')}>
          Forgot password?
        </button>
        <button type="button" className="link" onClick={() => go('signup')}>
          Create account
        </button>
      </div>
    </form>
  )
}

function SignUp({ go }: { go: (v: View) => void }) {
  const [f, setF] = useState({ firstName: '', email: '', password: '', invite: '' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<{ text: string; code?: string } | null>(null)
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value })
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErr(null)
    setBusy(true)
    try {
      await signUp(f.firstName.trim(), f.email, f.password, f.invite)
    } catch (x) {
      setErr({ text: errorMessage(x), code: (x as { code?: string }).code })
    } finally {
      setBusy(false)
    }
  }
  return (
    <form className="auth-form" onSubmit={submit}>
      <button type="button" className="link auth-back" onClick={() => go('welcome')}>
        ‹ Back
      </button>
      <h1 className="large-title">Create account</h1>
      <Field label="First name" autoComplete="given-name" value={f.firstName} onChange={set('firstName')} required />
      <Field label="Email" type="email" autoComplete="email" inputMode="email" value={f.email} onChange={set('email')} required />
      <Field label="Password" type="password" autoComplete="new-password" minLength={8} value={f.password} onChange={set('password')} hint="At least 8 characters" required />
      <Field label="Invite code" autoCapitalize="characters" autoComplete="off" value={f.invite} onChange={set('invite')} hint="Kay gave you this code" required />
      {err && (
        <Note tone="error">
          {err.text}{' '}
          {err.code === 'email_taken' && (
            <button type="button" className="link" onClick={() => go('signin')}>
              Sign in instead
            </button>
          )}
        </Note>
      )}
      <Button type="submit" busy={busy}>
        {err ? 'Try again' : 'Create account'}
      </Button>
    </form>
  )
}

function Forgot({ go }: { go: (v: View) => void }) {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [err, setErr] = useState('')
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setErr('')
    try {
      await requestReset(email)
      setSent(true)
    } catch (x) {
      setErr(errorMessage(x))
    } finally {
      setBusy(false)
    }
  }
  return (
    <form className="auth-form" onSubmit={submit}>
      <button type="button" className="link auth-back" onClick={() => go('signin')}>
        ‹ Back
      </button>
      <h1 className="large-title">Reset password</h1>
      {sent ? (
        <>
          <Note>Check your inbox for an email from Crisp. Tap the link — it opens in Safari, where you'll set a new password.</Note>
          <Button type="button" kind="secondary" onClick={() => go('signin')}>
            Back to sign in
          </Button>
        </>
      ) : (
        <>
          <Field label="Email" type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          {err && <Note tone="error">{err}</Note>}
          <Button type="submit" busy={busy}>
            Send reset email
          </Button>
        </>
      )}
    </form>
  )
}

/** Opened from the reset email, usually in Safari. */
export function ResetPassword() {
  const [pw, setPw] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [err, setErr] = useState('')
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (pw.length < 8) return setErr('Use at least 8 characters.')
    setBusy(true)
    setErr('')
    try {
      await completeReset(pw)
      setDone(true)
    } catch (x) {
      setErr(errorMessage(x))
    } finally {
      setBusy(false)
    }
  }
  return (
    <main className="auth">
      <form className="auth-form" onSubmit={submit}>
        <img src="/icons/icon-192.png" alt="" width={72} height={72} className="auth-logo auth-logo--small" />
        <h1 className="large-title">{done ? 'Done!' : 'Set a new password'}</h1>
        {done ? (
          <Note>Open Crisp from your Home Screen and sign in with your new password.</Note>
        ) : (
          <>
            <Field label="New password" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} hint="At least 8 characters" required />
            {err && <Note tone="error">{err}</Note>}
            <Button type="submit" busy={busy}>
              Save password
            </Button>
          </>
        )}
      </form>
    </main>
  )
}
