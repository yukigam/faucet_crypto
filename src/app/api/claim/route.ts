import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { sendFaucetPayPayout, toSatoshi } from '@/lib/faucetpay';

const TURNSTILE_VERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
// Must match the per-claim reward hardcoded inside the faucet_claim() SQL function
const DECIMAL_AMOUNT = '0.000002';
const SATOSHI_AMOUNT = toSatoshi(Number(DECIMAL_AMOUNT));
const CURRENCY = 'TON';

function getIP(request: Request): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    request.headers.get('cf-connecting-ip') ||
    'unknown'
  );
}

async function logClaim(supabase: ReturnType<typeof createServerClient>, log: {
  faucetpay_address: string;
  ip_address: string;
  user_agent: string;
  turnstile_passed: boolean;
  success: boolean;
  error_type: string | null;
}) {
  try {
    await supabase.from('claim_log').insert(log);
  } catch (e) {
    console.error('[CLAIM] Failed to log claim:', e);
  }
}

export async function POST(request: Request) {
  const ip = getIP(request);
  const userAgent = request.headers.get('user-agent') || 'unknown';

  try {
    const { address, turnstileToken } = await request.json();

    if (!address || typeof address !== 'string') {
      return NextResponse.json({ error: 'FaucetPay address is required' }, { status: 400 });
    }

    const turnstileSecret = process.env.TURNSTILE_SECRET_KEY;
    if (!turnstileSecret) {
      console.error('[CLAIM] TURNSTILE_SECRET_KEY not configured');
      return NextResponse.json({ error: 'Captcha server misconfigured' }, { status: 500 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    }

    const supabase = createServerClient(supabaseUrl, supabaseKey, {
      cookies: { getAll: () => [], setAll: () => {} },
    });

    // --- Step 0: IP Rate Limit Check ---
    const now = new Date().toISOString();
    const { data: rateData, error: rateError } = await supabase.rpc('check_ip_rate_limit', {
      p_ip: ip,
      p_now: now,
      p_max_attempts: 30,
      p_window_seconds: 60,
    });

    const rateResult = rateData as { allowed: boolean; attempts: number; max_attempts: number; retry_after?: number } | undefined;

    if (rateError || !rateResult?.allowed) {
      console.warn('[CLAIM] IP rate limit exceeded', { ip, attempts: rateResult?.attempts });
      await logClaim(supabase, {
        faucetpay_address: address,
        ip_address: ip,
        user_agent: userAgent,
        turnstile_passed: false,
        success: false,
        error_type: 'ip_rate_limit',
      });
      return NextResponse.json({
        success: false,
        error: 'Too many requests. Please slow down.',
        retry_after: rateResult?.retry_after || 60,
      }, { status: 429 });
    }

    // --- Step 1: Verify Turnstile captcha ---
    if (!turnstileToken || typeof turnstileToken !== 'string') {
      await logClaim(supabase, {
        faucetpay_address: address,
        ip_address: ip,
        user_agent: userAgent,
        turnstile_passed: false,
        success: false,
        error_type: 'missing_captcha',
      });
      return NextResponse.json({ success: false, error: 'Captcha verification failed' }, { status: 400 });
    }

    const verifyForm = new URLSearchParams();
    verifyForm.append('secret', turnstileSecret);
    verifyForm.append('response', turnstileToken);

    const verifyRes = await fetch(TURNSTILE_VERIFY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: verifyForm.toString(),
    });

    const verifyData: { success: boolean } = await verifyRes.json();

    if (!verifyData.success) {
      await logClaim(supabase, {
        faucetpay_address: address,
        ip_address: ip,
        user_agent: userAgent,
        turnstile_passed: false,
        success: false,
        error_type: 'invalid_captcha',
      });
      return NextResponse.json({ success: false, error: 'Captcha verification failed' }, { status: 400 });
    }

    const apiKey = process.env.FAUCETPAY_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'FaucetPay API key not configured' }, { status: 500 });
    }

    // --- Step 2: Record claim in DB (handles cooldown, daily limit, balance) ---
    const { data: dbResult, error: dbError } = await supabase.rpc('faucet_claim', {
      p_address: address,
      p_now: now,
      p_referrer: null,
    });

    if (dbError) {
      console.error('[CLAIM] DB RPC error:', dbError);
      await logClaim(supabase, {
        faucetpay_address: address,
        ip_address: ip,
        user_agent: userAgent,
        turnstile_passed: true,
        success: false,
        error_type: 'db_rpc_error',
      });
      return NextResponse.json({ error: dbError.message }, { status: 500 });
    }

    const result = dbResult as {
      success: boolean;
      balance?: number;
      daily_claims?: number;
      daily_limit?: number;
      bonus_claims?: number;
      effective_limit?: number;
      error?: string;
      message?: string;
    };

    if (!result.success) {
      if (result.error === 'daily_limit') {
        await logClaim(supabase, {
          faucetpay_address: address,
          ip_address: ip,
          user_agent: userAgent,
          turnstile_passed: true,
          success: false,
          error_type: 'daily_limit',
        });
        return NextResponse.json({
          success: false,
          error: result.message || 'Daily limit reached',
          daily_claims: result.daily_claims,
          daily_limit: result.daily_limit,
          bonus_claims: result.bonus_claims,
          effective_limit: result.effective_limit,
        }, { status: 429 });
      }
      if (result.error === 'cooldown') {
        await logClaim(supabase, {
          faucetpay_address: address,
          ip_address: ip,
          user_agent: userAgent,
          turnstile_passed: true,
          success: false,
          error_type: 'cooldown',
        });
        return NextResponse.json({ error: result.message || 'Please wait' }, { status: 429 });
      }
      await logClaim(supabase, {
        faucetpay_address: address,
        ip_address: ip,
        user_agent: userAgent,
        turnstile_passed: true,
        success: false,
        error_type: result.error || 'unknown',
      });
      return NextResponse.json({ error: result.message || 'Claim failed' }, { status: 500 });
    }

    // --- Step 3: Send payment via FaucetPay ---
    console.log('[CLAIM] Sending to FaucetPay:', {
      currency: CURRENCY,
      amount: `${DECIMAL_AMOUNT} TON -> ${SATOSHI_AMOUNT} satoshi`,
      to: address,
    });

    const payout = await sendFaucetPayPayout({
      apiKey,
      to: address,
      amountSatoshi: SATOSHI_AMOUNT,
      currency: CURRENCY,
    });

    if (payout.ok) {
      await logClaim(supabase, {
        faucetpay_address: address,
        ip_address: ip,
        user_agent: userAgent,
        turnstile_passed: true,
        success: true,
        error_type: null,
      });

      return NextResponse.json({
        success: true,
        balance: result.balance,
        amount: DECIMAL_AMOUNT,
        currency: CURRENCY,
        txid: payout.txid,
        daily_claims: result.daily_claims,
        daily_limit: result.daily_limit,
        bonus_claims: result.bonus_claims,
        effective_limit: result.effective_limit,
        message: `Successfully claimed ${DECIMAL_AMOUNT} ${CURRENCY}!`,
      });
    }

    // Payout failed but the claim is recorded — surface the exact reason
    // instead of silently swallowing it
    console.error('[CLAIM] FaucetPay error after DB record:', payout.error);
    await logClaim(supabase, {
      faucetpay_address: address,
      ip_address: ip,
      user_agent: userAgent,
      turnstile_passed: true,
      success: true,
      error_type: null,
    });

    return NextResponse.json({
      success: true,
      balance: result.balance,
      amount: DECIMAL_AMOUNT,
      currency: CURRENCY,
      daily_claims: result.daily_claims,
      daily_limit: result.daily_limit,
      bonus_claims: result.bonus_claims,
      effective_limit: result.effective_limit,
      warning: `Payment pending: ${payout.error}`,
      message: `Successfully claimed ${DECIMAL_AMOUNT} ${CURRENCY}!`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[CLAIM] Unhandled error:', err);
    return NextResponse.json({ error: message, success: false }, { status: 500 });
  }
}
