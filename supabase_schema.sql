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
  referred_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

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
  v_last_date DATE;
  v_today DATE;
  v_daily_limit INT := 20;
BEGIN
  v_today := p_now::DATE;

  SELECT last_claim_at, balance, daily_claim_count, last_claim_date
  INTO v_last, v_balance, v_daily_count, v_last_date
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

  -- Reset daily counter if new day
  IF v_last_date IS NULL OR v_last_date < v_today THEN
    v_daily_count := 0;
  END IF;

  -- Daily limit check
  IF v_daily_count >= v_daily_limit THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'daily_limit',
      'message', 'Өнөөдрийн лимит дууссан, маргааш дахин оролдоно уу',
      'daily_claims', v_daily_count,
      'daily_limit', v_daily_limit
    );
  END IF;

  INSERT INTO public.claimants (faucetpay_address, balance, last_claim_at, daily_claim_count, last_claim_date, referred_by)
  VALUES (p_address, 0.00002, p_now, 1, v_today, p_referrer)
  ON CONFLICT (faucetpay_address)
  DO UPDATE SET
    balance = public.claimants.balance + 0.00002,
    last_claim_at = p_now,
    daily_claim_count = public.claimants.daily_claim_count + 1,
    last_claim_date = v_today,
    referred_by = CASE
      WHEN public.claimants.referred_by IS NULL AND p_referrer IS NOT NULL
      THEN p_referrer
      ELSE public.claimants.referred_by
    END;

  SELECT balance, daily_claim_count INTO v_balance, v_daily_count
  FROM public.claimants
  WHERE faucetpay_address = p_address;

  RETURN jsonb_build_object(
    'success', true,
    'balance', v_balance,
    'daily_claims', v_daily_count,
    'daily_limit', v_daily_limit
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
  reward NUMERIC DEFAULT 0.00005,
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
      'message', 'Өнөөдрийн shortlink лимит дууссан',
      'daily_claims', v_daily_shortlink,
      'daily_limit', v_daily_limit
    );
  END IF;

  v_token := gen_random_uuid()::text;

  INSERT INTO public.shortlink_claims (faucetpay_address, token, status, reward)
  VALUES (p_address, v_token, 'pending', 0.00005);

  RETURN jsonb_build_object(
    'success', true,
    'token', v_token,
    'daily_claims', v_daily_shortlink,
    'daily_limit', v_daily_limit
  );
END;
$$;

-- RPC: complete a shortlink claim (mark done, update balance)
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

  INSERT INTO public.claimants (faucetpay_address, balance)
  VALUES (v_claim.faucetpay_address, v_claim.reward)
  ON CONFLICT (faucetpay_address)
  DO UPDATE SET balance = public.claimants.balance + v_claim.reward;

  RETURN jsonb_build_object(
    'success', true,
    'address', v_claim.faucetpay_address,
    'reward', v_claim.reward,
    'daily_claims', (SELECT COUNT(*) FROM public.shortlink_claims
                     WHERE faucetpay_address = v_claim.faucetpay_address
                     AND created_at::DATE = p_now::DATE
                     AND status IN ('completed', 'claimed'))
  );
END;
$$;
