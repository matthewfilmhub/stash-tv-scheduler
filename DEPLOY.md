# Stash TV Scheduler — Deploy to Vercel

## Quick Start (5 minutes)

### 1. Push to GitHub

Create a new repo (e.g., `stash-tv-scheduler`) and push this folder:

```bash
cd stash-scheduler-app
git init
git add .
git commit -m "Initial commit — Stash TV Scheduler"
gh repo create stash-tv-scheduler --private --source=. --push
```

Or create the repo on github.com and push manually.

### 2. Import to Vercel

1. Go to [vercel.com/new](https://vercel.com/new)
2. Click **Import Git Repository** and select `stash-tv-scheduler`
3. Leave all defaults (Framework: Other, Root: ./) and click **Deploy**

### 3. Add Blob Storage

1. In your Vercel project dashboard, go to **Storage** tab
2. Click **Create** → **Blob**
3. Name it anything (e.g., `stash-schedule-store`)
4. Click **Create** — Vercel auto-links the `BLOB_READ_WRITE_TOKEN` env var

### 4. Set the Upload Key

1. Go to **Settings** → **Environment Variables**
2. Add a new variable:
   - **Name:** `UPLOAD_KEY`
   - **Value:** any secret passphrase (e.g., `stash-team-2026`)
   - **Environments:** Production, Preview, Development
3. Click **Save**

### 5. Redeploy

After adding the env vars, trigger a redeploy:
- Go to **Deployments** tab → click the **...** menu on the latest deploy → **Redeploy**

### 6. Done!

Your scheduler is now live at `https://stash-tv-scheduler.vercel.app` (or your custom domain).

---

## How It Works

**For the team lead (you):**
- Visit the URL → enter the Upload Key → upload a CSV
- Data is parsed client-side and saved to Vercel Blob via the API
- Every time you upload a new CSV, it overwrites the previous schedule

**For team members / C-Suite:**
- Visit the same URL — the latest schedule loads automatically
- No login needed, no key needed — view-only is public
- They see the full calendar, weekly summary, priority watchlist, and backlog

**For updating the schedule:**
- Just visit the URL, click "New CSV" in the header, enter the key, and upload
- The page instantly refreshes for everyone on their next visit

---

## Environment Variables Reference

| Variable | Required | Description |
|---|---|---|
| `BLOB_READ_WRITE_TOKEN` | Yes | Auto-set when you link a Blob store |
| `UPLOAD_KEY` | Yes | Password for CSV uploads (share with team leads only) |

---

## Embedding in Notion

The easiest way to share with C-Suite is to embed the live scheduler directly in your weekly meeting Notion page.

### Full-page embed

1. In your Notion doc, type `/embed`
2. Paste your Vercel URL (e.g., `https://stash-tv-scheduler.vercel.app`)
3. Notion renders it as a live iframe — always shows the latest data
4. Drag the bottom edge to resize the embed height (700-900px works well)

### Link preview (bookmark)

1. Paste the URL directly into a Notion page
2. Select **Create bookmark** when prompted
3. This creates a clickable card that opens the full scheduler in a new tab

### Tips

- The embed is **view-only** — nobody can accidentally upload a new CSV from within Notion
- When you upload a new CSV before the meeting, the Notion embed automatically shows the updated schedule on next page load
- Use the **Print / PDF** button in the scheduler header if anyone needs a static snapshot for offline reference or email

---

## Print / PDF Export

The scheduler includes a built-in print mode optimized for paper and PDF:

1. Click the **Print / PDF** button in the header (or press Ctrl+P / Cmd+P)
2. In the print dialog, select **Save as PDF** as the destination
3. The output uses a clean white background with all sections expanded
4. Both calendar weeks are shown automatically (no tab switching needed)
5. A print timestamp is added to the footer

---

## Custom Domain (Optional)

1. Go to **Settings** → **Domains**
2. Add your domain (e.g., `schedule.stashtv.com`)
3. Follow the DNS instructions Vercel provides
