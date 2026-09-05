-- ============================================================
-- Crypto Faucet - Database Schema (FaucetPay-based)
-- Run this entire script in your Supabase SQL Editor
-- ============================================================

DROP TABLE IF EXISTS public.claimants CASCADE;

CREATE TABLE public.claimants (
  faucetpay_address TEXT PRIMARY KEY,
  balance NUMERIC DEFAULT 0,
  last_claim_at TIMESTAMPTZ,
  daily_claim_count INT DEFAULT 0,
  last_claim_date DATE DEFAULT NULL,
  bonus_claims INT DEFAULT 0,
  bonus_claims_date DATE DEFAULT NULL,
  referred_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.claimants ADD COLUMN IF NOT EXISTS bonus_claims INT DEFAULT 0;

ALTER TABLE public.claimants ADD COLUMN IF NOT EXISTS bonus_claims_date DATE DEFAULT NULL;

ALTER TABLE public.claimants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "claimants_insert_anon" ON public.claimants;
CREATE POLICY "claimants_insert_anon"
  ON public.claimants
  FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "claimants_select_anon" ON public.claimants;
CREATE POLICY "claimants_select_anon"
  ON public.claimants
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "claimants_update_anon" ON public.claimants;
CREATE POLICY "claimants_update_anon"
  ON public.claimants
  FOR UPDATE
  USING (true);

-- RPC: safe claim with cooldown & daily limit check
CREATE OR REPLACE FUNCTION public.faucet_claim(
  p_address TEXT,
  p_now TIMESTAMPTZ,
  p_referrer TEXT DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_last TIMESTAMPTZ;
  v_balance NUMERIC;
  v_daily_count INT;
  v_bonus INT;
  v_last_date DATE;
  v_today DATE;
  -- Base daily claim allowance per account; shortlink bonuses add on top
  v_daily_limit INT := 10;
  v_effective_limit INT;
  v_bonus_date DATE;
BEGIN
  v_today := p_now::DATE;

  SELECT last_claim_at, balance, daily_claim_count, last_claim_date, bonus_claims, bonus_claims_date
  INTO v_last, v_balance, v_daily_count, v_last_date, v_bonus, v_bonus_date
  FROM public.claimants
  WHERE faucetpay_address = p_address;

  -- Cooldown check: 1 minute between claims
  IF v_last IS NOT NULL AND p_now < v_last + INTERVAL '1 minute' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'cooldown',
      'message', 'Please wait 1 minute between claims'
    );
  END IF;

  -- Reset daily counters if new day
  IF v_last_date IS NULL OR v_last_date < v_today THEN
    v_daily_count := 0;
    IF v_bonus_date IS NULL OR v_bonus_date < v_today THEN
      v_bonus := 0;
    END IF;
  END IF;

  v_effective_limit := v_daily_limit + v_bonus;

  -- Daily limit check (includes bonus claims from shortlinks)
  IF v_daily_count >= v_effective_limit THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'daily_limit',
      'message', 'Daily limit reached. Complete a shortlink to unlock more claims!',
      'daily_claims', v_daily_count,
      'daily_limit', v_daily_limit,
      'bonus_claims', v_bonus,
      'effective_limit', v_effective_limit
    );
  END IF;

  INSERT INTO public.claimants (faucetpay_address, balance, last_claim_at, daily_claim_count, last_claim_date, bonus_claims, referred_by)
  VALUES (p_address, 0.000002, p_now, 1, v_today, COALESCE(v_bonus, 0), p_referrer)
  ON CONFLICT (faucetpay_address)
  DO UPDATE SET
    balance = public.claimants.balance + 0.000002,
    last_claim_at = p_now,
    daily_claim_count = public.claimants.daily_claim_count + 1,
    last_claim_date = v_today,
    bonus_claims = CASE
      WHEN public.claimants.bonus_claims_date IS NULL OR public.claimants.bonus_claims_date < v_today
      THEN 0
      ELSE public.claimants.bonus_claims
    END,
    bonus_claims_date = CASE
      WHEN public.claimants.bonus_claims_date IS NULL OR public.claimants.bonus_claims_date < v_today
      THEN NULL
      ELSE public.claimants.bonus_claims_date
    END,
    referred_by = CASE
      WHEN public.claimants.referred_by IS NULL AND p_referrer IS NOT NULL
      THEN p_referrer
      ELSE public.claimants.referred_by
    END;

  SELECT balance, daily_claim_count, bonus_claims INTO v_balance, v_daily_count, v_bonus
  FROM public.claimants
  WHERE faucetpay_address = p_address;

  RETURN jsonb_build_object(
    'success', true,
    'balance', v_balance,
    'daily_claims', v_daily_count,
    'daily_limit', v_daily_limit,
    'bonus_claims', v_bonus,
    'effective_limit', v_daily_limit + v_bonus
  );
