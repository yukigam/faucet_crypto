import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { sendFaucetPayPayout, toSatoshi } from '@/lib/faucetpay';

const CURRENCY = 'TON';

function getIP(request: Request): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    request.headers.get('cf-connecting-ip') ||
    'unknown'
  );
}

export async function POST(request: Request) {
  const ip = getIP(request);

  try {
    const { token } = await request.json();

    if (!token || typeof token !== 'string' || token.length > 100) {
      return NextResponse.json({ success: false, error: 'invalid_token' }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    }

    const supabase = createServerClient(supabaseUrl, supabaseKey, {
      cookies: { getAll: () => [], setAll: () => {} },
    });

    // --- IP rate limit ---
    const { data: rateData, error: rateError } = await supabase.rpc('check_ip_rate_limit', {
      p_ip: ip,
      p_now: new Date().toISOString(),
      p_max_attempts: 30,
      p_window_seconds: 60,
    });

    const rateResult = rateData as { allowed: boolean; attempts: number; retry_after?: number } | undefined;

    if (rateError || !rateResult?.allowed) {
      console.warn('[PTC_VERIFY] IP rate limit exceeded', { ip });
      return NextResponse.json({
        success: false,
        error: 'Too many requests. Please slow down.',
        retry_after: rateResult?.retry_after || 60,
      }, { status: 429 });
    }

    // Reward is credited inside the SQL function, which enforces:
    // pending -> completed single-use transition, elapsed >= duration,
    // and expiry of sessions left unverified for over 10 minutes.
    const { data, error } = await supabase.rpc('ptc_verify', {
      p_token: token,
      p_now: new Date().toISOString(),
    });

    if (error) {
      console.error('[PTC_VERIFY] RPC error:', error.message);
      return NextResponse.json({ error: 'Verification failed' }, { status: 500 });
    }

    const result = data as {
      success: boolean;
      reward?: number;
      balance?: number;
      daily_claims?: number;
      error?: string;
      elapsed?: number;
    };

    if (!result.success) {
      const messages: Record<string, string> = {
        invalid_token: 'Invalid ad view session.',
        already_claimed: 'Reward already credited for this session.',
        timer_not_finished: 'The ad view timer is not finished yet.',
        banner_not_clicked: 'Click the Adsterra banner ad to start the timer.',
        session_expired: 'View session expired — start the ad again.',
        ad_unavailable: 'This ad is no longer available.',
      };
      const status = result.error === 'timer_not_finished' || result.error === 'banner_not_clicked' ? 403 : 400;
      return NextResponse.json({
        success: false,
        error: messages[result.error ?? ''] || 'Verification failed',
        code: result.error,
        elapsed: result.elapsed,
      }, { status });
    }

    // --- Immediate FaucetPay payout (same mechanism as shortlinks): the DB
    // credit above is final; the reward is now pushed to the user's
    // registered FaucetPay email. A failed payout never rolls the credit
    // back — it is surfaced as a warning instead.
    const reward = Number(result.reward ?? 0);
    let txid: string | undefined;
    let warning: string | undefined;

    const apiKey = process.env.FAUCETPAY_API_KEY;
    if (!apiKey) {
      console.error('[PTC_VERIFY] FaucetPay API key not configured');
      warning = 'FaucetPay not configured';
    } else {
      // The verify RPC doesn't return the address; resolve it from the view
      // row so the payout reaches the user's FaucetPay account.
      const { data: viewRow, error: viewError } = await supabase
        .from('ptc_views')
        .select('faucetpay_address')
        .eq('token', token)
        .single();

      const payTo = viewRow?.faucetpay_address;
      if (viewError || !payTo) {
        console.error('[PTC_VERIFY] Could not resolve payout address:', viewError?.message);
        warning = 'Payout address not found';
      } else {
        console.log('[PTC_VERIFY] Sending FaucetPay payout', {
          to: payTo,
          reward,
          satoshi: toSatoshi(reward),
        });
        const payout = await sendFaucetPayPayout({
          apiKey,
          to: payTo,
          amountSatoshi: toSatoshi(reward),
          currency: CURRENCY,
        });

        if (payout.ok) {
          txid = payout.txid;
          console.log('[PTC_VERIFY] Payout successful', { txid: payout.txid });
        } else {
          warning = `Payment pending: ${payout.error}`;
          console.error('[PTC_VERIFY] Payout failed after credit:', payout.error);
        }
      }
    }

    return NextResponse.json({
      success: true,
      reward: result.reward,
      balance: result.balance,
      daily_claims: result.daily_claims,
      txid,
      warning,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[PTC_VERIFY] Unhandled error:', err);
    return NextResponse.json({ error: message, success: false }, { status: 500 });
  }
}
