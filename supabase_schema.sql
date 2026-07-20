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

-- Allow anonymous inserts (for API with service_role key)
CREATE POLICY "claimants_insert_anon"
  ON public.claimants
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "claimants_select_anon"
  ON public.claimants
  FOR SELECT
  USING (true);

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