END;
$$;

-- ============================================================
-- Shortlink System
-- ============================================================

CREATE TABLE IF NOT EXISTS public.shortlink_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  faucetpay_address TEXT REFERENCES public.claimants(faucetpay_address),
  token TEXT UNIQUE NOT NULL DEFAULT gen_random_uuid()::text,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'claimed')),
  reward NUMERIC DEFAULT 0.0005,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

ALTER TABLE public.shortlink_claims ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "shortlink_claims_select_anon" ON public.shortlink_claims;
CREATE POLICY "shortlink_claims_select_anon"
  ON public.shortlink_claims
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "shortlink_claims_insert_anon" ON public.shortlink_claims;
CREATE POLICY "shortlink_claims_insert_anon"
  ON public.shortlink_claims
  FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "shortlink_claims_update_anon" ON public.shortlink_claims;
CREATE POLICY "shortlink_claims_update_anon"
  ON public.shortlink_claims
  FOR UPDATE
  USING (true);

-- RPC: start a shortlink claim (creates token, checks limit)
CREATE OR REPLACE FUNCTION public.shortlink_claim_start(
  p_address TEXT,
  p_now TIMESTAMPTZ
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_daily_shortlink INT;
  v_today DATE;
  v_token TEXT;
  v_daily_limit INT := 10;
BEGIN
  v_today := p_now::DATE;

  SELECT COUNT(*) INTO v_daily_shortlink
  FROM public.shortlink_claims
  WHERE faucetpay_address = p_address
    AND created_at::DATE = v_today
    AND status IN ('completed', 'claimed');

  IF v_daily_shortlink >= v_daily_limit THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'daily_limit',
      'message', 'Shortlink limit reached. Come back tomorrow!',
      'daily_claims', v_daily_shortlink,
      'daily_limit', v_daily_limit
    );
  END IF;

  v_token := gen_random_uuid()::text;

  INSERT INTO public.shortlink_claims (faucetpay_address, token, status, reward)
  VALUES (p_address, v_token, 'pending', 0.0005);

  RETURN jsonb_build_object(
    'success', true,
    'token', v_token,
    'daily_claims', v_daily_shortlink,
    'daily_limit', v_daily_limit
  );
END;
$$;

