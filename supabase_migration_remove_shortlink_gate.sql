-- ============================================================
-- Migration: Remove the shortlink requirement from faucet claims
--
-- HOW TO APPLY: Paste ONLY this file's contents into the Supabase
-- SQL Editor and run it. Safe to re-run (CREATE OR REPLACE).
--
-- What it does: replaces faucet_claim() with a version that no
-- longer rejects claims with 'ad_verification_required' when the
-- user hasn't completed a shortlink that day. Claims now work
-- directly; shortlinks still award their +10 bonus claims/day
-- (that logic is untouched). Cooldown and daily-limit enforcement
-- are unchanged.
--
-- IMPORTANT: run this BEFORE deploying the matching app code —
-- until it is applied, the live RPC still requires a shortlink.
-- ============================================================

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
