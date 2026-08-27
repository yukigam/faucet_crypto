import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

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
    const { address, adId } = await request.json();

    if (!address || typeof address !== 'string' || address.length > 200) {
      return NextResponse.json({ error: 'Address is required' }, { status: 400 });
    }
    if (!adId || typeof adId !== 'string') {
      return NextResponse.json({ error: 'Ad ID is required' }, { status: 400 });
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
      p_max_attempts: 15,
      p_window_seconds: 60,
    });

    const rateResult = rateData as { allowed: boolean; attempts: number; retry_after?: number } | undefined;

    if (rateError || !rateResult?.allowed) {
      console.warn('[PTC_START] IP rate limit exceeded', { ip });
      return NextResponse.json({
        success: false,
        error: 'Too many requests. Please slow down.',
        retry_after: rateResult?.retry_after || 60,
      }, { status: 429 });
    }

    // --- Issue single-use view session token ---
    const { data, error } = await supabase.rpc('ptc_start', {
      p_address: address,
      p_ad_id: adId,
      p_now: new Date().toISOString(),
    });

    if (error) {
      console.error('[PTC_START] RPC error:', error.message);
      return NextResponse.json({ error: 'Failed to start ad view' }, { status: 500 });
    }

    const result = data as {
      success: boolean;
      token?: string;
      title?: string;
      target_url?: string;
      duration_seconds?: number;
      reward?: number;
      error?: string;
    };

    if (!result.success) {
      const messages: Record<string, string> = {
        ad_unavailable: 'This ad is no longer available.',
        ad_exhausted: 'This ad has reached its view budget.',
        already_viewed_today: 'You already viewed this ad today.',
      };
      return NextResponse.json({
        success: false,
        error: messages[result.error ?? ''] || 'Failed to start ad view',
        code: result.error,
      }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      token: result.token,
      reward: result.reward,
      duration_seconds: result.duration_seconds,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[PTC_START] Unhandled error:', err);
    return NextResponse.json({ error: message, success: false }, { status: 500 });
  }
}
