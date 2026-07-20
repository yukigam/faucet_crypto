import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

const FAUCETPAY_API = 'https://faucetpay.io/api/v1/send';
const AMOUNT = '100';
const CURRENCY = 'TON';

export async function POST(request: Request) {
  try {
    const { address, referralCode } = await request.json();

    if (!address || typeof address !== 'string') {
      return NextResponse.json({ error: 'FaucetPay address is required' }, { status: 400 });
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

    // Check cooldown and update balance via RPC
    const now = new Date().toISOString();
    const { data: rpcResult, error: rpcError } = await supabase.rpc('faucet_claim', {
      p_address: address,
      p_now: now,
      p_referrer: referralCode || null,
    });

    if (rpcError) {
      console.error('[CLAIM] DB RPC error:', rpcError);
      return NextResponse.json({ error: rpcError.message }, { status: 500 });
    }

    const result = rpcResult as { success: boolean; error?: string; message?: string; balance?: number };

    if (!result.success) {
      return NextResponse.json({ error: result.message || 'Cooldown active' }, { status: 429 });
    }

    // Build FaucetPay request
    const fpForm = new URLSearchParams();
    fpForm.append('api_key', apiKey);
    fpForm.append('to', address);
    fpForm.append('amount', AMOUNT);
    fpForm.append('currency', CURRENCY);

    console.log('[CLAIM] Sending to FaucetPay:', {
      url: FAUCETPAY_API,
      currency: CURRENCY,
      amount: AMOUNT,
      to: address,
    });

    const fpRes = await fetch(FAUCETPAY_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: fpForm.toString(),
    });

    // Read raw text first to handle non-JSON responses
    const rawText = await fpRes.text();
    console.log('[CLAIM] FaucetPay raw response:', rawText);

    let fpData: Record<string, unknown>;
    try {
      fpData = JSON.parse(rawText);
    } catch {
      return NextResponse.json({
        success: false,
        error: `FaucetPay returned non-JSON: ${rawText.slice(0, 500)}`,
      }, { status: 502 });
    }

    // FaucetPay returns status == 200 on success
    if (fpData.status !== 200) {
      const errorMsg = typeof fpData.message === 'string'
        ? fpData.message
        : JSON.stringify(fpData.message || 'FaucetPay payment failed');

      console.error('[CLAIM] FaucetPay error:', { status: fpData.status, message: errorMsg });
      return NextResponse.json({
        success: false,
        error: errorMsg,
        faucetpay_status: fpData.status,
      }, { status: 502 });
    }

    console.log('[CLAIM] FaucetPay success:', fpData);

    return NextResponse.json({
      success: true,
      balance: result.balance,
      amount: AMOUNT,
      currency: CURRENCY,
      txid: fpData.id,
      message: `Successfully claimed ${AMOUNT} ${CURRENCY}!`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[CLAIM] Unhandled error:', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
