import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

const FAUCETPAY_API = 'https://faucetpay.io/api/v1/send';
const TURNSTILE_VERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const SATOSHI_AMOUNT = '200';
const DECIMAL_AMOUNT = '0.000002';
const CURRENCY = 'TON';

export async function POST(request: Request) {
  try {
    const { address, turnstileToken } = await request.json();

    if (!address || typeof address !== 'string') {
      return NextResponse.json({ error: 'FaucetPay address is required' }, { status: 400 });
    }

    // Verify Turnstile captcha
    if (!turnstileToken || typeof turnstileToken !== 'string') {
      return NextResponse.json({ success: false, error: 'Captcha verification failed' }, { status: 400 });
    }

    const verifyForm = new URLSearchParams();
    verifyForm.append('secret', '0x4AAAAAAD5kW6lb2Rf1JnV4-V066CgPM0o');
    verifyForm.append('response', turnstileToken);

    const verifyRes = await fetch(TURNSTILE_VERIFY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: verifyForm.toString(),
    });

    const verifyData: { success: boolean } = await verifyRes.json();

    if (!verifyData.success) {
      return NextResponse.json({ success: false, error: 'Captcha verification failed' }, { status: 400 });
    }

    const apiKey = process.env.FAUCETPAY_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'FaucetPay API key not configured' }, { status: 500 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    }

    const supabase = createServerClient(supabaseUrl, supabaseKey, {
      cookies: { getAll: () => [], setAll: () => {} },
    });

    // Step 1: Record claim in DB (handles cooldown, daily limit, balance)
    const now = new Date().toISOString();
    const { data: dbResult, error: dbError } = await supabase.rpc('faucet_claim', {
      p_address: address,
      p_now: now,
      p_referrer: null,
    });

    if (dbError) {
      console.error('[CLAIM] DB RPC error:', dbError);
      return NextResponse.json({ error: dbError.message }, { status: 500 });
    }

    const result = dbResult as {
      success: boolean;
      balance?: number;
      daily_claims?: number;
      daily_limit?: number;
      error?: string;
      message?: string;
    };

    if (!result.success) {
      if (result.error === 'daily_limit') {
        return NextResponse.json({
          success: false,
          error: result.message || 'Өнөөдрийн лимит дууссан',
          daily_claims: result.daily_claims,
          daily_limit: result.daily_limit,
        }, { status: 429 });
      }
      if (result.error === 'cooldown') {
        return NextResponse.json({ error: result.message || 'Please wait' }, { status: 429 });
      }
      return NextResponse.json({ error: result.message || 'Claim failed' }, { status: 500 });
    }

    // Step 2: Send payment via FaucetPay
    const fpForm = new URLSearchParams();
    fpForm.append('api_key', apiKey);
    fpForm.append('to', address);
    fpForm.append('amount', SATOSHI_AMOUNT);
    fpForm.append('currency', CURRENCY);

    console.log('[CLAIM] Sending to FaucetPay:', {
      currency: CURRENCY,
      amount: `${DECIMAL_AMOUNT} TON -> ${SATOSHI_AMOUNT} satoshi`,
      to: address,
    });

    const fpRes = await fetch(FAUCETPAY_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: fpForm.toString(),
    });

    const rawText = await fpRes.text();
    console.log('[CLAIM] FaucetPay raw response:', rawText);

    let fpData: Record<string, unknown>;
    try {
      fpData = JSON.parse(rawText);
    } catch {
      // DB recorded but payment failed — log and still return partial success
      console.error('[CLAIM] FaucetPay non-JSON after DB record:', rawText);
      return NextResponse.json({
        success: true,
        balance: result.balance,
        amount: DECIMAL_AMOUNT,
        currency: CURRENCY,
        daily_claims: result.daily_claims,
        daily_limit: result.daily_limit,
        warning: 'Claim recorded but payment may be delayed',
        message: `Successfully claimed ${DECIMAL_AMOUNT} ${CURRENCY}!`,
      });
    }

    if (fpData.status !== 200) {
      const exactError =
        (fpData as any).html_entity_decode ||
        (fpData as any).message ||
        JSON.stringify(fpData);
      console.error('[CLAIM] FaucetPay error after DB record:', fpData);
      // Payment failed but DB already recorded — still return success with warning
      return NextResponse.json({
        success: true,
        balance: result.balance,
        amount: DECIMAL_AMOUNT,
        currency: CURRENCY,
        daily_claims: result.daily_claims,
        daily_limit: result.daily_limit,
        warning: `Payment pending: ${exactError}`,
        message: `Successfully claimed ${DECIMAL_AMOUNT} ${CURRENCY}!`,
      });
    }

    return NextResponse.json({
      success: true,
      balance: result.balance,
      amount: DECIMAL_AMOUNT,
      currency: CURRENCY,
      txid: fpData.id,
      daily_claims: result.daily_claims,
      daily_limit: result.daily_limit,
      message: `Successfully claimed ${DECIMAL_AMOUNT} ${CURRENCY}!`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[CLAIM] Unhandled error:', err);
    return NextResponse.json({ error: message, success: false }, { status: 500 });
  }
}
