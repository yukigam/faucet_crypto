# Deployment Guide — Crypto Faucet on Vercel

## Prerequisites

- A [GitHub](https://github.com) account
- A [Vercel](https://vercel.com) account (free tier works)
- Your Supabase project already created and running

---

## Step 1: Push to GitHub

```bash
# Init git (skip if already done)
git init
git add .
git commit -m "Initial commit"

# Create a repo on github.com, then:
git remote add origin https://github.com/YOUR_USERNAME/faucet_crypto.git
git push -u origin main
```

---

## Step 2: Import into Vercel

1. Go to [vercel.com/new](https://vercel.com/new)
2. Click **Import Git Repository**
3. Select `faucet_crypto` from your GitHub repos
4. Vercel auto-detects Next.js — no framework override needed

---

## Step 3: Add Environment Variables

In the Vercel project setup screen (or later under **Settings → Environment Variables**), add these **two** variables:

| Name | Value |
|------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://nsmilswvbqvxqlkccatd.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5zbWlsc3d2YnF2eHFsa2NjYXRkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQzNjg1MjMsImV4cCI6MjA5OTk0NDUyM30.Hnt1HwGCO2e-b1c8SWKIbDUsyKIgctXmHvuUTt5q3Cs` |

**Make sure both are set to `Preview` and `Production` environments.**

No other variables are needed.

---

## Step 4: Deploy

Click **Deploy**. Vercel will run `next build` automatically.

Once done, you'll get a URL like `https://faucet-crypto.vercel.app`.

---

## Redeploy on Changes

Every push to `main` (or your default branch) triggers an automatic redeploy.

To manually redeploy from the Vercel Dashboard:
- Go to your project → **Deployments** → find the latest → **Redeploy**

---

## Local Dev vs Production

- `.env.local` is used for **local development** (ignored by git)
- Vercel env vars are used for **production/preview** — no `.env.local` needed on Vercel
- Keep the `.env.example` file synced if you add new variables

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Build fails with "Supabase URL required" | Forgot to add `NEXT_PUBLIC_SUPABASE_URL` in Vercel env vars |
| Blank page after deploy | Check browser console for missing env vars |
| `@supabase/ssr` errors | Ensure both env vars are set and prefixed with `NEXT_PUBLIC_` |
| SQL function errors | Run `supabase_schema.sql` again in your Supabase SQL Editor |