-- RPC: complete a shortlink claim (mark done, update balance, grant bonus faucet claims)
CREATE OR REPLACE FUNCTION public.shortlink_claim_complete(
  p_token TEXT,
  p_now TIMESTAMPTZ
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_claim RECORD;
  v_bonus_added INT := 10;
BEGIN
  SELECT * INTO v_claim
  FROM public.shortlink_claims
  WHERE token = p_token AND status = 'pending'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'invalid_token',
      'message', 'Invalid or already used token'
    );
  END IF;

  UPDATE public.shortlink_claims
  SET status = 'completed', completed_at = p_now
  WHERE id = v_claim.id;

  INSERT INTO public.claimants (faucetpay_address, balance, bonus_claims, bonus_claims_date)
  VALUES (v_claim.faucetpay_address, v_claim.reward, v_bonus_added, p_now::DATE)
  ON CONFLICT (faucetpay_address)
  DO UPDATE SET
    balance = public.claimants.balance + v_claim.reward,
    bonus_claims = CASE
      WHEN public.claimants.bonus_claims_date IS NULL OR public.claimants.bonus_claims_date < p_now::DATE
      THEN v_bonus_added
      ELSE public.claimants.bonus_claims + v_bonus_added
    END,
    bonus_claims_date = p_now::DATE;

  RETURN jsonb_build_object(
    'success', true,
    'address', v_claim.faucetpay_address,
    'reward', v_claim.reward,
    'bonus_claims_added', v_bonus_added,
    'total_bonus_claims', (SELECT COALESCE(bonus_claims, 0) FROM public.claimants WHERE faucetpay_address = v_claim.faucetpay_address),
    'daily_claims', (SELECT COUNT(*) FROM public.shortlink_claims
                     WHERE faucetpay_address = v_claim.faucetpay_address
                     AND created_at::DATE = p_now::DATE
                     AND status IN ('completed', 'claimed'))
  );
END;
$$;

-- ============================================================
-- PTC Ads (Paid-To-Click)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.ptc_ads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  target_url TEXT NOT NULL CHECK (target_url ~ '^https?://'),
  reward NUMERIC NOT NULL DEFAULT 0.0001,
  duration_seconds INT NOT NULL DEFAULT 30 CHECK (duration_seconds BETWEEN 5 AND 60),
  max_total_views INT DEFAULT NULL,
  total_views INT NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.ptc_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_id UUID NOT NULL REFERENCES public.ptc_ads(id) ON DELETE CASCADE,
  faucetpay_address TEXT,
  token TEXT UNIQUE NOT NULL DEFAULT gen_random_uuid()::text,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed')),
  reward NUMERIC NOT NULL,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  watch_started_at TIMESTAMPTZ,
  active_watch_seconds INT NOT NULL DEFAULT 0,
  last_watch_tick_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

-- One completed view per user per ad per day. The day boundary is pinned to
-- UTC with an explicit AT TIME ZONE cast: a bare timestamptz::date cast
-- reads the session timezone, which Postgres treats as STABLE (not
-- IMMUTABLE) and rejects in index expressions (error 42P17). The RPCs below
-- compare days with the same UTC expression so they always agree with this
-- index.
CREATE UNIQUE INDEX IF NOT EXISTS ptc_views_daily_unique
  ON public.ptc_views (
    faucetpay_address,
    ad_id,
    ((started_at AT TIME ZONE 'UTC')::DATE)
  )
  WHERE status = 'completed';

ALTER TABLE public.ptc_ads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ptc_views ENABLE ROW LEVEL SECURITY;
-- No anon policies: tables are reachable only through our server-side API
-- routes that call these functions with the service role key.

-- RPC: list active ads with a per-user "already viewed today" flag
CREATE OR REPLACE FUNCTION public.ptc_list_ads(p_address TEXT)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER SET search_path = ''
AS $$
  SELECT COALESCE(jsonb_agg(row ORDER BY row->'created_at'), '[]'::jsonb)
  FROM (
    SELECT jsonb_build_object(
      'id', a.id,
      'title', a.title,
      'reward', a.reward,
      'duration_seconds', a.duration_seconds,
      'viewed_today', EXISTS (
        SELECT 1 FROM public.ptc_views v
        WHERE v.ad_id = a.id
          AND v.faucetpay_address = p_address
          AND v.status = 'completed'
          AND (v.started_at AT TIME ZONE 'UTC')::DATE = (NOW() AT TIME ZONE 'UTC')::DATE
      ),
      'created_at', a.created_at
    ) AS row
    FROM public.ptc_ads a
    WHERE a.active
      AND (a.max_total_views IS NULL OR a.total_views < a.max_total_views)
  ) ads;
