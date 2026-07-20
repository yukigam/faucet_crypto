-- ============================================================
-- Crypto Faucet - Database Schema (FaucetPay-based)
-- Run this entire script in your Supabase SQL Editor
-- ============================================================

DROP TABLE IF EXISTS public.claimants CASCADE;

CREATE TABLE public.claimants (
  faucetpay_address TEXT PRIMARY KEY,
  balance NUMERIC DEFAULT 0,
  last_claim_at TIMESTAMPTZ,
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

-- RPC: safe claim with cooldown check
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
BEGIN
  SELECT last_claim_at, balance INTO v_last, v_balance
  FROM public.claimants
  WHERE faucetpay_address = p_address;

  IF v_last IS NOT NULL AND p_now < v_last + INTERVAL '5 minutes' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'cooldown',
      'message', 'Please wait 5 minutes between claims'
    );
  END IF;

  INSERT INTO public.claimants (faucetpay_address, balance, last_claim_at, referred_by)
  VALUES (p_address, 0.001, p_now, p_referrer)
  ON CONFLICT (faucetpay_address)
  DO UPDATE SET
    balance = public.claimants.balance + 0.001,
    last_claim_at = p_now,
    referred_by = CASE
      WHEN public.claimants.referred_by IS NULL AND p_referrer IS NOT NULL
      THEN p_referrer
      ELSE public.claimants.referred_by
    END;

  SELECT balance INTO v_balance
  FROM public.claimants
  WHERE faucetpay_address = p_address;

  RETURN jsonb_build_object(
    'success', true,
    'balance', v_balance
  );
END;
$$;
