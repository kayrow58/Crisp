# Crisp — App Specification (v1)

Status: **Approved** · Source of truth for the build. Design details also live in [`DESIGN.md`](DESIGN.md).

---

## 1. Overview

**Crisp** is a macro-counting Progressive Web App (PWA) for Kay and a few friends, installed to the iPhone Home Screen. It makes logging food fast (under 10 seconds, one-handed), keeps people consistent with a Duolingo-style 🔥 streak, adjusts each day's calorie allowance for logged activity, and tracks weight over time without putting it front and center.

- **Problem:** existing trackers are cluttered or paid; Kay wants a fast, good-looking, private-to-the-group tracker built on her own Netlify stack.
- **Users:** Kay (admin) + a few invited friends. Friends cannot see each other's data.
- **Never sold.** No monetization, no App Store.

---

## 2. Scope

### Version 1
- Accounts: first name, email, password, **invite code**; no email confirmation. Optional passkey (Face ID / Touch ID / phone passcode).
- Onboarding: units → about you (sex, age, height, current weight) → goal (lose/maintain/gain) → goal weight (healthy BMI 18.5–24.9 range shown as a suggestion) → activity mode → plan summary.
- Targets: Mifflin-St Jeor maintenance; **protein-first** macros (0.8 g/lb goal weight, ~30% fat, carbs = remainder). Fully adjustable.
- Informational guardrails (never blocking).
- Two activity modes: **Set my activity level** or **Track my activity** (workouts add 50% of calories burned; steps add formula calories at 100%).
- Food logging: bundled USDA library (~8,200 foods from SR Legacy, with ~115 common foods boosted in search), search, portion card, recents, favorites, Quick add, shared custom foods.
- Home: streak, week strip, combined calorie + P/C/F card (bars default, rings optional), meals.
- Fitness tab: Today | History, manual steps/workouts, Apple Fitness sync via shareable Apple Shortcut.
- Weight tab: entries, line/bar graph with ranges, **estimated weight change** card, milestone pop-ups (15/25/50/75/100%).
- One push notification: **8 PM streak-saver**.
- Settings incl. theme (Dark/Light/System), display options, units, notifications, security, delete account.
- Admin dashboard (view-only + change invite code).
- Offline support; Home Screen install required.

### Later
Saved meals · streak freezes · additional reminder notifications · data export.

### Not doing
Photo/AI food estimates · barcode scanning · icon badge · sharing · widgets / Live Activities / Siri / Apple Watch (not possible for iOS PWAs).

---

## 3. User flows

**3.1 Install (first visit in Safari)**
Open link in Safari → full-screen guide: "Add Crisp to your Home Screen" (1. Tap Share ↑ · 2. Tap Add to Home Screen ⊞ · 3. Tap Add) → user opens Crisp from Home Screen. No skip link (disabled only in development builds).

**3.2 Sign-up & onboarding**
Welcome → Create account (first name, email, password, invite code) → "Unlock with Face ID?" [Turn on] [Skip] → Units → About you → Goal → Goal weight (healthy range shown; gentle note if below range) → Activity mode (Set level: sedentary/light/active/very active · or Track my activity) → Your plan (calories + P/C/F) [Looks good] [Adjust] → Home. Current weight saved as first weigh-in.

**3.3 Everyday sign-in**
Crisp stays signed in for 30 days. On a new sign-in: Face ID (passkey) if set up, else email + password.

**3.4 Log a food (core loop)**
Tap center (+) → log sheet opens with keyboard ready; meal auto-picked by time (before 11 AM Breakfast · 11–4 Lunch · 4–9 Dinner · else Snacks) → type → tap food → portion card (amount stepper, unit picker, live macros, meal picker) → Add → sheet closes, Home bars grow, toast "✓ Added to Lunch · Undo". Fast path: tap ⊕ on a Recent/Favorite to re-log last portion.

**3.5 Quick add / Create food**
From log sheet: ⚡ Quick add (calories + P/C/F, optional name) or ＋ Create food (name, serving, cal, P, C, F → saved to the shared library, shows creator).

