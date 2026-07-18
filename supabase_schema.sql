-- ============================================================
-- Crypto Faucet - Full Database Schema
-- Run this entire script in your Supabase SQL Editor
-- ============================================================

DROP FUNCTION IF EXISTS claim_faucet(uuid, timestamp with time zone);
DROP FUNCTION IF EXISTS claim_faucet(uuid, timestamptz);

-- 1. PROFILES TABLE
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  referral_code TEXT UNIQUE NOT NULL,
  referred_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. FAUCET CLAIMS TABLE (one row per user)
CREATE TABLE IF NOT EXISTS public.faucet_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  balance NUMERIC DEFAULT 0,
  last_claim_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.faucet_claims ENABLE ROW LEVEL SECURITY;

-- Profiles: users can read own row
CREATE POLICY "profiles_select_own"
  ON public.profiles
  FOR SELECT
  USING (auth.uid() = id);

-- Profiles: users can update own row (except referral_code and referred_by)
CREATE POLICY "profiles_update_own"
  ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Faucet claims: users can read own row
CREATE POLICY "faucet_claims_select_own"
  ON public.faucet_claims
  FOR SELECT
  USING (auth.uid() = user_id);

-- ============================================================
-- FUNCTIONS
-- ============================================================

-- Generate unique 8-character referral code
CREATE OR REPLACE FUNCTION public.generate_referral_code()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  code TEXT;
BEGIN
  code := upper(substr(md5(gen_random_uuid()::text), 1, 8));
  RETURN code;
END;
$$;

-- Claim faucet: adds 0.001 coins, enforces 5-min cooldown
CREATE OR REPLACE FUNCTION public.claim_faucet(
  p_user_id UUID,
  p_claimed_at TIMESTAMPTZ
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_last_claim TIMESTAMPTZ;
BEGIN
  SELECT last_claim_at INTO v_last_claim
  FROM public.faucet_claims
  WHERE user_id = p_user_id;

  IF v_last_claim IS NOT NULL AND p_claimed_at < v_last_claim + INTERVAL '5 minutes' THEN
    RAISE EXCEPTION 'cooldown' USING HINT = 'Please wait 5 minutes between claims';
  END IF;

  INSERT INTO public.faucet_claims (user_id, balance, last_claim_at)
  VALUES (p_user_id, 0.001, p_claimed_at)
  ON CONFLICT (user_id)
  DO UPDATE SET
    balance = public.faucet_claims.balance + 0.001,
    last_claim_at = p_claimed_at;
END;
$$;

-- ============================================================
-- TRIGGER: Auto-create profile + faucet_claims on signup
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  ref_code TEXT;
  ref_by UUID;
BEGIN
  -- Generate unique referral code
  LOOP
    ref_code := public.generate_referral_code();
    BEGIN
      INSERT INTO public.profiles (id, email, referral_code)
      VALUES (NEW.id, NEW.email, ref_code);
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      -- retry with new code
    END;
  END LOOP;

  -- Create faucet_claims row with 0 balance
  INSERT INTO public.faucet_claims (user_id, balance)
  VALUES (NEW.id, 0);

  -- Check URL-encoded referral metadata (set during signup)
  BEGIN
    ref_by := (NEW.raw_user_meta_data->>'referral_code')::UUID;
    IF ref_by IS NOT NULL THEN
      UPDATE public.profiles
      SET referred_by = ref_by
      WHERE id = NEW.id;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- ignore invalid ref
  END;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
