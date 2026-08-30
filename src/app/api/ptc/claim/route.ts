import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { sendFaucetPayPayout, toSatoshi } from '@/lib/faucetpay';

const CURRENCY = 'TON';
const MIN_WATCH_SECONDS = 5;

function getIP(request: Request): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    request.headers.get('cf-connecting-ip') ||
    'unknown'
  );
}

function isValidUUID(s: string): boolean {
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRe.test(s);
}

export async function POST(request: Request) {
  const ip = getIP(request);

  try {
    const body = await request.json();
    const address = typeof body?.address === 'string' ? body.address.trim() : '';
    const adId = typeof body?.adId === 'string' ? body.adId.trim() : '';

    if (!address || address.length > 200) {
      return NextResponse.json(
        { success: false, error: 'Valid FaucetPay email/address is required.' },
        { status: 400 },
      );
    }
    if (!adId || !isValidUUID(adId)) {
      return NextResponse.json(
        { success: false, error: 'Valid ad ID is required.' },
        { status: 400 },
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json(
        { success: false, error: 'Server not configured.' },
        { status: 500 },
      );
    }

    const supabase = createServerClient(supabaseUrl, supabaseKey, {
      cookies: { getAll: () => [], setAll: () => {} },
    });

    const { data: rateData, error: rateError } = await supabase.rpc('check_ip_rate_limit', {
      p_ip: ip,
      p_now: new Date().toISOString(),
      p_max_attempts: 20,
      p_window_seconds: 60,
    });

    const rateResult = rateData as
      | { allowed: boolean; attempts: number; retry_after?: number }
      | undefined;

    if (rateError || !rateResult?.allowed) {
      console.warn('[PTC_CLAIM] IP rate limit exceeded', { ip });
      return NextResponse.json(
        {
          success: false,
          error: 'Too many requests. Please slow down.',
          retry_after: rateResult?.retry_after || 60,
        },
        { status: 429 },
      );
    }

    const nowISO = new Date().toISOString();
    const payoutResult = await performClaim(supabase, {
      address,
      adId,
      nowISO,
    });

    if (!payoutResult.success) {
      return NextResponse.json(
        { success: false, error: payoutResult.error, code: payoutResult.code },
        { status: payoutResult.status ?? 400 },
      );
    }

    const reward = Number(payoutResult.reward ?? 0);

    const apiKey = process.env.FAUCETPAY_API_KEY;
    let txid: string | undefined;
    let warning: string | undefined;

    if (!apiKey) {
      console.error('[PTC_CLAIM] FaucetPay API key not configured');
      warning = 'FaucetPay API not configured — contact admin.';
    } else {
      const satoshi = toSatoshi(reward);
      console.log('[PTC_CLAIM] Sending FaucetPay payout', {
        to: address,
        reward,
        satoshi,
        adId,
      });
      const payout = await sendFaucetPayPayout({
        apiKey,
        to: address,
        amountSatoshi: satoshi,
        currency: CURRENCY,
      });

      if (payout.ok) {
        txid = payout.txid;
        console.log('[PTC_CLAIM] Payout successful', { txid: payout.txid });
      } else {
        warning = `Payment pending: ${payout.error}`;
        console.error('[PTC_CLAIM] Payout failed after claim:', payout.error);
      }
    }

    return NextResponse.json({
      success: true,
      reward,
      currency: CURRENCY,
      txid,
      warning,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[PTC_CLAIM] Unhandled error:', err);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}

type ClaimParams = {
  address: string;
  adId: string;
  nowISO: string;
};

type ClaimInternalResult =
  | { success: true; reward: number }
  | {
      success: false;
      error: string;
      code?: string;
      status?: number;
    };

async function performClaim(
  supabase: ReturnType<typeof createServerClient>,
  params: ClaimParams,
): Promise<ClaimInternalResult> {
  const { address, adId, nowISO } = params;

  const { data: adRow, error: adError } = await supabase
    .from('ptc_ads')
    .select('id, title, reward, duration_seconds, max_total_views, total_views, active')
    .eq('id', adId)
    .single();

  if (adError || !adRow) {
    return { success: false, error: 'Ad not found.', code: 'ad_not_found', status: 404 };
  }

  if (!adRow.active) {
    return {
      success: false,
      error: 'This ad is no longer active.',
      code: 'ad_unavailable',
      status: 400,
    };
  }

  if (
    typeof adRow.max_total_views === 'number' &&
    adRow.total_views >= adRow.max_total_views
  ) {
    return {
      success: false,
      error: 'This ad has reached its view budget.',
      code: 'ad_exhausted',
      status: 400,
    };
  }

  const minDuration = Math.max(MIN_WATCH_SECONDS, Number(adRow.duration_seconds ?? 0));

  const { data: dailyCheck, error: dailyError } = await supabase
    .from('ptc_views')
    .select('id')
    .eq('ad_id', adId)
    .eq('faucetpay_address', address)
    .eq('status', 'completed')
    .gte(
      'started_at',
      new Date(new Date(nowISO).setUTCHours(0, 0, 0, 0)).toISOString(),
    )
    .lt(
      'started_at',
      new Date(new Date(nowISO).setUTCHours(24, 0, 0, 0)).toISOString(),
    )
    .maybeSingle();

  if (dailyError) {
    console.error('[PTC_CLAIM] Daily check error:', dailyError.message);
    return { success: false, error: 'Claim check failed.', status: 500 };
  }

  if (dailyCheck) {
    return {
      success: false,
      error: 'You already viewed this ad today.',
      code: 'already_viewed_today',
      status: 400,
    };
  }

  const token = `${adId}:${address}:${Date.now()}`;
  const reward = Number(adRow.reward ?? 0);
  const startedAt = new Date(Date.now() - minDuration * 1000).toISOString();

  const { error: insertError } = await supabase.from('ptc_views').insert({
    ad_id: adId,
    faucetpay_address: address,
    token,
    status: 'completed',
    reward,
    started_at: startedAt,
    completed_at: nowISO,
  });

  if (insertError) {
    const code = insertError.code;
    if (code === '23505') {
      return {
        success: false,
        error: 'You already viewed this ad today.',
        code: 'already_viewed_today',
        status: 400,
      };
    }
    console.error('[PTC_CLAIM] Insert view failed:', insertError.message, code);
    return { success: false, error: 'Failed to record claim.', status: 500 };
  }

  const { error: adCountError } = await supabase
    .from('ptc_ads')
    .update({ total_views: adRow.total_views + 1 })
    .eq('id', adId);

  if (adCountError) {
    console.error('[PTC_CLAIM] Ad count update failed:', adCountError.message);
  }

  return { success: true, reward };
}