**3.6 Log activity**
Fitness → + Steps or + Workout (type, minutes, calories) → allowance updates (Track mode). Or Apple Fitness syncs nightly via Shortcut.

**3.7 Connect Apple Fitness**
Settings → Connect Apple Fitness → guide shows personal sync code (copy button) → [Add Shortcut] opens iCloud Shortcut link → user taps Add Shortcut, pastes code, allows Health access → guide walks through creating a daily 9 PM personal automation → done. "Last synced" shown on Fitness.

**3.8 Log weight**
Weight → + Add weight → number pad prefilled with last weight → Save → graph updates; if a milestone is crossed, milestone pop-up.

**3.9 Fix a past day**
Home → tap a day in the week strip (or swipe for earlier weeks) → log/edit as usual.

**3.10 Forgot password**
Sign-in → Forgot password → email link opens Crisp-styled reset page in Safari → set new password → "Done! Open Crisp from your Home Screen and sign in."

**3.11 Notifications opt-in**
After first streak day, Home card: "Want a heads-up at 8 PM if you haven't logged yet?" [Turn on] → iOS permission prompt → subscribed. [No thanks] dismisses.

---

## 4. Screens

**Tab bar (all main screens):** Home · Fitness · **(+)** · Weight · Settings. Black, thin top divider; center (+) is a 56 pt neon-green circle. Active tab icon solid neon green; others gray outline. Always visible.

