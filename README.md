# Crisp

A fast, neon-on-black macro tracker for iPhone, built as a Progressive Web App (PWA) on Netlify. For Kay and a few friends — never sold.

- 📋 **Full spec:** [`docs/SPEC.md`](docs/SPEC.md)
- 🎨 **Design system:** [`docs/DESIGN.md`](docs/DESIGN.md)
- ✅ **Build plan:** GitHub **Issues → Milestones** (M1–M13). Start with **M1 — Accounts first**.

> **Current state:** starter project only — theme colors, PWA manifest, placeholder icons, and an app shell with the tab bar. No features yet.

---

## Setting up Netlify (step by step)

You only do this once. Everything happens in your browser.

### 1. Import this repo
1. Go to **app.netlify.com** and sign in.
2. Click **Add new project → Import an existing project**.
3. Choose **GitHub**, authorize if asked, and pick **kayrow58/Crisp**.
4. Netlify reads the build settings from `netlify.toml` automatically. You should see:
   - Build command: `npm run build`
   - Publish directory: `dist`
5. Click **Deploy**.

### 2. Name the site
1. Open the new project → **Project configuration → General → Project details → Change project name**.
2. Pick something like `crisp-kay` → your address becomes **`https://crisp-kay.netlify.app`**.
3. ⚠️ Pick a name you'll keep. Face ID sign-in (passkeys) is tied to this address; changing it later means everyone sets up Face ID again.

### 3. Turn on Identity (accounts)
1. Open the project → **Identity** (or **Project configuration → Identity**) → **Enable Identity**.
2. **Registration preferences → Invite only.** (Friends sign up through Crisp's own invite-code screen, not Netlify's.)
3. **Emails → Confirmation email → turn on "Autoconfirm"** (so there's no "confirm your email" step).
4. Leave password-recovery emails on.

> If Netlify doesn't let you enable Identity on a new site, stop here and tell Claude — the spec lists this as the first thing to check (see Risks in `docs/SPEC.md`).

### 4. Add environment variables (secrets & settings)
Go to **Project configuration → Environment variables → Add a variable** and add:

| Key | Value |
|---|---|
| `ADMIN_EMAILS` | Your email address (the one you'll sign up with) |
| `INVITE_CODE` | The code friends type when they sign up, e.g. `CRISP-2026` |
| `PASSKEY_RP_ID` | Your site's domain, e.g. `crisp-kay.netlify.app` (no `https://`) |
| `PASSKEY_ORIGIN` | Your full address, e.g. `https://crisp-kay.netlify.app` |

Push-notification keys (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`) get added later in milestone **M11**; Claude Code will generate them and tell you exactly what to paste.

> 🔒 This repo is **public**. Never put real emails, invite codes, or keys in the code — only in Netlify's environment variables.

### 5. Redeploy
**Deploys → Trigger deploy → Deploy project** so the new settings take effect.

### 6. Try it on your iPhone
1. Open your `.netlify.app` address in **Safari** on your iPhone.
2. Tap **Share ↑ → Add to Home Screen → Add**.
3. Open **Crisp** from your Home Screen.

---

## Things you can only truly test on the live site

These won't work on a computer preview — always test them on your iPhone, opened from the Home Screen:

- Sign-up, sign-in, and password-reset emails (Netlify Identity doesn't run locally)
- Face ID / passkeys (need the real HTTPS address)
- Push notifications (need the app installed on the Home Screen, iOS 16.4+)
- The Apple Fitness Shortcut sync

---

## For Claude Code (developer notes)

```bash
npm install
npm run dev       # local preview (Home Screen gate is off in dev)
npm run build     # production build → dist/
```

- Stack: React + TypeScript + Vite + `vite-plugin-pwa`; Netlify Functions in `netlify/functions/`; Netlify Blobs for data.
- Follow the milestones in order; each one ends with a real-iPhone test.
- Design tokens live in `src/theme/tokens.css` and match `docs/DESIGN.md`.
- Keep all secrets in environment variables (public repo).
