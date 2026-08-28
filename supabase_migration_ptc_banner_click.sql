-- ============================================================
-- Migration: Require Adsterra banner click before PTC timer
--
-- HOW TO APPLY: Paste ONLY this file's contents into the Supabase
-- SQL Editor and run it. Safe to re-run (CREATE OR REPLACE / IF NOT EXISTS).
--
-- Adds watch_started_at to ptc_views. The view timer on the client
-- and ptc_verify on the server only count elapsed time after the
-- user clicks the Adsterra banner (recorded via ptc_banner_click).
-- ============================================================

ALTER TABLE public.ptc_views
  ADD COLUMN IF NOT EXISTS watch_started_at TIMESTAMPTZ;

-- RPC: record banner click — starts the server-side watch timer
CREATE OR REPLACE FUNCTION public.ptc_banner_click(
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
  SELECT v.*
  INTO v_row
  FROM public.ptc_views v
  WHERE v.token = p_token
  FOR UPDATE OF v;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_token');
  END IF;

  IF v_row.status = 'completed' THEN
    RETURN jsonb_build_object('success', false, 'error', 'already_claimed');
  END IF;

  IF EXTRACT(EPOCH FROM (p_now - v_row.started_at)) > 600 THEN
    RETURN jsonb_build_object('success', false, 'error', 'session_expired');
  END IF;

  -- Idempotent: repeated clicks keep the original watch start time
  IF v_row.watch_started_at IS NULL THEN
    UPDATE public.ptc_views
    SET watch_started_at = p_now
    WHERE id = v_row.id;
    v_row.watch_started_at := p_now;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'watch_started_at', v_row.watch_started_at
  );
END;
$$;

-- RPC: read session info — include watch_started_at for timer resume
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
    'ad_active', v_row.ad_active
  );
END;
$$;

-- RPC: verify timer — elapsed time measured from watch_started_at
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

  IF EXTRACT(EPOCH FROM (p_now - v_row.started_at)) > 600 THEN
    UPDATE public.ptc_views SET status = 'completed', completed_at = p_now
    WHERE id = v_row.id AND status = 'pending';
    RETURN jsonb_build_object('success', false, 'error', 'session_expired');
  END IF;

  IF v_row.watch_started_at IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'banner_not_clicked');
  END IF;

  v_elapsed := EXTRACT(EPOCH FROM (p_now - v_row.watch_started_at));

  IF v_elapsed < v_row.duration_seconds THEN
    RETURN jsonb_build_object('success', false, 'error', 'timer_not_finished', 'elapsed', v_elapsed);
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
