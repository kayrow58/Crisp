// Small helpers shared by all Netlify Functions.

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message?: string,
  ) {
    super(message ?? code)
  }
}

export function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers },
  })
}

export function fail(status: number, code: string, message?: string): Response {
  return json({ error: code, message: message ?? code }, status)
}

export async function body<T = Record<string, unknown>>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T
  } catch {
    throw new HttpError(400, 'bad_json', 'The request body was not valid JSON.')
  }
}

/** Wrap a handler so thrown HttpErrors become JSON responses and anything else becomes a 500. */
export function handler(fn: (req: Request, url: URL) => Promise<Response>) {
  return async (req: Request) => {
    const url = new URL(req.url)
    try {
      return await fn(req, url)
    } catch (err) {
      if (err instanceof HttpError) return fail(err.status, err.code, err.message)
      console.error(err)
      return fail(500, 'server_error', 'Something on the server failed. Please try again.')
    }
  }
}

/** Last path segment after the function's base path, e.g. /api/auth/login → "login". */
export function route(url: URL, base: string): string {
  return url.pathname.replace(base, '').replace(/^\/+|\/+$/g, '')
}

export function randomId(bytes = 16): string {
  const arr = new Uint8Array(bytes)
  crypto.getRandomValues(arr)
  return Buffer.from(arr).toString('base64url')
}

export function env(name: string): string | undefined {
  // Netlify.env is available in Functions v2; fall back to process.env for local tools.
  const g = globalThis as { Netlify?: { env: { get(n: string): string | undefined } } }
  return g.Netlify?.env.get(name) ?? process.env[name]
}

export function requireEnv(name: string): string {
  const v = env(name)
  if (!v) throw new HttpError(500, 'missing_env', `The ${name} setting is missing in Netlify environment variables.`)
  return v
}
