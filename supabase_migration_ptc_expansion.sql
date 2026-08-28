-- ============================================================
-- Migration: Expand PTC Ads pool to 30 ads with 30-40s watch times
--
-- HOW TO APPLY: Paste ONLY this file's contents into the Supabase
-- SQL Editor and run it. Safe to re-run (idempotent upserts).
--
-- What it does:
--   1. Grows the seeded PTC pool from 3 sample ads to 30 active ads.
--   2. Moves every ad's watch time into the 30-40s range (30s / 35s / 40s).
--      The ptc_verify RPC reads duration_seconds from the ads table, so its
--      server-side elapsed-time check picks the new values up automatically
--      -- no RPC changes are needed. The 10-minute session expiry window is
--      unchanged and still leaves ample time to verify a 40s view.
--   3. Raises the default duration for future ads to 30s.
--
-- NOTE: re-running this seed resets titles/URLs/rewards/durations of the 30
-- fixed-UUID rows, overriding any edits made afterwards in the Table Editor.
-- ============================================================

ALTER TABLE public.ptc_ads ALTER COLUMN duration_seconds SET DEFAULT 30;

INSERT INTO public.ptc_ads (id, title, target_url, reward, duration_seconds) VALUES
  ('11111111-1111-1111-1111-111111111111', 'NovaWallet — Secure Crypto Wallet',      'https://example.com/ptc/campaign-01', 0.00010, 30),
  ('22222222-2222-2222-2222-222222222222', 'CryptoNews Daily — Market Updates',      'https://example.com/ptc/campaign-02', 0.00012, 35),
  ('33333333-3333-3333-3333-333333333333', 'TradePro Exchange — Zero-Fee Signup',    'https://example.com/ptc/campaign-03', 0.00015, 40),
  ('c0ffee00-0000-4000-8000-000000000004', 'CoinStake — Earn Passive Yield',         'https://example.com/ptc/campaign-04', 0.00010, 30),
  ('c0ffee00-0000-4000-8000-000000000005', 'BlockMiner Cloud — Free Hash Trial',     'https://example.com/ptc/campaign-05', 0.00012, 35),
  ('c0ffee00-0000-4000-8000-000000000006', 'PayLink Global — Instant Transfers',     'https://example.com/ptc/campaign-06', 0.00015, 40),
  ('c0ffee00-0000-4000-8000-000000000007', 'DeFi Pulse Alerts — Price Signals',      'https://example.com/ptc/campaign-07', 0.00010, 30),
  ('c0ffee00-0000-4000-8000-000000000008', 'MetaVerse Arena — Play & Earn',          'https://example.com/ptc/campaign-08', 0.00012, 35),
  ('c0ffee00-0000-4000-8000-000000000009', 'SecureVault — Cold Storage Guide',       'https://example.com/ptc/campaign-09', 0.00015, 40),
  ('c0ffee00-0000-4000-8000-00000000000a', 'TokenLaunch Hub — New ICO Listings',     'https://example.com/ptc/campaign-0a', 0.00010, 30),
  ('c0ffee00-0000-4000-8000-00000000000b', 'CryptoTax Filers — Save on Filing',      'https://example.com/ptc/campaign-0b', 0.00012, 35),
  ('c0ffee00-0000-4000-8000-00000000000c', 'MoonShot Signals — Telegram Group',      'https://example.com/ptc/campaign-0c', 0.00015, 40),
  ('c0ffee00-0000-4000-8000-00000000000d', 'HashPower Rentals — GPU Mining',         'https://example.com/ptc/campaign-0d', 0.00010, 30),
  ('c0ffee00-0000-4000-8000-00000000000e', 'SwapFast DEX — Best Swap Rates',         'https://example.com/ptc/campaign-0e', 0.00012, 35),
  ('c0ffee00-0000-4000-8000-00000000000f', 'AirDrop Hunter — Free Token Drops',      'https://example.com/ptc/campaign-0f', 0.00015, 40),
  ('c0ffee00-0000-4000-8000-000000000010', 'LedgerSafe — Hardware Wallet Deals',     'https://example.com/ptc/campaign-10', 0.00010, 30),
  ('c0ffee00-0000-4000-8000-000000000011', 'BitLending — P2P Crypto Loans',          'https://example.com/ptc/campaign-11', 0.00012, 35),
  ('c0ffee00-0000-4000-8000-000000000012', 'NFT Mint Zone — Weekly Drops',           'https://example.com/ptc/campaign-12', 0.00015, 40),
  ('c0ffee00-0000-4000-8000-000000000013', 'CryptoJobs Board — Get Hired',           'https://example.com/ptc/campaign-13', 0.00010, 30),
  ('c0ffee00-0000-4000-8000-000000000014', 'YieldFarm Pro — APY Rankings',           'https://example.com/ptc/campaign-14', 0.00012, 35),
  ('c0ffee00-0000-4000-8000-000000000015', 'PrivacyCoin Wallet — Private Payments',  'https://example.com/ptc/campaign-15', 0.00015, 40),
  ('c0ffee00-0000-4000-8000-000000000016', 'ChartMaster Pro — Trading Tools',        'https://example.com/ptc/campaign-16', 0.00010, 30),
  ('c0ffee00-0000-4000-8000-000000000017', 'StakingCalc — Maximize Rewards',         'https://example.com/ptc/campaign-17', 0.00012, 35),
  ('c0ffee00-0000-4000-8000-000000000018', 'LuckySpin Crypto — No-KYC Games',        'https://example.com/ptc/campaign-18', 0.00015, 40),
  ('c0ffee00-0000-4000-8000-000000000019', 'GiftCard4Crypto — Instant Swap',         'https://example.com/ptc/campaign-19', 0.00010, 30),
  ('c0ffee00-0000-4000-8000-00000000001a', 'Blockchain Academy — Free Courses',      'https://example.com/ptc/campaign-1a', 0.00012, 35),
  ('c0ffee00-0000-4000-8000-00000000001b', 'P2P Market Finder — Local Trades',       'https://example.com/ptc/campaign-1b', 0.00015, 40),
  ('c0ffee00-0000-4000-8000-00000000001c', 'CryptoCard Prepaid — Spend Anywhere',    'https://example.com/ptc/campaign-1c', 0.00010, 30),
  ('c0ffee00-0000-4000-8000-00000000001d', 'NodeRunner Guide — Run a Validator',     'https://example.com/ptc/campaign-1d', 0.00012, 35),
  ('c0ffee00-0000-4000-8000-00000000001e', 'FaucetBoost Tools — Claim Faster',       'https://example.com/ptc/campaign-1e', 0.00015, 40)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  target_url = EXCLUDED.target_url,
  reward = EXCLUDED.reward,
  duration_seconds = EXCLUDED.duration_seconds,
  active = true;

-- Safety net: any ad added outside this seed must also respect the 30s
-- minimum, so verification can never be farmed with a trivially short timer.
UPDATE public.ptc_ads SET duration_seconds = 30 WHERE duration_seconds < 30;

-- Sanity check (run in the SQL editor afterwards if you like):
-- SELECT COUNT(*) AS ads, MIN(duration_seconds), MAX(duration_seconds)
-- FROM public.ptc_ads WHERE active;
-- Expect: 30 ads, min 30, max 40.
