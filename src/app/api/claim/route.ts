import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

const FAUCETPAY_API = 'https://faucetpay.io/api/v1/send';

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
      return NextResponse.json({ error: rpcError.message }, { status: 500 });
    }

    const result = rpcResult as { success: boolean; error?: string; message?: string; balance?: number };

    if (!result.success) {
      return NextResponse.json({ error: result.message || 'Cooldown active' }, { status: 429 });
    }

    // Call FaucetPay API
    const fpForm = new URLSearchParams();
    fpForm.append('api_key', apiKey);
    fpForm.append('to', address);
    fpForm.append('amount', '0.001');
    fpForm.append('currency', 'DOGE');

    const fpRes = await fetch(FAUCETPAY_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: fpForm.toString(),
    });

    const fpData = await fpRes.json();

    if (fpData.status !== 200) {
      return NextResponse.json({
        error: fpData.message || 'FaucetPay payment failed',
      }, { status: 502 });
    }

    return NextResponse.json({
      success: true,
      balance: result.balance,
      txid: fpData.id,
      message: 'Coins sent to your FaucetPay account!',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
