import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

const FAUCETPAY_API = 'https://faucetpay.io/api/v1/send';
const SATOSHI_AMOUNT = '50000';
const DECIMAL_AMOUNT = '0.0005';
const CURRENCY = 'TON';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get('token');

  console.log('[SHORTLINK_CALLBACK] Received callback', { token: token?.slice(0, 8) + '...', url: request.url });

  try {
    if (!token) {
      console.error('[SHORTLINK_CALLBACK] Missing token');
      return NextResponse.redirect(new URL('/shortlink/callback?status=error&msg=Missing+token', request.url));
    }

    const apiKey = process.env.FAUCETPAY_API_KEY;
    if (!apiKey) {
      console.error('[SHORTLINK_CALLBACK] FaucetPay API key not configured');
      return NextResponse.redirect(new URL('/shortlink/callback?status=error&msg=Payment+not+configured', request.url));
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseKey) {
      console.error('[SHORTLINK_CALLBACK] Supabase credentials not configured');
      return NextResponse.redirect(new URL('/shortlink/callback?status=error&msg=Database+not+configured', request.url));
    }

    const supabase = createServerClient(supabaseUrl, supabaseKey, {
      cookies: { getAll: () => [], setAll: () => {} },
    });

    const now = new Date().toISOString();
    console.log('[SHORTLINK_CALLBACK] Calling shortlink_claim_complete RPC', { token: token.slice(0, 8) + '...', now });

    const { data, error } = await supabase.rpc('shortlink_claim_complete', {
      p_token: token,
      p_now: now,
    });

    if (error) {
      console.error('[SHORTLINK_CALLBACK] RPC error:', { message: error.message, details: error.details, hint: error.hint, code: error.code });
      return NextResponse.redirect(new URL(`/shortlink/callback?status=error&msg=${encodeURIComponent(error.message)}`, request.url));
    }

    console.log('[SHORTLINK_CALLBACK] RPC result:', JSON.stringify(data));

    const result = data as {
      success: boolean;
      address?: string;
      reward?: number;
      daily_claims?: number;
      bonus_claims_added?: number;
      total_bonus_claims?: number;
      error?: string;
      message?: string;
    };

    if (!result.success) {
      console.error('[SHORTLINK_CALLBACK] RPC returned failure:', { error: result.error, message: result.message });
      return NextResponse.redirect(new URL(`/shortlink/callback?status=error&msg=${encodeURIComponent(result.message || 'Verification failed')}`, request.url));
    }

    console.log('[SHORTLINK_CALLBACK] Claim verified, sending FaucetPay payout', { to: result.address, amount: DECIMAL_AMOUNT });

    // Send payment via FaucetPay
    const fpForm = new URLSearchParams();
    fpForm.append('api_key', apiKey);
    fpForm.append('to', result.address!);
    fpForm.append('amount', SATOSHI_AMOUNT);
    fpForm.append('currency', CURRENCY);

    const fpRes = await fetch(FAUCETPAY_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: fpForm.toString(),
    });

    const rawText = await fpRes.text();
    console.log('[SHORTLINK_CALLBACK] FaucetPay raw response:', rawText);

    let fpSuccess = false;
    let fpId: string | undefined;
    try {
      const fpData = JSON.parse(rawText);
      fpSuccess = fpData.status === 200;
      fpId = fpData.id;
      console.log('[SHORTLINK_CALLBACK] FaucetPay parsed:', { status: fpData.status, id: fpData.id, message: fpData.message });
    } catch {
      console.error('[SHORTLINK_CALLBACK] FaucetPay non-JSON response');
    }

    if (fpSuccess) {
      console.log('[SHORTLINK_CALLBACK] Payout successful', { txid: fpId });
      return NextResponse.redirect(new URL(
        `/shortlink/callback?status=success&address=${encodeURIComponent(result.address || '')}&reward=${DECIMAL_AMOUNT}&daily_claims=${result.daily_claims}&bonus_added=${result.bonus_claims_added || 0}&txid=${fpId || ''}`,
        request.url
      ));
    }

    // Payment failed but DB recorded — still return success with warning
    console.warn('[SHORTLINK_CALLBACK] Payout failed but DB recorded');
    return NextResponse.redirect(new URL(
      `/shortlink/callback?status=success&address=${encodeURIComponent(result.address || '')}&reward=${DECIMAL_AMOUNT}&daily_claims=${result.daily_claims}&bonus_added=${result.bonus_claims_added || 0}&warning=Payment+may+be+delayed`,
      request.url
    ));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error';
    console.error('[SHORTLINK_CALLBACK] Unhandled exception:', err);
    return NextResponse.redirect(new URL(`/shortlink/callback?status=error&msg=${encodeURIComponent(message)}`, request.url));
  }
}
