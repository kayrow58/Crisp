// Fetch wrapper for Crisp's Netlify Functions. Sends the session token and turns errors
// into plain-language messages (spec §7: never a bare "Something went wrong").

const TOKEN_KEY = 'crisp.token'

export const token = {
  get: () => {
    try {
      return localStorage.getItem(TOKEN_KEY)
    } catch {
      return null
    }
  },
  set: (t: string | null) => {
    try {
      if (t) localStorage.setItem(TOKEN_KEY, t)
      else localStorage.removeItem(TOKEN_KEY)
    } catch {
      /* private mode */
    }
  },
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public data?: unknown,
  ) {
    super(message)
  }
}

let onSignedOut: (() => void) | null = null
export const setSignedOutHandler = (fn: () => void) => (onSignedOut = fn)

export async function api<T = unknown>(path: string, opts: { method?: string; body?: unknown; auth?: boolean } = {}): Promise<T> {
  const headers: Record<string, string> = {}
  if (opts.body !== undefined) headers['content-type'] = 'application/json'
  const t = token.get()
  if (t && opts.auth !== false) headers.authorization = `Bearer ${t}`
  let res: Response
  try {
    res = await fetch(path, {
      method: opts.method ?? (opts.body !== undefined ? 'POST' : 'GET'),
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    })
  } catch {
    throw new ApiError(0, 'offline', "You're offline. Try again when you have a connection.")
  }
  const text = await res.text()
  if (res.ok && !(res.headers.get('content-type') ?? '').includes('json')) {
    // e.g. a local preview with no Netlify Functions: the server answered with the app's HTML.
    throw new ApiError(503, 'no_server', "Crisp's server isn't reachable here. Sign-in and syncing only work on the live Netlify site.")
  }
  let data: Record<string, unknown> = {}
  try {
    data = text ? JSON.parse(text) : {}
  } catch {
    /* non-JSON (e.g. a 404 page) */
  }
  if (!res.ok) {
    if (res.status === 401 && data.error === 'signed_out') onSignedOut?.()
    const fallback =
      res.status === 404
        ? "Crisp's server isn't reachable here. If this is a preview on a computer, sign-in only works on the live Netlify site."
        : 'The server had a problem. Please try again in a moment.'
    throw new ApiError(res.status, String(data.error ?? 'http_' + res.status), String(data.message ?? fallback), data)
  }
  return data as T
}

export const errorMessage = (e: unknown) =>
  e instanceof ApiError ? e.message : e instanceof Error && e.message ? e.message : 'That didn’t work. Please try again.'