$$;

-- RPC: start a PTC view session (issue single-use token)
CREATE OR REPLACE FUNCTION public.ptc_start(
  p_address TEXT,
  p_ad_id UUID,
  p_now TIMESTAMPTZ
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_ad RECORD;
BEGIN
  SELECT * INTO v_ad FROM public.ptc_ads WHERE id = p_ad_id AND active;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'ad_unavailable');
  END IF;

  IF v_ad.max_total_views IS NOT NULL AND v_ad.total_views >= v_ad.max_total_views THEN
    RETURN jsonb_build_object('success', false, 'error', 'ad_exhausted');
  END IF;

  -- One completed view per user per ad per day
  IF EXISTS (
    SELECT 1 FROM public.ptc_views
    WHERE ad_id = p_ad_id
      AND faucetpay_address = p_address
      AND status = 'completed'
      AND (started_at AT TIME ZONE 'UTC')::DATE = (p_now AT TIME ZONE 'UTC')::DATE
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'already_viewed_today');
  END IF;

  INSERT INTO public.ptc_views (ad_id, faucetpay_address, token, status, reward, started_at)
  VALUES (p_ad_id, p_address, gen_random_uuid()::text, 'pending', v_ad.reward, p_now);

  RETURN jsonb_build_object(
    'success', true,
    'token', (SELECT token FROM public.ptc_views WHERE ad_id = p_ad_id AND faucetpay_address = p_address AND status = 'pending' ORDER BY started_at DESC LIMIT 1),
    'title', v_ad.title,
    'target_url', v_ad.target_url,
    'duration_seconds', v_ad.duration_seconds,
    'reward', v_ad.reward
  );
END;
$$;

-- RPC: read session info for the timer page
CREATE OR REPLACE FUNCTION public.ptc_status(p_token TEXT)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_row RECORD;
BEGIN
  SELECT v.*, a.title, a.target_url, a.duration_seconds, a.active AS ad_active
  INTO v_row
  FROM public.ptc_views v
  JOIN public.ptc_ads a ON a.id = v.ad_id
  WHERE v.token = p_token;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_token');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'title', v_row.title,
    'target_url', v_row.target_url,
    'duration_seconds', v_row.duration_seconds,
    'reward', v_row.reward,
    'status', v_row.status,
    'started_at', v_row.started_at,
    'watch_started_at', v_row.watch_started_at,
    'active_watch_seconds', COALESCE(v_row.active_watch_seconds, 0),
    'ad_active', v_row.ad_active
  );
END;
$$;

-- RPC: credit one second of active (focused-tab) watch time
CREATE OR REPLACE FUNCTION public.ptc_watch_tick(
  p_token TEXT,
  p_now TIMESTAMPTZ
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_row RECORD;
  v_duration INT;
BEGIN
  SELECT v.*, a.duration_seconds AS ad_duration
  INTO v_row
  FROM public.ptc_views v
  JOIN public.ptc_ads a ON a.id = v.ad_id
  WHERE v.token = p_token
  FOR UPDATE OF v;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_token');
  END IF;

  v_duration := v_row.ad_duration;

  IF v_row.status = 'completed' THEN
    RETURN jsonb_build_object('success', false, 'error', 'already_claimed');
  END IF;

  IF EXTRACT(EPOCH FROM (p_now - v_row.started_at)) > 600 THEN
    RETURN jsonb_build_object('success', false, 'error', 'session_expired');
  END IF;

  -- First active tick anchors the watch clock (informational)
  IF v_row.watch_started_at IS NULL THEN
    UPDATE public.ptc_views
    SET watch_started_at = p_now
    WHERE id = v_row.id;
  END IF;

  IF v_row.last_watch_tick_at IS NOT NULL
     AND EXTRACT(EPOCH FROM (p_now - v_row.last_watch_tick_at)) < 0.85 THEN
    RETURN jsonb_build_object(
      'success', true,
      'active_seconds', v_row.active_watch_seconds,
      'remaining', GREATEST(0, v_duration - v_row.active_watch_seconds),
      'duration_seconds', v_duration
    );
  END IF;

  IF v_row.active_watch_seconds < v_duration THEN
    UPDATE public.ptc_views
    SET active_watch_seconds = active_watch_seconds + 1,
        last_watch_tick_at = p_now
    WHERE id = v_row.id;
    v_row.active_watch_seconds := v_row.active_watch_seconds + 1;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'active_seconds', v_row.active_watch_seconds,
    'remaining', GREATEST(0, v_duration - v_row.active_watch_seconds),
    'duration_seconds', v_duration
  );
