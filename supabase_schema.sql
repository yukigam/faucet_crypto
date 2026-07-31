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
  v_daily_limit INT := 1;
  v_effective_limit INT;
  v_bonus_date DATE;
  v_ad_verified BOOLEAN;
BEGIN
  v_today := p_now::DATE;

  -- Server-side ad verification: claim is only allowed if a ShrinkMe
  -- shortlink was completed (server-verified) on the same day.
  SELECT EXISTS (
    SELECT 1 FROM public.shortlink_claims
    WHERE faucetpay_address = p_address
      AND created_at::DATE = v_today
      AND status IN ('completed', 'claimed')
  ) INTO v_ad_verified;

  IF NOT v_ad_verified THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'ad_verification_required',
      'message', 'Ad verification required: complete a shortlink first'
    );
  END IF;

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
