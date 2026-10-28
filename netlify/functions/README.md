# Netlify Functions

Server code for Crisp lives here. Each file becomes an endpoint at `/.netlify/functions/<name>`.
Use Netlify Functions v2 (`export default async (req: Request, context: Context) => …`).

Planned functions (see `docs/SPEC.md` §8):

| Function | Milestone | Purpose |
|---|---|---|
| `signup` | M1 | Check invite code, create Identity user (autoconfirmed), create profile |
| `passkey-register-options` / `passkey-register-verify` | M2 | Passkey registration (SimpleWebAuthn) |
| `passkey-login-options` / `passkey-login-verify` | M2 | Passkey sign-in |
| `foods` | M5 | Shared custom foods (creator-only edit/delete) |
| `sync` | M7 | Load/save the user's own data (conditional writes) |
| `fitness` | M8 | Receive Apple Shortcut data (auth by personal sync code) |
| `push-subscribe` | M11 | Save/remove push subscriptions |
| `streak-saver` (scheduled, hourly) | M11 | 8 PM local streak reminder |
| `events` | M12 | Record usage events |
| `admin` | M12 | Dashboard data + invite code (`ADMIN_EMAILS` only, checked on the server) |

Rules:
- Every function verifies the signed-in user and only touches that user's data (except `admin` and shared `foods`).
- Secrets and settings come from environment variables — never hard-code them (public repo).
- Use conditional writes for anything two devices could change at once.
