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

## How setup feels for each person

Everything happens in **Crisp → Settings → Connect Apple Fitness**:
1. **Pick a sync time** (8, 9, 10, 11 PM or Other).
2. **Add Shortcut** — opens the iCloud link once.
3. **Connect & sync** — Crisp opens `shortcuts://run-shortcut?name=Crisp%20Sync&input=text&text=<their code>`.
   The Shortcut saves the code on their phone and syncs today. No copying or pasting.
4. **Make it automatic at <their time>** — the one part Apple only allows inside the Shortcuts app.
   Crisp shows the exact steps with their chosen time and an **Open Shortcuts** button.

## Build it (on your iPhone, in the Shortcuts app)

The name must be exactly **Crisp Sync** (Crisp runs it by name).

1. Tap **+**, name it **Crisp Sync**.
2. **Save the code Crisp sends:**
   - Add **If** → input **Shortcut Input** → condition **has any value**. Delete the **Otherwise** part.
   - Inside the If: add **Save File** → file **Shortcut Input** → turn **off** Ask Where to Save → folder **Shortcuts**,
     subpath `crisp-code.txt` → turn **on** Overwrite If File Exists.
   - At the top of the Shortcut, tap **Receive … input** and choose **Text** only.
3. **Read the code:** after End If, add **Get File from Folder** → folder **Shortcuts**, path `crisp-code.txt`
   → **Get Text from Input** → **Set Variable** `Code`.
4. **Steps:** **Find Health Samples** → Type **Steps**, Start Date **is today** → **Calculate Statistics** → **Sum** → **Set Variable** `Steps`.
5. **Workouts:** **Find Health Samples** → Type **Workouts**, Start Date **is today**
   - **Get Details of Health Sample** → **Duration** → **Calculate Statistics** → **Sum** → **Set Variable** `WorkoutMinutes`
   - **Get Details of Health Sample** (same Workouts samples) → **Total Energy** → **Calculate Statistics** → **Sum** → **Set Variable** `WorkoutCalories`
   - (If Workouts isn't offered as a type, skip this — steps still sync.)
6. **Get Contents of URL** → `https://crisp-macro.netlify.app/api/fitness` → Method **POST**, Request Body **JSON**:
   `code` (Text) = Code · `steps` (Number) = Steps · `workoutMinutes` (Number) = WorkoutMinutes · `workoutCalories` (Number) = WorkoutCalories
7. **Get Dictionary Value** → key `message` → **Show Notification** (Dictionary Value).
8. Test from Crisp: Settings → Connect Apple Fitness → **Connect & sync** (allow Health access when asked).

## Share it

1. In Shortcuts, press and hold **Crisp Sync** → **Share** → **Copy iCloud Link**.
2. Paste the link into `src/config.ts` (or Netlify env var `VITE_SHORTCUT_URL`, then redeploy).

Running it again the same day replaces that day's numbers (never double-counts).
If someone's data stops arriving, Crisp shows a "hasn't synced in 2 days" card with **Fix it** and **Enter manually**.
