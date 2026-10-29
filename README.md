# Crisp

A fast, neon-on-black macro tracker for iPhone, built as a Progressive Web App (PWA) on Netlify. For Kay and a few friends — never sold.

- 📋 **Spec:** [`docs/SPEC.md`](docs/SPEC.md) · 🎨 **Design:** [`docs/DESIGN.md`](docs/DESIGN.md) · ⌚ **Apple Fitness Shortcut:** [`docs/SHORTCUT.md`](docs/SHORTCUT.md)
- ✅ **Build plan:** GitHub **Issues → Milestones** (M1–M13).

## What's built

All of version 1 is in the code: accounts with invite code, optional Face ID (passkeys), onboarding with
maintenance-calorie math, the built-in USDA food library (~8,200 foods), logging (search, portions, Quick add,
shared custom foods, recents, favorites, swipe & press-and-hold actions, Undo), Home (streak flame, week strip,
calorie + macro bars or rings), Fitness (steps, workouts, Today | History, Apple Fitness Shortcut endpoint),
Weight (graph, estimate, milestones), Settings, the 8 PM streak reminder, offline sync, and the Admin dashboard.

What still needs you: the **Netlify setup below**, building the **Apple Shortcut** (`docs/SHORTCUT.md`), and the
**real-iPhone tests** at the end of each milestone (some things only work on the live site).

---

## Setting up Netlify (step by step)

You only do this once. Everything happens in your browser.

### 1. Import this repo
1. Go to **app.netlify.com** and sign in.
2. **Add new project → Import an existing project → GitHub** → pick **kayrow58/Crisp**.
3. Netlify reads the settings from `netlify.toml` (build command `npm run build`, publish directory `dist`). Click **Deploy**.

### 2. Name the site
**Project configuration → General → Project details → Change project name**, e.g. `crisp-kay` →
`https://crisp-kay.netlify.app`. ⚠️ Pick one you'll keep — Face ID sign-in is tied to this address.

### 3. Turn on Identity (accounts)
1. **Identity → Enable Identity**. (If Netlify won't let you, stop and tell Claude — see Risks in `docs/SPEC.md`.)
2. **Registration preferences → Invite only.** Friends join through Crisp's own invite-code screen.
3. **Emails → Autoconfirm → On** (no "confirm your email" step).
4. Leave password-recovery emails on.

### 4. Add environment variables
**Project configuration → Environment variables → Add a variable**, one at a time:

| Key | Value |
|---|---|
| `ADMIN_EMAILS` | Your email (the one you'll sign up with) |
| `INVITE_CODE` | The code friends type to sign up, e.g. `CRISP-2026` (you can change it later in Admin) |
| `SESSION_SECRET` | A long random string (Claude gave you one) — keeps sign-ins secure |
| `PASSKEY_RP_ID` | Your domain, e.g. `crisp-kay.netlify.app` (no `https://`) |
| `PASSKEY_ORIGIN` | Your full address, e.g. `https://crisp-kay.netlify.app` |
| `VAPID_PUBLIC_KEY` | Push notification key (Claude gave you one) |
| `VAPID_PRIVATE_KEY` | Push notification key (Claude gave you one) — keep private |
| `VAPID_SUBJECT` | `mailto:` + your email |
| `VITE_SHORTCUT_URL` | *(later)* the iCloud link to your Crisp Sync Shortcut |

> 🔒 This repo is **public**. Never put real emails, codes, or keys in the code — only here.

### 5. Redeploy
**Deploys → Trigger deploy → Deploy project.** Do this again whenever you change an environment variable.

### 6. Install on your iPhone
Open your `.netlify.app` address in **Safari** → **Share ↑ → Add to Home Screen → Add** → open **Crisp** from the Home Screen → **Create account** with your invite code.

---

## Test on the live site (real iPhone, opened from the Home Screen)

These can't be tested on a computer:

- **M1:** create account (with and without the right invite code), sign out, sign in, forgot password (the email link opens in Safari)
- **M2:** turn on Face ID, sign out, sign in with Face ID; try a second iPhone on the same Apple ID
- **M8:** the Apple Fitness Shortcut end to end
- **M11:** the 8 PM streak reminder (turn it on from the Home card or Settings)
- **M12:** sign in as a friend and confirm there's no Admin row

---

## For Claude Code (developer notes)

```bash
npm install
npm run dev              # local preview — Home Screen gate is off; sign-in needs the live site
npm test                 # calculation, streak, date and merge unit tests
npm run test:functions   # Netlify Functions against a local Blobs server (no Identity locally)
npm run typecheck        # app + functions
npm run build            # builds public/foods.json from USDA SR28, then the app
```

- Front end: React + TypeScript + Vite + `vite-plugin-pwa` (`src/`). Shared math/types: `shared/`.
- Server: Netlify Functions v2 in `netlify/functions/` (routes under `/api/*`), helpers in `netlify/lib/`, data in Netlify Blobs.
- Sessions: Netlify Identity checks passwords; Crisp issues its own signed 30-day token (`SESSION_SECRET`) so passkey sign-in works too.
- Food data: `scripts/build-foods.mjs` turns USDA SR Legacy (public domain, via the `fda-nutrient-database` package) into `public/foods.json`; common foods are boosted via `scripts/featured-foods.json`.
- Design tokens: `src/theme/tokens.css` (matches `docs/DESIGN.md`).
