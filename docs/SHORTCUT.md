# Building the "Crisp Sync" Apple Shortcut

Crisp can't read Apple Health directly (no web app can), so a free Apple Shortcut sends each person's
steps and workouts to Crisp once a day. You build it **once**, share it as an iCloud link, and every
friend adds it from **Crisp → Settings → Connect Apple Fitness**.

## What the Shortcut sends

`POST https://<your-site>.netlify.app/api/fitness` with JSON:

```json
{ "code": "<personal sync code>", "steps": 8200, "workoutMinutes": 45, "workoutCalories": 310 }
```

- `code` — each person's own sync code (shown in Crisp → Settings → Connect Apple Fitness). The Shortcut asks for it once, when it's added.
- `steps` — today's step count.
- `workoutMinutes`, `workoutCalories` — optional totals for today's workouts.
- Crisp replies with a message like "Synced 8,200 steps and 1 workout to Crisp." that the Shortcut can show.

Running it again the same day replaces that day's synced numbers (it never double-counts).

## Build it (on your iPhone, in the Shortcuts app)

1. Tap **+** to make a new Shortcut. Name it **Crisp Sync**.
2. Add **Text** → paste your sync code for now (it gets replaced in step 9). Then add **Set Variable** → name it `Code`.
3. Add **Find Health Samples** → Type: **Steps** → Start Date **is today** → (Group by: Day). Then **Calculate Statistics** → **Sum** of the Health Samples. Then **Set Variable** → `Steps`.
4. Add **Find Health Samples** → Type: **Workouts** → Start Date **is today**.
5. Add **Get Details of Health Sample** → **Duration** (minutes) → **Calculate Statistics** → **Sum** → **Set Variable** → `WorkoutMinutes`.
6. Repeat with the Workouts samples → **Get Details of Health Sample** → **Total Energy** (or Active Energy) → **Calculate Statistics** → **Sum** → **Set Variable** → `WorkoutCalories`.
7. Add **Get Contents of URL**:
   - URL: `https://<your-site>.netlify.app/api/fitness`
   - Method: **POST**, Request Body: **JSON**
   - Fields: `code` = `Code`, `steps` = `Steps`, `workoutMinutes` = `WorkoutMinutes`, `workoutCalories` = `WorkoutCalories`
8. Add **Get Dictionary Value** → `message` → **Show Notification** (optional) so you can see it worked.
9. Turn the step-2 Text into an **Import Question**: tap the Shortcut's ⓘ / settings → **Setup** → add a question for the Text action: "Paste your Crisp sync code". Now everyone who adds the Shortcut is asked for *their own* code.
10. Run it once. You should see "Synced … to Crisp." Pull down on Crisp's Fitness tab to see it.

## Share it

1. In Shortcuts, press and hold **Crisp Sync** → **Share** → **Copy iCloud Link**.
2. In Netlify → **Project configuration → Environment variables**, add `VITE_SHORTCUT_URL` = that link, then **redeploy**.
   (Or paste the link into `src/config.ts`.)
3. The **Add Shortcut** button in Crisp → Settings → Connect Apple Fitness now opens it.

## Each person, once

The guide in Crisp walks them through it: copy sync code → **Add Shortcut** → paste code → allow Health
access → Shortcuts app → **Automation** → **+** → **Time of Day** → 9:00 PM, Daily → **Run Immediately** →
choose **Crisp Sync**.

If someone's data stops arriving, Crisp shows a "hasn't synced in 2 days" card with **Fix it** and **Enter manually**.
