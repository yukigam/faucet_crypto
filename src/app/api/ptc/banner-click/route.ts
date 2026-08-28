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

    const { data: rateData, error: rateError } = await supabase.rpc('check_ip_rate_limit', {
      p_ip: ip,
      p_now: new Date().toISOString(),
      p_max_attempts: 30,
      p_window_seconds: 60,
    });

    const rateResult = rateData as { allowed: boolean; retry_after?: number } | undefined;

    if (rateError || !rateResult?.allowed) {
      return NextResponse.json({
        success: false,
        error: 'Too many requests. Please slow down.',
        retry_after: rateResult?.retry_after || 60,
      }, { status: 429 });
    }

    const { data, error } = await supabase.rpc('ptc_banner_click', {
      p_token: token,
      p_now: new Date().toISOString(),
    });

    if (error) {
      console.error('[PTC_BANNER_CLICK] RPC error:', error.message);
      return NextResponse.json({ error: 'Failed to register banner click' }, { status: 500 });
    }

    const result = data as {
      success: boolean;
      watch_started_at?: string;
      error?: string;
    };

    if (!result.success) {
      const messages: Record<string, string> = {
        invalid_token: 'Invalid ad view session.',
        already_claimed: 'Reward already credited for this session.',
        session_expired: 'View session expired — start the ad again.',
      };
      return NextResponse.json({
        success: false,
        error: messages[result.error ?? ''] || 'Failed to register banner click',
        code: result.error,
      }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      watch_started_at: result.watch_started_at,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[PTC_BANNER_CLICK] Unhandled error:', err);
    return NextResponse.json({ error: message, success: false }, { status: 500 });
  }
}