### 4.1 Home
- Large title "Today" (shrinks on scroll) + 🔥 streak count (flame tier by length).
- Week strip: 7 day bubbles, dot on days with food logged; tap to switch day, swipe for earlier weeks.
- Stat card (#121212): calorie bar with "900 / 1,600" (tap toggles to "700 left"), P/C/F bars with grams (e.g. "80/120 g"). Rings instead of bars if chosen in Settings. Over target: striped orange tip + "+120 over".
- Cards when relevant: lost-streak card, notification opt-in card. (Apple Fitness stale card is on Fitness only.)
- Meals: Breakfast / Lunch / Dinner / Snacks rows with calories and ›.
- On scroll: slim calorie bar sticks under the small title.
- Empty: 🍽 "Fresh day. What's first?" [+ Log food].

### 4.2 Meal screen (pushed)
Title = meal name + total. List of foods (name, portion, cal, P/C/F). + to add (opens log sheet with this meal). Swipe/long-press actions per §5. Empty: "Nothing for dinner yet." [+ Add to Dinner].

### 4.3 Log sheet (from +)
Drag handle · "Log to: Lunch ▾" · 🔍 search · [⚡ Quick add] [＋ Create food] · RECENT (⊕) · FAVORITES ★ (⊕). No results: "No match for '…'." [＋ Create it] [⚡ Quick add]. New user: "Foods you log will show up here."

### 4.4 Portion card / Quick add / Create food / Add steps / Add workout / Add weight
All bottom sheets. Number pad for numeric fields; big neon Save/Add above keyboard.

### 4.5 Fitness
Segmented **[ Today | History ]**, "Last synced …" label.
- Today: balance card — Eaten 1,450 / Allowed 2,000 · Base 1,600 + Steps 200 + Workout 200 (in Set-level mode, activity shown for reference only); Steps row; Workouts list; [+ Steps] [+ Workout]. Stale card after 2 days without sync: "Apple Fitness hasn't synced in 2 days" [Fix it] [Enter manually]. Empty: 👟 "No activity yet today."
- History: grouped by day (steps + workouts). Empty: "Your activity history starts here."

### 4.6 Weight
Latest weight + date · range buttons [W] [M] [3M] [Y] [All] · graph (line default, bar optional; touch-and-drag shows date + weight) · **Estimate card**: "Estimated from your logs: ≈ −0.14 lb today · ≈ −1.1 lb this week ⓘ" + note: "This is an estimate. It's only as accurate as your food and activity logging and your maintenance calories. Daily weigh-ins also move with water, salt, and other factors." · entry list (swipe to edit/delete) · [+ Add weight]. Empty: ⚖ "Add your first weigh-in to start your graph." One entry: "One more weigh-in and your graph comes to life."

### 4.7 Milestone pop-up
Centered card over dimmed screen, neon confetti, big percentage, message, [Keep going]. 15–50%: calm coach. 75%: hype. 100%: big celebration + "Switch to Maintain?" Never shows starting weight.

### 4.8 Settings (grouped list)
- PROFILE & GOALS: My Profile › · Goal & Targets › · Activity Mode ›
- APPEARANCE: Theme (Dark/Light/System) · Macro display (Bars/Rings) · Weight graph (Line/Bar) · Units (lb·ft / kg·cm)
- NOTIFICATIONS: Streak reminder (on/off, time — default 8 PM)
- CONNECTIONS: Connect Apple Fitness ›
- SECURITY: Face ID / Passkey [toggle] · Change password ›
- ADMIN (only `ADMIN_EMAILS`): Admin Dashboard ›
- Sign out · Delete my account (type DELETE)

### 4.9 Admin dashboard (collapsible sections)
- ▸ **Overview:** total users, active today/week/month, new sign-ups, daily-active chart.
- ▸ **Feature usage:** logging method split (search / recent / favorite / quick add), Apple Fitness connected count, bars vs rings, dark vs light, notification opt-ins.
- ▸ **Recent activity:** group feed ("Sam logged lunch · 2 min ago").
- ▸ **People:** each person expandable → usage (last opened, days active, streak, foods logged), features, activity feed, and their full data (foods, weight, goals).
- **Invite code:** view and change.
- Pop-up when events are older than 12 months: "Delete it?" [Delete] [Keep for now] (re-asks after a month).
- View-only otherwise.

### 4.10 Install guide · Reset password page (Safari) · Onboarding screens
As in §3.

---

## 5. Interaction spec

| Element | Gesture | What happens | Feedback | Reference |
|---|---|---|---|---|
| Buttons & cards | Press | Action | Scale 0.97 + dim, spring back | App Store |
| List rows | Tap | Push next screen | Gray highlight, slide from right | Settings |
| Center (+) | Tap | Log sheet ~full height | Spring up, keyboard focused | Apple Maps |
| Log sheet | Drag down / tap dim | Close (confirm if text typed) | Follows finger | Maps |
| Search result | Tap | Portion card | Live macros | — |
| Recent/Favorite ⊕ | Tap | Re-log last portion | Toast + Undo | — |
| Portion Add | Tap | Save, close sheet | Bars grow (~0.6 s), number counts up, toast "✓ Added to Lunch · Undo" (4 s) | Apple Fitness |
| Logged food | Tap | Edit portion | — | — |
| Logged food | Swipe left | Delete; full swipe = instant | Red #FF453A, Undo toast | Mail |
| Logged food | Swipe right | Toggle ★ Favorite | Yellow | Mail |
| Logged food | Long-press | Menu: Edit portion · Move to… · Copy to today · Favorite · Delete | Row lifts | Photos |
| Pushed screens | ‹ Back / left-edge swipe | Back | Screen tracks finger | Native iOS |
| Stat card | Tap | Eaten ↔ left (remembered) | Crossfade | — |
| Week strip | Tap / swipe | Change day / week | Slide | Apple Fitness |
| Home, Fitness | Pull down | Refresh synced data | Neon spinner → "✓ Up to date" | Mail |
| Home | Scroll | Large title collapses; mini calorie bar sticks | — | Settings |
| Tabs | Tap | Switch tab | Instant crossfade (no sideways swipe) | iOS |
| First food of the day | — | Streak +1 | Flame flares, number rolls (~1 s) | Duolingo |
| Lost streak | Open app | Card "New streak starts today — your best is X days" | Gray flame until logged | — |
| Weight milestone | Save weight | Pop-up | Confetti | — |
| Weight graph | Touch & drag | Show date + weight | Scrubber dot | Apple Health |
| Number fields | Tap | Number pad; weight prefilled | Neon outline, Save above keyboard | — |
| Offline → online | — | Sync | "Offline" pill → spin → ✓ → slides away | — |

**Motion:** quick springy — ~0.35 s for screens/sheets, ~0.6 s for bar growth. Launch: C logo fades as bars sweep in (~0.6 s). With **Reduce Motion**: simple fades only, no confetti, no sweep, no flare.

**Flame tiers:** 1–6 small · 7–29 medium · 30–99 large · 100+ large with constant glow.

**Undo vs confirm**
- Instant + Undo (4 s): delete logged food, weight entry, workout/steps; remove favorite.
- Confirm first: delete own shared custom food, change activity mode, turn off Face ID, sign out, delete account (type DELETE).

**No haptics** (not reliable on iOS web) — all feedback is visual.

---

## 6. Design system

See [`DESIGN.md`](DESIGN.md) for the full token tables, type scale, and component specs.

---

## 7. States

- **Install:** Home Screen required (§3.1). Disabled in development builds only.
- **Empty:** per screen in §4.
- **Loading:** shimmer placeholders; most screens render instantly from IndexedDB.
- **Errors (plain words + next step):**
  - Sign-up failed: "We couldn't create your account. That email may already be in use." [Sign in instead] [Try again]
  - Wrong invite code: "That invite code doesn't match. Check with Kay." [Try again]
  - Wrong password: "That password doesn't match." [Try again] Forgot password? ›
  - Sync failed: "Couldn't sync. Your logs are safe on this phone." [Retry] (auto-retries)
  - Face ID failed: "Face ID didn't work." [Use password instead]
  - Never a bare "Something went wrong."
- **Offline:** everything works; changes queue in IndexedDB; "Offline" pill; on reconnect, sync animation then pill hides.
- **Apple Fitness stale:** card after 2 days (§4.5).
- **Day boundary:** a day runs 3:00 AM → 2:59 AM in the user's phone time zone (applies to logs and streak).
- **Permissions:** Face ID offered on its onboarding screen after explaining why; notifications only after the opt-in card is tapped; Apple Health permission handled by the Shortcuts app.

---

## 8. Data model, storage & backend

### What lives where
- **Server (Netlify Blobs) + IndexedDB copy:** profile/goals/targets, food logs, weights, steps/workouts, favorites/recents, streak + best streak, shared custom foods, passkey public keys, push subscriptions, usage events.
- **Phone only (IndexedDB/localStorage):** bundled food library, theme, bars/rings, graph style, eaten↔left preference, offline write queue.
- No export in V1 (nothing important is phone-only).

### Blob stores & keys
| Store | Key | Contents |
|---|---|---|
| profiles | `{userId}` | first name, email, sex, birth year, height, units, goal, goal weight, activity mode/level, targets (cal, P, C, F; manual override flags), best streak, current streak, fitness sync code, time zone, notification prefs, created |
| userdata | `{userId}/days/{YYYY-MM-DD}` | foods [id, foodRef, name, meal, portion, unit, cal, P, C, F, loggedAt]; steps {count, source}; workouts [id, type, minutes, cal, source manual/shortcut] |
| userdata | `{userId}/weights` | [{date, weight}] |
| userdata | `{userId}/favorites`, `{userId}/recents`, `{userId}/dayindex` | food templates (last portion); dates with food logged |
| foods | `custom/{foodId}` | name, serving size/unit, cal, P, C, F, createdBy (userId + first name), created |
| passkeys | `cred/{credentialId}`, `user/{userId}`, `challenge/{id}` | public key, counter, transports, device; a person's credential list; 5-minute challenges |
| push | `{userId}` | push subscription(s) |
| events | `{YYYY-MM}/{eventId}` | userId, type, details, time |
| app | `settings` | inviteCode, lastPurgePrompt |
| fitnesscodes | `{code}` | userId (lookup for the Apple Shortcut) |

Writes that two devices could race on (same user's day, recents, profile) use **conditional writes** (ETag) with retry/merge. Custom foods are creator-edit-only, so no cross-user conflicts.

### Calculations
- **BMR (Mifflin-St Jeor):** men 10·kg + 6.25·cm − 5·age + 5; women 10·kg + 6.25·cm − 5·age − 161.
- **Set-level mode:** maintenance = BMR × 1.2 / 1.375 / 1.55 / 1.725.
- **Track mode:** base = BMR × 1.2; allowance = target + 0.5 × workout cal + steps × 0.04 × (weight lb / 150).
- **Target:** maintenance − deficit (lose) / + surplus (gain), suggested pace ≤ ~1% body weight/week; suggested calories ≥ 1,200 (women) / 1,500 (men). Manual values allowed with a small note.
- **Macros:** protein 0.8 g × goal weight (lb); fat 30% of calories ÷ 9; carbs = remainder ÷ 4.
- **Healthy range:** weight for BMI 18.5–24.9 at user's height.
- **Estimated change:** (maintenance incl. activity − eaten) ÷ 3,500 lb per day; weekly = 7-day sum.
- **Milestones:** progress = |start − current| ÷ |start − goal| crossing 15/25/50/75/100%; each fires once.

### Netlify Functions
| Function | Purpose |
|---|---|
| `auth` (`/api/auth/*`) | signup (invite code → Identity user, autoconfirmed → profile), login, me, change-password, delete |
| `passkey` (`/api/passkey/*`) | register-options/verify, login-options/verify, disable (SimpleWebAuthn) |
| `sync` | Load/save profile, days, weights, favorites, recents (auth required, own data only) |
| `foods` | List/create/edit/delete shared custom foods (edit/delete creator only) |
| `fitness` | Receive steps/active workouts from Shortcut; auth by personal sync code |
| `push` (`/api/push/*`) | VAPID public key, subscribe, unsubscribe |
| `events` | Record usage events |
| `admin` | Dashboard data, change invite code, event purge (ADMIN_EMAILS only; server-enforced) |

### Scheduled Functions
- `streak-saver` — hourly; for users whose local time just hit their reminder time (default 8 PM) and who have no food logged today and notifications on → send push "Keep your 🔥 12-day streak alive. Log something!"

### Netlify Identity settings
Registration: **invite only** (all sign-ups go through the `signup` function, which checks the invite code). Email confirmation: **off** (autoconfirm). Password reset emails on. Use the current `@netlify/identity` package (not the legacy widget). See Risks.

### Environment variables
Set these in Netlify only — never commit real values (this repo is public).

| Name | Value |
|---|---|
| `ADMIN_EMAILS` | Kay's email (comma-separated list if more than one admin) |
| `INVITE_CODE` | Starting invite code (later changed in Admin) |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Push notification keys (generated once) |
| `PASSKEY_RP_ID`, `PASSKEY_ORIGIN` | The site's Netlify address |
| `SESSION_SECRET` | Random string used to sign Crisp's 30-day session tokens |
| `VITE_SHORTCUT_URL` | iCloud link to the shared Apple Shortcut (see `docs/SHORTCUT.md`) |

---

## 9. Security

- **Passkeys (WebAuthn):** optional; offered in onboarding and Settings. Challenges created/verified in Netlify Functions with **SimpleWebAuthn**; public keys stored in `passkeys`. Face ID data never leaves the phone. Passkeys sync to a new iPhone through iCloud Keychain. Used **only at sign-in**; session lasts 30 days.
- **Sessions:** Netlify Identity checks the password (or SimpleWebAuthn checks the passkey); Crisp then issues its own HMAC-signed 30-day token (`SESSION_SECRET`) that every function verifies.
- **Fallback:** email + password; reset via email link (Safari page).
- **Lost phone:** no extra controls (30-day expiry + iPhone passcode).
- **Admin:** button shown only when the signed-in email is in `ADMIN_EMAILS`; every admin function re-checks on the server and refuses everyone else.
- **Fitness endpoint:** accepts data only with a valid personal sync code; codes are random and long.
- **Data access:** every function checks the signed-in user and only touches that user's keys (except admin and shared foods).
- **Public repo:** no secrets, emails, or invite codes in code — everything sensitive comes from environment variables.

---

## 10. Notifications & extras

- Push: one streak-saver at 8 PM local (changeable / off in Settings). Requires iOS 16.4+ and Home Screen install. Opt-in card after first streak day.
- No icon badge. No sharing.
- Apple Fitness: Shortcut (built by Kay during the build), shared via iCloud link behind the "Add Shortcut" button.
- Not possible for PWAs: widgets, Live Activities, Siri, Apple Watch.
- **App updates:** install silently; the new version loads next time Crisp opens.

---

## 11. Accessibility checklist

- [ ] Text follows iPhone text size; at largest sizes P/C/F bars stack in one column; food names wrap.
- [ ] VoiceOver labels on every icon/button; bars read e.g. "Protein, 80 of 120 grams", "Calories, 900 of 1,600, 700 left".
- [ ] Swipe and long-press actions also available in the VoiceOver actions menu.
- [ ] Reduce Motion → fades only; no confetti, sweep, or flare.
- [ ] All text passes WCAG AA contrast in both themes.
- [ ] Color never the only signal (P/C/F letters, over-target stripes + text, ✓/✕ icons).
- [ ] Every tap target ≥ 44×44 pt (+ button 56 pt, rows 56 pt).

---

## 12. Tech stack, hosting & manifest

- **Front end:** React + TypeScript + Vite + `vite-plugin-pwa` (same as Stax).
- **On-device storage:** IndexedDB (food library, offline copy, write queue); localStorage for small preferences.
- **Libraries:** `@simplewebauthn/browser` + `@simplewebauthn/server`; `@netlify/identity`; `@netlify/blobs`; `@netlify/functions`; `web-push`; Phosphor icons.
- **Food library:** build script turns USDA FoodData Central (Foundation + SR Legacy, public domain) into ~1,000 common foods with common portions + grams, shipped as a JSON file and loaded into IndexedDB.
- **Hosting:** Netlify, deployed from GitHub; build settings in `netlify.toml`; free `*.netlify.app` address (name chosen at setup).
- **Manifest:** name "Crisp", short_name "Crisp", display `standalone`, orientation `portrait`, theme_color `#000000`, background_color `#000000`, icons 180/192/512 (+ maskable), apple-touch-icon and startup images.
- **iOS quirks handled:** safe-area insets, black-translucent status bar, no rubber-band overscroll on app shell, no gray tap highlight, inputs ≥ 16 px, dynamic viewport height.
- **Updates:** service worker updates silently on next open.

---

## 13. Build plan

Each milestone is tested on a **real iPhone in Home Screen mode** on the live Netlify site before moving on. Each task below is also a GitHub issue under its milestone.

**M1 — Accounts first (do this before anything else)**
1. Scaffold repo: Vite + React + TS, PWA plugin, manifest, placeholder icons, `netlify.toml`, `netlify/functions/`. *(Done in the initial commit.)*
2. Install-guide gate (Safari vs standalone detection; off in dev).
3. Enable Identity (invite only, autoconfirm); `signup` function with invite code check.
4. Sign-in / sign-out / 30-day session; forgot-password Safari page.
5. ✅ Test: create account, sign out, sign in, reset password on a real iPhone (Home Screen mode). Fix any "something went wrong" before continuing.

**M2 — Passkeys**
6. Passkey register/login functions (SimpleWebAuthn) + `passkeys` store.
7. Onboarding Face ID screen + Settings toggle; password fallback.
8. ✅ Test on iPhone, incl. a second device via iCloud Keychain.

**M3 — App shell & design system**
9. Color/type/spacing tokens, Dark/Light/System theme.
10. Tab bar with center (+), nav stack with ‹ Back + edge-swipe, bottom sheets with drag-to-dismiss, toasts, press states.
11. Shimmer loaders, empty-state component, error component.

**M4 — Onboarding & targets**
12. Units, About you, Goal, Goal weight (BMI range + note), Activity mode, Your plan.
13. Calculation module (BMR, targets, macros, allowance, guardrails) with unit tests.
14. My Profile, Goal & Targets, Activity Mode settings screens.

**M5 — Food library & logging**
15. USDA build script → JSON → IndexedDB loader; search.
16. Log sheet, time-based meal chip, portion card, Quick add, Create food (`foods` function).
17. Recents, favorites, one-tap ⊕.
18. Meal screen; swipe left/right; long-press menu; Undo toasts.

**M6 — Home**
19. Stat card (bars, rings option, over-target stripes, eaten↔left toggle).
20. Week strip, past-day editing, 3 AM day boundary.
21. Streak logic, flame tiers, best streak, lost-streak card, streak flare animation.
22. Launch animation; sticky mini calorie bar; Reduce Motion handling.

**M7 — Sync & offline**
23. `sync` function with conditional writes; IndexedDB copy; write queue.
24. Offline pill + sync animation; pull-to-refresh on Home/Fitness.

**M8 — Fitness & Apple Fitness**
25. Manual steps/workouts sheets; balance card; Today | History.
26. `fitness` function + personal sync codes; "Last synced"; stale card.
27. Kay builds the Apple Shortcut; add iCloud link; Connect Apple Fitness guide.
28. ✅ Test the Shortcut end-to-end on a real iPhone.

**M9 — Weight**
29. Weight entries (number pad, prefill), list with swipe edit/delete.
30. Graph (line/bar, ranges, scrubber).
31. Estimated weight change card + note.
32. Milestone pop-ups (calm/hype/celebration, Maintain prompt).

**M10 — Settings & account**
33. Appearance options, units, notifications row, change password, delete account.

**M11 — Notifications**
34. VAPID keys, `push-subscribe`, opt-in card after first streak day.
35. `streak-saver` scheduled function (hourly, per time zone).
36. ✅ Test push on a real iPhone (iOS 16.4+).

**M12 — Admin**
37. Event recording across the app (`events`).
38. Admin dashboard sections (Overview, Feature usage, Recent activity, People with full data).
39. Invite code editor; 12-month purge prompt.
40. ✅ Verify non-admin accounts are refused by the server.

**M13 — Polish & accessibility**
41. Accessibility checklist (§11) pass with VoiceOver and large text.
42. iOS quirks pass (safe areas, overscroll, zoom, status bar).
43. Final real-device QA with 1–2 friends.

---

## 14. Risks & open questions

- **Netlify Identity status.** Netlify posted a deprecation notice for Netlify Identity and its GoTrue API in Feb 2025, saying existing users can keep using it with only major security patches. Netlify's own current developer guidance still documents Identity via the newer `@netlify/identity` package for new projects. **Action at M1:** confirm Identity can be enabled on the new Crisp site; if not, pick a replacement before building further. Identity doesn't run under `netlify dev`, so auth must be tested on a deploy preview or the live site.
- **Admin privacy.** Admin can see all users' personal data (foods, weight, goals); this is not disclosed in-app.
- **Apple Shortcut fragility.** Each friend must add the Shortcut and set up an automation; iOS updates can change Shortcuts behavior. Mitigation: stale-sync card + manual entry.
- **Passkeys tied to the address.** Changing from `*.netlify.app` to a custom domain later means everyone re-registers Face ID.
- **Push on iOS.** Works only for Home Screen installs on iOS 16.4+; delivery can be delayed by Focus/Low Power modes.
- **USDA portions.** Common-portion data varies in quality across foods; the build script may need a hand-curated pass for the most-used items.
- **Calorie estimates.** Step and workout calories and the weight-change estimate are approximations (disclosed in-app).
- **Public repo.** Code and this spec are publicly visible; keep all secrets in Netlify environment variables.
- **Open:** exact Netlify site name; starting invite code; Shortcut iCloud link (during M8).
