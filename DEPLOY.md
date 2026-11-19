# Deploying Look Gooder (Supabase + Vercel + GitHub)

About 20 minutes. Use a **new** Supabase project and a **new** Vercel project so Look Gooder stays fully separate from Talk Gooder.

You will collect six values along the way. Keep them in a password manager:

| Variable | Where it comes from |
| --- | --- |
| `DATABASE_URL` | Supabase, step 1 |
| `SUPABASE_URL` | Supabase, step 3 |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase, step 3 |
| `SUPABASE_BUCKET` | Always `look-gooder` |
| `APP_PASSWORD` | You choose it; this is what you type to sign in |
| `SESSION_SECRET` | A random 40+ character string from your password manager's generator |

---

## 1. Supabase: create the project and database

1. In Supabase, create a **new project** named `look-gooder`. Pick the region closest to you (for example US West). Save the database password it shows you.
2. When the project is ready, click **Connect** at the top of the dashboard.
3. Copy the **Transaction pooler** connection string (port **6543**). Replace `[YOUR-PASSWORD]` with the database password from step 1. This is your `DATABASE_URL`.

## 2. Supabase: create the tables

1. Open **SQL Editor** → **New query**.
2. Open `db/migrations/001_foundation.sql` from the repository, copy the entire file, paste it in, and click **Run**.
3. You should see "Success. No rows returned." Open **Table Editor**. You should see tables including `source_images`, `wardrobe_items`, `regions`, and `audit_events`. They will be empty, which is correct. Nothing is pre-filled.

## 3. Supabase: create private photo storage and get keys

1. Open **Storage** → **New bucket**.
   - Name: `look-gooder`
   - **Public bucket: OFF** (photos are only ever served through the app after sign-in)
   - Leave the file size limit at the default (50 MB).
2. Open **Project Settings** → **API Keys** (on older dashboards, **Project Settings → API**).
   - **Project URL** → `SUPABASE_URL`
   - The **secret** key (older dashboards: `service_role` key) → `SUPABASE_SERVICE_ROLE_KEY`
   - Never use this key in a browser or share it. Look Gooder only uses it on the server.

## 4. GitHub: create the repository

1. Create a new **private** repository named `look-gooder`. Do not add a README or license; leave it empty.
2. Tell Claude the repository name (for example `yourname/look-gooder`), and Claude can push the code for you. Alternatively, push the code yourself from the unzipped folder:
   ```
   cd look-gooder
   git init -b main
   git add -A
   git commit -m "Look Gooder Phase 1"
   git remote add origin https://github.com/yourname/look-gooder.git
   git push -u origin main
   ```

## 5. Vercel: deploy

1. In Vercel, click **Add New → Project** and import the `look-gooder` repository.
2. Framework preset: **Next.js** (detected automatically). Leave the build settings as they are.
3. Open **Environment Variables** and add all of these:
   ```
   DATABASE_URL=...            (step 1)
   STORAGE_DRIVER=supabase
   SUPABASE_URL=...            (step 3)
   SUPABASE_SERVICE_ROLE_KEY=... (step 3)
   SUPABASE_BUCKET=look-gooder
   APP_PASSWORD=...            (you choose)
   SESSION_SECRET=...          (40+ random characters)
   ```
4. Click **Deploy**.
5. After it deploys, open **Project Settings → Functions** and set the function region to match your Supabase region (for example `sfo1` for US West). Then redeploy. This keeps photo processing fast.

## 6. Check that it works

1. Open your Vercel URL and sign in with `APP_PASSWORD`.
2. On **Import & Audit**, upload one photo from your phone, including a HEIC photo straight from the iPhone camera roll.
3. Open the photo, choose **Single item**, draw a box, and create an item.
4. Check **Closet**. The item should appear with its crop.
5. On your iPhone, open the URL in Safari, then use **Share → Add to Home Screen** so it opens like an app.

If something fails, the Vercel dashboard's **Logs** tab shows the error. Send it to Claude.

## Backups

**Import & Audit → Download backup** downloads a zip containing every record as JSON plus every original photo. Download one after each big import session.

## Future database changes

New migrations arrive as new files in `db/migrations/` (002, 003, and so on). Paste each new file into the Supabase SQL Editor once, in order. Every file records itself, so it is always clear what has been applied:
```sql
select * from schema_migrations order by name;
```