END;
$$;

-- (The former ptc_banner_click RPC was removed: clicking the Adsterra
-- banner on /ptc/view is optional — see supabase_migration_ptc_direct_watch.sql.)

-- RPC: verify timer completion and credit the reward to balance
CREATE OR REPLACE FUNCTION public.ptc_verify(
  p_token TEXT,
  p_now TIMESTAMPTZ
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_row RECORD;
BEGIN
  SELECT v.*, a.duration_seconds, a.active AS ad_active
  INTO v_row
  FROM public.ptc_views v
  JOIN public.ptc_ads a ON a.id = v.ad_id
  WHERE v.token = p_token
  FOR UPDATE OF v;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_token');
  END IF;

  IF v_row.status = 'completed' THEN
    RETURN jsonb_build_object('success', false, 'error', 'already_claimed');
  END IF;

  IF NOT v_row.ad_active THEN
    RETURN jsonb_build_object('success', false, 'error', 'ad_unavailable');
  END IF;

  IF EXTRACT(EPOCH FROM (p_now - v_row.started_at)) > 600 THEN
    UPDATE public.ptc_views SET status = 'completed', completed_at = p_now
    WHERE id = v_row.id AND status = 'pending';
    RETURN jsonb_build_object('success', false, 'error', 'session_expired');
  END IF;

  IF COALESCE(v_row.active_watch_seconds, 0) < v_row.duration_seconds THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'timer_not_finished',
      'elapsed', COALESCE(v_row.active_watch_seconds, 0)
    );
  END IF;

  UPDATE public.ptc_views SET status = 'completed', completed_at = p_now
  WHERE id = v_row.id AND status = 'pending';

  UPDATE public.ptc_ads SET total_views = total_views + 1 WHERE id = v_row.ad_id;

  INSERT INTO public.claimants (faucetpay_address, balance, bonus_claims, bonus_claims_date)
  VALUES (v_row.faucetpay_address, v_row.reward, 0, NULL)
  ON CONFLICT (faucetpay_address)
  DO UPDATE SET balance = public.claimants.balance + v_row.reward;

  RETURN jsonb_build_object(
    'success', true,
    'reward', v_row.reward,
    'balance', (SELECT balance FROM public.claimants WHERE faucetpay_address = v_row.faucetpay_address),
    'daily_claims', (SELECT COUNT(*) FROM public.ptc_views
                     WHERE faucetpay_address = v_row.faucetpay_address
                       AND status = 'completed'
                       AND (started_at AT TIME ZONE 'UTC')::DATE = (p_now AT TIME ZONE 'UTC')::DATE)
  );
END;
$$;

