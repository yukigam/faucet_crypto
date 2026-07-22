import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

const FAUCETPAY_API = 'https://faucetpay.io/api/v1/send';
const SATOSHI_AMOUNT = '5000';
const DECIMAL_AMOUNT = '0.00005';
const CURRENCY = 'TON';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');

    if (!token) {
      return NextResponse.redirect(new URL('/shortlink/callback?status=error&msg=Missing token', request.url));
    }

    const apiKey = process.env.FAUCETPAY_API_KEY;
    if (!apiKey) {
      return NextResponse.redirect(new URL('/shortlink/callback?status=error&msg=Payment not configured', request.url));
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.redirect(new URL('/shortlink/callback?status=error&msg=Database not configured', request.url));
    }

    const supabase = createServerClient(supabaseUrl, supabaseKey, {
      cookies: { getAll: () => [], setAll: () => {} },
    });

    const now = new Date().toISOString();
    const { data, error } = await supabase.rpc('shortlink_claim_complete', {
      p_token: token,
      p_now: now,
    });

    if (error) {
      console.error('[SHORTLINK_CALLBACK] RPC error:', error);
      return NextResponse.redirect(new URL(`/shortlink/callback?status=error&msg=${encodeURIComponent(error.message)}`, request.url));
    }

    const result = data as {
      success: boolean;
      address?: string;
      reward?: number;
      daily_claims?: number;
      error?: string;
      message?: string;
    };

    if (!result.success) {
      return NextResponse.redirect(new URL(`/shortlink/callback?status=error&msg=${encodeURIComponent(result.message || 'Verification failed')}`, request.url));
    }

    // Send payment via FaucetPay
    const fpForm = new URLSearchParams();
    fpForm.append('api_key', apiKey);
    fpForm.append('to', result.address!);
    fpForm.append('amount', SATOSHI_AMOUNT);
    fpForm.append('currency', CURRENCY);

    console.log('[SHORTLINK_CALLBACK] Sending FaucetPay payout:', {
      to: result.address,
      amount: DECIMAL_AMOUNT,
    });

    const fpRes = await fetch(FAUCETPAY_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: fpForm.toString(),
    });

    const rawText = await fpRes.text();
    console.log('[SHORTLINK_CALLBACK] FaucetPay response:', rawText);

    let fpSuccess = false;
    let fpId: string | undefined;
    try {
      const fpData = JSON.parse(rawText);
      fpSuccess = fpData.status === 200;
      fpId = fpData.id;
    } catch {
      console.warn('[SHORTLINK_CALLBACK] FaucetPay non-JSON response');
    }

    if (fpSuccess) {
      return NextResponse.redirect(new URL(
        `/shortlink/callback?status=success&reward=${DECIMAL_AMOUNT}&daily_claims=${result.daily_claims}&txid=${fpId || ''}`,
        request.url
      ));
    }

    // Payment failed but DB recorded — still return success with warning
    return NextResponse.redirect(new URL(
      `/shortlink/callback?status=success&reward=${DECIMAL_AMOUNT}&daily_claims=${result.daily_claims}&warning=Payment+may+be+delayed`,
      request.url
    ));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error';
    console.error('[SHORTLINK_CALLBACK] Unhandled error:', err);
    return NextResponse.redirect(new URL(`/shortlink/callback?status=error&msg=${encodeURIComponent(message)}`, request.url));
  }
}
