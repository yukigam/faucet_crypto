import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

const FAUCETPAY_API = 'https://faucetpay.io/api/v1/send';
const TURNSTILE_VERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const SATOSHI_AMOUNT = '10000';
const DECIMAL_AMOUNT = '0.0001';
const CURRENCY = 'TON';

const COOLDOWN_MINUTES = 5;

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

    // Check cooldown (read-only, do NOT record yet)
    if (COOLDOWN_MINUTES > 0) {
      const { data: existing } = await supabase
        .from('claimants')
        .select('last_claim_at')
        .eq('faucetpay_address', address)
        .single<{ last_claim_at: string | null }>();

      if (existing?.last_claim_at) {
        const elapsed = Date.now() - new Date(existing.last_claim_at).getTime();
        if (elapsed < COOLDOWN_MINUTES * 60 * 1000) {
          return NextResponse.json({ error: 'Please wait before claiming again.' }, { status: 429 });
        }
      }
    }

    // Build and send FaucetPay request
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

    // Parse FaucetPay response
    let fpData: Record<string, unknown>;
    try {
      fpData = JSON.parse(rawText);
    } catch {
      console.error('[CLAIM] FaucetPay non-JSON response:', rawText);
      return NextResponse.json({
        success: false,
        error: `FaucetPay returned non-JSON: ${rawText.slice(0, 500)}`,
        raw_response: rawText.slice(0, 500),
      }, { status: 502 });
    }

    console.log('[CLAIM] FaucetPay full response:', JSON.stringify(fpData, null, 2));

    // If FaucetPay failed, return the EXACT error to the frontend
    if (fpData.status !== 200) {
      const exactError =
        (fpData as any).html_entity_decode ||
        (fpData as any).message ||
        JSON.stringify(fpData);

      console.error('[CLAIM] FaucetPay error response:', fpData);
      return NextResponse.json({
        success: false,
        error: exactError,
        faucetpay_status: fpData.status,
        faucetpay_full: fpData,
      }, { status: 502 });
    }

    // FaucetPay succeeded — NOW record the claim in Supabase
    const now = new Date().toISOString();
    const { data: dbResult, error: dbError } = await supabase.rpc('faucet_claim', {
      p_address: address,
      p_now: now,
      p_referrer: null,
    });

    if (dbError) {
      console.error('[CLAIM] DB record error after successful FaucetPay:', dbError);
    }

    const balance = (dbResult as any)?.balance ?? null;

    return NextResponse.json({
      success: true,
      balance,
      amount: DECIMAL_AMOUNT,
      currency: CURRENCY,
      txid: fpData.id,
      faucetpay_full: fpData,
      message: `Successfully claimed ${DECIMAL_AMOUNT} ${CURRENCY}!`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[CLAIM] Unhandled error:', err);
    return NextResponse.json({ error: message, success: false }, { status: 500 });
  }
}