-- Seed demo campaigns — replace titles/URLs/rewards with real advertiser
-- bookings via Supabase Table Editor. Fixed UUIDs keep re-runs idempotent.
-- DO UPDATE (not DO NOTHING) so re-running the schema refreshes the pool
-- to these 30 rows; note it resets any edits made afterwards in the editor.
-- Watch times are 30-40s so the server-side timer in ptc_verify is meaningful.
INSERT INTO public.ptc_ads (id, title, target_url, reward, duration_seconds) VALUES
  ('11111111-1111-1111-1111-111111111111', 'NovaWallet — Secure Crypto Wallet',      'https://example.com/ptc/campaign-01', 0.00003, 30),
  ('22222222-2222-2222-2222-222222222222', 'CryptoNews Daily — Market Updates',      'https://example.com/ptc/campaign-02', 0.00003, 35),
  ('33333333-3333-3333-3333-333333333333', 'TradePro Exchange — Zero-Fee Signup',    'https://example.com/ptc/campaign-03', 0.00003, 40),
  ('c0ffee00-0000-4000-8000-000000000004', 'CoinStake — Earn Passive Yield',         'https://example.com/ptc/campaign-04', 0.00003, 30),
  ('c0ffee00-0000-4000-8000-000000000005', 'BlockMiner Cloud — Free Hash Trial',     'https://example.com/ptc/campaign-05', 0.00003, 35),
  ('c0ffee00-0000-4000-8000-000000000006', 'PayLink Global — Instant Transfers',     'https://example.com/ptc/campaign-06', 0.00003, 40),
  ('c0ffee00-0000-4000-8000-000000000007', 'DeFi Pulse Alerts — Price Signals',      'https://example.com/ptc/campaign-07', 0.00003, 30),
  ('c0ffee00-0000-4000-8000-000000000008', 'MetaVerse Arena — Play & Earn',          'https://example.com/ptc/campaign-08', 0.00003, 35),
  ('c0ffee00-0000-4000-8000-000000000009', 'SecureVault — Cold Storage Guide',       'https://example.com/ptc/campaign-09', 0.00003, 40),
  ('c0ffee00-0000-4000-8000-00000000000a', 'TokenLaunch Hub — New ICO Listings',     'https://example.com/ptc/campaign-0a', 0.00003, 30),
  ('c0ffee00-0000-4000-8000-00000000000b', 'CryptoTax Filers — Save on Filing',      'https://example.com/ptc/campaign-0b', 0.00003, 35),
  ('c0ffee00-0000-4000-8000-00000000000c', 'MoonShot Signals — Telegram Group',      'https://example.com/ptc/campaign-0c', 0.00003, 40),
  ('c0ffee00-0000-4000-8000-00000000000d', 'HashPower Rentals — GPU Mining',         'https://example.com/ptc/campaign-0d', 0.00003, 30),
  ('c0ffee00-0000-4000-8000-00000000000e', 'SwapFast DEX — Best Swap Rates',         'https://example.com/ptc/campaign-0e', 0.00003, 35),
  ('c0ffee00-0000-4000-8000-00000000000f', 'AirDrop Hunter — Free Token Drops',      'https://example.com/ptc/campaign-0f', 0.00003, 40),
  ('c0ffee00-0000-4000-8000-000000000010', 'LedgerSafe — Hardware Wallet Deals',     'https://example.com/ptc/campaign-10', 0.00003, 30),
  ('c0ffee00-0000-4000-8000-000000000011', 'BitLending — P2P Crypto Loans',          'https://example.com/ptc/campaign-11', 0.00003, 35),
  ('c0ffee00-0000-4000-8000-000000000012', 'NFT Mint Zone — Weekly Drops',           'https://example.com/ptc/campaign-12', 0.00003, 40),
  ('c0ffee00-0000-4000-8000-000000000013', 'CryptoJobs Board — Get Hired',           'https://example.com/ptc/campaign-13', 0.00003, 30),
  ('c0ffee00-0000-4000-8000-000000000014', 'YieldFarm Pro — APY Rankings',           'https://example.com/ptc/campaign-14', 0.00003, 35),
  ('c0ffee00-0000-4000-8000-000000000015', 'PrivacyCoin Wallet — Private Payments',  'https://example.com/ptc/campaign-15', 0.00003, 40),
  ('c0ffee00-0000-4000-8000-000000000016', 'ChartMaster Pro — Trading Tools',        'https://example.com/ptc/campaign-16', 0.00003, 30),
  ('c0ffee00-0000-4000-8000-000000000017', 'StakingCalc — Maximize Rewards',         'https://example.com/ptc/campaign-17', 0.00003, 35),
  ('c0ffee00-0000-4000-8000-000000000018', 'LuckySpin Crypto — No-KYC Games',        'https://example.com/ptc/campaign-18', 0.00003, 40),
  ('c0ffee00-0000-4000-8000-000000000019', 'GiftCard4Crypto — Instant Swap',         'https://example.com/ptc/campaign-19', 0.00003, 30),
  ('c0ffee00-0000-4000-8000-00000000001a', 'Blockchain Academy — Free Courses',      'https://example.com/ptc/campaign-1a', 0.00003, 35),
  ('c0ffee00-0000-4000-8000-00000000001b', 'P2P Market Finder — Local Trades',       'https://example.com/ptc/campaign-1b', 0.00003, 40),
  ('c0ffee00-0000-4000-8000-00000000001c', 'CryptoCard Prepaid — Spend Anywhere',    'https://example.com/ptc/campaign-1c', 0.00003, 30),
  ('c0ffee00-0000-4000-8000-00000000001d', 'NodeRunner Guide — Run a Validator',     'https://example.com/ptc/campaign-1d', 0.00003, 35),
  ('c0ffee00-0000-4000-8000-00000000001e', 'FaucetBoost Tools — Claim Faster',       'https://example.com/ptc/campaign-1e', 0.00003, 40)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  target_url = EXCLUDED.target_url,
  reward = EXCLUDED.reward,
  duration_seconds = EXCLUDED.duration_seconds,
  active = true;

