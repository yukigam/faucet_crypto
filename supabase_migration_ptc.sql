-- ============================================================
-- Migration: Add PTC Ads (Paid-To-Click) system
--
-- HOW TO APPLY: Paste ONLY this file's contents into the Supabase
-- SQL Editor and run it.
--
-- DO NOT re-run supabase_schema.sql for this change: it starts with
-- "DROP TABLE IF EXISTS public.claimants CASCADE" which permanently
-- deletes every user's balance, history, and referral links.
-- ============================================================


-- PTC Ads (Paid-To-Click)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.ptc_ads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  target_url TEXT NOT NULL CHECK (target_url ~ '^https?://'),
  reward NUMERIC NOT NULL DEFAULT 0.0001,
  duration_seconds INT NOT NULL DEFAULT 8 CHECK (duration_seconds BETWEEN 5 AND 60),
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
    'ad_active', v_row.ad_active
  );
END;
$$;

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
  v_elapsed INT;
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

  v_elapsed := EXTRACT(EPOCH FROM (p_now - v_row.started_at));

  -- Timer is enforced SERVER-side: reward only after the ad view time,
  -- tokens expire if verified too long after starting.
  IF v_elapsed < v_row.duration_seconds THEN
    RETURN jsonb_build_object('success', false, 'error', 'timer_not_finished', 'elapsed', v_elapsed);
  END IF;

  IF v_elapsed > 600 THEN
    UPDATE public.ptc_views SET status = 'completed', completed_at = p_now
    WHERE id = v_row.id AND status = 'pending';
    RETURN jsonb_build_object('success', false, 'error', 'session_expired');
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
INSERT INTO public.ptc_ads (id, title, target_url, reward, duration_seconds) VALUES
  ('11111111-1111-1111-1111-111111111111', 'Sample Advertiser — 6s', 'https://example.com/campaign-a', 0.0001, 6),
  ('22222222-2222-2222-2222-222222222222', 'Sample Advertiser — 10s', 'https://example.com/campaign-b', 0.0002, 10),
  ('33333333-3333-3333-3333-333333333333', 'Sample Advertiser — 5s', 'https://example.com/campaign-c', 0.00005, 5)
ON CONFLICT (id) DO NOTHING;

