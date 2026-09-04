-- ============================================================
-- Migration: PTC direct watch flow (CoinPly/Cointiply-style)
--
-- Removes the Adsterra-banner-click requirement from the PTC watch
-- flow. The banner is still displayed prominently on /ptc/view, but
-- clicking it is optional: the countdown starts as soon as the tab is
-- visible and focused, and when it hits 0 the reward is verified and
-- paid out instantly (no captcha, no click gate).
--
-- Anti-cheat is preserved:
--   * per-second server-side ticks (watch-tick, 0.85s debounce)
--   * active_watch_seconds must reach duration_seconds before verify
--   * 10-minute session expiry
--   * single-use tokens, one completed view per user/ad/day
--
-- Run this whole file in the Supabase SQL Editor. Idempotent.
-- ============================================================

-- The banner-click RPC is no longer part of the flow.
DROP FUNCTION IF EXISTS public.ptc_banner_click(TEXT, TIMESTAMPTZ);

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
