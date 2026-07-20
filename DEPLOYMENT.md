# Deployment Guide — Crypto Faucet on Vercel

## Prerequisites

- A [GitHub](https://github.com) account
- A [Vercel](https://vercel.com) account (free tier works)
- A [Supabase](https://supabase.com) project (free tier works)
- A [FaucetPay](https://faucetpay.io) account (to get your API key)

---

## Step 1: Push to GitHub

```bash
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
4. Vercel auto-detects Next.js

---

## Step 3: Add Environment Variables

In Vercel **Settings → Environment Variables**, add these **four** variables:

| Name | Value |
|------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://nsmilswvbqvxqlkccatd.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5zbWlsc3d2YnF2eHFsa2NjYXRkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQzNjg1MjMsImV4cCI6MjA5OTk0NDUyM30.Hnt1HwGCO2e-b1c8SWKIbDUsyKIgctXmHvuUTt5q3Cs` |
| `SUPABASE_SERVICE_ROLE_KEY` | Your Supabase **Service Role Key** (Settings → API → service_role key) |
| `FAUCETPAY_API_KEY` | Your FaucetPay **API Key** (FaucetPay dashboard → API) |

Set all four to **Preview** and **Production** environments.

---

## Step 4: Run Database Schema

In your Supabase Dashboard → **SQL Editor**, paste and run the contents of `supabase_schema.sql`.

---

## Step 5: Deploy

Click **Deploy**. Vercel will run `next build` automatically.

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Build fails (missing env var) | Add all four env vars in Vercel |
| API returns "FaucetPay API key not configured" | `FAUCETPAY_API_KEY` is missing from Vercel env |
| API returns "Database not configured" | `SUPABASE_SERVICE_ROLE_KEY` is missing |
| Payment fails | Check FaucetPay API key is valid and has balance |