-- Safety net: any ad added outside this seed must also respect the 30s
-- minimum, so verification can never be farmed with a trivially short timer.
UPDATE public.ptc_ads SET duration_seconds = 30 WHERE duration_seconds < 30;

-- ============================================================
-- Anti-Bot: Claim Log & IP Tracking
-- ============================================================

CREATE TABLE IF NOT EXISTS public.claim_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  faucetpay_address TEXT,
  ip_address TEXT,
  user_agent TEXT,
  turnstile_passed BOOLEAN DEFAULT false,
  success BOOLEAN DEFAULT false,
  error_type TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.claim_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "claim_log_insert_anon" ON public.claim_log;
CREATE POLICY "claim_log_insert_anon"
  ON public.claim_log
  FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "claim_log_select_anon" ON public.claim_log;
CREATE POLICY "claim_log_select_anon"
  ON public.claim_log
  FOR SELECT
  USING (true);

-- RPC: server-side check whether the user completed a shortlink today
CREATE OR REPLACE FUNCTION public.check_ad_verified(p_address TEXT, p_now TIMESTAMPTZ)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.shortlink_claims
    WHERE faucetpay_address = p_address
      AND created_at::DATE = p_now::DATE
      AND status IN ('completed', 'claimed')
  );
$$;

-- RPC: check if an IP has exceeded the rate limit (e.g., 30 attempts per minute)
CREATE OR REPLACE FUNCTION public.check_ip_rate_limit(
  p_ip TEXT,
  p_now TIMESTAMPTZ,
  p_max_attempts INT DEFAULT 30,
  p_window_seconds INT DEFAULT 60
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_recent_attempts INT;
BEGIN
  SELECT COUNT(*) INTO v_recent_attempts
  FROM public.claim_log
  WHERE ip_address = p_ip
    AND created_at > p_now - (p_window_seconds || ' seconds')::INTERVAL;

  IF v_recent_attempts >= p_max_attempts THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'attempts', v_recent_attempts,
      'max_attempts', p_max_attempts,
      'retry_after', p_window_seconds
    );
  END IF;

  RETURN jsonb_build_object(
    'allowed', true,
    'attempts', v_recent_attempts,
    'max_attempts', p_max_attempts
  );
END;
$$;
